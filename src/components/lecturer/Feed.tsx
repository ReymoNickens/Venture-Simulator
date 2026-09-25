import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { getCohortFeed } from "@/lib/server/lecturer";
import { activitySentence, timeAgo } from "@/lib/domain/activity";
import { cn } from "@/lib/utils";

type Row = Awaited<ReturnType<typeof getCohortFeed>>[number];

/** What groups are doing right now, as sentences. */
export function Feed({ offeringId }: { offeringId: string }) {
  const [mine, setMine] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    setRows(null);
    getCohortFeed({ data: { offeringId, mineOnly: mine } }).then(setRows, () => setRows([]));
  }, [offeringId, mine]);
  return (
    <section className="rounded-[12px] border-2 border-ink bg-bg-elevated">
      <div className="flex items-center justify-between border-b-2 border-ink px-4 py-2.5">
        <p className="font-display text-base font-extrabold">What’s happening</p>
        <div className="flex gap-1 text-xs">
          {[false, true].map((v) => (
            <button
              key={String(v)}
              type="button"
              aria-pressed={mine === v}
              onClick={() => setMine(v)}
              className={cn("rounded-full px-2.5 py-1 font-semibold", mine === v ? "bg-ink text-bg-elevated" : "text-muted")}
            >
              {v ? "My groups" : "Everyone"}
            </button>
          ))}
        </div>
      </div>
      <ul className="max-h-[70dvh] divide-y divide-line overflow-y-auto">
        {rows === null ? (
          <li className="px-4 py-3 text-sm text-muted">Loading…</li>
        ) : rows.length ? (
          rows.map((r, i) => {
            const text = activitySentence(r.eventType, r.who?.split(" ")[0] ?? null);
            if (!text) return null;
            return (
              <li key={i}>
                <Link to="/lecturer/groups/$groupId" params={{ groupId: r.groupId }} className="block px-4 py-2.5 hover:bg-bg-subtle/60">
                  <p className="text-sm leading-5">{text}</p>
                  <p className="mt-0.5 flex justify-between gap-2 text-[11px] text-muted">
                    <span className="truncate">{r.groupLabel}</span>
                    <span className="shrink-0 font-mono">{timeAgo(r.createdAt)}</span>
                  </p>
                </Link>
              </li>
            );
          })
        ) : (
          <li className="px-4 py-3 text-sm text-muted">Nothing yet.</li>
        )}
      </ul>
    </section>
  );
}
