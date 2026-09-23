import type { Mission, ActionResult } from "./types";
import { appendEvent } from "../memory/journal";
import { guardAction } from "../guard/policy";

export type AutonomousResource = {
  name: string;
  description: string;
  risk: "low" | "financial" | "external" | "legal" | "irreversible";
  execute: (input: unknown, mission: Mission) => Promise<ActionResult>;
};

export type AutonomyPolicy = {
  maxIterations: number;
  stopWhenTargetReached: boolean;
  allowLowRiskExternalActions: boolean;
};

export type AutonomyState = {
  mission: Mission;
  iteration: number;
  objectiveReached: boolean;
  blocked: boolean;
  lastMessage?: string;
};

export type NoProgressHandler = (
  state: AutonomyState,
) => Promise<boolean>;

export async function runAutonomousMission(
  mission: Mission,
  resources: AutonomousResource[],
  policy: AutonomyPolicy,
  objectiveReached: (state: AutonomyState) => boolean,
  onNoProgress?: NoProgressHandler,
): Promise<AutonomyState> {
  let state: AutonomyState = {
    mission: { ...mission, status: "running" },
    iteration: 0,
    objectiveReached: false,
    blocked: false,
  };

  appendEvent({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    type: "autonomy.started",
    message: `Autonomous mission started: ${mission.objective}`,
    missionId: mission.id,
    verified: true,
  });

  while (state.iteration < policy.maxIterations) {
    state.iteration += 1;

    if (objectiveReached(state)) {
      state.objectiveReached = true;
      state.mission = { ...state.mission, status: "completed" };
      break;
    }

    let progressed = false;

    for (const resource of resources) {
      const authorization = guardAction({
        type: resource.name,
        risk: resource.risk,
      });

      if (!authorization.allowed) {
        appendEvent({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          type: "resource.blocked",
          message: `${resource.name}: ${authorization.reason}`,
          missionId: mission.id,
          verified: true,
        });
        continue;
      }

      if (resource.risk === "external" && !policy.allowLowRiskExternalActions) {
        continue;
      }

      const result = await resource.execute(
        { objective: mission.objective, iteration: state.iteration },
        state.mission,
      );

      state.lastMessage = result.message;

      if (result.ok && result.verified) {
        progressed = result.progressed ?? true;
        appendEvent({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          type: result.progressed === false ? "resource.completed" : "resource.progressed",
          message: result.message,
          missionId: mission.id,
          verified: true,
        });
      }
    }

    if (!progressed) {
      const strategyChanged = onNoProgress
        ? await onNoProgress(state)
        : false;

      if (strategyChanged) {
        appendEvent({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          type: "autonomy.strategy_changed",
          message: "No verified objective progress. A new strategy was requested before continuing.",
          missionId: mission.id,
          verified: true,
        });
        continue;
      }

      state.blocked = true;
      state.mission = { ...state.mission, status: "blocked" };
      appendEvent({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type: "autonomy.blocked",
        message: "No authorized resource produced verified objective progress and no new strategy was available.",
        missionId: mission.id,
        verified: true,
      });
      break;
    }
  }

  if (!state.objectiveReached && !state.blocked && state.iteration >= policy.maxIterations) {
    state.mission = { ...state.mission, status: "failed" };
    appendEvent({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      type: "autonomy.limit_reached",
      message: "Autonomy iteration limit reached before objective verification.",
      missionId: mission.id,
      verified: true,
    });
  }

  return state;
}
