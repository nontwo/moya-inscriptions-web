import { spawn as nodeSpawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readdir,
  rm,
  utimes,
} from "node:fs/promises";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import { assertPrivateMediaDirectory } from "../../storage/publishing-media-store.js";
import { ffmpegEditFilters } from "./edits.js";
import {
  MEDIA_TOOL_CONTAINER_TIMEOUT_GRACE_MS,
  MEDIA_TOOL_MAX_OUTPUT_FILE_BYTES,
  MEDIA_TOOL_OUTPUT_LIMITS,
  MEDIA_TOOL_SANDBOX,
  MEDIA_TOOL_TIMEOUTS_MS,
  MOTION_COLOR,
  MOTION_DERIVATIVE,
} from "./profiles.js";

import type { FileHandle } from "node:fs/promises";
import type { Readable } from "node:stream";
import type { MediaEdit } from "./edits.js";

export type MediaTool = "heif-dec" | "ffprobe" | "ffmpeg";

export type MediaToolFailure =
  | "spawn_failed"
  | "sandbox_unavailable"
  | "timeout"
  | "output_limit"
  | "aborted"
  | "tool_failed";

/** Tool invocation failure; carries no tool output, paths or input bytes. */
export class MediaToolError extends Error {
  constructor(
    readonly code: MediaToolFailure,
    readonly exitCode: number | null = null,
  ) {
    super(`Publishing media tool failure: ${code}`);
    this.name = "MediaToolError";
  }
}

/** The subset of a spawned child process the runner relies on. */
export interface MediaToolProcess {
  readonly stdout: Readable | null;
  readonly stderr: Readable | null;
  kill(signal?: NodeJS.Signals): boolean;
  on(event: string, listener: (...args: never[]) => void): unknown;
}

export interface MediaToolSpawnOptions {
  readonly stdio: ["ignore", "pipe", "pipe"];
  readonly shell: false;
  readonly windowsHide: true;
  readonly env: Readonly<Record<string, string>>;
}

export type MediaToolSpawn = (
  command: "docker",
  args: string[],
  options: MediaToolSpawnOptions,
) => MediaToolProcess;

export interface MediaToolJob {
  readonly id: string;
  /**
   * Host directory bind-mounted read-only at `/job/in`. Only the host writes
   * here: component copies and accepted tool outputs.
   */
  readonly inputDirectory: string;
  inputPath(name: string): string;
  dispose(): Promise<void>;
}

export interface MediaToolRunOptions {
  readonly timeoutMs: number;
  readonly maxStdoutBytes?: number;
  readonly maxStderrBytes?: number;
  readonly signal?: AbortSignal;
  /**
   * Mounts a fresh, empty writable directory at `/job/out` for this run
   * only. Runs without it get no writable mount at all.
   */
  readonly writesOutput?: boolean;
}

export interface MediaToolRunResult {
  readonly stdout: Buffer;
  /** Host path of this run's own output directory, or null. */
  readonly outputDirectory: string | null;
}

export interface MediaToolsRunner {
  createJob(): Promise<MediaToolJob>;
  run(
    job: MediaToolJob,
    tool: MediaTool,
    args: readonly string[],
    options: MediaToolRunOptions,
  ): Promise<MediaToolRunResult>;
  /**
   * Removes job directories (crash leftovers) not touched since `olderThan`
   * and not active in this process. Every run touches its job directory; the
   * cutoff must still be older than the worker lease.
   */
  sweepJobs(olderThan: Date): Promise<{ removed: number }>;
}

export interface MediaToolsRunnerOptions {
  /** Local image tag, e.g. `yoyi-work-publishing-media-tools:v1`; never pulled. */
  readonly image: string;
  /** Private work directory (same rules as the media store directory). */
  readonly workDirectory: string;
  readonly spawn?: MediaToolSpawn;
  readonly environment?: Readonly<Record<string, string | undefined>>;
  /**
   * Grace before the Docker CLI is SIGKILLed after a container kill; also the
   * delay before the container removal is repeated.
   */
  readonly killGraceMs?: number;
  /** Test seam forwarded to {@link assertPrivateMediaDirectory}. */
  readonly temporaryRoots?: readonly string[];
}

