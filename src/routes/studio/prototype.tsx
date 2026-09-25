import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Camera, FlaskConical } from "lucide-react";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { createPrototype } from "@/lib/server/venture-work";
import { saveOffline } from "@/lib/offline/actions";
import { compressPhoto } from "@/lib/offline/photos";
import { PROTOTYPE_KINDS } from "@/lib/domain/stages";
import { formatCedis } from "@/lib/domain/finance";
import { DEFAULT_MAX_PHOTO_BYTES } from "@/lib/domain/config";
import type { Prototype, PrototypeTest, WorkspaceSnapshot, WouldPay } from "@/lib/domain/types";
import { StageHeader } from "@/components/stage/StageHeader";
import { Reflect } from "@/components/stage/Reflect";
import { NeedsVenture } from "@/components/stage/NeedsVenture";
import { EvidencePhoto } from "@/components/EvidencePhoto";
import { Button } from "@/components/ui/button";
import { BigInput, BigText, Pick, StepFlow, type Step } from "@/components/flow/StepFlow";
import { Card, Eyebrow, EmptyNote } from "@/components/ui/badge";
import { Stamp } from "@/components/ui/stamp";
import { Loading } from "@/components/ui/feedback";

export const Route = createFileRoute("/studio/prototype")({ component: PrototypePage });

type Kind = (typeof PROTOTYPE_KINDS)[number]["value"];
const OUTCOMES = [
  { value: "succeeded", label: "Did it easily" },
  { value: "struggled", label: "Struggled" },
  { value: "failed", label: "Couldn’t / wouldn’t" },
] as const;
const OUTCOME_TONE = { succeeded: "forest", struggled: "gold", failed: "clay" } as const;

function PrototypePage() {
  const { data, loading, refresh } = useStudioWorkspace();
  const [building, setBuilding] = useState(false);
  if (loading || !data) return <Loading />;
  if (!data.venture) return <NeedsVenture />;
  const { prototypes, prototypeTests } = data.work;
  return (
    <div className="space-y-6">
      <StageHeader stage="prototype" data={data} />
      <Card as="section" className="space-y-2">
        <Eyebrow>Cheapest possible test</Eyebrow>
        <p className="text-sm leading-6 text-ink-soft">
          A prototype is a question you can hold. Before you spend on equipment, test your riskiest
          assumption with something you can make this week for almost nothing: a paper menu, a
          WhatsApp catalogue, a Canva mock-up, a one-evening trial stall. Then watch real people use
          it — and write down what they <em>do</em>, not just what they say.
        </p>
      </Card>

      {building || !prototypes.length ? (
        <BuildForm
          onCancel={prototypes.length ? () => setBuilding(false) : undefined}
          onDone={() => {
            setBuilding(false);
            void refresh();
          }}
          maxPhotoBytes={data.offering?.maxPhotoBytes ?? DEFAULT_MAX_PHOTO_BYTES}
        />
      ) : (
        <Button variant="secondary" onClick={() => setBuilding(true)}>
          + Record another prototype
        </Button>
      )}

      {prototypes.map((p) => (
        <PrototypeCard
          key={p.id}
          p={p}
          tests={prototypeTests.filter((t) => t.prototypeId === p.id)}
          data={data}
          onSaved={() => void refresh()}
        />
      ))}

      <Reflect
        stage="prototype"
        data={data}
        prompt="What did people do with your prototype that you didn’t expect?"
        onSaved={() => void refresh()}
      />
    </div>
  );
}

type BV = {
  title: string;
  kind: Kind | "";
  learningGoal: string;
  description: string;
  cost: string;
  photo: { dataUrl: string; mime: string } | null;
};

