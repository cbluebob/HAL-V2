import type { Tool } from "./tool";

const tools = new Map<string, Tool>();

export function registerTool(tool: Tool): void {
  if (tools.has(tool.name)) {
    throw new Error(`Tool already registered: ${tool.name}`);
  }
  tools.set(tool.name, tool);
}

export function getTool(name: string): Tool {
  const tool = tools.get(name);
  if (!tool) throw new Error(`Tool not registered: ${name}`);
  return tool;
}

export function listTools(): string[] {
  return [...tools.keys()].sort();
}

export function hasTool(name: string): boolean {
  return tools.has(name);
}
