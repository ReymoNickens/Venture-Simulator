import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ClipboardList, Eye, Image, MessageSquareQuote, Mic, MessageCircleQuestion, Camera, CheckCircle2, CircleHelp, FlaskConical, LayoutGrid, Link2, NotebookPen, Plus, Scale, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { EvidenceForm } from "@/components/forms/EvidenceForm";
import { AssumptionForm, ReviseForm } from "@/components/forms/AssumptionForm";
import { LinkEvidenceForm, PlanTestForm, RecordResultForm } from "@/components/forms/ExperimentForms";
import { Badge, Card, SectionTitle, type Tone } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Empty, Skeleton } from "@/components/ui/empty";
import { Sheet } from "@/components/ui/sheet";
import { Tabs, TabList, TabPanel } from "@/components/ui/tabs";
import { Confetti } from "@/components/ui/confetti";
import { Avatar } from "@/components/ui/avatar";
import { CLASSIFICATIONS, EXPERIMENT_METHODS, SOURCE_TYPES } from "@/lib/domain/config";
import { riskScore } from "@/lib/domain/state-machine";
import { timeAgo } from "@/lib/domain/story";
import { getEvidencePhoto } from "@/lib/server/mutations";
import type { Assumption, EvidenceItem, Experiment, WorkspaceSnapshot } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

type Tab = "board" | "evidence" | "assumptions" | "tests";
const TABS: Tab[] = ["board", "evidence", "assumptions", "tests"];

export const Route = createFileRoute("/studio/venture")({
  component: VenturePage,
  validateSearch: (s: Record<string, unknown>): { tab?: Tab; add?: string } => ({
    tab: TABS.includes(s.tab as Tab) ? (s.tab as Tab) : undefined,
    add: typeof s.add === "string" || typeof s.add === "number" ? String(s.add) : undefined,
  }),
});

const first = (n: string) => n.split(" ")[0];
const SOURCE_ICON: Record<string, React.ReactNode> = {
  interview: <Mic className="size-5" />,
  survey: <ClipboardList className="size-5" />,
  observation: <Eye className="size-5" />,
  quotation: <MessageSquareQuote className="size-5" />,
  photo: <Image className="size-5" />,
};
const label = <T extends readonly { value: string; label: string }[]>(list: T, v: string) => list.find((x) => x.value === v)?.label ?? v;

const STATUS: Record<Assumption["status"], { tone: Tone; text: string }> = {
  open: { tone: "neutral", text: "Untested" },
  testing: { tone: "sun", text: "Testing" },
  supported: { tone: "accent", text: "Held up" },
  challenged: { tone: "bad", text: "Challenged" },
};

