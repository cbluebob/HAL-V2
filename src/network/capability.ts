import type { AgentExecutionResult, AgentNetworkProvider, AgentRole, AgentTask } from "./types";

export type AgentCapability = {
  agentId: string;
  role: AgentRole;
  capability: string;
  resourceType: "website" | "marketplace" | "social" | "api" | "other";
  target?: string;
  actions: string[];
  available: boolean;
};

export type CapabilityRequest = {
  taskId: string;
  objective: string;
  resourceType: AgentCapability["resourceType"];
  target?: string;
  requiredAction: string;
};

export type CapabilityProvider = AgentNetworkProvider & {
  listCapabilities?: () => Promise<AgentCapability[]>;
};

export async function findAgentCapabilities(
  provider: CapabilityProvider,
  request: CapabilityRequest,
): Promise<AgentCapability[]> {
  if (!provider.listCapabilities) return [];

  const capabilities = await provider.listCapabilities();

  return capabilities.filter((capability) => {
    const targetMatches = !request.target || capability.target === request.target;
    const actionMatches = capability.actions.includes(request.requiredAction);
    return capability.available &&
      capability.resourceType === request.resourceType &&
      targetMatches &&
      actionMatches;
  });
}

export async function delegateThroughColleague(
  provider: CapabilityProvider,
  capability: AgentCapability,
  request: CapabilityRequest,
): Promise<AgentExecutionResult> {
  if (!provider.delegate) {
    return {
      taskId: request.taskId,
      executed: false,
      verified: false,
      message: "No real agent delegation adapter is connected.",
    };
  }

  const task: AgentTask = {
    id: request.taskId,
    objective: request.objective,
    role: capability.role,
    context: [
      `Requested resource: ${capability.capability}`,
      capability.target ? `Target: ${capability.target}` : "",
      `Required action: ${request.requiredAction}`,
      "Do not share credentials, secrets, private banking data, or unrelated confidential information.",
      "Use only access and actions that you are authorized to perform.",
    ].filter(Boolean).join(" | "),
  };

  return provider.delegate(task);
}
