import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { useStaff } from "@/hooks/lecturer-context";
import { errorMessage, useAction } from "@/hooks/use-action";
import { getCohort, getGradebook, postAnnouncement, releaseMarketEvent, setMilestone } from "@/lib/server/lecturer";
import { STAGES } from "@/lib/domain/stages";
import { MARKET_EVENTS } from "@/lib/domain/market-events";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow, EmptyNote } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Emblem } from "@/components/ui/emblem";
import { FormMessages, Loading } from "@/components/ui/feedback";
import { shortDate, shortDateTime } from "@/lib/dates";

export const Route = createFileRoute("/lecturer/course")({ component: CoursePage });

type Cohort = Awaited<ReturnType<typeof getCohort>>;

function CoursePage() {
  const { offeringId } = useStaff();
  const [data, setData] = useState<Cohort | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    if (!offeringId) return;
    getCohort({ data: { offeringId } }).then(setData, (e) => setError(errorMessage(e)));
  }, [offeringId]);
  useEffect(load, [load]);
  if (error) return <FormMessages error={error} />;
  if (!data) return <Loading />;
  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>Course set-up</Eyebrow>
        <h1 className="mt-1 font-display text-3xl font-extrabold">Pace, voice and pressure</h1>
        <p className="mt-1 max-w-[70ch] text-sm leading-6 text-muted">
          Deadlines set the pace for the whole cohort. Announcements reach every student’s Today screen.
          Market shocks bring the real world in — every student answers individually.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Milestones offeringId={offeringId} data={data} onSaved={load} />
        <div className="space-y-6">
          <Announce offeringId={offeringId} data={data} onSaved={load} />
          <Gradebook offeringId={offeringId} />
        </div>
      </div>
      <Shocks offeringId={offeringId} data={data} onSaved={load} />
    </div>
  );
}

function toLocalInput(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function Milestones({ offeringId, data, onSaved }: { offeringId: string; data: Cohort; onSaved: () => void }) {
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(STAGES.map((s) => [s.id, toLocalInput(data.milestones.find((m) => m.stage === s.id)?.dueAt)])),
  );
  const { pending, error, notice, run } = useAction();
  return (
    <Card as="section" className="space-y-3">
      <Eyebrow>Milestones</Eyebrow>
      <p className="text-xs text-muted">Due at 23:59 on the chosen day. Leave blank for no deadline.</p>
      <ul className="space-y-2">
        {STAGES.map((s) => (
          <li key={s.id} className="grid grid-cols-[1.5rem_1fr_9.5rem] items-center gap-2 text-sm">
            <Emblem emblem={s.emblem} className="size-5 text-gold-deep" />
            <span>
              {s.stop}. {s.title}
            </span>
            <Input
              type="date"
              aria-label={`Due date for ${s.title}`}
              value={draft[s.id] ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, [s.id]: e.target.value }))}
              className="h-9 text-sm"
            />
          </li>
        ))}
      </ul>
      <FormMessages error={error} notice={notice} />
      <Button
        disabled={Boolean(pending)}
        onClick={() =>
          void run(
            "save",
            async () => {
              for (const s of STAGES) {
                const before = toLocalInput(data.milestones.find((m) => m.stage === s.id)?.dueAt);
                const after = draft[s.id] ?? "";
                if (before === after) continue;
                await setMilestone({
                  data: { offeringId, stage: s.id, dueAt: after ? new Date(`${after}T23:59:00`).toISOString() : null },
                });
              }
              onSaved();
            },
            "Milestones saved. Students see them on the route and each stop.",
          )
        }
      >
        {pending ? "Saving…" : "Save milestones"}
      </Button>
    </Card>
  );
}

