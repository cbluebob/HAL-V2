import type { Opportunity } from "./types";

export function isDebtFree(opportunity: Opportunity): boolean {
  return opportunity.requiresDebt === false;
}

export function isEligibleOpportunity(opportunity: Opportunity): boolean {
  return (
    opportunity.estimatedAmount > 0 &&
    opportunity.currency === "EUR" &&
    isDebtFree(opportunity) &&
    opportunity.verified
  );
}
