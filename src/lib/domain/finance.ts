/**
 * Unit economics — deterministic arithmetic, never the AI's job.
 *
 * Deliberately small: a price, what each unit costs to deliver, what the
 * month costs regardless, and what it takes to start. That is enough for a
 * student to discover whether the idea can ever pay for itself, and every
 * figure can (and should) point at evidence — a market quote, a receipt,
 * a customer who named a price.
 */

export interface CostLine {
  id: string;
  label: string;
  amount: number;
  /** Evidence item backing this figure (a quote, receipt, observation). */
  evidenceId?: string | null;
}

export interface FinanceInputs {
  /** What one unit is, in the student's words: "one weekly laundry bag". */
  unitName: string;
  /** Selling price per unit, GH₵. */
  price: number;
  priceEvidenceId?: string | null;
  /** Cost of delivering one unit, GH₵. */
  variableCosts: CostLine[];
  /** Costs per month whatever the sales, GH₵. */
  fixedCosts: CostLine[];
  /** One-off costs to start, GH₵. */
  startupCosts: CostLine[];
  /** Units the group expects to sell in a typical month. */
  expectedUnitsPerMonth: number;
}

export interface FinanceWarning {
  code:
    | "NO_PRICE"
    | "PRICE_BELOW_COST"
    | "THIN_MARGIN"
    | "PRICE_UNSUPPORTED"
    | "COSTS_UNSOURCED"
    | "BELOW_BREAK_EVEN"
    | "NO_VARIABLE_COSTS"
    | "SHOCK_SENSITIVE";
  message: string;
}

export interface FinanceResult {
  variableCostPerUnit: number;
  contributionPerUnit: number;
  /** Contribution as a share of price, 0–1 (null with no price). */
  contributionMargin: number | null;
  fixedPerMonth: number;
  startupTotal: number;
  /** Units per month to cover fixed costs; null when each sale loses money. */
  breakEvenUnits: number | null;
  monthlyProfit: number;
  /** Months of profit to recover start-up costs; null if never. */
  paybackMonths: number | null;
  /** Share of cost lines backed by evidence, 0–1. */
  sourcedShare: number;
  /** Monthly profit if input costs rise 15% (cedi depreciation, fuel). */
  profitIfCostsRise: number;
  /** Monthly profit if the price has to drop 10% to compete. */
  profitIfPriceDrops: number;
  warnings: FinanceWarning[];
}

const sum = (lines: CostLine[]) =>
  lines.reduce((acc, l) => acc + (Number.isFinite(l.amount) ? Math.max(0, l.amount) : 0), 0);

const round2 = (n: number) => Math.round(n * 100) / 100;

export function emptyFinanceInputs(): FinanceInputs {
  return {
    unitName: "",
    price: 0,
    priceEvidenceId: null,
    variableCosts: [],
    fixedCosts: [],
    startupCosts: [],
    expectedUnitsPerMonth: 0,
  };
}

