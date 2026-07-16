import { describe, expect, it } from "vitest";
import { createHealthResponse, healthResponseSchema } from "./index.js";

describe("healthResponseSchema", () => {
  it("accepts a generated health response", () => {
    const response = createHealthResponse("0.0.0", new Date("2026-07-07T00:00:00.000Z"));

    expect(response).toEqual({
      ok: true,
      service: "learning-hub-server",
      timestamp: "2026-07-07T00:00:00.000Z",
      version: "0.0.0"
    });
  });

  it("rejects malformed timestamps", () => {
    const result = healthResponseSchema.safeParse({
      ok: true,
      service: "learning-hub-server",
      timestamp: "not-a-date",
      version: "0.0.0"
    });

    expect(result.success).toBe(false);
  });
});
