import { openAIDecide } from "../adapters/openai-decision";
import { webSearchTool } from "../tools/web-search";
import { registerBuiltInTools } from "../tools/builtins";
import type { HALExecutionAdapters } from "./execution-engine";
import type { Mission } from "./types";

export function createWebResearchMissionAdapters(): HALExecutionAdapters {
  registerBuiltInTools();

  return {
    async observe(mission: Mission) {
      const result = await webSearchTool.execute(
        { query: mission.objective },
        { missionId: mission.id },
      );

      if (!result.searched || !result.text.trim()) {
        return {
          summary: "Web search returned no verified search result.",
          facts: [],
          verified: false,
        };
      }

      return {
        summary: "Current web research completed.",
        facts: [result.text, ...result.sources.map((source) => source.url)],
        verified: result.sources.length > 0,
      };
    },

    async decide({ mission, observation }) {
      return openAIDecide(mission.objective, observation, {
        allowedActions: [webSearchTool.name],
      });
    },

    async toolAction({ mission, decision }) {
      if (decision.action !== webSearchTool.name) {
        return undefined;
      }

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
      return searched && text;
    },
  };
}
