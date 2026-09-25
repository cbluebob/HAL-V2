import { openAIWebSearch } from "../adapters/openai-web-search";
import { createTool } from "./tool";

export type WebSearchInput = {
  query: string;
};

export type WebSearchOutput = {
  text: string;
  sources: Array<{ url: string }>;
  searched: boolean;
  aiEstimate?: {
    model: "gpt-5.6-luna" | "gpt-5.6-sol" | "gpt-5.6-terra";
    inputTokens: number;
    outputTokens: number;
  };
};

export const webSearchTool = createTool<WebSearchInput, WebSearchOutput>({
  name: "web.search",
  description: "Search the web for current information using OpenAI's server-side web search.",
  risk: "low",
  async execute(input) {
    const query = input.query.trim();
    if (!query) {
      throw new Error("web.search requires a non-empty query.");
    }
    return openAIWebSearch(query);
  },
});
