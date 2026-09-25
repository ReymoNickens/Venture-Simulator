import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { useAction } from "@/hooks/use-action";
import { proposeDecision, ratePeers, voteOnDecision } from "@/lib/server/venture-work";
import { computeFinance, formatCedis, parseFinanceInputs } from "@/lib/domain/finance";
import type { VentureDecision, WorkspaceSnapshot } from "@/lib/domain/types";
import { StageHeader } from "@/components/stage/StageHeader";
import { Reflect } from "@/components/stage/Reflect";
import { NeedsVenture } from "@/components/stage/NeedsVenture";
import { Button } from "@/components/ui/button";
import { Choice, Field, Textarea } from "@/components/ui/input";
import { Card, Eyebrow } from "@/components/ui/badge";
import { Stamp } from "@/components/ui/stamp";
import { FormMessages, Loading } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/studio/decide")({ component: DecidePage });

const DECISIONS = [
  { value: "persevere", label: "Persevere", hint: "The evidence says carry on, roughly as planned." },
  { value: "pivot", label: "Pivot", hint: "Keep what you learned; change the customer, problem, solution or model." },
  { value: "stop", label: "Stop", hint: "The evidence says this won’t work. Stopping on good evidence is a success." },
] as const;
const DECISION_TONE = { persevere: "forest", pivot: "gold", stop: "clay" } as const;

function DecidePage() {
  const { data, loading, refresh } = useStudioWorkspace();
  if (loading || !data) return <Loading />;
  if (!data.venture) return <NeedsVenture />;
  const open = data.work.decisions.find((d) => d.status === "open") ?? null;
  const ratified = data.work.decisions.find((d) => d.status === "ratified") ?? null;
  const past = data.work.decisions.filter((d) => d.status !== "open");
  return (
    <div className="space-y-6">
      <StageHeader stage="decide" data={data} />
      <LookBack data={data} />
      {ratified ? (
        <section className="rounded-[22px] ring-1 ring-line bg-bg-elevated p-4">
          <Stamp tone={DECISION_TONE[ratified.decision]} size="md" tilt={-5}>
            {ratified.decision}
          </Stamp>
          <p className="mt-3 text-sm leading-6">{ratified.rationale}</p>
          {ratified.whatChanges ? (
            <p className="mt-2 text-sm leading-6"><span className="font-semibold">What changes:</span> {ratified.whatChanges}</p>
          ) : null}
        </section>
      ) : null}
      {open ? (
        <DecisionVote data={data} d={open} onSaved={() => void refresh()} />
      ) : !ratified ? (
        <ProposeDecision onSaved={() => void refresh()} />
      ) : null}
      {past.filter((d) => d.status !== "ratified").length ? (
        <Card>
          <Eyebrow>Earlier proposals</Eyebrow>
          <ul className="mt-2 space-y-1 text-sm">
            {past
              .filter((d) => d.status !== "ratified")
              .map((d) => (
                <li key={d.id}>
                  <span className="font-semibold capitalize">{d.decision}</span> — {d.status}, by {d.proposedByName}
                </li>
              ))}
          </ul>
        </Card>
      ) : null}
      <Reflect
        stage="decide"
        data={data}
        prompt="Looking back: what did you believe at the start that turned out to be wrong?"
        onSaved={() => void refresh()}
      />
      <PeerRatings data={data} onSaved={() => void refresh()} />
    </div>
  );
}

