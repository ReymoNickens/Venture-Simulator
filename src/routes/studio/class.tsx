import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Copy, Download, FileSpreadsheet, Search, Upload, UserPlus, X } from "lucide-react";
import { getMyClass, removeClassMember, uploadClassList, type MyClassData } from "@/lib/server/classes";
import type { ImportOutcome } from "@/lib/classes/service";
import { parseCsv, rowsToPeople, type SheetResult } from "@/lib/classes/sheet";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { Button } from "@/components/ui/button";
import { Card, EmptyNote } from "@/components/ui/badge";
import { FormMessages, Loading } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/input";
import { Stamp } from "@/components/ui/stamp";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/studio/class")({ component: ClassListPage });

function message(err: unknown) {
  return err instanceof Error ? err.message : "Something went wrong. Check your connection and try again.";
}

async function readFile(file: File): Promise<SheetResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) return rowsToPeople(parseCsv(await file.text()));
  if (name.endsWith(".xls")) {
    return {
      people: [],
      problems: [],
      fatal: "That is an old .xls file. In Excel choose File → Save As → Excel Workbook (.xlsx), then upload that.",
    };
  }
  // Loaded only when a rep actually uploads, so students never download it.
  const { readSheet } = await import("read-excel-file/browser");
  return rowsToPeople(await readSheet(file));
}

function ClassListPage() {
  const { refresh: refreshWorkspace } = useStudioWorkspace();
  const [data, setData] = useState<MyClassData | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await getMyClass());
    } catch (err) {
      setError(message(err));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (data === undefined) return error ? <FormMessages error={error} /> : <Loading />;
  if (data === null) {
    return (
      <div className="pt-2">
        <h1 className="font-display text-3xl font-extrabold">Class list</h1>
        <EmptyNote>Only your class’s course rep can manage the class list.</EmptyNote>
      </div>
    );
  }

  const { info, members } = data;
  const activated = members.filter((m) => m.activated).length;
  const reload = async () => {
    await load();
    await refreshWorkspace();
  };

  return (
    <div className="flow-enter space-y-5 pt-2">
      <div>
        <p className="text-xs font-semibold text-muted">
          You are the course rep · {info.semester} {info.academicYear}
        </p>
        <h1 className="font-display text-[32px] leading-none font-extrabold">Your class list</h1>
        <p className="mt-2 text-[15px] text-ink-soft">
          {info.courseCode} · {info.programme} · {info.level}
        </p>
      </div>

      <div className="rounded-[22px] bg-ink p-5 text-white">
        <p className="text-xs text-white/60">Activated so far</p>
        <p className="font-display text-4xl font-extrabold tabular-nums">
          {activated} <span className="text-xl text-white/60">of {members.length}</span>
        </p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/20" aria-hidden>
          <div className="h-full rounded-full bg-gold" style={{ width: `${(activated / Math.max(1, members.length)) * 100}%` }} />
        </div>
      </div>

      <UploadCard onDone={reload} firstTime={members.length <= 1} />
      {members.length > 1 ? <ShareCard /> : null}
      <AddOne onDone={reload} />
      <MemberList data={data} onChanged={reload} />
    </div>
  );
}

