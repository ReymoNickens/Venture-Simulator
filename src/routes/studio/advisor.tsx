import { createFileRoute } from "@tanstack/react-router";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { AdvisorPanel } from "@/components/advisor/AdvisorPanel";
import { Eyebrow, EmptyNote } from "@/components/ui/badge";
import { Loading } from "@/components/ui/feedback";

export const Route = createFileRoute("/studio/advisor")({ component: AdvisorPage });

function AdvisorPage() {
  const { data, loading, refresh } = useStudioWorkspace();
  if (loading || !data) return <Loading />;
  if (!data.group) return <EmptyNote>Join a group first — the advisor works from your group’s record.</EmptyNote>;
  const stage = data.venture ? "evidence" : "selection";
  return (
    <div className="space-y-4">
      <div>
        <Eyebrow>Challenge, not cheerleading</Eyebrow>
        <h1 className="mt-1 font-display text-3xl font-extrabold">Advisor</h1>
        <p className="mt-2 max-w-[60ch] text-sm leading-6 text-muted">
          One conversation for your whole group — teammates see the questions you ask. It needs a
          connection; everything else in the studio works offline.
        </p>
      </div>
      <AdvisorPanel data={data} stage={stage} onSent={() => void refresh()} />
    </div>
  );
}
