export type MissionStatus = "pending" | "running" | "blocked" | "completed" | "failed";

export type Mission = {
  id: string;
  objective: string;
  status: MissionStatus;
  createdAt: string;
};

export type ActionResult = {
  ok: boolean;
  action: string;
  message: string;
  verified: boolean;
  data?: unknown;
};

export type JournalEvent = {
  id: string;
  timestamp: string;
  type: string;
  message: string;
  missionId?: string;
  verified: boolean;
};
