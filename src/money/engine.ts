import type { MoneyMission, Opportunity } from "./types";
import { isEligibleOpportunity } from "./guard";

export function createMoneyMission(targetAmount: number, deadline?: string): MoneyMission {
  if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
    throw new Error("Target amount must be greater than zero.");
  }

  return {
    targetAmount,
    currency: "EUR",
    deadline,
    opportunities: [],
  };
}

export function addOpportunity(
  mission: MoneyMission,
  opportunity: Opportunity,
): MoneyMission {
  if (!isEligibleOpportunity(opportunity)) {
    return mission;
  }

  return {
    ...mission,
    opportunities: [...mission.opportunities, opportunity],
  };
}

export function calculateVerifiedTotal(mission: MoneyMission): number {
  return mission.opportunities
    .filter(isEligibleOpportunity)
    .reduce((total, opportunity) => total + opportunity.estimatedAmount, 0);
}

export function targetReached(mission: MoneyMission): boolean {
  return calculateVerifiedTotal(mission) >= mission.targetAmount;
}
