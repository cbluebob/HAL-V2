import type { Opportunity } from "./types";

export function verifyOpportunity(
  opportunity: Opportunity,
  verification: { confirmed: boolean; amount?: number; notes?: string },
): Opportunity {
  if (!verification.confirmed) {
    return { ...opportunity, verified: false, notes: verification.notes ?? "Not verified." };
  }

  const amount = verification.amount ?? opportunity.estimatedAmount;

  if (!Number.isFinite(amount) || amount <= 0) {
    return { ...opportunity, verified: false, notes: "Invalid verified amount." };
  }

  return {
    ...opportunity,
    estimatedAmount: amount,
    verified: true,
    notes: verification.notes ?? "Amount independently verified.",
  };
}
