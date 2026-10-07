// Scenario: the group's own venture, built from numbers they collected.
//
// Instead of everyone practising on the same food stall, each group answers
// a short set of questions about their own idea (what they sell, what one
// costs them, what customers say they would pay, the alternatives and their
// prices, how many people have the problem each week, how many they can
// provide, their weekly running costs). Those become the market below.
//
// What students enter is THEIR claim, flagged `assumption` with a note on
// where it came from. The behavioural settings (how price-sensitive people
// are, how many interested people buy) are game-design parameters copied
// from the reference scenario and never shown to students.
//
// Fairness (ADR 0004): every class still faces the same outside events.
// They are drawn once per class from the class's scenario, so the events
// here reuse exactly the same ids and durations, worded so they fit any
// venture rather than a food stall.
import { assumed, type Param } from "../params.ts";
import type { CompetitorDef, EventDef, FixedCostDef, Scenario } from "../types.ts";
import { campusFoodStall } from "./campus-food-stall.ts";

export const OWN_VENTURE_SCENARIO_ID = "own-venture";

export type OfferKind = "goods" | "service";

/** What a group tells us about their venture. Money in pesewas. */
export interface VentureNumbers {
  /** What they sell, e.g. "Shuttle seat booking". */
  offer: string;
  /** What one is called, e.g. "seat", "print", "meal". */
  unit: string;
  /** Goods can be kept (some may go to waste); a service unused this week is lost. */
  kind: OfferKind;
  /** What it costs the group to provide one. */
  costPerUnit: number;
  /** What customers say they would pay for one. */
  price: number;
  /** What people use now, and what it costs them. */
  alternatives: { name: string; price: number }[];
  /** People with the problem, near where they would sell, in a week. */
  peoplePerWeek: number;
  /** How many times a week one customer would buy. */
  buysPerWeek: number;
  /** The most they can provide in a week. */
  capacityPerWeek: number;
  /** Goods only: share of unsold stock lost each week (0..1). */
  wasteShare: number;
  /** Weekly running costs. */
  fixedCosts: { label: string; amount: number }[];
  /** Where each key number came from: an evidence item id, or null for a guess. */
  sources?: Partial<Record<"costPerUnit" | "price" | "peoplePerWeek", string | null>>;
}

const DESIGN = "Game-design parameter controlling model behaviour, not a real-world statistic.";
const d = (value: number): Param => assumed(value, DESIGN);
const theirs = (value: number, what: string): Param =>
  assumed(value, `The group's own figure for ${what}, from their evidence or their best guess.`);

/** Plain-language problems with a set of numbers, empty when it can be simulated. */
export function checkVentureNumbers(n: VentureNumbers): string[] {
  const problems: string[] = [];
  const money = (v: number) => Number.isSafeInteger(v) && v > 0;
  if (!n.offer.trim()) problems.push("Say what you sell.");
  if (!n.unit.trim()) problems.push("Say what one of them is called, e.g. seat, print or meal.");
  if (!money(n.costPerUnit)) problems.push("Enter what one costs you to provide.");
  if (!money(n.price)) problems.push("Enter what customers say they would pay for one.");
  if (!Number.isInteger(n.peoplePerWeek) || n.peoplePerWeek < 10 || n.peoplePerWeek > 200000) {
    problems.push("Enter how many people have the problem each week (at least 10).");
  }
  if (!(n.buysPerWeek > 0 && n.buysPerWeek <= 21)) problems.push("Enter how often one customer would buy in a week.");
  if (!Number.isInteger(n.capacityPerWeek) || n.capacityPerWeek < 1 || n.capacityPerWeek > 100000) {
    problems.push("Enter the most you could provide in a week.");
  }
  if (n.kind === "goods" && !(n.wasteShare >= 0 && n.wasteShare <= 1)) problems.push("Say how much unsold stock goes to waste.");
  for (const a of n.alternatives) {
    if (!a.name.trim() || !money(a.price)) problems.push("Each alternative needs a name and a price above zero.");
  }
  for (const f of n.fixedCosts) {
    if (!f.label.trim() || !Number.isSafeInteger(f.amount) || f.amount < 0) problems.push("Each running cost needs a name and an amount.");
  }
  return [...new Set(problems)];
}

