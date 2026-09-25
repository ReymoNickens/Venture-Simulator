import { useState, type FormEvent } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Choice, Field, Input, Textarea } from "@/components/ui/input";
import { Why } from "@/components/ui/why";
import { FormMessages } from "@/components/ui/feedback";
import { CLASSIFICATIONS, SOURCE_TYPES, ASSUMPTION_LANGUAGE } from "@/lib/domain/config";
import type { EvidenceClassification, EvidenceSourceType } from "@/lib/domain/types";
import { WHY } from "@/lib/domain/copy";
import { compressPhoto } from "@/lib/offline/photos";
import { saveEvidence } from "@/lib/offline/actions";

export function EvidenceForm({
  onSaved,
  maxPhotoBytes,
}: {
  onSaved: () => void;
  maxPhotoBytes: number;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sourceType, setSourceType] = useState<EvidenceSourceType>("observation");
  const [classification, setClassification] = useState<EvidenceClassification>("unknown");
  const [locationContext, setLocationContext] = useState("");
  const [observedAt, setObservedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [photo, setPhoto] = useState<{ dataUrl: string; mime: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      setPhoto(await compressPhoto(file, maxPhotoBytes));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not use that photo.");
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const result = await saveEvidence({
        title,
        content,
        sourceType,
        classification,
        photoData: photo?.dataUrl ?? null,
        photoMime: photo?.mime ?? null,
        observedAt: observedAt || null,
        locationContext: locationContext || null,
      });
      setNotice(
        "queued" in result && result.queued
          ? "Saved on this phone — it will sync when you are connected."
          : "Logged. You remain responsible for the classification.",
      );
      setTitle("");
      setContent("");
      setPhoto(null);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save evidence.");
    } finally {
      setPending(false);
    }
  }

  const looksAssumed = ASSUMPTION_LANGUAGE.test(content);

  return (
    <form className="space-y-4" onSubmit={(e) => void submit(e)}>
      <Field label="Short title">
        <Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Queue at Hall B taps, 6:40am" />
      </Field>
      <Field label="What exactly did you see, hear, count or collect?">
        <Textarea
          required
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Numbers, quotes, prices. Write what happened, not what you think it means."
        />
      </Field>
      <Choice label="Where did it come from?" value={sourceType} options={SOURCE_TYPES} onChange={setSourceType} />
      <Choice
        label="What kind of claim is it?"
        value={classification}
        options={CLASSIFICATIONS}
        onChange={setClassification}
      />
      <Why text={WHY.classification} />
      {looksAssumed && classification !== "assumption" && classification !== "opinion" ? (
        <p className="rounded-[8px] border-2 border-gold/60 bg-gold-soft px-3 py-2 text-sm">
          This reads like an assumption dressed as evidence (“everyone”, “will buy”, “most students”).
          Is it really a <strong>{classification}</strong>?
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="When" optional>
          <Input type="date" value={observedAt} onChange={(e) => setObservedAt(e.target.value)} />
        </Field>
        <Field label="Where" optional>
          <Input value={locationContext} onChange={(e) => setLocationContext(e.target.value)} placeholder="Madina market, Hall B…" />
        </Field>
      </div>
      <div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-[8px] border-2 border-dashed border-line-strong px-3 py-2 text-sm font-medium text-ink-soft hover:border-ink">
          <Camera className="size-4" aria-hidden />
          {photo ? "Change photo" : "Add a photo"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="sr-only"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </label>
        <p className="mt-1 text-xs text-faint">Shrunk on your phone before upload to save data.</p>
        {photo ? <img src={photo.dataUrl} alt="Evidence preview" className="mt-2 max-h-40 rounded-[8px] border-2 border-ink" /> : null}
      </div>
      <FormMessages error={error} notice={notice} />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Log it in the notebook"}
      </Button>
    </form>
  );
}
