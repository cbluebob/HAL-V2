export type AgentRole =
  | "researcher"
  | "strategist"
  | "analyst"
  | "executor"
  | "reviewer"
  | "generalist";

export type AgentAdvice = {
  agentId: string;
  role: AgentRole;
  recommendation: string;
  reasoning?: string;
  sources?: string[];
  confidence?: number;
  verified: boolean;
};

export type AgentTask = {
  id: string;
  objective: string;
  role: AgentRole;
  context?: string;
};

export type AgentExecutionResult = {
  taskId: string;
  executed: boolean;
  verified: boolean;
  message: string;
  data?: unknown;
};

export type AgentNetworkProvider = {
  name: string;
  consult: (query: string) => Promise<AgentAdvice[]>;
  delegate?: (task: AgentTask) => Promise<AgentExecutionResult>;
};
