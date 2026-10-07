import { formatGhs } from "@/sim/index";

/** "GHS 4,000" for whole cedis, "GHS 12.50" otherwise: fewer digits to read. */
export function ghs(pesewas: number): string {
  const full = formatGhs(pesewas);
  return full.endsWith(".00") ? full.slice(0, -3) : full;
}

/** Cedis typed in a box → pesewas, or null. */
export function typedCedis(text: string): number | null {
  const t = text.trim().replace(/,/g, "");
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(t)) return null;
  const [w, f = ""] = t.split(".");
  return Number(w) * 100 + Number(f.padEnd(2, "0"));
}

export function cedisText(pesewas: number): string {
  const whole = Math.floor(pesewas / 100);
  const rest = pesewas % 100;
  return rest ? `${whole}.${String(rest).padStart(2, "0")}` : String(whole);
}

/** "week" → "Week". Only the first letter, unlike CSS capitalize. */
export function cap(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}
