import { mkdir, writeFile } from "node:fs/promises";
import { URL } from "node:url";

import { serializeOpenApiDocument } from "../dist/index.js";

const outputDirectory = new URL("../openapi/", import.meta.url);
const outputFile = new URL("openapi.json", outputDirectory);

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputFile, serializeOpenApiDocument(), "utf8");
