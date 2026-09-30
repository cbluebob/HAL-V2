import { sendA2AMessage } from "./a2a-agent";

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

type FunctionCall = {
  type: "function_call";
  call_id: string;
  name: string;
  arguments: string;
};

function resolveApiKey(explicit?: string): string {
  const key = explicit ?? process.env.HAL_AGENTS_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!key) throw new Error("HAL_AGENTS_API_KEY or OPENAI_API_KEY is not configured.");
  return key;
}

function a2aEnabled(): boolean {
  return Boolean(process.env.HAL_A2A_AGENT_URL);
}

function buildTools(allowedDomains: string[]): unknown[] {
  const tools: unknown[] = [
    {
      type: "web_search",
      filters: {
        allowed_domains: allowedDomains,
      },
    },
  ];

  if (a2aEnabled()) {
    tools.push({
      type: "function",
      name: "a2a_send_message",
      description:
        "Send an informational message to the configured remote A2A agent and receive its response. " +
        "Use this only for research, analysis, coordination, or factual questions. " +
        "Never delegate payments, borrowing, financing, debt, signatures, legal commitments, or irreversible actions.",
      parameters: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "The precise informational request to send to the remote A2A agent.",
          },
        },
        required: ["message"],
        additionalProperties: false,
      },
      strict: true,
    });
  }

  return tools;
}

async function executeFunctionCall(call: FunctionCall): Promise<string> {
  if (call.name !== "a2a_send_message") {
    throw new Error(`Unsupported function tool: ${call.name}`);
  }

  let args: { message?: unknown };
  try {
    args = JSON.parse(call.arguments) as { message?: unknown };
  } catch {
    throw new Error("A2A tool arguments were not valid JSON.");
  }

  if (typeof args.message !== "string" || !args.message.trim()) {
    throw new Error("A2A tool requires a non-empty message.");
  }

  const result = await sendA2AMessage(args.message);
  return JSON.stringify({
    agentUrl: result.agentUrl,
    taskId: result.taskId ?? null,
    status: result.status ?? null,
    text: result.text,
  });
}

async function executeFunctionCalls(output: unknown): Promise<Array<{ type: "function_call_output"; call_id: string; output: string }>> {
  if (!Array.isArray(output)) return [];

  const calls = output.filter(
    (item): item is FunctionCall =>
      Boolean(item) &&
      typeof item === "object" &&
      (item as any).type === "function_call" &&
      typeof (item as any).call_id === "string" &&
      typeof (item as any).name === "string" &&
      typeof (item as any).arguments === "string",
  );

  return Promise.all(
    calls.map(async (call) => {
      try {
        return {
          type: "function_call_output" as const,
          call_id: call.call_id,
          output: await executeFunctionCall(call),
        };
      } catch (error) {
        return {
          type: "function_call_output" as const,
          call_id: call.call_id,
          output: JSON.stringify({
            ok: false,
            error: error instanceof Error ? error.message : "A2A tool execution failed.",
          }),
        };
      }
    }),
  );
}

async function createResponse(
  apiKey: string,
  baseUrl: string,
  body: Record<string, unknown>,
): Promise<any> {
  const response = await fetch(`${baseUrl}/v1/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI Responses API failed (${response.status}): ${detail}`);
  }

  const data = await response.json();
  if (data?.error) {
    throw new Error(`OpenAI Responses API returned an error: ${JSON.stringify(data.error)}`);
  }
  return data;
}

export async function runHostedAgentSession(
  options: HostedSessionOptions,
): Promise<HostedSessionResult> {
  const apiKey = resolveApiKey(options.apiKey);
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const model = options.model ?? process.env.HAL_OPENAI_MODEL ?? "gpt-5.6-sol";
  const allowedDomains = options.allowedDomains ?? ["api.openai.com", "www.moltbook.com"];
  const tools = buildTools(allowedDomains);

  let data = await createResponse(apiKey, baseUrl, {
    model,
    instructions:
      options.instructions ??
      "You are HAL_V4. Execute the assigned mission, verify real outcomes, never invent completion, and never create credit or debt.",
    input: options.input,
    tools,
  });

  const events: unknown[] = [];
  let guard = 0;

  while (guard++ < 4) {
    const functionOutputs = await executeFunctionCalls(data.output);
    if (functionOutputs.length === 0) break;

    data = await createResponse(apiKey, baseUrl, {
      model,
      instructions:
        options.instructions ??
        "You are HAL_V4. Execute the assigned mission, verify real outcomes, never invent completion, and never create credit or debt.",
      previous_response_id: data.id,
      input: functionOutputs,
      tools,
    });
  }

  const status = typeof data.status === "string" ? data.status : "unknown";
  const failed = status === "failed" || Boolean(data.error);
  const completed = !failed && status === "completed";
  const sessionId = typeof data.id === "string" ? data.id : "";

  events.push({
    type: "response.completed",
    id: sessionId,
    status,
    output_text: typeof data.output_text === "string" ? data.output_text : "",
    output: data.output ?? [],
  });

  return {
    sessionId,
    status,
    streamed: false,
    completed,
    failed,
    events,
  };
}

