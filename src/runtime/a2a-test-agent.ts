import { createServer } from "node:http";

const host = "127.0.0.1";
const port = Number(process.env.HAL_A2A_TEST_PORT ?? 8788);
const openAIBaseUrl = process.env.HAL_OPENAI_BASE_URL ?? "https://api.openai.com";
const researchModel = process.env.HAL_RESEARCH_MODEL ?? "gpt-5.6-sol";

const agentCard = {
  name: "HAL Research Agent",
  description:
    "Research agent for source-backed web research. It searches current public sources, cross-checks claims, and returns structured findings to HAL.",
  url: `http://${host}:${port}`,
  version: "0.2.0",
  capabilities: { streaming: false },
  skills: [
    {
      id: "research",
      name: "Web Research",
      description:
        "Searches current public sources and returns source-backed findings without claiming unsupported verification.",
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

function resolveApiKey(): string {
  const key = process.env.HAL_RESEARCH_API_KEY ?? process.env.HAL_AGENTS_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("HAL_RESEARCH_API_KEY, HAL_AGENTS_API_KEY or OPENAI_API_KEY is not configured.");
  }
  return key;
}

function collectSources(value: unknown, output: Array<{ title?: string; url: string }> = []): Array<{ title?: string; url: string }> {
  if (Array.isArray(value)) {
    for (const item of value) collectSources(item, output);
    return output;
  }

  if (!value || typeof value !== "object") return output;

  const item = value as Record<string, any>;

  if (item.type === "url_citation" && typeof item.url === "string") {
    output.push({
      title: typeof item.title === "string" ? item.title : undefined,
      url: item.url,
    });
  }

  if (item.type === "url" && typeof item.url === "string") {
    output.push({
      title: typeof item.title === "string" ? item.title : undefined,
      url: item.url,
    });
  }

  if (item.sources && Array.isArray(item.sources)) {
    for (const source of item.sources) {
      if (source && typeof source.url === "string") {
        output.push({
          title: typeof source.title === "string" ? source.title : undefined,
          url: source.url,
        });
      }
    }
  }

  for (const child of Object.values(item)) {
    if (child && typeof child === "object") collectSources(child, output);
  }

  return output;
}

function uniqueSources(sources: Array<{ title?: string; url: string }>) {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  });
}

const RESEARCH_INSTRUCTIONS = `
You are the HAL Research Agent.

Your role is ONLY research and analysis. You do not purchase, pay, register, contact people, sign contracts, create debt, borrow money, or take irreversible actions.

For every mission:
1. Search the current public Web using the web_search tool.
2. Prefer primary/direct sources: official platform pages, official terms, official pricing, government pages, official documentation, or the actual opportunity page.
3. Cross-check important claims with more than one source whenever practical.
4. Treat a source-backed fact as evidence, not as proof of guaranteed income or guaranteed acceptance.
5. For opportunities, explicitly check eligibility, country/region, fees or upfront costs, payment method, payment timing, workload, and important constraints.
6. Reject or clearly separate anything requiring credit, debt, financing, an upfront investment, speculative trading, fraud, fake reviews, pyramid schemes, or other illegal activity.
7. Never invent a URL, price, deadline, payout, eligibility rule, or availability.
8. Return concise findings with source URLs and a clear distinction between VERIFIED/SOURCE-BACKED and NOT VERIFIED.
9. If the evidence is insufficient, say so instead of filling the gap.

Return this structure:
STATUS: COMPLETED or INSUFFICIENT_EVIDENCE
MISSION: <short restatement>
VERIFIED / SOURCE-BACKED FINDINGS:
- <finding>
- Evidence:
- Estimated revenue:
- Time/workload:
- Payment timing:
- Constraints:
- Sources: <URLs>
NOT VERIFIED / REJECTED:
- <item and reason>
LIMITATIONS:
- <important uncertainty>
`;

async function runResearch(mission: string) {
  const apiKey = resolveApiKey();

  const response = await fetch(`${openAIBaseUrl}/v1/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: researchModel,
      instructions: RESEARCH_INSTRUCTIONS,
      input: mission,
      tools: [{ type: "web_search" }],
    }),
  });

  const raw = await response.text();

  if (!response.ok) {
    throw new Error(`Research Agent OpenAI request failed (${response.status}): ${raw}`);
  }

  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Research Agent received invalid JSON from OpenAI.");
  }

  const outputText =
    typeof data.output_text === "string"
      ? data.output_text.trim()
      : "";

  const sources = uniqueSources(collectSources(data));

  return {
    status: typeof data.status === "string" ? data.status : "unknown",
    outputText,
    sources,
    responseId: typeof data.id === "string" ? data.id : undefined,
  };
}

const server = createServer(async (req, res) => {
  try {
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
      const mission =
        Array.isArray(message?.parts)
          ? message.parts
              .filter((part: any) => part?.kind === "text" && typeof part.text === "string")
              .map((part: any) => part.text.trim())
              .filter(Boolean)
              .join("\n")
          : "";

      if (!mission) {
        return json(res, 400, {
          jsonrpc: "2.0",
          id: body?.id ?? null,
          error: { code: -32602, message: "A text research mission is required." },
        });
      }

      const research = await runResearch(mission);

      const evidenceStatus =
        research.sources.length > 0 && research.outputText
          ? "source-backed"
          : "insufficient-evidence";

      const sourceText =
        research.sources.length > 0
          ? research.sources
              .map((source) => `- ${source.title ? source.title + " — " : ""}${source.url}`)
              .join("\n")
          : "- No URL citations were returned by the research response.";

      const artifactText =
        "RESEARCH_AGENT_RESULT\n" +
        `Evidence status: ${evidenceStatus}\n` +
        `OpenAI response: ${research.responseId ?? "unknown"}\n\n` +
        research.outputText +
        "\n\nSOURCES CAPTURED BY AGENT:\n" +
        sourceText;

      return json(res, 200, {
        jsonrpc: "2.0",
        id: body?.id ?? null,
        result: {
          id: message.messageId,
          status: { state: "completed" },
          metadata: {
            evidenceStatus,
            sourceCount: research.sources.length,
            responseId: research.responseId ?? null,
          },
          artifacts: [
            {
              parts: [{ kind: "text", text: artifactText }],
            },
          ],
        },
      });
    }

    return json(res, 404, { error: "Not found." });
  } catch (error) {
    return json(res, 500, {
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32000,
        message: error instanceof Error ? error.message : "Research Agent failed.",
      },
    });
  }
});

server.listen(port, host, () => {
  console.log(`HAL A2A Research Agent listening on http://${host}:${port}`);
  console.log(`Research model: ${researchModel}`);
});
