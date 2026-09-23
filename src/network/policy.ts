export type NetworkPolicy = {
  useForStrategy: boolean;
  useForResearch: boolean;
  allowDelegation: boolean;
  requireIndependentVerification: boolean;
  prohibitSensitiveData: boolean;
};

export const DEFAULT_NETWORK_POLICY: NetworkPolicy = {
  useForStrategy: true,
  useForResearch: true,
  allowDelegation: true,
  requireIndependentVerification: true,
  prohibitSensitiveData: true,
};

export function sanitizeAgentContext(context: string): string {
  if (!context.trim()) return "";

  // Network context must not contain secrets or unnecessary private data.
  // Callers are responsible for removing credentials, private documents and
  // confidential client/banking information before sending context.
  return context.trim();
}
