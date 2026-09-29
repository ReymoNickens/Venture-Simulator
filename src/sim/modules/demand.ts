// Demand: how attractive an offer is to a segment, relative to the
// alternatives. Only rational functions are used (ADR 0003), so every number
// is exactly reproducible.
import { clamp } from "../canonical.ts";

export interface SegmentTaste {
  priceSensitivity: number;
  qualitySensitivity: number;
  brandSensitivity: number;
}

/**
 * Utility of an offer to a segment. 1 is "an average offer at the reference
 * price". Price above reference lowers it in proportion to price
 * sensitivity; quality and reputation above the midpoint raise it.
 */
export function utility(
  price: number,
  referencePrice: number,
  quality: number,
  reputation: number,
  taste: SegmentTaste,
): number {
  return (
    1 -
    taste.priceSensitivity * (price / referencePrice - 1) +
    taste.qualitySensitivity * (quality - 0.5) +
    taste.brandSensitivity * (reputation / 100 - 0.5)
  );
}

/** Choice weight: never zero, and squared so differences matter. */
export function choiceWeight(u: number): number {
  const x = Math.max(0.05, u);
  return x * x;
}

/** How our offer compares with the average active competitor (1 = equal). */
export function relativeAttractiveness(ours: number, competitors: readonly number[]): number {
  if (competitors.length === 0) return 1;
  let sum = 0;
  for (const w of competitors) sum += w;
  return ours / (sum / competitors.length);
}

/**
 * Multiplies the base conversion rate: 1 when equal to the competition,
 * approaching 2 when far better, 0 when far worse.
 */
export function conversionFactor(r: number): number {
  return (2 * r) / (1 + r);
}

/**
 * Multiplies base retention: unchanged when we are at least as attractive,
 * lower when we are worse, softened by switching cost.
 */
export function retentionFactor(r: number, switchingCost: number): number {
  const gap = Math.max(0, 1 - r);
  return clamp(1 - (1 - clamp(switchingCost, 0, 1)) * gap * 0.6, 0.2, 1);
}
