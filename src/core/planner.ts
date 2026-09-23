import type { Mission } from "./types";
import type { MissionPlan, MissionStep } from "./orchestrator";

export function createPlan(
  mission: Mission,
  steps: Omit<MissionStep, "id">[],
): MissionPlan {
  const normalized = steps.map((step, index) => ({
    ...step,
    id: `step-${index + 1}`,
  }));

  return { missionId: mission.id, steps: normalized };
}