function VenturePage() {
  const { data, loading, refresh } = useStudioWorkspace();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/studio/venture" });
  const tab: Tab = search.tab ?? "board";
  const [sheet, setSheet] = useState<null | { kind: "evidence" | "assumption" | "plan" | "result" | "revise" | "link" | "viewEvidence"; id?: string }>(null);
  const [party, setParty] = useState(0);

  // Deep links from the home screen (?add=1) open the right form straight away.
  useEffect(() => {
    if (!search.add || !data?.venture) return;
    if (tab === "evidence") setSheet({ kind: "evidence" });
    else if (tab === "assumptions") setSheet({ kind: "assumption" });
    else if (tab === "tests" && data.assumptions.length) setSheet({ kind: "plan", id: search.add === "1" ? undefined : search.add });
    void navigate({ search: { tab }, replace: true });
  }, [search.add, tab, data?.venture, data?.assumptions.length, navigate]);

  if (loading || !data) return <Skeleton className="h-72" />;
  if (!data.venture) {
    return (
      <Empty
        icon={<Scale className="size-5" />}
        title="No venture yet"
        body="Your group chooses one idea together first. Then this becomes your shared evidence board."
        action={<Link to="/studio/select" className={buttonVariants({})}>Go to Decide</Link>}
      />
    );
  }

  const v = data.venture;
  const done = data.experiments.filter((x) => x.status === "done");
  const close = () => setSheet(null);
  const saved = (what: string) => (queued: boolean) => {
    close();
    void refresh();
    toast.success(queued ? "Saved on this phone — it will sync when you're back online." : what);
  };

  return (
    <div className="space-y-5">
      <Confetti fire={party} />
      <div className="animate-rise">
        <Badge tone="accent">Our venture</Badge>
        <h1 className="mt-2 font-display text-[2rem] leading-tight">{v.name}</h1>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat n={data.evidence.length} label="evidence" color="var(--color-ch-evidence)" />
          <Stat n={data.assumptions.length} label="assumptions" color="var(--color-ch-assumptions)" />
          <Stat n={done.length} label="tests done" color="var(--color-ch-test)" />
        </div>
      </div>

      <Tabs value={tab} onValueChange={(t) => void navigate({ search: { tab: t as Tab }, replace: true })}>
        <TabList
          tabs={[
            { value: "board", label: "Board", icon: <LayoutGrid className="size-4" /> },
            { value: "evidence", label: "Evidence", count: data.evidence.length },
            { value: "assumptions", label: "Assumptions", count: data.assumptions.length },
            { value: "tests", label: "Tests", count: data.experiments.length },
          ]}
        />
        <TabPanel value="board" className="mt-4 outline-none">
          <Board data={data} open={setSheet} />
        </TabPanel>
        <TabPanel value="evidence" className="mt-4 outline-none">
          <EvidenceList data={data} open={setSheet} />
        </TabPanel>
        <TabPanel value="assumptions" className="mt-4 outline-none">
          <AssumptionList data={data} open={setSheet} />
        </TabPanel>
        <TabPanel value="tests" className="mt-4 outline-none">
          <TestList data={data} open={setSheet} />
        </TabPanel>
      </Tabs>

      <Sheet open={sheet?.kind === "evidence"} onOpenChange={(o) => !o && close()} title="Log evidence" description="Something you saw, heard, counted or photographed.">
        <EvidenceForm maxPhotoBytes={data.offering?.maxPhotoBytes ?? 800_000} onSaved={saved("Evidence logged.")} />
      </Sheet>
      <Sheet open={sheet?.kind === "assumption"} onOpenChange={(o) => !o && close()} title="Name an assumption" description="A belief your venture depends on.">
        <AssumptionForm onSaved={saved("Assumption added.")} />
      </Sheet>
      <Sheet open={sheet?.kind === "plan"} onOpenChange={(o) => !o && close()} title="Design a test" description="The cheapest way to find out if you're wrong.">
        <PlanTestForm assumptions={data.assumptions} initialAssumptionId={sheet?.id} onSaved={saved("Test planned. Go and run it!")} />
      </Sheet>
      <Sheet open={sheet?.kind === "result"} onOpenChange={(o) => !o && close()} title="Record the result">
        {sheet?.kind === "result" ? (() => {
          const x = data.experiments.find((e) => e.id === sheet.id);
          if (!x) return null;
          return (
            <RecordResultForm
              experiment={x}
              assumption={data.assumptions.find((a) => a.id === x.assumptionId)}
              evidence={data.evidence}
              onAddEvidence={() => setSheet({ kind: "evidence" })}
              onSaved={(r) => {
                close();
                void refresh();
                if (done.length === 0) setParty((n) => n + 1);
                toast.success(r === "supports" ? "It held up. Nice — now test the next riskiest one." : r === "challenges" ? "It didn't hold. That's a real finding — it just saved you time and money." : "Saved. Consider a bigger or sharper test.");
              }}
            />
          );
        })() : null}
      </Sheet>
      <Sheet open={sheet?.kind === "revise"} onOpenChange={(o) => !o && close()} title="Change confidence">
        {sheet?.kind === "revise" ? (() => {
          const a = data.assumptions.find((x) => x.id === sheet.id);
          return a ? <ReviseForm assumptionId={a.id} current={a.confidence} onSaved={() => { close(); void refresh(); toast.success("Updated. The reason is kept in the history."); }} /> : null;
        })() : null}
      </Sheet>
      <Sheet open={sheet?.kind === "link"} onOpenChange={(o) => !o && close()} title="Link evidence">
        {sheet?.kind === "link" ? (() => {
          const a = data.assumptions.find((x) => x.id === sheet.id);
          return a ? <LinkEvidenceForm assumption={a} evidence={data.evidence} onSaved={() => { close(); void refresh(); toast.success("Linked."); }} /> : null;
        })() : null}
      </Sheet>
      <Sheet open={sheet?.kind === "viewEvidence"} onOpenChange={(o) => !o && close()} title={data.evidence.find((e) => e.id === sheet?.id)?.title ?? "Evidence"}>
        {sheet?.kind === "viewEvidence" ? <EvidenceDetail item={data.evidence.find((e) => e.id === sheet.id)} data={data} /> : null}
      </Sheet>
    </div>
  );
}

