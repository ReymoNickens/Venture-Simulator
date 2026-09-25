import { cn } from "@/lib/utils";

/** A narrow woven strip — the visual threshold of the app and of each stop. */
export function KenteBand({ className, thin = false }: { className?: string; thin?: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(thin ? "kente-thin h-1.5" : "kente h-2.5", "w-full", className)}
    />
  );
}
