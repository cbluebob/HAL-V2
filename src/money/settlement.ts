import type { PaymentDestination, PaymentReceipt } from "./payment";

export type SettlementPlan = {
  destinationId?: string;
  destinationRequired: boolean;
  notes: string;
};

export function createSettlementPlan(destination?: PaymentDestination): SettlementPlan {
  if (!destination) {
    return {
      destinationRequired: true,
      notes: "No receiving destination configured. Digital payout cannot be confirmed until one is designated.",
    };
  }

  return {
    destinationId: destination.id,
    destinationRequired: false,
    notes: `Use the designated receiving method: ${destination.label}.`,
  };
}

export function settlementConfirmed(receipt: PaymentReceipt): boolean {
  return receipt.status === "received" &&
    typeof receipt.receivedAmount === "number" &&
    receipt.receivedAmount > 0;
}
