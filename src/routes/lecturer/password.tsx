import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/badge";
import { FormMessages } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/input";

export const Route = createFileRoute("/lecturer/password")({ component: ChangePassword });

/** A lecturer replaces the password the owner sent them with their own. */
function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (next !== again) {
      setError("The two new passwords are not the same.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true });
    setBusy(false);
    if (err) {
      setError(err.status === 400 || err.status === 401 ? "Your current password is not right." : err.message || "Could not change the password.");
      return;
    }
    setDone(true);
  }

  return (
    <div className="mx-auto max-w-md space-y-4 pt-2">
      <Link to="/lecturer" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted">
        <ArrowLeft className="size-4" aria-hidden /> Back
      </Link>
      <h1 className="font-display text-3xl font-extrabold">Change your password</h1>
      {done ? (
        <Card>
          <p className="text-[15px] leading-6">Done. Use your new password next time you sign in.</p>
        </Card>
      ) : (
        <Card>
          <form className="space-y-3" onSubmit={(e) => void submit(e)}>
            <Field label="Current password" hint="The one you were sent, if you haven’t changed it before.">
              <Input type="password" required value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
            </Field>
            <Field label="New password" hint="At least 8 characters.">
              <Input type="password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
            </Field>
            <Field label="New password again">
              <Input type="password" required minLength={8} value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" />
            </Field>
            <FormMessages error={error} />
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? "Saving…" : "Change password"}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
