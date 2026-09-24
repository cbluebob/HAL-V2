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
        ...(options.instructions ? { instructions: options.instructions } : {}),
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

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const block of chunk.split("\n\n")) {
      const dataLine = block.split("\n").find((line) => line.startsWith("data: "));
      if (!dataLine) continue;
      const raw = dataLine.slice(6);
      try {
        events.push(JSON.parse(raw));
      } catch {
        // Ignore non-JSON SSE payloads while retaining all structured events.
      }
    }
  }

  const session = events.find(
    (event): event is { id: string; status?: string } =>
      typeof event === "object" &&
      event !== null &&
      "id" in event &&
      typeof (event as { id?: unknown }).id === "string" &&
      !("type" in event),
  );

  const lastState = [...events].reverse().find(
    (event): event is { status?: string } =>
      typeof event === "object" && event !== null && "status" in event,
  );

  return {
    sessionId: session?.id ?? "",
    status: lastState?.status ?? "unknown",
    streamed: true,
    events,
  };
}
