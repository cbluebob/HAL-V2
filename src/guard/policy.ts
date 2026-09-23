export const GUARD_POLICY = {
  zeroCredit: true,
  zeroDebt: true,
  prohibitLoans: true,
  prohibitOverdraft: true,
  prohibitBuyNowPayLater: true,
  prohibitUnauthorizedTransfers: true,
  prohibitUnauthorizedSignatures: true,
  requireVerificationBeforeSuccess: true,
} as const;

export type ActionRisk = "low" | "financial" | "external" | "legal" | "irreversible";

export function guardAction(
  action: { type: string; risk: ActionRisk; createsDebt?: boolean },
): { allowed: boolean; reason: string } {
  if (action.createsDebt === true) {
    return { allowed: false, reason: "ZERO CREDIT / ZERO DEBT: debt creation is prohibited." };
  }

  if (action.risk === "financial" || action.risk === "legal" || action.risk === "irreversible") {
    return { allowed: false, reason: "Sensitive action requires explicit authorization and verification." };
  }

  return { allowed: true, reason: "Action passes the current Guard policy." };
}
