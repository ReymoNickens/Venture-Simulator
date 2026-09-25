import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { useAction } from "@/hooks/use-action";
import { addCanvasEntry, linkCanvasEvidence, retireCanvasEntry } from "@/lib/server/venture-work";
import { CANVAS_BLOCKS, type CanvasBlockKey } from "@/lib/domain/stages";
import type { CanvasEntry, WorkspaceSnapshot } from "@/lib/domain/types";
import { StageHeader } from "@/components/stage/StageHeader";
import { Reflect } from "@/components/stage/Reflect";
import { NeedsVenture } from "@/components/stage/NeedsVenture";
import { EvidencePicker } from "@/components/stage/EvidencePicker";
import { Button } from "@/components/ui/button";
import { Textarea, Input } from "@/components/ui/input";
import { Stamp } from "@/components/ui/stamp";
import { FormMessages, Loading } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/studio/canvas")({ component: CanvasPage });

// Classic canvas arrangement on wide screens (Osterwalder's layout).
const AREA: Record<CanvasBlockKey, string> = {
  partners: "lg:col-start-1 lg:row-start-1 lg:row-span-2",
  activities: "lg:col-start-2 lg:row-start-1",
  resources: "lg:col-start-2 lg:row-start-2",
  value: "lg:col-start-3 lg:row-start-1 lg:row-span-2",
  relationships: "lg:col-start-4 lg:row-start-1",
  channels: "lg:col-start-4 lg:row-start-2",
  segments: "lg:col-start-5 lg:row-start-1 lg:row-span-2",
  costs: "lg:col-start-1 lg:col-span-2 xl:col-span-3 lg:row-start-3",
  revenue: "lg:col-start-3 lg:col-span-3 xl:col-start-4 xl:col-span-2 lg:row-start-3",
};

// Mobile reading order: start with the customer, end with the money.
const MOBILE_ORDER: CanvasBlockKey[] = [
  "segments",
  "value",
  "channels",
  "relationships",
  "revenue",
  "resources",
  "activities",
  "partners",
  "costs",
];

