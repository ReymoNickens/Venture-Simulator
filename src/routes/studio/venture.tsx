import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { useAction } from "@/hooks/use-action";
import { AssumptionForm, LinkEvidenceForm } from "@/components/forms/AssumptionForm";
import { StageHeader } from "@/components/stage/StageHeader";
import { Reflect } from "@/components/stage/Reflect";
import { NeedsVenture } from "@/components/stage/NeedsVenture";
import { Button } from "@/components/ui/button";
import { FormMessages, Loading } from "@/components/ui/feedback";
import { setAssumptionStatus } from "@/lib/server/venture-work";
import type { Assumption, AssumptionEvidenceLink, Confidence, Importance } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/studio/venture")({ component: VenturePage });

const IMPORTANCE: Importance[] = ["critical", "high", "medium", "low"];
const CONFIDENCE: Confidence[] = ["low", "medium", "high"];

function VenturePage() {
  const { data, loading, refresh } = useStudioWorkspace();
  const [adding, setAdding] = useState(false);
  const [panel, setPanel] = useState<"map" | "link" | null>(null);
  if (loading || !data) return <Loading />;
  if (!data.venture) return <NeedsVenture />;

  const index = new Map(data.assumptions.map((a, i) => [a.id, data.assumptions.length - i]));
  const danger = data.assumptions.filter((a) => a.importance === "critical" && a.confidence === "low");

  return (
    <div className="space-y-5">
      <StageHeader stage="assume" data={data} />

      {adding || !data.assumptions.length ? (
        <AssumptionForm
          onCancel={data.assumptions.length ? () => setAdding(false) : undefined}
          onSaved={() => {
            setAdding(false);
            void refresh();
          }}
        />
      ) : (
        <Button onClick={() => setAdding(true)}>
          <Plus className="size-4" aria-hidden /> Add an assumption
        </Button>
      )}

      {data.assumptions.length && !adding ? (
        <>
          {danger.length ? (
            <p className="rounded-[18px] bg-clay-soft px-4 py-3 text-sm">
              <span className="font-semibold text-clay">{danger.length} could sink you</span> and you haven’t checked them yet. Test those first.
            </p>
          ) : null}
          <ul className="space-y-2">
            {data.assumptions.map((a) => (
              <AssumptionRow
                key={a.id}
                a={a}
                n={index.get(a.id) ?? 0}
                links={data.links.filter((l) => l.assumptionId === a.id)}
                evidenceTitle={(id) => data.evidence.find((e) => e.id === id)?.title ?? "evidence"}
                onChanged={() => void refresh()}
              />
            ))}
          </ul>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
            <button type="button" onClick={() => setPanel(panel === "map" ? null : "map")} className="text-accent">
              {panel === "map" ? "Hide risk map" : "See risk map"}
            </button>
            <button type="button" onClick={() => setPanel(panel === "link" ? null : "link")} className="text-accent">
              {panel === "link" ? "Close" : "Link evidence to an assumption"}
            </button>
          </div>
          {panel === "map" ? (
            <div className="rise rounded-[22px] bg-bg-elevated p-4 ring-1 ring-line">
              <RiskGrid assumptions={data.assumptions} index={index} />
              <p className="mt-2 text-xs text-muted">Top-left: if wrong, it sinks you — and you have little reason to believe it yet.</p>
            </div>
          ) : null}
          {panel === "link" ? (
            <div className="rise rounded-[22px] bg-bg-elevated p-4 ring-1 ring-line">
              <LinkEvidenceForm assumptions={data.assumptions} evidence={data.evidence} onSaved={() => void refresh()} />
            </div>
          ) : null}
        </>
      ) : null}

      <Reflect
        stage="assume"
        data={data}
        prompt="Which assumption scares you most — and why haven’t you tested it yet?"
        onSaved={() => void refresh()}
      />
    </div>
  );
}

