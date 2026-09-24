import { getTool } from "../tools/registry";
import type { ActionResult, Mission } from "./types";
import { authorizeAction } from "./mission-engine";

export type ToolActionRequest = {
  toolName: string;
  input: unknown;
  risk?: "low" | "financial" | "external" | "legal" | "irreversible";
  createsDebt?: boolean;
};

export async function executeToolAction(
  mission: Mission,
  request: ToolActionRequest,
): Promise<ActionResult> {
  let tool;
  try {
    tool = getTool(request.toolName);
  } catch (error) {
    return {
      ok: false,
      action: request.toolName,
      message: error instanceof Error ? error.message : "Tool is not registered.",
      verified: false,
      progressed: false,
    };
  }

  // The registered tool is the source of truth for risk. Never trust a model-supplied
  // risk classification for authorization.
  const authorization = authorizeAction({
    type: tool.name,
    risk: tool.risk,
    createsDebt: request.createsDebt,
  });

  if (!authorization.allowed) {
    return {
      ok: false,
      action: tool.name,
      message: authorization.reason,
      verified: true,
      progressed: false,
    };
  }

  try {
    const data = await tool.execute(request.input, { missionId: mission.id });

    return {
      ok: true,
      action: tool.name,
      message: `Tool ${tool.name} executed and returned a result.`,
      verified: true,
      progressed: true,
      data,
    };
  } catch (error) {
    return {
      ok: false,
      action: tool.name,
      message: error instanceof Error ? error.message : "Tool execution failed.",
      verified: false,
      progressed: false,
    };
  }
}
