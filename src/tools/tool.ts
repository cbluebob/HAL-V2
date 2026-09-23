export type ToolRisk = "low" | "financial" | "external" | "legal" | "irreversible";

export type ToolContext = {
  missionId: string;
};

export type Tool<TInput = unknown, TOutput = unknown> = {
  name: string;
  description: string;
  risk: ToolRisk;
  execute: (input: TInput, context: ToolContext) => Promise<TOutput>;
};

export function createTool<TInput, TOutput>(tool: Tool<TInput, TOutput>): Tool<TInput, TOutput> {
  if (!tool.name.trim()) throw new Error("Tool name cannot be empty.");
  if (!tool.description.trim()) throw new Error("Tool description cannot be empty.");
  return tool;
}
