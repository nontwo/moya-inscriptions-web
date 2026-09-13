import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  openSync,
  closeSync,
} from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { freshOutput } from "./verify-task.mjs";
import { runWithinBudget } from "./verify.mjs";
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
    "-derivedDataPath",
    join(output, "DerivedData"),
    "-resultBundlePath",
    join(output, "Result.xcresult"),
    "CODE_SIGNING_ALLOWED=NO",
    buildOnly ? "build" : "test",
  ];
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

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  let output, simulator, currentPreparation;
  let interrupted = false,
    createAttempted = false,
    cleanupComplete = true;
  let validationStart;
  const simulatorName = `ArtVenn-task-${randomUUID()}`;
  const summary = {
    platform: "Apple",
    result: "NOT_TESTED",
    code: 1,
    reason: "PREPARATION_NOT_COMPLETED",
    budgetMs: 120000,
  };
  const onSignal = () => {
    interrupted = true;
    currentPreparation?.kill("SIGKILL");
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  // Installed before any simulator mutation and retained through final cleanup.
  const call = (command, args, timeout, cleanup = false) =>
    new Promise((accept, reject) => {
      if (interrupted && !cleanup) {
        reject(new Error("INTERRUPTED"));
        return;
      }
      const child = execFile(
        command,
        args,
        {
          encoding: "utf8",
          timeout,
          killSignal: "SIGKILL",
          maxBuffer: 4 * 1024 * 1024,
        },
        (error, stdout) => {
          if (!cleanup) currentPreparation = undefined;
          if (error)
            reject(
              new Error(
                cleanup ? "CLEANUP_FAILED" : "TOOL_UNAVAILABLE_OR_FAILED",
              ),
            );
          else accept(stdout.trim());
        },
      );
      if (!cleanup) currentPreparation = child;
    });
  try {
    const args = process.argv.slice(2);
    const buildOnly = args.includes("--build-only");
    const rest = args.filter((arg) => arg !== "--build-only");
    if (rest.length !== 2 || rest[0] !== "--output")
      throw new Error("EXPECTED_OUTPUT_ARGUMENT");
    const root = runGit("rev-parse", "--show-toplevel").trim();
    process.chdir(root);
    output = freshOutput(rest[1], root);
    summary.head = runGit("rev-parse", "HEAD").trim();
    const project = "apps/apple/ArtVenn/ArtVenn.xcodeproj/project.pbxproj";
    if (!existsSync(project))
      throw new Error("APPLE_PROJECT_ABSENT_BOOTSTRAP_PENDING");
    if (process.platform !== "darwin") throw new Error("MACOS_XCODE_REQUIRED");
    const prepStart = Date.now();
    const prepare = (command, args) => {
      const remaining = 20000 - (Date.now() - prepStart);
      if (remaining <= 0) throw new Error("PREPARATION_BUDGET_EXCEEDED");
      return call(command, args, remaining);
    };
    const sdk = await prepare("xcodebuild", [
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
        await prepare("xcrun", ["simctl", "list", "runtimes", "--json"]),
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
      const { devicetypes } = JSON.parse(
        await prepare("xcrun", ["simctl", "list", "devicetypes", "--json"]),
      );
      const type = devicetypes.findLast(
        (item) => item.productFamily === "iPhone",
      );
      if (!type) throw new Error("IPHONE_DEVICE_TYPE_UNAVAILABLE");
      if (interrupted) throw new Error("INTERRUPTED");
      createAttempted = true;
      writeFileSync(
        join(output, "simulator.private.json"),
        JSON.stringify({ name: simulatorName, state: "creation-pending" }),
        { mode: 0o600 },
      );
      simulator = await prepare("xcrun", [
        "simctl",
        "create",
        simulatorName,
        type.identifier,
        runtime.identifier,
      ]);
      writeFileSync(
        join(output, "simulator.private.json"),
        JSON.stringify({ name: simulatorName, simulator, state: "created" }),
        { mode: 0o600 },
      );
      destination = `platform=iOS Simulator,id=${simulator}`;
    }
    summary.preparationMs = Date.now() - prepStart;
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
    if (interrupted) throw new Error("INTERRUPTED");
    validationStart = Date.now();
    const fd = openSync(join(output, "validation.private.log"), "wx", 0o600);
    let result;
    try {
      // 112s plus at most 6s cleanup fits the same 120s allowance; parent task
      // cancellation has 8s grace, enough for this exact simulator's cleanup.
      result = await runWithinBudget(
        [appleCommand(output, destination, buildOnly)],
        { budgetMs: 112000, graceMs: 1000, stdio: ["ignore", fd, fd] },
      );
    } finally {
      closeSync(fd);
    }
    Object.assign(summary, result, {
      result:
        result.code === 0
          ? "PASS"
          : result.code === 124
            ? "TIME_BUDGET_EXCEEDED"
            : "FAIL",
      reason: result.code === 0 ? "VALIDATED" : "XCODE_EXECUTION_FAILED",
    });
  } catch (error) {
    // Never serialize child stdout/stderr or a device/signing identifier.
    summary.reason = /^[A-Z_]+$/u.test(error.message)
      ? error.message
      : "PREPARATION_UNAVAILABLE";
    summary.code = 1;
  } finally {
    const cleanupStart = Date.now();
    const cleanup = (args) =>
      call(
        "xcrun",
        args,
        Math.min(2000, Math.max(1, 6000 - (Date.now() - cleanupStart))),
        true,
      );
    if (createAttempted) {
      try {
        // Reconcile a cancelled create by this invocation's unique name before
        // cleanup; never retry creation or inspect/delete another task's device.
        if (!simulator) {
          const { devices } = JSON.parse(
            await cleanup(["simctl", "list", "devices", "--json"]),
          );
          const found = Object.values(devices)
            .flat()
            .filter((item) => item.name === simulatorName);
          if (found.length > 1) throw new Error("AMBIGUOUS_TASK_SIMULATOR");
          simulator = found[0]?.udid;
          if (!simulator) throw new Error("CREATION_OUTCOME_UNRESOLVED");
        }
        if (simulator) {
          try {
            await cleanup(["simctl", "shutdown", simulator]);
          } catch {
            /* Already stopped is expected. Deletion must still succeed. */
          }
          await cleanup(["simctl", "delete", simulator]);
        }
      } catch {
        cleanupComplete = false;
      }
    }
    if (interrupted || !cleanupComplete)
      Object.assign(summary, {
        code: interrupted ? 130 : 1,
        result: "FAIL",
        reason: interrupted
          ? "INTERRUPTED"
          : "TASK_SIMULATOR_CLEANUP_INCOMPLETE",
      });
    summary.cleanup = cleanupComplete
      ? "complete"
      : "incomplete; use the private creation receipt";
    summary.cleanupMs = Date.now() - cleanupStart;
    if (validationStart) summary.durationMs = Date.now() - validationStart;
    if (output)
      writeFileSync(
        join(output, "summary.json"),
        JSON.stringify(summary, null, 2) + "\n",
        { mode: 0o600 },
      );
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    process.exitCode = summary.code;
    console.log(JSON.stringify(summary));
  }
}
