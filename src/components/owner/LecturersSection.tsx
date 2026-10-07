import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, Copy, GraduationCap } from "lucide-react";
import {
  createOwnerLecturerInvite,
  getOwnerLecturers,
  revokeOwnerLecturerInvite,
  setOwnerLecturerClasses,
  type OwnerLecturerData,
} from "@/lib/server/lecturers";
import type { ClassOption, OwnerLecturer } from "@/lib/lecturers/accounts";
import { Button } from "@/components/ui/button";
import { Card, EmptyNote } from "@/components/ui/badge";
import { FormMessages } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/input";
import { Stamp } from "@/components/ui/stamp";
import { cn } from "@/lib/utils";

function message(err: unknown) {
  return err instanceof Error ? err.message : "Something went wrong. Try again.";
}

/** Owner page: invite lecturers and choose the classes each one sees. */
export function LecturersSection({ ownerCode }: { ownerCode: string }) {
  const [data, setData] = useState<OwnerLecturerData | null>(null);
  const [error, setError] = useState<string | null>(null);
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
        <h2 className="flex items-center gap-2 font-display text-xl font-bold">
          <GraduationCap className="size-5" aria-hidden /> Lecturers
        </h2>
        <p className="text-sm text-muted">
          A lecturer sees only the classes you tick: their groups, work, simulation results, and a marks sheet.
        </p>
      </div>
      <FormMessages error={error} />
      {!data ? null : (
        <>
          <InviteForm ownerCode={ownerCode} classes={data.classes} onCreated={load} />
          {data.lecturers.length ? (
            <ul className="space-y-2">
              {data.lecturers.map((l) => (
                <LecturerRow key={l.staffId} l={l} classes={data.classes} ownerCode={ownerCode} onSaved={load} />
              ))}
            </ul>
          ) : null}
          {data.invites.some((i) => i.status === "waiting") ? (
            <ul className="divide-y divide-line rounded-[14px] border border-line bg-bg-elevated">
              {data.invites
                .filter((i) => i.status === "waiting")
                .map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{i.label}</p>
                      <p className="text-xs text-muted">
                        {i.classCount} {i.classCount === 1 ? "class" : "classes"} · expires {new Date(i.expiresAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Stamp size="xs" tone="gold">
                        not used yet
                      </Stamp>
                      <button
                        type="button"
                        className="min-h-11 px-2 text-sm font-semibold text-clay"
                        onClick={() => {
                          if (!window.confirm(`Cancel the lecturer code for "${i.label}"?`)) return;
                          void revokeOwnerLecturerInvite({ data: { ownerCode, id: i.id } }).then(load, (err: unknown) =>
                            window.alert(message(err)),
                          );
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </li>
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

function InviteForm({ ownerCode, classes, onCreated }: { ownerCode: string; classes: ClassOption[]; onCreated: () => Promise<void> }) {
  const [label, setLabel] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [fresh, setFresh] = useState<{ code: string; expiresAt: string; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await createOwnerLecturerInvite({ data: { ownerCode, label, offeringIds: picked } });
      setFresh({ code: r.code, expiresAt: r.expiresAt, label });
      setLabel("");
      setPicked([]);
      await onCreated();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {fresh ? <NewLecturerCode {...fresh} /> : null}
      <Card>
        <form className="space-y-3" onSubmit={(e) => void create(e)}>
          <Field label="Who is this for?" hint="Only you see this note.">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Dr Ama Owusu" />
          </Field>
          <ClassTicks classes={classes} value={picked} onChange={setPicked} />
          <FormMessages error={error} />
          <Button type="submit" size="lg" className="w-full" disabled={busy || !label.trim() || !picked.length}>
            {busy ? "Making code…" : "Make a lecturer invite code"}
          </Button>
        </form>
      </Card>
    </>
  );
}

function NewLecturerCode({ code, expiresAt, label }: { code: string; expiresAt: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const text = [
    `Hello ${label}, you have a lecturer account on the Experiential Venture Platform for ENT 302.`,
    ``,
    `1. Open ${origin}/lecturer-setup`,
    `2. Enter this invite code: ${code}`,
    `3. Add your name and email and choose a password.`,
    ``,
    `After that, sign in at ${origin}/login with your email. The code works once and expires on ${new Date(expiresAt).toLocaleDateString()}.`,
  ].join("\n");
  return (
    <div className="flow-enter tape rounded-[14px] border-2 border-ink bg-bg-elevated p-5 pt-6">
      <p className="text-xs font-semibold text-muted">Lecturer invite for {label}</p>
      <p className="mt-1 font-mono text-3xl font-medium tracking-wider">{code}</p>
      <p className="mt-1 text-sm text-muted">Shown only now. Send it before you leave this page.</p>
      <Button
        size="lg"
        variant="gold"
        className="mt-4 w-full"
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
      >
        {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        {copied ? "Copied, paste it into WhatsApp or email" : "Copy message for the lecturer"}
      </Button>
      <pre className="mt-3 rounded-[14px] bg-bg-subtle p-3 text-xs leading-5 whitespace-pre-wrap text-ink-soft">{text}</pre>
    </div>
  );
}

function LecturerRow({
  l,
  classes,
  ownerCode,
  onSaved,
}: {
  l: OwnerLecturer;
  classes: ClassOption[];
  ownerCode: string;
  onSaved: () => Promise<void>;
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
            {l.email} · {l.signedUp ? "signed up" : "has not signed up yet"}
          </p>
        </div>
        <button type="button" className="min-h-11 shrink-0 px-2 text-sm font-semibold text-accent" onClick={() => setEditing((v) => !v)}>
          {editing ? "Close" : "Change classes"}
        </button>
      </div>
      {!editing ? (
        <ul className="mt-2 space-y-0.5 text-sm text-ink-soft">
          {names.map((n) => (
            <li key={n}>· {n}</li>
          ))}
        </ul>
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
