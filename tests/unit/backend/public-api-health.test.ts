import { healthResponseSchema } from "@moya/contracts/schemas";
import { getHealth } from "@moya/public-api";
import { describe, expect, it } from "vitest";

describe("getHealth", () => {
  it("returns exactly the ok status with no extra fields", () => {
    expect(getHealth()).toStrictEqual({ status: "ok" });
  });

  it("satisfies the health response contract", () => {
    expect(() => healthResponseSchema.parse(getHealth())).not.toThrow();
  });
});
