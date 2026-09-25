import { cn } from "@/lib/utils";

const COLORS = ["#c4553b", "#d18a1e", "#6a4c93", "#2b7a78", "#1f5c45", "#34568b", "#9a4f6b", "#5d7a2e"];
export function colorFor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}
export const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";

/** Initials avatar. `ring` shows status: done (green), waiting (dashed), none. */
export function Avatar({
  name,
  size = 36,
  ring = "none",
  className,
  title,
}: {
  name: string;
  size?: number;
  ring?: "done" | "waiting" | "none" | "you";
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title ?? name}
      className={cn(
        "relative inline-grid shrink-0 place-items-center rounded-full font-semibold text-white",
        ring === "done" && "ring-2 ring-accent ring-offset-2 ring-offset-bg-elevated",
        ring === "you" && "ring-2 ring-sun ring-offset-2 ring-offset-bg-elevated",
        ring === "waiting" && "outline-2 outline-dashed outline-line-strong outline-offset-2 opacity-70",
        className,
      )}
      style={{ width: size, height: size, background: colorFor(name), fontSize: Math.round(size * 0.38) }}
      aria-label={title ?? name}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({ names, max = 5, size = 28 }: { names: string[]; max?: number; size?: number }) {
  const shown = names.slice(0, max);
  return (
    <span className="flex items-center">
      {shown.map((n, i) => (
        <Avatar key={`${n}-${i}`} name={n} size={size} className={cn(i > 0 && "-ml-2 ring-2 ring-bg-elevated")} />
      ))}
      {names.length > max ? <span className="-ml-1 pl-2 text-xs font-semibold text-muted">+{names.length - max}</span> : null}
    </span>
  );
}
