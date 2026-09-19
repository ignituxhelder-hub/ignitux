export const MARKETPLACE_ROLES = ['mentor', 'investisseur'] as const;
export type MarketplaceRole = (typeof MARKETPLACE_ROLES)[number];
