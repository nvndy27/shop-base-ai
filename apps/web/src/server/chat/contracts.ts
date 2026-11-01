import { z } from '@shop/contracts';
export const id = z.uuid();
const body = z.string().trim().min(1).max(2000);
const sequence = z.number().int().nonnegative();
export const inputs = {
  conversations: z.strictObject({limit:z.coerce.number().int().min(1).max(100).default(50)}),
  // context_* are optional provenance only; omit them rather than sending null.
  conversation_open: z.strictObject({shop_id:id,context_product_id:id.optional(),context_order_id:id.optional()}),
  messages: z.strictObject({conversation_id:id,before_seq:z.coerce.number().int().nonnegative().optional(),limit:z.coerce.number().int().min(1).max(100).default(30)}),
  message_send: z.strictObject({conversation_id:id,body,client_message_id:id}),
  conversation_read: z.strictObject({conversation_id:id,up_to_seq:z.coerce.number().int().nonnegative()}),
};
export type Operation = keyof typeof inputs;
// sender_id is never returned: `mine` is resolved server-side so no buyer id leaves the API.
// Outputs are strict on purpose: an unexpected field (for example buyer_id) must fail the
// response check instead of being silently stripped.
export const message = z.strictObject({id,sequence,kind:z.literal('text'),body:z.string(),mine:z.boolean(),client_message_id:id,created_at:z.string()});
const preview = z.strictObject({kind:z.literal('text'),body:z.string(),mine:z.boolean(),created_at:z.string()});
export const conversation = z.strictObject({id,shop_id:id,shop_name:z.string(),shop_slug:z.string(),counterpart_name:z.string(),
  context_product_id:id.nullable(),context_order_id:id.nullable(),last_message_at:z.string(),created_at:z.string(),
  unread_count:z.number().int().nonnegative(),last_message:preview.nullable()});
export const outputs:Record<Operation,z.ZodType>={
  conversations:z.strictObject({items:z.array(conversation)}),
  conversation_open:z.strictObject({conversation}),
  messages:z.strictObject({items:z.array(message),has_more:z.boolean()}),
  message_send:z.strictObject({message}),
  conversation_read:z.strictObject({ok:z.literal(true)}),
};
