import { describe, expect, it } from "vitest";
import { createHandler } from "../../apps/web/src/server/http";
import { AppError } from "@shop/domain";
import type { Session } from "../../apps/web/src/server/identity/types";

const id = "10000000-0000-4000-8000-000000000001";
function handler(phoneVerified: boolean, status: "active" | "banned" = "active", verified = true) {
  const session: Session = {
    actor: { id, verified, phoneVerified },
    repository: {
      async getProfile() { return { user_id: id, display_name: "Test", status }; },
    } as Session["repository"],
  };
  return createHandler({
    appOrigin: () => "http://localhost:3000",
    async authenticate(request) {
      if (!request.headers.has("authorization")) throw new AppError(401, "UNAUTHENTICATED", "Đăng nhập");
      return session;
    },
  });
}
function request(headers: Record<string, string> = { authorization: "Bearer fixture" }) {
  return new Request("http://localhost:3000/api/v1/me/purchase-eligibility?phoneVerified=true", { headers });
}
describe("purchase eligibility server boundary", () => {
  it("allows email-only active users without trusting client phone claims", async () => {
    const response = await handler(false)(request({ authorization: "Bearer fixture", "x-phone-verified": "true" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ eligible: true });
  });
  it("rejects an unconfirmed identity even with a client phone claim", async () => {
    const response = await handler(false, "active", false)(request({ authorization: "Bearer fixture", "x-phone-verified": "true" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "IDENTITY_UNVERIFIED" } });
  });
  it("allows active accounts with an Auth-verified phone without exposing the number", async () => {
    const response = await handler(true)(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ eligible: true });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("denies anonymous and banned accounts even with a verified phone", async () => {
    expect((await handler(true)(request({}))).status).toBe(401);
    const banned = await handler(true, "banned")(request());
    expect(banned.status).toBe(403);
    expect(await banned.json()).toMatchObject({ error: { code: "ACCOUNT_INACTIVE" } });
  });
});
