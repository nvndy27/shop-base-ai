import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createDatabase } from "../helpers/database";

describe("safe M1 deployed-schema verification script", () => {
  it("verifies deployed policies with real roles without changing persistent data", async () => {
    const db = await createDatabase();
    try {
      const sql = await readFile(new URL(
        "../../supabase/tests/verify_m1_deployment.sql", import.meta.url,
      ), "utf8");
      const results = await db.exec(sql);
      const rows = results.at(-1)?.rows;
      expect(rows).toHaveLength(6);
      expect(rows?.every((row) => row.rls_enabled === true)).toBe(true);
      expect((await db.query<{ count: number }>(
        "select count(*)::integer as count from auth.users",
      )).rows[0]?.count).toBe(8);
      expect((await db.query("select id from public.addresses")).rows).toHaveLength(0);
    } finally {
      await db.close();
    }
  });
});
