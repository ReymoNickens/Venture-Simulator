import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CloudOff, Eye, FlaskConical, GraduationCap, Lightbulb, Lock, MessageCircle, Scale, Smartphone, Users } from "lucide-react";
import { SignedIn, SignedOut } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { buttonVariants } from "@/components/ui/button";
import { Logo } from "@/components/shell/AppShell";
import { LATER_CHAPTERS } from "@/lib/domain/config";

export const Route = createFileRoute("/")({ component: Home });

const CHAPTERS = [
  { icon: Users, title: "Team up", body: "Join your group with a code from WhatsApp.", color: "var(--color-ch-team)" },
  { icon: Lightbulb, title: "Spot a problem", body: "One you've really seen — sealed so nobody copies.", color: "var(--color-ch-idea)" },
  { icon: Scale, title: "Decide together", body: "Compare, vote privately, agree with reasons.", color: "var(--color-ch-decide)" },
  { icon: Eye, title: "Collect evidence", body: "Count, photograph, interview. Facts, not vibes.", color: "var(--color-ch-evidence)" },
  { icon: FlaskConical, title: "Test what could kill it", body: "Cheap tests on your riskiest assumptions.", color: "var(--color-ch-test)" },
];

function Home() {
  const { isPending } = useCurrentUserState();
  const cta = isPending ? (
    <div className="h-[52px] w-56 animate-pulse rounded-[14px] bg-white/10" />
  ) : (
    <>
      <SignedIn>
        <Link to="/studio" className={buttonVariants({ variant: "sun", size: "lg" })}>Continue to my studio <ArrowRight className="size-4" /></Link>
      </SignedIn>
      <SignedOut>
        <Link to="/login" className={buttonVariants({ variant: "sun", size: "lg" })}>Start your venture <ArrowRight className="size-4" /></Link>
      </SignedOut>
    </>
  );

  return (
    <main className="min-h-dvh bg-bg text-ink">
      {/* Hero */}
      <section className="relative overflow-hidden bg-night text-accent-fg">
        <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-sun/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-20 size-80 rounded-full bg-accent/40 blur-3xl" />
        <div className="relative mx-auto max-w-5xl px-4 pb-14 pt-6">
          <nav className="flex items-center justify-between">
            <Logo />
            <SignedOut>
              <Link to="/login" className="rounded-full border border-white/20 px-3.5 py-1.5 text-sm font-semibold hover:bg-white/10">Sign in</Link>
            </SignedOut>
          </nav>
          <div className="mt-14 max-w-2xl animate-rise sm:mt-20">
            <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-sun">Entrepreneurship, practised</p>
            <h1 className="mt-3 font-display text-[2.6rem] leading-[1.02] text-accent-fg sm:text-6xl">
              Turn a problem you've seen into a venture you can defend.
            </h1>
            <p className="mt-5 max-w-[46ch] text-[17px] leading-7 text-accent-fg/80">
              A studio for your entrepreneurship course. Your group finds a real problem on campus or in town, picks one to build, and proves it with evidence — step by step, on your phone.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">{cta}</div>
          </div>
        </div>
        <div className="kente h-2" />
      </section>

      {/* Journey */}
      <section className="mx-auto max-w-5xl px-4 py-14">
        <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-muted">The journey</p>
        <h2 className="mt-1 max-w-[22ch] font-display text-3xl leading-tight">From “I noticed something” to a tested venture</h2>
        <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {CHAPTERS.map((c, i) => (
            <li key={c.title} className="relative rounded-[20px] border border-line/80 bg-bg-elevated p-4 shadow-[var(--shadow-card)]">
              <span className="grid size-10 place-items-center rounded-full text-white" style={{ background: c.color }}><c.icon className="size-5" /></span>
              <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Step {i + 1}</p>
              <p className="font-display text-lg leading-tight">{c.title}</p>
              <p className="mt-1 text-sm leading-5 text-muted">{c.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted">
          <Lock className="size-3.5" /> Coming next in the course:
          {LATER_CHAPTERS.map((c) => <span key={c.title} className="rounded-full bg-bg-subtle px-2.5 py-1 text-xs font-semibold text-ink-soft">{c.title}</span>)}
        </div>
      </section>

      {/* Made for here */}
      <section className="border-y border-line/70 bg-bg-elevated/60">
        <div className="mx-auto grid max-w-5xl gap-6 px-4 py-14 md:grid-cols-[1fr_1.4fr]">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-muted">Built for Ghanaian campuses</p>
            <h2 className="mt-1 font-display text-3xl leading-tight">Works on your phone, your data and your signal</h2>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            <Feature icon={<Smartphone className="size-5" />} title="Phone first" body="Big buttons, short steps, one thing at a time. No laptop needed." />
            <Feature icon={<CloudOff className="size-5" />} title="Keeps working offline" body="Write in the hall with no signal. It syncs when you're back online." />
            <Feature icon={<MessageCircle className="size-5" />} title="WhatsApp invites" body="Share your group code where your class already talks." />
            <Feature icon={<Lock className="size-5" />} title="Fair by design" body="Ideas and votes stay sealed until everyone's in — no copying, no crowd-following." />
          </ul>
        </div>
      </section>

      {/* Lecturers */}
      <section className="mx-auto max-w-5xl px-4 py-14">
        <div className="overflow-hidden rounded-[28px] bg-night text-accent-fg shadow-[var(--shadow-lift)]">
          <div className="kente h-1.5" />
          <div className="grid gap-6 p-6 sm:p-8 md:grid-cols-[1.3fr_1fr] md:items-center">
            <div>
              <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.16em] text-sun"><GraduationCap className="size-4" /> For lecturers</p>
              <h2 className="mt-2 font-display text-3xl leading-tight text-accent-fg">See every group's thinking — not just the final report</h2>
              <p className="mt-3 max-w-[48ch] text-[15px] leading-6 text-accent-fg/75">
                A cohort dashboard shows where each group is, who is contributing, and which groups have gone quiet. Read their ideas, votes, evidence and tests; leave a note; unblock a group whose missing members aren't coming.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Link to="/onboarding" search={{ role: "lecturer" }} className={buttonVariants({ variant: "sun", size: "lg", block: true })}>Set up my cohort</Link>
              <p className="text-center text-xs text-accent-fg/60">You'll need the lecturer code for your course.</p>
            </div>
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-5xl px-4 pb-10 text-xs text-faint">
        The advisor asks hard questions. It never writes your idea, invents statistics or picks a winner.
      </footer>
    </main>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">{icon}</span>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm leading-5 text-muted">{body}</span>
      </span>
    </li>
  );
}
