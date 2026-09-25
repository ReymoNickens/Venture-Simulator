// Turns the raw workspace into what a student needs to see: the one next thing to do,
// and what their team has been doing — in plain sentences, not event codes.
import type { ActivityEvent, WorkspaceSnapshot } from "./types";
import { riskScore } from "./state-machine";

export type Chapter = "team" | "idea" | "decide" | "evidence" | "assumptions" | "test";

export const CHAPTER_COLOR: Record<Chapter, string> = {
  team: "var(--color-ch-team)",
  idea: "var(--color-ch-idea)",
  decide: "var(--color-ch-decide)",
  evidence: "var(--color-ch-evidence)",
  assumptions: "var(--color-ch-assumptions)",
  test: "var(--color-ch-test)",
};

export interface NextStep {
  chapter: Chapter;
  title: string;
  body: string;
  cta: string;
  href: string;
  search?: Record<string, string>;
  waiting?: boolean;
}

export function nextStep(d: WorkspaceSnapshot): NextStep {
  const first = (n: string) => n.split(" ")[0];
  if (!d.group) {
    return { chapter: "team", title: "Find your team", body: "Ventures are built in groups. Join with the code your lecturer or classmates gave you, or start a group and invite them.", cta: "Join or start a group", href: "/studio/group" };
  }
  const active = d.members.filter((m) => m.membershipStatus === "active");
  const mine = d.myOpportunity;
  if (!mine || mine.status === "draft") {
    return {
      chapter: "idea",
      title: mine ? "Finish your idea" : "Spot a real problem",
      body: mine
        ? "Your draft is saved. Finish the last questions and seal it — nobody sees it until everyone has submitted."
        : "Not a business — a problem you've actually seen on campus, in a hostel, a market or a tro-tro stop. Five short steps.",
      cta: mine ? "Continue my idea" : "Start my idea",
      href: "/studio/opportunity",
    };
  }
  if (!d.canOpenSelection) {
    const waiting = active.filter((m) => !m.hasSubmittedOpportunity).map((m) => first(m.fullName));
    return {
      chapter: "idea",
      waiting: true,
      title: "Your idea is sealed",
      body: waiting.length
        ? `Waiting on ${waiting.slice(0, 3).join(", ")}${waiting.length > 3 ? ` and ${waiting.length - 3} more` : ""}. Ideas open for comparison once everyone has submitted. Meanwhile: go and count, time or photograph your problem.`
        : "Ideas open for comparison in a moment.",
      cta: "Nudge on WhatsApp",
      href: "share",
    };
  }
  if (!d.venture) {
    if (!d.myPreference && d.eligibleVoterIds.includes(d.student?.id ?? "")) {
      return { chapter: "decide", title: "Read the ideas, then vote privately", body: `${d.visibleOpportunities.filter((o) => o.status !== "draft").length} ideas are open. Your vote stays sealed until everyone has voted.`, cta: "Compare ideas", href: "/studio/select" };
    }
    if (!d.preferencesRevealed) {
      return { chapter: "decide", waiting: true, title: "Vote recorded", body: `${d.preferenceProgress.recorded} of ${d.preferenceProgress.required} have voted. Votes are revealed together, so nobody follows the crowd.`, cta: "See the ideas again", href: "/studio/select" };
    }
    if (d.proposal) {
      const responded = d.proposal.responses.some((r) => r.studentId === d.student?.id);
      return {
        chapter: "decide",
        waiting: responded,
        title: responded ? "Waiting for the group" : `${first(d.proposal.proposedByName)} proposed a venture`,
        body: responded
          ? `${d.proposal.responses.filter((r) => r.stance === "endorse").length} of ${d.proposal.needed} endorsements so far.`
          : `“${d.proposal.name}”. Read the reasoning, then endorse it or object with a reason.`,
        cta: responded ? "View proposal" : "Respond",
        href: "/studio/select",
      };
    }
    return { chapter: "decide", title: "Votes are in — decide together", body: "Look at where the votes landed. Anyone can propose the group's venture; it needs the group's endorsement.", cta: "Propose a venture", href: "/studio/select" };
  }
  if (!d.evidence.length) {
    return { chapter: "evidence", title: "Go and collect evidence", body: "Talk to people, count, photograph. Log what you actually saw — not what you think.", cta: "Log evidence", href: "/studio/venture", search: { tab: "evidence", add: "1" } };
  }
  if (!d.assumptions.length) {
    return { chapter: "assumptions", title: "Name what could kill it", body: "Write the beliefs your venture depends on. Mark the ones that would sink it if wrong.", cta: "Add an assumption", href: "/studio/venture", search: { tab: "assumptions", add: "1" } };
  }
  const planned = d.experiments.filter((x) => x.status === "planned");
  if (planned.length) {
    return { chapter: "test", title: "Finish your test", body: `“${planned[0].hypothesis}” — go and run it, then record what happened.`, cta: "Record the result", href: "/studio/venture", search: { tab: "tests" } };
  }
  const challenged = d.assumptions.find((a) => a.status === "challenged" && !d.experiments.some((x) => x.assumptionId === a.id && x.status === "planned"));
  if (challenged) {
    return { chapter: "test", title: "A test didn't hold — now what?", body: `“${challenged.statement}” Change the idea or test it a different way. Both are progress.`, cta: "Decide what to change", href: "/studio/venture", search: { tab: "board" } };
  }
  const untested = [...d.assumptions].filter((a) => a.status === "open").sort((a, b) => riskScore(b) - riskScore(a));
  if (untested[0]) {
    return { chapter: "test", title: "Test your riskiest assumption", body: `“${untested[0].statement}” Design the cheapest test that could prove you wrong.`, cta: "Design a test", href: "/studio/venture", search: { tab: "tests", add: untested[0].id } };
  }
  return { chapter: "evidence", title: "Keep the record growing", body: "Every assumption has been tested at least once. Add new evidence, or test again with a bigger sample.", cta: "Open the venture", href: "/studio/venture" };
}