function Stat({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <div className="rounded-[16px] border border-line/80 bg-bg-elevated px-3 py-2.5">
      <p className="font-display text-2xl leading-none tabular-nums" style={{ color }}>{n}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </div>
  );
}

type Open = (s: { kind: "evidence" | "assumption" | "plan" | "result" | "revise" | "link" | "viewEvidence"; id?: string }) => void;

function Board({ data, open }: { data: WorkspaceSnapshot; open: Open }) {
  const ranked = useMemo(() => [...data.assumptions].sort((a, b) => riskScore(b) - riskScore(a)), [data.assumptions]);
  const num = new Map(ranked.map((a, i) => [a.id, i + 1]));
  const hi = (a: Assumption) => a.importance === "critical" || a.importance === "high";
  const unsure = (a: Assumption) => a.confidence === "low" || a.status === "challenged";
  const quads = [
    { key: "test", title: "Test first", sub: "Important · unsure", items: ranked.filter((a) => hi(a) && unsure(a)), cls: "bg-clay-soft/80 border-clay/30" },
    { key: "watch", title: "Keep checking", sub: "Important · fairly sure", items: ranked.filter((a) => hi(a) && !unsure(a)), cls: "bg-accent-soft/70 border-accent/20" },
    { key: "later", title: "Later", sub: "Less important · unsure", items: ranked.filter((a) => !hi(a) && unsure(a)), cls: "bg-bg-subtle/80 border-line" },
    { key: "fine", title: "Fine for now", sub: "Less important · sure", items: ranked.filter((a) => !hi(a) && !unsure(a)), cls: "bg-bg-subtle/50 border-line" },
  ];
  const planned = data.experiments.filter((x) => x.status === "planned");
  const top = ranked.find((a) => a.status === "open");
  const challenged = ranked.find((a) => a.status === "challenged" && !data.experiments.some((x) => x.assumptionId === a.id && x.status === "planned"));

  return (
    <div className="space-y-4">
      {planned[0] ? (
        <Card className="border-ch-test/40">
          <SectionTitle kicker="In progress" title="Finish your test" />
          <p className="mt-2 text-[15px] leading-6">{planned[0].hypothesis}</p>
          <p className="mt-1 text-sm text-muted">Right if: {planned[0].successCriteria}</p>
          <Button className="mt-3" onClick={() => open({ kind: "result", id: planned[0].id })}>Record the result</Button>
        </Card>
      ) : challenged ? (
        <Card className="border-bad/30 bg-bad-soft/30">
          <SectionTitle kicker="A test didn't hold" title="That's a real finding" />
          <p className="mt-2 text-[15px] leading-6">“{challenged.statement}”</p>
          <p className="mt-1 text-sm leading-6 text-muted">Good ventures change when the evidence says so. Test it a different way, change the idea (a different price, customer or place), or name a new assumption.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => open({ kind: "plan", id: challenged.id })}><FlaskConical className="size-4" /> Test it differently</Button>
            <Link to="/studio/advisor" search={{ stage: "evidence" }} className={buttonVariants({ variant: "secondary" })}><MessageCircleQuestion className="size-4" /> Talk it through</Link>
          </div>
        </Card>
      ) : top ? (
        <Card className="border-clay/40">
          <SectionTitle kicker="Riskiest untested assumption" title="What could sink this?" />
          <p className="mt-2 text-[15px] leading-6">“{top.statement}”</p>
          <Button className="mt-3" onClick={() => open({ kind: "plan", id: top.id })}><FlaskConical className="size-4" /> Design a test</Button>
        </Card>
      ) : null}

      <Card>
        <SectionTitle kicker="Risk map" title="Where to look next" action={<Button size="sm" variant="secondary" onClick={() => open({ kind: "assumption" })}><Plus className="size-3.5" /> Add</Button>} />
        {data.assumptions.length ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {quads.map((q) => (
                <div key={q.key} className={cn("min-h-28 rounded-[16px] border p-3", q.cls)}>
                  <p className="text-sm font-bold">{q.title}</p>
                  <p className="text-[11px] text-muted">{q.sub}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {q.items.map((a) => (
                      <span key={a.id} title={a.statement} className={cn("grid size-7 place-items-center rounded-full text-xs font-bold text-white", a.status === "supported" ? "bg-accent" : a.status === "challenged" ? "bg-bad" : a.status === "testing" ? "bg-sun text-night" : "bg-night")}>
                        {num.get(a.id)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <ol className="mt-4 space-y-2">
              {ranked.map((a) => (
                <li key={a.id} className="flex items-start gap-2.5 text-sm">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-bg-subtle text-[11px] font-bold">{num.get(a.id)}</span>
                  <span className="min-w-0 flex-1 leading-5">{a.statement}</span>
                  <Badge tone={STATUS[a.status].tone}>{STATUS[a.status].text}</Badge>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <Empty className="mt-4" title="No assumptions yet" body="Every venture rests on beliefs. Name the ones that would sink it if they were wrong." action={<Button onClick={() => open({ kind: "assumption" })}>Name one</Button>} />
        )}
      </Card>

      <Card>
        <SectionTitle kicker="Latest" title="Recent evidence" action={<Button size="sm" variant="secondary" onClick={() => open({ kind: "evidence" })}><Camera className="size-3.5" /> Log</Button>} />
        {data.evidence.length ? (
          <ul className="mt-3 space-y-2">{data.evidence.slice(0, 3).map((e) => <EvidenceRow key={e.id} e={e} onOpen={() => open({ kind: "viewEvidence", id: e.id })} />)}</ul>
        ) : (
          <p className="mt-2 text-sm text-muted">Nothing yet. Go and count, photograph or interview.</p>
        )}
      </Card>
    </div>
  );
}

function EvidenceRow({ e, onOpen }: { e: EvidenceItem; onOpen: () => void }) {
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 rounded-[14px] border border-line/80 bg-bg-elevated p-2.5 text-left transition-colors hover:border-line-strong">
        {e.photoThumb ? (
          <img src={e.photoThumb} alt="" loading="lazy" className="size-14 shrink-0 rounded-[10px] object-cover" />
        ) : (
          <span className="grid size-14 shrink-0 place-items-center rounded-[10px] bg-ch-evidence/10 text-ch-evidence" aria-label={label(SOURCE_TYPES, e.sourceType)}>{SOURCE_ICON[e.sourceType] ?? <NotebookPen className="size-5" />}</span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{e.title}</span>
          <span className="line-clamp-1 text-sm text-muted">{e.content}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-faint">
            {first(e.authorName)} · {timeAgo(e.createdAt)}
            {e.syncState === "pending" ? <Badge tone="warn">Not synced</Badge> : null}
          </span>
        </span>
        <Badge tone={e.classification === "fact" || e.classification === "evidence" ? "accent" : e.classification === "unknown" ? "neutral" : "sun"}>{label(CLASSIFICATIONS, e.classification)}</Badge>
      </button>
    </li>
  );
}

function EvidenceList({ data, open }: { data: WorkspaceSnapshot; open: Open }) {
  const [filter, setFilter] = useState<string>("all");
  const items = filter === "all" ? data.evidence : data.evidence.filter((e) => e.sourceType === filter);
  return (
    <div className="space-y-3">
      <Button block size="lg" onClick={() => open({ kind: "evidence" })}><Camera className="size-4" /> Log evidence</Button>
      {data.evidence.length ? (
        <>
          <div className="scroll-snap-x -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            {[{ value: "all", label: "All" }, ...SOURCE_TYPES].map((s) => (
              <button key={s.value} type="button" onClick={() => setFilter(s.value)} aria-pressed={filter === s.value} className={cn("h-8 shrink-0 rounded-full border px-3 text-xs font-semibold", filter === s.value ? "border-ch-evidence bg-ch-evidence text-white" : "border-line bg-bg-elevated")}>
                {s.label}
              </button>
            ))}
          </div>
          <ul className="space-y-2">{items.map((e) => <EvidenceRow key={e.id} e={e} onOpen={() => open({ kind: "viewEvidence", id: e.id })} />)}</ul>
        </>
      ) : (
        <Empty icon={<Camera className="size-5" />} title="No evidence yet" body="Interviews, counts, photos, quotes. Log what you actually saw — not what you think." />
      )}
    </div>
  );
}

function EvidenceDetail({ item, data }: { item?: EvidenceItem; data: WorkspaceSnapshot }) {
  const [full, setFull] = useState<string | null>(item?.photoData ?? null);
  const [loadingPhoto, setLoading] = useState(false);
  if (!item) return null;
  const linked = data.links.filter((l) => l.evidenceItemId === item.id);
  return (
    <div className="space-y-4">
      {item.hasPhoto || item.photoThumb ? (
        <div className="space-y-2">
          <img src={full ?? item.photoThumb ?? ""} alt={item.title} className="max-h-[50vh] w-full rounded-[16px] border border-line object-contain" />
          {!full && item.hasPhoto ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={loadingPhoto}
              onClick={async () => {
                setLoading(true);
                try {
                  setFull((await getEvidencePhoto({ data: { evidenceId: item.id } })).photo);
                } catch {
                  toast.error("Couldn't load the full photo.");
                } finally {
                  setLoading(false);
                }
              }}
            >
              {loadingPhoto ? "Loading…" : "Load full photo"}
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        <Badge>{label(SOURCE_TYPES, item.sourceType)}</Badge>
        <Badge tone="accent">{label(CLASSIFICATIONS, item.classification)}</Badge>
      </div>
      <p className="whitespace-pre-line text-[15px] leading-6">{item.content}</p>
      <p className="text-xs text-muted">
        {item.authorName}
        {item.observedAt ? ` · ${item.observedAt.slice(0, 10)}` : ""}
        {item.locationContext ? ` · ${item.locationContext}` : ""}
      </p>
      {linked.length ? (
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Linked to</p>
          {linked.map((l) => (
            <p key={l.id} className="text-sm">
              <span className={l.relationshipType === "supports" ? "text-accent" : "text-bad"}>{l.relationshipType === "supports" ? "Supports" : "Challenges"}:</span>{" "}
              {data.assumptions.find((a) => a.id === l.assumptionId)?.statement}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AssumptionList({ data, open }: { data: WorkspaceSnapshot; open: Open }) {
  const ranked = [...data.assumptions].sort((a, b) => riskScore(b) - riskScore(a));
  return (
    <div className="space-y-3">
      <Button block size="lg" onClick={() => open({ kind: "assumption" })}><Plus className="size-4" /> Name an assumption</Button>
      {ranked.length ? (
        ranked.map((a) => {
          const links = data.links.filter((l) => l.assumptionId === a.id);
          const tests = data.experiments.filter((x) => x.assumptionId === a.id);
          return (
            <Card key={a.id} as="article" className="space-y-3">
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 text-[15px] font-semibold leading-6">{a.statement}</p>
                <Badge tone={STATUS[a.status].tone}>{STATUS[a.status].text}</Badge>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span>Importance: <b className="text-ink-soft">{a.importance}</b></span>
                <span>Confidence: <b className="text-ink-soft">{a.confidence}</b></span>
                <span>{links.filter((l) => l.relationshipType === "supports").length} for · {links.filter((l) => l.relationshipType === "challenges").length} against</span>
                <span>{tests.length} test{tests.length === 1 ? "" : "s"}</span>
              </div>
              {a.importance === "critical" && a.confidence === "high" && !links.length ? (
                <p className="flex items-start gap-1.5 rounded-[12px] bg-warn-soft px-3 py-2 text-xs leading-5 text-warn">
                  <AlertTriangle className="mt-px size-3.5 shrink-0" /> High confidence with no linked evidence. What makes you so sure?
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => open({ kind: "plan", id: a.id })}><FlaskConical className="size-3.5" /> Test it</Button>
                <Button size="sm" variant="secondary" onClick={() => open({ kind: "link", id: a.id })}><Link2 className="size-3.5" /> Link evidence</Button>
                <Button size="sm" variant="ghost" onClick={() => open({ kind: "revise", id: a.id })}>Change confidence</Button>
              </div>
              <p className="text-xs text-faint">{first(a.authorName)} · {timeAgo(a.createdAt)}{a.syncState === "pending" ? " · not synced yet" : ""}</p>
            </Card>
          );
        })
      ) : (
        <Empty icon={<CircleHelp className="size-5" />} title="What has to be true?" body="Customers exist, they'll pay, you can deliver it, it's legal… Name the beliefs that would sink the venture if wrong." />
      )}
    </div>
  );
}

function TestList({ data, open }: { data: WorkspaceSnapshot; open: Open }) {
  const planned = data.experiments.filter((x) => x.status === "planned");
  const done = data.experiments.filter((x) => x.status === "done");
  return (
    <div className="space-y-4">
      <Button block size="lg" disabled={!data.assumptions.length} onClick={() => open({ kind: "plan" })}><FlaskConical className="size-4" /> Design a test</Button>
      {!data.assumptions.length ? <p className="text-center text-sm text-muted">Name an assumption first — tests check assumptions.</p> : null}
      {planned.length ? (
        <section className="space-y-2">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Running</h2>
          {planned.map((x) => <TestCard key={x.id} x={x} data={data} onRecord={() => open({ kind: "result", id: x.id })} />)}
        </section>
      ) : null}
      {done.length ? (
        <section className="space-y-2">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Learned</h2>
          {done.map((x) => <TestCard key={x.id} x={x} data={data} />)}
        </section>
      ) : null}
      {!data.experiments.length && data.assumptions.length ? (
        <Empty icon={<NotebookPen className="size-5" />} title="No tests yet" body="Pick your riskiest assumption. Decide what result would prove you right — before you go and look." />
      ) : null}
    </div>
  );
}

function TestCard({ x, data, onRecord }: { x: Experiment; data: WorkspaceSnapshot; onRecord?: () => void }) {
  const a = data.assumptions.find((y) => y.id === x.assumptionId);
  const icon = x.result === "supports" ? <CheckCircle2 className="size-5 text-accent" /> : x.result === "challenges" ? <XCircle className="size-5 text-bad" /> : x.result ? <CircleHelp className="size-5 text-warn" /> : <FlaskConical className="size-5 text-ch-test" />;
  return (
    <Card as="article" className={cn("space-y-3", x.status === "planned" && "border-ch-test/40")}>
      <div className="flex items-start gap-3">
        {icon}
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-6">{x.hypothesis}</p>
          {a && a.statement !== x.hypothesis ? <p className="text-xs text-muted">Tests: {a.statement}</p> : null}
        </div>
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <div><dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-faint">Method</dt><dd>{label(EXPERIMENT_METHODS, x.method)}</dd></div>
        <div><dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-faint">Right if</dt><dd>{x.successCriteria}</dd></div>
        {x.sampleTarget ? <div><dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-faint">Sample</dt><dd>{x.sampleTarget}</dd></div> : null}
      </dl>
      {x.learning ? <p className="rounded-[12px] bg-bg-subtle px-3 py-2 text-sm leading-6"><b>Learned:</b> {x.learning}</p> : null}
      <div className="flex items-center gap-2 text-xs text-faint">
        <Avatar name={x.authorName} size={20} /> {first(x.authorName)} · {timeAgo(x.completedAt ?? x.createdAt)}
        {x.evidenceIds.length ? ` · ${x.evidenceIds.length} evidence` : ""}
      </div>
      {onRecord ? <Button block onClick={onRecord}>Record the result</Button> : null}
    </Card>
  );
}
