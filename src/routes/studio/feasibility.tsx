import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { useAction } from "@/hooks/use-action";
import { assessFeasibility } from "@/lib/server/venture-work";
import { FEASIBILITY_LENSES, VERDICTS } from "@/lib/domain/stages";
import type { FeasibilityAssessment, WorkspaceSnapshot } from "@/lib/domain/types";
import { StageHeader } from "@/components/stage/StageHeader";
import { Reflect } from "@/components/stage/Reflect";
import { NeedsVenture } from "@/components/stage/NeedsVenture";
import { EvidencePicker } from "@/components/stage/EvidencePicker";
import { Button } from "@/components/ui/button";
import { Choice, Field, Textarea } from "@/components/ui/input";
import { Stamp } from "@/components/ui/stamp";
import { FormMessages, Loading } from "@/components/ui/feedback";
import { shortDate } from "@/lib/dates";

export const Route = createFileRoute("/studio/feasibility")({ component: FeasibilityPage });

type Verdict = (typeof VERDICTS)[number]["value"];
const VERDICT_TONE = { promising: "forest", uncertain: "gold", concerning: "clay" } as const;

function FeasibilityPage() {
  const { data, loading, refresh } = useStudioWorkspace();
  if (loading || !data) return <Loading />;
  if (!data.venture) return <NeedsVenture />;
  return (
    <div className="space-y-6">
      <StageHeader stage="feasibility" data={data} />
      <div className="space-y-2.5">
        {FEASIBILITY_LENSES.map((lens) => (
          <Lens
            key={lens.key}
            lensKey={lens.key}
            title={lens.title}
            question={lens.question}
            current={data.work.feasibility.find((f) => f.lens === lens.key) ?? null}
            data={data}
            onSaved={() => void refresh()}
          />
        ))}
      </div>
      <Reflect
        stage="feasibility"
        data={data}
        prompt="Which lens worries you most, honestly? What would change your verdict?"
        onSaved={() => void refresh()}
      />
    </div>
  );
}

function Lens({
  lensKey,
  title,
  question,
  current,
  data,
  onSaved,
}: {
  lensKey: string;
  title: string;
  question: string;
  current: FeasibilityAssessment | null;
  data: WorkspaceSnapshot;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [verdict, setVerdict] = useState<Verdict>(current?.verdict ?? "uncertain");
  const [reasoning, setReasoning] = useState("");
  const [evidenceIds, setEvidenceIds] = useState<string[]>(current?.evidenceIds ?? []);
  const { pending, error, run } = useAction();
  return (
    <section className={`rounded-[22px] bg-bg-elevated ring-1 ${open ? "ring-ink" : "ring-line"}`}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{title}</span>
          <span className="block text-sm text-muted">{question}</span>
        </span>
        {current ? (
          <Stamp tone={VERDICT_TONE[current.verdict]}>{current.verdict}</Stamp>
        ) : (
          <Stamp tone="muted">Not judged</Stamp>
        )}
      </button>
      {open ? (
      <div className="rise space-y-3 px-4 pb-4">
        {current && !editing ? (
          <>
            <p className="text-sm leading-6 whitespace-pre-line">{current.reasoning}</p>
            {current.evidenceIds.length ? (
              <ul className="space-y-0.5 text-xs text-accent">
                {current.evidenceIds.map((id) => (
                  <li key={id}>↳ {data.evidence.find((e) => e.id === id)?.title ?? "evidence"}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs font-semibold text-clay">No evidence cited — this verdict is an opinion.</p>
            )}
            <p className="text-[11px] text-faint">
              {current.authorName} · {shortDate(current.createdAt)}
              {current.revisions ? ` · revised ${current.revisions}×` : ""}
            </p>
          </>
        ) : null}
        {editing || !current ? (
          <div className="space-y-3">
            <Choice label="Verdict" value={verdict} options={VERDICTS} onChange={setVerdict} />
            <Field label="Reasoning">
              <Textarea value={reasoning} onChange={(e) => setReasoning(e.target.value)} placeholder="What did you find? What would change your mind?" />
            </Field>
            <EvidencePicker evidence={data.evidence} value={evidenceIds} onChange={setEvidenceIds} />
            <FormMessages error={error} />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={Boolean(pending) || reasoning.trim().length < 40}
                onClick={() =>
                  void run("save", async () => {
                    await assessFeasibility({ data: { lens: lensKey, verdict, reasoning, evidenceIds } });
                    setReasoning("");
                    setEditing(false);
                    onSaved();
                  })
                }
              >
                {pending ? "Saving…" : reasoning.trim().length < 40 ? `Reasoning ${reasoning.trim().length}/40` : "Record verdict"}
              </Button>
              {current ? (
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            Change verdict
          </Button>
        )}
      </div>
      ) : null}
    </section>
  );
}
