import type {
  AgentAdvice,
  AgentExecutionResult,
  AgentNetworkProvider,
  AgentTask,
} from "./types";
import { openAIWebSearch } from "../adapters/openai-web-search";

export type MoltbookClientOptions = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  delegationUrl?: string;
};

type MoltbookResponse = {
  [key: string]: unknown;
};

export class MoltbookProvider implements AgentNetworkProvider {
  public readonly name = "moltbook";

  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly model?: string;
  private readonly delegationUrl?: string;

  constructor(options: MoltbookClientOptions = {}) {
    this.apiKey =
      options.apiKey ??
      process.env.HAL_MOLTBOOK_API_KEY ??
      process.env.MOLTBOOK_API_KEY;
    this.baseUrl = (
      options.baseUrl ??
      process.env.MOLTBOOK_BASE_URL ??
      "https://www.moltbook.com"
    ).replace(/\/$/, "");
    this.model = options.model ?? process.env.HAL_OPENAI_MODEL;
    this.delegationUrl =
      options.delegationUrl ?? process.env.MOLTBOOK_DELEGATION_URL;
  }

  private requireApiKey(): string {
    if (!this.apiKey) {
      throw new Error("HAL_MOLTBOOK_API_KEY is not configured.");
    }
    return this.apiKey;
  }

  private async api<T extends MoltbookResponse>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const key = this.requireApiKey();
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Moltbook API failed (${response.status}): ${body}`);
    }

    return (await response.json()) as T;
  }

  async getSkillInstructions(): Promise<string> {
    const response = await fetch(`${this.baseUrl}/skill.md`, {
      headers: { Accept: "text/markdown,text/plain,*/*" },
    });

    if (!response.ok) {
      throw new Error(`Moltbook skill instructions failed (${response.status}).`);
    }

    return response.text();
  }

  async getStatus(): Promise<MoltbookResponse> {
    return this.api<MoltbookResponse>("/api/v1/agents/status");
  }

  async getProfile(): Promise<MoltbookResponse> {
    return this.api<MoltbookResponse>("/api/v1/agents/me");
  }

  async consult(query: string): Promise<AgentAdvice[]> {
    if (!query.trim()) return [];

    const result = await openAIWebSearch(
      [
        "Search Moltbook for useful current discussions and agents relevant to this problem.",
        "Use only public information from Moltbook.",
        "Do not request, expose, or infer credentials, banking information, or private data.",
        `Question: ${query}`,
      ].join(" "),
      { model: this.model },
    );

    if (!result.searched || !result.text.trim()) return [];

    return [
      {
        agentId: "moltbook-public-network",
        role: "generalist",
        recommendation: result.text,
        sources: result.sources.map((source) => source.url),
        verified: false,
      },
    ];
  }

  async delegate(task: AgentTask): Promise<AgentExecutionResult> {
    if (!this.delegationUrl) {
      return {
        taskId: task.id,
        executed: false,
        verified: false,
        message:
          "Moltbook consultation is connected, but no real delegation endpoint is configured.",
      };
    }

    const response = await fetch(this.delegationUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.requireApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        task,
        source: "HAL-V2",
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return {
        taskId: task.id,
        executed: false,
        verified: false,
        message: `Delegation failed (${response.status}): ${body}`,
      };
    }

    const data = (await response.json()) as {
      executed?: boolean;
      verified?: boolean;
      message?: string;
      data?: unknown;
    };

    return {
      taskId: task.id,
      executed: data.executed === true,
      verified: data.verified === true,
      message: data.message ?? "Delegation response received.",
      data: data.data,
    };
  }
}
