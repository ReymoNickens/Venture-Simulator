import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDown, MessageCircle, Search, Send } from "lucide-react";
import { useStaff } from "@/hooks/lecturer-context";
import { getCohort } from "@/lib/server/lecturer";
import { STAGES, STAGE_BY_ID } from "@/lib/domain/stages";
import { errorMessage } from "@/hooks/use-action";
import { QuickMessage } from "@/components/lecturer/QuickMessage";
import { StopSticker } from "@/components/ui/sticker";
import { EmptyNote } from "@/components/ui/badge";
import { FormMessages, Loading } from "@/components/ui/feedback";
import { daysAgo } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/lecturer/")({ component: Groups });

type Cohort = Awaited<ReturnType<typeof getCohort>>;
type Group = Cohort["groups"][number];
type Filter = "need" | "messages" | "all";
type Target =
  | { kind: "one"; groupId: string; label: string }
  | { kind: "many"; offeringId: string; groupIds: string[]; label: string };

/**
 * One question for a busy lecturer: which groups need me? Healthy groups stay
 * out of the way; everything else about a group is one tap into it.
 */
function Groups() {
  const { offeringId, staff } = useStaff();
  const [data, setData] = useState<Cohort | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("need");
  const [q, setQ] = useState("");
  const [showStages, setShowStages] = useState(false);
  const [messaging, setMessaging] = useState<Target | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    if (!offeringId) return;
    setData(null);
    getCohort({ data: { offeringId } }).then(setData, (e) => setError(errorMessage(e)));
  }, [offeringId]);

  const rows = useMemo(() => {
    if (!data) return [];
    const base =
      filter === "need"
        ? data.groups.filter((g) => g.score >= 30)
        : filter === "messages"
          ? data.groups.filter((g) => g.unreadReplies > 0)
          : data.groups;
    const needle = q.trim().toLowerCase();
    return needle
      ? base.filter((g) => `${g.groupNumber} ${g.groupName} ${g.ventureName ?? ""}`.toLowerCase().includes(needle))
      : base;
  }, [data, filter, q]);

  if (!offeringId) return <EmptyNote>You are not linked to a course yet.</EmptyNote>;
  if (error) return <FormMessages error={error} />;
  if (!data) return <Loading />;

  const need = data.groups.filter((g) => g.score >= 30).length;
  const withMessages = data.groups.filter((g) => g.unreadReplies > 0).length;
  const title = staff.fullName.split(" ").slice(0, 2).join(" ");
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-[32px] leading-tight font-extrabold">
          {need ? `${need} group${need === 1 ? " needs" : "s need"} you` : "All groups are on track"}
        </h1>
        <p className="mt-1 text-[15px] text-muted">
          Hello {title}. {data.groups.length} group{data.groups.length === 1 ? "" : "s"} · {data.enrolled} student{data.enrolled === 1 ? "" : "s"}
          {data.ungrouped ? ` · ${data.ungrouped} not in a group yet` : ""}.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-full bg-bg-subtle p-1 text-sm font-semibold">
          {(
            [
              ["need", `Need you · ${need}`],
              ["messages", `New messages · ${withMessages}`],
              ["all", "All"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={filter === k}
              onClick={() => setFilter(k)}
              className={cn("rounded-full px-3.5 py-1.5", filter === k ? "bg-bg-elevated text-ink shadow-sm" : "text-muted")}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 rounded-full bg-bg-elevated px-3 ring-1 ring-line">
          <Search className="size-4 text-faint" aria-hidden />
          <span className="sr-only">Find a group</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a group" className="h-9 w-36 bg-transparent text-sm focus:outline-none" />
        </label>
      </div>

      {sent ? <p className="text-sm font-semibold text-mint">{sent}</p> : null}

      {rows.length ? (
        <ul className="space-y-2.5">
          {rows.map((g) => (
            <GroupCard
              key={g.id}
              g={g}
              onMessage={() => setMessaging({ kind: "one", groupId: g.id, label: `Group ${g.groupNumber} · ${g.ventureName ?? g.groupName}` })}
            />
          ))}
        </ul>
      ) : (
        <EmptyNote>
          {filter === "need" ? "Nobody needs you right now. 🎉" : filter === "messages" ? "No new messages." : "No groups yet."}
        </EmptyNote>
      )}

      {rows.length > 1 ? (
        <button
          type="button"
          onClick={() => setMessaging({ kind: "many", offeringId, groupIds: rows.map((r) => r.id), label: `These ${rows.length} groups` })}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo"
        >
          <Send className="size-4" aria-hidden /> Message all {rows.length} of these groups
        </button>
      ) : null}

      <section>
        <button type="button" onClick={() => setShowStages((v) => !v)} aria-expanded={showStages} className="inline-flex items-center gap-1 text-sm font-semibold text-muted">
          Where are the groups? <ChevronDown className={cn("size-4 transition-transform", showStages && "rotate-180")} aria-hidden />
        </button>
        {showStages ? <StageSpread groups={data.groups} /> : null}
      </section>

      {messaging ? (
        <QuickMessage target={messaging} onClose={() => setMessaging(null)} onSent={() => setSent(`Sent to ${messaging.label}.`)} />
      ) : null}
    </div>
  );
}

function GroupCard({ g, onMessage }: { g: Group; onMessage: () => void }) {
  const def = g.currentStage ? STAGE_BY_ID[g.currentStage] : null;
  const last = g.lastActivityAt ? daysAgo(g.lastActivityAt) : null;
  const top = g.flags[0];
  return (
    <li className="flex items-stretch overflow-hidden rounded-[22px] bg-bg-elevated ring-1 ring-line">
      <Link to="/lecturer/groups/$groupId" params={{ groupId: g.id }} className="flex min-w-0 flex-1 items-center gap-3 p-4 hover:bg-bg-subtle/50">
        {def ? <StopSticker stage={def.id} size="md" /> : <span className="size-12 shrink-0 rounded-full bg-mint-soft" />}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">
            {g.ventureName ?? g.groupName}
            <span className="font-normal text-muted"> · Group {g.groupNumber}</span>
          </span>
          <span className="block truncate text-sm text-muted">
            {def ? `Stop ${def.stop}: ${def.title}` : "Finished"} ·{" "}
            {last === null ? "not started" : last === 0 ? "active today" : `quiet for ${last} days`}
          </span>
          {g.unreadReplies ? (
            <span className="mt-1 flex items-center gap-1 text-sm font-semibold text-indigo">
              <MessageCircle className="size-4" aria-hidden /> {g.unreadReplies} new message{g.unreadReplies === 1 ? "" : "s"}
            </span>
          ) : top ? (
            <span className={cn("mt-1 block truncate text-sm", top.severity === "high" ? "text-clay" : "text-warn")}>{top.message}</span>
          ) : null}
        </span>
      </Link>
      <button
        type="button"
        onClick={onMessage}
        aria-label={`Message group ${g.groupNumber}`}
        className="flex w-14 shrink-0 items-center justify-center border-l border-line text-muted hover:bg-indigo-soft hover:text-indigo"
      >
        <Send className="size-4" aria-hidden />
      </button>
    </li>
  );
}

function StageSpread({ groups }: { groups: Group[] }) {
  const counts = STAGES.map((s) => ({ s, n: groups.filter((g) => g.currentStage === s.id).length }));
  const max = Math.max(1, ...counts.map((c) => c.n));
  return (
    <ul className="rise mt-3 space-y-2 rounded-[22px] bg-bg-elevated p-4 ring-1 ring-line">
      {counts.map(({ s, n }) => (
        <li key={s.id} className="grid grid-cols-[1.75rem_11rem_1fr_1.5rem] items-center gap-2 text-sm" title={`${n} at ${s.title}`}>
          <StopSticker stage={s.id} size="xs" tilt={false} muted={!n} />
          <span className={cn("truncate", !n && "text-faint")}>{s.title}</span>
          <span className="h-2.5 rounded-full bg-accent" style={{ width: `${(n / max) * 100}%`, minWidth: n ? 6 : 0 }} />
          <span className="text-right text-xs font-semibold tabular">{n}</span>
        </li>
      ))}
    </ul>
  );
}
