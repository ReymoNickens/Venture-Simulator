import { upsertOpportunity, createEvidence, createAssumption, linkEvidence } from "@/lib/server/mutations";
import type { OpportunityFields, RelationshipType } from "@/lib/domain/types";
import { enqueue, processOutbox } from "./sync";
import { isEffectivelyOnline } from "./status";
import { newId } from "@/lib/utils";
import { OFFLINE_CALLS, type OfflineCallName } from "./calls";

async function tryOnline<T>(fn: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  if (!(await isEffectivelyOnline())) return fallback();
  try {
    const result = await fn();
    void processOutbox();
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (/failed to fetch|network|offline/i.test(message)) return fallback();
    throw err;
  }
}

export async function saveOpportunity(fields: OpportunityFields, submit: boolean) {
  const clientId = newId();
  return tryOnline(
    () => upsertOpportunity({ data: { fields, submit, clientId } }),
    async () => {
      await enqueue(submit ? "submit_opportunity" : "upsert_opportunity", {
        fields,
        submit,
        clientId,
      });
      return { id: clientId, submitted: submit, queued: true as const };
    },
  );
}

export async function saveEvidence(input: {
  title: string;
  content: string;
  sourceType: string;
  classification: string;
  photoData?: string | null;
  photoMime?: string | null;
  observedAt?: string | null;
  locationContext?: string | null;
}) {
  const clientId = newId();
  return tryOnline(
    () => createEvidence({ data: { ...input, clientId } }),
    async () => {
      await enqueue("create_evidence", { ...input, clientId });
      return { id: clientId, queued: true as const };
    },
  );
}

export async function saveAssumption(input: {
  statement: string;
  importance: string;
  confidence: string;
}) {
  const clientId = newId();
  return tryOnline(
    () => createAssumption({ data: { ...input, clientId } }),
    async () => {
      await enqueue("create_assumption", { ...input, clientId });
      return { id: clientId, queued: true as const };
    },
  );
}

export async function saveLink(input: {
  assumptionId: string;
  evidenceItemId: string;
  relationshipType: RelationshipType;
}) {
  const clientId = newId();
  return tryOnline(
    () => linkEvidence({ data: { ...input, clientId } }),
    async () => {
      await enqueue("link_assumption_evidence", { ...input, clientId });
      return { id: clientId, queued: true as const };
    },
  );
}

/**
 * Call a server function now, or — with no connection — queue it and report
 * `queued: true` so the screen can say "Saved on this phone".
 */
export async function saveOffline<N extends OfflineCallName>(
  fn: N,
  data: Parameters<(typeof OFFLINE_CALLS)[N]>[0] extends { data: infer D } ? D : never,
): Promise<{ queued: boolean }> {
  const payload = { ...(data as object), clientId: (data as { clientId?: string }).clientId ?? newId() };
  const call = OFFLINE_CALLS[fn] as unknown as (arg: { data: unknown }) => Promise<unknown>;
  return tryOnline<{ queued: boolean }>(
    async () => {
      await call({ data: payload });
      return { queued: false };
    },
    async () => {
      await enqueue("call", { fn, data: payload });
      return { queued: true };
    },
  );
}