const TOOLS = new Set<string>(["heif-dec", "ffprobe", "ffmpeg"]);
const IMAGE_PATTERN =
  /^[a-z0-9][a-z0-9._/-]{0,127}(?::[A-Za-z0-9._-]{1,128})?(?:@sha256:[0-9a-f]{64})?$/;
const FILE_NAME_PATTERN = /^[a-z][a-z0-9-]{0,31}(?:\.[a-z0-9]{1,8})?$/;
const JOB_NAME_PATTERN = /^job-[0-9a-f]{32}$/;
const MOUNT_UNSAFE = /[,"\n\r\0]/;
const DOCKER_ENVIRONMENT_KEYS = [
  "PATH",
  "HOME",
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_CONFIG",
  "DOCKER_CERT_PATH",
  "DOCKER_TLS_VERIFY",
  "XDG_RUNTIME_DIR",
];
const CONTROL_TIMEOUT_MS = 15_000;
const MAX_ARGUMENTS = 128;
const MAX_ARGUMENT_CHARS = 4096;

export const CONTAINER_INPUT_DIRECTORY = "/job/in";
export const CONTAINER_OUTPUT_DIRECTORY = "/job/out";
/** Coreutils `timeout` in the image; the tool runs as its child. */
export const CONTAINER_TIMEOUT_ENTRYPOINT = "/usr/bin/timeout";

/** Whole seconds the in-container `timeout` allows for a host limit. */
export const containerTimeoutSeconds = (timeoutMs: number): number =>
  Math.ceil((timeoutMs + MEDIA_TOOL_CONTAINER_TIMEOUT_GRACE_MS) / 1000);

/** Exact `docker run` argument array for one sandboxed tool invocation. */
export function buildDockerRunArguments(input: {
  readonly image: string;
  readonly containerName: string;
  readonly inputDirectory: string;
  /** This run's fresh writable directory, or null for no writable mount. */
  readonly outputDirectory: string | null;
  readonly tool: MediaTool;
  readonly args: readonly string[];
  readonly timeoutMs: number;
}): string[] {
  return [
    "run",
    "--rm",
    "--pull",
    "never",
    "--name",
    input.containerName,
    "--network",
    "none",
    "--read-only",
    "--tmpfs",
    MEDIA_TOOL_SANDBOX.tmpfs,
    "--memory",
    MEDIA_TOOL_SANDBOX.memory,
    "--cpus",
    MEDIA_TOOL_SANDBOX.cpus,
    "--pids-limit",
    MEDIA_TOOL_SANDBOX.pidsLimit,
    "--security-opt",
    "no-new-privileges",
    "--cap-drop",
    "ALL",
    "--user",
    MEDIA_TOOL_SANDBOX.user,
    "--mount",
    `type=bind,source=${input.inputDirectory},target=${CONTAINER_INPUT_DIRECTORY},readonly`,
    ...(input.outputDirectory === null
      ? []
      : [
          "--mount",
          `type=bind,source=${input.outputDirectory},target=${CONTAINER_OUTPUT_DIRECTORY}`,
        ]),
    "--workdir",
    "/tmp",
    "--entrypoint",
    CONTAINER_TIMEOUT_ENTRYPOINT,
    input.image,
    "--signal=KILL",
    `${containerTimeoutSeconds(input.timeoutMs)}s`,
    input.tool,
    ...input.args,
  ];
}

const assertFileName = (name: string) => {
  if (typeof name !== "string" || !FILE_NAME_PATTERN.test(name)) {
    throw new Error("Invalid media tool job file name");
  }
};

const filteredEnvironment = (
  source: Readonly<Record<string, string | undefined>>,
): Record<string, string> => {
  const environment: Record<string, string> = {};
  for (const key of DOCKER_ENVIRONMENT_KEYS) {
    const value = source[key];
    if (value !== undefined) environment[key] = value;
  }
  return environment;
};

/**
 * Creates the Docker-sandboxed media tools runner. Each job gets
 * `<work>/job-<32hex>/` (0700) holding `in/` (0755, mounted read-only, written
 * only by the host). A run that writes output gets its own fresh
 * `out-<16hex>/` (0777 so the container's uid 10001 can create files;
 * unreachable to other host users because the job directory is 0700). No
 * writable directory is ever mounted into a later container.
 */
export async function createMediaToolsRunner(
  options: MediaToolsRunnerOptions,
): Promise<MediaToolsRunner> {
  if (!IMAGE_PATTERN.test(options.image)) {
    throw new Error("Invalid media tools image reference");
  }
  const workDirectory = await assertPrivateMediaDirectory(
    options.workDirectory,
    options.temporaryRoots ? { temporaryRoots: options.temporaryRoots } : {},
  );
  if (MOUNT_UNSAFE.test(workDirectory)) {
    throw new Error("Media tools work directory cannot be bind-mounted safely");
  }
  const spawn: MediaToolSpawn =
    options.spawn ??
    ((command, args, spawnOptions) =>
      nodeSpawn(command, args, {
        ...spawnOptions,
        env: { ...spawnOptions.env } as NodeJS.ProcessEnv,
      }) as MediaToolProcess);
  const environment = filteredEnvironment(options.environment ?? process.env);
  const killGraceMs = options.killGraceMs ?? 5_000;
  /** Job id → job root, for jobs created here and not yet disposed. */
  const activeJobs = new Map<string, string>();

  const control = (args: string[]) =>
    new Promise<void>((resolve) => {
      let child: MediaToolProcess;
      try {
        child = spawn("docker", args, {
          stdio: ["ignore", "pipe", "pipe"],
          shell: false,
          windowsHide: true,
          env: environment,
        });
      } catch {
        resolve();
        return;
      }
      child.stdout?.resume();
      child.stderr?.resume();
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, CONTROL_TIMEOUT_MS);
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      child.on("error", done);
      child.on("close", done);
    });

  const spawnRun = (
    dockerArgs: string[],
    containerName: string,
    runOptions: MediaToolRunOptions,
  ) =>
    new Promise<Buffer>((resolve, reject) => {
      const maxStdoutBytes =
        runOptions.maxStdoutBytes ??
        MEDIA_TOOL_OUTPUT_LIMITS.defaultStdoutBytes;
      const maxStderrBytes =
        runOptions.maxStderrBytes ?? MEDIA_TOOL_OUTPUT_LIMITS.stderrBytes;
      let child: MediaToolProcess;
      try {
        child = spawn("docker", dockerArgs, {
          stdio: ["ignore", "pipe", "pipe"],
          shell: false,
          windowsHide: true,
          env: environment,
        });
      } catch {
        reject(new MediaToolError("spawn_failed"));
        return;
      }
      const stdout: Buffer[] = [];
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let failure: MediaToolFailure | null = null;
      let settled = false;
      let graceTimer: NodeJS.Timeout | undefined;
      const stop = (code: MediaToolFailure) => {
        if (failure !== null || settled) return;
        failure = code;
        void control(["kill", containerName]);
        graceTimer = setTimeout(() => child.kill("SIGKILL"), killGraceMs);
      };
      const timer = setTimeout(() => stop("timeout"), runOptions.timeoutMs);
      const onAbort = () => stop("aborted");
      runOptions.signal?.addEventListener("abort", onAbort, { once: true });
      const finish = (error: Error | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearTimeout(graceTimer);
        runOptions.signal?.removeEventListener("abort", onAbort);
        if (failure !== null) {
          // A kill can race container creation: remove again after the grace.
          void control(["rm", "--force", containerName]);
          setTimeout(
            () => void control(["rm", "--force", containerName]),
            killGraceMs,
          ).unref();
        }
        if (error) reject(error);
        else resolve(Buffer.concat(stdout));
      };
      child.stdout?.on("data", (chunk: Buffer) => {
        stdoutBytes += chunk.byteLength;
        if (stdoutBytes > maxStdoutBytes) stop("output_limit");
        else if (failure === null) stdout.push(chunk);
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        // Diagnostics are counted, never retained or logged.
        stderrBytes += chunk.byteLength;
        if (stderrBytes > maxStderrBytes) stop("output_limit");
      });
      child.on("error", () => {
        finish(new MediaToolError(failure ?? "spawn_failed"));
      });
      child.on("close", (code: number | null) => {
        if (failure !== null) finish(new MediaToolError(failure, code));
        else if (code === 0) finish(null);
        else if (code === 125 || code === 126 || code === 127) {
          finish(new MediaToolError("sandbox_unavailable", code));
        } else finish(new MediaToolError("tool_failed", code));
      });
    });

  return {
    async createJob() {
      const id = randomBytes(16).toString("hex");
      const root = path.join(workDirectory, `job-${id}`);
      const inputDirectory = path.join(root, "in");
      await mkdir(root, { mode: 0o700 });
      activeJobs.set(id, root);
      try {
        await chmod(root, 0o700);
        await mkdir(inputDirectory, { mode: 0o755 });
        await chmod(inputDirectory, 0o755);
      } catch (error) {
        activeJobs.delete(id);
        await rm(root, { recursive: true, force: true });
        throw error;
      }
      return {
        id,
        inputDirectory,
        inputPath: (name) => {
          assertFileName(name);
          return path.join(inputDirectory, name);
        },
        dispose: async () => {
          await rm(root, { recursive: true, force: true });
          activeJobs.delete(id);
        },
      };
    },

    async run(job, tool, args, runOptions) {
      const root = activeJobs.get(job.id);
      if (
        root === undefined ||
        job.inputDirectory !== path.join(root, "in") ||
        !TOOLS.has(tool) ||
        !Array.isArray(args) ||
        args.length > MAX_ARGUMENTS ||
        args.some(
          (arg) =>
            typeof arg !== "string" ||
            arg.length > MAX_ARGUMENT_CHARS ||
            arg.includes("\0"),
        ) ||
        !Number.isSafeInteger(runOptions.timeoutMs) ||
        runOptions.timeoutMs < 1
      ) {
        throw new Error("Invalid media tool invocation");
      }
      if (runOptions.signal?.aborted) throw new MediaToolError("aborted");
      const now = new Date();
      await utimes(root, now, now);
      let outputDirectory: string | null = null;
      if (runOptions.writesOutput) {
        outputDirectory = path.join(
          root,
          `out-${randomBytes(8).toString("hex")}`,
        );
        await mkdir(outputDirectory, { mode: 0o777 });
        await chmod(outputDirectory, 0o777);
      }
      const containerName = `yoyi-wp-media-${randomBytes(12).toString("hex")}`;
      const stdout = await spawnRun(
        buildDockerRunArguments({
          image: options.image,
          containerName,
          inputDirectory: job.inputDirectory,
          outputDirectory,
          tool,
          args,
          timeoutMs: runOptions.timeoutMs,
        }),
        containerName,
        runOptions,
      );
      return { stdout, outputDirectory };
    },

    async sweepJobs(olderThan) {
      const cutoff = olderThan.getTime();
      if (!Number.isFinite(cutoff)) throw new Error("Invalid sweep cutoff");
      const active = new Set(activeJobs.keys());
      let removed = 0;
      for (const name of await readdir(workDirectory)) {
        if (!JOB_NAME_PATTERN.test(name) || active.has(name.slice(4))) continue;
        const entry = path.join(workDirectory, name);
        const info = await lstat(entry).catch(() => null);
        if (!info?.isDirectory() || info.mtimeMs >= cutoff) continue;
        await rm(entry, { recursive: true, force: true });
        removed += 1;
      }
      return { removed };
    },
  };
}

