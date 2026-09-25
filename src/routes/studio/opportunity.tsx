import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Lock, MessageCircleQuestion, Pencil, Users } from "lucide-react";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { OpportunityForm } from "@/components/forms/OpportunityForm";
import { Badge, Card, SectionTitle } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Empty, Skeleton } from "@/components/ui/empty";
import { Confetti } from "@/components/ui/confetti";
import { Ring } from "@/components/ui/progress";
import type { Opportunity } from "@/lib/domain/types";

export const Route = createFileRoute("/studio/opportunity")({ component: OpportunityPage });

function OpportunityPage() {
  const { data, loading, refresh } = useStudioWorkspace();
  const [editing, setEditing] = useState(false);
  const [party, setParty] = useState(0);
  if (loading || !data) return <Skeleton className="h-72" />;
  if (!data.group || !data.student) {
    return (
      <Empty
        icon={<Users className="size-5" />}
        title="Join a team first"
        body="Your idea is written for your group, so you need one before you start."
        action={<Link to="/studio/group" className={buttonVariants({})}>Find my team</Link>}
      />
    );
  }

  const mine = data.myOpportunity;
  const sealed = Boolean(mine && mine.status !== "draft");
  const p = data.submissionProgress;

  return (
    <div className="space-y-5">
      <Confetti fire={party} />
      <div className="flex items-start justify-between gap-4 animate-rise">
        <div>
          <Badge tone="sun">Chapter 2 · Your idea</Badge>
          <h1 className="mt-2 font-display text-[2rem] leading-tight">{sealed && !editing ? "Your idea is sealed" : "A problem you've seen"}</h1>
          <p className="mt-2 max-w-[52ch] text-[15px] leading-6 text-muted">
            {sealed && !editing
              ? "Nobody in your group can read it until everyone has sealed theirs — so every idea is your own."
              : "Not a business you wish existed — a real gap on campus, in a hostel, a market, a tro-tro station or a farm. AI-written ideas don't count as evidence."}
          </p>
        </div>
        <Ring value={p.submitted} max={p.required} size={56} color="var(--color-ch-idea)" label={`${p.submitted} of ${p.required} sealed`} />
      </div>

      {mine?.syncState === "pending" ? (
        <p className="rounded-[12px] bg-warn-soft px-3 py-2 text-sm text-warn">Saved on this phone — it will sync when you're back online.</p>
      ) : null}

      {sealed && !editing && mine ? (
        <SealedIdea
          opp={mine}
          canEdit={data.canEditMyOpportunity}
          onEdit={() => setEditing(true)}
          comparisonOpen={data.canOpenSelection}
        />
      ) : (
        <Card className="animate-rise">
          <OpportunityForm
            existing={mine}
            studentId={data.student.id}
            onSaved={() => void refresh()}
            onSealed={() => {
              setEditing(false);
              setParty((n) => n + 1);
            }}
          />
          {editing ? (
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setEditing(false)}>
              Cancel editing
            </Button>
          ) : null}
        </Card>
      )}

      <Link
        to="/studio/advisor"
        search={{ stage: "idea" }}
        className="animate-rise flex items-center gap-3 rounded-[18px] border border-line bg-bg-elevated p-4 transition-colors hover:border-line-strong"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-sun-soft text-[#8a5a0f]">
          <MessageCircleQuestion className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Stuck? Ask the advisor privately</span>
          <span className="block text-sm text-muted">It asks the hard questions. It won't write your idea for you.</span>
        </span>
      </Link>
    </div>
  );
}

const ROWS: { key: keyof Opportunity; label: string }[] = [
  { key: "problem", label: "Problem" },
  { key: "context", label: "Where" },
  { key: "affectedPeople", label: "Who" },
  { key: "whyItMatters", label: "Why it matters" },
  { key: "observedEvidence", label: "What I saw" },
  { key: "currentAlternatives", label: "How they cope today" },
  { key: "possibleSolution", label: "A first guess" },
  { key: "potentialCustomer", label: "Who might pay" },
  { key: "revenueMechanism", label: "How it might be paid for" },
  { key: "uncertainties", label: "What I don't know" },
];

function SealedIdea({ opp, canEdit, onEdit, comparisonOpen }: { opp: Opportunity; canEdit: boolean; onEdit: () => void; comparisonOpen: boolean }) {
  return (
    <Card className="animate-pop space-y-4 border-ch-idea/40">
      <SectionTitle
        kicker={opp.submittedAt ? `Sealed ${new Date(opp.submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "Sealed"}
        title="My idea"
        action={
          canEdit ? (
            <Button variant="secondary" size="sm" onClick={onEdit}>
              <Pencil className="size-3.5" /> Edit
            </Button>
          ) : (
            <Badge>
              <Lock className="size-3" /> Locked
            </Badge>
          )
        }
      />
      <dl className="space-y-3">
        {ROWS.filter((r) => String(opp[r.key] ?? "").trim()).map((r) => (
          <div key={r.key}>
            <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{r.label}</dt>
            <dd className="mt-0.5 whitespace-pre-line text-[15px] leading-6">{String(opp[r.key])}</dd>
          </div>
        ))}
      </dl>
      <p className="rounded-[12px] bg-bg-subtle px-3 py-2 text-xs leading-5 text-muted">
        {canEdit
          ? "You can still improve it until your group opens comparison. After that it's locked so nobody changes their idea after seeing others."
          : comparisonOpen
            ? "Locked — your group can now read and compare every idea."
            : "Locked."}
      </p>
      {comparisonOpen ? (
        <Link to="/studio/select" className={buttonVariants({ block: true })}>
          Compare ideas
        </Link>
      ) : null}
    </Card>
  );
}
