import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, Copy } from "lucide-react";
import {
  createOwnerLecturerLogin,
  getOwnerLecturers,
  resetOwnerLecturerPassword,
  setOwnerLecturerClasses,
  type OwnerLecturerData,
} from "@/lib/server/lecturers";
import type { ClassOption, OwnerLecturer } from "@/lib/lecturers/accounts";
import { Button } from "@/components/ui/button";
import { Card, EmptyNote } from "@/components/ui/badge";
import { FormMessages } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function message(err: unknown) {
  return err instanceof Error ? err.message : "Something went wrong. Try again.";
}

/**
 * Owner page: add lecturers and choose the classes each one sees. The owner
 * gets a ready login (email and a generated password) to pass on; the
 * lecturer has nothing to set up.
 */
export function LecturersSection({ ownerCode }: { ownerCode: string }) {
  const [data, setData] = useState<OwnerLecturerData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [login, setLogin] = useState<{ name: string; email: string; password: string; isNew: boolean } | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await getOwnerLecturers({ data: { ownerCode } }));
    } catch (err) {
      setError(message(err));
    }
  }, [ownerCode]);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-2xl font-extrabold">Lecturers</h2>
        <p className="text-sm text-muted">
          A lecturer sees only the classes you tick: their groups, work, simulation results, and a marks sheet.
        </p>
      </div>
      <FormMessages error={error} />
      {login ? <LoginToPassOn {...login} onDone={() => setLogin(null)} /> : null}
      {!data ? null : (
        <>
          <AddLecturerForm
            ownerCode={ownerCode}
            classes={data.classes}
            onCreated={async (l) => {
              setLogin({ ...l, isNew: true });
              await load();
            }}
          />
          {data.lecturers.length ? (
            <ul className="space-y-2">
              {data.lecturers.map((l) => (
                <LecturerRow
                  key={l.staffId}
                  l={l}
                  classes={data.classes}
                  ownerCode={ownerCode}
                  onSaved={load}
                  onNewPassword={(p) => setLogin({ name: l.fullName, email: p.email, password: p.password, isNew: false })}
                />
              ))}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}

function ClassTicks({ classes, value, onChange }: { classes: ClassOption[]; value: string[]; onChange: (v: string[]) => void }) {
  if (!classes.length) return <EmptyNote>No classes yet. Set up a class first.</EmptyNote>;
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-semibold text-ink-soft">Classes they teach</legend>
      <div className="max-h-60 space-y-1 overflow-y-auto pt-1">
        {classes.map((c) => {
          const on = value.includes(c.offeringId);
          return (
            <label
              key={c.offeringId}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-3 rounded-[12px] border px-3 py-2 text-sm",
                on ? "border-ink bg-bg-subtle" : "border-line",
              )}
            >
              <input
                type="checkbox"
                className="size-4 accent-[var(--color-ink)]"
                checked={on}
                onChange={() => onChange(on ? value.filter((x) => x !== c.offeringId) : [...value, c.offeringId])}
              />
              {c.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function AddLecturerForm({
  ownerCode,
  classes,
  onCreated,
}: {
  ownerCode: string;
  classes: ClassOption[];
  onCreated: (l: { name: string; email: string; password: string }) => Promise<void>;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await createOwnerLecturerLogin({ data: { ownerCode, fullName, email, offeringIds: picked } });
      await onCreated({ name: fullName.trim(), email: r.email, password: r.password });
      setFullName("");
      setEmail("");
      setPicked([]);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form className="space-y-3" onSubmit={(e) => void create(e)}>
        <Field label="Name, as students should see it">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Dr Ama Owusu" />
        </Field>
        <Field label="Email they will sign in with">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="a.owusu@ucc.edu.gh" />
        </Field>
        <ClassTicks classes={classes} value={picked} onChange={setPicked} />
        <FormMessages error={error} />
        <Button type="submit" size="lg" className="w-full" disabled={busy || !fullName.trim() || !email.trim() || !picked.length}>
          {busy ? "Adding…" : "Add lecturer and make their login"}
        </Button>
      </form>
    </Card>
  );
}

/** The login, shown once, with a message ready to paste into WhatsApp or email. */
function LoginToPassOn({
  name,
  email,
  password,
  isNew,
  onDone,
}: {
  name: string;
  email: string;
  password: string;
  isNew: boolean;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const text = [
    `Hello ${name},`,
    isNew ? `you have a lecturer login for ENT 302.` : `here is a new password for your ENT 302 lecturer login.`,
    ``,
    `Open: ${origin}/login`,
    `Tap "Lecturer? Sign in with email and password"`,
    `Email: ${email}`,
    `Password: ${password}`,
    ``,
    `You can change the password after signing in.`,
  ].join("\n");
  return (
    <div className="flow-enter rounded-[14px] border-2 border-accent bg-bg-elevated p-5">
      <p className="text-xs font-semibold text-muted">{isNew ? "Login for" : "New password for"} {name}</p>
      <p className="mt-2 text-sm">Email</p>
      <p className="font-mono text-lg break-all">{email}</p>
      <p className="mt-2 text-sm">Password</p>
      <p className="font-mono text-2xl tracking-wide">{password}</p>
      <p className="mt-2 text-sm text-muted">Shown only now. Send it before you leave this page.</p>
      <Button
        size="lg"
        className="mt-4 w-full"
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
      >
        {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        {copied ? "Copied. Paste it into WhatsApp or email" : "Copy message for the lecturer"}
      </Button>
      <button type="button" className="mt-2 min-h-11 w-full text-sm font-semibold text-muted" onClick={onDone}>
        I’ve sent it
      </button>
    </div>
  );
}

function LecturerRow({
  l,
  classes,
  ownerCode,
  onSaved,
  onNewPassword,
}: {
  l: OwnerLecturer;
  classes: ClassOption[];
  ownerCode: string;
  onSaved: () => Promise<void>;
  onNewPassword: (p: { email: string; password: string }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState(l.offeringIds);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const names = classes.filter((c) => l.offeringIds.includes(c.offeringId)).map((c) => c.label);
  return (
    <li className="rounded-[14px] border border-line bg-bg-elevated p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{l.fullName}</p>
          <p className="truncate text-xs text-muted">
            {l.email}
          </p>
        </div>
        <button type="button" className="min-h-11 shrink-0 px-2 text-sm font-semibold text-accent" onClick={() => setEditing((v) => !v)}>
          {editing ? "Close" : "Change classes"}
        </button>
      </div>
      {!editing ? (
        <>
          <ul className="mt-2 space-y-0.5 text-sm text-ink-soft">
            {names.map((n) => (
              <li key={n}>· {n}</li>
            ))}
          </ul>
          {l.signedUp ? (
            <button
              type="button"
              className="mt-2 min-h-11 text-sm font-semibold text-accent"
              disabled={busy}
              onClick={() => {
                if (!window.confirm(`Make a new password for ${l.fullName}? The old one stops working.`)) return;
                setBusy(true);
                resetOwnerLecturerPassword({ data: { ownerCode, staffId: l.staffId } })
                  .then(onNewPassword, (err: unknown) => setError(message(err)))
                  .finally(() => setBusy(false));
              }}
            >
              Forgot their password? Make a new one
            </button>
          ) : null}
          <FormMessages error={error} />
        </>
      ) : (
        <div className="mt-3 space-y-3">
          <ClassTicks classes={classes} value={picked} onChange={setPicked} />
          <FormMessages error={error} />
          <Button
            className="w-full"
            disabled={busy || !picked.length}
            onClick={() => {
              setBusy(true);
              setError(null);
              setOwnerLecturerClasses({ data: { ownerCode, staffId: l.staffId, offeringIds: picked } })
                .then(async () => {
                  setEditing(false);
                  await onSaved();
                })
                .catch((err: unknown) => setError(message(err)))
                .finally(() => setBusy(false));
            }}
          >
            {busy ? "Saving…" : "Save classes"}
          </Button>
        </div>
      )}
    </li>
  );
}