function RiskGrid({ assumptions, index }: { assumptions: Assumption[]; index: Map<string, number> }) {
  return (
    <div className="grid grid-cols-[auto_repeat(3,minmax(0,1fr))] gap-1 text-[11px]">
      <span />
      {CONFIDENCE.map((c) => (
        <span key={c} className="pb-1 text-center font-mono tracking-wide text-muted uppercase">
          {c} conf.
        </span>
      ))}
      {IMPORTANCE.map((imp) => (
        <div key={imp} className="contents">
          <span className="flex items-center pr-1 font-mono tracking-wide text-muted uppercase">{imp}</span>
          {CONFIDENCE.map((c) => {
            const here = assumptions.filter((a) => a.importance === imp && a.confidence === c);
            const hot = (imp === "critical" || imp === "high") && c === "low";
            const warm = (imp === "critical" && c === "medium") || (imp === "high" && c === "medium") || (imp === "medium" && c === "low");
            return (
              <div
                key={c}
                className={cn(
                  "flex min-h-11 flex-wrap content-start gap-1 rounded-[12px] border p-1",
                  hot ? "border-clay/60 bg-clay-soft" : warm ? "border-gold/50 bg-gold-soft/70" : "border-line bg-bg",
                )}
              >
                {here.map((a) => (
                  <span
                    key={a.id}
                    title={a.statement}
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full border-2 border-ink text-[11px] font-bold",
                      a.status === "supported" ? "bg-accent text-accent-fg" : a.status === "challenged" ? "bg-clay text-accent-fg" : "bg-bg-elevated",
                    )}
                  >
                    {index.get(a.id)}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const STATUS_OPTIONS = [
  { value: "open", label: "Untested" },
  { value: "testing", label: "Testing" },
  { value: "supported", label: "Held up" },
  { value: "challenged", label: "Broke" },
] as const;

function AssumptionRow({
  a,
  n,
  links,
  evidenceTitle,
  onChanged,
}: {
  a: Assumption;
  n: number;
  links: AssumptionEvidenceLink[];
  evidenceTitle: (id: string) => string;
  onChanged: () => void;
}) {
  const { pending, error, run } = useAction();
  const [open, setOpen] = useState(false);
  const supports = links.filter((l) => l.relationshipType === "supports");
  const challenges = links.filter((l) => l.relationshipType === "challenges");
  return (
    <li className="rounded-[18px] border-2 border-line-strong/70 bg-bg-elevated p-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-ink text-xs font-bold">
          {n}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-6">{a.statement}</p>
          <p className="mt-1 font-mono text-[10.5px] tracking-wide text-muted uppercase">
            {a.importance} · {a.confidence} confidence · {a.authorName}
            {a.syncState === "pending" ? " · saved on phone" : ""}
          </p>
          {links.length ? (
            <ul className="mt-2 space-y-0.5 text-xs">
              {supports.map((l) => (
                <li key={l.id} className="text-accent">＋ supported by: {evidenceTitle(l.evidenceItemId)}</li>
              ))}
              {challenges.map((l) => (
                <li key={l.id} className="text-clay">－ challenged by: {evidenceTitle(l.evidenceItemId)}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-muted">No evidence either way yet.</p>
          )}
          {a.syncState !== "pending" && !open ? (
            <button type="button" onClick={() => setOpen(true)} className="mt-2 text-xs font-semibold text-accent">
              {a.status === "open" ? "Tested it? Update" : `Marked: ${STATUS_OPTIONS.find((x) => x.value === a.status)?.label} · change`}
            </button>
          ) : null}
          {a.syncState !== "pending" && open ? (
            <div className="rise mt-2 flex flex-wrap gap-1">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  disabled={Boolean(pending)}
                  aria-pressed={a.status === s.value}
                  onClick={() =>
                    void run("status", async () => {
                      await setAssumptionStatus({ data: { assumptionId: a.id, status: s.value } });
                      setOpen(false);
                      onChanged();
                    })
                  }
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                    a.status === s.value
                      ? s.value === "supported"
                        ? "border-accent bg-accent text-accent-fg"
                        : s.value === "challenged"
                          ? "border-clay bg-clay text-accent-fg"
                          : "border-ink bg-ink text-bg-elevated"
                      : "border-line-strong text-muted",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          ) : null}
          <FormMessages error={error} />
        </div>
      </div>
    </li>
  );
}
