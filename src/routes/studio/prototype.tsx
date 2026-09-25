import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Camera, FlaskConical } from "lucide-react";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { useAction } from "@/hooks/use-action";
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
import { Choice, Field, Input, Select, Textarea } from "@/components/ui/input";
import { Card, Eyebrow, EmptyNote } from "@/components/ui/badge";
import { Stamp } from "@/components/ui/stamp";
import { FormMessages, Loading } from "@/components/ui/feedback";

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
        <BuildForm onDone={() => { setBuilding(false); void refresh(); }} maxPhotoBytes={data.offering?.maxPhotoBytes ?? DEFAULT_MAX_PHOTO_BYTES} />
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

function BuildForm({ onDone, maxPhotoBytes }: { onDone: () => void; maxPhotoBytes: number }) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<Kind>("paper");
  const [description, setDescription] = useState("");
  const [learningGoal, setLearningGoal] = useState("");
  const [cost, setCost] = useState(0);
  const [photo, setPhoto] = useState<{ dataUrl: string; mime: string } | null>(null);
  const { pending, error, run, setError } = useAction();
  return (
    <section className="rounded-[10px] border-2 border-ink bg-bg-elevated p-4">
      <h2 className="font-display text-xl font-bold">Record a prototype</h2>
      <div className="mt-3 space-y-4">
        <Field label="What is it called?">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Paper booking card for the water roster" />
        </Field>
        <Choice label="What kind?" value={kind} options={PROTOTYPE_KINDS} onChange={setKind} />
        <Field label="Which assumption is it meant to test — and what result would change your mind?">
          <Textarea value={learningGoal} onChange={(e) => setLearningGoal(e.target.value)} />
        </Field>
        <Field label="Describe it" optional>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="What did it cost to make? (GH₵)">
          <Input type="number" inputMode="decimal" min={0} value={cost || ""} onChange={(e) => setCost(Number(e.target.value) || 0)} />
        </Field>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-[8px] border-2 border-dashed border-line-strong px-3 py-2 text-sm font-medium">
          <Camera className="size-4" aria-hidden /> {photo ? "Change photo" : "Add a photo"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) compressPhoto(file, maxPhotoBytes).then(setPhoto).catch((err: Error) => setError(err.message));
            }}
          />
        </label>
        {photo ? <img src={photo.dataUrl} alt="Prototype" className="max-h-40 rounded-[8px] border-2 border-ink" /> : null}
        <FormMessages error={error} />
        <Button
          disabled={Boolean(pending) || !title.trim()}
          onClick={() =>
            void run("build", async () => {
              await createPrototype({
                data: {
                  title,
                  kind,
                  description,
                  learningGoal,
                  costGhs: cost,
                  photoData: photo?.dataUrl ?? null,
                  photoMime: photo?.mime ?? null,
                },
              });
              onDone();
            })
          }
        >
          {pending ? "Saving…" : "Save prototype"}
        </Button>
      </div>
    </section>
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
    <section className="overflow-hidden rounded-[12px] border-2 border-ink bg-bg-elevated">
      <div className="flex flex-wrap items-start gap-3 border-b-2 border-ink bg-gold-soft/60 p-4">
        {p.hasPhoto ? (
          <EvidencePhoto id={p.id} kind="prototype" className="size-20 rounded-[8px] border-2 border-ink object-cover" alt={p.title} />
        ) : (
          <span className="flex size-20 items-center justify-center rounded-[8px] border-2 border-dashed border-ink/40">
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
        {testing ? <TestForm prototypeId={p.id} data={data} onSaved={() => { setTesting(false); onSaved(); }} /> : null}
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

function TestForm({ prototypeId, data, onSaved }: { prototypeId: string; data: WorkspaceSnapshot; onSaved: () => void }) {
  const [tester, setTester] = useState("");
  const [task, setTask] = useState("");
  const [observed, setObserved] = useState("");
  const [quote, setQuote] = useState("");
  const [outcome, setOutcome] = useState<(typeof OUTCOMES)[number]["value"]>("struggled");
  const [wouldPay, setWouldPay] = useState<WouldPay>("not_asked");
  const [assumptionId, setAssumptionId] = useState("");
  const [relationship, setRelationship] = useState<"supports" | "challenges">("supports");
  const { pending, error, notice, run, setNotice } = useAction();
  return (
    <div className="notebook space-y-3 rounded-[8px] border-2 border-ink/70 py-3 pr-3 pl-10">
      <Field label="Who tested it?" hint="A description, not a name.">
        <Input value={tester} onChange={(e) => setTester(e.target.value)} placeholder="Final-year nursing student, Hall C" />
      </Field>
      <Field label="What did you ask them to do?" optional>
        <Input value={task} onChange={(e) => setTask(e.target.value)} placeholder="Book tomorrow’s 6am slot" />
      </Field>
      <Field label="What did you see happen?">
        <Textarea value={observed} onChange={(e) => setObserved(e.target.value)} />
      </Field>
      <Field label="Anything they said, word for word" optional>
        <Input value={quote} onChange={(e) => setQuote(e.target.value)} />
      </Field>
      <Choice label="Outcome" value={outcome} options={OUTCOMES} onChange={setOutcome} />
      <Choice
        label="Did they show they would pay?"
        value={wouldPay}
        options={[
          { value: "not_asked", label: "Didn’t ask" },
          { value: "yes", label: "Yes" },
          { value: "maybe", label: "Maybe" },
          { value: "no", label: "No" },
        ]}
        onChange={setWouldPay}
      />
      {data.assumptions.length ? (
        <>
          <Field label="Did it test an assumption?" optional>
            <Select value={assumptionId} onChange={(e) => setAssumptionId(e.target.value)}>
              <option value="">No / not sure</option>
              {data.assumptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.statement.slice(0, 90)}
                </option>
              ))}
            </Select>
          </Field>
          {assumptionId ? (
            <Choice
              label="It…"
              value={relationship}
              options={[
                { value: "supports", label: "supports it" },
                { value: "challenges", label: "challenges it" },
              ]}
              onChange={setRelationship}
            />
          ) : null}
        </>
      ) : null}
      <FormMessages error={error} notice={notice} />
      <Button
        size="sm"
        disabled={Boolean(pending)}
        onClick={() =>
          void run("test", async () => {
            const r = await saveOffline("logPrototypeTest", {
              prototypeId,
              testerProfile: tester,
              task,
              observed,
              quote,
              outcome,
              wouldPay,
              assumptionId: assumptionId || null,
              relationship,
            });
            // The list marks queued tests "saved on phone", so closing is safe either way.
            if (r.queued) setNotice("Saved on this phone — it will sync when you are connected.");
            onSaved();
          })
        }
      >
        {pending ? "Saving…" : "Save test"}
      </Button>
    </div>
  );
}
