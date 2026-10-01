import { useState, type FormEvent } from "react";
import { Camera, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Choice, Field, Input, Textarea } from "@/components/ui/input";
import { FormMessages } from "@/components/ui/feedback";
import { Why } from "@/components/ui/why";
import { CLASSIFICATIONS, SOURCE_TYPES, ASSUMPTION_LANGUAGE } from "@/lib/domain/config";
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
  const [sourceType, setSourceType] = useState("observation");
  const [classification, setClassification] = useState("unknown");
  const [locationContext, setLocationContext] = useState("");
  const [observedAt, setObservedAt] = useState("");
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
          ? "Saved on this phone. It will send when you are back online."
          : "Logged. You stay responsible for how it is classified.",
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
      <Field label="Give it a short name">
        <Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Tuesday shuttle count" />
      </Field>
      <Field label="What did you see, hear or count?">
        <Textarea required value={content} onChange={(e) => setContent(e.target.value)} />
      </Field>
      <Choice
        label="Where did it come from?"
        value={sourceType}
        options={SOURCE_TYPES}
        onChange={setSourceType}
      />
      <div>
        <Choice
          label="What kind of thing is it?"
          value={classification}
          options={CLASSIFICATIONS}
          onChange={setClassification}
        />
        <Why text={WHY.classification} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="When" optional>
          <Input type="date" value={observedAt} onChange={(e) => setObservedAt(e.target.value)} />
        </Field>
        <Field label="Where" optional>
          <Input
            value={locationContext}
            onChange={(e) => setLocationContext(e.target.value)}
            placeholder="e.g. Science shuttle stop"
          />
        </Field>
      </div>
      {photo ? (
        <div className="relative w-fit">
          <img src={photo.dataUrl} alt="Your evidence photo" className="max-h-44 rounded-[14px] border border-line" />
          <button
            type="button"
            onClick={() => setPhoto(null)}
            aria-label="Remove photo"
            className="absolute -top-2 -right-2 flex size-8 items-center justify-center rounded-full bg-ink text-white"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ) : (
        <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-[14px] border border-dashed border-line-strong bg-bg-elevated px-4 py-3 text-sm font-semibold text-ink-soft focus-within:ring-2 focus-within:ring-accent/40">
          <Camera className="size-5 text-accent" aria-hidden />
          <span>
            Add a photo <span className="font-normal text-faint">· optional, shrunk on this phone</span>
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </label>
      )}
      {looksAssumed ? (
        <p className="rounded-[14px] bg-gold-soft px-3 py-2 text-sm leading-6 text-gold-deep">
          This reads like an assumption dressed as evidence. Consider classifying it as assumption, then ask what would test it.
        </p>
      ) : null}
      <FormMessages error={error} notice={notice} />
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Log evidence"}
      </Button>
    </form>
  );
}
