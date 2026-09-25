import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Search, X } from "lucide-react";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { EvidenceForm } from "@/components/forms/EvidenceForm";
import { EvidencePhoto } from "@/components/EvidencePhoto";
import { Button } from "@/components/ui/button";
import { Eyebrow, EmptyNote } from "@/components/ui/badge";
import { ClassificationStamp } from "@/components/ui/stamp";
import { Loading } from "@/components/ui/feedback";
import { CLASSIFICATIONS, DEFAULT_MAX_PHOTO_BYTES, SOURCE_TYPES } from "@/lib/domain/config";
import { shortDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/studio/notebook")({ component: NotebookPage });

function NotebookPage() {
  const { data, loading, refresh } = useStudioWorkspace();
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<string>("all");
  const evidence = data?.evidence;
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (evidence ?? []).filter(
      (e) =>
        (kind === "all" || e.classification === kind) &&
        (!needle || `${e.title} ${e.content} ${e.authorName}`.toLowerCase().includes(needle)),
    );
  }, [evidence, q, kind]);

  if (loading || !data) return <Loading />;
  if (!data.venture) {
    return (
      <EmptyNote>
        The group notebook opens once your group has chosen a venture.{" "}
        <Link to="/studio/select" className="font-semibold text-accent underline">
          Go to selection
        </Link>
      </EmptyNote>
    );
  }

  const counts = Object.fromEntries(
    CLASSIFICATIONS.map((c) => [c.value, data.evidence.filter((e) => e.classification === c.value).length]),
  );
  const observed = (counts.fact ?? 0) + (counts.evidence ?? 0);
  const sourceLabel = (v: string) => SOURCE_TYPES.find((s) => s.value === v)?.label ?? v;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>Field notebook</Eyebrow>
          <h1 className="mt-1 font-display text-3xl font-extrabold">What we actually know</h1>
          <p className="mt-1 text-sm text-muted">
            {data.evidence.length} entries · {observed} observed or measured ·{" "}
            {(counts.opinion ?? 0) + (counts.assumption ?? 0)} opinion or assumption
          </p>
        </div>
        <Button variant={adding ? "secondary" : "primary"} onClick={() => setAdding((v) => !v)}>
          {adding ? <X className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
          {adding ? "Close" : "New entry"}
        </Button>
      </div>

      {adding ? (
        <div className="notebook rounded-[10px] border-2 border-ink py-4 pr-4 pl-10">
          <EvidenceForm
            maxPhotoBytes={data.offering?.maxPhotoBytes ?? DEFAULT_MAX_PHOTO_BYTES}
            onSaved={() => void refresh()}
          />
        </div>
      ) : null}

      {data.evidence.length ? (
        <div className="space-y-2">
          <label className="flex items-center gap-2 rounded-[8px] border-2 border-line-strong/70 bg-bg-elevated px-3">
            <Search className="size-4 text-faint" aria-hidden />
            <span className="sr-only">Search the notebook</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search entries, quotes, names"
              className="h-10 w-full bg-transparent text-sm focus:outline-none"
            />
          </label>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {[{ value: "all", label: "All" }, ...CLASSIFICATIONS].map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setKind(c.value)}
                aria-pressed={kind === c.value}
                className={cn(
                  "shrink-0 rounded-full border-2 px-3 py-1 text-xs font-medium",
                  kind === c.value ? "border-ink bg-ink text-bg-elevated" : "border-line-strong/70 text-ink-soft",
                )}
              >
                {c.label}
                {c.value !== "all" ? <span className="ml-1 opacity-60">{counts[c.value] ?? 0}</span> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {filtered.length ? (
        <ul className="space-y-3">
          {filtered.map((ev) => (
            <li key={ev.id} className="notebook rounded-[10px] border-2 border-ink/80 py-3 pr-4 pl-10">
              <div className="flex items-start justify-between gap-2">
                <p className="font-display text-base leading-snug font-bold">{ev.title}</p>
                <ClassificationStamp value={ev.classification} />
              </div>
              <p className="mt-1 text-sm leading-7 whitespace-pre-line text-ink-soft">{ev.content}</p>
              {ev.hasPhoto ? (
                <EvidencePhoto
                  id={ev.id}
                  localData={ev.photoData}
                  className="mt-2 max-h-48 rounded-[6px] border-2 border-ink"
                />
              ) : null}
              <p className="mt-2 font-mono text-[11px] text-faint">
                {sourceLabel(ev.sourceType)} · {ev.authorName} · {shortDate(ev.observedAt || ev.createdAt)}
                {ev.locationContext ? ` · ${ev.locationContext}` : ""}
                {ev.syncState === "pending" ? " · saved on phone" : ""}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyNote>
          {data.evidence.length
            ? "Nothing matches that search."
            : "Nothing logged yet. Go out, look, count, ask — then write it down here."}
        </EmptyNote>
      )}
    </div>
  );
}
