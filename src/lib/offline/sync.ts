import { upsertOpportunity, createEvidence, createAssumption, linkEvidence } from "@/lib/server/mutations";
import type { OpportunityFields, RelationshipType } from "@/lib/domain/types";
import { getOfflineOwner, outboxAll, outboxDelete, outboxPut } from "./idb";
import { emitConnectionChange, isEffectivelyOnline } from "./status";
import type { OutboxItem } from "./idb";
import { OFFLINE_CALLS, type OfflineCallName } from "./calls";

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

let running: Promise<{ synced: number; failed: number }> | null = null;

/**
 * Replay queued writes for the signed-in account. Serialised: two overlapping
 * runs (a refresh racing an "online" event) would otherwise both dispatch the
 * same item. Server writes are idempotent on clientId, but there is no reason
 * to send them twice on a student's data bundle.
 */
export function processOutbox(): Promise<{ synced: number; failed: number }> {
  running ??= runOutbox().finally(() => {
    running = null;
  });
  return running;
}

async function runOutbox(): Promise<{ synced: number; failed: number }> {
  if (!getOfflineOwner()) return { synced: 0, failed: 0 };
  if (!(await isEffectivelyOnline())) return { synced: 0, failed: 0 };
  const items = await outboxAll();
  let synced = 0;
  let failed = 0;
  for (const item of items) {
    if (item.status === "done") continue;
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
        },
      });
      return;
    case "submit_opportunity":
      await upsertOpportunity({
        data: {
          fields: p.fields as OpportunityFields,
          submit: true,
          clientId: String(p.clientId ?? item.id),
        },
      });
      return;
    case "create_evidence":
      await createEvidence({
        data: {
          clientId: String(p.clientId ?? item.id),
          title: String(p.title ?? ""),
          content: String(p.content ?? ""),
          sourceType: String(p.sourceType ?? "other"),
          classification: String(p.classification ?? "unknown"),
          photoData: (p.photoData as string | null) ?? null,
          photoMime: (p.photoMime as string | null) ?? null,
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
          importance: String(p.importance ?? "medium"),
          confidence: String(p.confidence ?? "low"),
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
