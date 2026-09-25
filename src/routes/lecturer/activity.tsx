import { createFileRoute } from "@tanstack/react-router";
import { useStaff } from "@/hooks/lecturer-context";
import { Feed } from "@/components/lecturer/Feed";

export const Route = createFileRoute("/lecturer/activity")({ component: ActivityPage });

function ActivityPage() {
  const { offeringId } = useStaff();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-[32px] leading-tight font-extrabold">What students are doing</h1>
        <p className="mt-1 text-[15px] text-muted">Newest first. Tap a line to open that group.</p>
      </div>
      <Feed offeringId={offeringId} />
    </div>
  );
}
