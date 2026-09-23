import type { ActionResult, Mission } from "./types";
import { authorizeAction } from "./mission-engine";
import { appendEvent } from "../memory/journal";

export type MissionStep = {
  id: string;
  description: string;
  risk: "low" | "financial" | "external" | "legal" | "irreversible";
  createsDebt?: boolean;
  execute?: () => Promise<ActionResult>;
};

export type MissionPlan = {
  missionId: string;
  steps: MissionStep[];
};

export async function runMission(
  mission: Mission,
  plan: MissionPlan,
): Promise<Mission> {
  if (plan.missionId !== mission.id) {
    throw new Error("Mission plan does not match mission.");
  }

  let current: Mission = { ...mission, status: "running" };

  appendEvent({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    type: "mission.started",
    message: `Mission started: ${mission.objective}`,
    missionId: mission.id,
    verified: true,
  });

  for (const step of plan.steps) {
    const authorization = authorizeAction({
      type: step.id,
      risk: step.risk,
      createsDebt: step.createsDebt,
    });

    if (!authorization.allowed) {
      current = { ...current, status: "blocked" };
      appendEvent({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type: "mission.blocked",
        message: `${step.description}: ${authorization.reason}`,
        missionId: mission.id,
        verified: true,
      });
      return current;
    }

    if (!step.execute) {
      current = { ...current, status: "blocked" };
      appendEvent({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type: "mission.blocked",
        message: `${step.description}: no execution adapter is configured.`,
        missionId: mission.id,
        verified: true,
      });
      return current;
    }

    const result = await step.execute();

    if (!result.ok || !result.verified) {
      current = { ...current, status: "failed" };
      appendEvent({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type: "action.failed",
        message: result.message,
        missionId: mission.id,
        verified: result.verified,
      });
      return current;
    }

    appendEvent({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      type: "action.completed",
      message: result.message,
      missionId: mission.id,
      verified: true,
    });
  }

  current = { ...current, status: "completed" };

  appendEvent({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    type: "mission.completed",
    message: `Mission completed: ${mission.objective}`,
    missionId: mission.id,
    verified: true,
  });

  return current;
}
