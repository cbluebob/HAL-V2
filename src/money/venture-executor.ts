import type { Opportunity } from "./types";
import type { VentureCandidate } from "./venture";

export type VentureExecutionAdapter = {
  name: string;
  supports: (candidate: VentureCandidate) => boolean;
  create: (candidate: VentureCandidate) => Promise<{
    ok: boolean;
    verified: boolean;
    message: string;
    listingUrl?: string;
    opportunity?: Opportunity;
  }>;
};

export async function executeVentureCandidate(
  candidate: VentureCandidate,
  adapters: VentureExecutionAdapter[],
) {
  if (candidate.debtRequired || candidate.upfrontCost > 0) {
    return {
      ok: false,
      verified: false,
      message: "Venture candidate is not eligible for the current zero-debt / zero-upfront policy.",
    };
  }

  const adapter = adapters.find((item) => item.supports(candidate));

  if (!adapter) {
    return {
      ok: false,
      verified: false,
      message: `No real execution adapter is connected for ${candidate.mode}.`,
    };
  }

  return adapter.create(candidate);
}
