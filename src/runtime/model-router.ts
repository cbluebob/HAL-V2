export type { AIModel } from "./ai-budget";
import type { AIModel } from "./ai-budget";

export type TaskClass = "routine" | "reasoning" | "complex";

export type ModelRoute = {
  taskClass: TaskClass;
  model: AIModel;
  reasoningEffort: "none" | "low" | "medium" | "high";
  rationale: string;
};

const COMPLEX_PATTERNS = [
  /architecture/i,
  /program/i,
  /code/i,
  /debug/i,
  /security/i,
  /legal/i,
  /contract/i,
  /multi[- ]step/i,
  /analyse.*complex/i,
  /complex/i,
  /strategy/i,
];

const REASONING_PATTERNS = [
  /compare/i,
  /research/i,
  /verify/i,
  /synth/i,
  /explain/i,
  /plan/i,
  /decision/i,
  /investigate/i,
];

function classifyTask(task: string): TaskClass {
  if (COMPLEX_PATTERNS.some((pattern) => pattern.test(task))) return "complex";
  if (REASONING_PATTERNS.some((pattern) => pattern.test(task))) return "reasoning";
  return "routine";
}

export function routeModel(
  task: string,
  options: { preferredModel?: AIModel; allowExpensiveModel?: boolean } = {},
): ModelRoute {
  const taskClass = classifyTask(task);

  if (options.preferredModel) {
    const model = options.preferredModel;
    return {
      taskClass,
      model,
      reasoningEffort: model === "gpt-5.6-sol" ? "low" : "low",
      rationale: "Explicit model preference supplied by the runtime.",
    };
  }

  if (taskClass === "complex" && options.allowExpensiveModel !== false) {
    return {
      taskClass,
      model: "gpt-5.6-sol",
      reasoningEffort: "low",
      rationale: "Complex or multi-step task requires the strongest reasoning tier.",
    };
  }

  if (taskClass === "complex") {
    return {
      taskClass,
      model: "gpt-5.6-sol",
      reasoningEffort: "low",
      rationale: "Complex task uses Sol because expensive Astra routing is disabled.",
    };
  }

  if (taskClass === "reasoning") {
    return {
      taskClass,
      model: "gpt-5.6-sol",
      reasoningEffort: "low",
      rationale: "Reasoning task uses the middle capability/cost tier.",
    };
  }

  return {
    taskClass,
    model: "gpt-5.6-luna",
    reasoningEffort: "low",
    rationale: "Routine task uses the cost-efficient high-volume tier.",
  };
}
