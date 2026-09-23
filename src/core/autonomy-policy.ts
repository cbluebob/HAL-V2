export type AutonomyMode = "persistent_until_objective";

export type AutonomousExecutionPolicy = {
  mode: AutonomyMode;
  requireUserApprovalForOrdinaryActions: boolean;
  stopOnlyWhenObjectiveVerified: boolean;
  allowConnectedWebResources: boolean;
  allowConnectedSocialResources: boolean;
  allowAgentNetworkEscalation: boolean;
  allowAutonomousProductCreation: boolean;
  allowAutonomousListing: boolean;
  maxConcurrentActions: number;
};

export const DEFAULT_AUTONOMOUS_EXECUTION_POLICY: AutonomousExecutionPolicy = {
  mode: "persistent_until_objective",
  requireUserApprovalForOrdinaryActions: false,
  stopOnlyWhenObjectiveVerified: true,
  allowConnectedWebResources: true,
  allowConnectedSocialResources: true,
  allowAgentNetworkEscalation: true,
  allowAutonomousProductCreation: true,
  allowAutonomousListing: true,
  maxConcurrentActions: 3,
};
