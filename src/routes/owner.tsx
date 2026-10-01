import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Copy, KeyRound } from "lucide-react";
import {
  createOwnerRepCode,
  getOwnerPage,
  revokeOwnerRepCode,
  type OwnerPageData,
} from "@/lib/server/classes";
import { Button } from "@/components/ui/button";
import { Card, EmptyNote } from "@/components/ui/badge";
import { FormMessages } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/input";
import { Stamp } from "@/components/ui/stamp";
import { LogoMark } from "@/components/ui/sticker";
import { LecturersSection } from "@/components/owner/LecturersSection";

export const Route = createFileRoute("/owner")({ component: OwnerPage });

const KEY = "owner-access-code";

function readSaved(): string {
  try {
    return sessionStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

function save(code: string | null) {
  try {
    if (code) sessionStorage.setItem(KEY, code);
    else sessionStorage.removeItem(KEY);
  } catch {
    // Private mode: the code just has to be typed again next visit.
  }
}

function message(err: unknown) {
  return err instanceof Error ? err.message : "Something went wrong. Try again.";
}

/**
 * The platform owner's page: hand out one-time setup codes to course reps
 * and see which classes are set up. Protected by OWNER_ACCESS_CODE, kept in
 * this tab only (sessionStorage), never in a cookie or the URL.
 */
function OwnerPage() {
  const [code, setCode] = useState("");
  const [page, setPage] = useState<OwnerPageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (ownerCode: string) => {
    setLoading(true);
    setError(null);
    try {
      setPage(await getOwnerPage({ data: { ownerCode } }));
      setCode(ownerCode);
      save(ownerCode);
    } catch (err) {
      setPage(null);
      save(null);
      setError(message(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const saved = readSaved();
    if (saved) void load(saved);
  }, [load]);

  return (
    <main className="min-h-dvh text-ink">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2.5">
            <LogoMark />
            <span className="font-display font-bold">Owner</span>
          </Link>
          {page ? (
            <button
              type="button"
              className="min-h-11 text-sm font-semibold text-muted"
              onClick={() => {
                save(null);
                setPage(null);
                setCode("");
              }}
            >
              Lock
            </button>
          ) : null}
        </div>
        {!page ? (
          <Unlock loading={loading} error={error} onUnlock={(c) => void load(c)} />
        ) : (
          <Dashboard page={page} ownerCode={code} reload={() => load(code)} />
        )}
      </div>
    </main>
  );
}

function Unlock({
  loading,
  error,
  onUnlock,
}: {
  loading: boolean;
  error: string | null;
  onUnlock: (code: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <div className="mx-auto max-w-md pt-10">
      <h1 className="font-display text-4xl font-extrabold">Owner page</h1>
      <p className="mt-2 text-[15px] leading-6 text-muted">
        Give course reps their setup codes and see which classes are ready. Enter the owner access code.
      </p>
      <Card className="mt-6">
        <form
          className="space-y-3"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (value.trim()) onUnlock(value.trim());
          }}
        >
          <Field label="Owner access code">
            <Input type="password" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" />
          </Field>
          <FormMessages error={error} />
          <Button type="submit" size="lg" className="w-full" disabled={loading || !value.trim()}>
            {loading ? "Checking…" : "Open"}
          </Button>
        </form>
      </Card>
    </div>
  );
}

function Dashboard({
  page,
  ownerCode,
  reload,
}: {
  page: OwnerPageData;
  ownerCode: string;
  reload: () => Promise<void>;
}) {
  const [courseId, setCourseId] = useState(page.courses[0]?.id ?? "");
  const [label, setLabel] = useState("");
  const [semester, setSemester] = useState(page.defaults.semester);
  const [academicYear, setAcademicYear] = useState(page.defaults.academicYear);
  const [fresh, setFresh] = useState<{ code: string; expiresAt: string; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const course = page.courses.find((c) => c.id === courseId);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await createOwnerRepCode({ data: { ownerCode, courseId, label, semester, academicYear } });
      setFresh({ code: r.code, expiresAt: r.expiresAt, label });
      setLabel("");
      await reload();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="font-display text-3xl font-extrabold">Set up a class</h1>
        <p className="mt-1 text-[15px] leading-6 text-muted">
          Make a code for each course rep. They use it once to set up their class and upload the class list. Nobody
          else needs to touch anything technical.
        </p>
        {fresh ? (
          <NewCode code={fresh.code} expiresAt={fresh.expiresAt} label={fresh.label} courseCode={course?.courseCode ?? ""} />
        ) : null}
        <Card className="mt-4">
          <form className="space-y-3" onSubmit={(e) => void create(e)}>
            {page.courses.length > 1 ? (
              <Field label="Course">
                <Select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                  {page.courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.courseCode} · {c.courseName}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <p className="text-sm">
                <span className="font-semibold">{course?.courseCode}</span>{" "}
                <span className="text-muted">· {course?.courseName}</span>
              </p>
            )}
            <Field label="Which class is this for?" hint="Only you see this note. The rep fills in the class details.">
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. BSc Business, Level 300 (rep: Kofi)"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Semester">
                <Input value={semester} onChange={(e) => setSemester(e.target.value)} />
              </Field>
              <Field label="Academic year">
                <Input value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} placeholder="2026/2027" />
              </Field>
            </div>
            <FormMessages error={error} />
            <Button type="submit" size="lg" className="w-full" disabled={busy || !label.trim() || !courseId}>
              {busy ? "Making code…" : "Make a setup code"}
            </Button>
          </form>
        </Card>
      </section>

      <LecturersSection ownerCode={ownerCode} />

      <section>
        <h2 className="font-display text-xl font-bold">Classes</h2>
        {page.classes.length ? (
          <ul className="mt-2 space-y-2">
            {page.classes.map((c) => (
              <li key={c.offeringId} className="rounded-[18px] border border-line bg-bg-elevated p-4">
                <p className="font-semibold">
                  {c.courseCode} · {c.programme ?? "Class"} {c.level ? `· ${c.level}` : ""}
                </p>
                <p className="text-sm text-muted">
                  {c.semester} {c.academicYear} · Rep: {c.repName ?? "—"}
                  {c.repEmail ? ` (${c.repEmail})` : ""}
                  {c.repActivated ? "" : " · rep has not activated yet"}
                </p>
                <p className="mt-2 text-sm">
                  <strong className="tabular-nums">{c.activated}</strong> of{" "}
                  <strong className="tabular-nums">{c.onList}</strong> on the list have activated
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-2">
            <EmptyNote>No classes yet. They appear here once a rep uses their code.</EmptyNote>
          </div>
        )}
      </section>

      <section>
        <h2 className="font-display text-xl font-bold">Codes</h2>
        {page.codes.length ? (
          <ul className="mt-2 divide-y divide-line rounded-[18px] border border-line bg-bg-elevated">
            {page.codes.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{c.label}</p>
                  <p className="text-xs text-muted">
                    {c.courseCode} · {c.semester} {c.academicYear}
                    {c.status === "waiting" ? ` · expires ${new Date(c.expiresAt).toLocaleDateString()}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Stamp
                    size="xs"
                    tone={c.status === "used" ? "forest" : c.status === "waiting" ? "gold" : "muted"}
                  >
                    {c.status === "waiting" ? "not used yet" : c.status}
                  </Stamp>
                  {c.status === "waiting" ? (
                    <button
                      type="button"
                      className="min-h-11 px-2 text-sm font-semibold text-clay"
                      onClick={() => {
                        if (!window.confirm(`Cancel the code for "${c.label}"? It will stop working.`)) return;
                        void revokeOwnerRepCode({ data: { ownerCode, id: c.id } }).then(reload, (err: unknown) =>
                          window.alert(message(err)),
                        );
                      }}
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-2">
            <EmptyNote>No codes yet.</EmptyNote>
          </div>
        )}
      </section>
    </div>
  );
}

function NewCode({
  code,
  expiresAt,
  label,
  courseCode,
}: {
  code: string;
  expiresAt: string;
  label: string;
  courseCode: string;
}) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const text = [
    `Hi! You are the course rep for ${courseCode} (${label}) on the Experiential Venture Platform.`,
    ``,
    `1. Open ${origin}/rep`,
    `2. Enter this setup code: ${code}`,
    `3. Fill in your class details, then upload the class list using the Excel template on that page.`,
    ``,
    `The code works once and expires on ${new Date(expiresAt).toLocaleDateString()}.`,
  ].join("\n");
  return (
    <div className="flow-enter tape mt-6 rounded-[22px] border-2 border-ink bg-bg-elevated p-5 pt-6">
      <p className="flex items-center gap-2 text-xs font-semibold text-muted">
        <KeyRound className="size-4" aria-hidden /> Setup code for {label}
      </p>
      <p className="mt-1 font-mono text-3xl font-medium tracking-wider">{code}</p>
      <p className="mt-1 text-sm text-muted">Shown only now. Send it to the rep before you leave this page.</p>
      <Button
        size="lg"
        variant="gold"
        className="mt-4 w-full"
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
      >
        {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        {copied ? "Copied, paste it into WhatsApp" : "Copy WhatsApp message"}
      </Button>
      <pre className="mt-3 rounded-[14px] bg-bg-subtle p-3 text-xs leading-5 whitespace-pre-wrap text-ink-soft">{text}</pre>
    </div>
  );
}

