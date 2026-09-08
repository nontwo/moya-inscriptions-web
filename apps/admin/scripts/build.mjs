import process from "node:process";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
// Compilation has no runtime database. Values exist only in this child process.
const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "build"],
  {
    cwd: path.resolve(import.meta.dirname, ".."),
    env: {
      ...process.env,
      CMS_ENVIRONMENT: "synthetic",
      CMS_STORAGE_MODE: "local",
      CMS_SECRET: randomBytes(32).toString("hex"),
      CMS_DATABASE_URL: "postgresql://build_only@127.0.0.1:1/build_only",
      CMS_MEDIA_DIR: path.join(tmpdir(), "yoyi-cms-build-only"),
    },
    stdio: "inherit",
  },
);
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
