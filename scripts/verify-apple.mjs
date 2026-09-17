import { spawn } from "node:child_process";
import process from "node:process";
import { Buffer } from "node:buffer";
import console from "node:console";
import { setTimeout, clearTimeout } from "node:timers";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  writeSync,
  openSync,
  closeSync,
  renameSync,
  readSync,
  fstatSync,
} from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { freshOutput } from "./verify-task.mjs";
import { runGit } from "./ci-task-scope.mjs";

export function appleCommand(output, destination, buildOnly = false) {
  return [
    "xcodebuild",
    "-project",
    "apps/apple/ArtVenn/ArtVenn.xcodeproj",
    "-scheme",
    "ArtVenn",
    "-configuration",
    "Debug",
    "-sdk",
    "iphonesimulator",
    "-destination",
    destination,
    ...(buildOnly
      ? []
      : [
          "-parallel-testing-enabled",
          "NO",
          "-maximum-concurrent-test-simulator-destinations",
          "1",
        ]),
    "-derivedDataPath",
    join(output, "DerivedData"),
    "-resultBundlePath",
    join(output, "Result.xcresult"),
    "CODE_SIGNING_ALLOWED=NO",
    buildOnly ? "build" : "test",
  ];
}

// Explicit Owner-authorized local milestone only. Callers must pass their
// remaining cumulative allowance; no environment variable changes the default.
export function appleOptions(args) {
  const options = {
    buildOnly: false,
    budgetMs: 120000,
    validationKind: "DAILY",
  };
  const seen = new Set();
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i];
    if (seen.has(flag)) throw new Error("INVALID_APPLE_ARGUMENTS");
    seen.add(flag);
    if (flag === "--build-only") options.buildOnly = true;
    else if (flag === "--output" || flag === "--milestone-budget-ms") {
      const value = args[++i];
      if (!value || value.startsWith("--"))
        throw new Error("INVALID_APPLE_ARGUMENTS");
      if (flag === "--output") options.output = value;
      else {
        const budgetMs = Number(value);
        if (
          !/^[1-9]\d*$/u.test(value) ||
          !Number.isSafeInteger(budgetMs) ||
          budgetMs > 300000
        )
          throw new Error("INVALID_MILESTONE_BUDGET");
        options.budgetMs = budgetMs;
        options.validationKind = "AUTHORIZED_LOCAL_MILESTONE";
      }
    } else throw new Error("INVALID_APPLE_ARGUMENTS");
  }
  if (!options.output) throw new Error("EXPECTED_OUTPUT_ARGUMENT");
  return options;
}

export function remainingAppleBudget(
  deadline,
  reserveMs = 0,
  now = performance.now(),
) {
  const remaining = Math.floor(deadline - now - reserveMs);
  if (remaining <= 0) throw new Error("TIME_BUDGET_EXCEEDED");
  return remaining;
}

export function assertCompatibleSdk(pbx, sdk) {
  const targets = [
    ...pbx.matchAll(/IPHONEOS_DEPLOYMENT_TARGET\s*=\s*([\d.]+)\s*;/gu),
  ].map((match) => match[1]);
  if (targets.length === 0 || !/^\d+\.\d+(?:\.\d+)?$/u.test(sdk))
    throw new Error(
      "Cannot verify iOS deployment target / installed simulator SDK",
    );
  const version = (s) =>
    s.split(".").reduce((n, part, i) => n + Number(part) * 1000 ** (2 - i), 0);
  if (targets.some((target) => version(target) > version(sdk)))
    throw new Error(
      "Installed simulator SDK is older than the project's iOS deployment target",
    );
}

export function compatibleIphone(runtime, devicetypes) {
  const supported = new Set(
    (runtime.supportedDeviceTypes ?? []).map((item) => item.identifier),
  );
  const type = devicetypes.find(
    (item) =>
      item.productFamily === "iPhone" &&
      item.name?.startsWith("iPhone ") &&
      supported.has(item.identifier),
  );
  if (!type) throw new Error("COMPATIBLE_IPHONE_DEVICE_TYPE_UNAVAILABLE");
  return type;
}

// Publish only structural facts and a finite diagnostic vocabulary. Child output
// remains private: arbitrary error messages, paths and URLs never enter artifacts.
export function appleToolEvidence({
  error,
  stderr = "",
  timedOut = false,
  interrupted = false,
  allowanceMs,
  durationMs,
}) {
  const outcome = timedOut
    ? "timeout"
    : interrupted
      ? "interrupted"
      : error
        ? "failure"
        : "success";
  const categories = new Set([
    "ENOENT",
    "EACCES",
    "EPERM",
    "ERR_CHILD_PROCESS_STDIO_MAXBUFFER",
  ]);
  const errorCategory = timedOut
    ? "DEADLINE_EXPIRED"
    : interrupted
      ? "INTERRUPTED"
      : !error
        ? null
        : categories.has(error.code)
          ? error.code
          : "COMMAND_FAILED";
  const domain =
    /domain=(com\.apple\.CoreSimulator\.SimError|NSPOSIXErrorDomain|NSCocoaErrorDomain), code=(-?\d{1,6})/u.exec(
      stderr,
    );
  return {
    attempted: true,
    outcome,
    allowanceMs,
    durationMs,
    errorDomain: domain?.[1] ?? null,
    errorDomainCode: domain ? Number(domain[2]) : null,
    exitCode: error ? (Number.isInteger(error.code) ? error.code : null) : 0,
    signal: /^SIG[A-Z0-9]{1,12}$/u.test(error?.signal ?? "")
      ? error.signal
      : null,
    deadlineExpired: timedOut,
    interrupted,
    errorCategory,
    diagnostic: errorCategory
      ? `Command outcome: ${errorCategory}; raw output retained only in job memory.`
      : "Command completed.",
  };
}

