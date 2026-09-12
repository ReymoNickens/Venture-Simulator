import { createFileRoute, Link } from "@tanstack/react-router";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { AdvisorPanel } from "@/components/advisor/AdvisorPanel";
import { AssumptionForm, LinkEvidenceForm } from "@/components/forms/AssumptionForm";
import { EvidenceForm } from "@/components/forms/EvidenceForm";
import { Badge, Card } from "@/components/ui/badge";
import { DEFAULT_MAX_PHOTO_BYTES } from "@/lib/domain/config";

export const Route = createFileRoute("/studio/venture")({ component: VenturePage });

function VenturePage() {
  const { data, loading, refresh } = useStudioWorkspace();
  if (loading || !data) return <div className="h-40 animate-pulse rounded-[28px] bg-bg-subtle" />;
  if (!data.venture) {
    return (
      <Card className="space-y-2">
        <h1 className="font-display text-2xl">No venture yet</h1>
        <p className="text-sm text-muted">The group must select an opportunity first.</p>
        <Link to="/studio/select" className="text-sm text-accent">
          Go to selection
        </Link>
      </Card>
    );
  }

  const selected = data.visibleOpportunities.find((o) => o.id === data.venture?.opportunityId);

  return (
    <div className="space-y-5">
      <div>
        <Badge tone="accent">{data.venture.status}</Badge>
        <h1 className="mt-2 font-display text-3xl">{data.venture.name}</h1>
        <p className="mt-2 text-sm leading-6 text-muted">{data.venture.selectionRationale}</p>
        {selected ? (
          <p className="mt-2 text-xs text-faint">From {selected.authorName}’s opportunity.</p>
        ) : null}
      </div>

      <Card className="space-y-4">
        <h2 className="font-display text-xl">Log evidence</h2>
        <p className="text-sm text-muted">
          Evidence is not a document dump. Classify it. The advisor may challenge the classification;
          you confirm it.
        </p>
        <EvidenceForm
          maxPhotoBytes={data.offering?.maxPhotoBytes ?? DEFAULT_MAX_PHOTO_BYTES}
          onSaved={() => void refresh()}
        />
        <ul className="divide-y divide-line">
          {data.evidence.map((ev) => (
            <li key={ev.id} className="py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{ev.title}</p>
                <Badge>{ev.classification}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted">{ev.content}</p>
              <p className="mt-1 text-xs text-faint">
                {ev.sourceType} · {ev.authorName}
                {ev.syncState === "pending" ? " · saved locally" : ""}
              </p>
              {ev.photoData ? (
                <img
                  src={ev.photoData}
                  alt=""
                  className="mt-2 max-h-40 rounded-[12px] border border-line"
                />
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-display text-xl">Assumption ledger</h2>
        <p className="text-sm text-muted">
          Name the assumption that would collapse the venture if it were wrong. Critical + low confidence
          is the dangerous quadrant.
        </p>
        <AssumptionForm onSaved={() => void refresh()} />
        <ul className="divide-y divide-line">
          {data.assumptions.map((a) => {
            const links = data.links.filter((l) => l.assumptionId === a.id);
            return (
              <li key={a.id} className="py-3">
                <p className="text-sm">{a.statement}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.12em] text-faint">
                  {a.importance} importance · {a.confidence} confidence
                  {a.syncState === "pending" ? " · saved locally" : ""}
                </p>
                {links.length ? (
                  <ul className="mt-2 space-y-1 text-xs text-muted">
                    {links.map((l) => {
                      const ev = data.evidence.find((e) => e.id === l.evidenceItemId);
                      return (
                        <li key={l.id}>
                          {l.relationshipType} — {ev?.title ?? l.evidenceItemId}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-display text-xl">Link evidence to assumptions</h2>
        <LinkEvidenceForm
          assumptions={data.assumptions}
          evidence={data.evidence}
          onSaved={() => void refresh()}
        />
      </Card>

      <AdvisorPanel data={data} stage="evidence" onSent={() => void refresh()} />
    </div>
  );
}