function LookBack({ data }: { data: WorkspaceSnapshot }) {
  const a = data.assumptions;
  const held = a.filter((x) => x.status === "supported").length;
  const broke = a.filter((x) => x.status === "challenged").length;
  const untested = a.length - held - broke;
  const fin = data.work.finance ? computeFinance(parseFinanceInputs(data.work.finance.inputs)) : null;
  const tests = data.work.prototypeTests;
  const easy = tests.filter((t) => t.outcome === "succeeded").length;
  const interviews = data.work.interviews;
  const payers = interviews.filter((i) => i.wouldPay === "yes").length;
  const cells: [string, string, string?][] = [
    [String(interviews.length), "interviews", payers ? `${payers} showed they’d pay` : undefined],
    [String(data.evidence.length), "pieces of evidence"],
    [`${held}/${broke}/${untested}`, "assumptions held / broke / untested"],
    [
      data.work.feasibility.length ? data.work.feasibility.map((f) => f.verdict[0].toUpperCase()).join("") : "—",
      "feasibility (P/U/C)",
    ],
    [fin?.breakEvenUnits != null ? String(fin.breakEvenUnits) : "—", "units/month to break even", fin ? `profit ${formatCedis(fin.monthlyProfit)}/mo` : undefined],
    [tests.length ? `${easy}/${tests.length}` : "—", "prototype tests went easily"],
  ];
  return (
    <Card as="section">
      <Eyebrow>Sankofa — go back and get it</Eyebrow>
      <h2 className="mt-1 font-display text-xl font-bold">What your record says</h2>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {cells.map(([n, label, sub]) => (
          <div key={label} className="rounded-[14px] border-2 border-line-strong/60 bg-bg p-2.5">
            <p className="font-display text-2xl font-extrabold tabular">{n}</p>
            <p className="text-xs leading-4 text-muted">{label}</p>
            {sub ? <p className="mt-0.5 text-[11px] text-ink-soft">{sub}</p> : null}
          </div>
        ))}
      </div>
    </Card>
  );
}

function ProposeDecision({ onSaved }: { onSaved: () => void }) {
  const [decision, setDecision] = useState<(typeof DECISIONS)[number]["value"]>("persevere");
  const [rationale, setRationale] = useState("");
  const [whatChanges, setWhatChanges] = useState("");
  const { pending, error, run } = useAction();
  return (
    <Card as="section" className="space-y-3 border-ink">
      <h2 className="font-display text-xl font-bold">Propose the group’s decision</h2>
      <p className="text-sm text-muted">Like the venture itself, a majority must endorse it.</p>
      <Choice label="Decision" value={decision} options={DECISIONS} onChange={setDecision} />
      <Field label="Why — citing what you found">
        <Textarea value={rationale} onChange={(e) => setRationale(e.target.value)} className="min-h-32" />
      </Field>
      {decision !== "persevere" ? (
        <Field label={decision === "pivot" ? "What changes in the pivot?" : "What would you tell the next group attempting this?"}>
          <Textarea value={whatChanges} onChange={(e) => setWhatChanges(e.target.value)} />
        </Field>
      ) : null}
      <FormMessages error={error} />
      <Button
        disabled={Boolean(pending) || rationale.trim().length < 80}
        onClick={() =>
          void run("propose", async () => {
            await proposeDecision({ data: { decision, rationale, whatChanges } });
            onSaved();
          })
        }
      >
        {pending ? "Proposing…" : rationale.trim().length < 80 ? `Reasoning ${rationale.trim().length}/80` : "Put it to the group"}
      </Button>
    </Card>
  );
}

function DecisionVote({ data, d, onSaved }: { data: WorkspaceSnapshot; d: VentureDecision; onSaved: () => void }) {
  const [comment, setComment] = useState("");
  const { pending, error, run } = useAction();
  const endorse = d.votes.filter((v) => v.vote === "endorse").length;
  const vote = (v: "endorse" | "object") =>
    void run("vote", async () => {
      await voteOnDecision({ data: { decisionId: d.id, vote: v, comment } });
      setComment("");
      onSaved();
    });
  return (
    <section className="rounded-[22px] ring-1 ring-line bg-bg-elevated p-4">
      <div className="flex items-center gap-2">
        <Stamp tone={DECISION_TONE[d.decision]} tilt={-4}>{d.decision}?</Stamp>
        <span className="text-xs text-muted">proposed by {d.proposedByName}</span>
      </div>
      <p className="mt-2 text-sm leading-6">{d.rationale}</p>
      {d.whatChanges ? <p className="mt-1 text-sm leading-6 text-ink-soft">{d.whatChanges}</p> : null}
      <p className="mt-3 text-xs font-semibold">
        {endorse} of {d.threshold} endorsements
      </p>
      <ul className="mt-1 space-y-0.5 text-sm">
        {d.votes.map((v) => (
          <li key={v.studentId}>
            {v.studentName}{" "}
            <span className={cn("font-semibold", v.vote === "endorse" ? "text-accent" : "text-clay")}>
              {v.vote === "endorse" ? "endorses" : "objects"}
            </span>
            {v.comment ? <span className="text-muted"> — {v.comment}</span> : null}
          </li>
        ))}
      </ul>
      <div className="mt-3 space-y-2 border-t border-line pt-3">
        <Textarea
          aria-label="Your comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="A reason is required to object."
          className="min-h-20"
        />
        <FormMessages error={error} />
        <div className="flex gap-2">
          <Button disabled={Boolean(pending)} onClick={() => vote("endorse")}>Endorse</Button>
          <Button variant="secondary" disabled={Boolean(pending)} onClick={() => vote("object")}>Object</Button>
        </div>
        {d.votes.some((v) => v.studentId === data.student?.id) ? (
          <p className="text-xs text-muted">You have voted — you can change your vote until it is settled.</p>
        ) : null}
      </div>
    </section>
  );
}

