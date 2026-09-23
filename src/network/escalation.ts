import type { AgentAdvice, AgentNetworkProvider } from "./types";

export type StrategyEscalation = {
  triggered: boolean;
  round: number;
  advice: AgentAdvice[];
};

export async function escalateStrategy(
  provider: AgentNetworkProvider | undefined,
  objective: string,
  round: number,
): Promise<StrategyEscalation> {
  if (!provider) {
    return { triggered: false, round, advice: [] };
  }

  const query = [
    "HAL has not reached its objective with its currently connected resources.",
    "Provide practical, legal, debt-free alternative strategies.",
    "Do not suggest loans, overdrafts, BNPL, hidden financing, or actions requiring unauthorized financial commitments.",
    `Objective: ${objective}`,
  ].join(" ");

  const advice = await provider.consult(query);

  return {
    triggered: true,
    round,
    advice,
  };
}
