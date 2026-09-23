export type PaymentDestinationType =
  | "bank_account"
  | "payment_service"
  | "marketplace_payout"
  | "cash"
  | "other";

export type PaymentDestination = {
  id: string;
  label: string;
  type: PaymentDestinationType;
  reference: string;
  currency: "EUR";
  verified: boolean;
  enabled: boolean;
};

export type PaymentReceipt = {
  id: string;
  opportunityId: string;
  destinationId: string;
  expectedAmount: number;
  receivedAmount?: number;
  currency: "EUR";
  status: "pending" | "received" | "failed" | "manual_verification_required";
  evidenceUrl?: string;
  receivedAt?: string;
};

export function canUseDestination(destination: PaymentDestination): boolean {
  return destination.enabled && destination.verified && destination.currency === "EUR";
}

export function isReceived(receipt: PaymentReceipt): boolean {
  return (
    receipt.status === "received" &&
    typeof receipt.receivedAmount === "number" &&
    receipt.receivedAmount > 0
  );
}
