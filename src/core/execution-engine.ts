import type { ActionResult, Mission } from "./types";
import { appendEvent } from "../memory/journal";
import { guardAction, type ActionRisk } from "../guard/policy";
import { AIBudgetGuard, DEFAULT_AI_BUDGET, type AICallEstimate } from "../runtime/ai-budget";
import { executeToolAction, type ToolActionRequest } from "./tool-executor";
import { verifiedSuccess } from "./mission-engine";

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
  act?: (context: { mission: Mission; decision: Decision }) => Promise<ActionResult>;
  toolAction?: (context: { mission: Mission; decision: Decision }) => Promise<ToolActionRequest | undefined>;
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function reportFailure(
  mission: Mission,
  context: MissionExecutionContext,
  report: HALExecutionAdapters["report"],
  message: string,
  type: "hal.observation.failed" | "hal.decision.failed" | "hal.action.failed",
): Promise<void> {
  const failedContext: MissionExecutionContext = {
    ...context,
    mission: { ...context.mission, status: "failed" },
    result: {
      ok: false,
      action: context.decision?.action ?? "unknown",
      message,
      verified: false,
      progressed: false,
    },
  };
  await Promise.resolve();
  await report?.(failedContext);
  appendEvent({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    type,
    message,
    missionId: mission.id,
    verified: false,
  });
}

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
    let observation: Observation;
    try {
      observation = await adapters.observe(mission);
    } catch (error) {
      const reason = `Observation failed: ${errorMessage(error)}`;
      await reportFailure(mission, context, adapters.report, reason, "hal.observation.failed");
      return { status: "failed", cycles: cycle, context, reason };
    }

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

    let decision: Decision;
    try {
      decision = await adapters.decide({ mission, observation });
    } catch (error) {
      const reason = `Decision failed: ${errorMessage(error)}`;
      await reportFailure(mission, context, adapters.report, reason, "hal.decision.failed");
      return { status: "failed", cycles: cycle, context, reason };
    }

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

    let toolRequest: ToolActionRequest | undefined;
    try {
      toolRequest = adapters.toolAction
        ? await adapters.toolAction({ mission, decision })
        : undefined;
    } catch (error) {
      const reason = `Action preparation failed: ${errorMessage(error)}`;
      await reportFailure(mission, context, adapters.report, reason, "hal.action.failed");
      return { status: "failed", cycles: cycle, context, reason };
    }

    if (adapters.toolAction && !toolRequest) {
      const reason = `Decision action "${decision.action}" is not executable by the configured tool adapter.`;
      context = {
        ...context,
        result: {
          ok: false,
          action: decision.action,
          message: reason,
          verified: false,
          progressed: false,
        },
      };
      await adapters.report?.({ ...context });
      return { status: "failed", cycles: cycle, context, reason };
    }

    let result: ActionResult;
    try {
      result = adapters.act
        ? await adapters.act({ mission, decision })
        : adapters.toolAction
          ? await executeToolAction(mission, toolRequest as ToolActionRequest)
          : {
              ok: false,
              action: decision.action,
              message: "No action adapter is configured.",
              verified: true,
              progressed: false,
            };
    } catch (error) {
      const reason = `Action execution failed: ${errorMessage(error)}`;
      await reportFailure(mission, context, adapters.report, reason, "hal.action.failed");
      return { status: "failed", cycles: cycle, context, reason };
    }

    context = { ...context, result };

    const actionData =
      result.data && typeof result.data === "object"
        ? (result.data as { aiEstimate?: AICallEstimate })
        : undefined;

    if (actionData?.aiEstimate) {
      const budgetCheck = budget.canReserve(actionData.aiEstimate);
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
      budget.reserve(actionData.aiEstimate);
    }

    if (!verifiedSuccess(result)) {
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

    let controlled: boolean;
    try {
      controlled = adapters.control
        ? await adapters.control({ mission, result })
        : result.verified;
    } catch (error) {
      const reason = `Post-action control failed: ${errorMessage(error)}`;
      await reportFailure(mission, context, adapters.report, reason, "hal.action.failed");
      return { status: "failed", cycles: cycle, context, reason };
    }

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

    if (result.progressed !== false) {
      context = {
        ...context,
        mission: { ...context.mission, status: "completed" },
      };
      appendEvent({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type: "hal.execution.completed",
        message: "Mission completed after verified control.",
        missionId: mission.id,
        verified: true,
      });
      await adapters.report?.({ ...context });
      return {
        status: "completed",
        cycles: cycle,
        context,
        reason: "Objective step completed and verified.",
      };
    }

    await adapters.report?.({ ...context });
  }

  context = {
    ...context,
    mission: { ...context.mission, status: "failed" },
  };
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