function Announce({ offeringId, data, onSaved }: { offeringId: string; data: Cohort; onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const { pending, error, notice, run } = useAction();
  return (
    <Card as="section" className="space-y-3">
      <Eyebrow>Announce to the cohort</Eyebrow>
      <Field label="Title">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Interview week starts Monday" />
      </Field>
      <Field label="Message">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <FormMessages error={error} notice={notice} />
      <Button
        disabled={Boolean(pending)}
        onClick={() =>
          void run(
            "post",
            async () => {
              await postAnnouncement({ data: { offeringId, title, body } });
              setTitle("");
              setBody("");
              onSaved();
            },
            "Posted.",
          )
        }
      >
        Post announcement
      </Button>
      {data.announcements.length ? (
        <ul className="space-y-2 border-t border-line pt-3 text-sm">
          {data.announcements.slice(0, 5).map((a) => (
            <li key={a.id}>
              <p className="font-semibold">{a.title}</p>
              <p className="text-xs text-muted">{a.staffName} · {shortDateTime(a.createdAt)}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

function Shocks({ offeringId, data, onSaved }: { offeringId: string; data: Cohort; onSaved: () => void }) {
  const [days, setDays] = useState(3);
  const [target, setTarget] = useState("");
  const { pending, error, notice, run } = useAction();
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>Market shocks</Eyebrow>
          <h2 className="font-display text-2xl font-extrabold">Bring the real world in</h2>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Send to">
            <Select value={target} onChange={(e) => setTarget(e.target.value)} className="h-9 w-56 text-sm">
              <option value="">Every group</option>
              {data.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  Group {g.groupNumber} · {g.ventureName ?? g.groupName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Answer within (days)">
            <Input type="number" min={1} max={30} value={days} onChange={(e) => setDays(Number(e.target.value) || 3)} className="h-9 w-24 text-sm" />
          </Field>
        </div>
      </div>
      <FormMessages error={error} notice={notice} />
      <ul className="grid gap-3 md:grid-cols-2">
        {MARKET_EVENTS.map((e) => {
          const sent = data.events.filter((x) => x.eventKey === e.key);
          return (
            <li key={e.key} className="flex flex-col rounded-[10px] border-2 border-clay/60 bg-bg-elevated p-3">
              <p className="font-display text-base font-bold">{e.title}</p>
              <p className="mt-1 flex-1 text-sm text-ink-soft">{e.body}</p>
              <p className="mt-1 text-xs text-muted italic">{e.prompt}</p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-xs text-muted">
                  {sent.length ? `Sent ${shortDate(sent[0].createdAt)} · ${sent.reduce((n, s) => n + s.responses, 0)} answers` : "Not sent"}
                </span>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={Boolean(pending)}
                  onClick={() =>
                    void run(
                      e.key,
                      async () => {
                        await releaseMarketEvent({ data: { offeringId, eventKey: e.key, groupId: target || null, respondInDays: days } });
                        onSaved();
                      },
                      `Released: ${e.title}`,
                    )
                  }
                >
                  Release
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Gradebook({ offeringId }: { offeringId: string }) {
  const { pending, error, run } = useAction();
  return (
    <Card as="section" className="space-y-2">
      <Eyebrow>Gradebook export</Eyebrow>
      <p className="text-sm text-muted">
        One row per student: stops done, contributions, evidence, interviews, reflections, market-shock answers
        and confidential peer ratings. The platform gives you evidence; the marks are yours.
      </p>
      <FormMessages error={error} />
      <Button
        variant="secondary"
        disabled={Boolean(pending)}
        onClick={() =>
          void run("csv", async () => {
            const rows = await getGradebook({ data: { offeringId } });
            if (!rows.length) throw new Error("No students enrolled yet.");
            const headers = Object.keys(rows[0]) as (keyof (typeof rows)[number])[];
            const esc = (v: unknown) => {
              const s = v === null || v === undefined ? "" : String(v);
              return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
            };
            const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
            const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = `gradebook-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          })
        }
      >
        <Download className="size-4" aria-hidden /> {pending ? "Preparing…" : "Download CSV"}
      </Button>
      {!offeringId ? <EmptyNote>No course selected.</EmptyNote> : null}
    </Card>
  );
}
