import { afterEach, describe, expect, it, vi } from "vitest";
import { authenticate, databaseError, supabaseRepository, userClient } from "../../apps/web/src/server/adapters/supabase";
import { readConfig } from "../../apps/web/src/server/env";

const id = "10000000-0000-4000-8000-000000000001";
function configured() {
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
}
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("server env and Supabase user-scoped adapter", () => {
  it.each([
    { phone: undefined, phone_confirmed_at: undefined, expected: false },
    { phone: "84900000000", phone_confirmed_at: undefined, expected: false },
    { phone: undefined, phone_confirmed_at: "2026-10-02T00:00:00Z", expected: false },
    { phone: "84900000000", phone_confirmed_at: "2026-10-02T00:00:00Z", expected: true },
  ])("uses only current Auth phone verification for buying: $expected", async ({ phone, phone_confirmed_at, expected }) => {
    configured();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      id, aud: "authenticated", created_at: "2026-10-01T00:00:00Z",
      email_confirmed_at: "2026-10-01T00:00:00Z", phone, phone_confirmed_at,
      app_metadata: {}, user_metadata: { phoneVerified: true },
    })));
    const session = await authenticate(new Request("http://localhost/api/v1/me", { headers: { authorization: "Bearer test-token" } }));
    expect(session.actor.phoneVerified).toBe(expected);
  });
  it("fails explicitly when configuration is missing, without echoing values", () => {
    expect(() => readConfig({})).toThrow("Dịch vụ chưa được cấu hình.");
  });
  it("rejects insecure remote URLs and redirect-like app origins", () => {
    expect(() => readConfig({
      SUPABASE_URL: "http://remote.invalid", SUPABASE_PUBLISHABLE_KEY: "test", APP_ORIGIN: "https://app.invalid",
    })).toThrow();
    expect(() => readConfig({
      SUPABASE_URL: "https://db.invalid", SUPABASE_PUBLISHABLE_KEY: "test", APP_ORIGIN: "https://app.invalid/path",
    })).toThrow();
  });
  it.each([
    "https://supabase.com/dashboard/project/test",
    "https://example.supabase.co/rest/v1",
    "https://user:password@example.supabase.co",
    "https://example.supabase.co?token=private",
  ])("rejects dashboard/API-path/credential URLs without echoing configuration", (url) => {
    expect(() => readConfig({
      SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test", APP_ORIGIN: "http://localhost:3000",
    })).toThrow("Dịch vụ chưa được cấu hình.");
  });
  it("rejects secret/service-role keys on user-scoped requests", () => {
    const payload = Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url");
    for (const key of ["sb_secret_private", `test.${payload}.test`]) {
      expect(() => readConfig({
        SUPABASE_URL: "https://example.supabase.co", SUPABASE_PUBLISHABLE_KEY: key, APP_ORIGIN: "http://localhost:3000",
      })).toThrow("Dịch vụ chưa được cấu hình.");
    }
  });
  it.each([undefined, "Basic abc", "Bearer a,b", "Bearer a b"])(
    "does not authenticate with an absent/malformed bearer (%s)", async (authorization) => {
      const headers = authorization ? { authorization } : {};
      await expect(authenticate(new Request("http://localhost/api/v1/me", { headers })))
        .rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    },
  );
  it("calls Auth.getUser with bearer; ignores editable metadata as verification", async () => {
    configured();
    const fetchMock = vi.fn(async () => Response.json({
      id, aud: "authenticated", role: "authenticated", email: "test@example.invalid",
      created_at: "2026-10-01T00:00:00Z", app_metadata: {},
      user_metadata: { role: "admin", email_confirmed_at: "forged" }, identities: [],
    }));
    vi.stubGlobal("fetch", fetchMock);
    const session = await authenticate(new Request("http://localhost/api/v1/me", {
      headers: { authorization: "Bearer test-token" },
    }));
    expect(session.actor).toEqual({ id, verified: false, phoneVerified: false });
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(call[0])).toContain("/auth/v1/user");
    expect(new Headers(call[1].headers).get("authorization")).toBe("Bearer test-token");
    expect(new Headers(call[1].headers).get("apikey")).toBe("sb_publishable_test");
  });
  it("invalid/expired token produces 401, never a fabricated session", async () => {
    configured();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(
      { code: "bad_jwt", msg: "Expired token" }, { status: 401 },
    )));
    await expect(authenticate(new Request("http://localhost/api/v1/me", {
      headers: { authorization: "Bearer expired-token" },
    }))).rejects.toMatchObject({ status: 401 });
  });
  it("repository filters private profile reads by the authenticated actor", async () => {
    const fetchMock = vi.fn(async () => Response.json({ user_id: id, display_name: "Test", status: "active" }));
    configured();
    vi.stubGlobal("fetch", fetchMock);
    const client = userClient(readConfig(), "test-token");
    const repo = supabaseRepository(client, id);
    expect((await repo.getProfile())?.user_id).toBe(id);
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const url = new URL(String(call[0]));
    expect(url.searchParams.get("user_id")).toBe(`eq.${id}`);
    expect(url.searchParams.get("select")).toBe("user_id,display_name,status");
    expect(new Headers(call[1].headers).get("authorization")).toBe("Bearer test-token");
  });
  it("SQL errors never disclose the failing row/PII or SQL details", () => {
    const error = databaseError({ code: "23505", message: "Key (phone)=(private-phone) already exists" });
    expect(error.status).toBe(409);
    expect(error.message).not.toContain("phone");
    expect(databaseError({ code: "XX000", message: "secret" }).message).not.toContain("secret");
  });
});
