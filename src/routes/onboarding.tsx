import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getWorkspace, listOfferings } from "@/lib/server/workspace";
import { upsertProfile } from "@/lib/server/mutations";
import type { CourseOffering } from "@/lib/domain/types";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Card } from "@/components/ui/badge";
import { APP_NAME } from "@/lib/brand";

export const Route = createFileRoute("/onboarding")({ component: Onboarding });

function Onboarding() {
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const [offerings, setOfferings] = useState<CourseOffering[]>([]);
  const [fullName, setFullName] = useState(user?.displayName ?? "");
  const [indexNumber, setIndexNumber] = useState("");
  const [programme, setProgramme] = useState("");
  const [offeringId, setOfferingId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Set once at roster activation (or the dev/demo fallback below) and never
  // editable afterward — see upsertProfile.
  const [identityLocked, setIdentityLocked] = useState(false);

  useEffect(() => {
    if (!user) return;
    void listOfferings().then((rows) => {
      setOfferings(rows);
      if (rows[0]) setOfferingId(rows[0].id);
    });
    void getWorkspace().then(({ student }) => {
      if (!student) return;
      setFullName(student.fullName);
      setIndexNumber(student.indexNumber);
      setProgramme(student.programme);
      setIdentityLocked(true);
    });
  }, [user]);

  if (isPending) {
    return <div className="min-h-dvh bg-bg" />;
  }
  if (!user) return <RedirectToSignIn />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await upsertProfile({
        data: { fullName, indexNumber, programme, offeringId },
      });
      await navigate({ to: "/studio" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-dvh bg-bg pl-3 text-ink">
      <div className="mx-auto max-w-md px-5 py-10">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted">{APP_NAME}</p>
        <h1 className="mt-2 font-display text-3xl">Your academic identity</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          This is separate from how you signed in. Index numbers are not passwords, and they must be unique.
        </p>
        <Card className="mt-6">
          <form className="space-y-4" onSubmit={(e) => void submit(e)}>
            <Field label="Full name" hint={identityLocked ? "Set by your instructor's roster — not editable." : undefined}>
              <Input
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={identityLocked}
              />
            </Field>
            <Field
              label="Index number"
              hint={
                identityLocked
                  ? "Set by your instructor's roster — not editable."
                  : "Used as your academic identity, not as a login."
              }
            >
              <Input
                required
                value={indexNumber}
                onChange={(e) => setIndexNumber(e.target.value)}
                placeholder="e.g. 10987654"
                disabled={identityLocked}
              />
            </Field>
            <Field label="Programme">
              <Input
                required
                value={programme}
                onChange={(e) => setProgramme(e.target.value)}
                placeholder="e.g. Business Administration"
              />
            </Field>
            <Field label="Your course">
              <select
                required
                className="h-11 w-full rounded-[10px] border border-line bg-bg-elevated px-3 text-sm"
                value={offeringId}
                onChange={(e) => setOfferingId(e.target.value)}
              >
                {offerings.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.courseCode} · {o.courseName} · {o.semester} {o.academicYear}
                  </option>
                ))}
              </select>
            </Field>
            {error ? <p className="text-sm text-bad">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? "Saving…" : "Continue"}
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
