import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  parseLoopbackEndpoint,
  resolveAgentationPilotSurface,
} from "./agentation-pilot-surface";

const webRoot = fileURLToPath(new URL("../../", import.meta.url));
const sourceFiles = (directory: string): string[] =>
  readdirSync(path.join(webRoot, directory), {
    recursive: true,
    withFileTypes: true,
  })
    .filter(
      (entry) =>
        entry.isFile() &&
        /\.(?:ts|tsx)$/u.test(entry.name) &&
        !/\.test\.tsx?$/u.test(entry.name),
    )
    .map((entry) =>
      path
        .relative(webRoot, path.join(entry.parentPath, entry.name))
        .split(path.sep)
        .join("/"),
    );

describe("Agentation pilot stays inside the Development route tree", () => {
  it("is imported only by the /dev layout and its own module", () => {
    const importers = [...sourceFiles("app"), ...sourceFiles("features")]
      .filter((file) =>
        /["'](?:agentation|[./]*features\/dev-pilot\/[a-z-]+)["']/u.test(
          readFileSync(path.join(webRoot, file), "utf8"),
        ),
      )
      .sort();
    expect(importers).toEqual([
      "app/dev/layout.tsx",
      "features/dev-pilot/agentation-pilot.tsx",
    ]);
  });
});

describe("Agentation pilot composition", () => {
  it("resolves only in Development with an explicit loopback endpoint", () => {
    expect(
      resolveAgentationPilotSurface("development", "http://127.0.0.1:4747"),
    ).toEqual({ endpoint: "http://127.0.0.1:4747" });
    expect(
      resolveAgentationPilotSurface("development", "http://localhost:4747/"),
    ).toEqual({ endpoint: "http://localhost:4747" });
  });

  it("is absent in Production and test builds whatever the environment says", () => {
    for (const nodeEnv of ["production", "test", undefined, ""])
      expect(
        resolveAgentationPilotSurface(nodeEnv, "http://127.0.0.1:4747"),
      ).toBeNull();
  });

  it("is absent without an endpoint, and refuses anything but a bare loopback HTTP origin", () => {
    for (const endpoint of [
      undefined,
      "",
      "   ",
      "4747",
      "https://127.0.0.1:4747",
      "http://127.0.0.1",
      "http://0.0.0.0:4747",
      "http://192.168.1.10:4747",
      "http://agentation.example.invalid:4747",
      "http://127.0.0.1:4747/sessions",
      "http://127.0.0.1:4747/?x=1",
      "http://127.0.0.1:4747/#x",
      "http://user:synthetic@127.0.0.1:4747",
      "ws://127.0.0.1:4747",
    ]) {
      expect(parseLoopbackEndpoint(endpoint), String(endpoint)).toBeNull();
      expect(
        resolveAgentationPilotSurface("development", endpoint),
        String(endpoint),
      ).toBeNull();
    }
  });
});
