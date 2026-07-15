import { z } from "zod";

export const scopeSchema = z.enum(["calculator", "todo"]);
export const statePutSchema = z.object({
  scope: scopeSchema,
  baseRevision: z.number().int().min(0),
  schemaVersion: z.number().int().min(1).max(100).default(1),
  payload: z.unknown(),
  force: z.boolean().optional().default(false),
});
export const accountCreateSchema = z.object({
  id: z.string().min(1).max(100).optional(),
  label: z.string().trim().min(1).max(50),
  apiKey: z
    .string()
    .trim()
    .regex(/^live_[A-Za-z0-9_-]+$/, "live_로 시작하는 API 키가 필요합니다."),
});
export const accountPatchSchema = z.object({
  id: z.string().min(1).max(100),
  label: z.string().trim().min(1).max(50),
});
export const historyRecordSchema = z.object({
  week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  revenue: z.number().int().nonnegative(),
  crystals: z.number().int().nonnegative(),
  monthlyBossRevenue: z.number().int().nonnegative(),
  characterCount: z.number().int().nonnegative(),
  updatedAt: z.string().datetime().optional(),
});

export function bodyWithinLimit(body: unknown, maxBytes = 1_000_000): boolean {
  try {
    return Buffer.byteLength(JSON.stringify(body), "utf8") <= maxBytes;
  } catch {
    return false;
  }
}
