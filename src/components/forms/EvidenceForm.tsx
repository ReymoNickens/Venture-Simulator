import { useState } from "react";
import { StepScreen, ChoiceCard } from "@/components/flow/StepScreen";
import { Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ASSUMPTION_LANGUAGE } from "@/lib/domain/config";
import { compressPhoto } from "@/lib/offline/photos";
import { saveEvidence } from "@/lib/offline/actions";
import { loadStepDraft, saveStepDraft, clearStepDraft } from "@/lib/offline/step-draft";

type Draft = {
  content: string;
  sourceType: string;
  classification: string;
  photoData: string | null;
  photoMime: string | null;
};

const emptyDraft: Draft = {
  content: "",
  sourceType: "",
  classification: "",
  photoData: null,
  photoMime: null,
};

// §13 — "How did you find it?" Every icon card carries a real text label
// (never icon-only), mapped onto the existing sourceType values.
const HOW_FOUND: { icon: string; label: string; value: string }[] = [
  { icon: "📷", label: "I saw it", value: "observation" },
  { icon: "💬", label: "Someone told me", value: "quotation" },
  { icon: "👥", label: "I asked people", value: "interview" },
  { icon: "📊", label: "I counted it", value: "survey" },
  { icon: "📄", label: "I found a document", value: "other" },
];

// §13 — "What kind of information is this?" All six existing classification
// values, in plain language.
const WHAT_KIND: { label: string; hint: string; value: string }[] = [
  { label: "I saw it myself", hint: "Directly observed or independently verifiable.", value: "fact" },
  { label: "It supports or challenges something", hint: "A record that backs up or undercuts a claim.", value: "evidence" },
  { label: "We think it, not proven yet", hint: "Treated as true without proof so far.", value: "assumption" },
  { label: "We worked it out from something else", hint: "A conclusion drawn from other information.", value: "inference" },
  { label: "It's a judgement, not a finding", hint: "An opinion or preference.", value: "opinion" },
  { label: "We don't know yet", hint: "That's allowed.", value: "unknown" },
];

const STEPS = ["content", "how", "photo", "kind"] as const;
type Step = (typeof STEPS)[number];

export function EvidenceForm({
  onSaved,
  maxPhotoBytes,
}: {
  onSaved: () => void;
  maxPhotoBytes: number;
}) {
  const draftKey = "evidence";
  const [draft, setDraft] = useState<Draft>(() => loadStepDraft<Draft>(draftKey) ?? emptyDraft);
  const [stepIndex, setStepIndex] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ pending: boolean } | null>(null);

  const step: Step = STEPS[stepIndex];
  const looksAssumed = ASSUMPTION_LANGUAGE.test(draft.content);

  function persist(next: Draft) {
    saveStepDraft(draftKey, next);
    setDraft(next);
  }

  function goNext() {
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }
  function goBack() {
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const photo = await compressPhoto(file, maxPhotoBytes);
      persist({ ...draft, photoData: photo.dataUrl, photoMime: photo.mime });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not use that photo.");
    }
  }

  async function finish(classification: string) {
    setError(null);
    setPending(true);
    try {
      const title = draft.content.trim().slice(0, 60) || "Untitled finding";
      const result = await saveEvidence({
        title,
        content: draft.content,
        sourceType: draft.sourceType || "other",
        classification,
        photoData: draft.photoData,
        photoMime: draft.photoMime,
      });
      clearStepDraft(draftKey);
      const wasQueued = "queued" in result && Boolean(result.queued);
      setSaved({ pending: wasQueued });
      setDraft(emptyDraft);
      setStepIndex(0);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save evidence.");
    } finally {
      setPending(false);
    }
  }

  if (saved) {
    return (
      <div className="space-y-3">
        <div role="status" className="flex items-center gap-2">
          <Badge tone="accent">{saved.pending ? "Saved on this device" : "Saved"}</Badge>
          <span className="text-sm text-muted">
            {saved.pending ? "We'll send it when you're back online." : "It's in your evidence list below."}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setSaved(null)}
          className="text-sm text-accent"
        >
          Add another finding
        </button>
      </div>
    );
  }

  if (step === "content") {
    return (
      <StepScreen
        step={1}
        total={4}
        heading="What did you find?"
        onContinue={goNext}
        continueDisabled={!draft.content.trim()}
      >
        <Textarea
          autoFocus
          value={draft.content}
          onChange={(e) => persist({ ...draft, content: e.target.value })}
          placeholder="14 students bought water before their morning class."
        />
        {looksAssumed ? (
          <p className="rounded-[12px] bg-warn-soft px-3 py-2 text-sm text-warn">
            This reads like an assumption dressed as evidence. The next step lets you say so honestly.
          </p>
        ) : null}
      </StepScreen>
    );
  }

  if (step === "how") {
    return (
      <StepScreen
        step={2}
        total={4}
        heading="How did you find it?"
        onBack={goBack}
        onContinue={goNext}
        continueDisabled={!draft.sourceType}
      >
        <div className="space-y-2">
          {HOW_FOUND.map((o) => (
            <ChoiceCard
              key={o.value}
              icon={o.icon}
              label={o.label}
              selected={draft.sourceType === o.value}
              onClick={() => persist({ ...draft, sourceType: o.value })}
            />
          ))}
        </div>
      </StepScreen>
    );
  }

  if (step === "photo") {
    return (
      <StepScreen
        step={3}
        total={4}
        heading="Add a photo?"
        prompt="Optional. Compressed on this device before it's saved."
        onBack={goBack}
        onContinue={goNext}
        continueLabel={draft.photoData ? "Continue" : "Skip"}
      >
        <Input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          capture="environment"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        {draft.photoData ? (
          <img
            src={draft.photoData}
            alt="Evidence"
            className="mt-2 max-h-40 rounded-[12px] border border-line"
          />
        ) : null}
        {error ? <p className="text-sm text-bad">{error}</p> : null}
      </StepScreen>
    );
  }

  // step === "kind"
  return (
    <StepScreen
      step={4}
      total={4}
      heading="What kind of information is this?"
      onBack={goBack}
      onContinue={() => void finish(draft.classification)}
      continueDisabled={!draft.classification}
      continueLabel="Save"
      pending={pending}
    >
      <div className="space-y-2">
        {WHAT_KIND.map((o) => (
          <ChoiceCard
            key={o.value}
            label={o.label}
            hint={o.hint}
            selected={draft.classification === o.value}
            onClick={() => persist({ ...draft, classification: o.value })}
          />
        ))}
      </div>
      {error ? <p className="text-sm text-bad">{error}</p> : null}
    </StepScreen>
  );
}
