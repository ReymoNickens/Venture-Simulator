import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { authEnabled, sendPhoneCode, signIn, signInWithGoogle, verifyPhoneCode } from "@/lib/auth/client";
import { formatPhone, normalisePhone } from "@/lib/phone";
import { getSignInOptions, type SignInOptions } from "@/lib/server/signin";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Card } from "@/components/ui/badge";
import { FormMessages } from "@/components/ui/feedback";
import { LogoMark } from "@/components/ui/sticker";

export const Route = createFileRoute("/login")({ component: Login });

const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

/**
 * One sign-in for everyone who is a student: a phone number and a texted
 * code, or Google. The first sign-in creates the account; details come next
 * (onboarding). Lecturers and older accounts use email and password, behind
 * a link at the bottom.
 */
function Login() {
  const [options, setOptions] = useState<SignInOptions | null>(null);
  const [mode, setMode] = useState<"phone" | "password">("phone");

  useEffect(() => {
    void getSignInOptions().then(setOptions, () => setOptions({ google: false, smsLive: false }));
  }, []);

  return (
    <main className="min-h-dvh text-ink">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
        <LogoMark full />
        <h1 className="mt-5 font-display text-4xl font-semibold">Sign in</h1>
        <p className="mt-2 text-[15px] leading-6 text-muted">
          {mode === "phone"
            ? "Use your phone number. We text you a code; there is no password to remember. First time? This creates your account."
            : "For lecturers, and accounts that were given a password."}
        </p>
        {!authEnabled ? (
          <Card className="mt-6">
            <p className="text-sm text-muted">Sign-in is turned off on this copy of the app.</p>
          </Card>
        ) : mode === "phone" ? (
          <>
            <PhoneSignIn smsLive={options?.smsLive ?? true} />
            {options?.google ? <GoogleButton /> : null}
            <button
              type="button"
              className="mt-6 inline-flex min-h-11 items-center self-start text-sm font-semibold text-ink underline underline-offset-4"
              onClick={() => setMode("password")}
            >
              Lecturer? Sign in with email and password
            </button>
          </>
        ) : (
          <>
            <PasswordSignIn />
            <button
              type="button"
              className="mt-6 inline-flex min-h-11 items-center self-start text-sm font-semibold text-ink underline underline-offset-4"
              onClick={() => setMode("phone")}
            >
              Student? Sign in with your phone number
            </button>
          </>
        )}
        <Link to="/" className="inline-flex min-h-11 items-center self-start text-sm text-muted">
          Back
        </Link>
      </div>
    </main>
  );
}

function PhoneSignIn({ smsLive }: { smsLive: boolean }) {
  const [typed, setTyped] = useState("");
  const [phone, setPhone] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const normalised = normalisePhone(typed);
    if (!normalised) {
      setError("That doesn’t look like a phone number. Type it like 024 412 3456.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await sendPhoneCode(normalised);
      setPhone(normalised);
      setCode("");
    } catch (err) {
      setError(message(err, "Could not send the code."));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!phone) return;
    setBusy(true);
    setError(null);
    try {
      await verifyPhoneCode(phone, code);
      window.location.href = "/studio";
    } catch (err) {
      setError(message(err, "Could not sign in."));
      setBusy(false);
    }
  }

  if (!phone) {
    return (
      <Card className="mt-6">
        <form className="space-y-3" onSubmit={(e) => void send(e)}>
          <Field label="Phone number">
            <Input
              type="tel"
              inputMode="tel"
              required
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="024 412 3456"
              autoComplete="tel"
            />
          </Field>
          <FormMessages error={error} />
          <Button type="submit" size="lg" className="w-full" disabled={busy || !typed.trim()}>
            {busy ? "Sending…" : "Text me a code"}
          </Button>
        </form>
      </Card>
    );
  }

  return (
    <Card className="mt-6">
      <form className="space-y-3" onSubmit={(e) => void verify(e)}>
        <p className="text-[15px] leading-6">
          We sent a 6-digit code to <strong>{formatPhone(phone)}</strong>.
          {smsLive ? "" : " (Texts are not switched on yet: the code is waiting on the owner page.)"}
        </p>
        <Field label="Code">
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="text-center font-mono text-2xl tracking-[0.4em]"
            autoFocus
          />
        </Field>
        <FormMessages error={error} />
        <Button type="submit" size="lg" className="w-full" disabled={busy || code.length !== 6}>
          {busy ? "Checking…" : "Sign in"}
        </Button>
        <div className="flex justify-between text-sm">
          <button type="button" className="min-h-11 font-semibold text-accent" onClick={() => setPhone(null)}>
            Change number
          </button>
          <button type="button" className="min-h-11 font-semibold text-accent" disabled={busy} onClick={() => void send()}>
            Send a new code
          </button>
        </div>
      </form>
    </Card>
  );
}

function GoogleButton() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-3">
      <p className="my-3 text-center text-sm text-muted">or</p>
      <Button
        type="button"
        variant="secondary"
        size="lg"
        className="w-full"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError(null);
          signInWithGoogle("/studio").catch((err) => {
            setError(message(err, "Could not start Google sign-in."));
            setBusy(false);
          });
        }}
      >
        <GoogleMark /> {busy ? "Opening Google…" : "Continue with Google"}
      </Button>
      <FormMessages error={error} />
    </div>
  );
}

/** Google's "G", as Google asks sign-in buttons to show it. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.4 5.7c4.3-4 6.9-9.9 6.9-17.2z" />
      <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-2.9-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}

function PasswordSignIn() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(identifier, password);
      window.location.href = "/studio";
    } catch (err) {
      setError(message(err, "Could not sign in."));
      setBusy(false);
    }
  }

  return (
    <Card className="mt-6">
      <form className="space-y-3" onSubmit={(e) => void submit(e)}>
        <Field label="Email">
          <Input required value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </Field>
        <FormMessages error={error} />
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? "Please wait…" : "Sign in"}
        </Button>
      </form>
    </Card>
  );
}
