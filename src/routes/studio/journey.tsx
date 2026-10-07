import { createFileRoute } from "@tanstack/react-router";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { journeyFromSnapshot } from "@/lib/domain/journey-progress";
import { JourneyMap } from "@/components/shell/JourneyMap";
import { Loading } from "@/components/ui/feedback";

export const Route = createFileRoute("/studio/journey")({ component: JourneyPage });

function JourneyPage() {
  const { data, loading } = useStudioWorkspace();
  if (loading || !data) return <Loading />;
  const progress = journeyFromSnapshot(data);
  const pct = Math.round((progress.doneCount / progress.total) * 100);
  return (
    <div className="flow-enter space-y-5 pt-2">
      <div>
        <p className="text-xs font-semibold text-muted">
          {progress.doneCount} of {progress.total} steps done
        </p>
        <h1 className="font-display text-[32px] leading-none font-extrabold">The seven steps</h1>
        <div
          className="mt-4 h-1.5 overflow-hidden rounded-full bg-bg-subtle"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progress through the steps"
        >
          <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <JourneyMap progress={progress} />
    </div>
  );
}
