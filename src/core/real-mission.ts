import { openAIDecide } from "../adapters/openai-decision";
import { webSearchTool } from "../tools/web-search";
import { registerBuiltInTools } from "../tools/builtins";
import type { HALExecutionAdapters } from "./execution-engine";
import type { Mission } from "./types";

export function createWebResearchMissionAdapters(): HALExecutionAdapters {
  registerBuiltInTools();

  return {
    async observe(mission: Mission) {
      return {
        summary: "Mission objective received and ready for verified research.",
        facts: [mission.objective],
        verified: true,
      };
    },

    async decide({ mission, observation }) {
      return openAIDecide(mission.objective, observation, {
        allowedActions: [webSearchTool.name],
      });
    },

    async toolAction({ mission, decision }) {
      if (decision.action !== webSearchTool.name) return undefined;

      return {
        toolName: webSearchTool.name,
        input: { query: mission.objective },
        risk: "low",
        createsDebt: false,
      };
    },

    async control({ result }) {
      if (!result.ok || !result.verified) return false;

      const data = result.data;
      if (!data || typeof data !== "object") return false;

      const searched = "searched" in data && data.searched === true;
      const text = "text" in data && typeof data.text === "string" && data.text.trim().length > 0;
      const sources = "sources" in data && Array.isArray(data.sources) && data.sources.length > 0;
      const sourceList = sources ? (data.sources as unknown[]) : [];
      const hasValidSource = sourceList.some((source) => {
        if (!source || typeof source !== "object") return false;
        const url = "url" in source ? source.url : undefined;
        return typeof url === "string" && /^https?:\/\//i.test(url);
      });

      return searched && text && sourceList.length >= 1 && hasValidSource;
    },
  };
}
