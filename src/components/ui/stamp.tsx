import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "ink" | "forest" | "clay" | "gold" | "indigo" | "muted";

const TONES: Record<Tone, string> = {
  ink: "bg-ink text-white",
  forest: "bg-mint-soft text-mint",
  clay: "bg-clay-soft text-clay",
  gold: "bg-gold-soft text-gold-deep",
  indigo: "bg-indigo-soft text-indigo",
  muted: "bg-bg-subtle text-muted",
};

/**
 * A small status tag — like a sticker label. Name kept for existing callers.
 */
export function Stamp({
  children,
  tone = "ink",
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
        size === "xs" && "px-2 py-[1px] text-[10.5px]",
        size === "sm" && "px-2.5 py-0.5 text-xs",
        size === "md" && "px-3 py-1 text-sm",
        TONES[tone],
        className,
      )}
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
    <Stamp tone={CLASSIFICATION_TONE[value] ?? "ink"} size="xs">
      {value}
    </Stamp>
  );
}
