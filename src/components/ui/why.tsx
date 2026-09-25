import { useState } from "react";
import { Lightbulb } from "lucide-react";

export function Why({ text, label = "Why this matters" }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-xs font-semibold text-accent underline-offset-2 hover:underline"
      >
        <Lightbulb className="size-3.5" aria-hidden />
        {open ? "Hide" : label}
      </button>
      {open ? <p className="mt-1.5 animate-rise rounded-[12px] bg-accent-soft px-3 py-2 text-[13px] leading-5 text-ink-soft">{text}</p> : null}
    </div>
  );
}
