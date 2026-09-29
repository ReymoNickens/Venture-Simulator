// The simulation engine's data contract. Everything here is plain,
// JSON-serialisable data so it can be stored, versioned and diffed.
import type { Pesewas } from "./money.ts";
import type { Param } from "./params.ts";

// ---------------------------------------------------------------- scenario

export interface ProductDef {
  id: string;
  name: string;
  /** What one unit is called ("plate", "pack"). */
  unit: string;
  /** Price customers compare against, in pesewas per unit. */
  referencePrice: Param;
  /** Cost paid per unit SOLD (packaging, cutlery), in pesewas. */
  perUnitCost: Param;
  defaultQualityTier: string;
}

export interface SegmentDef {
  id: string;
  name: string;
  /** People in this segment who could buy this kind of product. */
  marketSize: Param;
  /** People who notice the venture each period without marketing (location). */
  footfallReach: Param;
  /** Multiplies the product's reference price for this segment. */
  referencePriceMult: Param;
  /** 0 = ignores price, 1+ = very price-sensitive. */
  priceSensitivity: Param;
  qualitySensitivity: Param;
  brandSensitivity: Param;
  /** 0..1: how hard it is to leave once you are a customer. */
  switchingCost: Param;
  /** Units one customer buys per period. */
  purchaseFrequency: Param;
  /** 0..1: share of last period's customers who stay, all else equal. */
  retention: Param;
  /** 0..1: share of interested people who buy, when the offer is average. */
  conversionProbability: Param;
}

export interface QualityTierDef {
  id: string;
  label: string;
  /** Multiplies supplier unit price (better ingredients cost more). */
  unitCostMult: Param;
  /** 0..1 perceived quality. */
  quality: Param;
}

export interface SupplierDef {
  id: string;
  name: string;
  informal: boolean;
  /** Pesewas per unit, per product id. */
  unitPrice: Record<string, Param>;
  /** Periods between ordering and delivery (0 or 1). */
  leadTimePeriods: Param;
  /** Max units per order. */
  capacityUnits: Param;
  /** Chance an order is only partly delivered. */
  disruptionProbability: Param;
  /** Share of an order delivered when disrupted. */
  reliability: Param;
}

export type CompetitorStrategy = "steady" | "price_matcher" | "marketer" | "aggressive";

export interface CompetitorDef {
  id: string;
  name: string;
  informal: boolean;
  price: Param;
  unitCost: Param;
  quality: Param;
  capacityUnits: Param;
  reputation: Param;
  /** 0..1: how much of the market knows and considers them. */
  marketingStrength: Param;
  responseStrategy: CompetitorStrategy;
  /** Only appears when an event brings it in. */
  entersViaEvent?: boolean;
}

export interface FixedCostDef {
  id: string;
  label: string;
  amount: Param;
}

export type EventType = "market" | "operational" | "financial" | "competitive" | "infrastructure";
export type Severity = "low" | "medium" | "high";

export type EffectMetric =
  | "supplier_cost" // mult
  | "demand" // mult, optional segment
  | "capacity" // mult
  | "marketing_effectiveness" // mult
  | "fixed_cost" // add pesewas per period
  | "per_unit_cost" // add pesewas per unit sold
  | "reputation" // add points per period
  | "competitor_price" // mult
  | "spoilage" // mult
  | "awareness" // add people (spread by segment size)
  | "quality" // add 0..1
  | "switching_cost" // add 0..1
  | "new_competitor"; // competitorId

export interface Effect {
  metric: EffectMetric;
  value: number;
  segmentId?: string;
  competitorId?: string;
}

export interface EventResponseDef {
  id: string;
  label: string;
  description: string;
  /** One-off cost when chosen, in pesewas. */
  cost: Param;
  effects: Effect[];
}

export type TriggerMetric = "inventory_units" | "reputation" | "cash" | "customers";

export interface TriggerDef {
  metric: TriggerMetric;
  op: "gte" | "lte";
  value: number;
}

export interface EventDef {
  id: string;
  name: string;
  type: EventType;
  /** cohort = shared by every group (fairness); group = this venture only. */
  scope: "cohort" | "group";
  description: string;
  probability: Param;
  trigger: TriggerDef | null;
  /** Periods the event lasts, including the one it starts in. */
  duration: number;
  severity: Severity;
  affectedMetrics: string[];
  /** Applies in the period the event starts, before anyone can respond. */
  impact: Effect[];
  responses: EventResponseDef[];
  /** Applied automatically if the group does not respond in time. */
  defaultResponseId: string;
  /** Can happen at most once per run. */
  oncePerRun?: boolean;
}

