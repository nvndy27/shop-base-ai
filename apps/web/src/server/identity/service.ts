import { AppError, hasShopPermission } from "@shop/domain";
import type { IdentityService, Session } from "./types";

export function identityService(session: Session): IdentityService {
  const repository = session.repository;
  async function activeProfile() {
    const profile = await repository.getProfile();
    if (!profile || profile.status !== "active" || profile.user_id !== session.actor.id) {
      throw new AppError(403, "ACCOUNT_INACTIVE", "Tài khoản không được phép thực hiện thao tác.");
    }
    return profile;
  }
  return {
    async myShops() {
      await activeProfile();
      return repository.listMyShops();
    },
    async requirePurchaseEligibility() {
      await activeProfile();
      if (session.actor.verified !== true) {
        throw new AppError(403, "IDENTITY_UNVERIFIED", "Vui lòng xác nhận tài khoản trước khi mua hàng.");
      }
    },
    me: activeProfile,
    async patchMe(input) {
      await activeProfile();
      return repository.updateProfile({ display_name: input.display_name });
    },
    async addresses() {
      await activeProfile();
      return repository.listAddresses();
    },
    async createAddress(input) {
      await activeProfile();
      return repository.createAddress(input);
    },
    async patchAddress(input) {
      await activeProfile();
      return repository.updateAddress(input);
    },
    async deleteAddress(id) {
      await activeProfile();
      await repository.deleteAddress(id);
    },
    async applyForShop(input) {
      await activeProfile();
      if (!session.actor.verified) {
        throw new AppError(403, "IDENTITY_UNVERIFIED", "Vui lòng xác minh tài khoản.");
      }
      return repository.applyForShop({ name: input.name, slug: input.slug });
    },
    async decideShop(id, input, requestId) {
      await activeProfile();
      // The RPC also checks the current DB permission and signed JWT AAL2.
      return repository.decideShop(id, input, requestId);
    },
    async requireShopPermission(shopId, permission) {
      await activeProfile();
      const membership = await repository.getShopMembership(shopId);
      if (!membership || !hasShopPermission(membership, permission)) {
        throw new AppError(404, "NOT_FOUND", "Không tìm thấy tài nguyên.");
      }
      const existingOrderPermission = permission === "orders:read" || permission === "orders:transition";
      if (membership.status !== "active" &&
          !(membership.status === "suspended" && existingOrderPermission)) {
        throw new AppError(403, "SHOP_SUSPENDED", "Shop hiện không được phép thực hiện thao tác.");
      }
    },
  };
}
