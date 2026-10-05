import { describe, expect, it } from "vitest";
import { addressInput, addressPatch, profilePatch, shopApplication, shopDecision } from "@shop/contracts";
import { hasShopPermission } from "@shop/domain";

describe("strict M1 request contracts", () => {
  it.each(["role", "status", "user_id", "owner_user_id", "phone", "email"])(
    "rejects protected profile property %s", (property) => {
      expect(profilePatch.safeParse({ display_name: "Test", [property]: "forged" }).success).toBe(false);
    },
  );
  it("trims names but rejects empty names", () => {
    expect(profilePatch.parse({ display_name: "  Test  " })).toEqual({ display_name: "Test" });
    expect(profilePatch.safeParse({ display_name: "  " }).success).toBe(false);
  });
  it("requires E.164 phone and rejects arbitrary address ownership", () => {
    const data = { recipient_name: "Test", phone: "0900000000", address_line: "Test", ward: "Test", district: "Test", province: "Test" };
    expect(addressInput.safeParse(data).success).toBe(false);
    expect(addressInput.safeParse({ ...data, phone: "+84900000000", user_id: "forged" }).success).toBe(false);
  });
  it("rejects address patch without mutable fields", () => {
    expect(addressPatch.safeParse({ id: "10000000-0000-4000-8000-000000000001" }).success).toBe(false);
  });
  it("does not default is_default on partial updates", () => {
    expect(addressPatch.parse({
      id: "10000000-0000-4000-8000-000000000001", province: "Test",
    })).not.toHaveProperty("is_default");
  });
  it("application cannot choose shop status/owner/membership", () => {
    for (const key of ["status", "owner_user_id", "role", "members"]) {
      expect(shopApplication.safeParse({ name: "Test", slug: "test-shop", [key]: "forged" }).success).toBe(false);
    }
  });
  it("moderation requires a reason and allowlisted target status", () => {
    expect(shopDecision.safeParse({ decision: "published", reason: "Reviewed" }).success).toBe(false);
    expect(shopDecision.safeParse({ decision: "active", reason: "  " }).success).toBe(false);
  });
});

describe("shop permission matrix", () => {
  it("owner has shop-local permissions but catalog staff cannot read orders", () => {
    expect(hasShopPermission({ role: "owner", active: true }, "orders:read")).toBe(true);
    expect(hasShopPermission({ role: "catalog", active: true }, "orders:read")).toBe(false);
    expect(hasShopPermission({ role: "fulfillment", active: true }, "catalog:write")).toBe(false);
  });
  it("revoked owner has no permissions", () => {
    expect(hasShopPermission({ role: "owner", active: false }, "orders:read")).toBe(false);
  });
});
