import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { createOwnerClass, getOwnerPage, type OwnerPageData } from "@/lib/server/classes";
import { formatPhone } from "@/lib/phone";
import { Button } from "@/components/ui/button";
import { Card, EmptyNote } from "@/components/ui/badge";
import { FormMessages } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/input";
import { LogoMark } from "@/components/ui/sticker";
import { LecturersSection } from "@/components/owner/LecturersSection";
import { LookAround } from "@/components/owner/LookAround";

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
 * The platform owner's page: look around as each role, keep the list of
 * classes, and make lecturer logins. Protected by OWNER_ACCESS_CODE, kept in
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
            <span className="border-l border-line-strong pl-2.5 text-sm font-semibold text-muted">Owner</span>
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
        Look around the app, add classes and lecturers. Enter the owner access code.
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
  return (
    <div className="space-y-10">
      <LookAround ownerCode={ownerCode} />
      {!page.smsLive ? <HeldTexts page={page} reload={reload} /> : null}
      <ClassesSection page={page} ownerCode={ownerCode} reload={reload} />
      {/* Remounts when a class is added, so it can be ticked straight away. */}
      <LecturersSection key={page.classes.length} ownerCode={ownerCode} />
    </div>
  );
}

/**
 * Until the Arkesel account is connected, sign-in codes are not texted: they
 * wait here, so the owner can sign in (or help someone sign in) meanwhile.
 */
function HeldTexts({ page, reload }: { page: OwnerPageData; reload: () => Promise<void> }) {
  return (
    <section className="rounded-[14px] border border-gold bg-gold-soft p-4">
      <h2 className="font-display text-xl font-extrabold">Texts are not switched on yet</h2>
      <p className="mt-1 text-sm leading-6 text-ink-soft">
        Sign-in codes are not sent by SMS until the Arkesel account is connected (ARKESEL_API_KEY and ARKESEL_SENDER_ID
        in Vercel). Until then they appear here for 10 minutes.
      </p>
      {page.heldTexts.length ? (
        <ul className="mt-3 divide-y divide-gold/40">
          {page.heldTexts.map((t) => (
            <li key={`${t.phone}-${t.at}`} className="py-2 text-sm">
              <span className="font-semibold">{formatPhone(t.phone)}</span>{" "}
              <span className="text-muted">· {new Date(t.at).toLocaleTimeString()}</span>
              <p className="font-mono">{t.message.split(" ")[0]}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">No codes waiting.</p>
      )}
      <Button variant="secondary" size="sm" className="mt-3" onClick={() => void reload()}>
        Check again
      </Button>
    </section>
  );
}

function ClassesSection({ page, ownerCode, reload }: { page: OwnerPageData; ownerCode: string; reload: () => Promise<void> }) {
  const [courseId, setCourseId] = useState(page.courses[0]?.id ?? "");
  const [programme, setProgramme] = useState("");
  const [level, setLevel] = useState("");
  const [semester, setSemester] = useState(page.defaults.semester);
  const [academicYear, setAcademicYear] = useState(page.defaults.academicYear);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createOwnerClass({ data: { ownerCode, courseId, programme, level, semester, academicYear } });
      setProgramme("");
      setLevel("");
      await reload();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-2xl font-extrabold">Classes</h2>
        <p className="text-sm text-muted">
          Students choose their class from this list when they fill in their details. Group leaders start groups within
          a class and invite the members.
        </p>
      </div>
      {page.classes.length ? (
        <ul className="divide-y divide-line rounded-[14px] border border-line bg-bg-elevated">
          {page.classes.map((c) => (
            <li key={c.offeringId} className="px-4 py-3">
              <p className="font-semibold">{c.label}</p>
              <p className="text-sm text-muted">
                {c.groups} {c.groups === 1 ? "group" : "groups"} · {c.students} {c.students === 1 ? "student" : "students"}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyNote>No classes yet. Add the first one below.</EmptyNote>
      )}
      <Card>
        <form className="space-y-3" onSubmit={(e) => void create(e)}>
          <h3 className="font-display text-lg font-extrabold">Add a class</h3>
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
          ) : null}
          <Field label="Programme">
            <Input value={programme} onChange={(e) => setProgramme(e.target.value)} placeholder="BSc Business Administration" />
          </Field>
          <Field label="Level">
            <Input value={level} onChange={(e) => setLevel(e.target.value)} placeholder="Level 300" />
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
          <Button type="submit" size="lg" className="w-full" disabled={busy || !programme.trim() || !level.trim() || !courseId}>
            {busy ? "Adding…" : "Add class"}
          </Button>
        </form>
      </Card>
    </section>
  );
}