function UploadCard({ onDone, firstTime }: { onDone: () => Promise<void>; firstTime: boolean }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<SheetResult | null>(null);
  const [results, setResults] = useState<ImportOutcome[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(file: File | undefined) {
    if (!file) return;
    setError(null);
    setResults(null);
    setFileName(file.name);
    try {
      setParsed(await readFile(file));
    } catch {
      setParsed({ people: [], problems: [], fatal: "Could not read that file. Upload the filled-in Excel template (.xlsx) or a .csv." });
    }
  }

  async function upload() {
    if (!parsed?.people.length) return;
    setBusy(true);
    setError(null);
    try {
      setResults(await uploadClassList({ data: { people: parsed.people } }));
      setParsed(null);
      setFileName(null);
      await onDone();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  const added = results?.filter((r) => r.status === "added").length ?? 0;
  const updated = results?.filter((r) => r.status === "updated").length ?? 0;
  const skipped = results?.filter((r): r is Extract<ImportOutcome, { status: "skipped" }> => r.status === "skipped") ?? [];

  return (
    <Card className="space-y-4">
      <h2 className="font-display text-xl font-bold">{firstTime ? "Add your class" : "Upload again"}</h2>
      <ol className="space-y-3 text-[15px] leading-6">
        <li className="flex gap-3">
          <Num n={1} />
          <div className="min-w-0 flex-1">
            <p>Download the Excel template.</p>
            <a
              href="/templates/class-list-template.xlsx"
              download="ENT302-class-list.xlsx"
              className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong px-4 text-sm font-semibold"
            >
              <Download className="size-4" aria-hidden /> Class list template (.xlsx)
            </a>
          </div>
        </li>
        <li className="flex gap-3">
          <Num n={2} />
          <p className="min-w-0 flex-1">
            Fill in one student per row: full name, index number and email, exactly as on the register. Include everyone,
            yourself too. You can upload again later to add or fix people.
          </p>
        </li>
        <li className="flex gap-3">
          <Num n={3} />
          <div className="min-w-0 flex-1">
            <p>Upload it here.</p>
            <label className="mt-2 flex min-h-14 cursor-pointer items-center gap-3 rounded-[16px] border-2 border-dashed border-line-strong bg-bg-subtle px-4 py-3 text-sm font-semibold focus-within:ring-2 focus-within:ring-accent/40">
              <FileSpreadsheet className="size-6 shrink-0 text-mint" aria-hidden />
              <span className="min-w-0 truncate">{fileName ?? "Choose the filled-in file"}</span>
              <input
                type="file"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                className="sr-only"
                onChange={(e) => {
                  void choose(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </li>
      </ol>

      {parsed ? (
        <div className="flow-enter space-y-3 rounded-[16px] border border-ink p-4">
          {parsed.fatal ? (
            <FormMessages error={parsed.fatal} />
          ) : (
            <>
              <p className="text-[15px]">
                <strong>{parsed.people.length}</strong> {parsed.people.length === 1 ? "student is" : "students are"} ready to
                add.
                {parsed.problems.length ? (
                  <>
                    {" "}
                    <strong className="text-clay">{parsed.problems.length}</strong>{" "}
                    {parsed.problems.length === 1 ? "row needs" : "rows need"} fixing in the sheet first:
                  </>
                ) : null}
              </p>
              {parsed.problems.length ? <RowProblems items={parsed.problems} /> : null}
              <Button size="lg" className="w-full" disabled={busy || !parsed.people.length} onClick={() => void upload()}>
                <Upload className="size-4" aria-hidden />
                {busy ? "Adding…" : `Add ${parsed.people.length} ${parsed.people.length === 1 ? "student" : "students"}`}
              </Button>
              {parsed.problems.length ? (
                <p className="text-xs leading-5 text-muted">
                  You can add the good rows now and upload the fixed rows later. Nobody is added twice.
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {results ? (
        <div className="flow-enter space-y-2 rounded-[16px] bg-mint-soft p-4" role="status">
          <p className="flex items-center gap-2 font-semibold text-mint">
            <Check className="size-4" aria-hidden /> Done: {added} added{updated ? `, ${updated} corrected` : ""}
            {skipped.length ? `, ${skipped.length} not changed` : ""}.
          </p>
          {skipped.length ? <RowProblems items={skipped} /> : null}
        </div>
      ) : null}
      <FormMessages error={error} />
    </Card>
  );
}

function RowProblems({ items }: { items: { row: number; reason: string }[] }) {
  return (
    <ul className="max-h-56 space-y-1 overflow-y-auto rounded-[12px] bg-bg-elevated p-3 text-sm">
      {items.map((p) => (
        <li key={`${p.row}-${p.reason}`} className="flex gap-2">
          <span className="w-14 shrink-0 font-mono text-xs leading-6 text-muted">Row {p.row}</span>
          <span className="leading-6">{p.reason}</span>
        </li>
      ))}
    </ul>
  );
}

function Num({ n }: { n: number }) {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gold font-display text-sm font-bold">
      {n}
    </span>
  );
}

function ShareCard() {
  const [copied, setCopied] = useState(false);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const text = [
    `Our ENT 302 class list is now on the Experiential Venture Platform.`,
    ``,
    `To get in:`,
    `1. Open ${origin}/login`,
    `2. Tap "First time here? Activate your account"`,
    `3. Enter your email and index number exactly as on the class list, and choose a password.`,
    ``,
    `If it says you are not on the list, send me your email and index number and I will add you.`,
  ].join("\n");
  return (
    <Card className="space-y-3">
      <h2 className="font-display text-xl font-bold">Tell your class</h2>
      <p className="text-[15px] leading-6 text-ink-soft">Post this in your class WhatsApp group.</p>
      <Button
        size="lg"
        variant="gold"
        className="w-full"
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
      >
        {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        {copied ? "Copied" : "Copy WhatsApp message"}
      </Button>
      <details>
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-muted">See the message</summary>
        <pre className="rounded-[14px] bg-bg-subtle p-3 text-xs leading-5 whitespace-pre-wrap text-ink-soft">{text}</pre>
      </details>
    </Card>
  );
}

function AddOne({ onDone }: { onDone: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [indexNumber, setIndexNumber] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!open) {
    return (
      <Button variant="secondary" size="lg" className="w-full" onClick={() => setOpen(true)}>
        <UserPlus className="size-4" aria-hidden /> Add one student
      </Button>
    );
  }
  return (
    <Card className="flow-enter space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-bold">Add one student</h2>
        <button
          type="button"
          aria-label="Close"
          onClick={() => setOpen(false)}
          className="flex size-11 items-center justify-center rounded-full text-muted hover:bg-bg-subtle"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          setNotice(null);
          uploadClassList({ data: { people: [{ row: 1, fullName, indexNumber, email }] } })
            .then(async ([r]) => {
              if (r.status === "skipped") {
                setError(r.reason);
                return;
              }
              setNotice(`${fullName.trim()} ${r.status === "added" ? "added" : "corrected"}.`);
              setFullName("");
              setIndexNumber("");
              setEmail("");
              await onDone();
            })
            .catch((err: unknown) => setError(message(err)))
            .finally(() => setBusy(false));
        }}
      >
        <Field label="Full name">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label="Index number">
          <Input value={indexNumber} onChange={(e) => setIndexNumber(e.target.value)} placeholder="e.g. PS/ITC/22/0042" />
        </Field>
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <FormMessages error={error} notice={notice} />
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={busy || !fullName.trim() || !indexNumber.trim() || !email.trim()}
        >
          {busy ? "Adding…" : "Add to the class list"}
        </Button>
      </form>
    </Card>
  );
}

function MemberList({ data, onChanged }: { data: MyClassData; onChanged: () => Promise<void> }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "waiting">("all");
  const [error, setError] = useState<string | null>(null);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return data.members.filter(
      (m) =>
        (filter === "all" || !m.activated) &&
        (!t || m.fullName.toLowerCase().includes(t) || m.indexNumber.toLowerCase().includes(t) || (m.email ?? "").includes(t)),
    );
  }, [data.members, q, filter]);
  const waiting = data.members.filter((m) => !m.activated).length;

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <h2 className="font-display text-xl font-bold">Everyone on the list</h2>
        <div className="flex gap-1 rounded-full bg-bg-subtle p-1 text-sm font-semibold">
          {(
            [
              ["all", `All ${data.members.length}`],
              ["waiting", `Not yet ${waiting}`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
              className={cn("min-h-9 rounded-full px-3", filter === id ? "bg-bg-elevated shadow-sm" : "text-muted")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {data.members.length > 8 ? (
        <label className="relative block">
          <span className="sr-only">Search the class list</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, index or email" className="pl-9" />
        </label>
      ) : null}
      <FormMessages error={error} />
      <ul className="divide-y divide-line rounded-[18px] border border-line bg-bg-elevated">
        {shown.map((m) => (
          <li key={m.studentId} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">
                {m.fullName} {m.isRep ? <Stamp tone="indigo" size="xs">rep</Stamp> : null}
              </p>
              <p className="truncate font-mono text-xs text-muted">
                {m.indexNumber} · {m.email}
              </p>
            </div>
            {m.activated ? (
              <Stamp tone="forest" size="xs">
                activated
              </Stamp>
            ) : (
              <Stamp tone="muted" size="xs">
                not yet
              </Stamp>
            )}
            {!m.activated && !m.isRep ? (
              <button
                type="button"
                aria-label={`Remove ${m.fullName} from the list`}
                className="flex size-11 shrink-0 items-center justify-center rounded-full text-faint hover:bg-clay-soft hover:text-clay"
                onClick={() => {
                  if (!window.confirm(`Remove ${m.fullName} (${m.indexNumber}) from the class list?`)) return;
                  setError(null);
                  removeClassMember({ data: { studentId: m.studentId } })
                    .then(onChanged)
                    .catch((err: unknown) => setError(message(err)));
                }}
              >
                <X className="size-4" aria-hidden />
              </button>
            ) : (
              <span className="size-11 shrink-0" aria-hidden />
            )}
          </li>
        ))}
        {!shown.length ? <li className="px-4 py-5 text-center text-sm text-muted">Nobody matches.</li> : null}
      </ul>
      <p className="text-xs leading-5 text-muted">
        Someone who has activated stays on the list. A typo in a name can be fixed by uploading again; to change an
        activated student’s details, contact the platform owner.{" "}
        <Link to="/studio" className="font-semibold underline underline-offset-2">
          Back to Today
        </Link>
      </p>
    </section>
  );
}
