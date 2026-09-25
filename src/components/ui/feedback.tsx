import { CheckCircle2, TriangleAlert } from "lucide-react";

export function FormMessages({ error, notice }: { error: string | null; notice?: string | null }) {
  if (!error && !notice) return null;
  return (
    <div aria-live="polite" className="space-y-2">
      {error ? (
        <p className="flex items-start gap-2 rounded-[8px] border-2 border-clay/40 bg-clay-soft px-3 py-2 text-sm text-clay">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="flex items-start gap-2 rounded-[8px] border-2 border-accent/30 bg-accent-soft px-3 py-2 text-sm text-accent">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          {notice}
        </p>
      ) : null}
    </div>
  );
}

export function Loading() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      <div className="h-20 animate-pulse rounded-[10px] bg-bg-subtle" />
      <div className="h-40 animate-pulse rounded-[10px] bg-bg-subtle" />
    </div>
  );
}
