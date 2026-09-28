import {
  Coins,
  Compass,
  FlaskConical,
  Gauge,
  Hammer,
  LayoutGrid,
  Megaphone,
  Mic,
  ScanEye,
  Users,
  Vote,
  type LucideIcon,
} from "lucide-react";
import { STAGE_BY_ID, type StageId, type StopIcon, type Tint } from "@/lib/domain/stages";
import { cn } from "@/lib/utils";

const ICONS: Record<StopIcon, LucideIcon> = {
  users: Users,
  eye: ScanEye,
  vote: Vote,
  flask: FlaskConical,
  mic: Mic,
  grid: LayoutGrid,
  gauge: Gauge,
  coins: Coins,
  hammer: Hammer,
  compass: Compass,
  megaphone: Megaphone,
};

const TINTS: Record<Tint, string> = {
  butter: "bg-gold text-ink",
  coral: "bg-clay text-white",
  lilac: "bg-indigo text-white",
  cobalt: "bg-accent text-white",
  mint: "bg-mint text-white",
  pink: "bg-pink text-ink",
};

const SIZES = {
  xs: { box: "size-7", icon: "size-3.5" },
  sm: { box: "size-9", icon: "size-4" },
  md: { box: "size-12", icon: "size-6" },
  lg: { box: "size-16", icon: "size-8" },
  xl: { box: "size-24", icon: "size-11" },
} as const;

/**
 * A stop's sticker: a bright die-cut disc with a line icon, slightly tilted
 * like it was stuck on by hand. The same sticker marks the stop everywhere.
 */
export function StopSticker({
  stage,
  size = "md",
  tilt = true,
  muted = false,
  className,
}: {
  stage: StageId;
  size?: keyof typeof SIZES;
  tilt?: boolean;
  muted?: boolean;
  className?: string;
}) {
  const def = STAGE_BY_ID[stage];
  const Icon = ICONS[def.icon];
  const s = SIZES[size];
  return (
    <span
      aria-hidden
      className={cn(
        "sticker inline-flex shrink-0 items-center justify-center rounded-full",
        s.box,
        muted ? "bg-bg-subtle text-faint" : TINTS[def.tint],
        className,
      )}
      style={tilt ? { transform: `rotate(${(def.stop % 2 ? -1 : 1) * 6}deg)` } : undefined}
    >
      <Icon className={s.icon} strokeWidth={2.2} />
    </span>
  );
}

/** The app mark: a cobalt blob with a spark — reads as "idea in motion". */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("size-9", className)} aria-hidden>
      <path
        d="M20 3c7 0 15 4 16 12s-3 18-11 21S6 36 4 27 9 3 20 3z"
        fill="var(--color-accent)"
      />
      <path d="M21 10l-6 12h6l-2 9 8-13h-6l3-8z" fill="var(--color-gold)" stroke="#111" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

/** Hand-drawn underline for a hero word. */
export function Scribble({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 16" preserveAspectRatio="none" className={cn("h-3 w-full", className)} aria-hidden>
      <path d="M3 11c30-7 62-9 96-6s67 4 98-3" fill="none" stroke="var(--color-clay)" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/** A four-point sparkle doodle. */
export function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-5", className)} aria-hidden>
      <path d="M12 1c1 6 5 10 11 11-6 1-10 5-11 11-1-6-5-10-11-11 6-1 10-5 11-11z" fill="currentColor" />
    </svg>
  );
}
