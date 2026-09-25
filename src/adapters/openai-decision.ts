import { routeModel, type AIModel } from "../runtime/model-router";
import { estimateTokensFromText } from "../runtime/ai-budget";
import type { ActionRisk } from "../guard/policy";
import type { Decision, Observation } from "../core/execution-engine";

type OpenAIResponse = {
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
};

function resolveOpenAIKey(explicit?: string): string | undefined {
  return explicit ?? process.env.HAL_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
}

function extractText(data: OpenAIResponse): string {
  return (data.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("\n")
    .trim();
}

function parseDecision(text: string, allowedActions: string[]): Decision {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? text;
  const value = JSON.parse(fenced) as Partial<Decision>;

  if (typeof value.action !== "string" || !value.action.trim()) {
    throw new Error("OpenAI decision did not contain a valid action.");
  }
  if (typeof value.reason !== "string") {
    throw new Error("OpenAI decision did not contain a valid reason.");
  }
  if (
    value.risk !== "low" &&
    value.risk !== "external" &&
    value.risk !== "financial" &&
    value.risk !== "legal" &&
    value.risk !== "irreversible"
  ) {
    throw new Error("OpenAI decision contained an invalid risk classification.");
  }

  const action = value.action.trim();
  if (allowedActions.length === 0) {
    throw new Error("No allowed actions were provided to the decision engine.");
  }
  if (!allowedActions.includes(action)) {
    throw new Error(`OpenAI selected an action that is not allowed: ${action}`);
  }

  return {
    action,
    reason: value.reason,
    risk: value.risk as ActionRisk,
    createsDebt: value.createsDebt === true,
  };
}

const SUPPORTED_MODELS: AIModel[] = [
  "gpt-5.6-luna",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
];

export async function openAIDecide(
  missionObjective: string,
  observation: Observation,
  options: { apiKey?: string; model?: string; allowedActions?: string[] } = {},
): Promise<Decision> {
  if (!missionObjective.trim()) throw new Error("Mission objective cannot be empty.");
  if (!observation.verified) throw new Error("Decision requires a verified observation.");

  const apiKey = resolveOpenAIKey(options.apiKey);
  if (!apiKey) {
    throw new Error("HAL_OPENAI_API_KEY is not configured. Decision was not executed.");
  }

  const preferredModel = SUPPORTED_MODELS.includes(options.model as AIModel)
    ? (options.model as AIModel)
    : undefined;
  const route = routeModel(
    `plan and decide the next safe action for: ${missionObjective}`,
    {
      preferredModel,
      allowExpensiveModel: process.env.HAL_ALLOW_EXPENSIVE_MODEL === "true",
    },
  );

  const prompt = [
    "You are HAL's decision engine.",
    "Choose exactly one next action from the verified facts below.",
    "Never invent facts, credentials, completed actions, money, or external results.",
    "Never choose an action that creates debt or credit.",
    "Sensitive financial, legal, irreversible, or signature actions must be represented as blocked rather than executed.",
    `Allowed actions: ${(options.allowedActions ?? []).join(", ") || "none specified"}.`,
    "Choose only an allowed action. If no allowed action can safely advance the mission, return an action with createsDebt=false and explain the limitation.",
    "Return JSON only with: action, reason, risk, createsDebt.",
    `Mission: ${missionObjective}`,
    `Observation: ${JSON.stringify(observation)}`,
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: route.model,
      input: prompt,
      reasoning: { effort: route.reasoningEffort },
      max_output_tokens: 500,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI decision failed (${response.status}): ${body}`);
  }

  const responseData = (await response.json()) as OpenAIResponse;
  const responseText = extractText(responseData);

  const decision = parseDecision(
    responseText,
    options.allowedActions ?? [],
  );
  decision.aiEstimate = {
    model: route.model,
    inputTokens: estimateTokensFromText(prompt),
    outputTokens: estimateTokensFromText(responseText),
  };
  return decision;
}