export function computeFinance(input: FinanceInputs): FinanceResult {
  const price = Math.max(0, Number(input.price) || 0);
  const units = Math.max(0, Math.floor(Number(input.expectedUnitsPerMonth) || 0));
  const variable = sum(input.variableCosts);
  const fixed = sum(input.fixedCosts);
  const startup = sum(input.startupCosts);
  const contribution = price - variable;
  const breakEven = contribution > 0 ? Math.ceil(fixed / contribution) : null;
  const monthlyProfit = contribution * units - fixed;
  const payback =
    startup === 0 ? (monthlyProfit > 0 ? 0 : null) : monthlyProfit > 0 ? startup / monthlyProfit : null;

  const allLines = [...input.variableCosts, ...input.fixedCosts, ...input.startupCosts];
  const sourced = allLines.filter((l) => Boolean(l.evidenceId)).length;
  const sourcedShare = allLines.length ? sourced / allLines.length : 0;

  const profitIfCostsRise = (price - variable * 1.15) * units - fixed * 1.15;
  const profitIfPriceDrops = (price * 0.9 - variable) * units - fixed;

  const warnings: FinanceWarning[] = [];
  if (price <= 0) {
    warnings.push({ code: "NO_PRICE", message: "Set a price per unit — even a guess you intend to test." });
  } else {
    if (contribution <= 0) {
      warnings.push({
        code: "PRICE_BELOW_COST",
        message: "Each sale loses money: the price does not cover what one unit costs to deliver.",
      });
    } else if (contribution / price < 0.2) {
      warnings.push({
        code: "THIN_MARGIN",
        message: "Less than 20% of each sale is left after unit costs. One price rise from a supplier could wipe it out.",
      });
    }
    if (!input.priceEvidenceId) {
      warnings.push({
        code: "PRICE_UNSUPPORTED",
        message: "No evidence is linked to the price. Who told you they would pay this?",
      });
    }
  }
  if (!input.variableCosts.length) {
    warnings.push({
      code: "NO_VARIABLE_COSTS",
      message: "No unit costs listed. Packaging, transport, MoMo charges and your own time all count.",
    });
  }
  if (allLines.length && sourcedShare < 0.5) {
    warnings.push({
      code: "COSTS_UNSOURCED",
      message: "Fewer than half the costs come from real quotes or receipts. Go and price them in the market.",
    });
  }
  if (breakEven !== null && units > 0 && units < breakEven) {
    warnings.push({
      code: "BELOW_BREAK_EVEN",
      message: `Expected sales (${units}) are below break-even (${breakEven}) — the venture loses money every month at this level.`,
    });
  }
  if (monthlyProfit > 0 && profitIfCostsRise <= 0) {
    warnings.push({
      code: "SHOCK_SENSITIVE",
      message: "A 15% rise in costs would turn the profit into a loss. What is your plan if the cedi falls again?",
    });
  }

  return {
    variableCostPerUnit: round2(variable),
    contributionPerUnit: round2(contribution),
    contributionMargin: price > 0 ? contribution / price : null,
    fixedPerMonth: round2(fixed),
    startupTotal: round2(startup),
    breakEvenUnits: breakEven,
    monthlyProfit: round2(monthlyProfit),
    paybackMonths: payback === null ? null : Math.round(payback * 10) / 10,
    sourcedShare,
    profitIfCostsRise: round2(profitIfCostsRise),
    profitIfPriceDrops: round2(profitIfPriceDrops),
    warnings,
  };
}

/** GH₵ 1,234.50 — cedis with pesewas, grouped the way receipts print them. */
export function formatCedis(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const sign = n < 0 ? "−" : "";
  const abs = Math.abs(n);
  return `${sign}GH₵ ${abs.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Parse stored JSON defensively — a malformed row must not crash the page. */
export function parseFinanceInputs(raw: string | null | undefined): FinanceInputs {
  if (!raw) return emptyFinanceInputs();
  try {
    const v = JSON.parse(raw) as Partial<FinanceInputs>;
    const lines = (x: unknown): CostLine[] =>
      Array.isArray(x)
        ? x
            .filter((l): l is CostLine => Boolean(l) && typeof l === "object")
            .map((l) => ({
              id: String(l.id ?? ""),
              label: String(l.label ?? ""),
              amount: Number(l.amount) || 0,
              evidenceId: l.evidenceId ? String(l.evidenceId) : null,
            }))
        : [];
    return {
      unitName: String(v.unitName ?? ""),
      price: Number(v.price) || 0,
      priceEvidenceId: v.priceEvidenceId ? String(v.priceEvidenceId) : null,
      variableCosts: lines(v.variableCosts),
      fixedCosts: lines(v.fixedCosts),
      startupCosts: lines(v.startupCosts),
      expectedUnitsPerMonth: Number(v.expectedUnitsPerMonth) || 0,
    };
  } catch {
    return emptyFinanceInputs();
  }
}
