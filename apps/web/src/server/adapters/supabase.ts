import "server-only";
import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import {
  addressDto, profileDto, shopDto, z,
} from "@shop/contracts";
import { AppError } from "@shop/domain";
import { readConfig } from "../env";
import type { IdentityRepository, Session } from "../identity/types";

export function databaseError(error: Pick<PostgrestError, "code" | "message">): AppError {
  if (error.code === "23505") return new AppError(409, "CONFLICT", "Dữ liệu đã tồn tại.");
  if (error.code === "42501") return new AppError(403, "FORBIDDEN", "Thao tác không được phép.");
  if (error.code === "P0002") return new AppError(404, "NOT_FOUND", "Không tìm thấy tài nguyên.");
  if (error.code === "23514" || error.code === "22023") {
    return new AppError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.");
  }
  if (error.code === "P0001" && error.message === "INVALID_TRANSITION") {
    return new AppError(409, "INVALID_TRANSITION", "Chuyển trạng thái không hợp lệ.");
  }
  return new AppError(503, "SERVICE_UNAVAILABLE", "Dịch vụ dữ liệu tạm thời không khả dụng.");
}

function checked<T>(data: unknown, error: PostgrestError | null, schema: z.ZodType<T>): T {
  if (error) throw databaseError(error);
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(503, "SERVICE_UNAVAILABLE", "Phản hồi dịch vụ dữ liệu không hợp lệ.");
  }
  return result.data;
}
const addressFields = "id,recipient_name,phone,address_line,ward,district,province,is_default";
const shopFields = "id,name,slug,status";

export function supabaseRepository(client: SupabaseClient, actorId: string): IdentityRepository {
  return {
    async listMyShops() {
      const { data, error } = await client.from("shop_members")
        .select("shop:shops!inner(id,name,slug,status)")
        .eq("user_id", actorId).eq("active", true).order("shop_id");
      const rows = checked(data, error, z.array(z.strictObject({ shop: shopDto })));
      return rows.map(row => row.shop);
    },
    async getProfile() {
      const { data, error } = await client.from("profiles")
        .select("user_id,display_name,status").eq("user_id", actorId).maybeSingle();
      return checked(data, error, profileDto.nullable());
    },
    async updateProfile(input) {
      const { data, error } = await client.from("profiles")
        .update({ display_name: input.display_name }).eq("user_id", actorId)
        .select("user_id,display_name,status").maybeSingle();
      if (!error && !data) throw new AppError(403, "FORBIDDEN", "Thao tác không được phép.");
      return checked(data, error, profileDto);
    },
    async listAddresses() {
      const { data, error } = await client.from("addresses").select(addressFields)
        .eq("user_id", actorId).order("created_at").order("id");
      return checked(data, error, z.array(addressDto));
    },
    async createAddress(input) {
      const { data, error } = await client.rpc("create_address", { p_input: input });
      return checked(data, error, addressDto);
    },
    async updateAddress(input) {
      const { id, ...fields } = input;
      const { data, error } = await client.rpc("update_address", { p_id: id, p_input: fields });
      return checked(data, error, addressDto);
    },
    async deleteAddress(id) {
      const { error } = await client.rpc("delete_address", { p_id: id });
      if (error) throw databaseError(error);
    },
    async applyForShop(input) {
      const { data, error } = await client.rpc("apply_for_shop", {
        p_name: input.name, p_slug: input.slug,
      });
      return checked(data, error, shopDto);
    },
    async decideShop(id, input, requestId) {
      const { data, error } = await client.rpc("decide_shop", {
        p_id: id, p_decision: input.decision, p_reason: input.reason, p_request_id: requestId,
      });
      return checked(data, error, shopDto);
    },
    async getShopMembership(shopId) {
      const { data, error } = await client.from("shop_members")
        .select("role,active").eq("shop_id", shopId).eq("user_id", actorId).maybeSingle();
      const membership = checked(data, error, z.strictObject({
        role: z.enum(["owner", "catalog", "fulfillment"]), active: z.boolean(),
      }).nullable());
      if (!membership) return null;
      const shop = await client.from("shops").select(shopFields).eq("id", shopId).maybeSingle();
      const result = checked(shop.data, shop.error, shopDto.nullable());
      return result ? { ...membership, status: result.status } : null;
    },
  };
}

export function userClient(config: ReturnType<typeof readConfig>, token: string): SupabaseClient {
  // Never use a privileged key for requests on behalf of a user.
  return createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
    },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function authenticate(request: Request): Promise<Session> {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer ([^\s,]+)$/i);
  const token = match?.[1];
  if (!token || token.length > 8192) {
    throw new AppError(401, "UNAUTHENTICATED", "Vui lòng đăng nhập.");
  }
  const client = userClient(readConfig(), token);
  let result;
  try {
    result = await client.auth.getUser(token);
  } catch {
    throw new AppError(503, "SERVICE_UNAVAILABLE", "Dịch vụ xác thực tạm thời không khả dụng.");
  }
  if (result.error) {
    if (result.error.status === 429 || !result.error.status || result.error.status >= 500) {
      throw new AppError(503, "SERVICE_UNAVAILABLE", "Dịch vụ xác thực tạm thời không khả dụng.");
    }
    throw new AppError(401, "UNAUTHENTICATED", "Phiên đăng nhập không hợp lệ.");
  }
  const user = result.data.user;
  if (!user) throw new AppError(401, "UNAUTHENTICATED", "Phiên đăng nhập không hợp lệ.");
  return {
    actor: {
      id: user.id,
      verified: Boolean(user.email_confirmed_at || user.phone_confirmed_at),
      phoneVerified: Boolean(user.phone && user.phone_confirmed_at),
    },
    repository: supabaseRepository(client, user.id),
  };
}
