import { openAIWebSearch } from "../adapters/openai-web-search";
import type { Opportunity, OpportunityType } from "./types";

export type MoneyResearch = {
  query: string;
  sources: Array<{ url: string }>;
  opportunities: Opportunity[];
  rawText: string;
};

function inferType(text: string): OpportunityType {
  const value = text.toLowerCase();
  if (value.includes("job") || value.includes("emploi") || value.includes("mission")) return "job";
  if (value.includes("vente") || value.includes("vendre") || value.includes("leboncoin")) return "sale";
  if (value.includes("remboursement") || value.includes("avoir")) return "refund";
  if (value.includes("service") || value.includes("prestation")) return "service";
  return "other";
}

function extractOpportunities(text: string, sources: Array<{ url: string }>): Opportunity[] {
  const amountPattern = /(\d+(?:[.,]\d{1,2})?)\s*(?:€|euros?)/gi;
  const matches = [...text.matchAll(amountPattern)];
  const uniqueAmounts = [...new Set(matches.map((m) => Number(m[1].replace(",", "."))))];

  return uniqueAmounts
    .filter((amount) => amount > 0 && amount <= 100000)
    .map((amount, index) => ({
      id: `web-${index + 1}`,
      title: "Candidate opportunity from web research",
      type: inferType(text),
      estimatedAmount: amount,
      currency: "EUR" as const,
      sourceUrl: sources[index]?.url ?? sources[0]?.url,
      verified: false,
      requiresDebt: false,
      requiresUpfrontPayment: false,
      notes: "Extracted from search results; requires independent verification.",
    }));
}

export async function researchMoneyOpportunities(
  targetAmount: number,
  location = "France",
): Promise<MoneyResearch> {
  const query = [
    `Find legal ways to earn or recover at least ${targetAmount} EUR without loans, debt, overdraft, BNPL, or upfront borrowing.`,
    `Location: ${location}.`,
    "Prioritize concrete current opportunities, paid services, jobs, legitimate sales, refunds or credits.",
    "Do not treat an advertised amount as money already earned. Return source URLs and distinguish leads from verified results.",
  ].join(" ");

  const result = await openAIWebSearch(query);

  return {
    query,
    sources: result.sources,
    opportunities: extractOpportunities(result.text, result.sources),
    rawText: result.text,
  };
}
