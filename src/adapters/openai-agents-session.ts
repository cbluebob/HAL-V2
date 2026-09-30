const DEFAULT_BASE_URL = "https://api.openai.com";

export type HostedSessionOptions = {
  apiKey?: string;
  vaultId?: string;
  model?: string;
  instructions?: string;
  input: string;
  allowedDomains?: string[];
  baseUrl?: string;
};

export type HostedSessionResult = {
  sessionId: string;
  status: string;
  streamed: boolean;
  completed: boolean;
  failed: boolean;
  events: unknown[];
};

function resolveApiKey(explicit?: string): string {
  const key = explicit ?? process.env.HAL_AGENTS_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!key) throw new Error("HAL_AGENTS_API_KEY or OPENAI_API_KEY is not configured.");
  return key;
}

export async function runHostedAgentSession(
  options: HostedSessionOptions,
): Promise<HostedSessionResult> {
  const apiKey = resolveApiKey(options.apiKey);
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const model = options.model ?? process.env.HAL_OPENAI_MODEL ?? "gpt-5.6-sol";
  const allowedDomains = options.allowedDomains ?? ["api.openai.com", "www.moltbook.com"];

  const response = await fetch(`${baseUrl}/v1/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions:
        options.instructions ??
        "You are HAL_V4. Execute the assigned mission, verify real outcomes, never invent completion, and never create credit or debt.",
      input: options.input,
      tools: [
        {
          type: "web_search",
          filters: {
            allowed_domains: allowedDomains,
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI Responses API failed (${response.status}): ${detail}`);
  }

  const data = (await response.json()) as {
    id?: unknown;
    status?: unknown;
    output_text?: unknown;
    output?: unknown;
    error?: unknown;
  };

  if (data.error) {
    throw new Error(`OpenAI Responses API returned an error: ${JSON.stringify(data.error)}`);
  }

  const status = typeof data.status === "string" ? data.status : "unknown";
  const failed = status === "failed" || Boolean(data.error);
  const completed = !failed && status === "completed";
  const sessionId = typeof data.id === "string" ? data.id : "";

  // Keep a normalized event shape for the existing HAL console and callers.
  // This is a Responses API response, not an Agents Sessions transport event.
  const events = [
    {
      type: "response.completed",
      id: sessionId,
      status,
      output_text: typeof data.output_text === "string" ? data.output_text : "",
      output: data.output ?? [],
    },
  ];

  return {
    sessionId,
    status,
    streamed: false,
    completed,
    failed,
    events,
  };
}