export async function streamHostedAgentResponse(
  options: HostedSessionOptions,
  onDelta: (delta: string) => void,
): Promise<{ sessionId: string; status: string }> {
  const apiKey = resolveApiKey(options.apiKey);
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const model = options.model ?? process.env.HAL_OPENAI_MODEL ?? "gpt-5.6-sol";
  const allowedDomains = options.allowedDomains ?? ["api.openai.com", "www.moltbook.com"];
  const tools = buildTools(allowedDomains);

  let input: unknown = options.input;
  let previousResponseId: string | undefined;
  let sessionId = "";
  let status = "in_progress";

  for (let turn = 0; turn < 4; turn++) {
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
        ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
        input,
        stream: true,
        tools,
      }),
    });

    if (!response.ok || !response.body) {
      const detail = await response.text();
      throw new Error(`OpenAI Responses streaming failed (${response.status}): ${detail}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const functionCalls = new Map<number, FunctionCall>();

    const handleEvent = (raw: string) => {
      const dataLine = raw.split("\n").find((line) => line.startsWith("data:"));
      if (!dataLine) return;
      const payload = dataLine.slice(5).trim();
      if (!payload || payload === "[DONE]") return;

      let event: any;
      try {
        event = JSON.parse(payload);
      } catch {
        return;
      }

      if (typeof event.response?.id === "string") sessionId = event.response.id;
      if (typeof event.response?.status === "string") status = event.response.status;

      if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
        onDelta(event.delta);
      }

      if (event.type === "response.output_item.added" && event.item?.type === "function_call") {
        const index = Number(event.output_index ?? 0);
        functionCalls.set(index, {
          type: "function_call",
          call_id: String(event.item.call_id ?? ""),
          name: String(event.item.name ?? ""),
          arguments: String(event.item.arguments ?? ""),
        });
      }

      if (event.type === "response.function_call_arguments.delta") {
        const index = Number(event.output_index ?? 0);
        const current = functionCalls.get(index);
        if (current) current.arguments += String(event.delta ?? "");
      }

      if (event.type === "response.function_call_arguments.done") {
        const index = Number(event.output_index ?? 0);
        const current = functionCalls.get(index);
        if (current) current.arguments = String(event.arguments ?? current.arguments);
      }

      if (event.type === "response.output_item.done" && event.item?.type === "function_call") {
        const index = Number(event.output_index ?? 0);
        functionCalls.set(index, {
          type: "function_call",
          call_id: String(event.item.call_id ?? ""),
          name: String(event.item.name ?? ""),
          arguments: String(event.item.arguments ?? ""),
        });
      }

      if (event.type === "response.failed") status = "failed";
      if (event.type === "response.completed") status = "completed";
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";
      for (const chunk of chunks) handleEvent(chunk);
    }

    buffer += decoder.decode();
    if (buffer.trim()) handleEvent(buffer);

    const calls = Array.from(functionCalls.values()).filter(
      (call) => call.call_id && call.name && call.arguments,
    );

    if (status === "failed") {
      throw new Error("HAL streaming response failed.");
    }

    if (calls.length === 0) {
      if (status !== "completed") {
        throw new Error(`HAL streaming response ended with status: ${status}`);
      }
      return { sessionId, status };
    }

    const functionOutputs = await Promise.all(
      calls.map(async (call) => ({
        type: "function_call_output" as const,
        call_id: call.call_id,
        output: await executeFunctionCall(call),
      })),
    );

    previousResponseId = sessionId;
    input = functionOutputs;
    status = "in_progress";
  }

  throw new Error("HAL A2A tool loop exceeded the safety limit.");
}
