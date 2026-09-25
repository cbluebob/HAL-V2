export type HostedVaultCheck = {
  configured: boolean;
  reachable: boolean;
  status?: number;
  error?: "missing" | "unauthorized" | "request_failed";
};

export async function checkHostedOpenAIVault(): Promise<HostedVaultCheck> {
  const key = process.env.HAL_OPENAI_API_KEY;
  if (!key) {
    return { configured: false, reachable: false, error: "missing" };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (response.status === 401 || response.status === 403) {
      return {
        configured: true,
        reachable: false,
        status: response.status,
        error: "unauthorized",
      };
    }

    return {
      configured: true,
      reachable: response.ok,
      status: response.status,
    };
  } catch {
    return {
      configured: true,
      reachable: false,
      error: "request_failed",
    };
  }
}
