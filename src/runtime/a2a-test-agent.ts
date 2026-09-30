import { createServer } from "node:http";

const host = "127.0.0.1";
const port = Number(process.env.HAL_A2A_TEST_PORT ?? 8788);

const agentCard = {
  name: "HAL Research Agent (local test)",
  description: "Local A2A protocol test agent. It returns a deterministic research acknowledgment.",
  url: `http://${host}:${port}`,
  version: "0.1.0",
  capabilities: { streaming: false },
  skills: [
    {
      id: "research",
      name: "Research",
      description: "Receives research missions and returns a structured acknowledgment.",
    },
  ],
};

function json(res: any, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/.well-known/agent.json") {
    return json(res, 200, agentCard);
  }

  if (req.method === "POST" && req.url === "/message/send") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    let body: any;

    try {
      body = JSON.parse(raw);
    } catch {
      return json(res, 400, {
        jsonrpc: "2.0",
        error: { code: -32700, message: "Invalid JSON." },
      });
    }

    const message = body?.params?.message;
    const text =
      Array.isArray(message?.parts)
        ? message.parts
            .filter((part: any) => part?.kind === "text" && typeof part.text === "string")
            .map((part: any) => part.text.trim())
            .filter(Boolean)
            .join("\n")
        : "";

    if (!text) {
      return json(res, 400, {
        jsonrpc: "2.0",
        id: body?.id ?? null,
        error: { code: -32602, message: "A text message is required." },
      });
    }

    return json(res, 200, {
      jsonrpc: "2.0",
      id: body?.id ?? null,
      result: {
        id: message.messageId,
        status: { state: "completed" },
        artifacts: [
          {
            parts: [
              {
                kind: "text",
                text:
                  "RESEARCH_AGENT_OK\n" +
                  "Mission received and acknowledged by the local A2A Research Agent.\n" +
                  "The remote-agent transport is operational.\n" +
                  "Mission: " +
                  text,
              },
            ],
          },
        ],
      },
    });
  }

  return json(res, 404, { error: "Not found." });
});

server.listen(port, host, () => {
  console.log(`HAL A2A Research Agent listening on http://${host}:${port}`);
});
