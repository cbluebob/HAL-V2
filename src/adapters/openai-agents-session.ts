const DEFAULT_BASE_URL = "https://api.openai.com";
const DEFAULT_VAULT_ID = "vault_d9494eb02db046b58532d065d95bdda0d6641d55810b41a9bb";

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
  events: unknown[];
};

function resolveApiKey(explicit?: string): string {
  const key = explicit ?? process.env.HAL_AGENTS_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!key) throw new Error("HAL_AGENTS_API_KEY is not configured.");
  return key;
}

function parseSseEvents(chunk: string, pending: string): {
  events: unknown[];
  pending: string;
} {
  const combined = pending + chunk;
  const blocks = combined.split(/\r?\n\r?\n/);
  const nextPending = blocks.pop() ?? "";
  const events: unknown[] = [];

  for (const block of blocks) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data: "))
      .map((line) => line.slice(6))
      .join("\n");

    if (!data || data === "[DONE]") continue;

    try {
      events.push(JSON.parse(data));
    } catch {
      // Preserve stream progress even if a non-JSON SSE block appears.
    }
  }

  return { events, pending: nextPending };
}

export async function runHostedAgentSession(
  options: HostedSessionOptions,
): Promise<HostedSessionResult> {
  const apiKey = resolveApiKey(options.apiKey);
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const vaultId = options.vaultId ?? process.env.HAL_VAULT_ID ?? DEFAULT_VAULT_ID;
  const model = options.model ?? process.env.HAL_OPENAI_MODEL ?? "gpt-5.6-sol";
  const allowedDomains = options.allowedDomains ?? ["api.openai.com", "www.moltbook.com"];

  const response = await fetch(`${baseUrl}/v1/agents/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "OpenAI-Beta": "agents=v1",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      agent: {
        model,
        reasoning: { effort: "medium" },
        instructions:
          options.instructions ??
          "You are HAL_V4. Execute the assigned mission, verify real outcomes, never invent completion, and never create credit or debt.",
        tools: [{ type: "web_search", mode: "live" }],
      },
      environment: {
        type: "openai_hosted",
        network: {
          access: "restricted",
          allowed_domains: allowedDomains,
        },
      },
      input: options.input,
      stream: true,
      vault_ids: [vaultId],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Agents session creation failed (${response.status}): ${detail}`);
  }

  if (!response.body) {
    throw new Error("Agents session response did not include an event stream.");
  }

  const events: unknown[] = [];
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const parsed = parseSseEvents(decoder.decode(value, { stream: true }), pending);
    events.push(...parsed.events);
    pending = parsed.pending;
  }

  const flushed = parseSseEvents(decoder.decode(), pending);
  events.push(...flushed.events);

  const sessionId =
    events
      .map((event) => {
        if (typeof event !== "object" || event === null) return "";
        const candidate = event as { session_id?: unknown; id?: unknown };
        if (typeof candidate.session_id === "string") return candidate.session_id;
        if (typeof candidate.id === "string" && candidate.id.startsWith("sess_")) return candidate.id;
        return "";
      })
      .find(Boolean) ?? "";

  const status =
    [...events]
      .reverse()
      .map((event) =>
        typeof event === "object" && event !== null && "status" in event
          ? (event as { status?: unknown }).status
          : undefined,
      )
      .find((value): value is string => typeof value === "string") ?? "unknown";

  return {
    sessionId,
    status,
    streamed: true,
    events,
  };
}