const EVENT_TEXT: Record<string, (e: ActivityEvent) => string> = {
  GROUP_CREATED: () => "started the group",
  GROUP_JOINED: () => "joined the group",
  OPPORTUNITY_SUBMITTED: () => "sealed an idea",
  SELECTION_STARTED: () => "Every idea is in — comparison is open",
  SELECTION_OPENED_BY_LECTURER: () => "Your lecturer opened comparison",
  PREFERENCE_RECORDED: () => "cast a private vote",
  PROPOSAL_MADE: () => "proposed a venture",
  PROPOSAL_ENDORSED: () => "endorsed the proposal",
  PROPOSAL_OBJECTED: () => "objected to the proposal",
  PROPOSAL_REJECTED: () => "The proposal didn't get enough support",
  VENTURE_CREATED: () => "The group chose its venture",
  EVIDENCE_CREATED: () => "logged evidence",
  ASSUMPTION_CREATED: () => "named an assumption",
  EVIDENCE_LINKED: (e) => `linked evidence that ${e.metadata?.relationshipType === "challenges" ? "challenges" : "supports"} an assumption`,
  EXPERIMENT_PLANNED: () => "designed a test",
  EXPERIMENT_COMPLETED: (e) => `finished a test — ${e.metadata?.result === "supports" ? "it held up" : e.metadata?.result === "challenges" ? "it didn't hold" : "inconclusive"}`,
  ASSUMPTION_REVISED: () => "changed their confidence in an assumption",
  LECTURER_NOTE: () => "Your lecturer left a note",
  AI_SESSION_STARTED: () => "started a conversation with the advisor",
};

const GROUP_EVENTS = new Set(["SELECTION_STARTED", "SELECTION_OPENED_BY_LECTURER", "PROPOSAL_REJECTED", "VENTURE_CREATED", "LECTURER_NOTE"]);

export function describeEvent(e: ActivityEvent, names: Map<string, string>): { who: string | null; text: string } | null {
  const fn = EVENT_TEXT[e.eventType];
  if (!fn) return null;
  // Group-level outcomes read as sentences on their own, whoever triggered them.
  const who = e.studentId && !GROUP_EVENTS.has(e.eventType) ? names.get(e.studentId) ?? null : null;
  return { who, text: fn(e) };
}

export function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function whatsappInvite(groupName: string, code: string, origin: string) {
  const text = `Join our venture group "${groupName}" on the studio: ${origin}/studio/group?code=${code} — or enter code ${code}.`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