// Each command owns the POSIX process group created by detached spawn. No
// system-wide process discovery or shared service is involved. The deadline
// includes termination; neither process exit nor stream EOF controls settlement.
export function runAppleCommand(
  command,
  args,
  {
    deadline,
    outputFd,
    onOutcome = () => {},
    onSpawn = () => {},
    registerCancel = () => {},
    maxOutputBytes = 4 * 1024 * 1024,
  } = {},
) {
  const started = performance.now();
  const allowanceMs = Math.max(0, deadline - started);
  if (
    !Number.isFinite(deadline) ||
    allowanceMs < 50 ||
    process.platform === "win32"
  )
    return Promise.resolve({
      stdout: "",
      evidence: {
        attempted: false,
        outcome: "unresolved",
        allowanceMs,
        durationMs: 0,
        exitCode: null,
        signal: null,
        deadlineExpired: allowanceMs < 50,
        errorCategory: "COMMAND_NOT_STARTED",
        outputComplete: false,
        teardown: {
          status: "CONFIRMED",
          scope: "not-started",
          groupAbsent: true,
        },
      },
    });
  const reserve = Math.min(1000, allowanceMs / 4);
  const executionDeadline = deadline - reserve;
  return new Promise((resolve) => {
    let child,
      group,
      settled = false,
      groupAbsent = false,
      exitObserved = false;
    let exitCode = null,
      exitSignal = null,
      closeObserved = false,
      spawnFailed = false;
    let timedOut = false,
      interrupted = false,
      outputTruncated = false,
      cause,
      outcomeAt;
    let captured = 0,
      checkpointFailed = false,
      executionDeadlineExpired = false,
      outputFailed = false;
    const stdoutChunks = [],
      stderrChunks = [];
    let poll, softTimer, killTimer, finishTimer;
    const signals = [];
    const streamsClosed = () =>
      spawnFailed ||
      !child?.stdout ||
      (child.stdout.readableEnded && child.stderr.readableEnded);
    const probe = () => {
      if (groupAbsent) return true; // Never revisit a dead/reusable group ID.
      if (!group) return spawnFailed;
      try {
        process.kill(-group, 0);
      } catch (error) {
        if (error.code === "ESRCH") groupAbsent = true;
      }
      return groupAbsent;
    };
    const snapshot = () => {
      const now = performance.now();
      const teardownConfirmed =
        (spawnFailed || exitObserved) && probe() && streamsClosed();
      const evidence = appleToolEvidence({
        error:
          cause === "failure" ? { code: exitCode, signal: exitSignal } : null,
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        timedOut,
        interrupted,
        allowanceMs,
        durationMs: now - started,
      });
      return {
        ...evidence,
        outcome: timedOut
          ? "timeout"
          : interrupted
            ? "interrupted"
            : outputTruncated || outputFailed || checkpointFailed
              ? "failure"
              : (cause ?? "unresolved"),
        exitCode,
        signal: exitSignal,
        exitObserved,
        closeObserved,
        executionOutcome: cause,
        executionDeadlineExpired,
        executionMs: (outcomeAt ?? now) - started,
        teardownMs: outcomeAt === undefined ? 0 : now - outcomeAt,
        schedulingOverrunMs: Math.max(0, now - deadline),
        outputTruncated,
        outputComplete: !outputTruncated && !outputFailed && streamsClosed(),
        errorCategory: outputFailed
          ? "OUTPUT_IO_FAILED"
          : outputTruncated
            ? "OUTPUT_LIMIT_EXCEEDED"
            : checkpointFailed
              ? "CHECKPOINT_FAILED"
              : evidence.errorCategory,
        teardown: {
          status: teardownConfirmed ? "CONFIRMED" : "UNCONFIRMED",
          scope: "spawn-owned-process-group-and-captured-pipes",
          groupAbsent: probe(),
          streamsClosed: streamsClosed(),
          signals: signals.map((item) => ({ ...item })),
        },
      };
    };
    const latch = (value) => {
      if (cause) return;
      if (performance.now() >= executionDeadline) timedOut = true;
      cause = value;
      executionDeadlineExpired = timedOut;
      outcomeAt = performance.now();
      try {
        onOutcome(snapshot());
      } catch {
        checkpointFailed = true;
      }
    };
    const signalGroup = (signal) => {
      if (settled || !group || probe()) return;
      const record = {
        signal,
        requestedAtMs: performance.now() - started,
        sendResult: "UNCONFIRMED",
      };
      try {
        process.kill(-group, signal);
        record.sendResult = "SENT";
      } catch (error) {
        record.sendResult =
          error.code === "ESRCH" ? "ALREADY_ABSENT" : "FAILED";
        if (error.code === "ESRCH") groupAbsent = true;
      }
      signals.push(record);
    };
    const stop = () => {
      signalGroup("SIGTERM");
      if (!killTimer)
        killTimer = setTimeout(
          () => signalGroup("SIGKILL"),
          Math.max(0, Math.min(100, (deadline - performance.now()) / 2)),
        );
    };
    const finish = () => {
      if (settled) return;
      if (!cause) {
        timedOut = true;
        latch("timeout");
      }
      signalGroup("SIGKILL");
      const evidence = snapshot();
      if (
        evidence.teardown.status !== "CONFIRMED" &&
        evidence.outcome === "success"
      ) {
        evidence.outcome = "unresolved";
        evidence.errorCategory = "PROCESS_TEARDOWN_UNCONFIRMED";
      }
      if (evidence.schedulingOverrunMs > 0 && evidence.outcome === "success") {
        evidence.outcome = "timeout";
        evidence.deadlineExpired = true;
      }
      settled = true;
      for (const timer of [poll, softTimer, killTimer, finishTimer])
        clearTimeout(timer);
      registerCancel(undefined);
      // Close only our read handles. This bounds Node lifetime; it is explicitly
      // NOT used as evidence that the process or its descendants exited.
      child?.stdout?.destroy();
      child?.stderr?.destroy();
      child?.unref();
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        evidence,
      });
    };
    const inspect = () => {
      if (settled) return;
      if ((spawnFailed || exitObserved) && probe() && streamsClosed()) {
        finish();
        return;
      }
      poll = setTimeout(
        inspect,
        Math.min(10, Math.max(1, deadline - performance.now())),
      );
    };
    const capture = (which, chunk) => {
      if (settled) return;
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const available = Math.max(0, maxOutputBytes - captured);
      const value = bytes.subarray(0, available);
      if (outputFd === undefined) {
        if (which === "stdout") stdoutChunks.push(value);
        else stderrChunks.push(value);
      } else if (!outputFailed) {
        try {
          if (writeSync(outputFd, value) !== value.length)
            throw new Error("INCOMPLETE_PRIVATE_OUTPUT_WRITE");
        } catch {
          outputFailed = true;
          latch("failure");
          stop();
        }
      }
      captured += bytes.length;
      if (captured > maxOutputBytes && !outputTruncated) {
        outputTruncated = true;
        latch("failure");
        stop();
      }
    };
    try {
      child = spawn(command, args, {
        detached: true,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      group = child.pid; // detached spawn establishes group ownership at creation.
      if (group) onSpawn(group); // Private ownership receipt/fixture handshake only.
      child.stdout?.on("data", (chunk) => capture("stdout", chunk));
      child.stderr?.on("data", (chunk) => capture("stderr", chunk));
      for (const stream of [child.stdout, child.stderr])
        stream?.on("error", () => {
          if (settled) return;
          outputFailed = true;
          latch("failure");
          stop();
        });
      child.on("error", () => {
        if (settled) return;
        if (!group) {
          spawnFailed = true;
          groupAbsent = true;
        }
        latch("failure");
        stop();
      });
      child.on("exit", (code, signal) => {
        if (settled) return;
        exitObserved = true;
        exitCode = code;
        exitSignal = signal;
        latch(code === 0 && !signal ? "success" : "failure");
        if (!probe()) stop(); // A pipe-holding descendant is still owned work.
      });
      child.on("close", () => {
        if (!settled) closeObserved = true;
      });
    } catch {
      if (!group) {
        spawnFailed = true;
        groupAbsent = true;
      }
      latch("failure");
      stop();
    }
    registerCancel(() => {
      if (settled) return;
      interrupted = true;
      latch("interrupted");
      stop();
    });
    softTimer = setTimeout(
      () => {
        if (settled) return;
        if (!cause) {
          timedOut = true;
          latch("timeout");
        }
        stop();
      },
      Math.max(0, executionDeadline - performance.now()),
    );
    // Reserve scheduling/finalization margin; any actual overrun stays visible.
    finishTimer = setTimeout(
      finish,
      Math.max(0, deadline - Math.min(25, reserve / 4) - performance.now()),
    );
    inspect();
  });
}

