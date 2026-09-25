import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, BookOpenCheck, GraduationCap } from "lucide-react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { listOfferings } from "@/lib/server/workspace";
import { upsertProfile } from "@/lib/server/mutations";
import { claimLecturerRole, getMyRoles } from "@/lib/server/lecturer";
import type { CourseOffering } from "@/lib/domain/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Card } from "@/components/ui/badge";
import { Logo } from "@/components/shell/AppShell";

type Role = "student" | "lecturer";

export const Route = createFileRoute("/onboarding")({
  component: Onboarding,
  validateSearch: (s: Record<string, unknown>): { role?: Role } => (s.role === "student" || s.role === "lecturer" ? { role: s.role } : {}),
});

function Onboarding() {
  const { user, isPending } = useCurrentUserState();
  const search = Route.useSearch();
  const [role, setRole] = useState<Role | null>(search.role ?? null);
  const [offerings, setOfferings] = useState<CourseOffering[]>([]);
  const [demoCode, setDemoCode] = useState(false);

  useEffect(() => {
    if (!user) return;
    void listOfferings().then(setOfferings);
    void getMyRoles().then((r) => setDemoCode(r.demoCodeAvailable));
  }, [user]);

  if (isPending) return <div className="min-h-dvh bg-bg" />;
  if (!user) return <RedirectToSignIn />;

  return (
    <main className="paper-grain min-h-dvh bg-bg text-ink">
      <div className="mx-auto max-w-md px-4 py-8">
        <Logo />
        {!role ? (
          <div className="mt-10 animate-rise space-y-5">
            <div>
              <h1 className="font-display text-[2rem] leading-tight">Akwaaba{user.displayName ? `, ${user.displayName.split(" ")[0]}` : ""}.</h1>
              <p className="mt-2 text-[15px] leading-6 text-muted">How will you use the studio?</p>
            </div>
            <RoleButton icon={<BookOpenCheck className="size-6" />} title="I'm a student" body="Find a real problem, build a venture with your group, and test it with evidence." onClick={() => setRole("student")} />
            <RoleButton icon={<GraduationCap className="size-6" />} title="I'm a lecturer" body="See every group's progress, who's contributing, and where they're stuck." onClick={() => setRole("lecturer")} dark />
          </div>
        ) : role === "student" ? (
          <StudentForm offerings={offerings} defaultName={user.displayName ?? ""} onBack={() => setRole(null)} />
        ) : (
          <LecturerForm offerings={offerings} demoCode={demoCode} onBack={() => setRole(null)} />
        )}
      </div>
    </main>
  );
}

function RoleButton({ icon, title, body, onClick, dark }: { icon: React.ReactNode; title: string; body: string; onClick: () => void; dark?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        dark
          ? "flex w-full items-start gap-4 rounded-[22px] bg-night p-5 text-left text-accent-fg shadow-[var(--shadow-lift)] transition-transform active:scale-[0.99]"
          : "flex w-full items-start gap-4 rounded-[22px] border border-line bg-bg-elevated p-5 text-left shadow-[var(--shadow-card)] transition-transform active:scale-[0.99]"
      }
    >
      <span className={dark ? "grid size-12 shrink-0 place-items-center rounded-full bg-sun text-night" : "grid size-12 shrink-0 place-items-center rounded-full bg-accent-soft text-accent"}>{icon}</span>
      <span>
        <span className="block font-display text-xl">{title}</span>
        <span className={dark ? "mt-1 block text-sm leading-6 text-accent-fg/75" : "mt-1 block text-sm leading-6 text-muted"}>{body}</span>
      </span>
    </button>
  );
}

function OfferingSelect({ offerings, value, onChange }: { offerings: CourseOffering[]; value: string; onChange: (v: string) => void }) {
  return (
    <Field label="Course">
      <Select required value={value} onChange={(e) => onChange(e.target.value)}>
        {offerings.map((o) => (
          <option key={o.id} value={o.id}>
            {o.courseCode} · {o.courseName} · {o.semester} {o.academicYear}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function StudentForm({ offerings, defaultName, onBack }: { offerings: CourseOffering[]; defaultName: string; onBack: () => void }) {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState(defaultName);
  const [indexNumber, setIndexNumber] = useState("");
  const [programme, setProgramme] = useState("");
  const [offeringId, setOfferingId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!offeringId && offerings[0]) setOfferingId(offerings[0].id);
  }, [offerings, offeringId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await upsertProfile({ data: { fullName, indexNumber, programme, offeringId } });
      await navigate({ to: "/studio" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-8 animate-rise space-y-5">
      <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="size-4" /> Back</Button>
      <div>
        <h1 className="font-display text-[2rem] leading-tight">About you</h1>
        <p className="mt-2 text-sm leading-6 text-muted">So your lecturer can recognise your work. Your index number is not a password.</p>
      </div>
      <Card>
        <form className="space-y-4" onSubmit={(e) => void submit(e)}>
          <Field label="Full name">
            <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
          </Field>
          <Field label="Index / student number">
            <Input required value={indexNumber} onChange={(e) => setIndexNumber(e.target.value)} placeholder="e.g. 10987654" inputMode="text" autoCapitalize="characters" />
          </Field>
          <Field label="Programme">
            <Input required value={programme} onChange={(e) => setProgramme(e.target.value)} placeholder="e.g. BSc Administration" />
          </Field>
          <OfferingSelect offerings={offerings} value={offeringId} onChange={setOfferingId} />
          {error ? <p role="alert" className="rounded-[12px] bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p> : null}
          <Button type="submit" block size="lg" disabled={saving || !offeringId}>
            {saving ? "Saving…" : "Enter the studio"}
          </Button>
        </form>
      </Card>
    </div>
  );
}

function LecturerForm({ offerings, demoCode, onBack }: { offerings: CourseOffering[]; demoCode: boolean; onBack: () => void }) {
  const navigate = useNavigate();
  const [offeringId, setOfferingId] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!offeringId && offerings[0]) setOfferingId(offerings[0].id);
  }, [offerings, offeringId]);

  return (
    <div className="mt-8 animate-rise space-y-5">
      <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="size-4" /> Back</Button>
      <div>
        <h1 className="font-display text-[2rem] leading-tight">Join as a lecturer</h1>
        <p className="mt-2 text-sm leading-6 text-muted">Enter the lecturer code for your course. You'll see only that course's groups.</p>
      </div>
      <Card>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            setError(null);
            try {
              await claimLecturerRole({ data: { offeringId, code } });
              await navigate({ to: "/teach" });
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not join.");
            } finally {
              setSaving(false);
            }
          }}
        >
          <OfferingSelect offerings={offerings} value={offeringId} onChange={setOfferingId} />
          <Field label="Lecturer code" hint={demoCode ? "Preview build: use DEMO-LECTURER to try it." : "From your course administrator."}>
            <Input required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" className="font-mono uppercase tracking-wider" />
          </Field>
          {error ? <p role="alert" className="rounded-[12px] bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p> : null}
          <Button type="submit" block size="lg" variant="dark" disabled={saving || !offeringId || !code.trim()}>
            {saving ? "Checking…" : "Open my cohort"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
