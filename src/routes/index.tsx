import { createFileRoute, Link } from "@tanstack/react-router";
import { SignedIn, SignedOut } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { buttonVariants } from "@/components/ui/button-variants";
import { LogoMark, StepSticker } from "@/components/ui/sticker";
import type { JourneyId } from "@/lib/domain/state-machine";

export const Route = createFileRoute("/")({ component: Home });

/** The semester in the words a lecturer would use on the first day. */
const SEMESTER: { step: JourneyId; title: string; body: string }[] = [
  { step: "group", title: "Form a group", body: "A group leader starts it and sends the others an invite link. Up to ten classmates." },
  { step: "opportunity", title: "Go and look", body: "Each of you writes up one problem you saw with your own eyes." },
  { step: "submit", title: "Hand it in", body: "Nobody sees the others’ problems until they have handed in their own." },
  { step: "select", title: "Choose one together", body: "The group picks the problem most worth working on." },
  { step: "evidence", title: "Collect evidence", body: "Counts, interviews, photos. What did people actually say and do?" },
  { step: "assumptions", title: "Test what you’re unsure of", body: "Write down the guesses your idea depends on, then check them." },
  { step: "simulate", title: "Run a food stall", body: "Six weeks in a simulated campus market: price, stock and cash." },
];

function Home() {
  const { isPending } = useCurrentUserState();
  return (
    <main className="min-h-dvh text-ink">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5">
        <LogoMark full />
        <SignedOut>
          <Link to="/login" className={buttonVariants({ size: "sm", variant: "secondary" })}>
            Sign in
          </Link>
        </SignedOut>
      </div>

      <div className="mx-auto max-w-3xl px-5 pt-6 pb-20">
        <h1 className="max-w-[16ch] font-display text-[44px] leading-[1.02] font-extrabold sm:text-7xl">
          Your venture starts with something <span className="mark">you have seen.</span>
        </h1>
        <p className="mt-5 max-w-[56ch] text-lg leading-8 text-ink-soft">
          In ENT 302 your group goes out into Cape Coast (the shuttle stops, Kotokuraba, the hostels around campus) and
          writes down problems people really have. You choose one together, gather evidence, test what you’re unsure of,
          and finish the semester running a food stall in a market simulation.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3">
          {isPending ? (
            <div className="h-13 w-40 animate-pulse rounded-full bg-bg-subtle" />
          ) : (
            <>
              <SignedIn>
                <Link to="/studio" className={buttonVariants({ size: "lg" })}>
                  Continue where you left off
                </Link>
              </SignedIn>
              <SignedOut>
                <Link to="/login" className={buttonVariants({ size: "lg" })}>
                  Sign in with your phone number
                </Link>
              </SignedOut>
            </>
          )}
          <span className="text-sm text-muted">Works on any phone, and keeps your work if the network drops.</span>
        </div>

        <figure className="tape mt-16 -rotate-1 rounded-[6px] border border-line bg-bg-elevated p-5 pt-7 shadow-[0_10px_24px_-14px_rgba(26,23,20,0.45)] [background-image:repeating-linear-gradient(to_bottom,transparent_0_31px,var(--color-line)_31px_32px)] sm:p-7">
          <figcaption className="text-xs font-bold tracking-wide text-muted uppercase">From a student’s field notebook</figcaption>
          <p className="mt-1 text-sm text-muted">Tuesday, 6:50 to 7:40am · Science shuttle stop</p>
          <blockquote className="mt-3 font-hand text-[25px] leading-8 text-ink">
            Counted more than 60 people waiting at the peak, and 4 shuttles in 50 minutes. Asked 6 people: 4 had paid
            for a taxi at least once this week!
          </blockquote>
        </figure>
        <p className="mt-5 text-[15px] text-ink-soft">
          Notes like this start every venture here: <span className="mark font-semibold">counted, not guessed.</span>
        </p>

        <section className="mt-14" aria-labelledby="semester-title">
          <h2 id="semester-title" className="font-display text-[28px] font-extrabold">
            How the semester runs
          </h2>
          <ol className="mt-5 space-y-4">
            {SEMESTER.map((s) => (
              <li key={s.step} className="flex items-start gap-4">
                <StepSticker step={s.step} size="md" />
                <div className="pt-1">
                  <p className="font-display text-lg font-extrabold">{s.title}</p>
                  <p className="text-[15px] leading-6 text-muted">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
