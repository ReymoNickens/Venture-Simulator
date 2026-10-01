import type { LecturerClass } from "@/lib/lecturers/data";
import { cn } from "@/lib/utils";

/** Filter by class; hidden when the lecturer teaches only one. */
export function ClassChips({
  classes,
  value,
  onChange,
}: {
  classes: LecturerClass[];
  value: string | null;
  onChange: (offeringId: string | null) => void;
}) {
  if (classes.length < 2) return null;
  const chip = (active: boolean) =>
    cn(
      "min-h-10 shrink-0 rounded-full border px-4 text-sm font-semibold whitespace-nowrap",
      active ? "border-ink bg-ink text-white" : "border-line-strong bg-bg-elevated text-ink-soft",
    );
  return (
    <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1" role="group" aria-label="Choose a class">
      <button type="button" aria-pressed={value === null} className={chip(value === null)} onClick={() => onChange(null)}>
        All classes
      </button>
      {classes.map((c) => (
        <button
          key={c.offeringId}
          type="button"
          aria-pressed={value === c.offeringId}
          className={chip(value === c.offeringId)}
          onClick={() => onChange(c.offeringId)}
        >
          {[c.programme ?? c.courseCode, c.level].filter(Boolean).join(" · ")}
        </button>
      ))}
    </div>
  );
}
