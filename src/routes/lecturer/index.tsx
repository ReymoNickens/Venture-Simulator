import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, MessageSquareText, PartyPopper } from "lucide-react";
import { useLecturer } from "@/hooks/lecturer-context";
import { attentionFor, stageLabel, type GroupSignals } from "@/lib/lecturers/insights";
import { classLabel } from "@/lib/lecturers/data";
import { EmptyNote } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ClassChips } from "@/components/lecturer/ClassChips";

export const Route = createFileRoute("/lecturer/")({ component: NeedsYou });

function NeedsYou() {
  const { home } = useLecturer();
  const [offering, setOffering] = useState<string | null>(null);
  const now = useMemo(() => new Date(), []);
  const groups = home.groups.filter((g) => !offering || g.offeringId === offering);
  const flagged = groups
    .map((g) => ({ g, reasons: attentionFor(g, now) }))
    .filter((x) => x.reasons.length)
    .sort((a, b) => b.reasons[0].severity - a.reasons[0].severity || b.reasons.length - a.reasons.length);
  const fine = groups.filter((g) => !flagged.some((f) => f.g.groupId === g.groupId));
  const labelOf = (id: string) => {
    const c = home.classes.find((x) => x.offeringId === id);
    return c ? classLabel(c) : "";
  };

  if (!home.classes.length) {
    return (
      <div className="pt-6">
        <h1 className="font-display text-[32px] font-extrabold">No classes yet</h1>
        <EmptyNote>The platform owner has not assigned you any classes yet. Ask them to add your classes.</EmptyNote>
      </div>
    );
  }

  return (
    <div className="flow-enter space-y-5 pt-2">
      <div>
        <p className="text-xs font-semibold text-muted">
          {home.classes.length} {home.classes.length === 1 ? "class" : "classes"} · {home.groups.length} groups
        </p>
        <h1 className="font-display text-[32px] leading-none font-extrabold">
          {flagged.length ? `${flagged.length} ${flagged.length === 1 ? "group needs" : "groups need"} you` : "All groups on track"}
        </h1>
      </div>

      <ClassChips classes={home.classes} value={offering} onChange={setOffering} />

      {groups.length === 0 ? (
        <EmptyNote>No groups have formed in this class yet. They appear here as students team up.</EmptyNote>
      ) : flagged.length === 0 ? (
        <div className="flex items-center gap-3 rounded-[20px] bg-mint-soft p-4 text-mint">
          <PartyPopper className="size-6 shrink-0" aria-hidden />
          <p className="font-semibold">Nobody needs you right now.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {flagged.map(({ g, reasons }) => (
            <li key={g.groupId}>
              <GroupCard g={g} reasons={reasons.map((r) => r.text)} classLabel={home.classes.length > 1 ? labelOf(g.offeringId) : null} urgent={reasons[0].severity === 3} />
            </li>
          ))}
        </ul>
      )}

      {fine.length ? (
        <section className="space-y-2">
          <h2 className="font-display text-lg font-bold">On track ({fine.length})</h2>
          <ul className="divide-y divide-line rounded-[18px] border border-line bg-bg-elevated">
            {fine.map((g) => (
              <li key={g.groupId}>
                <Link
                  to="/lecturer/groups/$groupId"
                  params={{ groupId: g.groupId }}
                  className="flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-bg-subtle"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{g.ventureName ?? g.groupName}</span>
                    <span className="block text-xs text-muted">
                      Group {g.groupNumber} · {stageLabel(g)} · {g.members.length} members
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function GroupCard({ g, reasons, classLabel, urgent }: { g: GroupSignals; reasons: string[]; classLabel: string | null; urgent: boolean }) {
  return (
    <Link
      to="/lecturer/groups/$groupId"
      params={{ groupId: g.groupId }}
      className={cn(
        "block rounded-[20px] border bg-bg-elevated p-4 transition-colors hover:border-ink",
        urgent ? "border-clay/60" : "border-line",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted">
            Group {g.groupNumber}
            {classLabel ? ` · ${classLabel}` : ""} · {stageLabel(g)}
          </p>
          <p className="truncate font-display text-lg font-bold">{g.ventureName ?? g.groupName}</p>
        </div>
        <ChevronRight className="mt-1 size-5 shrink-0 text-faint" aria-hidden />
      </div>
      <ul className="mt-2 space-y-1">
        {reasons.map((r) => (
          <li key={r} className="flex gap-2 text-sm leading-6">
            <span className={cn("mt-2 size-2 shrink-0 rounded-full", urgent ? "bg-clay" : "bg-gold")} aria-hidden />
            {r}
          </li>
        ))}
      </ul>
      {g.feedbackCount ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
          <MessageSquareText className="size-3.5" aria-hidden /> {g.feedbackCount} feedback sent
        </p>
      ) : null}
    </Link>
  );
}
