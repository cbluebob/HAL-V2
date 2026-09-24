import { registerTool } from "./registry";
import { webSearchTool } from "./web-search";

let registered = false;

export function registerBuiltInTools(): void {
  if (registered) return;
  registerTool(webSearchTool);
  registered = true;
}