function events(n: VentureNumbers): EventDef[] {
  const reference = n.price;
  const a = (value: number): Param => assumed(value, DESIGN);
  const list: EventDef[] = [
    {
      id: "supplier_price_rise",
      name: "Your costs go up",
      type: "operational",
      scope: "cohort",
      description: "Prices rise in the market, so everything you buy to provide your service or product costs more.",
      probability: d(0.15),
      trigger: null,
      duration: 2,
      severity: "high",
      affectedMetrics: ["cost per unit", "margin"],
      impact: [{ metric: "supplier_cost", value: 1.2 }],
      responses: [
        { id: "absorb", label: "Absorb it", description: "Carry on and accept a thinner margin.", cost: a(0), effects: [{ metric: "supplier_cost", value: 1.2 }] },
        { id: "negotiate_bulk", label: "Buy in bulk", description: "Pay a deposit for a better rate.", cost: a(20000), effects: [{ metric: "supplier_cost", value: 1.08 }] },
        { id: "cut_corners", label: "Cut corners", description: "Cheaper inputs. Customers may notice.", cost: a(0), effects: [{ metric: "supplier_cost", value: 1.04 }, { metric: "quality", value: -0.12 }, { metric: "reputation", value: -3 }] },
      ],
      defaultResponseId: "absorb",
    },
    {
      id: "momo_outage",
      name: "Mobile Money outage",
      type: "infrastructure",
      scope: "cohort",
      description: "Mobile Money payments fail across the area for most of the week. Customers without cash buy less.",
      probability: d(0.12),
      trigger: null,
      duration: 2,
      severity: "medium",
      affectedMetrics: ["demand"],
      impact: [{ metric: "demand", value: 0.85 }],
      responses: [
        { id: "cash_only", label: "Cash only", description: "Accept only cash until the network is back.", cost: a(0), effects: [{ metric: "demand", value: 0.9 }] },
        { id: "trust_credit", label: "Let regulars pay later", description: "Keeps sales, but some will never pay.", cost: a(0), effects: [{ metric: "demand", value: 0.98 }, { metric: "fixed_cost", value: 9000 }, { metric: "reputation", value: 1 }] },
      ],
      defaultResponseId: "cash_only",
    },
    {
      id: "power_outage",
      name: "Power cuts",
      type: "infrastructure",
      scope: "cohort",
      description: "Power cuts make it harder to work, charge phones and run equipment.",
      probability: d(0.18),
      trigger: null,
      duration: 2,
      severity: "medium",
      affectedMetrics: ["how much you can provide"],
      impact: [{ metric: "capacity", value: 0.7 }, { metric: "spoilage", value: 1.3 }],
      responses: [
        { id: "wait", label: "Work around it", description: "Do what you can when there is power.", cost: a(0), effects: [{ metric: "capacity", value: 0.75 }, { metric: "spoilage", value: 1.3 }] },
        { id: "rent_generator", label: "Rent a generator", description: "Near-normal work, but fuel and rent every week.", cost: a(5000), effects: [{ metric: "capacity", value: 0.95 }, { metric: "fixed_cost", value: 25000 }] },
      ],
      defaultResponseId: "wait",
    },
    {
      id: "exam_period",
      name: "Examination period",
      type: "market",
      scope: "cohort",
      description: "Students are studying in their halls and hostels; fewer are out and about.",
      probability: d(0.15),
      trigger: null,
      duration: 2,
      severity: "medium",
      affectedMetrics: ["demand"],
      impact: [{ metric: "demand", value: 0.8 }],
      responses: [
        { id: "accept", label: "Accept the dip", description: "Carry on as normal.", cost: a(0), effects: [{ metric: "demand", value: 0.8 }] },
        { id: "go_to_them", label: "Go to where they are", description: "Take orders by phone and go to the halls.", cost: a(4000), effects: [{ metric: "demand", value: 0.95 }, { metric: "fixed_cost", value: 15000 }] },
      ],
      defaultResponseId: "accept",
    },
    {
      id: "competitor_price_cut",
      name: "Price war",
      type: "competitive",
      scope: "cohort",
      description: "The people your customers use now cut their prices to keep them.",
      probability: d(0.14),
      trigger: null,
      duration: 2,
      severity: "high",
      affectedMetrics: ["competitor prices", "demand"],
      impact: [{ metric: "competitor_price", value: 0.85 }],
      responses: [
        { id: "hold", label: "Hold your price", description: "Do nothing different.", cost: a(0), effects: [{ metric: "competitor_price", value: 0.85 }] },
        { id: "loyalty_card", label: "Reward regulars", description: "Every 10th one free: regulars are less likely to switch.", cost: a(3000), effects: [{ metric: "competitor_price", value: 0.85 }, { metric: "switching_cost", value: 0.2 }, { metric: "per_unit_cost", value: Math.max(1, Math.round(reference * 0.06)) }] },
        { id: "quality_story", label: "Show why you're better", description: "Spend on telling people what makes you worth it.", cost: a(8000), effects: [{ metric: "competitor_price", value: 0.85 }, { metric: "marketing_effectiveness", value: 1.3 }, { metric: "quality", value: 0.05 }] },
      ],
      defaultResponseId: "hold",
    },
    {
      id: "new_entrant",
      name: "Someone copies you",
      type: "competitive",
      scope: "cohort",
      description: "A new seller starts offering something similar nearby.",
      probability: d(0.12),
      trigger: null,
      duration: 2,
      severity: "medium",
      affectedMetrics: ["competition"],
      impact: [{ metric: "new_competitor", value: 1, competitorId: "new_kiosk" }],
      responses: [
        { id: "ignore", label: "Ignore them", description: "They may not last.", cost: a(0), effects: [] },
        { id: "differentiate", label: "Stand out", description: "Add something your regulars ask for.", cost: a(15000), effects: [{ metric: "quality", value: 0.06 }] },
      ],
      defaultResponseId: "ignore",
      oncePerRun: true,
    },
    {
      id: "transport_cost_rise",
      name: "Transport fares rise",
      type: "operational",
      scope: "cohort",
      description: "Trotro and taxi fares go up, so getting around and getting supplies costs more.",
      probability: d(0.14),
      trigger: null,
      duration: 2,
      severity: "low",
      affectedMetrics: ["cost per unit"],
      impact: [{ metric: "per_unit_cost", value: Math.max(1, Math.round(n.costPerUnit * 0.1)) }],
      responses: [
        { id: "absorb", label: "Absorb it", description: "Keep making separate trips.", cost: a(0), effects: [{ metric: "per_unit_cost", value: Math.max(1, Math.round(n.costPerUnit * 0.1)) }] },
        { id: "share_transport", label: "Share transport", description: "Share trips with other sellers: a weekly fee, lower cost per unit.", cost: a(0), effects: [{ metric: "per_unit_cost", value: Math.max(1, Math.round(n.costPerUnit * 0.03)) }, { metric: "fixed_cost", value: 8000 }] },
      ],
      defaultResponseId: "absorb",
    },
    {
      id: "viral_post",
      name: "Word spreads",
      type: "market",
      scope: "group",
      description: "Someone's post about you is shared widely on campus WhatsApp groups.",
      probability: d(0.2),
      trigger: { metric: "reputation", op: "gte", value: 62 },
      duration: 2,
      severity: "low",
      affectedMetrics: ["awareness"],
      impact: [{ metric: "awareness", value: Math.max(50, Math.round(n.peoplePerWeek * 0.2)) }],
      responses: [
        { id: "ride_wave", label: "Ride the wave", description: "Post daily while people are talking about you.", cost: a(5000), effects: [{ metric: "marketing_effectiveness", value: 1.5 }] },
        { id: "carry_on", label: "Carry on", description: "Enjoy it and carry on as normal.", cost: a(0), effects: [] },
      ],
      defaultResponseId: "carry_on",
      oncePerRun: true,
    },
  ];
  if (n.kind === "goods") {
    list.push({
      id: "storage_failure",
      name: "Storage problem",
      type: "operational",
      scope: "group",
      description: "Where you keep your stock is damaged while you are holding a lot of it.",
      probability: d(0.25),
      trigger: { metric: "inventory_units", op: "gte", value: Math.max(50, Math.round(n.capacityPerWeek * 0.4)) },
      duration: 2,
      severity: "medium",
      affectedMetrics: ["waste"],
      impact: [{ metric: "spoilage", value: 2 }],
      responses: [
        { id: "repair", label: "Pay to fix it", description: "Fix it properly.", cost: a(25000), effects: [] },
        { id: "improvise", label: "Improvise", description: "Borrow space where you can.", cost: a(0), effects: [{ metric: "spoilage", value: 1.5 }] },
      ],
      defaultResponseId: "improvise",
    });
  }
  return list;
}

