import type {
  Address, AddressInput, AddressPatch, Profile, ProfilePatch,
  Shop, ShopApplication, ShopDecision,
} from "@shop/contracts";
import type { ShopPermission, ShopRole } from "@shop/domain";

export interface Actor {
  id: string;
  verified: boolean;
  phoneVerified: boolean;
}
export interface IdentityRepository {
  listMyShops(): Promise<Shop[]>;
  getProfile(): Promise<Profile | null>;
  updateProfile(input: ProfilePatch): Promise<Profile>;
  listAddresses(): Promise<Address[]>;
  createAddress(input: AddressInput): Promise<Address>;
  updateAddress(input: AddressPatch): Promise<Address>;
  deleteAddress(id: string): Promise<void>;
  applyForShop(input: ShopApplication): Promise<Shop>;
  decideShop(id: string, input: ShopDecision, requestId: string): Promise<Shop>;
  getShopMembership(shopId: string): Promise<{
    role: ShopRole;
    active: boolean;
    status: Shop["status"];
  } | null>;
}
export interface Session {
  actor: Actor;
  repository: IdentityRepository;
}
export interface IdentityService {
  myShops(): Promise<Shop[]>;
  requirePurchaseEligibility(): Promise<void>;
  me(): Promise<Profile>;
  patchMe(input: ProfilePatch): Promise<Profile>;
  addresses(): Promise<Address[]>;
  createAddress(input: AddressInput): Promise<Address>;
  patchAddress(input: AddressPatch): Promise<Address>;
  deleteAddress(id: string): Promise<void>;
  applyForShop(input: ShopApplication): Promise<Shop>;
  decideShop(id: string, input: ShopDecision, requestId: string): Promise<Shop>;
  requireShopPermission(shopId: string, permission: ShopPermission): Promise<void>;
}
