import type {
  AgentAdvice,
  AgentExecutionResult,
  AgentNetworkProvider,
  AgentTask,
} from "./types";
import { DEFAULT_NETWORK_POLICY, sanitizeAgentContext } from "./policy";

export async function consultAgentNetwork(
  provider: AgentNetworkProvider,
  query: string,
): Promise<AgentAdvice[]> {
  if (!DEFAULT_NETWORK_POLICY.useForStrategy && !DEFAULT_NETWORK_POLICY.useForResearch) {
    return [];
  }

  const advice = await provider.consult(query);
  return advice.map((item) => ({ ...item, verified: false }));
}

export async function delegateToAgent(
  provider: AgentNetworkProvider,
  task: AgentTask,
): Promise<AgentExecutionResult> {
  if (!DEFAULT_NETWORK_POLICY.allowDelegation) {
    return {
      taskId: task.id,
      executed: false,
      verified: false,
      message: "Agent delegation is disabled by policy.",
    };
  }

  if (!provider.delegate) {
    return {
      taskId: task.id,
      executed: false,
      verified: false,
      message: "No delegation adapter is connected. Task was not executed.",
    };
  }

  const sanitizedTask: AgentTask = {
    ...task,
    context: task.context ? sanitizeAgentContext(task.context) : undefined,
  };

  return provider.delegate(sanitizedTask);
}
