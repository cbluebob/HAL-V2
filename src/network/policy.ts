export type NetworkPolicy = {
  useForStrategy: boolean;
  useForResearch: boolean;
  allowDelegation: boolean;
  allowCapabilityBrokerage: boolean;
  requireIndependentVerification: boolean;
  prohibitSensitiveData: boolean;
  prohibitCredentialSharing: boolean;
};

export const DEFAULT_NETWORK_POLICY: NetworkPolicy = {
  useForStrategy: true,
  useForResearch: true,
  allowDelegation: true,
  allowCapabilityBrokerage: true,
  requireIndependentVerification: true,
  prohibitSensitiveData: true,
  prohibitCredentialSharing: true,
};

export function sanitizeAgentContext(context: string): string {
  if (!context.trim()) return "";
  return context.trim();
}
