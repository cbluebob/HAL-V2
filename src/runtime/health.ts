export type RuntimeHealth = {
  openAIConfigured: boolean;
  moltbookConfigured: boolean;
  moltbookDelegationConfigured: boolean;
  readyForWebSearch: boolean;
  readyForAgentConsultation: boolean;
  readyForAgentDelegation: boolean;
};

export function getRuntimeHealth(
  env: NodeJS.ProcessEnv = process.env,
): RuntimeHealth {
  const openAIConfigured = Boolean(
    env.HAL_OPENAI_API_KEY ?? env.OPENAI_API_KEY,
  );
  const moltbookConfigured = Boolean(
    env.HAL_MOLTBOOK_API_KEY ?? env.MOLTBOOK_API_KEY,
  );
  const moltbookDelegationConfigured = Boolean(env.MOLTBOOK_DELEGATION_URL);

  return {
    openAIConfigured,
    moltbookConfigured,
    moltbookDelegationConfigured,
    readyForWebSearch: openAIConfigured,
    readyForAgentConsultation: openAIConfigured && moltbookConfigured,
    readyForAgentDelegation:
      openAIConfigured && moltbookConfigured && moltbookDelegationConfigured,
  };
}
