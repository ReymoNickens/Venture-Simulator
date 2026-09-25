import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Camera, Eye, Mic, MessageSquareQuote, ClipboardList, Image, MoreHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { ChoiceGrid } from "@/components/ui/choice";
import { Why } from "@/components/ui/why";
import { CLASSIFICATIONS, SOURCE_TYPES, ASSUMPTION_LANGUAGE } from "@/lib/domain/config";
import { WHY } from "@/lib/domain/copy";
import { compressPhoto } from "@/lib/offline/photos";
import { saveEvidence } from "@/lib/offline/actions";

const SOURCE_ICON: Record<string, ReactNode> = {
  interview: <Mic className="size-4" />,
  survey: <ClipboardList className="size-4" />,
  observation: <Eye className="size-4" />,
  quotation: <MessageSquareQuote className="size-4" />,
  photo: <Image className="size-4" />,
  other: <MoreHorizontal className="size-4" />,
};

type Source = (typeof SOURCE_TYPES)[number]["value"];
type Klass = (typeof CLASSIFICATIONS)[number]["value"];

export function EvidenceForm({ onSaved, maxPhotoBytes }: { onSaved: (queued: boolean) => void; maxPhotoBytes: number }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sourceType, setSourceType] = useState<Source>("observation");
  const [classification, setClassification] = useState<Klass | "">("");
  const [locationContext, setLocationContext] = useState("");
  const [observedAt, setObservedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [photo, setPhoto] = useState<{ dataUrl: string; thumb: string; mime: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setError(null);
    try {
      setPhoto(await compressPhoto(f, maxPhotoBytes));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not use that photo.");
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await saveEvidence({
        title: title.trim(),
        content: content.trim(),
        sourceType,
        classification: classification || "unknown",
        photoData: photo?.dataUrl ?? null,
        photoThumb: photo?.thumb ?? null,
        photoMime: photo?.mime ?? null,
        observedAt: observedAt || null,
        locationContext: locationContext.trim() || null,
      });
      onSaved("queued" in result && Boolean(result.queued));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save evidence.");
    } finally {
      setPending(false);
    }
  }

  const looksAssumed = ASSUMPTION_LANGUAGE.test(content);

  return (
    <form className="space-y-5" onSubmit={(e) => void submit(e)}>
      <div className="space-y-2">
        <p className="text-sm font-semibold text-ink-soft">How did you get it?</p>
        <ChoiceGrid label="Source" columns={3} value={sourceType} onChange={setSourceType} options={SOURCE_TYPES.map((s) => ({ ...s, icon: SOURCE_ICON[s.value] }))} />
      </div>

      <Field label="A short label">
        <Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Saturday queue count, Hall B" maxLength={160} />
      </Field>
      <Field label="What exactly did you see, hear or count?" hint="Write it as you'd tell a sceptical lecturer: who, how many, when.">
        <Textarea required value={content} onChange={(e) => setContent(e.target.value)} maxLength={4000} placeholder="e.g. 8:00–8:30am: 14 students waiting for 2 lines. 3 gave up and left. Ama (L200) said she washes at 11pm to avoid it." />
      </Field>
      {looksAssumed ? (
        <p className="rounded-[12px] bg-warn-soft px-3 py-2 text-sm leading-5 text-warn">
          This reads like a belief (“everyone”, “will pay”…) rather than something observed. Consider classifying it as an assumption.
        </p>
      ) : null}

      <div className="space-y-2">
        <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} aria-label="Photo" />
        {photo ? (
          <div className="relative inline-block">
            <img src={photo.thumb} alt="Selected evidence" className="h-28 rounded-[14px] border border-line object-cover" />
            <button type="button" onClick={() => setPhoto(null)} className="absolute -right-2 -top-2 grid size-7 place-items-center rounded-full bg-night text-white" aria-label="Remove photo">
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          <Button type="button" variant="secondary" onClick={() => file.current?.click()}>
            <Camera className="size-4" /> Add a photo
          </Button>
        )}
        <p className="text-xs text-muted">Shrunk on your phone before upload, to save data.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="When">
          <Input type="date" value={observedAt} onChange={(e) => setObservedAt(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
        </Field>
        <Field label="Where (optional)">
          <Input value={locationContext} onChange={(e) => setLocationContext(e.target.value)} placeholder="e.g. Hall B, 3rd floor" maxLength={200} />
        </Field>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-ink-soft">Is it a fact, or something else? <span className="font-normal text-muted">(you decide)</span></p>
        <ChoiceGrid label="Classification" value={classification} onChange={setClassification} options={CLASSIFICATIONS} />
        <Why text={WHY.classification} />
      </div>

      {error ? <p role="alert" className="rounded-[12px] bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p> : null}
      <Button type="submit" block size="lg" disabled={pending || !title.trim() || !content.trim()}>
        {pending ? "Saving…" : "Log evidence"}
      </Button>
    </form>
  );
}
