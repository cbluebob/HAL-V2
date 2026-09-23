import { createTool } from "./tool";

export type WebSearchInput = {
  query: string;
};

export type WebSearchOutput = {
  available: false;
  message: string;
};

export const webSearchTool = createTool<WebSearchInput, WebSearchOutput>({
  name: "web.search",
  description: "Search the web for current information.",
  risk: "low",
  async execute(input) {
    if (!input.query.trim()) {
      throw new Error("Search query cannot be empty.");
    }

    // The external web adapter is intentionally not implemented here.
    // HAL must never pretend a search happened when no adapter is connected.
    return {
      available: false,
      message: "No web adapter is connected. Search was not executed.",
    };
  },
});
