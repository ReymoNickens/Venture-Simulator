// Money is integer pesewas everywhere in the engine (ADR 0001).
// GHS 1 = 100 pesewas. Only display code converts to cedis.

export type Pesewas = number;

export function assertPesewas(value: number, label: string): Pesewas {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a whole number of pesewas, got ${value}`);
  }
  return value;
}

/** Round a computed money amount to whole pesewas (half away from zero). */
export function toPesewas(value: number): Pesewas {
  const rounded = value < 0 ? -Math.round(-value) : Math.round(value);
  return rounded === 0 ? 0 : rounded; // never -0
}

/**
 * "GHS 1,234.50" / "-GHS 20.00". Deterministic: no locale APIs. Display
 * only: a fractional input (e.g. a per-segment share of a budget) is
 * rounded to the nearest pesewa for the text.
 */
export function formatGhs(pesewas: Pesewas): string {
  const whole = toPesewas(pesewas);
  const negative = whole < 0;
  const abs = Math.abs(whole);
  const cedis = Math.floor(abs / 100);
  const pes = abs % 100;
  const grouped = String(cedis).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}GHS ${grouped}.${String(pes).padStart(2, "0")}`;
}

/** "1 customer" / "5 customers". */
export function plural(n: number, word: string, many = `${word}s`): string {
  return `${n} ${n === 1 ? word : many}`;
}