function PeerRatings({ data, onSaved }: { data: WorkspaceSnapshot; onSaved: () => void }) {
  const peers = data.members.filter(
    (m) => m.membershipStatus === "active" && m.studentId !== data.student?.id && !m.isSynthetic,
  );
  const existing = new Map(data.life.myPeerRatings.map((r) => [r.rateeStudentId, r]));
  const [scores, setScores] = useState<Record<string, number>>(() =>
    Object.fromEntries(peers.map((p) => [p.studentId, existing.get(p.studentId)?.score ?? 0])),
  );
  const [comments, setComments] = useState<Record<string, string>>(() =>
    Object.fromEntries(peers.map((p) => [p.studentId, existing.get(p.studentId)?.comment ?? ""])),
  );
  const { pending, error, notice, run } = useAction();
  const [open, setOpen] = useState(false);
  if (!peers.length) return null;
  if (!open) {
    const done = peers.every((p) => existing.has(p.studentId));
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center justify-between rounded-[22px] bg-bg-elevated p-4 text-left ring-1 ring-line">
        <span>
          <span className="block font-semibold">Rate your teammates</span>
          <span className="block text-sm text-muted">{done ? "Done — tap to change" : "Private. Only your lecturer sees it."}</span>
        </span>
        <Lock className="size-4 text-muted" aria-hidden />
      </button>
    );
  }
  const labels = ["", "Barely", "Some", "Fair share", "A lot", "Carried us"];
  return (
    <section className="rounded-[18px] ring-1 ring-line bg-bg-elevated p-4">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
        <Lock className="size-3" aria-hidden /> Confidential
      </p>
      <h2 className="mt-1 font-display text-xl font-bold">How much did each teammate contribute?</h2>
      <p className="mt-1 text-sm text-muted">
        Only your lecturer sees these. Rate the work, not the friendship — and use the record to check yourself.
      </p>
      <ul className="mt-3 divide-y divide-line">
        {peers.map((p) => (
          <li key={p.studentId} className="space-y-2 py-3">
            <p className="font-semibold">{p.fullName}</p>
            <div className="flex flex-wrap gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={scores[p.studentId] === n}
                  onClick={() => setScores((s) => ({ ...s, [p.studentId]: n }))}
                  className={cn(
                    "rounded-[12px] border-2 px-2.5 py-1 text-xs",
                    scores[p.studentId] === n ? "border-ink bg-ink text-bg-elevated" : "border-line-strong text-ink-soft",
                  )}
                >
                  {n} · {labels[n]}
                </button>
              ))}
            </div>
            <input
              aria-label={`Comment on ${p.fullName}`}
              value={comments[p.studentId] ?? ""}
              onChange={(e) => setComments((c) => ({ ...c, [p.studentId]: e.target.value }))}
              placeholder="Optional: what did they do?"
              className="h-10 w-full rounded-[14px] border-2 border-line-strong/70 bg-bg-elevated px-3 text-sm"
            />
          </li>
        ))}
      </ul>
      <FormMessages error={error} notice={notice} />
      <Button
        className="mt-2"
        disabled={Boolean(pending) || peers.some((p) => !scores[p.studentId])}
        onClick={() =>
          void run(
            "rate",
            async () => {
              await ratePeers({
                data: {
                  ratings: peers.map((p) => ({ studentId: p.studentId, score: scores[p.studentId], comment: comments[p.studentId] })),
                },
              });
              onSaved();
            },
            "Ratings saved. Only your lecturer can see them.",
          )
        }
      >
        {pending ? "Saving…" : "Save my ratings"}
      </Button>
    </section>
  );
}
