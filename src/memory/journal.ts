import type { JournalEvent } from "../core/types";

const events: JournalEvent[] = [];

export function appendEvent(event: JournalEvent): void {
  const completionTypes = new Set([
    "action.completed",
    "mission.completed",
    "hal.execution.completed",
    "resource.completed",
  ]);

  if (!event.verified && completionTypes.has(event.type)) {
    throw new Error("Unverified events cannot be recorded as completed.");
  }
  events.push({ ...event });
}

export function getEvents(): readonly JournalEvent[] {
  return events.map((event) => ({ ...event }));
}
