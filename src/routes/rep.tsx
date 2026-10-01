import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { activateAccount, signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { checkRepCode, setUpClass } from "@/lib/server/classes";
import type { CodePreview } from "@/lib/classes/service";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card } from "@/components/ui/badge";
import { FormMessages } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/input";
import { LogoMark } from "@/components/ui/sticker";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/rep")({ component: RepSetup });

const LEVELS = ["Level 100", "Level 200", "Level 300", "Level 400"] as const;

function message(err: unknown) {
  return err instanceof Error ? err.message : "Something went wrong. Check your connection and try again.";
}

/**
 * A course rep's first visit: redeem the setup code, describe the class,
 * create their own account. Then they land on the class list page.
 */
function RepSetup() {
  const { user, isPending } = useCurrentUserState();
  const [step, setStep] = useState<"code" | "class" | "you">("code");
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<CodePreview | null>(null);
  const [programme, setProgramme] = useState("");
  const [level, setLevel] = useState("");
  const [fullName, setFullName] = useState("");
  const [indexNumber, setIndexNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function checkCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setPreview(await checkRepCode({ data: { code } }));
      setStep("class");
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
      const r = await setUpClass({ data: { code, programme, level, fullName, indexNumber, email } });
      await activateAccount({ email: r.email, indexNumber: r.indexNumber, password });
      window.location.href = "/studio/class";
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  }

  if (!isPending && user) {
    return (
      <Shell>
        <h1 className="font-display text-4xl font-extrabold">You are already signed in</h1>
        <p className="mt-2 text-[15px] leading-6 text-muted">
          A course rep sets up their class with a new account. If you are the rep and already set up your class, open
          your class list. Otherwise sign out first, then open the link from your setup message again.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link to="/studio/class" className={cn(buttonVariants({ size: "lg" }), "w-full")}>
            Open my class list
          </Link>
          <Button variant="secondary" size="lg" className="w-full" onClick={() => void signOut("/rep")}>
            Sign out
          </Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="text-xs font-semibold text-muted">
        Course rep setup · step {step === "code" ? 1 : step === "class" ? 2 : 3} of 3
      </p>
      {step === "code" ? (
        <>
          <h1 className="mt-1 font-display text-4xl font-extrabold">Set up your class</h1>
          <p className="mt-2 text-[15px] leading-6 text-muted">
            Enter the setup code you were sent. It looks like <span className="font-mono">REP-K7M2-QX4P</span>.
          </p>
          <Card className="mt-6">
            <form className="space-y-3" onSubmit={(e) => void checkCode(e)}>
              <Field label="Setup code">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  autoCapitalize="characters"
                  autoComplete="off"
                  placeholder="REP-____-____"
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
      ) : null}

      {step === "class" && preview ? (
        <>
          <h1 className="mt-1 font-display text-4xl font-extrabold">Your class</h1>
          <p className="mt-2 text-[15px] leading-6 text-muted">
            {preview.courseCode} · {preview.courseName} · {preview.semester} {preview.academicYear}
          </p>
          <Card className="mt-6">
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                setStep("you");
              }}
            >
              <Field label="Programme">
                <Input
                  value={programme}
                  onChange={(e) => setProgramme(e.target.value)}
                  placeholder="e.g. BSc Business Administration"
                />
              </Field>
              <fieldset className="space-y-1.5">
                <legend className="text-sm font-semibold text-ink-soft">Level</legend>
                <div className="flex flex-wrap gap-1.5 pt-1.5">
                  {LEVELS.map((l) => (
                    <button
                      key={l}
                      type="button"
                      aria-pressed={level === l}
                      onClick={() => setLevel(l)}
                      className={cn(
                        "min-h-11 rounded-full border px-4 text-sm",
                        level === l ? "border-ink bg-ink text-white" : "border-line-strong bg-bg-elevated text-ink-soft",
                      )}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                {!LEVELS.includes(level as (typeof LEVELS)[number]) ? (
                  <Input
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                    placeholder="Or type it, e.g. Diploma Year 2"
                    className="mt-2"
                  />
                ) : null}
              </fieldset>
              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  className="w-13 px-0"
                  aria-label="Back"
                  onClick={() => setStep("code")}
                >
                  <ArrowLeft className="size-5" aria-hidden />
                </Button>
                <Button type="submit" size="lg" className="flex-1" disabled={!programme.trim() || !level.trim()}>
                  Continue <ArrowRight className="size-4" aria-hidden />
                </Button>
              </div>
            </form>
          </Card>
        </>
      ) : null}

      {step === "you" ? (
        <>
          <h1 className="mt-1 font-display text-4xl font-extrabold">About you</h1>
          <p className="mt-2 text-[15px] leading-6 text-muted">
            You are the first person on the class list. Use your own details exactly as on the university register.
          </p>
          <Card className="mt-6">
            <form className="space-y-3" onSubmit={(e) => void finish(e)}>
              <Field label="Full name">
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
              </Field>
              <Field label="Index number">
                <Input
                  value={indexNumber}
                  onChange={(e) => setIndexNumber(e.target.value)}
                  placeholder="e.g. PS/ITC/22/0001"
                  autoComplete="off"
                />
              </Field>
              <Field label="Email" hint="You will sign in with this or your index number.">
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
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  className="w-13 px-0"
                  aria-label="Back"
                  disabled={busy}
                  onClick={() => setStep("class")}
                >
                  <ArrowLeft className="size-5" aria-hidden />
                </Button>
                <Button
                  type="submit"
                  size="lg"
                  className="flex-1"
                  disabled={busy || !fullName.trim() || !indexNumber.trim() || !email.trim() || password.length < 8}
                >
                  {busy ? "Setting up…" : "Create my class"}
                </Button>
              </div>
            </form>
          </Card>
        </>
      ) : null}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh text-ink">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
        <LogoMark className="mb-5 size-12" />
        {children}
        <Link to="/" className="mt-6 inline-flex min-h-11 items-center text-sm text-muted">
          Back to the start
        </Link>
      </div>
    </main>
  );
}
