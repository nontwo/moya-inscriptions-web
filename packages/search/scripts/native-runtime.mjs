import process from "node:process";
import console from "node:console";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Explicit installation checks only. Never install OS packages or disclose paths
// or native compiler output; those may contain identifying build directories.
const require = createRequire(import.meta.url);
try {
  const mode = process.argv[2];
  if (process.argv.length !== 3 || !["check", "rebuild"].includes(mode)) {
    throw new Error("Invalid mode");
  }
  const metadata = require.resolve("opencc/package.json");
  if (JSON.parse(readFileSync(metadata, "utf8")).version !== "1.4.1") {
    throw new Error("Unexpected OpenCC version");
  }
  if (mode === "rebuild") {
    const gyp = require.resolve("node-gyp/bin/node-gyp.js", {
      paths: [dirname(metadata)],
    });
    const result = spawnSync(
      process.execPath,
      [gyp, "rebuild", "--directory", dirname(metadata), "--jobs", "2"],
      {
        encoding: "utf8",
        stdio: "pipe",
      },
    );
    if (result.status !== 0) throw new Error("Native build failed");
  }
  const OpenCC = require("opencc");
  const converter = new OpenCC("t2s.json");
  // Public/synthetic probes only; this program never accepts query arguments.
  if (
    OpenCC.version !== "1.4.1" ||
    converter.convertSync("書譜") !== "书谱" ||
    converter.convertSync("祭姪文稿") !== "祭姪文稿"
  ) {
    throw new Error("Unexpected conversion");
  }
  console.info(
    `[search] OpenCC 1.4.1 t2s check passed (${process.platform}/${process.arch})`,
  );
} catch {
  console.error("[search] OpenCC native preparation/check failed");
  process.exitCode = 1;
}
