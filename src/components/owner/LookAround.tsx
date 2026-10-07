import { useState } from "react";
import { Presentation, UserRound, type LucideIcon } from "lucide-react";
import { signIn } from "@/lib/auth/client";
import { startDemo } from "@/lib/server/demo";
import { Card } from "@/components/ui/badge";
import { FormMessages } from "@/components/ui/feedback";

type Role = "student" | "lecturer";

const ROLES: { role: Role; title: string; body: string; to: string; icon: LucideIcon }[] = [
  {
    role: "student",
    title: "As a student",
    body: "Start a group and invite members, find problems, test a venture, then run it for six weeks.",
    to: "/studio",
    icon: UserRound,
  },
  {
    role: "lecturer",
    title: "As a lecturer",
    body: "Who needs attention, what groups are doing, feedback and marks.",
    to: "/lecturer",
    icon: Presentation,
  },
];

/**
 * One tap into a ready-made demo class as any role. No codes, uploads or
 * passwords: the server sets up the class and hands back a one-off login.
 */
export function LookAround({ ownerCode }: { ownerCode: string }) {
  const [busy, setBusy] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function go(role: Role, to: string) {
    setBusy(role);
    setError(null);
    try {
      const login = await startDemo({ data: { ownerCode, role } });
      await signIn(login.identifier, login.password);
      window.location.href = to;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the demo. Try again.");
      setBusy(null);
    }
  }

  return (
    <section>
      <h1 className="font-display text-3xl font-extrabold">Look around</h1>
      <p className="mt-1 text-[15px] leading-6 text-muted">
        Try the app as each person in a ready-made demo class. One tap, no codes or passwords. Your changes stay in
        the demo class, and you can switch role from the bar at the top.
      </p>
      <Card className="mt-4 p-2">
        <ul className="divide-y divide-line">
          {ROLES.map((r) => (
            <li key={r.role}>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void go(r.role, r.to)}
                className="flex w-full items-center gap-3 rounded-[14px] px-3 py-3 text-left hover:bg-bg-subtle disabled:opacity-50"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-gold-soft text-gold-deep">
                  <r.icon className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{busy === r.role ? "Opening…" : r.title}</span>
                  <span className="block text-sm text-muted">{r.body}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <FormMessages error={error} />
    </section>
  );
}