export interface Scenario {
  id: string;
  version: number;
  name: string;
  family: "food" | "retail";
  description: string;
  periodLabel: string;
  periodCount: Param;
  startingCapital: Param;
  products: ProductDef[];
  segments: SegmentDef[];
  qualityTiers: QualityTierDef[];
  suppliers: SupplierDef[];
  competitors: CompetitorDef[];
  fixedCosts: FixedCostDef[];
  operations: {
    capacityUnitsPerPeriod: Param;
    backordersEnabled: boolean;
    /** Share of unsold stock lost each period. */
    spoilageRate: Param;
    maxOrderUnits: Param;
    /** Share of customers who could not buy (stock-out) that leave. */
    stockoutChurn: Param;
    /** Complaints per customer when quality is at its lowest. */
    lowQualityComplaintRate: Param;
  };
  marketing: {
    /** Pesewas to reach one person. */
    costPerReach: Param;
    awarenessDecay: Param;
    /** Share of aware non-customers who consider buying each period. */
    leadRate: Param;
    /** New people told per customer per period at full reputation. */
    referralRate: Param;
  };
  noise: { demandSigma: Param };
  reputation: { initial: Param };
  eventSettings: {
    /** Lecturer "event frequency" dial: multiplies every probability. */
    frequency: Param;
    firstEventPeriod: Param;
    maxNewCohortEventsPerPeriod: Param;
  };
  events: EventDef[];
}

// ------------------------------------------------------------------- state

export type TxCategory =
  | "capital"
  | "financing_in"
  | "revenue"
  | "inventory_purchase"
  | "variable_cost"
  | "marketing"
  | "fixed_cost"
  | "event_response"
  | "loan_interest"
  | "loan_principal";

export interface Transaction {
  /** `${period}:${seq}`, unique within a simulation. */
  id: string;
  period: number;
  category: TxCategory;
  /** Signed pesewas: + cash in, - cash out. */
  amount: Pesewas;
  memo: string;
  ref: string | null;
  /** The explanation line that produced this transaction. */
  explainId: string;
}

export interface InventoryState {
  units: number;
  /** Total cost of units held (weighted-average costing). */
  value: Pesewas;
}

export interface PipelineItem {
  productId: string;
  supplierId: string;
  units: number;
  unitCost: Pesewas;
  orderedPeriod: number;
  arrivesPeriod: number;
}

export interface CustomerState {
  aware: number;
  active: number;
}

export interface CompetitorState {
  id: string;
  name: string;
  active: boolean;
  basePrice: Pesewas;
  price: Pesewas;
  unitCost: Pesewas;
  quality: number;
  reputation: number;
  marketingStrength: number;
  capacityUnits: number;
  strategy: CompetitorStrategy;
  lastUnitsSold: number;
  lastShare: number;
  stockedOut: boolean;
}

export interface RepaymentInstalment {
  period: number;
  principal: Pesewas;
}

export interface Debt {
  id: string;
  source: FinancingSource;
  principal: Pesewas;
  balance: Pesewas;
  /** Interest per period on the outstanding balance, in basis points. */
  ratePerPeriodBp: number;
  schedule: RepaymentInstalment[];
  disbursedPeriod: number;
}

export interface ActiveEvent {
  instanceId: string;
  eventId: string;
  scope: "cohort" | "group";
  startedPeriod: number;
  /** Last period the event is in effect. */
  endsAfterPeriod: number;
  response: string | null;
  respondedPeriod: number | null;
  /** True when the default was applied because nobody responded. */
  responseWasDefault: boolean;
}

export interface PeriodSummary {
  period: number;
  revenue: Pesewas;
  profit: Pesewas;
  netCashFlow: Pesewas;
  operatingCashFlow: Pesewas;
  closingCash: Pesewas;
  customers: number;
  unitsSold: number;
  marketShare: number;
  avgPrice: Pesewas;
}

export type VentureStatus = "operating" | "cash_out" | "exited";

export interface SimState {
  engineVersion: string;
  scenarioId: string;
  scenarioVersion: number;
  simulationId: string;
  /** Last completed period; 0 before the first run. */
  period: number;
  status: VentureStatus;
  /** Append-only. Cash is ALWAYS the sum of these amounts. */
  ledger: Transaction[];
  inventory: Record<string, InventoryState>;
  pipeline: PipelineItem[];
  /** Keyed `${productId}:${segmentId}`. */
  customers: Record<string, CustomerState>;
  reputation: number;
  competitors: CompetitorState[];
  debts: Debt[];
  activeEvents: ActiveEvent[];
  /** Event ids that have ever occurred (for oncePerRun). */
  pastEventIds: string[];
  history: PeriodSummary[];
}

// ------------------------------------------------------------------ inputs

