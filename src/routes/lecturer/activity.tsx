import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useLecturer } from "@/hooks/lecturer-context";
import { getLecturerActivity } from "@/lib/server/lecturers";
import type { ActivityItem } from "@/lib/lecturers/data";
import { EmptyNote } from "@/components/ui/badge";
import { FormMessages, Loading } from "@/components/ui/feedback";
import { ClassChips } from "@/components/lecturer/ClassChips";
import { eventWords, timeAgo } from "@/components/lecturer/words";

export const Route = createFileRoute("/lecturer/activity")({ component: ActivityPage });

function ActivityPage() {
  const { home } = useLecturer();
  const [offering, setOffering] = useState<string | null>(null);
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setItems(null);
    getLecturerActivity({ data: { offeringId: offering ?? undefined } })
      .then((r) => live && setItems(r))
      .catch((err: unknown) => live && setError(err instanceof Error ? err.message : "Could not load activity."));
    return () => {
      live = false;
    };
  }, [offering]);

  // Group consecutive items by day so a long feed stays scannable.
  const days = new Map<string, ActivityItem[]>();
  for (const it of items ?? []) {
    const d = new Date(it.at).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
    days.set(d, [...(days.get(d) ?? []), it]);
  }

  return (
    <div className="flow-enter space-y-5 pt-2">
      <div>
        <p className="text-xs font-semibold text-muted">Newest first</p>
        <h1 className="font-display text-[32px] leading-none font-extrabold">What students are doing</h1>
      </div>
      <ClassChips classes={home.classes} value={offering} onChange={setOffering} />
      <FormMessages error={error} />
      {!items ? (
        <Loading />
      ) : !items.length ? (
        <EmptyNote>Nothing yet. Activity appears here as students work.</EmptyNote>
      ) : (
        [...days.entries()].map(([day, list]) => (
          <section key={day} className="space-y-2">
            <h2 className="text-sm font-semibold text-muted">{day}</h2>
            <ul className="divide-y divide-line rounded-[14px] border border-line bg-bg-elevated">
              {list.map((it) => (
                <li key={it.id} className="flex items-start gap-3 px-4 py-3 text-sm leading-6">
                  <span className="min-w-0 flex-1">
                    <strong>{it.studentName ?? "Someone"}</strong> {eventWords(it.eventType)}
                    {it.groupId ? (
                      <>
                        {" · "}
                        <Link
                          to="/lecturer/groups/$groupId"
                          params={{ groupId: it.groupId }}
                          className="font-semibold text-accent underline-offset-2 hover:underline"
                        >
                          {it.groupName}
                        </Link>
                      </>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-xs text-faint">{timeAgo(it.at)}</span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