function CanvasPage() {
  const { data, loading, refresh } = useStudioWorkspace();
  if (loading || !data) return <Loading />;
  if (!data.venture) return <NeedsVenture />;
  const live = data.work.canvas.filter((c) => c.status === "active");
  const retired = data.work.canvas.filter((c) => c.status === "retired");
  const evidenced = live.filter((c) => c.evidenceIds.length).length;
  return (
    <div className="space-y-6">
      <StageHeader stage="canvas" data={data} />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="inline-flex items-center gap-2">
          <span className="size-4 rounded-[3px] border-2 border-ink bg-bg-elevated" /> backed by evidence ({evidenced})
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-4 rounded-[3px] border-2 border-dashed border-line-strong bg-gold-soft/60" /> still a guess ({live.length - evidenced})
        </span>
      </div>
      <div className="grid gap-3 lg:grid-cols-5 lg:[grid-template-rows:auto_auto_auto]">
        {MOBILE_ORDER.map((key) => {
          const block = CANVAS_BLOCKS.find((b) => b.key === key)!;
          return (
            <Block
              key={key}
              blockKey={key}
              title={block.title}
              prompt={block.prompt}
              entries={live.filter((c) => c.block === key)}
              data={data}
              onChanged={() => void refresh()}
              className={AREA[key]}
            />
          );
        })}
      </div>
      {retired.length ? (
        <section className="space-y-2">
          <h2 className="font-display text-lg font-bold">Crossed out — kept for the record</h2>
          <ul className="space-y-1.5 text-sm">
            {retired.map((c) => (
              <li key={c.id} className="text-muted">
                <span className="line-through">{c.body}</span>{" "}
                <span className="text-xs">
                  ({CANVAS_BLOCKS.find((b) => b.key === c.block)?.title}) — {c.retiredReason}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <Reflect
        stage="canvas"
        data={data}
        prompt="Which block of your canvas are you least sure about — and what would prove it?"
        onSaved={() => void refresh()}
      />
    </div>
  );
}

function Block({
  blockKey,
  title,
  prompt,
  entries,
  data,
  onChanged,
  className,
}: {
  blockKey: CanvasBlockKey;
  title: string;
  prompt: string;
  entries: CanvasEntry[];
  data: WorkspaceSnapshot;
  onChanged: () => void;
  className?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [body, setBody] = useState("");
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const { pending, error, run } = useAction();
  return (
    <section className={cn("flex flex-col rounded-[10px] border-2 border-ink bg-bg-elevated p-3", className)}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-[15px] leading-tight font-extrabold">{title}</h2>
          <p className="mt-0.5 text-xs leading-5 text-muted">{prompt}</p>
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          aria-label={`Add to ${title}`}
          className="flex size-8 shrink-0 items-center justify-center rounded-[6px] border-2 border-ink bg-gold"
        >
          <Plus className="size-4" aria-hidden />
        </button>
      </div>
      <ul className="mt-2 flex-1 space-y-2">
        {entries.map((e) => (
          <Note key={e.id} entry={e} data={data} onChanged={onChanged} />
        ))}
        {!entries.length && !adding ? <li className="text-xs text-faint italic">Empty.</li> : null}
      </ul>
      {adding ? (
        <div className="mt-2 space-y-2 border-t border-line pt-2">
          <Textarea
            aria-label={`New entry for ${title}`}
            value={body}
            onChange={(ev) => setBody(ev.target.value)}
            className="min-h-16 text-sm"
          />
          <EvidencePicker evidence={data.evidence} value={evidenceIds} onChange={setEvidenceIds} />
          <FormMessages error={error} />
          <Button
            size="sm"
            disabled={Boolean(pending) || body.trim().length < 3}
            onClick={() =>
              void run("add", async () => {
                await addCanvasEntry({ data: { block: blockKey, body, evidenceIds } });
                setBody("");
                setEvidenceIds([]);
                setAdding(false);
                onChanged();
              })
            }
          >
            {pending ? "Adding…" : "Add note"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function Note({ entry, data, onChanged }: { entry: CanvasEntry; data: WorkspaceSnapshot; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [ids, setIds] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const { pending, error, run } = useAction();
  const backed = entry.evidenceIds.length > 0;
  return (
    <li
      className={cn(
        "rounded-[6px] p-2 text-sm leading-5",
        backed ? "border-2 border-ink bg-bg-elevated shadow-[2px_2px_0_0_var(--color-ink)]" : "border-2 border-dashed border-line-strong bg-gold-soft/60",
      )}
    >
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full text-left" aria-expanded={open}>
        <span className="flex items-start justify-between gap-2">
          <span>{entry.body}</span>
          {backed ? (
            <Stamp tone="forest" size="xs" tilt={-4}>
              {entry.evidenceIds.length} ev.
            </Stamp>
          ) : (
            <Stamp tone="gold" size="xs" tilt={3}>
              Guess
            </Stamp>
          )}
        </span>
        <span className="mt-1 block text-[11px] text-faint">{entry.authorName}</span>
      </button>
      {open ? (
        <div className="mt-2 space-y-2 border-t border-line pt-2">
          {backed ? (
            <ul className="space-y-0.5 text-xs text-accent">
              {entry.evidenceIds.map((id) => (
                <li key={id}>↳ {data.evidence.find((e) => e.id === id)?.title ?? "evidence"}</li>
              ))}
            </ul>
          ) : null}
          <EvidencePicker
            evidence={data.evidence.filter((e) => !entry.evidenceIds.includes(e.id))}
            value={ids}
            onChange={setIds}
            label="Link more evidence"
          />
          {ids.length ? (
            <Button
              size="sm"
              disabled={Boolean(pending)}
              onClick={() =>
                void run("link", async () => {
                  await linkCanvasEvidence({ data: { entryId: entry.id, evidenceIds: ids } });
                  setIds([]);
                  onChanged();
                })
              }
            >
              Link {ids.length}
            </Button>
          ) : null}
          <div className="flex gap-2">
            <Input
              aria-label="Why cross it out?"
              placeholder="Disproven? Why cross it out…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="h-9 text-sm"
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={Boolean(pending) || reason.trim().length < 5}
              onClick={() =>
                void run("retire", async () => {
                  await retireCanvasEntry({ data: { entryId: entry.id, reason } });
                  onChanged();
                })
              }
            >
              Cross out
            </Button>
          </div>
          <FormMessages error={error} />
        </div>
      ) : null}
    </li>
  );
}
