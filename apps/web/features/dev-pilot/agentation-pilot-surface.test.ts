import { describe, expect, it } from "vitest";

import {
  parseLoopbackEndpoint,
  resolveAgentationPilotSurface,
} from "./agentation-pilot-surface";

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
