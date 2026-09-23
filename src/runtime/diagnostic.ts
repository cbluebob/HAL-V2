import { getRuntimeHealth } from "./health";

type DiagnosticStatus = "PASS" | "FAIL";

export type RuntimeDiagnostic = {
  status: DiagnosticStatus;
  checks: {
    openAIConfigured: boolean;
    moltbookConfigured: boolean;
    moltbookDelegationConfigured: boolean;
    readyForWebSearch: boolean;
    readyForAgentConsultation: boolean;
    readyForAgentDelegation: boolean;
  };
};

export function runRuntimeDiagnostic(
  env: NodeJS.ProcessEnv = process.env,
): RuntimeDiagnostic {
  const health = getRuntimeHealth(env);

  const status: DiagnosticStatus =
    health.openAIConfigured && health.moltbookConfigured
      ? "PASS"
      : "FAIL";

  return {
    status,
    checks: {
      openAIConfigured: health.openAIConfigured,
      moltbookConfigured: health.moltbookConfigured,
      moltbookDelegationConfigured: health.moltbookDelegationConfigured,
      readyForWebSearch: health.readyForWebSearch,
      readyForAgentConsultation: health.readyForAgentConsultation,
      readyForAgentDelegation: health.readyForAgentDelegation,
    },
  };
}
