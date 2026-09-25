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

  if (action.risk === "external" && action.type.trim().length === 0) {
    return { allowed: false, reason: "External action requires a non-empty action type." };
  }

  if (action.type.toLowerCase().includes("credit") || action.type.toLowerCase().includes("loan") || action.type.toLowerCase().includes("overdraft")) {
    return { allowed: false, reason: "ZERO CREDIT / ZERO DEBT: prohibited financial action keyword detected." };
  }

  return { allowed: true, reason: "Action passes the current Guard policy." };
}
