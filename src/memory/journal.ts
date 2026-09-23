import type { JournalEvent } from "../core/types";

const events: JournalEvent[] = [];

export function appendEvent(event: JournalEvent): void {
  if (!event.verified && event.type === "action.completed") {
    throw new Error("Unverified actions cannot be recorded as completed.");
  }
  events.push({ ...event });
}

export function getEvents(): readonly JournalEvent[] {
  return events.map((event) => ({ ...event }));
}
