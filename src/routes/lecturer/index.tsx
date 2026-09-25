import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Search } from "lucide-react";
import { useStaff } from "@/hooks/lecturer-context";
import { getCohort } from "@/lib/server/lecturer";
import { STAGES, STAGE_BY_ID } from "@/lib/domain/stages";
import { FlagList } from "@/components/lecturer/FlagList";
import { errorMessage } from "@/hooks/use-action";
import { Emblem } from "@/components/ui/emblem";
import { Card, Eyebrow, EmptyNote } from "@/components/ui/badge";
import { FormMessages, Loading } from "@/components/ui/feedback";
import { daysAgo } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/lecturer/")({ component: Queue });

type Cohort = Awaited<ReturnType<typeof getCohort>>;
type Filter = "attention" | "mine" | "unassigned" | "all";

function Queue() {
  const { offeringId, staff } = useStaff();
  const [data, setData] = useState<Cohort | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("attention");
  const [stage, setStage] = useState<string>("");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!offeringId) return;
    setData(null);
    getCohort({ data: { offeringId } }).then(setData, (e) => setError(errorMessage(e)));
  }, [offeringId]);

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    return data.groups.filter((g) => {
      if (filter === "attention" && g.score < 30) return false;
      if (filter === "mine" && g.assignedStaffId !== staff.id) return false;
      if (filter === "unassigned" && g.assignedStaffId) return false;
      if (stage && g.currentStage !== stage) return false;
      if (needle && !`${g.groupNumber} ${g.groupName} ${g.ventureName ?? ""}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [data, filter, stage, q, staff.id]);

  if (!offeringId) return <EmptyNote>You are not registered to any course offering yet.</EmptyNote>;
  if (error) return <FormMessages error={error} />;
  if (!data) return <Loading />;

  const attention = data.groups.filter((g) => g.score >= 100).length;
  const byStage = STAGES.map((s) => ({ s, n: data.groups.filter((g) => g.currentStage === s.id).length }));
  const finished = data.groups.filter((g) => g.currentStage === null).length;
  const maxN = Math.max(1, ...byStage.map((b) => b.n), finished);

  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>Good to see you, {staff.fullName}</Eyebrow>
        <h1 className="mt-1 font-display text-3xl font-extrabold">Who needs you today</h1>
        <p className="mt-1 max-w-[70ch] text-sm leading-6 text-muted">
          Groups are ranked by how urgently they need a lecturer, from rules you can read on each
          flag. Healthy groups stay out of your way.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile n={data.enrolled} label="students enrolled" />
        <Tile n={data.ungrouped} label="not yet in a group" tone={data.ungrouped ? "warn" : undefined} />
        <Tile n={data.groups.length} label="groups" />
        <Tile n={attention} label="urgent groups" tone={attention ? "bad" : undefined} />
      </div>

      <Card as="section">
        <Eyebrow>Where the groups are</Eyebrow>
        <ul className="mt-3 space-y-1.5">
          {byStage.map(({ s, n }) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => {
                  setStage(stage === s.id ? "" : s.id);
                  setFilter("all");
                }}
                className={cn("grid w-full grid-cols-[1.25rem_13rem_1fr_2rem] items-center gap-2 rounded-[4px] text-left text-sm", stage === s.id && "bg-gold-soft")}
                title={`${n} group${n === 1 ? "" : "s"} currently at ${s.title}`}
              >
                <Emblem emblem={s.emblem} className="size-4 text-muted" />
                <span className="truncate">{s.stop}. {s.title}</span>
                <span className="h-3.5 rounded-r-[4px] bg-accent" style={{ width: `${(n / maxN) * 100}%`, minWidth: n ? 4 : 0 }} />
                <span className="text-right font-mono text-xs tabular">{n}</span>
              </button>
            </li>
          ))}
          <li className="grid grid-cols-[1.25rem_13rem_1fr_2rem] items-center gap-2 text-sm text-muted">
            <span />
            <span>Finished the route</span>
            <span className="h-3.5 rounded-r-[4px] bg-gold" style={{ width: `${(finished / maxN) * 100}%`, minWidth: finished ? 4 : 0 }} />
            <span className="text-right font-mono text-xs tabular">{finished}</span>
          </li>
        </ul>
      </Card>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["attention", "Needs attention"],
              ["mine", "My groups"],
              ["unassigned", "Unassigned"],
              ["all", "All groups"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={filter === k}
              onClick={() => setFilter(k)}
              className={cn(
                "rounded-full border-2 px-3 py-1 text-sm font-medium",
                filter === k ? "border-ink bg-ink text-bg-elevated" : "border-line-strong text-ink-soft",
              )}
            >
              {label}
            </button>
          ))}
          {stage ? (
            <button type="button" onClick={() => setStage("")} className="rounded-full border-2 border-gold bg-gold-soft px-3 py-1 text-sm">
              {STAGE_BY_ID[stage as keyof typeof STAGE_BY_ID]?.title} ×
            </button>
          ) : null}
          <label className="ml-auto flex items-center gap-2 rounded-[8px] border-2 border-line-strong/70 bg-bg-elevated px-2.5">
            <Search className="size-4 text-faint" aria-hidden />
            <span className="sr-only">Find a group</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Group, name, venture" className="h-9 w-44 bg-transparent text-sm focus:outline-none" />
          </label>
        </div>

        {rows.length ? (
          <ul className="overflow-hidden rounded-[10px] border-2 border-ink bg-bg-elevated">
            {rows.map((g) => {
              const def = g.currentStage ? STAGE_BY_ID[g.currentStage] : null;
              const last = g.lastActivityAt ? daysAgo(g.lastActivityAt) : null;
              return (
                <li key={g.id} className="border-b border-line last:border-0">
                  <Link
                    to="/lecturer/groups/$groupId"
                    params={{ groupId: g.id }}
                    className="grid gap-2 px-3 py-3 hover:bg-bg-subtle/60 md:grid-cols-[3rem_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.6fr)_1.25rem] md:items-center"
                  >
                    <span className="font-display text-2xl font-extrabold tabular text-muted">{g.groupNumber}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{g.ventureName ?? g.groupName}</span>
                      <span className="block truncate text-xs text-muted">
                        {g.ventureName ? g.groupName : "No venture yet"} · {g.realMembers} student{g.realMembers === 1 ? "" : "s"}
                        {g.isDemo ? " · demo" : ""}
                        {g.assignedStaffName ? ` · ${g.assignedStaffName.split(" ")[0]}` : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 text-sm">
                      {def ? <Emblem emblem={def.emblem} className="size-5 text-gold-deep" /> : null}
                      <span className="min-w-0">
                        <span className="block truncate">{def ? `${def.stop}. ${def.title}` : "Route finished"}</span>
                        <span className="block text-xs text-muted">
                          {g.stagesDone}/11 done · {last === null ? "no activity" : last === 0 ? "active today" : `quiet ${last}d`}
                        </span>
                      </span>
                    </span>
                    <FlagList flags={g.flags} />
                    <ChevronRight className="hidden size-5 text-muted md:block" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyNote>
            {filter === "attention" ? "No group needs urgent attention right now." : "No groups match."}
          </EmptyNote>
        )}
      </section>
    </div>
  );
}

function Tile({ n, label, tone }: { n: number; label: string; tone?: "warn" | "bad" }) {
  return (
    <div
      className={cn(
        "rounded-[10px] border-2 bg-bg-elevated px-3 py-3",
        tone === "bad" ? "border-clay" : tone === "warn" ? "border-gold" : "border-ink",
      )}
    >
      <p className="font-display text-3xl font-extrabold tabular">{n}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}
