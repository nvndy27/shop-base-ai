import { randomUUID } from "node:crypto";
import { AppError } from "@shop/domain";
import {
  addressDelete, addressInput, addressPatch, profilePatch, resourceId, shopApplication, shopDecision, z,
} from "@shop/contracts";
import { identityService } from "./identity/service";
import type { Session } from "./identity/types";

const maxBodyBytes = 16384;
type Dependencies = {
  authenticate: (request: Request) => Promise<Session>;
  appOrigin: () => string;
};

export async function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (!request.headers.get("content-type")?.match(/^application\/json(?:\s*;|$)/i)) {
    throw new AppError(422, "VALIDATION_ERROR", "Yêu cầu phải dùng JSON.");
  }
  // Read a bounded stream; Content-Length is not trusted.
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(422, "VALIDATION_ERROR", "Thiếu nội dung JSON.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBodyBytes) {
        await reader.cancel();
        throw new AppError(422, "VALIDATION_ERROR", "Nội dung yêu cầu quá lớn.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError(422, "VALIDATION_ERROR", "JSON không hợp lệ.");
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    const fields: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const field = issue.path.map(String).join(".") || "body";
      // Do not echo input values or unknown field names containing PII.
      (fields[field] ??= []).push("Dữ liệu không hợp lệ.");
    }
    throw new AppError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", fields);
  }
  return result.data;
}

export function createHandler(dependencies: Dependencies) {
  return async (request: Request): Promise<Response> => {
    const requestId = randomUUID();
    const headers = new Headers({
      "X-Request-Id": requestId,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Vary": "Origin",
    });
    function json(data: unknown, status = 200) {
      return Response.json(data, { status, headers });
    }
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      const method = request.method;
      const decisionMatch = path.match(/^\/api\/v1\/admin\/shops\/([^/]+)\/decision$/);
      if (!["/api/v1/me", "/api/v1/me/shops", "/api/v1/me/addresses", "/api/v1/me/purchase-eligibility", "/api/v1/shop-applications"].includes(path) &&
          !decisionMatch) {
        throw new AppError(404, "NOT_FOUND", "Không tìm thấy endpoint.");
      }
      const allowed = path === "/api/v1/me" ? ["GET", "PATCH"] :
        ["/api/v1/me/purchase-eligibility", "/api/v1/me/shops"].includes(path) ? ["GET"] :
        path === "/api/v1/me/addresses" ? ["GET", "POST", "PATCH", "DELETE"] : ["POST"];
      if (!allowed.includes(method)) {
        headers.set("Allow", allowed.join(", "));
        throw new AppError(405, "METHOD_NOT_ALLOWED", "Phương thức không được hỗ trợ.");
      }
      // No cookie authentication is accepted. Bearer requests from native clients may omit Origin.
      const origin = request.headers.get("origin");
      if (origin && origin !== dependencies.appOrigin()) {
        throw new AppError(403, "FORBIDDEN", "Nguồn yêu cầu không được phép.");
      }
      if (origin) headers.set("Access-Control-Allow-Origin", origin);
      const session = await dependencies.authenticate(request);
      const service = identityService(session);
      if (path === "/api/v1/me/shops") return json({ items: await service.myShops() });
      if (path === "/api/v1/me/purchase-eligibility") {
        await service.requirePurchaseEligibility();
        return json({ eligible: true });
      }
      if (path === "/api/v1/me") {
        return method === "GET" ? json(await service.me()) :
          json(await service.patchMe(await parseBody(request, profilePatch)));
      }
      if (path === "/api/v1/me/addresses") {
        if (method === "GET") return json({ items: await service.addresses() });
        if (method === "POST") return json(await service.createAddress(await parseBody(request, addressInput)), 201);
        if (method === "PATCH") return json(await service.patchAddress(await parseBody(request, addressPatch)));
        const input = await parseBody(request, addressDelete);
        await service.deleteAddress(input.id);
        return new Response(null, { status: 204, headers });
      }
      if (path === "/api/v1/shop-applications") {
        return json(await service.applyForShop(await parseBody(request, shopApplication)), 201);
      }
      const id = resourceId.safeParse(decisionMatch?.[1]);
      if (!id.success) throw new AppError(422, "VALIDATION_ERROR", "ID không hợp lệ.");
      return json(await service.decideShop(id.data, await parseBody(request, shopDecision), requestId));
    } catch (error: unknown) {
      const safe = error instanceof AppError ? error :
        new AppError(503, "SERVICE_UNAVAILABLE", "Dịch vụ tạm thời không khả dụng.");
      return json({
        error: { code: safe.code, message: safe.message, request_id: requestId, fields: safe.fields },
      }, safe.status);
    }
  };
}
