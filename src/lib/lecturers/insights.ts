// What a lecturer should look at first. Pure functions over a group's
// numbers, so the rules are easy to test and to change. Groups with no
// reasons are "on track" and stay out of the way.

export interface GroupSignals {
  groupId: string;
  groupName: string;
  groupNumber: number;
  offeringId: string;
  status: string;
  ventureName: string | null;
  /** `synthetic` marks practice peers in a demonstration group: never "idle". */
  members: { studentId: string; fullName: string; events: number; synthetic?: boolean }[];
  submitted: number;
  required: number;
  evidenceTotal: number;
  /** Evidence the group itself classified as opinion, assumption or unknown. */
  evidenceWeak: number;
  assumptionsTotal: number;
  /** Critical assumptions with no evidence linked either way. */
  criticalUntested: number;
  sim: { status: string; completedPeriod: number; periodCount: number; cash: number } | null;
  lastActivityAt: string | null;
  feedbackCount: number;
}

export type Reason = { code: string; text: string; severity: 1 | 2 | 3 };

const DAY = 86_400_000;
export const QUIET_DAYS = 7;

export function attentionFor(g: GroupSignals, now = new Date()): Reason[] {
  const out: Reason[] = [];
  if (g.sim?.status === "cash_out") {
    out.push({ code: "cash_out", text: `Ran out of cash in week ${g.sim.completedPeriod} of the simulation`, severity: 3 });
  }
  const last = g.lastActivityAt ? new Date(g.lastActivityAt).getTime() : null;
  if (last !== null) {
    const days = Math.floor((now.getTime() - last) / DAY);
    if (days >= QUIET_DAYS) out.push({ code: "quiet", text: `No activity for ${days} days`, severity: 3 });
  }
  const real = g.members.filter((m) => !m.synthetic);
  const totalEvents = real.reduce((a, m) => a + m.events, 0);
  if (real.length >= 3 && totalEvents >= 10) {
    const idle = real.filter((m) => m.events === 0);
    if (idle.length) {
      const names = idle.slice(0, 3).map((m) => m.fullName.split(" ")[0]);
      const more = idle.length > 3 ? ` and ${idle.length - 3} more` : "";
      out.push({
        code: "uneven",
        text: `${names.join(", ")}${more} ${idle.length === 1 ? "has" : "have"} not done anything yet`,
        severity: 2,
      });
    }
  }
  if (g.ventureName && g.evidenceTotal === 0) {
    out.push({ code: "no_evidence", text: "Venture chosen, but no evidence logged yet", severity: 2 });
  }
  if (g.evidenceTotal >= 3 && g.evidenceWeak / g.evidenceTotal > 0.6) {
    out.push({
      code: "weak_evidence",
      text: `Most evidence is opinion or guesswork (${g.evidenceWeak} of ${g.evidenceTotal})`,
      severity: 2,
    });
  }
  if (g.criticalUntested > 0) {
    out.push({
      code: "untested",
      text: `${g.criticalUntested} critical ${g.criticalUntested === 1 ? "assumption has" : "assumptions have"} no evidence linked`,
      severity: 1,
    });
  }
  return out.sort((a, b) => b.severity - a.severity);
}

/** Where the group is in the journey, in a few words. */
export function stageLabel(g: GroupSignals): string {
  if (g.sim) {
    if (g.sim.status === "cash_out") return "Out of cash";
    if (g.sim.completedPeriod >= g.sim.periodCount || g.sim.status === "exited") return "Simulation finished";
    return `Simulation week ${g.sim.completedPeriod + 1} of ${g.sim.periodCount}`;
  }
  if (g.ventureName) return g.evidenceTotal ? "Collecting evidence" : "Venture chosen";
  if (g.status === "selection_ready" || g.status === "selection") return "Choosing a problem";
  if (g.required > 0) return `${g.submitted} of ${g.required} problems submitted`;
  return "Forming";
}

/** One-tap feedback lecturers can send, editable before sending. */
export const FEEDBACK_PHRASES = [
  "Your evidence is mostly opinion. Go and observe or count something this week.",
  "Strong interviews. Now link them to the assumptions they test.",
  "Your riskiest assumption is still untested. Design the cheapest test for it.",
  "Good reasoning. Push further: what would change your mind?",
  "Not everyone is contributing. Agree who does what before the next class.",
  "Look at why cash fell last week before you decide the next one.",
] as const;
