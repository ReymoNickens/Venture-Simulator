import { upsertOpportunity, createEvidence, createAssumption, linkEvidence } from "@/lib/server/mutations";
import { submitSimulationDecisions } from "@/lib/server/simulation";
import type { Decisions } from "@/sim/index";
import type { OpportunityFields, RelationshipType } from "@/lib/domain/types";
import { enqueue, processOutbox } from "./sync";
import { isEffectivelyOnline } from "./status";
import { newId } from "@/lib/utils";

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

/**
 * Submit a period's decisions. Offline, the submission waits in the outbox
 * with its clientId; results are computed on the server only once it syncs,
 * and a replay of the same submission is recognised, never duplicated.
 */
export async function saveSimDecisions(input: {
  simulationId: string;
  decisions: Decisions;
}): Promise<{ period: number; queued: boolean }> {
  const clientId = newId();
  return tryOnline<{ period: number; queued: boolean }>(
    async () => ({ ...(await submitSimulationDecisions({ data: { ...input, clientId } })), queued: false as const }),
    async () => {
      await enqueue("submit_sim_decisions", { ...input, clientId });
      return { period: input.decisions.period, queued: true as const };
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
