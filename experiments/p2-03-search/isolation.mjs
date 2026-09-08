import process from "node:process";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

function docker(args) {
  try {
    return execFileSync("docker", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120_000,
    }).trim();
  } catch {
    throw new Error("ISOLATED_DOCKER_OPERATION_FAILED");
  }
}
const ownedNames = new Set();
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    for (const name of ownedNames) {
      try {
        stopEngine({ name });
      } catch {
        /* report no private diagnostics */
      }
    }
    process.exit(signal === "SIGINT" ? 130 : 143);
  });
}
export async function startEngine(kind, { withBigm = false } = {}) {
  const name = `p203-evaluation-${kind}-${randomBytes(4).toString("hex")}`;
  if (withBigm && kind !== "postgres") throw new Error("INVALID_BIGM_ENGINE");
  const image = withBigm
    ? "p203-pg-bigm-evaluation"
    : kind === "postgres"
      ? "postgres:18.4"
      : "getmeili/meilisearch:v1.53.2";
  const internalPort = kind === "postgres" ? 5432 : 7700;
  // Created for this disposable instance only; never serialized in evidence.
  const ephemeralKey = randomBytes(32).toString("hex");
  const args = [
    "run",
    "-d",
    "--name",
    name,
    "--label",
    "purpose=p203-evaluation",
    "--cpus",
    "2",
    "--memory",
    "2g",
    "--memory-swap",
    "2g",
    "-p",
    ["127.0.0.1", "", internalPort].join(":"),
  ];
  if (kind === "postgres")
    args.push(
      "-e",
      "POSTGRES_HOST_AUTH_METHOD=trust",
      "-e",
      "POSTGRES_DB=p203",
      "--shm-size",
      "256m",
    );
  else
    args.push(
      "-e",
      `MEILI_MASTER_KEY=${ephemeralKey}`,
      "-e",
      "MEILI_ENV=production",
      "-e",
      "MEILI_NO_ANALYTICS=true",
      "-e",
      "MEILI_MAX_INDEXING_MEMORY=1GiB",
      "-e",
      "MEILI_MAX_INDEXING_THREADS=2",
    );
  docker([
    ...args,
    image,
    ...(withBigm ? ["postgres", "-c", "shared_preload_libraries=pg_bigm"] : []),
  ]);
  ownedNames.add(name);
  try {
    const inspected = JSON.parse(docker(["inspect", name]))[0];
    const port = Number(
      inspected.NetworkSettings.Ports[`${internalPort}/tcp`][0].HostPort,
    );
    const imageInfo = JSON.parse(docker(["image", "inspect", image]))[0];
    const provenance = {
      kind,
      image,
      imageId: imageInfo.Id,
      repoDigests: imageInfo.RepoDigests,
      architecture: imageInfo.Architecture,
      operatingSystem: imageInfo.Os,
      cpuLimit: inspected.HostConfig.NanoCpus / 1e9,
      memoryLimitBytes: inspected.HostConfig.Memory,
    };
    for (let attempt = 0; attempt < 100; attempt++) {
      let ready = false;
      try {
        if (kind === "postgres")
          ready = docker([
            "exec",
            name,
            "pg_isready",
            "-h",
            "127.0.0.1",
            "-U",
            "postgres",
            "-d",
            "p203",
          ]).includes("accepting connections");
        else
          ready = (
            await globalThis.fetch(`http://127.0.0.1:${port}/health`, {
              signal: globalThis.AbortSignal.timeout(500),
            })
          ).ok;
      } catch {
        /* A bounded readiness probe never exports network diagnostics. */
      }
      if (ready) return { name, port, ephemeralKey, provenance };
      await delay(200);
    }
    stopEngine({ name });
    throw new Error("ISOLATED_ENGINE_NOT_READY");
  } catch (error) {
    if (ownedNames.has(name)) {
      try {
        stopEngine({ name });
      } catch {
        throw new Error("ISOLATED_ENGINE_CLEANUP_FAILED");
      }
    }
    throw error;
  }
}
export function resourceSnapshot(instance) {
  try {
    const output = docker([
      "exec",
      instance.name,
      "sh",
      "-c",
      "cat /sys/fs/cgroup/cpu.stat /sys/fs/cgroup/memory.stat; cat /sys/fs/cgroup/memory.current /sys/fs/cgroup/memory.peak",
    ]);
    const lines = output.split("\n");
    const fields = Object.fromEntries(
      lines
        .filter((line) => /^[a-z_]+ \d+$/.test(line))
        .map((line) => line.split(" ")),
    );
    const trailing = lines.filter((line) => /^\d+$/.test(line)).map(Number);
    return {
      cpuSeconds: Number(fields.usage_usec) / 1e6,
      anonymousMemoryBytes: Number(fields.anon),
      fileCacheBytes: Number(fields.file),
      cgroupCurrentBytes: trailing[0],
      cgroupPeakBytes: trailing[1],
    };
  } catch {
    return { unavailable: true };
  }
}
export function stopEngine(instance) {
  if (!/^p203-evaluation-(postgres|meili)-[a-f0-9]{8}$/.test(instance.name))
    throw new Error("INVALID_CLEANUP_TARGET");
  docker(["rm", "-f", "-v", instance.name]);
  ownedNames.delete(instance.name);
}