function BuildForm({ onDone, onCancel, maxPhotoBytes }: { onDone: () => void; onCancel?: () => void; maxPhotoBytes: number }) {
  const [photoError, setPhotoError] = useState<string | null>(null);
  const steps: Step<BV>[] = [
    {
      id: "goal",
      question: "Which assumption will this test?",
      hint: "And what result would change your mind? A prototype is a question you can hold.",
      render: (v, set) => (
        <BigText label="What it tests" value={v.learningGoal} onChange={(learningGoal) => set({ learningGoal })} rows={3} placeholder="Whether Casford residents will pay GH₵10 upfront. If fewer than 3 of 10 do, we rethink." />
      ),
      valid: (v) => v.learningGoal.trim().length >= 10 || "Say what it should teach you.",
      summary: (v) => v.learningGoal,
    },
    {
      id: "kind",
      question: "What will you make?",
      hint: "Pick the cheapest thing that answers the question.",
      render: (v, set, next) => <Pick value={v.kind} onChange={(kind) => set({ kind })} onPicked={next} options={PROTOTYPE_KINDS} />,
      valid: (v) => Boolean(v.kind) || "Pick one.",
      summary: (v) => PROTOTYPE_KINDS.find((k) => k.value === v.kind)?.label ?? "",
    },
    {
      id: "name",
      question: "Give it a name",
      render: (v, set) => (
        <>
          <BigInput label="Name" value={v.title} onChange={(title) => set({ title })} placeholder="Paper booking card" />
          <p className="mt-4 text-sm font-semibold text-ink-soft">Describe it in a line (optional)</p>
          <BigInput label="Description" value={v.description} onChange={(description) => set({ description })} />
        </>
      ),
      valid: (v) => v.title.trim().length >= 3 || "Name it.",
      summary: (v) => [v.title, v.description].filter(Boolean).join(" — "),
    },
    {
      id: "cost",
      question: "What did it cost to make?",
      hint: "In cedis. Zero is a great answer.",
      render: (v, set) => (
        <>
          <BigInput label="Cost in cedis" value={v.cost} onChange={(cost) => set({ cost })} inputMode="decimal" placeholder="0" />
          <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-[18px] border-2 border-dashed border-line-strong px-4 py-3 text-sm font-semibold">
            <Camera className="size-5" aria-hidden /> {v.photo ? "Change photo" : "Add a photo of it"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) compressPhoto(file, maxPhotoBytes).then((photo) => set({ photo }), (err: Error) => setPhotoError(err.message));
              }}
            />
          </label>
          {photoError ? <p className="mt-1 text-sm text-clay">{photoError}</p> : null}
          {v.photo ? <img src={v.photo.dataUrl} alt="Prototype" className="mt-2 max-h-40 rounded-[14px] border-2 border-ink" /> : null}
        </>
      ),
      summary: (v) => `GH₵ ${Number(v.cost) || 0}${v.photo ? " · photo" : ""}`,
    },
  ];
  return (
    <StepFlow<BV>
      steps={steps}
      initial={{ title: "", kind: "", learningGoal: "", description: "", cost: "", photo: null }}
      finishLabel="Save prototype"
      reviewTitle="Ready to put it in front of people?"
      onCancel={onCancel}
      onFinish={async (v) => {
        await createPrototype({
          data: {
            title: v.title,
            kind: v.kind || "other",
            description: v.description,
            learningGoal: v.learningGoal,
            costGhs: Number(v.cost) || 0,
            photoData: v.photo?.dataUrl ?? null,
            photoMime: v.photo?.mime ?? null,
          },
        });
        onDone();
      }}
    />
  );
}

