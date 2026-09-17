import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { GROK_PROVIDERS, authClient, authEnabled, signIn } from "@/lib/auth/client";
import { APP_NAME } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Card } from "@/components/ui/badge";

export const Route = createFileRoute("/login")({ component: Login });

function Spinner() {
  return (
    <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z"
      />
    </svg>
  );
}

function Login() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [oauthPending, setOauthPending] = useState<string | null>(null);
  const anyPending = pending || oauthPending !== null;

  async function onEmail(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      if (mode === "signup") {
        const res = await authClient.signUp.email({
          email,
          password,
          name: name || email.split("@")[0],
          callbackURL: "/studio",
        });
        if (res.error) throw new Error(res.error.message || "Could not create account.");
      } else {
        const res = await authClient.signIn.email({
          email,
          password,
          callbackURL: "/studio",
        });
        if (res.error) throw new Error(res.error.message || "Could not sign in.");
      }
      window.location.href = "/studio";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setPending(false);
    }
  }

  async function onOauth(providerId: string) {
    setError(null);
    setOauthPending(providerId);
    try {
      await signIn(providerId, { callbackURL: "/studio" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      // On a full-page redirect this never runs before the browser navigates
      // away; it only matters for the live-preview popup path, which resolves
      // in place instead of navigating.
      setOauthPending(null);
    }
  }

  return (
    <main className="min-h-dvh bg-bg pl-3 text-ink">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted">Sign in</p>
        <h1 className="mt-2 font-display text-3xl">{APP_NAME}</h1>
        <p className="mt-2 text-sm text-muted">
          Your login is not your index number. Academic identity is collected after sign-in.
        </p>
        <Card className="mt-6 space-y-4">
          {authEnabled ? (
            <>
              <div className="space-y-2">
                {GROK_PROVIDERS.map((p) => (
                  <Button
                    key={p.providerId}
                    type="button"
                    variant="secondary"
                    className="w-full"
                    disabled={anyPending}
                    onClick={() => void onOauth(p.providerId)}
                  >
                    {oauthPending === p.providerId ? (
                      <>
                        <Spinner /> Connecting…
                      </>
                    ) : (
                      `Continue with ${p.label}`
                    )}
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.16em] text-faint">
                <span className="h-px flex-1 bg-line" />
                or email
                <span className="h-px flex-1 bg-line" />
              </div>
              <form className="space-y-3" onSubmit={(e) => void onEmail(e)}>
                <fieldset disabled={anyPending} className="space-y-3">
                  {mode === "signup" ? (
                    <Field label="Name">
                      <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                    </Field>
                  ) : null}
                  <Field label="Email">
                    <Input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </Field>
                  <Field label="Password">
                    <Input
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    />
                  </Field>
                  {error ? <p className="text-sm text-bad">{error}</p> : null}
                  <Button type="submit" className="w-full" disabled={anyPending}>
                    {pending ? (
                      <>
                        <Spinner /> {mode === "signup" ? "Creating account…" : "Signing in…"}
                      </>
                    ) : mode === "signup" ? (
                      "Create account"
                    ) : (
                      "Sign in with email"
                    )}
                  </Button>
                </fieldset>
              </form>
              <button
                type="button"
                className="text-sm text-accent disabled:pointer-events-none disabled:opacity-50"
                disabled={anyPending}
                onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
              >
                {mode === "signup" ? "Already have an account? Sign in" : "Need an account? Create one"}
              </button>
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
