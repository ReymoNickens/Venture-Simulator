import { useMemo, useState } from "react";
import { Link2, Search } from "lucide-react";
import type { EvidenceItem } from "@/lib/domain/types";
import { ClassificationStamp } from "@/components/ui/stamp";
import { cn } from "@/lib/utils";

/**
 * Choose evidence from the group's notebook to back a claim. Searchable,
 * because by pitch day a group can have a hundred items.
 */
export function EvidencePicker({
  evidence,
  value,
  onChange,
  label = "Backed by which evidence?",
  single = false,
}: {
  evidence: EvidenceItem[];
  value: string[];
  onChange: (ids: string[]) => void;
  label?: string;
  single?: boolean;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? evidence.filter((e) => `${e.title} ${e.content}`.toLowerCase().includes(needle))
      : evidence;
    return list.slice(0, 40);
  }, [q, evidence]);
  const chosen = evidence.filter((e) => value.includes(e.id));

  function toggle(id: string) {
    if (single) onChange(value.includes(id) ? [] : [id]);
    else onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-semibold text-ink-soft">{label}</p>
      {chosen.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {chosen.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => toggle(e.id)}
                className="inline-flex max-w-full items-center gap-1 rounded-[6px] border-2 border-accent bg-accent-soft px-2 py-1 text-xs text-accent"
                title="Remove"
              >
                <Link2 className="size-3 shrink-0" aria-hidden />
                <span className="truncate">{e.title}</span> ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted">Nothing linked yet — this is still a guess.</p>
      )}
      {evidence.length ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-xs font-semibold text-accent underline underline-offset-2"
        >
          {open ? "Done choosing" : chosen.length ? "Change evidence" : "Link evidence"}
        </button>
      ) : (
        <p className="text-xs text-muted">Your notebook is empty. Log evidence first.</p>
      )}
      {open ? (
        <div className="rounded-[8px] border-2 border-line-strong/70 bg-bg-elevated">
          <label className="flex items-center gap-2 border-b border-line px-2.5">
            <Search className="size-4 text-faint" aria-hidden />
            <span className="sr-only">Search evidence</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search your notebook"
              className="h-10 w-full bg-transparent text-sm focus:outline-none"
            />
          </label>
          <ul className="max-h-64 overflow-y-auto">
            {filtered.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => toggle(e.id)}
                  aria-pressed={value.includes(e.id)}
                  className={cn(
                    "flex w-full items-start gap-2 border-b border-line/60 px-2.5 py-2 text-left text-sm last:border-0",
                    value.includes(e.id) ? "bg-accent-soft" : "hover:bg-bg-subtle",
                  )}
                >
                  <span
                    className={cn(
                      "mt-1 size-3.5 shrink-0 rounded-[3px] border-2",
                      value.includes(e.id) ? "border-accent bg-accent" : "border-line-strong",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{e.title}</span>
                    <span className="line-clamp-1 text-xs text-muted">{e.content}</span>
                  </span>
                  <ClassificationStamp value={e.classification} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
