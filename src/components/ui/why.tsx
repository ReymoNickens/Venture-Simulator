import { useState } from "react";
import { cn } from "@/lib/utils";

export function Why({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-medium text-accent underline-offset-2 hover:underline"
      >
        {open ? "Hide why this matters" : "Why are we asking this?"}
      </button>
      {open ? (
        <p
          className={cn(
            "mt-1.5 rounded-[12px] bg-accent-soft px-3 py-2 text-xs leading-5 text-ink-soft",
          )}
        >
          {text}
        </p>
      ) : null}
    </div>
  );
}