const unknownExecution = () => ({
  result: "NOT_TESTED",
  code: null,
  attempted: false,
  deadlineExpired: false,
  interrupted: false,
  durationMs: 0,
  nativeExitCode: null,
  nativeSignal: null,
  reason: "EXECUTION_NOT_STARTED",
});

export function appleNativeResult(evidence, wrapperSettled) {
  const wrapperCode = evidence.deadlineExpired
    ? 124
    : evidence.interrupted
      ? 130
      : evidence.outcome === "success"
        ? 0
        : 1;
  const code = evidence.executionDeadlineExpired
    ? 124
    : evidence.interrupted
      ? 130
      : evidence.executionOutcome === "success"
        ? 0
        : 1;
  return {
    ...appleExecutionResult(
      { code, durationMs: evidence.durationMs },
      evidence.exitObserved
        ? { state: "closed", code: evidence.exitCode, signal: evidence.signal }
        : null,
      evidence.interrupted,
    ),
    wrapperSettled,
    wrapperCode,
    teardown: evidence.teardown,
    executionMs: evidence.executionMs,
    teardownMs: evidence.teardownMs,
    schedulingOverrunMs: evidence.schedulingOverrunMs,
  };
}

export function appleExecutionResult(runner, observed, interrupted = false) {
  const deadlineExpired = runner.code === 124;
  interrupted ||= runner.code === 130;
  const nativeExitCode =
    observed?.state === "closed" && Number.isInteger(observed.code)
      ? observed.code
      : null;
  const nativeSignal = /^SIG[A-Z0-9]{1,12}$/u.test(observed?.signal ?? "")
    ? observed.signal
    : null;
  const passed =
    runner.code === 0 && nativeExitCode === 0 && !nativeSignal && !interrupted;
  return {
    attempted: true,
    result: deadlineExpired ? "TIME_BUDGET_EXCEEDED" : passed ? "PASS" : "FAIL",
    code: runner.code,
    runnerCode: runner.code,
    durationMs: runner.durationMs,
    deadlineExpired,
    interrupted,
    nativeExitCode,
    nativeSignal,
    reason: deadlineExpired
      ? "EXECUTION_DEADLINE_EXPIRED"
      : interrupted
        ? "INTERRUPTED"
        : passed
          ? "VALIDATED"
          : nativeExitCode === null && !nativeSignal
            ? "NATIVE_EXIT_UNAVAILABLE"
            : "XCODE_EXECUTION_FAILED",
  };
}

