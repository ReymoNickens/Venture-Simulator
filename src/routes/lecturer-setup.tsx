import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { createLecturerAccount } from "@/lib/auth/client";
import { checkLecturerCode, joinAsLecturer } from "@/lib/server/lecturers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/badge";
import { FormMessages } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/input";
import { LogoMark } from "@/components/ui/sticker";

export const Route = createFileRoute("/lecturer-setup")({ component: LecturerSetup });

function message(err: unknown) {
  return err instanceof Error ? err.message : "Something went wrong. Check your connection and try again.";
}

/** A lecturer's first visit: redeem the invite code, then create the account. */
function LecturerSetup() {
  const [step, setStep] = useState<"code" | "you">("code");
  const [code, setCode] = useState("");
  const [classes, setClasses] = useState<string[]>([]);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function check(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setClasses((await checkLecturerCode({ data: { code } })).classes);
      setStep("you");
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  async function finish(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await joinAsLecturer({ data: { code, fullName, email } });
      await createLecturerAccount({ email: r.email, password, fullName });
      window.location.href = "/lecturer";
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh text-ink">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
        <LogoMark full className="mb-5" />
        <p className="text-xs font-semibold text-muted">Lecturer setup · step {step === "code" ? 1 : 2} of 2</p>
        {step === "code" ? (
          <>
            <h1 className="mt-1 font-display text-4xl font-semibold">Welcome, lecturer</h1>
            <p className="mt-2 text-[15px] leading-6 text-muted">
              Enter the invite code you were sent. It looks like <span className="font-mono">LEC-K7M2-QX4P</span>.
            </p>
            <Card className="mt-6">
              <form className="space-y-3" onSubmit={(e) => void check(e)}>
                <Field label="Invite code">
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    autoCapitalize="characters"
                    autoComplete="off"
                    placeholder="LEC-____-____"
                    className="h-13 font-mono text-lg tracking-wider"
                  />
                </Field>
                <FormMessages error={error} />
                <Button type="submit" size="lg" className="w-full" disabled={busy || code.trim().length < 8}>
                  {busy ? "Checking…" : "Continue"} <ArrowRight className="size-4" aria-hidden />
                </Button>
              </form>
            </Card>
          </>
        ) : (
          <>
            <h1 className="mt-1 font-display text-4xl font-semibold">Your account</h1>
            <div className="mt-3 rounded-[14px] bg-bg-subtle p-3 text-sm">
              <p className="font-semibold">You will see:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-soft">
                {classes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
            <Card className="mt-4">
              <form className="space-y-3" onSubmit={(e) => void finish(e)}>
                <Field label="Your name, as students should see it" hint="e.g. Dr Ama Owusu">
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
                </Field>
                <Field label="Email" hint="You will sign in with this.">
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                </Field>
                <Field label="Choose a password" hint="At least 8 characters.">
                  <Input
                    type="password"
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </Field>
                <FormMessages error={error} />
                <div className="flex gap-2 pt-1">
                  <Button type="button" variant="secondary" size="lg" className="w-13 px-0" aria-label="Back" disabled={busy} onClick={() => setStep("code")}>
                    <ArrowLeft className="size-5" aria-hidden />
                  </Button>
                  <Button
                    type="submit"
                    size="lg"
                    className="flex-1"
                    disabled={busy || !fullName.trim() || !email.trim() || password.length < 8}
                  >
                    {busy ? "Setting up…" : "Create my account"}
                  </Button>
                </div>
              </form>
            </Card>
          </>
        )}
        <Link to="/login" className="mt-6 inline-flex min-h-11 items-center text-sm text-muted">
          Already have an account? Sign in
        </Link>
      </div>
    </main>
  );
}
