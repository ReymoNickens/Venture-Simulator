import { createFileRoute, Link } from "@tanstack/react-router";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/badge";

export const Route = createFileRoute("/studio/")({ component: StudioHome });

function StudioHome() {
  const { data, loading } = useStudioWorkspace();
  if (loading || !data) {
    return <div className="h-40 animate-pulse rounded-[28px] bg-bg-subtle" />;
  }

  const next = !data.group
    ? {
        title: "Join or create a group",
        body: "Work happens in groups. Capacity is configurable (default 10). You will need a join code, or you can open a demonstration cohort to walk the whole journey alone.",
        href: "/studio/group",
        cta: "Open groups",
      }
    : !data.myOpportunity || data.myOpportunity.status === "draft"
      ? {
          title: "Find and submit an opportunity",
          body: "Do not start with a business. Start with a problem you have actually seen. Your submission stays private until selection opens.",
          href: "/studio/opportunity",
          cta: "Write opportunity",
        }
      : !data.canOpenSelection
        ? {
            title: "Waiting for the group",
            body: `${data.submissionProgress.submitted} of ${data.submissionProgress.required} active members have submitted. Selection does not open early, and missing students are not treated as submitted.`,
            href: "/studio/opportunity",
            cta: "Review your submission",
          }
        : !data.venture
          ? {
              title: "Select a venture",
              body: "Compare the submissions, record your own preference first, then write why the group chose this over the alternatives.",
              href: "/studio/select",
              cta: "Open selection",
            }
          : {
              title: "Collect evidence and test assumptions",
              body: "Log what you observed. Classify it honestly. Link evidence to the assumptions that could collapse the venture.",
              href: "/studio/venture",
              cta: "Open the venture record",
            };

  return (
    <div className="space-y-5">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
          {data.offering
            ? `${data.offering.courseCode} · ${data.offering.semester} ${data.offering.academicYear}`
            : "No offering"}
        </p>
        <h1 className="font-display text-3xl">
          {data.student ? `Hello, ${data.student.fullName.split(" ")[0]}` : "Studio"}
        </h1>
        {data.group ? (
          <p className="mt-1 text-sm text-muted">
            {data.group.groupName} · Group {data.group.groupNumber} · Join code{" "}
            <span className="font-mono text-ink">{data.group.joinCode}</span>
          </p>
        ) : null}
      </div>
      <Card className="space-y-3">
        <Badge tone="accent">{data.group?.status.replaceAll("_", " ") ?? "ungrouped"}</Badge>
        <h2 className="font-display text-2xl">{next.title}</h2>
        <p className="text-sm leading-6 text-muted">{next.body}</p>
        <Link to={next.href as "/studio/group" | "/studio/opportunity" | "/studio/select" | "/studio/venture"}>
          <Button>{next.cta}</Button>
        </Link>
      </Card>
      {data.group ? (
        <Card>
          <h3 className="font-display text-lg">Members</h3>
          <ul className="mt-3 divide-y divide-line">
            {data.members
              .filter((m) => m.membershipStatus === "active")
              .map((m) => (
                <li key={m.id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    {m.fullName}
                    {m.isSynthetic ? (
                      <span className="ml-2 text-xs text-faint">demo peer</span>
                    ) : null}
                  </span>
                  <span className="text-xs text-muted">
                    {m.hasSubmittedOpportunity ? "Submitted" : "Not submitted"}
                  </span>
                </li>
              ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
