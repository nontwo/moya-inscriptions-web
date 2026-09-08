import process from "node:process";
import console from "node:console";
import { cp, readFile, writeFile, access, stat, rm } from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import {
  createVerificationSession,
  syntheticDatabase,
  verificationRoot as root,
} from "./verify-cms.mjs";

const expectedStages = [
  "login",
  "native-create-renders-before-empty-write",
  "native-incomplete-draft-save",
  "native-publish",
  "native-autosave-preserves-main-revision",
  "owner-batch-approval",
  "owner-history-restores-draft-only",
  "native-media-upload-and-draft-preview",
  "native-withdrawal-confirmation-and-revision-conflict",
  "native-withdrawal-preserves-latest-draft",
];

async function main() {
  const database = syntheticDatabase(process.env.CMS_TEST_DATABASE_URL);
  const session = await createVerificationSession(
    database,
    "moya-owner-browser-",
  );
  const handoff = path.join(session.directory, "access.json");
  let summary;
  let operationError;
  try {
    const env = {
      ...session.env,
      CMS_QA_HANDOFF_FILE: handoff,
      CMS_QA_ACCESS_FILE: handoff,
    };
    const admin = path.join(root, "apps/admin");
    const standalone = path.join(admin, ".next/standalone/apps/admin");
    await access(path.join(standalone, "server.js"));
    await cp(
      path.join(admin, ".next/static"),
      path.join(standalone, ".next/static"),
      { recursive: true },
    );
    session.assertActive();
    await session.run(
      ["node_modules/payload/bin.js", "run", "scripts/bootstrap-synthetic.ts"],
      admin,
      "bootstrap",
      env,
    );
    const port = await new Promise((resolve, reject) => {
      const socket = createServer();
      socket.once("error", reject);
      socket.listen(0, "127.0.0.1", () => {
        const address = socket.address();
        if (!address || typeof address === "string") {
          socket.close();
          reject(new Error("LOCAL_PORT_UNAVAILABLE"));
          return;
        }
        socket.close((error) =>
          error ? reject(error) : resolve(address.port),
        );
      });
    });
    const origin = `http://127.0.0.1:${port}`;
    Object.assign(env, {
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      CMS_PUBLIC_URL: origin,
      CMS_PREVIEW_WEB_URL: origin,
    });
    if ((await stat(handoff)).mode & 0o077)
      throw new Error("PROTECTED_HANDOFF_REQUIRED");
    const settings = JSON.parse(await readFile(handoff, "utf8"));
    await writeFile(handoff, JSON.stringify({ ...settings, baseURL: origin }), {
      mode: 0o600,
    });
    const server = session.start(["server.js"], standalone, env, false);
    const deadline = Date.now() + 45000;
    for (;;) {
      session.assertActive();
      try {
        const response = await globalThis.fetch(`${origin}/admin/login`, {
          redirect: "error",
          cache: "no-store",
          signal: globalThis.AbortSignal.any([
            session.signal,
            globalThis.AbortSignal.timeout(3000),
          ]),
        });
        if (response.ok) break;
      } catch {
        /* bounded startup; never follow another target */
      }
      if (
        Date.now() >= deadline ||
        !server.child.pid ||
        server.child.exitCode !== null ||
        server.child.signalCode !== null
      )
        throw new Error("NATIVE_SERVER_START_FAILED");
      await delay(200, undefined, { signal: session.signal });
    }
    const browser = session.start(["tests/cms/owner-browser.mjs"], root, env);
    const browserCode = await browser.closed;
    const frames = browser
      .output()
      .trim()
      .split("\n")
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    const results = frames.filter((item) => typeof item.ok === "boolean");
    summary = results.length === 1 ? results[0] : null;
    if (browserCode !== 0 || summary?.ok !== true) {
      // The browser emits fixed stage names. Do not forward child diagnostics,
      // response bodies, URLs or arbitrary exception messages.
      console.log(
        JSON.stringify({
          syntheticOwnerBrowser: "FAIL",
          stage: /^[a-z][a-z-]{0,95}$/.test(summary?.stage ?? "")
            ? summary.stage
            : "unrecognized-browser-result",
          nativeWithdrawalCode: [
            "REVISION_REQUIRED",
            "REVISION_CONFLICT",
          ].includes(summary?.nativeWithdrawalCode)
            ? summary.nativeWithdrawalCode
            : undefined,
          failureKind: ["AssertionError", "TimeoutError", "Error"].includes(
            summary?.category,
          )
            ? summary.category
            : undefined,
          completed: expectedStages.filter((stage) =>
            summary?.completed?.includes(stage),
          ),
          checkpoints: frames
            .filter(
              (item) =>
                [
                  "start-conflict",
                  "conflict-passed",
                  "final-confirm-open",
                  "final-confirm-click-returned",
                  "withdraw-response-ok",
                ].includes(item.nativeWithdrawalCheckpoint) &&
                Number.isSafeInteger(item.elapsedMs) &&
                item.elapsedMs >= 0,
            )
            .map((item) => ({
              name: item.nativeWithdrawalCheckpoint,
              elapsedMs: item.elapsedMs,
            })),
        }),
      );
      throw new Error("NATIVE_BROWSER_CHECK_FAILED");
    }
    if (
      summary?.ok !== true ||
      !Array.isArray(summary.completed) ||
      JSON.stringify(summary.completed) !== JSON.stringify(expectedStages)
    )
      throw new Error("NATIVE_BROWSER_RESULT_INCOMPLETE");
    session.assertActive();
  } catch (error) {
    operationError = error;
  } finally {
    await session.dispose();
    await rm(handoff, { force: true });
  }
  if (session.failure) throw new Error(session.failure);
  if (operationError) throw operationError;
  console.log(
    JSON.stringify({
      syntheticOwnerBrowser: "PASS",
      stages: summary.completed.length,
    }),
  );
}
main().catch((error) => {
  const category =
    error instanceof Error && /^[A-Z_]+$/.test(error.message)
      ? error.message
      : "SYNTHETIC_BROWSER_CHECK_FAILED";
  console.log(JSON.stringify({ syntheticOwnerBrowser: "FAIL", category }));
  process.exitCode = category === "TIME_BUDGET_EXCEEDED" ? 124 : 1;
});
