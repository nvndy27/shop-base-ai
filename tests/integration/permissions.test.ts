import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { addressFixture, createDatabase, setActor, shops, users } from "../helpers/database";

describe("M1 PostgreSQL RLS / grants / SECURITY DEFINER", () => {
  let db: PGlite;
  let addressA: string;
  beforeAll(async () => {
    db = await createDatabase();
    await setActor(db, users.buyerA);
    const result = await db.query<{ result: { id: string } }>(
      "select public.create_address($1) as result", [addressFixture],
    );
    addressA = result.rows[0]!.result.id;
  });
  afterAll(async () => { await db?.close(); });

  it("enables RLS on every application table", async () => {
    await db.exec("reset role");
    const result = await db.query<{ relname: string; relrowsecurity: boolean }>(
      "select relname,relrowsecurity from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname in ('public','private') and relkind='r'",
    );
    expect(result.rows).toHaveLength(6);
    expect(result.rows.every((row) => row.relrowsecurity)).toBe(true);
  });

  it("anon cannot read private tables, call write RPCs or helper functions", async () => {
    await setActor(db, null);
    for (const table of ["public.profiles", "public.addresses", "public.shops", "public.shop_members", "public.user_roles", "private.audit_logs"]) {
      await expect(db.query(`select * from ${table}`)).rejects.toMatchObject({ code: "42501" });
    }
    await expect(db.query("select public.apply_for_shop('Anon','anon-shop')")).rejects.toMatchObject({ code: "42501" });
    await expect(db.query("select public.create_address($1)", [addressFixture])).rejects.toMatchObject({ code: "42501" });
    await expect(db.query("select private.is_active()")).rejects.toMatchObject({ code: "42501" });
  });

  it("buyer A reads/updates only profile A; buyer B cannot read/update A", async () => {
    await setActor(db, users.buyerA);
    expect((await db.query("select user_id,display_name,status from public.profiles")).rows).toHaveLength(1);
    expect((await db.query("update public.profiles set display_name='Buyer A' where user_id=$1 returning user_id", [users.buyerA])).rows).toHaveLength(1);
    await setActor(db, users.buyerB);
    expect((await db.query("select user_id from public.profiles where user_id=$1", [users.buyerA])).rows).toHaveLength(0);
    expect((await db.query("update public.profiles set display_name='Intruder' where user_id=$1 returning user_id", [users.buyerA])).rows).toHaveLength(0);
  });

  it("profile INSERT/DELETE and protected-column UPDATE are denied, including own row", async () => {
    await setActor(db, users.buyerA);
    await expect(db.query("insert into public.profiles(user_id) values ($1)", [users.buyerA])).rejects.toMatchObject({ code: "42501" });
    await expect(db.query("delete from public.profiles where user_id=$1", [users.buyerA])).rejects.toMatchObject({ code: "42501" });
    await expect(db.query("update public.profiles set status='active'")).rejects.toMatchObject({ code: "42501" });
    await expect(db.query("update public.profiles set user_id=$1", [users.buyerB])).rejects.toMatchObject({ code: "42501" });
  });

  it("addresses allow own CRUD through atomic RPCs; B cannot read/update/delete A", async () => {
    await setActor(db, users.buyerB);
    expect((await db.query("select id from public.addresses where id=$1", [addressA])).rows).toHaveLength(0);
    await expect(db.query("select public.update_address($1,$2)", [addressA, { province: "Tỉnh khác" }])).rejects.toMatchObject({ code: "P0002" });
    await expect(db.query("select public.delete_address($1)", [addressA])).rejects.toMatchObject({ code: "P0002" });
    await setActor(db, users.buyerA);
    const updated = await db.query<{ result: { province: string } }>(
      "select public.update_address($1,$2) as result", [addressA, { province: "Tỉnh cập nhật" }],
    );
    expect(updated.rows[0]!.result.province).toBe("Tỉnh cập nhật");
    const own = await db.query<{ result: { id: string } }>(
      "select public.create_address($1) as result", [{ ...addressFixture, is_default: false }],
    );
    await db.query("select public.delete_address($1)", [own.rows[0]!.result.id]);
    expect((await db.query("select id from public.addresses where id=$1", [own.rows[0]!.result.id])).rows).toHaveLength(0);
  });

  it("direct address INSERT/UPDATE/DELETE are denied; RPC rejects owner mass assignment", async () => {
    await setActor(db, users.buyerA);
    await expect(db.query("insert into public.addresses(user_id) values ($1)", [users.buyerB])).rejects.toMatchObject({ code: "42501" });
    await expect(db.query("update public.addresses set user_id=$1", [users.buyerB])).rejects.toMatchObject({ code: "42501" });
    await expect(db.query("delete from public.addresses")).rejects.toMatchObject({ code: "42501" });
    await expect(db.query("select public.create_address($1)", [{ ...addressFixture, user_id: users.buyerB }])).rejects.toMatchObject({ code: "22023" });
    await expect(db.query("select public.update_address($1,$2)", [addressA, { user_id: users.buyerB }])).rejects.toMatchObject({ code: "22023" });
    await expect(db.query("select public.update_address($1,$2)", [addressA, { phone: null }])).rejects.toMatchObject({ code: "22023" });
  });

  it("default-address switch is atomic and failed validation preserves prior default", async () => {
    await setActor(db, users.buyerA);
    const created = await db.query<{ result: { id: string } }>(
      "select public.create_address($1) as result", [addressFixture],
    );
    const defaults = await db.query<{ id: string }>("select id from public.addresses where is_default");
    expect(defaults.rows).toEqual([{ id: created.rows[0]!.result.id }]);
    await expect(db.query("select public.create_address($1)", [{ ...addressFixture, phone: "invalid" }])).rejects.toMatchObject({ code: "23514" });
    expect((await db.query("select id from public.addresses where is_default")).rows).toEqual(defaults.rows);
  });

  it("address RLS independently allows own DML and blocks other owners even if DML grants expand", async () => {
    // Test-only temporary grants to distinguish RLS enforcement from missing privileges.
    await db.exec("reset role; grant insert,update,delete on public.addresses to authenticated");
    try {
      await setActor(db, users.buyerB);
      await expect(db.query(
        "insert into public.addresses(user_id,recipient_name,phone,address_line,ward,district,province) values ($1,'Test','+84900000000','Test','Test','Test','Test')",
        [users.buyerA],
      )).rejects.toMatchObject({ code: "42501" });
      expect((await db.query(
        "update public.addresses set province='Forged' where id=$1 returning id", [addressA],
      )).rows).toHaveLength(0);
      expect((await db.query("delete from public.addresses where id=$1 returning id", [addressA])).rows).toHaveLength(0);
      const own = await db.query<{ id: string }>(
        "insert into public.addresses(user_id,recipient_name,phone,address_line,ward,district,province) values ($1,'Test','+84900000000','Test','Test','Test','Test') returning id",
        [users.buyerB],
      );
      const id = own.rows[0]!.id;
      await expect(db.query("update public.addresses set user_id=$1 where id=$2", [users.buyerA, id]))
        .rejects.toMatchObject({ code: "42501" });
      expect((await db.query("update public.addresses set province='Updated' where id=$1 returning id", [id])).rows).toHaveLength(1);
      expect((await db.query("delete from public.addresses where id=$1 returning id", [id])).rows).toHaveLength(1);
    } finally {
      await db.exec("reset role; revoke insert,update,delete on public.addresses from authenticated");
    }
  });

  it("seller A cannot read shop B; pending applications create owner membership without activating", async () => {
    await setActor(db, users.sellerA);
    expect((await db.query("select id,name,slug,status from public.shops where id=$1", [shops.b])).rows).toHaveLength(0);
    const result = await db.query<{ result: { id: string; status: string } }>(
      "select public.apply_for_shop('Pending A','pending-a') as result",
    );
    expect(result.rows[0]!.result.status).toBe("pending");
    const memberships = await db.query<{ role: string }>("select role from public.shop_members where shop_id=$1", [result.rows[0]!.result.id]);
    expect(memberships.rows).toEqual([{ role: "owner" }]);
    expect((await db.query<{ allowed: boolean }>(
      "select private.has_shop_permission($1,'catalog:write') as allowed", [result.rows[0]!.result.id],
    )).rows[0]!.allowed).toBe(false);
  });

  it("seller cannot assign membership, change owner/status, grant role, or forge audit", async () => {
    await setActor(db, users.sellerA);
    const denied = [
      "insert into public.shop_members(shop_id,user_id,role) values ($1,$2,'owner')",
      "update public.shop_members set role='owner' where shop_id=$1",
      "delete from public.shop_members where shop_id=$1",
      "update public.shops set owner_user_id=$2 where id=$1",
      "update public.shops set status='active' where id=$1",
      "insert into public.shops(id,owner_user_id,slug,name) values ($1,$2,'forged','Forged')",
      "delete from public.shops where id=$1",
      "insert into public.user_roles(user_id,permission) values ($2,'shops:moderate')",
      "update public.user_roles set permission='shops:moderate' where user_id=$2",
      "delete from public.user_roles where user_id=$2",
      "insert into private.audit_logs(actor,resource_id) values ($2,$1)",
      "update private.audit_logs set actor=$2 where resource_id=$1",
      "delete from private.audit_logs where resource_id=$1",
    ];
    for (const sql of denied) {
      // PostgreSQL accepts the unused $1/$2 slots only when referenced; trim arguments accordingly.
      const parameters = sql.includes("$2") ? [shops.b, users.sellerA] : [shops.b];
      // For statements referencing only $2 provide a harmless explicitly typed $1.
      const typedSql = sql.includes("$2") && !sql.includes("$1")
        ? sql.replace("$2", "$1") : sql;
      await expect(db.query(typedSql, sql.includes("$2") && !sql.includes("$1") ? [users.sellerA] : parameters))
        .rejects.toMatchObject({ code: "42501" });
    }
  });

  it("shop permission respects shop scope, granular staff role, revocation and suspension", async () => {
    const allowed = async (shopId: string, permission: string) =>
      (await db.query<{ allowed: boolean }>(
        "select private.has_shop_permission($1,$2) as allowed", [shopId, permission],
      )).rows[0]!.allowed;
    await setActor(db, users.sellerA);
    expect(await allowed(shops.a, "orders:read")).toBe(true);
    expect(await allowed(shops.b, "orders:read")).toBe(false);
    await setActor(db, users.staff);
    expect(await allowed(shops.a, "catalog:write")).toBe(true);
    expect(await allowed(shops.a, "orders:read")).toBe(false);
    await db.exec("reset role");
    await db.query("update public.shop_members set active=false where user_id=$1", [users.staff]);
    await setActor(db, users.staff);
    expect(await allowed(shops.a, "catalog:write")).toBe(false);
    expect((await db.query("select id from public.shops where id=$1", [shops.a])).rows).toHaveLength(0);
    await db.exec("reset role");
    await db.query("update public.shops set status='suspended' where id=$1", [shops.b]);
    await setActor(db, users.sellerB);
    expect(await allowed(shops.b, "catalog:write")).toBe(false);
    // Suspension stops new catalog work but does not erase access to existing orders.
    expect(await allowed(shops.b, "orders:read")).toBe(true);
    await db.exec("reset role");
    await db.query("update public.shops set status='active' where id=$1", [shops.b]);
  });

  it("metadata cannot grant moderator permission; unverified identity cannot create shop", async () => {
    await db.exec("reset role");
    await db.query("update auth.users set raw_user_meta_data=$1 where id=$2", [{ role: "admin", permissions: ["shops:moderate"] }, users.buyerB]);
    await setActor(db, users.buyerB, "aal2");
    expect((await db.query<{ allowed: boolean }>(
      "select private.has_permission('shops:moderate') as allowed",
    )).rows[0]!.allowed).toBe(false);
    await expect(db.query("select public.decide_shop($1,'suspended','Test reason',$2)", [shops.a, users.buyerB])).rejects.toMatchObject({ code: "42501" });
    await setActor(db, users.unverified);
    await expect(db.query("select public.apply_for_shop('Unverified','unverified')")).rejects.toMatchObject({ code: "42501" });
  });

  it("finance and moderator without MFA cannot approve; moderator with AAL2 commits audit", async () => {
    await setActor(db, users.sellerB);
    const result = await db.query<{ result: { id: string } }>("select public.apply_for_shop('Approval','approval-shop') as result");
    const id = result.rows[0]!.result.id;
    await setActor(db, users.finance, "aal2");
    await expect(db.query("select public.decide_shop($1,'active','Reviewed',$2)", [id, users.finance])).rejects.toMatchObject({ code: "42501" });
    await setActor(db, users.moderator);
    await expect(db.query("select public.decide_shop($1,'active','Reviewed',$2)", [id, users.moderator])).rejects.toMatchObject({ code: "42501" });
    await setActor(db, users.moderator, "aal2");
    await db.query("select public.decide_shop($1,'active','Reviewed',$2)", [id, users.moderator]);
    await expect(db.query("select public.decide_shop($1,'active','Duplicate',$2)", [id, users.moderator])).rejects.toMatchObject({ code: "P0001" });
    expect((await db.query("select id from private.audit_logs")).rows).toHaveLength(0);
    await db.exec("reset role");
    const audit = await db.query<{ before_data: unknown; after_data: unknown }>(
      "select before_data,after_data from private.audit_logs where resource_id=$1", [id],
    );
    expect(audit.rows).toEqual([{ before_data: { status: "pending" }, after_data: { status: "active" } }]);
  });

  it("moderator cannot approve own shop and audit permission is separate from moderation", async () => {
    await setActor(db, users.moderator, "aal2");
    const own = await db.query<{ result: { id: string } }>(
      "select public.apply_for_shop('Moderator shop','moderator-shop') as result",
    );
    await expect(db.query(
      "select public.decide_shop($1,'active','Reviewed',$2)", [own.rows[0]!.result.id, users.moderator],
    )).rejects.toMatchObject({ code: "P0002" });
    expect((await db.query("select id from private.audit_logs")).rows).toHaveLength(0);
    await db.exec("reset role");
    await db.query("insert into public.user_roles(user_id,permission) values ($1,'audit:read')", [users.finance]);
    await setActor(db, users.finance, "aal2");
    expect((await db.query("select id from private.audit_logs")).rows).toHaveLength(1);
    expect((await db.query<{ allowed: boolean }>(
      "select private.has_permission('shops:moderate') as allowed",
    )).rows[0]!.allowed).toBe(false);
  });

  it("authenticated database role without a subject has no resource permission", async () => {
    await setActor(db, null);
    await db.exec("set role authenticated");
    expect((await db.query("select id from public.addresses")).rows).toHaveLength(0);
    await expect(db.query("select public.create_address($1)", [addressFixture])).rejects.toMatchObject({ code: "42501" });
  });

  it("banned user is blocked even with an unchanged JWT subject", async () => {
    await db.exec("reset role");
    await db.query("update public.profiles set status='banned' where user_id=$1", [users.buyerB]);
    await setActor(db, users.buyerB);
    expect((await db.query("select user_id from public.profiles")).rows).toHaveLength(0);
    expect((await db.query("select id from public.addresses")).rows).toHaveLength(0);
    await expect(db.query("select public.create_address($1)", [addressFixture])).rejects.toMatchObject({ code: "42501" });
    await expect(db.query("select public.apply_for_shop('Banned','banned-shop')")).rejects.toMatchObject({ code: "42501" });
  });

  it("no internal mutation helper is executable by users and every definer has a fixed search_path", async () => {
    await db.exec("reset role");
    const rows = await db.query<{ name: string; allowed: boolean }>(
      "select p.proname as name,has_function_privilege('authenticated',p.oid,'execute') as allowed from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in ('require_active','create_profile','validate_address_input','address_dto','shop_dto')",
    );
    expect(rows.rows).toHaveLength(5);
    expect(rows.rows.every((row) => !row.allowed)).toBe(true);
    const functions = await db.query<{ proconfig: string[] | null }>(
      "select proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and prosecdef",
    );
    expect(functions.rows.length).toBeGreaterThan(5);
    expect(functions.rows.every((row) => row.proconfig?.includes('search_path=\"\"'))).toBe(true);
  });
});