/**
 * Build the group's market. `frame` is the class's scenario: it supplies the
 * number of weeks, the starting cash and the event settings the lecturer
 * chose, so every group in a class plays under the same rules.
 */
export function scenarioFromVenture(n: VentureNumbers, frame: Scenario = campusFoodStall): Scenario {
  const problems = checkVentureNumbers(n);
  if (problems.length) throw new Error(problems.join(" "));
  const ref = campusFoodStall.segments[0];
  const marketSize = n.peoplePerWeek;
  const competitorCapacity = Math.max(200, Math.round(marketSize * n.buysPerWeek * 0.6));

  const alternatives = n.alternatives.length ? n.alternatives : [{ name: "What people do now", price: Math.round(n.price * 1.05) }];
  const competitors: CompetitorDef[] = alternatives.map((alt, i) => ({
    id: `alt_${i + 1}`,
    name: alt.name.trim(),
    informal: true,
    price: theirs(alt.price, `${alt.name.trim()}'s price`),
    unitCost: d(Math.round(alt.price * 0.65)),
    quality: d(0.5),
    capacityUnits: d(competitorCapacity),
    reputation: d(55),
    marketingStrength: d(0.5),
    responseStrategy: i % 2 ? "price_matcher" : "steady",
  }));
  competitors.push({
    id: "new_kiosk",
    name: "A new seller",
    informal: true,
    price: d(Math.round(n.price * 0.9)),
    unitCost: d(Math.round(n.costPerUnit * 1.05)),
    quality: d(0.5),
    capacityUnits: d(Math.max(100, Math.round(competitorCapacity / 2))),
    reputation: d(45),
    marketingStrength: d(0.4),
    responseStrategy: "aggressive",
    entersViaEvent: true,
  });

  const fixedCosts: FixedCostDef[] = n.fixedCosts.map((f, i) => ({
    id: `cost_${i + 1}`,
    label: f.label.trim(),
    amount: theirs(f.amount, f.label.trim()),
  }));

  return {
    id: OWN_VENTURE_SCENARIO_ID,
    version: 1,
    name: n.offer.trim(),
    family: n.kind === "service" ? "service" : "retail",
    description: `${n.offer.trim()}, set up from your group's own numbers.`,
    periodLabel: frame.periodLabel,
    periodCount: frame.periodCount,
    startingCapital: frame.startingCapital,
    products: [
      {
        id: "offer",
        name: n.offer.trim(),
        unit: n.unit.trim().toLowerCase(),
        referencePrice: theirs(n.price, "what customers say they would pay"),
        perUnitCost: d(0),
        defaultQualityTier: "standard",
      },
    ],
    segments: [
      {
        ...ref,
        id: "customers",
        name: "People with the problem",
        marketSize: theirs(marketSize, "how many people have the problem each week"),
        footfallReach: d(Math.max(5, Math.round(marketSize * 0.04))),
        referencePriceMult: d(1),
        purchaseFrequency: theirs(n.buysPerWeek, "how often one customer buys"),
      },
    ],
    qualityTiers: [
      { id: "basic", label: "Basic", unitCostMult: d(0.85), quality: d(0.35) },
      { id: "standard", label: "Standard", unitCostMult: d(1), quality: d(0.55) },
      { id: "premium", label: "Premium", unitCostMult: d(1.3), quality: d(0.8) },
    ],
    suppliers: [
      {
        id: "own_cost",
        name: n.kind === "service" ? "Your cost to provide" : "Your usual supplier",
        informal: true,
        unitPrice: { offer: theirs(n.costPerUnit, "what one costs to provide") },
        leadTimePeriods: d(0),
        capacityUnits: d(Math.max(n.capacityPerWeek * 2, 50)),
        disruptionProbability: d(n.kind === "service" ? 0 : 0.05),
        reliability: d(n.kind === "service" ? 1 : 0.85),
      },
    ],
    competitors,
    fixedCosts,
    operations: {
      capacityUnitsPerPeriod: theirs(n.capacityPerWeek, "the most they can provide in a week"),
      backordersEnabled: false,
      // A service unused this week is gone; goods lose what the group said.
      spoilageRate: n.kind === "service" ? d(1) : theirs(n.wasteShare, "how much unsold stock goes to waste"),
      maxOrderUnits: d(Math.max(n.capacityPerWeek * 3, 100)),
      stockoutChurn: d(0.4),
      lowQualityComplaintRate: d(0.08),
    },
    marketing: campusFoodStall.marketing,
    noise: campusFoodStall.noise,
    reputation: campusFoodStall.reputation,
    eventSettings: frame.eventSettings,
    events: events(n),
  };
}
