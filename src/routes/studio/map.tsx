import { createFileRoute } from "@tanstack/react-router";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { progressFromSnapshot } from "@/lib/domain/stage-input";
import { RouteMap } from "@/components/shell/RouteMap";
import { Eyebrow } from "@/components/ui/badge";
import { Loading } from "@/components/ui/feedback";
import { KenteBand } from "@/components/ui/kente";

export const Route = createFileRoute("/studio/map")({ component: RoutePage });

function RoutePage() {
  const { data, loading } = useStudioWorkspace();
  if (loading || !data) return <Loading />;
  const progress = progressFromSnapshot(data);
  const done = progress.filter((p) => p.state === "done").length;
  return (
    <div className="space-y-4">
      <div>
        <Eyebrow>The route</Eyebrow>
        <h1 className="mt-1 font-display text-3xl font-extrabold">From a problem to a pitch</h1>
        <p className="mt-2 max-w-[60ch] text-sm leading-6 text-muted">
          Eleven stops. The first three happen in order. Once your group has a venture, every stop
          is open — real ventures loop back — and the bus shows where to go next. A stop is done
          only when the record shows it, not when someone ticks a box.
        </p>
      </div>
      <div className="overflow-hidden rounded-[12px] border-2 border-ink bg-bg-elevated">
        <KenteBand thin />
        <div className="flex items-center justify-between px-4 pt-3">
          <p className="font-display text-sm font-bold">{done} of 11 stops done</p>
          <div className="h-2 w-32 overflow-hidden rounded-full bg-bg-subtle">
            <div className="h-full bg-accent" style={{ width: `${(done / 11) * 100}%` }} />
          </div>
        </div>
        <div className="px-3 pt-1 pb-3">
          <RouteMap progress={progress} milestones={data.life.milestones} />
        </div>
      </div>
    </div>
  );
}
