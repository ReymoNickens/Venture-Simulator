import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { activateAccount, authEnabled, signIn } from "@/lib/auth/client";
import { APP_NAME } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Card } from "@/components/ui/badge";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const [mode, setMode] = useState<"signin" | "activate">("signin");
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [indexNumber, setIndexNumber] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      if (mode === "activate") {
        await activateAccount({ email, indexNumber, password });
      } else {
        await signIn(identifier, password);
      }
      window.location.href = "/studio";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="min-h-dvh bg-bg pl-3 text-ink">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted">Sign in</p>
        <h1 className="mt-2 font-display text-3xl">{APP_NAME}</h1>
        <p className="mt-2 text-sm text-muted">
          {mode === "activate"
            ? "Enter the email and index number your instructor has on file to set your password."
            : "Sign in with your student email address or index number."}
        </p>
        <Card className="mt-6 space-y-4">
          {authEnabled ? (
            <>
              <form className="space-y-3" onSubmit={(e) => void onSubmit(e)}>
                {mode === "activate" ? (
                  <>
                    <Field label="Email">
                      <Input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                      />
                    </Field>
                    <Field label="Index number">
                      <Input
                        required
                        value={indexNumber}
                        onChange={(e) => setIndexNumber(e.target.value)}
                        autoComplete="off"
                      />
                    </Field>
                  </>
                ) : (
                  <Field label="Email or index number">
                    <Input
                      required
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      autoComplete="username"
                    />
                  </Field>
                )}
                <Field label="Password">
                  <Input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "activate" ? "new-password" : "current-password"}
                  />
                </Field>
                {error ? <p className="text-sm text-bad">{error}</p> : null}
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? "Please wait…" : mode === "activate" ? "Activate account" : "Sign in"}
                </Button>
              </form>
              <button
                type="button"
                className="text-sm text-accent"
                onClick={() => setMode(mode === "activate" ? "signin" : "activate")}
              >
                {mode === "activate"
                  ? "Already activated? Sign in"
                  : "First time here? Activate your account"}
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
