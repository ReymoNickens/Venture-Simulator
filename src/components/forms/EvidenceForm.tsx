import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
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
          ? "Saved locally — will sync when connected."
          : "Evidence logged. You remain responsible for the classification.",
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
      <Field label="Title">
        <Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short label" />
      </Field>
      <Field label="What did you collect?">
        <Textarea required value={content} onChange={(e) => setContent(e.target.value)} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Source">
          <select
            className="h-11 w-full rounded-[10px] border border-line bg-bg-elevated px-3 text-sm"
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value)}
          >
            {SOURCE_TYPES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Your classification">
          <select
            className="h-11 w-full rounded-[10px] border border-line bg-bg-elevated px-3 text-sm"
            value={classification}
            onChange={(e) => setClassification(e.target.value)}
          >
            {CLASSIFICATIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <Why text={WHY.classification} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="When (optional)">
          <Input
            type="text"
            inputMode="numeric"
            placeholder="YYYY-MM-DD"
            value={observedAt}
            onChange={(e) => setObservedAt(e.target.value)}
          />
        </Field>
        <Field label="Where (optional)">
          <Input value={locationContext} onChange={(e) => setLocationContext(e.target.value)} />
        </Field>
      </div>
      <Field label="Photo (optional, compressed on this device)">
        <Input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          capture="environment"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        {photo ? (
          <img src={photo.dataUrl} alt="Evidence" className="mt-2 max-h-40 rounded-[12px] border border-line" />
        ) : null}
      </Field>
      {looksAssumed ? (
        <p className="rounded-[12px] bg-warn-soft px-3 py-2 text-sm text-warn">
          This reads like an assumption dressed as evidence. Consider classifying it as assumption, then ask what would test it.
        </p>
      ) : null}
      {error ? <p className="text-sm text-bad">{error}</p> : null}
      {notice ? <p className="text-sm text-accent">{notice}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Log evidence"}
      </Button>
    </form>
  );
}