/**
 * Accepts `name` from a finished run's output directory by copying it into
 * the host-only input directory as `inputName`: the source must be a regular
 * file (opened without following links or blocking on FIFOs) within the size
 * ceiling. Later tools and decoders only ever read the copy, which no
 * container can modify.
 */
export async function acceptToolOutput(
  job: MediaToolJob,
  outputDirectory: string,
  name: string,
  inputName: string,
): Promise<{ path: string; byteSize: number }> {
  assertFileName(name);
  const target = job.inputPath(inputName);
  let source: FileHandle;
  try {
    source = await open(
      path.join(outputDirectory, name),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
  } catch {
    throw new MediaToolError("tool_failed");
  }
  try {
    const info = await source.stat();
    if (
      !info.isFile() ||
      info.size < 1 ||
      info.size > MEDIA_TOOL_MAX_OUTPUT_FILE_BYTES
    ) {
      throw new MediaToolError("tool_failed");
    }
    const byteSize = info.size;
    let copied = 0;
    const destination = await open(target, "wx", 0o644);
    try {
      // Both streams close their handles when done (a stream keeps its
      // FileHandle referenced, so closing the handle first would wait).
      await pipeline(
        source.createReadStream({ start: 0, end: byteSize - 1 }),
        new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            copied += chunk.byteLength;
            callback(null, chunk);
          },
        }),
        destination.createWriteStream(),
      );
    } finally {
      await destination.close().catch(() => undefined);
    }
    if (copied !== byteSize) throw new MediaToolError("tool_failed");
    await chmod(target, 0o644);
    return { path: target, byteSize };
  } finally {
    await source.close().catch(() => undefined);
  }
}

