import "server-only";
import { z } from "@shop/contracts";
import { AppError } from "@shop/domain";

function isPublicKey(value: string): boolean {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true;
  const parts = value.split(".");
  if (parts.length !== 3 || !parts[1]) return false;
  try {
    const payload: unknown = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof payload === "object" && payload !== null &&
      "role" in payload && payload.role === "anon";
  } catch {
    return false;
  }
}

const configSchema = z.strictObject({
  SUPABASE_URL: z.url().refine((value) => {
    const url = new URL(value);
    return !url.username && !url.password && !url.search && !url.hash &&
      url.pathname === "/" && (url.protocol === "https:" ||
      (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)));
  }),
  SUPABASE_PUBLISHABLE_KEY: z.string().refine(isPublicKey),
  APP_ORIGIN: z.url().refine((value) => {
    const url = new URL(value);
    return url.origin === value &&
      (url.protocol === "https:" ||
        (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)));
  }),
});

export function readConfig(env: Readonly<Record<string, string | undefined>> = process.env) {
  const result = configSchema.safeParse({
    SUPABASE_URL: env.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_PUBLISHABLE_KEY,
    APP_ORIGIN: env.APP_ORIGIN,
  });
  if (!result.success) {
    // Do not expose invalid environment values in error responses or logs.
    throw new AppError(503, "SERVICE_UNAVAILABLE", "Dịch vụ chưa được cấu hình.");
  }
  return result.data;
}
