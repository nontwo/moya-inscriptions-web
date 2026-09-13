/** Pure synthetic files only. No database, credentials, new identities or
 * external artwork. Existing outputs are verified and never overwritten. */
import process from "node:process";
import { Buffer } from "node:buffer";
import console from "node:console";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "apps/admin/package.json"));
const sharp = require("sharp");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const assert = (condition, code) => {
  if (!condition) throw new Error(code);
};
assert(process.argv.length === 3, "OUTPUT_DIRECTORY_REQUIRED");
const output = path.resolve(process.argv[2]);
const source = fs.readFileSync(
  path.join(root, "infra/development/phase4/manifest.json"),
);
assert(
  digest(source) ===
    "ed068b2d940807783d3817f3ba708df4606fd43f07476bd0e32367336966993a",
  "FIXTURE_MANIFEST_CHANGED",
);
const manifest = JSON.parse(source);
process.umask(0o077);
fs.mkdirSync(output, { recursive: true, mode: 0o700 });
const destination = path.join(output, "manifest.json");
if (fs.existsSync(destination)) {
  const existing = JSON.parse(fs.readFileSync(destination));
  for (const asset of existing.media) delete asset.filePath;
  assert(
    JSON.stringify(existing) === JSON.stringify(manifest),
    "EXISTING_MANIFEST_COLLISION",
  );
} else fs.writeFileSync(destination, source, { mode: 0o600, flag: "wx" });
fs.mkdirSync(path.join(output, "images"), { recursive: true, mode: 0o700 });
const palettes = [
  [34, 42, 49],
  [78, 69, 56],
  [64, 83, 73],
  [90, 69, 79],
  [60, 77, 100],
  [89, 82, 54],
];
let written = 0;
for (const asset of manifest.media) {
  const filename = path.resolve(output, asset.file);
  assert(
    filename.startsWith(path.join(output, "images") + path.sep),
    "MEDIA_PATH_INVALID",
  );
  if (fs.existsSync(filename)) {
    assert(
      digest(fs.readFileSync(filename)) === asset.sha256,
      "EXISTING_MEDIA_COLLISION",
    );
    continue;
  }
  assert(
    asset.generation.recipe === "phase4-geometric-rgba-v1" &&
      asset.generation.noExternalInputs,
    "RECIPE_CHANGED",
  );
  const { width, height } = asset,
    { ordinal } = asset.generation;
  const palette = palettes[(ordinal - 1) % palettes.length];
  const pixels = Buffer.alloc(width * height * 4);
  const border = Math.max(8, Math.floor(Math.min(width, height) / 18));
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const inBorder =
        x < border || x >= width - border || y < border || y >= height - border;
      const bar =
        x > width * 0.18 &&
        x < width * 0.38 &&
        y > height * 0.19 &&
        y < height * 0.79;
      const disc =
        ((x - width * 0.67) / (width * 0.2)) ** 2 +
          ((y - height * 0.43) / (height * 0.22)) ** 2 <
        1;
      const stripe =
        y > height * 0.74 &&
        y < height * 0.85 &&
        x > width * 0.49 &&
        x < width * 0.88;
      const code =
        y > border * 1.4 &&
        y < border * 2.4 &&
        x > border * 1.5 &&
        x < border * (1.5 + (ordinal % 11));
      const grid = (Math.floor(x / 30) + Math.floor(y / 30)) % 2;
      let rgb = [232 + grid * 5, 229 + grid * 5, 222 + grid * 5];
      if (inBorder) rgb = [210, 207, 200];
      if (bar || code) rgb = palette;
      if (disc) rgb = palette.map((c) => Math.min(220, c + 68));
      if (stripe) rgb = palette.map((c) => Math.max(0, c - 15));
      pixels[index] = rgb[0];
      pixels[index + 1] = rgb[1];
      pixels[index + 2] = rgb[2];
      pixels[index + 3] = 255;
    }
  const bytes = await sharp(pixels, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();
  assert(
    bytes.length === asset.byteLength && digest(bytes) === asset.sha256,
    "GENERATED_MEDIA_MISMATCH",
  );
  fs.writeFileSync(filename, bytes, { mode: 0o600, flag: "wx" });
  written++;
}
console.log(
  JSON.stringify({
    phase4FixtureFiles: "VERIFIED",
    catalogs: 10,
    works: 10,
    media: 25,
    written,
  }),
);
