import { useCallback, useEffect, useState } from "react";
import { getWorkspace } from "@/lib/server/workspace";
import type { WorkspaceSnapshot } from "@/lib/domain/types";
import { kvGet, kvSet, SNAPSHOT_KEY, outboxAll } from "@/lib/offline/idb";
import { isEffectivelyOnline } from "@/lib/offline/status";
import { processOutbox } from "@/lib/offline/sync";
import type { OpportunityFields } from "@/lib/domain/types";

export function useWorkspace() {
  const [data, setData] = useState<WorkspaceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const online = await isEffectivelyOnline();
    if (online) {
      try {
        await processOutbox();
        const snap = await getWorkspace();
        setData(snap);
        await kvSet(SNAPSHOT_KEY, snap);
        setLoading(false);
        return snap;
      } catch (err) {
        const cached = await kvGet<WorkspaceSnapshot>(SNAPSHOT_KEY);
        if (cached) {
          setData(await overlayOutbox(cached));
          setLoading(false);
          return cached;
        }
        setError(err instanceof Error ? err.message : "Could not load your studio.");
        setLoading(false);
        return null;
      }
    }
    const cached = await kvGet<WorkspaceSnapshot>(SNAPSHOT_KEY);
    if (cached) setData(await overlayOutbox(cached));
    setLoading(false);
    return cached ?? null;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}

async function overlayOutbox(snap: WorkspaceSnapshot): Promise<WorkspaceSnapshot> {
  const items = await outboxAll();
  if (!items.length || !snap.student || !snap.group) return snap;
  const next = { ...snap };
  for (const item of items) {
    const p = item.payload as Record<string, unknown>;
    if (item.type === "upsert_opportunity" || item.type === "submit_opportunity") {
      const fields = (p.fields as OpportunityFields) ?? null;
      if (!fields) continue;
      const submitted = item.type === "submit_opportunity" || Boolean(p.submit);
      next.myOpportunity = {
        id: String(p.clientId ?? item.id),
        studentId: snap.student.id,
        groupId: snap.group.id,
        ...fields,
        status: submitted ? "submitted" : "draft",
        submittedAt: submitted ? item.createdAt : null,
        createdAt: item.createdAt,
        updatedAt: item.createdAt,
        authorName: snap.student.fullName,
        syncState: item.status === "error" ? "conflict" : "pending",
      };
    }
    if (item.type === "create_evidence" && snap.venture) {
      next.evidence = [
        {
          id: String(p.clientId ?? item.id),
          ventureId: snap.venture.id,
          studentId: snap.student.id,
          title: String(p.title ?? "Untitled evidence"),
          content: String(p.content ?? ""),
          sourceType: (p.sourceType as "other") ?? "other",
          classification: (p.classification as "unknown") ?? "unknown",
          photoData: (p.photoData as string | null) ?? null,
          photoMime: (p.photoMime as string | null) ?? null,
          observedAt: (p.observedAt as string | null) ?? null,
          locationContext: (p.locationContext as string | null) ?? null,
          createdAt: item.createdAt,
          updatedAt: item.createdAt,
          authorName: snap.student.fullName,
          syncState: "pending",
        },
        ...next.evidence,
      ];
    }
    if (item.type === "create_assumption" && snap.venture) {
      next.assumptions = [
        {
          id: String(p.clientId ?? item.id),
          ventureId: snap.venture.id,
          studentId: snap.student.id,
          statement: String(p.statement ?? ""),
          importance: (p.importance as "medium") ?? "medium",
          confidence: (p.confidence as "low") ?? "low",
          status: "open",
          createdAt: item.createdAt,
          updatedAt: item.createdAt,
          authorName: snap.student.fullName,
          syncState: "pending",
        },
        ...next.assumptions,
      ];
    }
  }
  return next;
}
