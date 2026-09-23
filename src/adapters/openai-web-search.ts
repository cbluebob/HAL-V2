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

export async function openAIWebSearch(
  query: string,
  options: { apiKey?: string; model?: string } = {},
): Promise<WebSearchResult> {
  if (!query.trim()) throw new Error("Search query cannot be empty.");

  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured. Search was not executed.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model ?? process.env.HAL_OPENAI_MODEL ?? "gpt-5.6-luna",
      input: query,
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