function PrototypeCard({
  p,
  tests,
  data,
  onSaved,
}: {
  p: Prototype;
  tests: PrototypeTest[];
  data: WorkspaceSnapshot;
  onSaved: () => void;
}) {
  const [testing, setTesting] = useState(false);
  const ok = tests.filter((t) => t.outcome === "succeeded").length;
  return (
    <section className="overflow-hidden rounded-[22px] ring-1 ring-line bg-bg-elevated">
      <div className="flex flex-wrap items-start gap-3 border-b border-line bg-gold-soft/60 p-4">
        {p.hasPhoto ? (
          <EvidencePhoto id={p.id} kind="prototype" className="size-20 rounded-[14px] border-2 border-ink object-cover" alt={p.title} />
        ) : (
          <span className="flex size-20 items-center justify-center rounded-[14px] border-2 border-dashed border-ink/40">
            <FlaskConical className="size-7 text-muted" aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10.5px] tracking-wide text-muted uppercase">
            {PROTOTYPE_KINDS.find((k) => k.value === p.kind)?.label} · {formatCedis(p.costGhs)} · {p.authorName}
          </p>
          <h2 className="font-display text-xl leading-tight font-extrabold">{p.title}</h2>
          <p className="mt-1 text-sm leading-6"><span className="font-semibold">Testing:</span> {p.learningGoal}</p>
          {p.description ? <p className="mt-1 text-sm text-muted">{p.description}</p> : null}
        </div>
      </div>
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <p className="font-display text-sm font-bold">
            {tests.length} test{tests.length === 1 ? "" : "s"} · {ok} did it easily
          </p>
          <Button size="sm" variant={testing ? "ghost" : "gold"} onClick={() => setTesting((v) => !v)}>
            {testing ? "Close" : "+ Log a test"}
          </Button>
        </div>
        {testing ? (
          <TestForm
            prototypeId={p.id}
            data={data}
            onCancel={() => setTesting(false)}
            onSaved={() => {
              setTesting(false);
              onSaved();
            }}
          />
        ) : null}
        {tests.length ? (
          <ul className="divide-y divide-line">
            {tests.map((t) => (
              <li key={t.id} className="py-2.5 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{t.testerProfile}</p>
                  <Stamp tone={OUTCOME_TONE[t.outcome]} size="xs">
                    {t.outcome}
                  </Stamp>
                </div>
                {t.task ? <p className="text-xs text-muted">Task: {t.task}</p> : null}
                <p className="mt-1 leading-6 text-ink-soft">{t.observed}</p>
                {t.quote ? <p className="mt-1 font-display font-semibold">“{t.quote}”</p> : null}
                <p className="mt-1 text-[11px] text-faint">
                  {t.authorName}
                  {t.syncState === "pending" ? " · saved on phone" : ""}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyNote>No tests yet. Put it in front of five real people.</EmptyNote>
        )}
      </div>
    </section>
  );
}

type TV = {
  testerProfile: string;
  task: string;
  observed: string;
  quote: string;
  outcome: (typeof OUTCOMES)[number]["value"] | "";
  wouldPay: WouldPay | "";
  assumptionId: string;
  relationship: "supports" | "challenges";
};

function TestForm({ prototypeId, data, onSaved, onCancel }: { prototypeId: string; data: WorkspaceSnapshot; onSaved: (queued: boolean) => void; onCancel: () => void }) {
  const steps: Step<TV>[] = [
    {
      id: "who",
      question: "Who tried it?",
      hint: "Describe them, don’t name them.",
      render: (v, set) => (
        <>
          <BigInput label="Tester" value={v.testerProfile} onChange={(testerProfile) => set({ testerProfile })} placeholder="Final-year student, Valco Hall" />
          <p className="mt-4 text-sm font-semibold text-ink-soft">What did you ask them to do? (optional)</p>
          <BigInput label="Task" value={v.task} onChange={(task) => set({ task })} placeholder="Book tomorrow’s 6am slot" />
        </>
      ),
      valid: (v) => v.testerProfile.trim().length >= 5 || "Describe who tried it.",
      summary: (v) => [v.testerProfile, v.task].filter(Boolean).join(" · "),
    },
    {
      id: "outcome",
      question: "How did it go?",
      render: (v, set, next) => <Pick value={v.outcome} onChange={(outcome) => set({ outcome })} onPicked={next} options={OUTCOMES} />,
      valid: (v) => Boolean(v.outcome) || "Pick one.",
      summary: (v) => OUTCOMES.find((o) => o.value === v.outcome)?.label ?? "",
    },
    {
      id: "saw",
      question: "What did you see them do?",
      hint: "Hesitations, questions, the moment they got stuck. Actions beat opinions.",
      render: (v, set) => (
        <>
          <BigText label="What happened" value={v.observed} onChange={(observed) => set({ observed })} rows={4} />
          <p className="mt-4 text-sm font-semibold text-ink-soft">Anything they said, word for word (optional)</p>
          <BigInput label="Quote" value={v.quote} onChange={(quote) => set({ quote })} />
        </>
      ),
      valid: (v) => v.observed.trim().length >= 15 || "Write what you saw happen.",
      summary: (v) => [v.observed, v.quote && `“${v.quote}”`].filter(Boolean).join("\n"),
    },
    {
      id: "pay",
      question: "Did they show they would pay?",
      render: (v, set, next) => (
        <Pick
          value={v.wouldPay}
          onChange={(wouldPay) => set({ wouldPay })}
          onPicked={next}
          options={[
            { value: "yes", label: "Yes — they acted on it", hint: "paid, booked, asked when" },
            { value: "maybe", label: "Maybe" },
            { value: "no", label: "No" },
            { value: "not_asked", label: "Didn’t ask" },
          ]}
        />
      ),
      valid: (v) => Boolean(v.wouldPay) || "Pick one.",
      summary: (v) => v.wouldPay,
    },
  ];
  if (data.assumptions.length) {
    steps.push({
      id: "assumption",
      question: "Did it test an assumption?",
      optional: true,
      render: (v, set) => (
        <div className="space-y-2">
          <Pick value={v.assumptionId} onChange={(assumptionId) => set({ assumptionId })} options={data.assumptions.map((a) => ({ value: a.id, label: a.statement }))} />
          {v.assumptionId ? (
            <div className="flex gap-2 pt-2">
              {(["supports", "challenges"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={v.relationship === r}
                  onClick={() => set({ relationship: r })}
                  className={`flex-1 rounded-[18px] border-2 py-3 font-semibold ${v.relationship === r ? (r === "supports" ? "border-ink bg-accent text-accent-fg" : "border-ink bg-clay text-accent-fg") : "border-line-strong"}`}
                >
                  It {r}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ),
      summary: (v) => data.assumptions.find((a) => a.id === v.assumptionId)?.statement ?? "",
    });
  }
  return (
    <StepFlow<TV>
      steps={steps}
      initial={{ testerProfile: "", task: "", observed: "", quote: "", outcome: "", wouldPay: "", assumptionId: "", relationship: "supports" }}
      finishLabel="Save test"
      reviewTitle="Log this test?"
      onCancel={onCancel}
      onFinish={async (v) => {
        const r = await saveOffline("logPrototypeTest", {
          prototypeId,
          testerProfile: v.testerProfile,
          task: v.task,
          observed: v.observed,
          quote: v.quote,
          outcome: v.outcome || "struggled",
          wouldPay: v.wouldPay || "not_asked",
          assumptionId: v.assumptionId || null,
          relationship: v.relationship,
        });
        onSaved(r.queued);
      }}
    />
  );
}
