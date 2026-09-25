import { routeModel, type AIModel } from "../runtime/model-router";
import { estimateTokensFromText } from "../runtime/ai-budget";

export type WebSearchResult = {
  text: string;
  sources: Array<{ url: string; title?: string }>;
  searched: boolean;
  aiEstimate?: {
    model: AIModel;
    inputTokens: number;
    outputTokens: number;
  };
};

type OpenAIResponse = {
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
      annotations?: Array<{
        type?: string;
        url?: string;
        title?: string;
        url_citation?: { url?: string; title?: string };
      }>;
    }>;
    action?: {
      type?: string;
      sources?: Array<{ url?: string; title?: string }>;
    };
  }>;
};

function resolveOpenAIKey(explicit?: string): string | undefined {
  return explicit ?? process.env.HAL_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
}

const SUPPORTED_MODELS: AIModel[] = [
  "gpt-5.6-luna",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
];

export async function openAIWebSearch(
  query: string,
  options: { apiKey?: string; model?: string } = {},
): Promise<WebSearchResult> {
  if (!query.trim()) throw new Error("Search query cannot be empty.");
  if (query.length > 8000) throw new Error("Search query exceeds the 8000-character safety limit.");

  const apiKey = resolveOpenAIKey(options.apiKey);
  const preferredModel = SUPPORTED_MODELS.includes(options.model as AIModel)
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
      include: ["web_search_call.action.sources"],
      tool_choice: "required",
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
    .join("\n")
    .trim();

  const sources = output
    .flatMap((item) => [
      ...(item.action?.sources ?? []),
      ...(item.content ?? []).flatMap((part) =>
        (part.annotations ?? []).map((annotation) => ({
          url: annotation.url ?? annotation.url_citation?.url,
          title: annotation.title ?? annotation.url_citation?.title,
        })),
      ),
    ])
    .filter(
      (source): source is { url: string; title?: string } =>
        typeof source.url === "string" &&
        /^https?:\\/\\//i.test(source.url),
    )
    .map((source) => ({ url: source.url, ...(source.title ? { title: source.title } : {}) }))
    .filter((source, index, all) => all.findIndex((candidate) => candidate.url === source.url) === index);

  const searched = output.some((item) => item.type === "web_search_call");

  return {
    text,
    sources,
    searched,
    aiEstimate: {
      model: route.model,
      inputTokens: estimateTokensFromText(query),
      outputTokens: estimateTokensFromText(text),
    },
  };
}
