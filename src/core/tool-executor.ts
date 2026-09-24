import { getTool } from "../tools/registry";
import type { ActionResult, Mission } from "../core/types";
import { authorizeAction } from "../core/mission-engine";

export type ToolActionRequest = {
  toolName: string;
  input: unknown;
  risk: "low" | "financial" | "external" | "legal" | "irreversible";
  createsDebt?: boolean;
};

export async function executeToolAction(
  mission: Mission,
  request: ToolActionRequest,
): Promise<ActionResult> {
  const authorization = authorizeAction({
    type: request.toolName,
    risk: request.risk,
    createsDebt: request.createsDebt,
  });

  if (!authorization.allowed) {
    return {
      ok: false,
      action: request.toolName,
      message: authorization.reason,
      verified: true,
      progressed: false,
    };
  }

  const tool = getTool(request.toolName);
  const data = await tool.execute(request.input, { missionId: mission.id });

  return {
    ok: true,
    action: request.toolName,
    message: `Tool ${request.toolName} executed and returned a result.`,
    verified: true,
    progressed: true,
    data,
  };
}
