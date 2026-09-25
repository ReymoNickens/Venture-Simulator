import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "ink" | "forest" | "clay" | "gold" | "indigo" | "muted";

const TONES: Record<Tone, string> = {
  ink: "text-ink",
  forest: "text-accent",
  clay: "text-clay",
  gold: "text-gold-deep",
  indigo: "text-indigo",
  muted: "text-faint",
};

/**
 * A rubber stamp — how status reads on a receipt, a registry form, a marked
 * script. Slightly rotated, never a pastel pill.
 */
export function Stamp({
  children,
  tone = "ink",
  tilt = -3,
  size = "sm",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  tilt?: number;
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "stamp inline-flex shrink-0 items-center whitespace-nowrap",
        size === "xs" && "px-1.5 py-[1px] text-[9px]",
        size === "sm" && "px-2 py-0.5 text-[10.5px]",
        size === "md" && "px-3 py-1 text-sm",
        TONES[tone],
        className,
      )}
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      {children}
    </span>
  );
}

const CLASSIFICATION_TONE: Record<string, Tone> = {
  fact: "forest",
  evidence: "forest",
  inference: "indigo",
  assumption: "gold",
  opinion: "clay",
  unknown: "muted",
};

export function ClassificationStamp({ value }: { value: string }) {
  return (
    <Stamp tone={CLASSIFICATION_TONE[value] ?? "ink"} size="xs" tilt={-2}>
      {value}
    </Stamp>
  );
}
