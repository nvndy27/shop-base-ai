import { z } from "zod";

export const resourceId = z.uuid();
const name = z.string().trim().min(1).max(100);
export const profilePatch = z.strictObject({ display_name: name });
export const profileDto = z.strictObject({
  user_id: resourceId,
  display_name: z.string(),
  status: z.literal("active"),
});
const addressFields = {
  recipient_name: name,
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  address_line: z.string().trim().min(1).max(300),
  ward: z.string().trim().min(1).max(100),
  district: z.string().trim().min(1).max(100),
  province: z.string().trim().min(1).max(100),
  is_default: z.boolean(),
};
export const addressInput = z.strictObject({ ...addressFields, is_default: z.boolean().default(false) });
// The published endpoint is /me/addresses, not an invented /:id route.
export const addressPatch = z.strictObject(addressFields).partial().extend({ id: resourceId }).strict()
  .refine((value) => Object.keys(value).some((key) => key !== "id"), {
    message: "At least one address field is required",
  });
export const addressDelete = z.strictObject({ id: resourceId });
export const addressDto = z.strictObject({ ...addressFields, id: resourceId });
export const shopApplication = z.strictObject({
  name,
  slug: z.string().min(3).max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});
export const shopDto = z.strictObject({
  id: resourceId,
  name: z.string(),
  slug: z.string(),
  status: z.enum(["pending", "active", "rejected", "suspended", "closed"]),
});
export const shopDecision = z.strictObject({
  decision: z.enum(["active", "rejected", "suspended", "closed"]),
  reason: z.string().trim().min(3).max(500),
});
export const errorEnvelope = z.strictObject({
  error: z.strictObject({
    code: z.string(),
    message: z.string(),
    request_id: resourceId,
    fields: z.record(z.string(), z.array(z.string())),
  }),
});
export type Profile = z.infer<typeof profileDto>;
export type ProfilePatch = z.infer<typeof profilePatch>;
export type Address = z.infer<typeof addressDto>;
export type AddressInput = z.infer<typeof addressInput>;
export type AddressPatch = z.infer<typeof addressPatch>;
export type Shop = z.infer<typeof shopDto>;
export type ShopApplication = z.infer<typeof shopApplication>;
export type ShopDecision = z.infer<typeof shopDecision>;
export { z };
