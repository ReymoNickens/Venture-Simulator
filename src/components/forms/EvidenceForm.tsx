import { useState } from "react";
import { Camera } from "lucide-react";
import { CLASSIFICATIONS, SOURCE_TYPES, ASSUMPTION_LANGUAGE } from "@/lib/domain/config";
import { SUGGESTED_PLACES } from "@/lib/domain/places";
import type { EvidenceClassification, EvidenceSourceType } from "@/lib/domain/types";
import { compressPhoto } from "@/lib/offline/photos";
import { saveEvidence } from "@/lib/offline/actions";
import { BigInput, BigText, Pick, StepFlow, Suggest, type Step } from "@/components/flow/StepFlow";

type V = {
  content: string;
  title: string;
  sourceType: EvidenceSourceType;
  classification: EvidenceClassification | "";
  locationContext: string;
  observedAt: string;
  photo: { dataUrl: string; mime: string } | null;
};

function steps(maxPhotoBytes: number, setPhotoError: (e: string | null) => void, photoError: string | null): Step<V>[] {
  return [
    {
      id: "what",
      question: "What did you see, hear, count or collect?",
      hint: "Write what happened, not what you think it means.",
      render: (v, set) => (
        <>
          <BigText label="What you found" value={v.content} onChange={(content) => set({ content })} placeholder="34 people queued at the shuttle stop at 7:10. Two buses in 25 minutes." rows={5} />
          <p className="mt-4 text-sm font-semibold text-ink-soft">Give it a short title</p>
          <BigInput label="Title" value={v.title} onChange={(title) => set({ title })} placeholder="Shuttle queue, Tuesday 7am" />
        </>
      ),
      valid: (v) => (v.content.trim().length >= 10 && v.title.trim().length >= 3) || "Write what you found and give it a title.",
      summary: (v) => `${v.title} — ${v.content}`,
    },
    {
      id: "source",
      question: "Where did it come from?",
      render: (v, set, next) => (
        <Pick value={v.sourceType} onChange={(sourceType) => set({ sourceType })} onPicked={next} options={SOURCE_TYPES} />
      ),
      summary: (v) => SOURCE_TYPES.find((s) => s.value === v.sourceType)?.label ?? "",
    },
    {
      id: "kind",
      question: "Be honest: what kind of claim is it?",
      hint: "You decide the label. The advisor may challenge it; you stay responsible for it.",
      render: (v, set, next) => (
        <>
          {ASSUMPTION_LANGUAGE.test(v.content) ? (
            <p className="mb-3 rounded-[14px] border-2 border-gold/60 bg-gold-soft px-3 py-2 text-sm">
              Your note says things like “everyone” or “will buy”. That usually means assumption or opinion.
            </p>
          ) : null}
          <Pick value={v.classification} onChange={(classification) => set({ classification })} onPicked={next} options={CLASSIFICATIONS} />
        </>
      ),
      valid: (v) => Boolean(v.classification) || "Pick the closest one — Unknown is allowed.",
      summary: (v) => CLASSIFICATIONS.find((c) => c.value === v.classification)?.label ?? "",
    },
    {
      id: "where",
      question: "Where, and do you have a photo?",
      optional: true,
      render: (v, set) => (
        <div className="space-y-3">
          <BigInput label="Where" value={v.locationContext} onChange={(locationContext) => set({ locationContext })} placeholder="Science Market" />
          <Suggest items={SUGGESTED_PLACES} onPick={(locationContext) => set({ locationContext })} />
          <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-[18px] border-2 border-dashed border-line-strong px-4 py-3 text-sm font-semibold">
            <Camera className="size-5" aria-hidden /> {v.photo ? "Change photo" : "Take or add a photo"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setPhotoError(null);
                compressPhoto(file, maxPhotoBytes).then(
                  (photo) => set({ photo }),
                  (err: Error) => setPhotoError(err.message),
                );
              }}
            />
          </label>
          {photoError ? <p className="text-sm text-clay">{photoError}</p> : null}
          {v.photo ? <img src={v.photo.dataUrl} alt="Evidence preview" className="max-h-48 rounded-[14px] border-2 border-ink" /> : null}
          <p className="text-xs text-faint">Photos are shrunk on your phone first, to save data.</p>
        </div>
      ),
      summary: (v) => [v.locationContext, v.photo ? "photo attached" : ""].filter(Boolean).join(" · "),
    },
  ];
}

export function EvidenceForm({
  onSaved,
  maxPhotoBytes,
  onCancel,
}: {
  onSaved: (queued: boolean) => void;
  maxPhotoBytes: number;
  onCancel?: () => void;
}) {
  const [photoError, setPhotoError] = useState<string | null>(null);
  return (
    <StepFlow<V>
      steps={steps(maxPhotoBytes, setPhotoError, photoError)}
      initial={{
        content: "",
        title: "",
        sourceType: "observation",
        classification: "",
        locationContext: "",
        observedAt: new Date().toISOString().slice(0, 10),
        photo: null,
      }}
      finishLabel="Log it"
      reviewTitle="Into the notebook?"
      onCancel={onCancel}
      onFinish={async (v) => {
        const r = await saveEvidence({
          title: v.title,
          content: v.content,
          sourceType: v.sourceType,
          classification: v.classification || "unknown",
          photoData: v.photo?.dataUrl ?? null,
          photoMime: v.photo?.mime ?? null,
          observedAt: v.observedAt || null,
          locationContext: v.locationContext || null,
        });
        onSaved("queued" in r && Boolean(r.queued));
      }}
    />
  );
}