/** Runs a writing tool and accepts exactly one output file into the job. */
async function runForSingleOutput(
  runner: MediaToolsRunner,
  job: MediaToolJob,
  tool: MediaTool,
  args: readonly string[],
  options: MediaToolRunOptions,
  outputName: string,
): Promise<{ path: string; byteSize: number }> {
  const { outputDirectory } = await runner.run(job, tool, args, {
    ...options,
    writesOutput: true,
  });
  if (outputDirectory === null) throw new MediaToolError("tool_failed");
  try {
    const produced = await readdir(outputDirectory);
    if (produced.length !== 1 || produced[0] !== outputName) {
      throw new MediaToolError("tool_failed");
    }
    return await acceptToolOutput(job, outputDirectory, outputName, outputName);
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
}

/**
 * Decodes the primary image of a HEIC/HEIF job input to PNG with libheif
 * (`irot`/`imir`/`clap` applied) and accepts it as `<inputName>.png` in the
 * job input. Auxiliary or multi-image outputs are refused.
 */
export async function heifDecodeToPng(
  runner: MediaToolsRunner,
  job: MediaToolJob,
  inputName: string,
  signal?: AbortSignal,
): Promise<{ path: string; byteSize: number }> {
  const outputName = `${inputName}.png`;
  job.inputPath(inputName);
  job.inputPath(outputName);
  return runForSingleOutput(
    runner,
    job,
    "heif-dec",
    [
      "--quiet",
      `${CONTAINER_INPUT_DIRECTORY}/${inputName}`,
      `${CONTAINER_OUTPUT_DIRECTORY}/${outputName}`,
    ],
    {
      timeoutMs: MEDIA_TOOL_TIMEOUTS_MS.heifDecode,
      ...(signal ? { signal } : {}),
    },
    outputName,
  );
}

/**
 * `ffprobe -v error -show_streams -show_format -of json` (mov demuxer pinned)
 * on a job input; the container gets no writable mount.
 */
export async function ffprobeJson(
  runner: MediaToolsRunner,
  job: MediaToolJob,
  inputName: string,
  signal?: AbortSignal,
): Promise<unknown> {
  job.inputPath(inputName);
  const { stdout } = await runner.run(
    job,
    "ffprobe",
    [
      "-v",
      "error",
      "-f",
      "mov",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      `${CONTAINER_INPUT_DIRECTORY}/${inputName}`,
    ],
    {
      timeoutMs: MEDIA_TOOL_TIMEOUTS_MS.ffprobe,
      maxStdoutBytes: MEDIA_TOOL_OUTPUT_LIMITS.ffprobeStdoutBytes,
      ...(signal ? { signal } : {}),
    },
  );
  try {
    return JSON.parse(stdout.toString("utf8")) as unknown;
  } catch {
    throw new MediaToolError("tool_failed");
  }
}

/**
 * Colour facts of a validated motion source. Values are ffprobe names from
 * the {@link MOTION_COLOR} allowlists, with `unknown` resolved to BT.709.
 */
export interface MotionColor {
  readonly primaries: (typeof MOTION_COLOR.primaries)[number];
  readonly transfer:
    | (typeof MOTION_COLOR.sdrTransfers)[number]
    | (typeof MOTION_COLOR.hdrTransfers)[number];
  readonly matrix: (typeof MOTION_COLOR.matrices)[number];
  readonly range: (typeof MOTION_COLOR.ranges)[number];
  readonly dynamicRange: "sdr" | "hlg" | "pq";
  readonly pixelFormat: string;
}

/** The source facts the motion derivative arguments depend on. */
export interface MotionSource {
  /** Upright display size after the recorded rotation. */
  readonly width: number;
  readonly height: number;
  readonly color: MotionColor;
}

/**
 * Colour filters around the geometry: `setparams` pins the validated source
 * tags first; the tail converts to 8-bit BT.709 limited range (zscale), with
 * tone mapping for HLG/PQ.
 */
export function ffmpegColorFilters(color: MotionColor): {
  readonly head: string[];
  readonly tail: string[];
} {
  const head = [
    `setparams=color_primaries=${color.primaries}:color_trc=${color.transfer}:colorspace=${color.matrix}:range=${color.range}`,
  ];
  if (color.dynamicRange !== "sdr") {
    return {
      head,
      tail: [
        `zscale=transfer=linear:npl=${MOTION_COLOR.nominalPeakNits}`,
        "format=gbrpf32le",
        "zscale=primaries=709",
        `tonemap=tonemap=${MOTION_COLOR.toneMapOperator}:desat=0`,
        "zscale=transfer=709:matrix=709:range=tv",
        `format=${MOTION_DERIVATIVE.pixelFormat}`,
      ],
    };
  }
  const alreadyOutput =
    color.primaries === "bt709" &&
    color.transfer === "bt709" &&
    color.matrix === "bt709" &&
    color.range === "tv" &&
    color.pixelFormat === MOTION_DERIVATIVE.pixelFormat;
  return {
    head,
    tail: alreadyOutput
      ? [`format=${MOTION_DERIVATIVE.pixelFormat}`]
      : [
          "zscale=primaries=709:transfer=709:matrix=709:range=tv",
          `format=${MOTION_DERIVATIVE.pixelFormat}`,
        ],
  };
}

/** FFmpeg arguments for the motion derivative (autorotate stays enabled). */
export function ffmpegMotionArguments(
  inputName: string,
  outputName: string,
  edit: MediaEdit,
  source: MotionSource,
): string[] {
  const color = ffmpegColorFilters(source.color);
  return [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-n",
    "-f",
    "mov",
    "-i",
    `${CONTAINER_INPUT_DIRECTORY}/${inputName}`,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-map_metadata",
    "-1",
    "-map_chapters",
    "-1",
    "-dn",
    "-sn",
    "-vf",
    [
      ...color.head,
      ...ffmpegEditFilters(edit, source, MOTION_DERIVATIVE.maxLongEdge),
      ...color.tail,
    ].join(","),
    "-c:v",
    MOTION_DERIVATIVE.videoCodec,
    "-profile:v",
    MOTION_DERIVATIVE.videoProfile,
    "-preset",
    MOTION_DERIVATIVE.preset,
    "-crf",
    String(MOTION_DERIVATIVE.crf),
    "-pix_fmt",
    MOTION_DERIVATIVE.pixelFormat,
    "-color_primaries",
    MOTION_COLOR.outputPrimaries,
    "-color_trc",
    MOTION_COLOR.outputTransfer,
    "-colorspace",
    MOTION_COLOR.outputMatrix,
    "-color_range",
    MOTION_COLOR.outputRange,
    "-c:a",
    MOTION_DERIVATIVE.audioCodec,
    "-b:a",
    MOTION_DERIVATIVE.audioBitrate,
    "-movflags",
    "+faststart",
    "-f",
    "mp4",
    `${CONTAINER_OUTPUT_DIRECTORY}/${outputName}`,
  ];
}

/**
 * Transcodes a job input motion component into the MP4 derivative and
 * accepts it into the job input as `outputName`.
 */
export async function ffmpegMotionDerivative(
  runner: MediaToolsRunner,
  job: MediaToolJob,
  inputName: string,
  outputName: string,
  edit: MediaEdit,
  source: MotionSource,
  signal?: AbortSignal,
): Promise<{ path: string; byteSize: number }> {
  job.inputPath(inputName);
  job.inputPath(outputName);
  return runForSingleOutput(
    runner,
    job,
    "ffmpeg",
    ffmpegMotionArguments(inputName, outputName, edit, source),
    {
      timeoutMs: MEDIA_TOOL_TIMEOUTS_MS.ffmpegMotion,
      ...(signal ? { signal } : {}),
    },
    outputName,
  );
}
