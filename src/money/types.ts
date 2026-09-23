export type OpportunityType =
  | "sale"
  | "service"
  | "refund"
  | "credit"
  | "job"
  | "digital_product"
  | "artwork"
  | "resale"
  | "other";

export type Opportunity = {
  id: string;
  title: string;
  type: OpportunityType;
  estimatedAmount: number;
  currency: "EUR";
  sourceUrl?: string;
  verified: boolean;
  requiresDebt: boolean;
  requiresUpfrontPayment: boolean;
  notes?: string;
};

export type MoneyMission = {
  targetAmount: number;
  currency: "EUR";
  deadline?: string;
  opportunities: Opportunity[];
};
