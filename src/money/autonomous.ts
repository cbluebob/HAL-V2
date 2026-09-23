import { createMission } from "../core/mission-engine";
import { runAutonomousMission, type AutonomousResource } from "../core/autonomy";
import { escalateStrategy } from "../network/escalation";
import {
  delegateThroughColleague,
  findAgentCapabilities,
  type CapabilityProvider,
} from "../network/capability";
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
  let delegatedTasks = 0;
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
      // First escalation path: ask colleagues for genuinely different strategies.
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

      // Second escalation path: ask colleagues who have access to a resource HAL lacks.
      if (agentNetwork) {
        const provider = agentNetwork as CapabilityProvider;
        const capabilities = await findAgentCapabilities(provider, {
          taskId: `${mission.id}-capability-${delegatedTasks + 1}`,
          objective: currentState.mission.objective,
          resourceType: "website",
          requiredAction: "execute",
        });

        if (capabilities.length > 0) {
          const capability = capabilities[0];
          delegatedTasks += 1;
          const result = await delegateThroughColleague(provider, capability, {
            taskId: `${mission.id}-delegated-${delegatedTasks}`,
            objective: currentState.mission.objective,
            resourceType: capability.resourceType,
            target: capability.target,
            requiredAction: "execute",
          });

          if (result.executed) {
            return true;
          }
        }
      }

      // Third escalation path: create and publish new debt-free products/services.
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
    delegatedTasks,
    opportunities,
  };
}