export interface ProductDecision {
  price: Pesewas;
  qualityTier: string;
  order: { supplierId: string; units: number } | null;
}

export interface Decisions {
  period: number;
  products: Record<string, ProductDecision>;
  marketingBudget: Pesewas;
  /** Optional weights per segment id; defaults to segment size. */
  marketingSplit?: Record<string, number>;
  /** instanceId -> responseId */
  eventResponses: Record<string, string>;
}

export interface CohortEventInstance {
  instanceId: string;
  eventId: string;
  period: number;
  origin: "drawn" | "injected";
}

export type FinancingSource = "founder" | "family" | "microfinance" | "bank" | "grant" | "investor";

/**
 * Money the server has approved through a real process (Slice C's loan
 * application, a grant, founder top-up). Never client-supplied.
 */
export interface FinancingDisbursement {
  id: string;
  source: FinancingSource;
  amount: Pesewas;
  loan: null | {
    ratePerPeriodBp: number;
    termPeriods: number;
    firstRepaymentPeriod: number;
  };
}

export interface PeriodInput {
  engineVersion: string;
  scenario: Scenario;
  state: SimState;
  decisions: Decisions;
  cohortEvents: CohortEventInstance[];
  /** Derived server-side from simulationId + period. Never client-supplied. */
  seed: string;
  financing?: FinancingDisbursement[];
}

// ----------------------------------------------------------------- outputs

export type Visibility = "student" | "lecturer";

export interface ExplanationLine {
  id: string;
  module: string;
  metric: string;
  value: number | string;
  text: string;
  inputs: {
    decisions?: string[];
    params?: string[];
    events?: string[];
    rng?: { stream: string; index: number; value: number }[];
    lines?: string[];
  };
  visibility: Visibility;
}

export interface SalesLine {
  productId: string;
  segmentId: string;
  units: number;
  price: Pesewas;
  amount: Pesewas;
}

export interface CostLine {
  label: string;
  amount: Pesewas;
  /** False for non-cash costs (cost of stock sold, spoilage write-off). */
  cash: boolean;
  explainId: string;
}

export interface SegmentOutcome {
  productId: string;
  segmentId: string;
  aware: number;
  leads: number;
  newCustomers: number;
  retained: number;
  churned: number;
  customers: number;
  demandUnits: number;
  unitsSold: number;
  unmetUnits: number;
  complaints: number;
  referrals: number;
}

export interface Outcomes {
  period: number;
  status: VentureStatus;
  salesLines: SalesLine[];
  revenue: Pesewas;
  variableCostLines: CostLine[];
  fixedCostLines: CostLine[];
  variableCosts: Pesewas;
  fixedCosts: Pesewas;
  profit: Pesewas;
  openingCash: Pesewas;
  closingCash: Pesewas;
  cashIn: Pesewas;
  cashOut: Pesewas;
  netCashFlow: Pesewas;
  operatingCashFlow: Pesewas;
  breakEvenUnits: number | null;
  breakEvenRevenue: Pesewas | null;
  /** Periods of cash left at the recent burn rate; null when not burning. */
  runwayPeriods: number | null;
  unitsDemanded: number;
  unitsSold: number;
  unmetUnits: number;
  customers: number;
  newCustomers: number;
  churned: number;
  complaints: number;
  referrals: number;
  awareness: number;
  marketShare: number;
  reputation: number;
  inventory: Record<string, { opening: number; purchased: number; sold: number; spoiled: number; closing: number }>;
  capacityUnits: number;
  debtOutstanding: Pesewas;
  assets: Pesewas;
  liabilities: Pesewas;
  segments: SegmentOutcome[];
  competitors: { id: string; name: string; price: Pesewas; unitsSold: number; share: number; stockedOut: boolean }[];
}

export interface EventOccurrence {
  instanceId: string;
  eventId: string;
  name: string;
  type: EventType;
  severity: Severity;
  scope: "cohort" | "group";
  description: string;
  status: "new" | "ongoing" | "final";
  startedPeriod: number;
  endsAfterPeriod: number;
  response: string | null;
  responseWasDefault: boolean;
  /** Responses the group can still choose (empty once one is chosen). */
  availableResponses: { id: string; label: string; description: string; cost: Pesewas }[];
  mustRespondBy: number | null;
}

export interface LearningSignal {
  code: string;
  severity: "info" | "warning" | "critical";
  message: string;
  /** A reflection question, never an answer. */
  prompt: string;
  metrics: Record<string, number>;
}

export interface PeriodOutput {
  engineVersion: string;
  period: number;
  seed: string;
  newState: SimState;
  transactions: Transaction[];
  outcomes: Outcomes;
  events: EventOccurrence[];
  explanation: ExplanationLine[];
  learningSignals: LearningSignal[];
}
