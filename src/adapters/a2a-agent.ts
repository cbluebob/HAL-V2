const DEFAULT_AGENT_CARD_PATH = "/.well-known/agent.json";
const DEFAULT_MESSAGE_PATH = "/message/send";

export type A2AAgentCard = {
  name?: string;
  description?: string;
  url?: string;
  version?: string;
  skills?: unknown[];
  [key: string]: unknown;
};

export type A2AMessageResult = {
  agentUrl: string;
  agentName?: string;
  taskId?: string;
  status?: string;
  text: string;
  raw: unknown;
};

export type A2AOptions = {
  agentUrl?: string;
  bearerToken?: string;
  timeoutMs?: number;
};

function resolveAgentUrl(explicit?: string): string {
  const value = explicit ?? process.env.HAL_A2A_AGENT_URL;
  if (!value) {
    throw new Error(
      "HAL_A2A_AGENT_URL is not configured. Set it to the A2A Agent endpoint before asking HAL to contact a remote agent.",
    );
  }

  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("HAL A2A endpoint must use HTTPS, except for localhost development.");
  }
  return url.toString().replace(/\/$/, "");
}

function authHeaders(token?: string): Record<string, string> {
  const bearerToken = token ?? process.env.HAL_A2A_BEARER_TOKEN;
  return bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {};
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function getA2AAgentCard(options: A2AOptions = {}): Promise<A2AAgentCard> {
  const agentUrl = resolveAgentUrl(options.agentUrl);
  const response = await fetchWithTimeout(
    `${agentUrl}${DEFAULT_AGENT_CARD_PATH}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...authHeaders(options.bearerToken),
      },
    },
    options.timeoutMs ?? 15000,
  );

  if (!response.ok) {
    throw new Error(`A2A Agent Card request failed (${response.status}): ${await response.text()}`);
  }

  return (await response.json()) as A2AAgentCard;
}

function collectText(value: unknown, output: string[] = []): string[] {
  if (typeof value === "string") {
    const text = value.trim();
    if (text) output.push(text);
    return output;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectText(item, output);
    return output;
  }

  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (key === "text") collectText(item, output);
      else if (item && typeof item === "object") collectText(item, output);
    }
  }

  return output;
}

export async function sendA2AMessage(
  message: string,
  options: A2AOptions = {},
): Promise<A2AMessageResult> {
  const cleanMessage = message.trim();
  if (!cleanMessage) throw new Error("A2A message cannot be empty.");

  const agentUrl = resolveAgentUrl(options.agentUrl);
  const requestId = crypto.randomUUID();
  const messageId = crypto.randomUUID();

  const response = await fetchWithTimeout(
    `${agentUrl}${DEFAULT_MESSAGE_PATH}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...authHeaders(options.bearerToken),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: requestId,
        method: "message/send",
        params: {
          message: {
            messageId,
            role: "user",
            parts: [{ kind: "text", text: cleanMessage }],
          },
        },
      }),
    },
    options.timeoutMs ?? 30000,
  );

  const rawText = await response.text();
  let data: any;
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error(`A2A agent returned invalid JSON (${response.status}).`);
  }

  if (!response.ok) {
    throw new Error(`A2A message failed (${response.status}): ${rawText}`);
  }

  if (data?.error) {
    throw new Error(`A2A agent error: ${JSON.stringify(data.error)}`);
  }

  const result = data?.result ?? data;
  const texts = collectText(result);
  const status =
    typeof result?.status?.state === "string"
      ? result.status.state
      : typeof result?.status === "string"
        ? result.status
        : undefined;

  return {
    agentUrl,
    agentName: undefined,
    taskId: typeof result?.id === "string" ? result.id : undefined,
    status,
    text: texts.join("\n").trim() || "L'agent A2A a répondu sans texte exploitable.",
    raw: data,
  };
}
