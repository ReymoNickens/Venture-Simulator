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
      <div className="grid gap-4 md:grid-cols-2">
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
  const [verdict, setVerdict] = useState<Verdict>(current?.verdict ?? "uncertain");
  const [reasoning, setReasoning] = useState("");
  const [evidenceIds, setEvidenceIds] = useState<string[]>(current?.evidenceIds ?? []);
  const { pending, error, run } = useAction();
  return (
    <section className="flex flex-col rounded-[10px] border-2 border-ink bg-bg-elevated">
      <div className="border-b-2 border-ink px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-display text-xl font-extrabold">{title}</h2>
          {current ? (
            <Stamp tone={VERDICT_TONE[current.verdict]} tilt={-5}>
              {current.verdict}
            </Stamp>
          ) : (
            <Stamp tone="muted" tilt={-3}>
              Not judged
            </Stamp>
          )}
        </div>
        <p className="mt-1 text-sm text-muted">{question}</p>
      </div>
      <div className="flex-1 space-y-3 px-4 py-3">
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
            Re-assess
          </Button>
        )}
      </div>
    </section>
  );
}
