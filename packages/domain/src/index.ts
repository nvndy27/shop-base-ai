export type ShopRole = "owner" | "catalog" | "fulfillment";
export type ShopPermission = "catalog:write" | "inventory:adjust" | "orders:read" | "orders:transition";

const permissions: Readonly<Record<ShopRole, readonly ShopPermission[]>> = {
  owner: ["catalog:write", "inventory:adjust", "orders:read", "orders:transition"],
  catalog: ["catalog:write", "inventory:adjust"],
  fulfillment: ["orders:read", "orders:transition"],
};

export function hasShopPermission(
  membership: { role: ShopRole; active: boolean },
  permission: ShopPermission,
): boolean {
  return membership.active && permissions[membership.role].includes(permission);
}

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields: Record<string, string[]> = {},
  ) {
    super(message);
    this.name = "AppError";
  }
}
