import type { OpportunityType } from "./types";

export type VentureMode =
  | "digital_product"
  | "digital_art"
  | "nfc_art"
  | "service"
  | "resale"
  | "marketplace_listing";

export type VentureCandidate = {
  id: string;
  mode: VentureMode;
  title: string;
  description: string;
  opportunityType: OpportunityType;
  estimatedSalePrice: number;
  currency: "EUR";
  upfrontCost: number;
  debtRequired: boolean;
  requiresInventory: boolean;
  requiresExternalPublication: boolean;
};

export function generateVentureCandidates(targetAmount: number): VentureCandidate[] {
  if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
    throw new Error("Target amount must be greater than zero.");
  }

  const price = Math.max(10, Math.min(49, Math.ceil(targetAmount / 4)));

  return [
    {
      id: "venture-digital-product",
      mode: "digital_product",
      title: "Create a focused digital product",
      description:
        "Design and package a useful digital asset that can be created with connected software and sold repeatedly.",
      opportunityType: "digital_product",
      estimatedSalePrice: price,
      currency: "EUR",
      upfrontCost: 0,
      debtRequired: false,
      requiresInventory: false,
      requiresExternalPublication: true,
    },
    {
      id: "venture-digital-art",
      mode: "digital_art",
      title: "Create collectible digital artwork",
      description:
        "Create original digital artwork with a defined audience and a sale-ready presentation.",
      opportunityType: "artwork",
      estimatedSalePrice: price,
      currency: "EUR",
      upfrontCost: 0,
      debtRequired: false,
      requiresInventory: false,
      requiresExternalPublication: true,
    },
    {
      id: "venture-nfc-art",
      mode: "nfc_art",
      title: "Create an NFC-linked artwork product",
      description:
        "Create an original artwork concept linked to an NFC experience; physical production is only attempted when compatible inventory or a debt-free production path exists.",
      opportunityType: "artwork",
      estimatedSalePrice: Math.max(15, price),
      currency: "EUR",
      upfrontCost: 0,
      debtRequired: false,
      requiresInventory: false,
      requiresExternalPublication: true,
    },
    {
      id: "venture-service",
      mode: "service",
      title: "Package a fast digital service",
      description:
        "Create a clearly scoped service offer that can be delivered with existing skills and tools.",
      opportunityType: "service",
      estimatedSalePrice: Math.max(20, price),
      currency: "EUR",
      upfrontCost: 0,
      debtRequired: false,
      requiresInventory: false,
      requiresExternalPublication: true,
    },
    {
      id: "venture-resale",
      mode: "resale",
      title: "Resell an authorized existing item",
      description:
        "Identify an item already available to HAL's owner or an authorized inventory source and prepare a compliant listing.",
      opportunityType: "resale",
      estimatedSalePrice: Math.max(20, price),
      currency: "EUR",
      upfrontCost: 0,
      debtRequired: false,
      requiresInventory: true,
      requiresExternalPublication: true,
    },
  ];
}
