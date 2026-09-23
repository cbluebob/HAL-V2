import { createMission } from "../core/mission-engine";
import { runAutonomousMission, type AutonomousResource } from "../core/autonomy";
import { createMoneyMission, calculateVerifiedTotal } from "./engine";
import { researchMoneyOpportunities } from "./research";

export async function runAutonomousMoneyMission(
  targetAmount: number,
  location = "France",
) {
  const moneyMission = createMoneyMission(targetAmount);
  const mission = createMission(
    `Find and legally obtain ${targetAmount} EUR without credit or debt. Location: ${location}.`,
  );

  let verifiedTotal = 0;

  const resources: AutonomousResource[] = [
    {
      name: "money.web-research",
      description: "Research current legal debt-free opportunities.",
      risk: "low",
      async execute() {
        const research = await researchMoneyOpportunities(targetAmount, location);

        for (const opportunity of research.opportunities) {
          // Discovery is never treated as verification.
          // A future verification adapter must confirm the opportunity before it counts.
          if (opportunity.verified) {
            const updated = {
              ...moneyMission,
              opportunities: [...moneyMission.opportunities, opportunity],
            };
            verifiedTotal = calculateVerifiedTotal(updated);
          }
        }

        return {
          ok: true,
          action: "money.web-research",
          message: `Research completed: ${research.opportunities.length} candidate opportunities found; ${verifiedTotal} EUR verified.`,
          verified: true,
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
      allowLowRiskExternalActions: false,
    },
    () => verifiedTotal >= targetAmount,
  );

  return {
    ...state,
    targetAmount,
    verifiedTotal,
    targetReached: verifiedTotal >= targetAmount,
  };
}
