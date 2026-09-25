import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { activateAccount, authEnabled, createStaffAccount, signIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Card } from "@/components/ui/badge";
import { LogoMark } from "@/components/ui/sticker";
import { getSignInHints } from "@/lib/server/sign-in-hints";

export const Route = createFileRoute("/login")({ component: Login });

/**
 * signin   — anyone with an account: email or index number, plus password.
 * activate — a student's first visit: claim the roster row the lecturer loaded.
 * staff    — a lecturer's first visit: create an account with the staff access code.
 */
type Mode = "signin" | "activate" | "staff";

const INTRO: Record<Mode, string> = {
  signin: "Sign in with your student email or index number. Lecturers use their email.",
  activate: "Enter the email and index number your lecturer has on file, then choose a password.",
  staff: "Lecturers: create your account with the staff access code from your course administrator.",
};

const SUBMIT: Record<Mode, string> = {
  signin: "Sign in",
  activate: "Activate my account",
  staff: "Create lecturer account",
};

function Login() {
  const [mode, setMode] = useState<Mode>("signin");
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [indexNumber, setIndexNumber] = useState("");
  const [fullName, setFullName] = useState("");
  const [staffCode, setStaffCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [hints, setHints] = useState<Awaited<ReturnType<typeof getSignInHints>>>(null);

  useEffect(() => {
    void getSignInHints()
      .then(setHints)
      .catch(() => undefined);
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      if (mode === "activate") {
        await activateAccount({ email, indexNumber, password });
        window.location.href = "/studio";
      } else if (mode === "staff") {
        await createStaffAccount({ email, fullName, staffCode, password });
        window.location.href = "/lecturer";
      } else {
        await signIn(identifier, password);
        // The studio sends staff on to the lecturer console.
        window.location.href = "/studio";
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setPending(false);
    }
  }

  function switchTo(next: Mode) {
    setMode(next);
    setError(null);
  }

  return (
    <main className="min-h-dvh text-ink">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
        <LogoMark className="size-12" />
        <h1 className="mt-5 font-display text-4xl font-extrabold">
          {mode === "signin" ? "Let’s get you in." : mode === "activate" ? "First time here?" : "Welcome, lecturer."}
        </h1>
        <p className="mt-2 text-[15px] text-muted">{INTRO[mode]}</p>
        {hints && mode === "activate" ? (
          <p className="mt-2 text-sm text-muted">
            Preview only: try <span className="font-mono">{hints.student.email}</span> with{" "}
            <span className="font-mono">{hints.student.indexNumber}</span>.
          </p>
        ) : null}
        {hints?.staffCode && mode === "staff" ? (
          <p className="mt-2 text-sm text-muted">
            Preview only: the staff access code is <span className="font-mono">{hints.staffCode}</span>.
          </p>
        ) : null}
        <Card className="mt-6 space-y-4">
          {authEnabled ? (
            <>
              <form className="space-y-3" onSubmit={(e) => void onSubmit(e)}>
                {mode === "signin" ? (
                  <Field label="Email or index number">
                    <Input
                      required
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      autoComplete="username"
                    />
                  </Field>
                ) : (
                  <Field label="Email">
                    <Input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </Field>
                )}
                {mode === "activate" ? (
                  <Field label="Index number">
                    <Input
                      required
                      value={indexNumber}
                      onChange={(e) => setIndexNumber(e.target.value)}
                      placeholder="e.g. PS/ITC/22/0001"
                      autoComplete="off"
                    />
                  </Field>
                ) : null}
                {mode === "staff" ? (
                  <>
                    <Field label="Full name">
                      <Input
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        autoComplete="name"
                      />
                    </Field>
                    <Field label="Staff access code">
                      <Input
                        required
                        value={staffCode}
                        onChange={(e) => setStaffCode(e.target.value)}
                        autoComplete="off"
                      />
                    </Field>
                  </>
                ) : null}
                <Field label={mode === "signin" ? "Password" : "Choose a password"}>
                  <Input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  />
                </Field>
                {error ? <p className="text-sm text-bad">{error}</p> : null}
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? "Please wait…" : SUBMIT[mode]}
                </Button>
              </form>
              <div className="flex flex-col items-start gap-2 text-sm">
                {mode !== "signin" ? (
                  <button type="button" className="text-left font-semibold text-accent" onClick={() => switchTo("signin")}>
                    Already have an account? Sign in
                  </button>
                ) : null}
                {mode !== "activate" ? (
                  <button type="button" className="text-left font-semibold text-accent" onClick={() => switchTo("activate")}>
                    Student, first time here? Activate your account
                  </button>
                ) : null}
                {mode !== "staff" ? (
                  <button type="button" className="text-left text-muted underline underline-offset-2" onClick={() => switchTo("staff")}>
                    Lecturer without an account?
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">Sign-in is disabled.</p>
          )}
        </Card>
        <Link to="/" className="mt-6 text-sm text-muted">
          Back
        </Link>
      </div>
    </main>
  );
}
