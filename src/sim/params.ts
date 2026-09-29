// Scenario parameters carry their provenance (brief §0.5): every external
// factual value has a `source`, or is explicitly `assumption: true` and
// lecturer-editable. The engine never reads a number that has neither.

export interface Param<T = number> {
  value: T;
  /** Citation for a measured/published figure. */
  source?: string;
  /** True when this is a design choice or placeholder, not a measured fact. */
  assumption?: boolean;
  note?: string;
}

/** An illustrative placeholder: NOT a measured Ghanaian figure. */
export function assumed<T>(value: T, note?: string): Param<T> {
  return note ? { value, assumption: true, note } : { value, assumption: true };
}

export function sourced<T>(value: T, source: string, note?: string): Param<T> {
  return note ? { value, source, note } : { value, source };
}

const PARAM_KEYS = new Set(["value", "source", "assumption", "note"]);

export function isParam(x: unknown): x is Param<unknown> {
  if (!x || typeof x !== "object" || Array.isArray(x)) return false;
  const keys = Object.keys(x);
  return keys.includes("value") && keys.every((k) => PARAM_KEYS.has(k));
}

/**
 * Walk a scenario and return the path of every Param that has neither a
 * non-empty `source` nor `assumption: true`.
 */
export function findUnsourcedParams(node: unknown, path = ""): string[] {
  if (isParam(node)) {
    const ok =
      (typeof node.source === "string" && node.source.trim() !== "") || node.assumption === true;
    return ok ? [] : [path];
  }
  if (Array.isArray(node)) {
    return node.flatMap((item, i) => {
      const id = item && typeof item === "object" && "id" in item ? String(item.id) : String(i);
      return findUnsourcedParams(item, `${path}[${id}]`);
    });
  }
  if (node && typeof node === "object") {
    return Object.entries(node).flatMap(([k, v]) => findUnsourcedParams(v, path ? `${path}.${k}` : k));
  }
  return [];
}
