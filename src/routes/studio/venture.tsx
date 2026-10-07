import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, X } from "lucide-react";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { AdvisorPanel } from "@/components/advisor/AdvisorPanel";
import { AssumptionForm, LinkEvidenceForm } from "@/components/forms/AssumptionForm";
import { EvidenceForm } from "@/components/forms/EvidenceForm";
import { Card, EmptyNote } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/ui/feedback";
import { ClassificationStamp, Stamp } from "@/components/ui/stamp";
import { StepHeader } from "@/components/shell/StepHeader";
import { DEFAULT_MAX_PHOTO_BYTES } from "@/lib/domain/config";
import type { WorkspaceSnapshot } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/studio/venture")({ component: VenturePage });

type Tab = "evidence" | "assumptions" | "advisor";

function VenturePage() {
  const { data, loading, refresh } = useStudioWorkspace();
  const [tab, setTab] = useState<Tab>("evidence");
  if (loading || !data) return <Loading />;
  if (!data.venture) {
    return (
      <div>
        <StepHeader
          step="evidence"
          title="Your notebook"
          lead="Evidence and assumptions are logged against the venture your group picks."
        />
        <EmptyNote>
          Your group has not picked a venture yet.{" "}
          <Link to="/studio/select" className="font-semibold text-accent underline underline-offset-2">
            Go to picking
          </Link>
        </EmptyNote>
      </div>
    );
  }

  const selected = data.visibleOpportunities.find((o) => o.id === data.venture?.opportunityId);
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "evidence", label: "Evidence", count: data.evidence.length },
    { id: "assumptions", label: "Assumptions", count: data.assumptions.length },
    { id: "advisor", label: "Advisor" },
  ];

  return (
    <div>
      <StepHeader
        step={data.evidence.length ? "assumptions" : "evidence"}
        title={data.venture.name}
        lead={selected ? `From ${selected.authorName}’s problem: ${selected.problem}` : undefined}
      />

      <div role="tablist" aria-label="Notebook" className="mb-4 grid grid-cols-3 gap-1 rounded-full bg-bg-subtle p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cn(
              "min-h-11 rounded-full text-sm font-semibold transition-colors",
              tab === t.id ? "bg-bg-elevated text-ink shadow-sm" : "text-muted",
            )}
          >
            {t.label}
            {t.count !== undefined ? <span className="ml-1 text-faint tabular-nums">{t.count}</span> : null}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="flow-enter" key={tab}>
        {tab === "evidence" ? <EvidenceTab data={data} refresh={refresh} /> : null}
        {tab === "assumptions" ? <AssumptionsTab data={data} refresh={refresh} /> : null}
        {tab === "advisor" ? <AdvisorPanel data={data} stage="evidence" onSent={() => void refresh()} /> : null}
      </div>
    </div>
  );
}

function AddPanel({
  open,
  onToggle,
  label,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  children: React.ReactNode;
}) {
  if (!open) {
    return (
      <Button size="lg" className="w-full" onClick={onToggle}>
        <Plus className="size-5" aria-hidden /> {label}
      </Button>
    );
  }
  return (
    <Card className="flow-enter relative border-ink">
      <button
        type="button"
        onClick={onToggle}
        aria-label="Close"
        className="absolute top-2 right-2 flex size-11 items-center justify-center rounded-full text-muted hover:bg-bg-subtle"
      >
        <X className="size-5" aria-hidden />
      </button>
      <h2 className="mb-3 pr-10 font-display text-xl font-bold">{label}</h2>
      {children}
    </Card>
  );
}

function EvidenceTab({ data, refresh }: { data: WorkspaceSnapshot; refresh: () => Promise<unknown> }) {
  const [adding, setAdding] = useState(data.evidence.length === 0);
  return (
    <div className="space-y-4">
      <AddPanel open={adding} onToggle={() => setAdding((v) => !v)} label="Log evidence">
        <p className="mb-4 text-sm leading-6 text-muted">
          One thing you saw, heard or counted. Say honestly what kind of thing it is; the advisor may push back.
        </p>
        <EvidenceForm
          maxPhotoBytes={data.offering?.maxPhotoBytes ?? DEFAULT_MAX_PHOTO_BYTES}
          onSaved={() => {
            setAdding(false);
            void refresh();
          }}
        />
      </AddPanel>

      {data.evidence.length ? (
        <ul className="space-y-3 pt-2">
          {data.evidence.map((ev) => (
            <li key={ev.id} className="note p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-display font-bold">{ev.title}</p>
                <ClassificationStamp value={ev.classification} />
              </div>
              <p className="mt-1 text-sm leading-6 text-ink-soft">{ev.content}</p>
              <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-faint">
                <span className="capitalize">{ev.sourceType}</span>· {ev.authorName}
                {ev.syncState === "pending" ? <Stamp tone="gold" size="xs">on this phone, not sent yet</Stamp> : null}
              </p>
              {ev.photoData ? (
                <img src={ev.photoData} alt="" className="mt-3 max-h-44 rounded-[12px] border border-line" />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const IMPORTANCE_TONE = { critical: "clay", high: "gold", medium: "muted", low: "muted" } as const;

function AssumptionsTab({ data, refresh }: { data: WorkspaceSnapshot; refresh: () => Promise<unknown> }) {
  const [adding, setAdding] = useState(data.assumptions.length === 0);
  return (
    <div className="space-y-4">
      <AddPanel open={adding} onToggle={() => setAdding((v) => !v)} label="Add an assumption">
        <p className="mb-4 text-sm leading-6 text-muted">
          Name the belief that would sink the venture if it were wrong. Critical and unsure is the dangerous corner.
        </p>
        <AssumptionForm
          onSaved={() => {
            setAdding(false);
            void refresh();
          }}
        />
      </AddPanel>

      {data.assumptions.length ? (
        <ul className="space-y-3 pt-2">
          {data.assumptions.map((a) => {
            const links = data.links.filter((l) => l.assumptionId === a.id);
            return (
              <li key={a.id} className="rounded-[14px] border border-line bg-bg-elevated p-4">
                <p className="text-[15px] leading-6">{a.statement}</p>
                <p className="mt-2 flex flex-wrap gap-1.5">
                  <Stamp tone={IMPORTANCE_TONE[a.importance]} size="xs">
                    {a.importance}
                  </Stamp>
                  <Stamp tone="muted" size="xs">
                    {a.confidence} confidence
                  </Stamp>
                  {a.syncState === "pending" ? <Stamp tone="gold" size="xs">not sent yet</Stamp> : null}
                </p>
                {links.length ? (
                  <ul className="mt-3 space-y-1 border-t border-line pt-2 text-sm">
                    {links.map((l) => {
                      const ev = data.evidence.find((e) => e.id === l.evidenceItemId);
                      return (
                        <li key={l.id} className="flex items-center gap-2">
                          <span
                            className={cn(
                              "text-xs font-semibold",
                              l.relationshipType === "supports" ? "text-mint" : "text-clay",
                            )}
                          >
                            {l.relationshipType === "supports" ? "Backed by" : "Challenged by"}
                          </span>
                          <span className="truncate text-ink-soft">{ev?.title ?? "evidence"}</span>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      <Card className="space-y-3">
        <h2 className="font-display text-lg font-bold">Link evidence to an assumption</h2>
        <LinkEvidenceForm assumptions={data.assumptions} evidence={data.evidence} onSaved={() => void refresh()} />
      </Card>
    </div>
  );
}
