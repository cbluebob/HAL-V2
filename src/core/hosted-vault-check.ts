export type HostedVaultCheck = {
  configured: boolean;
  reachable: boolean;
  status?: number;
};

export async function checkHostedOpenAIVault(): Promise<HostedVaultCheck> {
  const key = process.env.HAL_OPENAI_API_KEY;
  if (!key) {
    return { configured: false, reachable: false };
  }

  const response = await fetch("https://api.openai.com/v1/models", {
    method: "GET",
    headers: { Authorization: `Bearer ${key}` },
  });

  return {
    configured: true,
    reachable: response.ok,
    status: response.status,
  };
}
