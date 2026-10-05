import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { AppError } from "@shop/domain";
import { errorEnvelope } from "@shop/contracts";
import { createHandler } from "../../apps/web/src/server/http";
import { identityService } from "../../apps/web/src/server/identity/service";
import { addressFixture, createDatabase, databaseSession, setActor, shops, users } from "../helpers/database";

describe("M1 HTTP contract with real SQL authorization", () => {
  let db: PGlite;
  let handler: ReturnType<typeof createHandler>;
  beforeAll(async () => {
    db = await createDatabase();
    handler = createHandler({
      appOrigin: () => "http://localhost:3000",
      // Test-only identities, not a production auth shortcut.
      async authenticate(request) {
        const id = request.headers.get("authorization")?.replace("Bearer ", "");
        if (!id || !Object.values(users).includes(id)) {
          throw new AppError(401, "UNAUTHENTICATED", "Vui lòng đăng nhập.");
        }
        await setActor(db, id, request.headers.get("x-test-aal") ?? "aal1");
        return databaseSession(db, id, id !== users.unverified);
      },
    });
  });
  afterAll(async () => { await db?.close(); });
  function request(path: string, method: string, actor?: string, body?: unknown, extra: Record<string, string> = {}) {
    return handler(new Request(`http://localhost:3000/api/v1${path}`, {
      method,
      headers: {
        ...(actor ? { authorization: `Bearer ${actor}` } : {}),
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...extra,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }));
  }

  it("missing session returns agreed error envelope and private no-store", async () => {
    const response = await request("/me", "GET");
    expect(response.status).toBe(401);
    const data = errorEnvelope.parse(await response.json());
    expect(data.error.code).toBe("UNAUTHENTICATED");
    expect(response.headers.get("X-Request-Id")).toBe(data.error.request_id);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("profile read/update succeeds for actor and refuses role/status mass assignment", async () => {
    expect((await request("/me", "PATCH", users.buyerA, { display_name: "Buyer A" })).status).toBe(200);
    const profile = await request("/me", "GET", users.buyerA);
    expect(await profile.json()).toEqual({ user_id: users.buyerA, display_name: "Buyer A", status: "active" });
    const denied = await request("/me", "PATCH", users.buyerA, { display_name: "Intruder", role: "admin", status: "active" });
    expect(denied.status).toBe(422);
    expect(await (await request("/me", "GET", users.buyerA)).json()).toMatchObject({ display_name: "Buyer A" });
  });
  it("purchase eligibility requires an active SQL profile and an Auth-verified phone", async () => {
    expect((await request("/me/purchase-eligibility", "GET")).status).toBe(401);
    const emailOnly = await request("/me/purchase-eligibility", "GET", users.buyerA);
    expect(emailOnly.status).toBe(403);
    expect(await emailOnly.json()).toMatchObject({ error: { code: "PHONE_REQUIRED" } });
    await setActor(db, users.buyerA);
    const session = databaseSession(db, users.buyerA);
    session.actor.phoneVerified = true; // Auth transport fixture, never a client-controlled field.
    await expect(identityService(session).requirePurchaseEligibility()).resolves.toBeUndefined();
  });
  it("B cannot read/update/delete A's address and unknown UUID behaves identically", async () => {
    const created = await request("/me/addresses", "POST", users.buyerA, addressFixture);
    expect(created.status).toBe(201);
    const address = await created.json() as { id: string };
    expect(await (await request("/me/addresses", "GET", users.buyerB)).json()).toEqual({ items: [] });
    for (const id of [address.id, "99999999-0000-4000-8000-000000000001"]) {
      const patch = await request("/me/addresses", "PATCH", users.buyerB, { id, province: "Forged" });
      expect(patch.status).toBe(404);
      expect((await patch.json() as { error: { code: string } }).error.code).toBe("NOT_FOUND");
      expect((await request("/me/addresses", "DELETE", users.buyerB, { id })).status).toBe(404);
    }
    expect((await request("/me/addresses", "PATCH", users.buyerA, { id: address.id, province: "Updated" })).status).toBe(200);
    const deleted = await request("/me/addresses", "DELETE", users.buyerA, { id: address.id });
    expect(deleted.status).toBe(204);
    expect(await deleted.text()).toBe("");
  });
  it("address owner injection, invalid JSON, content type and oversized body return validation errors", async () => {
    expect((await request("/me/addresses", "POST", users.buyerA, { ...addressFixture, user_id: users.buyerB })).status).toBe(422);
    expect((await handler(new Request("http://localhost:3000/api/v1/me", {
      method: "PATCH", headers: { authorization: `Bearer ${users.buyerA}`, "content-type": "application/json" },
      body: "{broken",
    }))).status).toBe(422);
    expect((await request("/me", "PATCH", users.buyerA, { display_name: "Test" }, { "content-type": "text/plain" })).status).toBe(422);
    expect((await request("/me", "PATCH", users.buyerA, { display_name: "x".repeat(17000) })).status).toBe(422);
  });
  it("shop applications are pending, cannot forge owner/status; unverified user denied", async () => {
    const response = await request("/shop-applications", "POST", users.sellerA, { name: "New shop", slug: "http-new-shop" });
    expect(response.status).toBe(201);
    const result = await response.json();
    expect(result).toMatchObject({ name: "New shop", status: "pending" });
    expect(result).not.toHaveProperty("owner_user_id");
    const mine = await request("/me/shops", "GET", users.sellerA);
    expect(mine.status).toBe(200);
    expect(mine.headers.get("cache-control")).toBe("no-store");
    expect(await mine.json()).toMatchObject({ items: expect.arrayContaining([result]) });
    expect((await request("/shop-applications", "POST", users.sellerB, {
      name: "Forged", slug: "forged", status: "active", owner_user_id: users.sellerA,
    })).status).toBe(422);
    expect((await request("/shop-applications", "POST", users.unverified, {
      name: "Unverified", slug: "unverified",
    })).status).toBe(403);
  });
  it("shop listing is scoped to the active actor, including when an owner is forged in the URL", async () => {
    expect((await request("/me/shops", "GET")).status).toBe(401);
    expect(await (await request(`/me/shops?user_id=${users.sellerA}`, "GET", users.buyerA)).json()).toEqual({ items: [] });
    const response = await request("/me/shops", "GET", users.sellerB);
    expect(await response.json()).toMatchObject({ items: [{ id: shops.b }] });
    expect((await request("/me/shops", "POST", users.sellerA, {})).status).toBe(405);
  });
  it("non-moderator / non-MFA denied; valid moderator decision commits and invalid transition is 409", async () => {
    const created = await request("/shop-applications", "POST", users.sellerB, { name: "Approval", slug: "http-approval" });
    const shop = await created.json() as { id: string };
    const path = `/admin/shops/${shop.id}/decision`;
    const payload = { decision: "active", reason: "Reviewed for test" };
    expect((await request(path, "POST", users.sellerA, payload, { "x-test-aal": "aal2" })).status).toBe(403);
    expect((await request(path, "POST", users.finance, payload, { "x-test-aal": "aal2" })).status).toBe(403);
    expect((await request(path, "POST", users.moderator, payload)).status).toBe(403);
    expect((await request(path, "POST", users.moderator, payload, { "x-test-aal": "aal2" })).status).toBe(200);
    expect((await request(path, "POST", users.moderator, payload, { "x-test-aal": "aal2" })).status).toBe(409);
  });
  it("service refuses cross-shop, insufficient staff permission, and revoked staff", async () => {
    await setActor(db, users.sellerA);
    const seller = identityService(databaseSession(db, users.sellerA));
    await expect(seller.requireShopPermission(shops.a, "orders:read")).resolves.toBeUndefined();
    await expect(seller.requireShopPermission(shops.b, "orders:read")).rejects.toMatchObject({ status: 404 });
    await setActor(db, users.staff);
    const staff = identityService(databaseSession(db, users.staff));
    await expect(staff.requireShopPermission(shops.a, "catalog:write")).resolves.toBeUndefined();
    await expect(staff.requireShopPermission(shops.a, "orders:read")).rejects.toMatchObject({ status: 404 });
    await db.exec("reset role");
    await db.query("update public.shop_members set active=false where user_id=$1", [users.staff]);
    await setActor(db, users.staff);
    await expect(staff.requireShopPermission(shops.a, "catalog:write")).rejects.toMatchObject({ status: 404 });
    expect(await staff.myShops()).toEqual([]);
  });
  it("suspended shop blocks catalog but retains scoped existing-order access", async () => {
    await db.exec("reset role");
    await db.query("update public.shops set status='suspended' where id=$1", [shops.b]);
    await setActor(db, users.sellerB);
    const seller = identityService(databaseSession(db, users.sellerB));
    await expect(seller.requireShopPermission(shops.b, "catalog:write")).rejects.toMatchObject({ code: "SHOP_SUSPENDED" });
    await expect(seller.requireShopPermission(shops.b, "orders:read")).resolves.toBeUndefined();
  });
  it("ban takes effect on the next request with the same token", async () => {
    expect((await request("/me", "GET", users.buyerB)).status).toBe(200);
    await db.exec("reset role");
    await db.query("update public.profiles set status='banned' where user_id=$1", [users.buyerB]);
    expect((await request("/me", "GET", users.buyerB)).status).toBe(403);
    expect((await request("/me/addresses", "POST", users.buyerB, addressFixture)).status).toBe(403);
    expect((await request("/me/shops", "GET", users.buyerB)).status).toBe(403);
  });
  it("rejects foreign Origin, does not accept cookies, and preserves unsupported paths/methods", async () => {
    expect((await request("/me", "PATCH", users.buyerA, { display_name: "Forged" }, {
      origin: "https://evil.invalid",
    })).status).toBe(403);
    expect((await request("/me", "GET", undefined, undefined, { cookie: "session=forged" })).status).toBe(401);
    expect((await request("/me", "PUT", users.buyerA, {})).status).toBe(405);
    expect((await request("/orders", "POST", users.buyerA, {})).status).toBe(404);
  });
  it("unexpected provider error is redacted rather than reported as success", async () => {
    const unavailable = createHandler({
      appOrigin: () => "http://localhost:3000",
      async authenticate() { throw new Error("token=private address=private"); },
    });
    const result = await unavailable(new Request("http://localhost:3000/api/v1/me"));
    expect(result.status).toBe(503);
    const body = await result.text();
    expect(body).not.toContain("token=");
    expect(body).not.toContain("address=");
  });
});
