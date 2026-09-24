import { routeModel, type AIModel } from "../runtime/model-router";
export type WebSearchResult = {
  text: string;
  sources: Array<{ url: string }>;
  searched: boolean;
};

type OpenAIResponse = {
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
    action?: { type?: string; sources?: Array<{ url?: string }> };
  }>;
};

function resolveOpenAIKey(explicit?: string): string | undefined {
  // HAL_OPENAI_API_KEY is the hosted-environment-safe secret name.
  // OPENAI_API_KEY remains a compatibility fallback for self-hosted runtimes.
  return explicit ?? process.env.HAL_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
}

export async function openAIWebSearch(
  query: string,
  options: { apiKey?: string; model?: string } = {},
): Promise<WebSearchResult> {
  if (!query.trim()) throw new Error("Search query cannot be empty.");
  if (query.length > 8000) throw new Error("Search query exceeds the 8000-character safety limit.");

  const apiKey = resolveOpenAIKey(options.apiKey);
  const supportedModels: AIModel[] = [
    "gpt-6-luna",
    "gpt-6-sol",
    "gpt-6-astra",
    "gpt-5.6-luna",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
  ];
  const preferredModel = supportedModels.includes(options.model as AIModel)
    ? (options.model as AIModel)
    : undefined;
  const route = routeModel(query, {
    preferredModel,
    allowExpensiveModel: process.env.HAL_ALLOW_EXPENSIVE_MODEL === "true",
  });
  if (!apiKey) {
    throw new Error("HAL_OPENAI_API_KEY is not configured. Search was not executed.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: route.model,
      input: query,
      reasoning: { effort: route.reasoningEffort },
      max_output_tokens: 1200,
      tools: [{ type: "web_search" }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI web search failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as OpenAIResponse;
  const output = data.output ?? [];
  const text = output
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("\n");

  const sources = output
    .flatMap((item) => item.action?.sources ?? [])
    .filter((source): source is { url: string } => typeof source.url === "string")
    .map((source) => ({ url: source.url }));

  const searched = output.some((item) => item.type === "web_search_call");

  return { text, sources, searched };
}
