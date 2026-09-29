// Canonical JSON: object keys sorted, -0 written as 0, non-finite numbers
// rejected. Two runs are "byte-identical" when their canonical JSON is equal.

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function normalize(value: unknown): unknown {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Non-finite number in engine output: ${value}`);
    return value === 0 ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = normalize(v);
    }
    return out;
  }
  return value;
}

/** Round to 4 decimal places for stored ratios (exactly reproducible). */
export function round4(x: number): number {
  const r = Math.round(x * 10000) / 10000;
  return r === 0 ? 0 : r;
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/**
 * Whole units from a computed quantity, rounding down. The value is first
 * rounded to 4 decimal places so floating-point noise (700 × 0.7 is
 * 489.99999999999994) cannot cost a unit.
 */
export function floorUnits(x: number): number {
  return Math.floor(round4(x));
}
