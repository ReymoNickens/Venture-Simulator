import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, Plus } from "lucide-react";
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
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-mint" /> backed by evidence</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-gold" /> still a guess</span>
        <span>{evidenced} of {live.length} notes backed</span>
      </p>
      <div className="space-y-2.5">
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
}: {
  blockKey: CanvasBlockKey;
  title: string;
  prompt: string;
  entries: CanvasEntry[];
  data: WorkspaceSnapshot;
  onChanged: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const { pending, error, run } = useAction();
  const backed = entries.filter((e) => e.evidenceIds.length).length;
  const status = !entries.length ? "Empty" : backed === entries.length ? "Backed by evidence" : backed ? `${backed} of ${entries.length} backed` : "Still a guess";
  return (
    <section className={cn("rounded-[22px] bg-bg-elevated ring-1", open ? "ring-ink" : "ring-line")}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
        <span
          className={cn(
            "size-3 shrink-0 rounded-full",
            !entries.length ? "bg-line-strong" : backed === entries.length ? "bg-mint" : "bg-gold",
          )}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{title}</span>
          <span className="block text-sm text-muted">{status}</span>
        </span>
        <ChevronDown className={cn("size-5 shrink-0 text-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div className="rise space-y-3 px-4 pb-4">
          <p className="text-sm text-muted">{prompt}</p>
          {entries.length ? (
            <ul className="space-y-2">
              {entries.map((e) => (
                <Note key={e.id} entry={e} data={data} onChanged={onChanged} />
              ))}
            </ul>
          ) : null}
          <div className="space-y-2 rounded-[18px] bg-bg p-3">
            <Textarea
              aria-label={`New entry for ${title}`}
              value={body}
              onChange={(ev) => setBody(ev.target.value)}
              placeholder="Add a note…"
              className="min-h-16 bg-bg-elevated text-sm"
            />
            {body.trim() ? <EvidencePicker evidence={data.evidence} value={evidenceIds} onChange={setEvidenceIds} /> : null}
            <FormMessages error={error} />
            <Button
              size="sm"
              disabled={Boolean(pending) || body.trim().length < 3}
              onClick={() =>
                void run("add", async () => {
                  await addCanvasEntry({ data: { block: blockKey, body, evidenceIds } });
                  setBody("");
                  setEvidenceIds([]);
                  onChanged();
                })
              }
            >
              <Plus className="size-4" aria-hidden /> {pending ? "Adding…" : "Add"}
            </Button>
          </div>
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
        "rounded-[12px] p-2 text-sm leading-5",
        backed ? "ring-1 ring-line bg-bg-elevated" : "border-2 border-dashed border-line-strong bg-gold-soft/60",
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
