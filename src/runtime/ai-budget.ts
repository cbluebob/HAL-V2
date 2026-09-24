export type AIModel = "gpt-6-luna" | "gpt-6-sol" | "gpt-6-astra" | "gpt-5.6-luna" | "gpt-5.6-sol" | "gpt-5.6-terra";

export type AICallEstimate = {
  model: AIModel;
  inputTokens: number;
  outputTokens: number;
};

export type AIBudgetConfig = {
  maxCallsPerMission: number;
  maxEstimatedTokensPerMission: number;
  maxEstimatedCostUsdPerMission: number;
};

export type AIBudgetSnapshot = {
  calls: number;
  estimatedTokens: number;
  estimatedCostUsd: number;
  remainingCalls: number;
  remainingTokens: number;
  remainingCostUsd: number;
};

const MODEL_PRICING_USD_PER_MILLION: Record<AIModel, { input: number; output: number }> = {
  "gpt-6-luna": { input: 0.1, output: 0.5 },
  "gpt-6-sol": { input: 2, output: 10 },
  "gpt-6-astra": { input: 10, output: 50 },
  "gpt-5.6-luna": { input: 0.2, output: 1.2 },
  "gpt-5.6-sol": { input: 4, output: 20 },
  "gpt-5.6-terra": { input: 2, output: 12 },
};

export const DEFAULT_AI_BUDGET: AIBudgetConfig = {
  maxCallsPerMission: 6,
  maxEstimatedTokensPerMission: 20_000,
  maxEstimatedCostUsdPerMission: 0.25,
};

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number.`);
  }
}

export function estimateAICostUsd(estimate: AICallEstimate): number {
  assertFiniteNonNegative(estimate.inputTokens, "inputTokens");
  assertFiniteNonNegative(estimate.outputTokens, "outputTokens");

  const pricing = MODEL_PRICING_USD_PER_MILLION[estimate.model];

  return (
    (estimate.inputTokens * pricing.input +
      estimate.outputTokens * pricing.output) /
    1_000_000
  );
}

export function estimateTokensFromText(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export class AIBudgetGuard {
  private calls = 0;
  private estimatedTokens = 0;
  private estimatedCostUsd = 0;

  constructor(private readonly config: AIBudgetConfig = DEFAULT_AI_BUDGET) {
    if (!Number.isInteger(config.maxCallsPerMission) || config.maxCallsPerMission <= 0) {
      throw new Error("maxCallsPerMission must be a positive integer.");
    }
    assertFiniteNonNegative(
      config.maxEstimatedTokensPerMission,
      "maxEstimatedTokensPerMission",
    );
    assertFiniteNonNegative(
      config.maxEstimatedCostUsdPerMission,
      "maxEstimatedCostUsdPerMission",
    );
  }

  canReserve(estimate: AICallEstimate): { allowed: boolean; reason: string } {
    const estimatedTokens = estimate.inputTokens + estimate.outputTokens;
    const estimatedCostUsd = estimateAICostUsd(estimate);

    if (this.calls + 1 > this.config.maxCallsPerMission) {
      return {
        allowed: false,
        reason: "AI budget exhausted: maximum model-call count reached.",
      };
    }

    if (
      this.estimatedTokens + estimatedTokens >
      this.config.maxEstimatedTokensPerMission
    ) {
      return {
        allowed: false,
        reason: "AI budget exhausted: estimated token budget reached.",
      };
    }

    if (
      this.estimatedCostUsd + estimatedCostUsd >
      this.config.maxEstimatedCostUsdPerMission
    ) {
      return {
        allowed: false,
        reason: "AI budget exhausted: estimated cost budget reached.",
      };
    }

    return { allowed: true, reason: "AI call fits the current budget." };
  }

  reserve(estimate: AICallEstimate): void {
    const authorization = this.canReserve(estimate);
    if (!authorization.allowed) {
      throw new Error(authorization.reason);
    }

    this.calls += 1;
    this.estimatedTokens += estimate.inputTokens + estimate.outputTokens;
    this.estimatedCostUsd += estimateAICostUsd(estimate);
  }

  snapshot(): AIBudgetSnapshot {
    return {
      calls: this.calls,
      estimatedTokens: this.estimatedTokens,
      estimatedCostUsd: this.estimatedCostUsd,
      remainingCalls: Math.max(0, this.config.maxCallsPerMission - this.calls),
      remainingTokens: Math.max(
        0,
        this.config.maxEstimatedTokensPerMission - this.estimatedTokens,
      ),
      remainingCostUsd: Math.max(
        0,
        this.config.maxEstimatedCostUsdPerMission - this.estimatedCostUsd,
      ),
    };
  }

  reset(): void {
    this.calls = 0;
    this.estimatedTokens = 0;
    this.estimatedCostUsd = 0;
  }
}
