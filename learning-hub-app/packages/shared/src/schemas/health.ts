import { z } from "zod";

export const healthResponseSchema = z.object({
  ok: z.literal(true),
  service: z.literal("learning-hub-server"),
  timestamp: z.string().datetime(),
  version: z.string().min(1)
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export function createHealthResponse(version: string, now = new Date()): HealthResponse {
  return healthResponseSchema.parse({
    ok: true,
    service: "learning-hub-server",
    timestamp: now.toISOString(),
    version
  });
}
