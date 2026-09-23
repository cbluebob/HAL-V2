import type { ActionResult, Mission } from "./types";
import { guardAction } from "../guard/policy";

export function createMission(objective: string): Mission {
  if (!objective.trim()) throw new Error("Mission objective cannot be empty.");

  return {
    id: crypto.randomUUID(),
    objective: objective.trim(),
    status: "pending",
    createdAt: new Date().toISOString(),
  };
}

export function authorizeAction(action: {
  type: string;
  risk: "low" | "financial" | "external" | "legal" | "irreversible";
  createsDebt?: boolean;
}) {
  return guardAction(action);
}

export function verifiedSuccess(result: ActionResult): boolean {
  return result.ok === true && result.verified === true;
}
