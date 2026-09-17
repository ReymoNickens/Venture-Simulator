/**
 * Per-step local autosave for guided flows (opportunity discovery, evidence
 * capture, assumption creation). Pure localStorage — synchronous, no
 * network, survives a reload or an accidental navigation away mid-flow.
 * This is NOT the server draft mechanism (that already exists for
 * opportunities via saveOpportunity(fields, false)); it's the same "don't
 * lose work" guarantee applied to flows that have no server-side partial
 * state, without adding one.
 */
const PREFIX = "step-draft:";

export function loadStepDraft<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveStepDraft<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable — the flow still works, it just won't survive a reload */
  }
}

export function clearStepDraft(key: string): void {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}
