import { createFileRoute } from "@tanstack/react-router";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { progressFromSnapshot } from "@/lib/domain/stage-input";
import { RouteMap } from "@/components/shell/RouteMap";
import { Loading } from "@/components/ui/feedback";

export const Route = createFileRoute("/studio/map")({ component: RoutePage });

function RoutePage() {
  const { data, loading } = useStudioWorkspace();
  if (loading || !data) return <Loading />;
  const progress = progressFromSnapshot(data);
  const done = progress.filter((p) => p.state === "done").length;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-[34px] leading-tight font-extrabold">Your journey</h1>
        <p className="mt-1 text-[15px] text-muted">{done} of 11 stops done. Tap any open stop.</p>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-bg-subtle">
          <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.max(3, (done / 11) * 100)}%` }} />
        </div>
      </div>
      <RouteMap progress={progress} milestones={data.life.milestones} />
    </div>
  );
}
