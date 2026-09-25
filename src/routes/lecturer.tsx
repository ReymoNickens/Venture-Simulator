import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { RedirectToSignIn, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getStaffStatus, registerStaff } from "@/lib/server/lecturer";
import { StaffProvider } from "@/hooks/lecturer-context";
import { useAction } from "@/hooks/use-action";
import { KenteBand } from "@/components/ui/kente";
import { Emblem } from "@/components/ui/emblem";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/input";
import { FormMessages, Loading } from "@/components/ui/feedback";
import { APP_NAME } from "@/lib/brand";

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
          <nav className="flex gap-1 text-sm font-semibold">
            <Link to="/lecturer" activeOptions={{ exact: true }} className="rounded-[6px] px-3 py-1.5" activeProps={{ className: "bg-ink text-bg-elevated" }}>
              Attention queue
            </Link>
            <Link to="/lecturer/course" className="rounded-[6px] px-3 py-1.5" activeProps={{ className: "bg-ink text-bg-elevated" }}>
              Course set-up
            </Link>
          </nav>
        }
        offering={
          status.offerings.length > 1 ? (
            <Select aria-label="Course offering" value={offeringId} onChange={(e) => setOfferingId(e.target.value)} className="h-9 w-auto text-sm">
              {status.offerings.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.courseCode} · {o.semester} {o.academicYear}
                </option>
              ))}
            </Select>
          ) : status.offerings[0] ? (
            <span className="font-mono text-xs text-muted">
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
      <KenteBand />
      <header className="border-b-2 border-ink bg-bg/95">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-[8px] border-2 border-ink bg-indigo text-bg-elevated">
              <Emblem emblem="ohene_aniwa" className="size-6" />
            </span>
            <div>
              <p className="font-display text-[15px] font-extrabold leading-tight">Staff room</p>
              <p className="text-xs text-muted">{APP_NAME}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {offering}
            <UserButton />
          </div>
        </div>
        {nav ? <div className="mx-auto max-w-6xl px-4 pb-2">{nav}</div> : null}
      </header>
      <main className="mx-auto max-w-6xl px-4 pt-5 pb-16">{children}</main>
    </div>
  );
}

function Join({ status, onDone }: { status: Status; onDone: () => void }) {
  const [fullName, setFullName] = useState("");
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [offeringId, setOfferingId] = useState(status.allOfferings[0]?.id ?? "");
  const { pending, error, run } = useAction();
  return (
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <Eyebrow>Teaching staff</Eyebrow>
        <h1 className="mt-1 font-display text-3xl font-extrabold">Join the staff room</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Enter the staff access code from your course administrator. Students never see this page.
        </p>
      </div>
      <Card className="space-y-3">
        <Field label="Your full name">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label="Title" optional>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Dr., Lecturer, Teaching Assistant" />
        </Field>
        <Field label="Course offering">
          <Select value={offeringId} onChange={(e) => setOfferingId(e.target.value)}>
            {status.allOfferings.map((o) => (
              <option key={o.id} value={o.id}>
                {o.courseCode} · {o.courseName} · {o.semester} {o.academicYear}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Staff access code"
          hint={status.previewCodeHint ? `Preview only: the demo code is ${status.previewCodeHint}.` : undefined}
        >
          <Input value={code} onChange={(e) => setCode(e.target.value)} className="font-mono" />
        </Field>
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
