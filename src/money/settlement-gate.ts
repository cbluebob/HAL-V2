import type { PaymentReceipt } from "./payment";

export type SettlementState = {
  targetAmount: number;
  receivedAmount: number;
  objectiveReached: boolean;
};

export function settlementState(
  targetAmount: number,
  receipts: PaymentReceipt[],
): SettlementState {
  const receivedAmount = receipts
    .filter(
      (receipt) =>
        receipt.status === "received" &&
        typeof receipt.receivedAmount === "number" &&
        receipt.receivedAmount > 0,
    )
    .reduce((sum, receipt) => sum + (receipt.receivedAmount ?? 0), 0);

  return {
    targetAmount,
    receivedAmount,
    objectiveReached: receivedAmount >= targetAmount,
  };
}