export function appleInvocationResult(
  summary,
  { started, deadline, teardownConfirmed, now = performance.now() },
) {
  const result = {
    ...summary,
    durationMs: now - started,
    teardownConfirmed,
    invocationDeadlineExpired: now >= deadline,
    invocationOverrunMs: Math.max(0, now - deadline),
  };
  if (!teardownConfirmed && result.code === 0)
    Object.assign(result, {
      result: "FAIL",
      code: 1,
      reason: "PROCESS_TEARDOWN_UNCONFIRMED",
    });
  if (now >= deadline && result.code === 0)
    Object.assign(result, {
      result: "TIME_BUDGET_EXCEEDED",
      code: 124,
      reason: "INVOCATION_DEADLINE_EXPIRED",
    });
  return result;
}

export function appleOverall(
  preparation,
  execution,
  cleanup,
  interrupted = false,
) {
  if (execution.attempted && execution.result !== "PASS")
    return {
      result: execution.result,
      code: execution.code || 1,
      reason: execution.reason,
    };
  if (interrupted) return { result: "FAIL", code: 130, reason: "INTERRUPTED" };
  if (
    execution.attempted &&
    execution.wrapperCode &&
    execution.result === "PASS"
  )
    return {
      result: "FAIL",
      code: execution.wrapperCode,
      reason: "NATIVE_WRAPPER_FAILED",
    };
  if (cleanup.result === "PENDING")
    return { result: "PENDING", code: 1, reason: "CLEANUP_PENDING" };
  if (cleanup.result !== "PASS")
    return {
      result: "FAIL",
      code: 1,
      reason: "TASK_SIMULATOR_CLEANUP_INCOMPLETE",
    };
  if (!execution.attempted)
    return {
      result: preparation.deadlineExpired
        ? "TIME_BUDGET_EXCEEDED"
        : "NOT_TESTED",
      code: preparation.code || 1,
      reason: preparation.reason,
    };
  return { result: "PASS", code: 0, reason: "VALIDATED" };
}

// No untrusted strings are returned by this extractor, including failure text,
// device names, test identifiers, insights, source URLs or environment details.
export function safeAppleTestSummary(value) {
  const counts = {};
  for (const key of [
    "totalTestCount",
    "passedTests",
    "failedTests",
    "skippedTests",
    "expectedFailures",
  ])
    counts[key] =
      Number.isSafeInteger(value?.[key]) && value[key] >= 0 ? value[key] : null;
  const result = ["Passed", "Failed", "Skipped", "Expected Failure"].includes(
    value?.result,
  )
    ? value.result
    : "UNKNOWN";
  const complete =
    result !== "UNKNOWN" &&
    Object.values(counts).every((n) => n !== null) &&
    Number.isFinite(value?.startTime) &&
    Number.isFinite(value?.finishTime) &&
    value.finishTime >= value.startTime;
  return { status: complete ? "complete" : "partial", result, ...counts };
}

