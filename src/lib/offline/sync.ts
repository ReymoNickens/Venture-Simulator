import { upsertOpportunity, createEvidence, createAssumption, linkEvidence } from "@/lib/server/mutations";
import type {
  Confidence,
  EvidenceClassification,
  EvidenceSourceType,
  Importance,
  OpportunityFields,
  RelationshipType,
} from "@/lib/domain/types";
import { getOfflineOwner, outboxAll, outboxDelete, outboxPut } from "./idb";
import { emitConnectionChange, isEffectivelyOnline } from "./status";
import type { OutboxItem } from "./idb";
import { OFFLINE_CALLS, type OfflineCallName } from "./calls";
import { isDue, nextAttemptAt } from "./retry";

export async function enqueue(type: OutboxItem["type"], payload: unknown, id?: string): Promise<string> {
  const item: OutboxItem = {
    id: id || crypto.randomUUID(),
    type,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
    status: "pending",
  };
  await outboxPut(item);
  emitConnectionChange();
  return item.id;
}

type SyncResult = { synced: number; failed: number };
let running: Promise<SyncResult> | null = null;

/**
 * Replay queued writes for the signed-in account. Serialised: two overlapping
 * runs (a refresh racing an "online" event) would otherwise both dispatch the
 * same item. Server writes are idempotent on clientId, but there is no reason
 * to send them twice on a student's data bundle.
 *
 * Failed items wait out a backoff (./retry.ts) unless `force` is set — the
 * student pressing "retry" should always try right now.
 */
export function processOutbox(opts: { force?: boolean } = {}): Promise<SyncResult> {
  running ??= runOutbox(Boolean(opts.force)).finally(() => {
    running = null;
  });
  return running;
}

async function runOutbox(force: boolean): Promise<SyncResult> {
  if (!getOfflineOwner()) return { synced: 0, failed: 0 };
  if (!(await isEffectivelyOnline())) return { synced: 0, failed: 0 };
  const items = await outboxAll();
  let synced = 0;
  let failed = 0;
  for (const item of items) {
    if (!isDue(item, new Date(), force)) continue;
    const next: OutboxItem = { ...item, status: "syncing", attempts: item.attempts + 1 };
    await outboxPut(next);
    emitConnectionChange();
    try {
      await dispatch(item);
      await outboxDelete(item.id);
      synced += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync failed";
      await outboxPut({
        ...next,
        status: "error",
        lastError: message,
        nextAttemptAt: nextAttemptAt(next.attempts, new Date()),
      });
      failed += 1;
    }
    emitConnectionChange();
  }
  return { synced, failed };
}

async function dispatch(item: OutboxItem): Promise<void> {
  const p = item.payload as Record<string, unknown>;
  if (item.type === "call") {
    const name = String(p.fn) as OfflineCallName;
    const fn = OFFLINE_CALLS[name] as unknown as ((arg: { data: unknown }) => Promise<unknown>) | undefined;
    if (!fn) throw new Error(`Unknown queued action: ${name}`);
    await fn({ data: p.data });
    return;
  }
  switch (item.type) {
    case "upsert_opportunity":
      await upsertOpportunity({
        data: {
          fields: p.fields as OpportunityFields,
          submit: Boolean(p.submit),
          clientId: String(p.clientId ?? item.id),
          fromQueue: true,
        },
      });
      return;
    case "submit_opportunity":
      await upsertOpportunity({
        data: {
          fields: p.fields as OpportunityFields,
          submit: true,
          clientId: String(p.clientId ?? item.id),
          fromQueue: true,
        },
      });
      return;
    case "create_evidence":
      await createEvidence({
        data: {
          clientId: String(p.clientId ?? item.id),
          title: String(p.title ?? ""),
          content: String(p.content ?? ""),
          // Queued payloads are re-validated by the server on replay.
          sourceType: (p.sourceType ?? "other") as EvidenceSourceType,
          classification: (p.classification ?? "unknown") as EvidenceClassification,
          photoData: (p.photoData as string | null) ?? null,
          photoMime: p.photoData ? "image/jpeg" : null,
          observedAt: (p.observedAt as string | null) ?? null,
          locationContext: (p.locationContext as string | null) ?? null,
        },
      });
      return;
    case "create_assumption":
      await createAssumption({
        data: {
          clientId: String(p.clientId ?? item.id),
          statement: String(p.statement ?? ""),
          importance: (p.importance ?? "medium") as Importance,
          confidence: (p.confidence ?? "low") as Confidence,
        },
      });
      return;
    case "link_assumption_evidence":
      await linkEvidence({
        data: {
          clientId: String(p.clientId ?? item.id),
          assumptionId: String(p.assumptionId ?? ""),
          evidenceItemId: String(p.evidenceItemId ?? ""),
          relationshipType: (p.relationshipType as RelationshipType) ?? "supports",
        },
      });
      return;
    default:
      throw new Error(`Unknown outbox type ${item.type}`);
  }
}
