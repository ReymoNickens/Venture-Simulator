// Pure helpers for the decision form: students type cedis, the engine takes
// integer pesewas (ADR 0001). No floating-point conversion: "12.5" is parsed
// as text into 1250 exactly.
import type { Decisions } from "../../sim/index.ts";

/** "25", "25.5", "25.50", "1,250.00" -> pesewas. Null when not a valid amount. */
export function cedisToPesewas(text: string): number | null {
  const t = text.trim().replace(/,/g, "");
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(t);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

export function pesewasToCedisText(p: number): string {
  return `${Math.floor(p / 100)}.${String(p % 100).padStart(2, "0")}`;
}

export interface ProductForm {
  price: string;
  qualityTier: string;
  supplierId: string;
  units: string;
}

export interface DecisionForm {
  products: Record<string, ProductForm>;
  marketing: string;
  eventResponses: Record<string, string>;
}

/** Start from last period's choices so a group changes what it means to. */
export function initialForm(
  products: { id: string }[],
  defaults: { qualityTier: string; supplierId: string; price: number },
  last: Decisions | null,
): DecisionForm {
  const out: DecisionForm = { products: {}, marketing: last ? pesewasToCedisText(last.marketingBudget) : "0.00", eventResponses: {} };
  for (const p of products) {
    const d = last?.products[p.id];
    out.products[p.id] = {
      price: pesewasToCedisText(d?.price ?? defaults.price),
      qualityTier: d?.qualityTier ?? defaults.qualityTier,
      supplierId: d?.order?.supplierId ?? defaults.supplierId,
      units: d?.order ? String(d.order.units) : "0",
    };
  }
  return out;
}

export type BuildResult = { ok: true; decisions: Decisions } | { ok: false; errors: string[] };

export function buildDecisions(period: number, form: DecisionForm, productNames: Record<string, string>): BuildResult {
  const errors: string[] = [];
  const products: Decisions["products"] = {};
  for (const [id, f] of Object.entries(form.products)) {
    const name = productNames[id] ?? id;
    const price = cedisToPesewas(f.price);
    if (price === null || price <= 0) errors.push(`${name}: enter a price in cedis, e.g. 25.00`);
    const units = /^\d{1,6}$/.test(f.units.trim()) ? Number(f.units.trim()) : null;
    if (units === null) errors.push(`${name}: enter a whole number of units to order (0 for none)`);
    products[id] = {
      price: price ?? 0,
      qualityTier: f.qualityTier,
      order: units ? { supplierId: f.supplierId, units } : null,
    };
  }
  const marketingBudget = cedisToPesewas(form.marketing);
  if (marketingBudget === null) errors.push("Marketing: enter an amount in cedis (0 for none)");
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    decisions: { period, products, marketingBudget: marketingBudget ?? 0, eventResponses: { ...form.eventResponses } },
  };
}
