import { createMission } from "../core/mission-engine";
import { runAutonomousMission, type AutonomousResource } from "../core/autonomy";
import { escalateStrategy } from "../network/escalation";
import type { AgentNetworkProvider } from "../network/types";
import { createMoneyMission, calculateVerifiedTotal } from "./engine";
import { researchMoneyOpportunities } from "./research";
import type { Opportunity } from "./types";
import { generateVentureCandidates } from "./venture";
import type { VentureExecutionAdapter } from "./venture-executor";
import { executeVentureCandidate } from "./venture-executor";

export async function runAutonomousMoneyMission(
  targetAmount: number,
  location = "France",
  agentNetwork?: AgentNetworkProvider,
  ventureAdapters: VentureExecutionAdapter[] = [],
) {
  const moneyMission = createMoneyMission(targetAmount);
  const mission = createMission(
    `Find and legally obtain ${targetAmount} EUR without credit or debt. Location: ${location}.`,
  );

  let verifiedTotal = 0;
  let strategyContext = "";
  let strategyConsults = 0;
  const verifiedOpportunityIds = new Set<string>();
  const opportunities: Opportunity[] = [];
  const executedVentureIds = new Set<string>();

  const resources: AutonomousResource[] = [
    {
      name: "money.web-research",
      description: "Research current legal debt-free opportunities.",
      risk: "low",
      async execute() {
        const previousTotal = verifiedTotal;
        const research = await researchMoneyOpportunities(
          targetAmount,
          location,
          strategyContext,
        );

        for (const opportunity of research.opportunities) {
          if (opportunity.verified && !verifiedOpportunityIds.has(opportunity.id)) {
            verifiedOpportunityIds.add(opportunity.id);
            opportunities.push(opportunity);
          }
        }

        verifiedTotal = calculateVerifiedTotal({
          ...moneyMission,
          opportunities,
        });

        return {
          ok: true,
          action: "money.web-research",
          message: `Research completed: ${research.opportunities.length} candidate opportunities found; ${verifiedTotal} EUR verified.`,
          verified: true,
          progressed: verifiedTotal > previousTotal,
          data: {
            candidates: research.opportunities.length,
            verifiedTotal,
            sources: research.sources,
          },
        };
      },
    },
  ];

  const state = await runAutonomousMission(
    mission,
    resources,
    {
      maxIterations: 10,
      stopWhenTargetReached: true,
      allowLowRiskExternalActions: true,
    },
    () => verifiedTotal >= targetAmount,
    async (currentState) => {
      // First escalation path: ask other agents for genuinely different strategies.
      if (agentNetwork && strategyConsults < 3) {
        strategyConsults += 1;
        const escalation = await escalateStrategy(
          agentNetwork,
          `${currentState.mission.objective} Current verified amount: ${verifiedTotal} EUR.`,
          strategyConsults,
        );

        strategyContext = escalation.advice
          .map((advice) => advice.recommendation)
          .filter(Boolean)
          .slice(0, 8)
          .join(" | ");

        if (strategyContext.length > 0) {
          return true;
        }
      }

      // Second escalation path: create and publish new debt-free products/services
      // when normal opportunity research is insufficient.
      const candidates = generateVentureCandidates(targetAmount);

      for (const candidate of candidates) {
        if (executedVentureIds.has(candidate.id)) continue;
        executedVentureIds.add(candidate.id);

        const result = await executeVentureCandidate(candidate, ventureAdapters);

        if (result.ok) {
          return true;
        }
      }

      return false;
    },
  );

  return {
    ...state,
    targetAmount,
    verifiedTotal,
    targetReached: verifiedTotal >= targetAmount,
    strategyConsults,
    opportunities,
  };
}
