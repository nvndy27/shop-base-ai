import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { addressDto, profileDto, shopDto, z } from "@shop/contracts";
import { databaseError } from "../../apps/web/src/server/adapters/supabase";
import type { IdentityRepository, Session } from "../../apps/web/src/server/identity/types";

export const users = {
  buyerA: "10000000-0000-4000-8000-000000000001",
  buyerB: "10000000-0000-4000-8000-000000000002",
  sellerA: "10000000-0000-4000-8000-000000000003",
  sellerB: "10000000-0000-4000-8000-000000000004",
  staff: "10000000-0000-4000-8000-000000000005",
  moderator: "10000000-0000-4000-8000-000000000006",
  finance: "10000000-0000-4000-8000-000000000007",
  unverified: "10000000-0000-4000-8000-000000000008",
};
export const shops = {
  a: "20000000-0000-4000-8000-000000000001",
  b: "20000000-0000-4000-8000-000000000002",
};
export const addressFixture = {
  recipient_name: "Người nhận thử",
  phone: "+84900000000",
  address_line: "Địa chỉ giả phục vụ test",
  ward: "Phường thử",
  district: "Quận thử",
  province: "Tỉnh thử",
  is_default: true,
};

export async function createDatabase() {
  const db = new PGlite();
  await db.exec(await readFile(new URL("../../supabase/tests/bootstrap.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL(
    "../../supabase/migrations/202610010001_identity_and_shops.sql", import.meta.url,
  ), "utf8"));
  for (const id of Object.values(users)) {
    await db.query(
      "insert into auth.users(id, email_confirmed_at) values ($1, $2)",
      [id, id === users.unverified ? null : "2026-10-01T00:00:00Z"],
    );
  }
  await db.query(
    "insert into public.user_roles(user_id, permission) values ($1, 'shops:moderate'), ($2, 'finance:refund')",
    [users.moderator, users.finance],
  );
  await db.query(
    "insert into public.shops(id, owner_user_id, name, slug, status) values ($1,$2,'Shop A','shop-a','active'), ($3,$4,'Shop B','shop-b','active')",
    [shops.a, users.sellerA, shops.b, users.sellerB],
  );
  await db.query(
    "insert into public.shop_members(shop_id,user_id,role) values ($1,$2,'owner'),($3,$4,'owner'),($1,$5,'catalog')",
    [shops.a, users.sellerA, shops.b, users.sellerB, users.staff],
  );
  return db;
}

export async function setActor(db: PGlite, id: string | null, aal = "aal1") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims', $1, false)", [
    JSON.stringify({ sub: id, role: id ? "authenticated" : "anon", aal }),
  ]);
  await db.exec(id ? "set role authenticated" : "set role anon");
}

/** SQL-backed repository for HTTP tests, not a mock permission implementation. */
export function databaseSession(db: PGlite, id: string, verified = true): Session {
  async function query<T>(sql: string, parameters: unknown[], schema: z.ZodType<T>) {
    try {
      const result = await db.query(sql, parameters);
      return schema.parse(result.rows);
    } catch (error) {
      if (typeof error === "object" && error && "code" in error &&
          typeof error.code === "string") {
        const message = "message" in error && typeof error.message === "string" ? error.message : "";
        throw databaseError({ code: error.code, message });
      }
      throw error;
    }
  }
  async function rpc<T>(sql: string, parameters: unknown[], schema: z.ZodType<T>) {
    const rows = await query(sql, parameters, z.array(z.strictObject({ result: schema })));
    const first = rows[0];
    if (!first) throw new Error("Missing SQL result");
    return first.result;
  }
  const repository: IdentityRepository = {
    async listMyShops() {
      return query(
        "select s.id,s.name,s.slug,s.status from public.shop_members m join public.shops s on s.id=m.shop_id where m.user_id=$1 and m.active=true order by s.id",
        [id], z.array(shopDto),
      );
    },
    async getProfile() {
      const rows = await query(
        "select user_id,display_name,status from public.profiles where user_id=$1",
        [id], z.array(profileDto),
      );
      return rows[0] ?? null;
    },
    async updateProfile(input) {
      const rows = await query(
        "update public.profiles set display_name=$1 where user_id=$2 returning user_id,display_name,status",
        [input.display_name, id], z.array(profileDto),
      );
      const first = rows[0];
      if (!first) throw new Error("Missing profile");
      return first;
    },
    async listAddresses() {
      return query(
        "select id,recipient_name,phone,address_line,ward,district,province,is_default from public.addresses where user_id=$1 order by created_at,id",
        [id], z.array(addressDto),
      );
    },
    createAddress: (input) => rpc("select public.create_address($1) as result", [input], addressDto),
    updateAddress: ({ id: addressId, ...input }) =>
      rpc("select public.update_address($1,$2) as result", [addressId, input], addressDto),
    async deleteAddress(addressId) {
      await db.query("select public.delete_address($1)", [addressId]).catch((error: unknown) => {
        if (typeof error === "object" && error && "code" in error && typeof error.code === "string") {
          throw databaseError({ code: error.code, message: "" });
        }
        throw error;
      });
    },
    applyForShop: (input) => rpc("select public.apply_for_shop($1,$2) as result", [input.name, input.slug], shopDto),
    decideShop: (shopId, input, requestId) => rpc(
      "select public.decide_shop($1,$2,$3,$4) as result",
      [shopId, input.decision, input.reason, requestId], shopDto,
    ),
    async getShopMembership(shopId) {
      const rows = await query(
        "select m.role,m.active,s.status from public.shop_members m join public.shops s on s.id=m.shop_id where m.shop_id=$1 and m.user_id=$2",
        [shopId, id], z.array(z.strictObject({
          role: z.enum(["owner", "catalog", "fulfillment"]), active: z.boolean(),
          status: z.enum(["pending", "active", "rejected", "suspended", "closed"]),
        })),
      );
      return rows[0] ?? null;
    },
  };
  return { actor: { id, verified, phoneVerified: false }, repository };
}
