import { createFileRoute, Link } from "@tanstack/react-router";
import { SignedIn, SignedOut } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { STAGES, EMBLEMS } from "@/lib/domain/stages";
import { buttonVariants } from "@/components/ui/button-variants";
import { KenteBand } from "@/components/ui/kente";
import { Emblem } from "@/components/ui/emblem";
import { Stamp } from "@/components/ui/stamp";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { isPending } = useCurrentUserState();
  return (
    <main className="min-h-dvh text-ink">
      <KenteBand />
      <div className="mx-auto max-w-5xl px-5 pt-10 pb-16 sm:pt-16">
        <div className="flex items-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-[8px] border-2 border-ink bg-gold">
            <Emblem emblem="adinkrahene" className="size-7" />
          </span>
          <p className="font-display text-lg font-extrabold">{APP_NAME}</p>
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[1.2fr_1fr] lg:items-end">
          <div>
            <Stamp tone="clay" tilt={-4} size="sm">
              Entrepreneurship, practised
            </Stamp>
            <h1 className="mt-4 font-display text-[2.6rem] leading-[0.98] font-extrabold tracking-[-0.03em] sm:text-6xl">
              {APP_TAGLINE}
            </h1>
            <p className="mt-5 max-w-[46ch] text-lg leading-8 text-ink-soft">
              Find a real problem in your hostel, market or lorry station. Talk to the people who have it.
              Build the cheapest test you can. Run the numbers with real prices. Then defend every claim
              — with evidence — on pitch day.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              {isPending ? (
                <div className="h-12 w-48 animate-pulse rounded-[10px] bg-bg-subtle" />
              ) : (
                <>
                  <SignedIn>
                    <Link to="/studio" className={buttonVariants({ size: "lg" })}>
                      Continue to your studio
                    </Link>
                  </SignedIn>
                  <SignedOut>
                    <Link to="/login" className={buttonVariants({ size: "lg" })}>
                      Start as a student
                    </Link>
                  </SignedOut>
                </>
              )}
              <Link to="/lecturer" className="text-sm font-semibold text-ink-soft underline underline-offset-4">
                I teach this course →
              </Link>
            </div>
            <p className="mt-4 text-xs text-muted">Works on any phone, and keeps working when the network drops.</p>
          </div>

          <div className="rounded-[12px] border-2 border-ink bg-bg-elevated p-4 shadow-[5px_5px_0_0_var(--color-ink)]">
            <p className="font-mono text-[10.5px] tracking-[0.16em] text-muted uppercase">The route · 11 stops</p>
            <ol className="mt-3 grid grid-cols-1 gap-y-1.5 sm:grid-cols-2 sm:gap-x-4">
              {STAGES.map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-sm" title={EMBLEMS[s.emblem].meaning}>
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-gold-soft">
                    <Emblem emblem={s.emblem} className="size-4" />
                  </span>
                  <span>
                    <span className="font-mono text-xs text-muted">{String(s.stop).padStart(2, "0")}</span> {s.title}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-3 border-t border-line pt-3 text-xs leading-5 text-muted">
              Each stop is marked with an Adinkra symbol of the Akan people — the measuring stick for
              evidence, <em>Mate Masie</em> (“what I hear, I keep”) for interviews, <em>Sankofa</em> for
              looking back before you decide.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
