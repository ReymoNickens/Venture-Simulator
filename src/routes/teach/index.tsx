import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ChevronRight, FlaskConical, Lightbulb, Scale, Search, Users } from "lucide-react";
import { Bar, BarChart, Cell, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { getCohort } from "@/lib/server/lecturer";
import { Badge, Card, SectionTitle, type Tone } from "@/components/ui/badge";
import { Empty, Skeleton } from "@/components/ui/empty";
import { Input, Select } from "@/components/ui/input";
import { Bar as Progress } from "@/components/ui/progress";
import { timeAgo } from "@/lib/domain/story";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/teach/")({ component: Cohort });

type CohortData = Awaited<ReturnType<typeof getCohort>>;
type GroupRow = CohortData["groups"][number];

export const STAGES = [
  { id: "ideas", label: "Ideas", color: "var(--color-ch-idea)", tone: "sun" as Tone },
  { id: "deciding", label: "Deciding", color: "var(--color-ch-decide)", tone: "neutral" as Tone },
  { id: "evidence", label: "Evidence", color: "var(--color-ch-evidence)", tone: "accent" as Tone },
  { id: "testing", label: "Testing", color: "var(--color-ch-test)", tone: "night" as Tone },
] as const;
export type StageId = (typeof STAGES)[number]["id"];

export function stageOf(g: { status: string; testsDone: number }): StageId {
  if (g.status === "forming" || g.status === "opportunity_collection") return "ideas";
  if (g.status === "selection_ready" || g.status === "selection") return "deciding";
  return g.testsDone > 0 ? "testing" : "evidence";
}

function Cohort() {
  const [offeringId, setOfferingId] = useState<string | undefined>();
  const [data, setData] = useState<CohortData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<StageId | "attention" | "all">("all");

  useEffect(() => {
    setData(null);
    getCohort({ data: { offeringId } }).then(setData, (e: unknown) => setError(e instanceof Error ? e.message : "Could not load your cohort."));
  }, [offeringId]);

  if (error) return <Empty title="Couldn't load the cohort" body={error} />;
  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-72" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20" />)}</div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const o = data.offering;
  const funnel = STAGES.map((s) => ({ ...s, n: data.groups.filter((g) => stageOf(g) === s.id).length }));
  const attention = data.groups.filter((g) => g.flags.length);
  const shown = data.groups
    .filter((g) => (filter === "all" ? true : filter === "attention" ? g.flags.length > 0 : stageOf(g) === filter))
    .filter((g) => !q.trim() || `${g.name} ${g.venture ?? ""} ${g.number}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3 animate-rise">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted">{o.course_code} · {o.semester} {o.academic_year}</p>
          <h1 className="mt-1 font-display text-[2rem] leading-tight">{o.course_name}</h1>
          <p className="mt-1 text-sm text-muted">Decision rule: {o.decision_rule === "all" ? "everyone must endorse" : "majority endorsement"}</p>
        </div>
        {data.offerings.length > 1 ? (
          <Select aria-label="Course" className="w-auto" value={o.id} onChange={(e) => setOfferingId(e.target.value)}>
            {data.offerings.map((x) => <option key={x.id} value={x.id}>{x.course_code} · {x.semester} {x.academic_year}</option>)}
          </Select>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 animate-rise md:grid-cols-5">
        <Tile icon={<Users className="size-4" />} n={data.totals.students} label="students" />
        <Tile icon={<Users className="size-4" />} n={data.totals.groups} label="groups" />
        <Tile icon={<Scale className="size-4" />} n={data.totals.ventures} label="ventures chosen" />
        <Tile icon={<Lightbulb className="size-4" />} n={data.totals.evidence} label="evidence items" />
        <Tile icon={<FlaskConical className="size-4" />} n={data.totals.experiments} label="tests finished" />
      </div>

      {!data.groups.length ? (
        <Empty icon={<Users className="size-5" />} title="No groups yet" body="Students create or join groups from their studio. They'll appear here as soon as they do." />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
            <Card className="animate-rise">
              <SectionTitle kicker="Where groups are" title="Stage of the journey" />
              <div className="mt-3 h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={funnel} layout="vertical" margin={{ left: 0, right: 24, top: 4, bottom: 4 }}>
                    <XAxis type="number" allowDecimals={false} hide />
                    <YAxis type="category" dataKey="label" width={78} tickLine={false} axisLine={false} tick={{ fontSize: 13, fill: "var(--color-ink-soft)" }} />
                    <Bar dataKey="n" radius={[0, 8, 8, 0]} barSize={22} label={{ position: "right", fontSize: 13, fontWeight: 700, fill: "var(--color-ink)" }} isAnimationActive={false}>
                      {funnel.map((f) => <Cell key={f.id} fill={f.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card className="animate-rise">
              <SectionTitle kicker="Needs a nudge" title={attention.length ? `${attention.length} group${attention.length === 1 ? "" : "s"} to check` : "All groups moving"} />
              {attention.length ? (
                <ul className="mt-3 space-y-2">
                  {attention.slice(0, 5).map((g) => (
                    <li key={g.id}>
                      <Link to="/teach/group/$groupId" params={{ groupId: g.id }} className="flex items-start gap-3 rounded-[14px] bg-warn-soft/60 p-3 hover:bg-warn-soft">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold">{g.name}</span>
                          <span className="block text-sm text-warn">{g.flags.join(" · ")}</span>
                        </span>
                        <ChevronRight className="mt-0.5 size-4 text-muted" />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted">No group has been quiet for a week or is stuck on a step.</p>
              )}
            </Card>
          </div>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="mr-auto font-display text-xl">Groups</h2>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search groups or ventures" className="h-10 pl-9 text-sm" aria-label="Search groups" />
              </div>
            </div>
            <div className="scroll-snap-x -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              {([{ id: "all", label: `All (${data.groups.length})` }, { id: "attention", label: `Needs a nudge (${attention.length})` }, ...funnel.map((f) => ({ id: f.id, label: `${f.label} (${f.n})` }))] as { id: typeof filter; label: string }[]).map((f) => (
                <button key={f.id} type="button" onClick={() => setFilter(f.id)} aria-pressed={filter === f.id} className={cn("h-9 shrink-0 rounded-full border px-3.5 text-sm font-semibold", filter === f.id ? "border-night bg-night text-accent-fg" : "border-line bg-bg-elevated")}>
                  {f.label}
                </button>
              ))}
            </div>
            <ul className="grid gap-3 md:grid-cols-2">
              {shown.map((g) => <GroupCard key={g.id} g={g} />)}
            </ul>
            {!shown.length ? <p className="py-6 text-center text-sm text-muted">No groups match.</p> : null}
          </section>
        </>
      )}
    </div>
  );
}

function Tile({ icon, n, label }: { icon: React.ReactNode; n: number; label: string }) {
  return (
    <div className="rounded-[18px] border border-line/80 bg-bg-elevated p-4 shadow-[var(--shadow-card)]">
      <span className="text-muted">{icon}</span>
      <p className="mt-1 font-display text-3xl leading-none tabular-nums">{n}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </div>
  );
}

function GroupCard({ g }: { g: GroupRow }) {
  const st = STAGES.find((s) => s.id === stageOf(g))!;
  return (
    <li>
      <Link to="/teach/group/$groupId" params={{ groupId: g.id }} className="block h-full rounded-[20px] border border-line/80 bg-bg-elevated p-4 shadow-[var(--shadow-card)] transition-colors hover:border-line-strong">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">Group {g.number}{g.isDemo ? " · practice" : ""}</p>
            <p className="truncate font-display text-lg leading-tight">{g.name}</p>
            {g.venture ? <p className="truncate text-sm text-ink-soft">Venture: <b>{g.venture}</b></p> : null}
          </div>
          <span className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-white" style={{ background: st.color }}>{st.label}</span>
        </div>
        <div className="mt-3 space-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-muted">Ideas sealed</span>
            <Progress value={g.submitted} max={Math.max(1, g.members)} color="var(--color-ch-idea)" />
            <span className="w-10 shrink-0 text-right tabular-nums">{g.submitted}/{g.members}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-muted">Voted</span>
            <Progress value={g.voted} max={Math.max(1, g.submitted)} color="var(--color-ch-decide)" />
            <span className="w-10 shrink-0 text-right tabular-nums">{g.voted}/{g.submitted}</span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span><b className="text-ink">{g.evidence}</b> evidence</span>
          <span><b className="text-ink">{g.assumptions}</b> assumptions</span>
          <span><b className="text-ink">{g.testsDone}</b>{g.testsPlanned ? `+${g.testsPlanned}` : ""} tests</span>
          <span className="ml-auto">active {timeAgo(g.lastActiveAt)}</span>
        </div>
        {g.flags.length ? (
          <div className="mt-2 flex flex-wrap gap-1">{g.flags.map((f) => <Badge key={f} tone="warn">{f}</Badge>)}</div>
        ) : null}
      </Link>
    </li>
  );
}
