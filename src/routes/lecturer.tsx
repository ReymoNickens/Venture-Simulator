import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getStaffStatus, registerStaff } from "@/lib/server/lecturer";
import { StaffProvider } from "@/hooks/lecturer-context";
import { useAction } from "@/hooks/use-action";
import { LogoMark } from "@/components/ui/sticker";
import { AccountMenu } from "@/components/shell/AccountMenu";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/input";
import { FormMessages, Loading } from "@/components/ui/feedback";

export const Route = createFileRoute("/lecturer")({ component: LecturerLayout });

type Status = Awaited<ReturnType<typeof getStaffStatus>>;
const OFFERING_KEY = "evp:staff-offering";

function LecturerLayout() {
  const { user, isPending } = useCurrentUserState();
  const userId = user?.id ?? null;
  const [status, setStatus] = useState<Status | null>(null);
  const [offeringId, setOfferingIdState] = useState("");

  const load = useCallback(async () => {
    const s = await getStaffStatus();
    setStatus(s);
    let saved = "";
    try {
      saved = localStorage.getItem(OFFERING_KEY) ?? "";
    } catch {
      /* storage blocked */
    }
    setOfferingIdState((cur) => cur || (s.offerings.some((o) => o.id === saved) ? saved : (s.offerings[0]?.id ?? "")));
  }, []);

  useEffect(() => {
    if (userId) void load();
  }, [userId, load]);

  if (isPending) return <div className="min-h-dvh bg-bg" />;
  if (!user) return <RedirectToSignIn />;
  if (!status) return <Shell><Loading /></Shell>;
  if (!status.staff) return <Shell><Join status={status} onDone={() => void load()} /></Shell>;

  const setOfferingId = (id: string) => {
    setOfferingIdState(id);
    try {
      localStorage.setItem(OFFERING_KEY, id);
    } catch {
      /* ignore */
    }
  };
  return (
    <StaffProvider value={{ staff: status.staff, offerings: status.offerings, offeringId, setOfferingId }}>
      <Shell
        nav={
          <nav className="flex w-fit gap-1 rounded-full bg-bg-subtle p-1 text-sm font-semibold">
            {(
              [
                ["/lecturer", "Groups", true],
                ["/lecturer/activity", "Activity", false],
                ["/lecturer/course", "Course", false],
              ] as const
            ).map(([to, label, exact]) => (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact }}
                className="rounded-full px-4 py-1.5 text-muted"
                activeProps={{ className: "bg-bg-elevated !text-ink shadow-sm" }}
              >
                {label}
              </Link>
            ))}
          </nav>
        }
        offering={
          status.offerings.length > 1 ? (
            <select aria-label="Course offering" value={offeringId} onChange={(e) => setOfferingId(e.target.value)} className="bg-transparent text-xs font-semibold">
              {status.offerings.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.courseCode} · {o.semester} {o.academicYear}
                </option>
              ))}
            </select>
          ) : status.offerings[0] ? (
            <span>
              {status.offerings[0].courseCode} · {status.offerings[0].semester} {status.offerings[0].academicYear}
            </span>
          ) : null
        }
      >
        <Outlet />
      </Shell>
    </StaffProvider>
  );
}

function Shell({ children, nav, offering }: { children: React.ReactNode; nav?: React.ReactNode; offering?: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <LogoMark />
            <div>
              <p className="font-display text-base leading-tight font-bold">Staff room</p>
              {offering ? <div className="text-xs text-muted">{offering}</div> : null}
            </div>
          </div>
          <AccountMenu />
        </div>
        {nav ? <div className="mx-auto max-w-5xl px-4 pb-2">{nav}</div> : null}
      </header>
      <main className="mx-auto max-w-5xl px-4 pt-4 pb-16">{children}</main>
    </div>
  );
}

function Join({ status, onDone }: { status: Status; onDone: () => void }) {
  const known = status.staffRecordName;
  const [fullName, setFullName] = useState(known ?? "");
  const title = "";
  const [code, setCode] = useState("");
  const [offeringId, setOfferingId] = useState(status.allOfferings[0]?.id ?? "");
  const { pending, error, run } = useAction();
  return (
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <h1 className="font-display text-4xl font-extrabold">Welcome, lecturer.</h1>
        <p className="mt-2 text-[15px] leading-6 text-muted">
          {known
            ? "Confirm your name and course to open the staff room. You only do this once."
            : "Enter the staff code from your course administrator. You only do this once."}
        </p>
      </div>
      <Card className="space-y-3">
        <Field label="Your full name">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <div className={status.allOfferings.length > 1 ? "" : "hidden"}>
        <Field label="Course">
          <Select value={offeringId} onChange={(e) => setOfferingId(e.target.value)}>
            {status.allOfferings.map((o) => (
              <option key={o.id} value={o.id}>
                {o.courseCode} · {o.courseName} · {o.semester} {o.academicYear}
              </option>
            ))}
          </Select>
        </Field>
        </div>
        {known ? null : (
          <Field
            label="Staff code"
            hint={status.previewCodeHint ? `Preview only: the demo code is ${status.previewCodeHint}.` : undefined}
          >
            <Input value={code} onChange={(e) => setCode(e.target.value)} className="font-mono" />
          </Field>
        )}
        <FormMessages error={error} />
        <Button
          disabled={Boolean(pending)}
          onClick={() =>
            void run("join", async () => {
              await registerStaff({ data: { fullName, title, accessCode: code, offeringId } });
              onDone();
            })
          }
        >
          {pending ? "Checking…" : "Enter the staff room"}
        </Button>
      </Card>
    </div>
  );
}
