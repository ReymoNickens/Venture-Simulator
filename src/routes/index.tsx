import { createFileRoute, Link } from "@tanstack/react-router";
import { SignedIn, SignedOut } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { APP_NAME } from "@/lib/brand";
import { buttonVariants } from "@/components/ui/button-variants";
import { LogoMark, Scribble, Sparkle, StopSticker } from "@/components/ui/sticker";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { isPending } = useCurrentUserState();
  return (
    <main className="min-h-dvh overflow-hidden text-ink">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <span className="flex items-center gap-2.5">
          <LogoMark />
          <span className="font-display text-base font-bold">{APP_NAME}</span>
        </span>
        <Link to="/lecturer" className="text-sm font-semibold text-muted">
          Lecturers
        </Link>
      </div>

      <div className="mx-auto grid max-w-5xl gap-12 px-5 pt-8 pb-20 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:pt-16">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-bg-elevated px-3 py-1 text-xs font-semibold ring-1 ring-line">
            <span className="size-2 rounded-full bg-mint" /> ENT 302 · University of Cape Coast
          </p>
          <h1 className="mt-5 font-display text-[44px] leading-[0.98] font-extrabold tracking-[-0.035em] sm:text-7xl">
            Find a real problem.
            <br />
            Prove it’s{" "}
            <span className="relative inline-block">
              real
              <Scribble className="absolute -bottom-2 left-0" />
            </span>
            .
            <br />
            Pitch it.
          </h1>
          <p className="mt-6 max-w-[38ch] text-lg leading-8 text-ink-soft">
            Not another business plan assignment. You’ll go out into Cape Coast, talk to real people and build
            something they actually want.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {isPending ? (
              <div className="h-13 w-44 animate-pulse rounded-full bg-bg-subtle" />
            ) : (
              <>
                <SignedIn>
                  <Link to="/studio" className={buttonVariants({ size: "lg" })}>
                    Continue
                  </Link>
                </SignedIn>
                <SignedOut>
                  <Link to="/login" className={buttonVariants({ size: "lg" })}>
                    Start now
                  </Link>
                </SignedOut>
              </>
            )}
            <span className="text-sm text-muted">Works on any phone, even offline.</span>
          </div>
        </div>

        {/* Collage: stickers and a taped field note. Decorative only. */}
        <div aria-hidden className="relative mx-auto h-[360px] w-full max-w-[420px]">
          <div className="absolute inset-x-8 top-10 bottom-10 rounded-[36px] bg-gold" />
          <div className="note absolute top-16 left-4 w-60 rotate-[-4deg] p-4 shadow-lg">
            <p className="text-xs font-semibold text-muted">Interview · Science Market</p>
            <p className="mt-2 font-display text-lg leading-snug font-bold">“I waited 40 minutes and still missed my 8am.”</p>
          </div>
          <div className="absolute right-2 bottom-16 w-52 rotate-[5deg] rounded-[20px] bg-ink p-4 text-white shadow-lg">
            <p className="text-xs text-white/60">Break-even</p>
            <p className="font-display text-3xl font-extrabold">19 / month</p>
          </div>
          <StopSticker stage="listen" size="lg" className="absolute top-2 right-16" />
          <StopSticker stage="numbers" size="md" className="absolute bottom-4 left-10" />
          <StopSticker stage="pitch" size="lg" className="absolute right-0 top-28" />
          <StopSticker stage="spot" size="sm" className="absolute bottom-40 left-0" />
          <Sparkle className="absolute top-0 left-16 size-6 text-clay" />
          <Sparkle className="absolute right-24 bottom-2 size-5 text-accent" />
        </div>
      </div>
    </main>
  );
}