// These are observed events from a bounded tail, never whole-scheme totals.
export function safeAppleLogSummary(text) {
  const events = {};
  for (const outcome of ["passed", "failed", "skipped"]) {
    const count = [
      ...text.matchAll(new RegExp(`^Test Case '.+' ${outcome}[^\\n]*$`, "gmu")),
    ].length;
    events[outcome] = count || null;
  }
  const suites = [
    ...text.matchAll(/Executed (\d+) tests?, with (\d+) failures?[^\n]*/gu),
  ];
  const last = suites.at(-1);
  return {
    events,
    lastSuiteReport: last
      ? { tests: Number(last[1]), failures: Number(last[2]) }
      : null,
    limitation:
      "Observed XCTest events and last suite report in the bounded tail only; not complete scheme counts.",
  };
}

function appleLogEvidence(output) {
  const path = join(output, "validation.private.log");
  if (!existsSync(path)) return { status: "absent" };
  let fd;
  try {
    fd = openSync(path, "r");
    const size = fstatSync(fd).size;
    const length = Math.min(size, 128 * 1024);
    const buffer = Buffer.alloc(length);
    const bytes = readSync(fd, buffer, 0, length, size - length);
    return {
      status: "readable",
      bytes,
      truncated: size > length,
      ...safeAppleLogSummary(buffer.subarray(0, bytes).toString("utf8")),
    };
  } catch {
    return { status: "unreadable" };
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export async function cleanupAppleSimulator({
  createAttempted,
  simulator,
  name,
  deadline,
  now = () => performance.now(),
  call,
  teardownConfirmed = true,
}) {
  const started = now();
  call ??= (command, args, allowanceMs) =>
    runAppleCommand(command, args, {
      deadline: Math.min(deadline, now() + allowanceMs),
    });
  let commandTeardownConfirmed = teardownConfirmed;
  const operations = [];
  const skip = (operation, outcome, errorCategory = null) =>
    operations.push({
      operation,
      attempted: false,
      outcome,
      allowanceMs: 0,
      durationMs: 0,
      exitCode: null,
      signal: null,
      deadlineExpired: false,
      interrupted: false,
      errorCategory,
    });
  const finish = (result, state) => {
    for (const operation of [
      "reconcile",
      "shutdown",
      "delete",
      "final-verification",
    ])
      if (!operations.some((item) => item.operation === operation))
        skip(operation, "not-attempted");
    return {
      result,
      state,
      operations,
      teardownConfirmed: commandTeardownConfirmed,
      durationMs: now() - started,
    };
  };
  if (!createAttempted) return finish("PASS", "not-required");
  if (!teardownConfirmed) {
    skip("reconcile", "unresolved", "EXECUTION_TEARDOWN_UNCONFIRMED");
    return finish("FAIL", "unresolved");
  }
  const invoke = async (operation, args, fraction = 1, reserve = 0) => {
    const allowanceMs = Math.floor((deadline - now() - reserve) * fraction);
    if (allowanceMs <= 0 || !commandTeardownConfirmed) {
      skip(
        operation,
        "unresolved",
        commandTeardownConfirmed
          ? "NO_REMAINING_BUDGET"
          : "PROCESS_TEARDOWN_UNCONFIRMED",
      );
      return null;
    }
    const response = await call("xcrun", args, allowanceMs);
    operations.push({ operation, ...response.evidence });
    commandTeardownConfirmed =
      response.evidence.teardown?.status === "CONFIRMED";
    if (!commandTeardownConfirmed) return null;
    return response;
  };
  const reconcile = async (operation, fraction = 1, reserve = 0) => {
    const response = await invoke(
      operation,
      ["simctl", "list", "devices", "--json"],
      fraction,
      reserve,
    );
    if (!response || response.evidence.outcome !== "success")
      return { known: false };
    try {
      const { devices } = JSON.parse(response.stdout);
      if (
        !devices ||
        typeof devices !== "object" ||
        Array.isArray(devices) ||
        !Object.values(devices).every(Array.isArray)
      )
        throw new Error();
      const found = Object.values(devices)
        .flat()
        .filter(
          (item) =>
            item.name === name || (simulator && item.udid === simulator),
        );
      if (
        found.length > 1 ||
        (found.length &&
          (found[0].name !== name ||
            (simulator && found[0].udid !== simulator) ||
            !/^[0-9a-f-]{36}$/iu.test(found[0].udid)))
      )
        throw new Error();
      return { known: true, device: found[0] };
    } catch {
      Object.assign(operations.at(-1), {
        outcome: "unresolved",
        errorCategory: "TASK_DEVICE_STATE_UNVERIFIED",
      });
      return { known: false };
    }
  };
  const initial = await reconcile("reconcile", 0.25);
  if (!initial.known) return finish("FAIL", "unresolved");
  if (!initial.device) {
    skip("shutdown", "already-absent");
    skip("delete", "already-absent");
    skip("final-verification", "already-absent");
    return finish("PASS", "already-absent");
  }
  simulator = initial.device.udid;
  if (initial.device.state === "Shutdown") skip("shutdown", "already-stopped");
  else {
    const shutdown = await invoke(
      "shutdown",
      ["simctl", "shutdown", simulator],
      0.5,
      2000,
    );
    if (!shutdown || shutdown.evidence.outcome !== "success") {
      // One bounded reconciliation, never an unchanged shutdown retry.
      const state = await reconcile("reconcile", 0.25);
      if (!state.known) return finish("FAIL", "shutdown-unresolved");
      if (!state.device) {
        skip("delete", "already-absent");
        skip("final-verification", "already-absent");
        return finish("PASS", "already-absent");
      }
      if (state.device.state !== "Shutdown")
        return finish("FAIL", "shutdown-failed");
    }
  }
  const deletion = await invoke(
    "delete",
    ["simctl", "delete", simulator],
    1,
    2000,
  );
  // Confirms successful deletion and resolves a possibly-completed timeout once.
  const final = await reconcile("final-verification");
  if (final.known && !final.device)
    return finish(
      "PASS",
      deletion?.evidence.outcome === "success"
        ? "deleted"
        : "absence-confirmed-after-delete-error",
    );
  return finish(
    "FAIL",
    final.known ? "delete-failed-device-present" : "delete-outcome-unresolved",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const invocationStart = performance.now();
  let deadline = invocationStart + 120000;
  let output, simulator, cancelActiveCommand, executionStart;
  let interrupted = false,
    createAttempted = false,
    processTeardownConfirmed = true;
  const simulatorName = `ArtVenn-task-${randomUUID()}`;
  const preparation = {
    result: "NOT_COMPLETED",
    code: 1,
    reason: "PREPARATION_NOT_COMPLETED",
    deadlineExpired: false,
    interrupted: false,
    durationMs: 0,
    operations: [],
  };
  const summary = {
    platform: "Apple",
    result: "NOT_TESTED",
    code: 1,
    reason: "PREPARATION_NOT_COMPLETED",
    budgetMs: 120000,
    validationKind: "DAILY",
    phases: {
      preparation,
      execution: unknownExecution(),
      cleanup: { result: "PENDING" },
    },
    resultBundle: { status: "absent", reason: "EXECUTION_NOT_STARTED" },
  };
  const checkpoint = (name) => {
    if (!output) return;
    const path = join(output, name);
    writeFileSync(`${path}.tmp`, JSON.stringify(summary, null, 2) + "\n", {
      mode: 0o600,
    });
    renameSync(`${path}.tmp`, path);
  };
  const onSignal = () => {
    interrupted = true;
    cancelActiveCommand?.();
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  try {
    const options = appleOptions(process.argv.slice(2));
    const { buildOnly, budgetMs, validationKind } = options;
    deadline = invocationStart + budgetMs;
    Object.assign(summary, { budgetMs, validationKind });
    const root = runGit("rev-parse", "--show-toplevel").trim();
    process.chdir(root);
    output = freshOutput(options.output, root);
    summary.head = runGit("rev-parse", "HEAD").trim();
    summary.checkoutSha = summary.head;
    summary.sourceHead = /^[0-9a-f]{40}$/u.test(
      process.env.APPLE_SOURCE_SHA ?? "",
    )
      ? process.env.APPLE_SOURCE_SHA
      : summary.head;
    summary.runner = {};
    for (const key of ["ImageOS", "ImageVersion", "RUNNER_OS", "RUNNER_ARCH"])
      summary.runner[key] = /^[A-Za-z0-9._-]{1,40}$/u.test(
        process.env[key] ?? "",
      )
        ? process.env[key]
        : null;
    const project = "apps/apple/ArtVenn/ArtVenn.xcodeproj/project.pbxproj";
    if (!existsSync(project))
      throw new Error("APPLE_PROJECT_ABSENT_BOOTSTRAP_PENDING");
    if (process.platform !== "darwin") throw new Error("MACOS_XCODE_REQUIRED");
    const prepare = async (operation, command, args) => {
      if (interrupted) throw new Error("INTERRUPTED");
      const remaining = Math.min(
        20000 - (performance.now() - invocationStart),
        remainingAppleBudget(deadline, 14000),
      );
      if (remaining <= 0) throw new Error("PREPARATION_BUDGET_EXCEEDED");
      const response = await runAppleCommand(command, args, {
        deadline: Math.min(deadline - 14000, performance.now() + remaining),
        registerCancel: (cancel) => {
          cancelActiveCommand = cancel;
        },
      });
      processTeardownConfirmed =
        response.evidence.teardown.status === "CONFIRMED";
      preparation.operations.push({ operation, ...response.evidence });
      preparation.deadlineExpired ||= response.evidence.deadlineExpired;
      if (!processTeardownConfirmed || response.evidence.outcome !== "success")
        throw new Error(response.evidence.errorCategory);
      return response.stdout.trim();
    };
    const version = await prepare("xcode-version", "xcodebuild", ["-version"]);
    const match = /^Xcode ([0-9.]+)\s+Build version ([0-9A-Za-z]+)$/u.exec(
      version,
    );
    summary.xcode = match
      ? { version: match[1], build: match[2] }
      : { version: null, build: null };
    const sdk = await prepare("simulator-sdk", "xcodebuild", [
      "-version",
      "-sdk",
      "iphonesimulator",
      "SDKVersion",
    ]);
    try {
      assertCompatibleSdk(readFileSync(project, "utf8"), sdk);
    } catch {
      throw new Error("INCOMPATIBLE_SIMULATOR_SDK");
    }
    summary.sdk = sdk;
    let destination = "generic/platform=iOS Simulator";
    if (!buildOnly) {
      const { runtimes } = JSON.parse(
        await prepare("runtime-list", "xcrun", [
          "simctl",
          "list",
          "runtimes",
          "--json",
        ]),
      );
      const runtime = runtimes.find(
        (item) =>
          item.isAvailable &&
          item.identifier.startsWith(
            "com.apple.CoreSimulator.SimRuntime.iOS-",
          ) &&
          item.version === sdk,
      );
      if (!runtime) throw new Error("MATCHING_IOS_RUNTIME_UNAVAILABLE");
      summary.runtime = {
        version: sdk,
        build: /^[0-9A-Za-z]{1,30}$/u.test(runtime.buildversion ?? "")
          ? runtime.buildversion
          : null,
      };
      const { devicetypes } = JSON.parse(
        await prepare("device-types", "xcrun", [
          "simctl",
          "list",
          "devicetypes",
          "--json",
        ]),
      );
      const type = compatibleIphone(runtime, devicetypes);
      if (interrupted) throw new Error("INTERRUPTED");
      createAttempted = true;
      writeFileSync(
        join(output, "simulator.private.json"),
        JSON.stringify({ name: simulatorName, state: "creation-pending" }),
        { mode: 0o600 },
      );
      simulator = await prepare("create", "xcrun", [
        "simctl",
        "create",
        simulatorName,
        type.identifier,
        runtime.identifier,
      ]);
      if (!/^[0-9a-f-]{36}$/iu.test(simulator)) {
        simulator = undefined;
        throw new Error("INVALID_TASK_SIMULATOR_RECEIPT");
      }
      writeFileSync(
        join(output, "simulator.private.json"),
        JSON.stringify({ name: simulatorName, simulator, state: "created" }),
        { mode: 0o600 },
      );
      destination = `platform=iOS Simulator,id=${simulator}`;
    }
    Object.assign(preparation, {
      result: "PASS",
      code: 0,
      reason: "PREPARED",
      durationMs: Math.round(performance.now() - invocationStart),
    });
    summary.tests = buildOnly
      ? "NOT RUN (build-only)"
      : "scheme unit/UI tests; one task-owned simulator";
    summary.commands = [
      appleCommand(
        "<private-output>",
        buildOnly ? destination : "platform=iOS Simulator,<task-owned>",
        buildOnly,
      ),
    ];
    checkpoint("phase-checkpoint.json");
    if (interrupted) throw new Error("INTERRUPTED");
    const allowanceMs = remainingAppleBudget(deadline, 14000);
    const fd = openSync(join(output, "validation.private.log"), "wx", 0o600);
    executionStart = performance.now();
    summary.phases.execution = {
      ...unknownExecution(),
      attempted: true,
      result: "RUNNING",
      allowanceMs,
    };
    checkpoint("phase-checkpoint.json");
    processTeardownConfirmed = false;
    try {
      const [command, ...args] = appleCommand(output, destination, buildOnly);
      const response = await runAppleCommand(command, args, {
        deadline: deadline - 14000,
        outputFd: fd,
        maxOutputBytes: 16 * 1024 * 1024,
        registerCancel: (cancel) => {
          cancelActiveCommand = cancel;
        },
        onOutcome: (evidence) => {
          summary.phases.execution = {
            ...appleNativeResult(evidence, false),
            allowanceMs,
          };
          checkpoint("phase-checkpoint.json");
        },
      });
      summary.phases.execution = {
        ...appleNativeResult(response.evidence, true),
        allowanceMs,
      };
      processTeardownConfirmed =
        response.evidence.teardown.status === "CONFIRMED";
    } finally {
      closeSync(fd);
    }
    Object.assign(
      summary,
      appleOverall(
        preparation,
        summary.phases.execution,
        summary.phases.cleanup,
        interrupted,
      ),
    );
    // This safe artifact is durable before any cleanup/diagnostic command.
    checkpoint("phase-checkpoint.json");
  } catch (error) {
    const reason = /^[A-Z_]+$/u.test(error.message)
      ? error.message
      : "PREPARATION_UNAVAILABLE";
    const deadlineExpired =
      preparation.deadlineExpired ||
      ["TIME_BUDGET_EXCEEDED", "PREPARATION_BUDGET_EXCEEDED"].includes(reason);
    if (summary.phases.execution.attempted)
      Object.assign(summary.phases.execution, {
        result: "FAIL",
        code: 1,
        reason: "EXECUTION_OBSERVATION_FAILED",
        durationMs: Math.round(performance.now() - executionStart),
        interrupted,
        wrapperSettled: false,
        teardown: { status: "UNCONFIRMED" },
      });
    else
      Object.assign(preparation, {
        result: "FAIL",
        code: deadlineExpired ? 124 : 1,
        reason,
        deadlineExpired,
        interrupted,
        durationMs: Math.round(performance.now() - invocationStart),
      });
  } finally {
    summary.preparationMs = preparation.durationMs;
    summary.phases.cleanup = await cleanupAppleSimulator({
      createAttempted,
      simulator,
      name: simulatorName,
      deadline: Math.min(deadline - 4000, performance.now() + 10000),
      teardownConfirmed: processTeardownConfirmed,
    });
    processTeardownConfirmed &&=
      summary.phases.cleanup.teardownConfirmed !== false;
    summary.cleanup =
      summary.phases.cleanup.result === "PASS"
        ? "complete"
        : "incomplete; use the private creation receipt";
    summary.cleanupMs = summary.phases.cleanup.durationMs;
    Object.assign(
      summary,
      appleOverall(
        preparation,
        summary.phases.execution,
        summary.phases.cleanup,
        interrupted,
      ),
    );
    checkpoint("summary.json");
    const diagnosticStart = performance.now();
    summary.logEvidence = output
      ? appleLogEvidence(output)
      : { status: "absent" };
    const bundle = output && join(output, "Result.xcresult");
    if (!processTeardownConfirmed) {
      summary.resultBundle = {
        status: "unreadable",
        reason: "PROCESS_TEARDOWN_UNCONFIRMED",
        extraction: { attempted: false },
      };
    } else if (bundle && existsSync(bundle)) {
      summary.resultBundle = {
        status: "unreadable",
        reason: "NO_DIAGNOSTIC_BUDGET",
      };
      const allowance = Math.min(
        3000,
        Math.floor(deadline - performance.now() - 1000),
      );
      if (allowance > 0) {
        const response = await runAppleCommand(
          "xcrun",
          [
            "xcresulttool",
            "get",
            "test-results",
            "summary",
            "--path",
            bundle,
            "--compact",
          ],
          {
            deadline: Math.min(deadline - 1000, performance.now() + allowance),
          },
        );
        processTeardownConfirmed =
          response.evidence.teardown.status === "CONFIRMED";
        summary.resultBundle.extraction = response.evidence;
        if (response.evidence.outcome === "success") {
          try {
            summary.resultBundle = {
              ...safeAppleTestSummary(JSON.parse(response.stdout)),
              extraction: response.evidence,
            };
          } catch {
            summary.resultBundle.reason = "SUMMARY_UNREADABLE";
          }
        } else summary.resultBundle.reason = "SUMMARY_EXTRACTION_FAILED";
      }
    } else
      summary.resultBundle = {
        status: "absent",
        reason: "RESULT_BUNDLE_ABSENT",
      };
    Object.assign(
      summary,
      appleOverall(
        preparation,
        summary.phases.execution,
        summary.phases.cleanup,
        interrupted,
      ),
    );
    // Known native exit remains intact even when completion evidence is missing.
    if (
      summary.code === 0 &&
      summary.phases.execution.result === "PASS" &&
      summary.tests?.startsWith("scheme") &&
      (summary.resultBundle.status !== "complete" ||
        summary.resultBundle.result !== "Passed" ||
        !(summary.resultBundle.totalTestCount > 0) ||
        summary.resultBundle.failedTests !== 0)
    )
      Object.assign(summary, {
        result: "FAIL",
        code: 1,
        reason: "NATIVE_TEST_COMPLETION_UNVERIFIED",
      });
    if (interrupted && summary.code === 0)
      Object.assign(summary, {
        result: "FAIL",
        code: 130,
        reason: "INTERRUPTED",
      });
    summary.diagnosticMs = Math.round(performance.now() - diagnosticStart);
    summary.interrupted = interrupted;
    Object.assign(
      summary,
      appleInvocationResult(summary, {
        started: invocationStart,
        deadline,
        teardownConfirmed: processTeardownConfirmed,
      }),
    );
    checkpoint("summary.json");
    if (output)
      writeFileSync(
        join(output, "diagnostic.json"),
        JSON.stringify(
          {
            sourceHead: summary.sourceHead,
            checkoutSha: summary.checkoutSha,
            execution: summary.phases.execution,
            cleanup: summary.phases.cleanup,
            resultBundle: summary.resultBundle,
            logEvidence: summary.logEvidence,
            limitation:
              "Only allowlisted structured facts. Raw logs, receipts and result bundles are not published.",
          },
          null,
          2,
        ) + "\n",
        { mode: 0o600 },
      );
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    process.exitCode = summary.code;
    console.log(JSON.stringify(summary));
  }
}
