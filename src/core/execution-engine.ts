import type { ActionResult, Mission } from "./types";
import { appendEvent } from "../memory/journal";
import { guardAction, type ActionRisk } from "../guard/policy";
import { AIBudgetGuard, DEFAULT_AI_BUDGET, type AICallEstimate } from "../runtime/ai-budget";

export type Observation = {
  summary: string;
  facts: string[];
  verified: boolean;
};

export type Decision = {
  action: string;
  reason: string;
  risk: ActionRisk;
  createsDebt?: boolean;
  aiEstimate?: AICallEstimate;
};

export type MissionExecutionContext = {
  mission: Mission;
  observation?: Observation;
  decision?: Decision;
  result?: ActionResult;
};

export type HALExecutionAdapters = {
  observe: (mission: Mission) => Promise<Observation>;
  decide: (context: { mission: Mission; observation: Observation }) => Promise<Decision>;
  act: (context: { mission: Mission; decision: Decision }) => Promise<ActionResult>;
  control?: (context: { mission: Mission; result: ActionResult }) => Promise<boolean>;
  report?: (context: MissionExecutionContext) => Promise<void>;
};

export type HALExecutionPolicy = {
  maxCycles: number;
  aiBudget?: {
    maxCallsPerMission: number;
    maxEstimatedTokensPerMission: number;
    maxEstimatedCostUsdPerMission: number;
  };
};

export type HALExecutionResult = {
  status: "completed" | "blocked" | "failed";
  cycles: number;
  context: MissionExecutionContext;
  reason: string;
};

export async function executeHALMission(
  mission: Mission,
  adapters: HALExecutionAdapters,
  policy: HALExecutionPolicy = { maxCycles: 3, aiBudget: DEFAULT_AI_BUDGET },
): Promise<HALExecutionResult> {
  if (!Number.isInteger(policy.maxCycles) || policy.maxCycles < 1) {
    throw new Error("maxCycles must be a positive integer.");
  }

  const budget = new AIBudgetGuard(policy.aiBudget ?? DEFAULT_AI_BUDGET);
  let context: MissionExecutionContext = { mission: { ...mission, status: "running" } };

  appendEvent({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    type: "hal.execution.started",
    message: `HAL execution started: ${mission.objective}`,
    missionId: mission.id,
    verified: true,
  });

  for (let cycle = 1; cycle <= policy.maxCycles; cycle += 1) {
    const observation = await adapters.observe(mission);

    if (!observation.verified) {
      const reason = "Observation was not verified.";
      context = { ...context, observation };
      await adapters.report?.({ ...context });
      appendEvent({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type: "hal.execution.blocked",
        message: reason,
        missionId: mission.id,
        verified: true,
      });
      return { status: "blocked", cycles: cycle, context, reason };
    }

    context = { ...context, observation };

    appendEvent({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      type: "hal.observed",
      message: observation.summary,
      missionId: mission.id,
      verified: true,
    });

    const decision = await adapters.decide({ mission, observation });
    context = { ...context, decision };

    if (decision.aiEstimate) {
      const budgetCheck = budget.canReserve(decision.aiEstimate);
      if (!budgetCheck.allowed) {
        const reason = budgetCheck.reason;
        await adapters.report?.({ ...context });
        appendEvent({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          type: "hal.ai_budget.blocked",
          message: reason,
          missionId: mission.id,
          verified: true,
        });
        return { status: "blocked", cycles: cycle, context, reason };
      }
      budget.reserve(decision.aiEstimate);
    }

    const authorization = guardAction({
      type: decision.action,
      risk: decision.risk,
      createsDebt: decision.createsDebt,
    });

    if (!authorization.allowed) {
      const reason = authorization.reason;
      await adapters.report?.({ ...context });
      appendEvent({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type: "hal.action.blocked",
        message: reason,
        missionId: mission.id,
        verified: true,
      });
      return { status: "blocked", cycles: cycle, context, reason };
    }

    const result = await adapters.act({ mission, decision });
    context = { ...context, result };

    if (!result.ok || !result.verified) {
      const reason = result.message || "Action was not verified.";
      await adapters.report?.({ ...context });
      appendEvent({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type: "hal.action.failed",
        message: reason,
        missionId: mission.id,
        verified: result.verified,
      });
      return { status: "failed", cycles: cycle, context, reason };
    }

    const controlled = adapters.control
      ? await adapters.control({ mission, result })
      : result.verified;

    if (!controlled) {
      const reason = "Post-action control did not verify the result.";
      await adapters.report?.({ ...context });
      appendEvent({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type: "hal.control.failed",
        message: reason,
        missionId: mission.id,
        verified: true,
      });
      return { status: "failed", cycles: cycle, context, reason };
    }

    appendEvent({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      type: "hal.action.controlled",
      message: result.message,
      missionId: mission.id,
      verified: true,
    });

    await adapters.report?.({ ...context });

    if (result.progressed !== false) {
      return {
        status: "completed",
        cycles: cycle,
        context,
        reason: "Objective step completed and verified.",
      };
    }
  }

  const reason = "Maximum execution cycles reached without verified completion.";
  await adapters.report?.({ ...context });
  appendEvent({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    type: "hal.execution.limit_reached",
    message: reason,
    missionId: mission.id,
    verified: true,
  });

  return {
    status: "failed",
    cycles: policy.maxCycles,
    context,
    reason,
  };
}
