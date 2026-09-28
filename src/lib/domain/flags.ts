/**
 * Attention flags for teaching staff.
 *
 * One lecturer to four hundred students cannot read every record, so the
 * console works by exception: these deterministic rules decide which groups
 * surface first, and say why in plain words. No AI — a lecturer must be able
 * to trust (and explain) why a group was flagged.
 */

export type FlagCode =
  | "STALLED"
  | "WAITING_ON_MEMBERS"
  | "SILENT_MEMBERS"
  | "UNTESTED_CRITICAL"
  | "OPINION_HEAVY"
  | "ADVISOR_OVER_FIELDWORK"
  | "BEHIND_MILESTONE"
  | "SHOCK_UNANSWERED";

export type FlagSeverity = "high" | "medium" | "low";

export interface Flag {
  code: FlagCode;
  severity: FlagSeverity;
  message: string;
}

export interface GroupMetrics {
  activeMembers: number;
  daysSinceActivity: number | null;
  /** Active members with no recorded action in the last 14 days. */
  silentMembers: string[];
  /** Stage the group is waiting on others for: members not yet submitted/voted. */
  waitingOn: string[];
  waitingDays: number;
  criticalAssumptions: number;
  criticalUntested: number;
  evidence: number;
  opinionOrAssumptionEvidence: number;
  advisorMessages7d: number;
  fieldRecords7d: number;
  /** Stop numbers overdue: the group has not completed a stage past its due date. */
  overdueStages: string[];
  unansweredShocks: number;
}

const SEVERITY_WEIGHT: Record<FlagSeverity, number> = { high: 100, medium: 30, low: 10 };

export function groupFlags(m: GroupMetrics): Flag[] {
  const flags: Flag[] = [];
  if (m.daysSinceActivity === null || m.daysSinceActivity >= 7) {
    flags.push({
      code: "STALLED",
      severity: m.daysSinceActivity === null || m.daysSinceActivity >= 14 ? "high" : "medium",
      message:
        m.daysSinceActivity === null
          ? "No activity recorded yet."
          : `No activity for ${m.daysSinceActivity} days.`,
    });
  }
  if (m.waitingOn.length && m.waitingDays >= 3) {
    flags.push({
      code: "WAITING_ON_MEMBERS",
      severity: m.waitingDays >= 7 ? "high" : "medium",
      message: `Group blocked for ${m.waitingDays} days waiting on ${m.waitingOn.join(", ")}.`,
    });
  }
  if (m.silentMembers.length) {
    flags.push({
      code: "SILENT_MEMBERS",
      severity: m.silentMembers.length >= Math.ceil(m.activeMembers / 2) ? "high" : "medium",
      message: `No contribution in 14 days: ${m.silentMembers.join(", ")}.`,
    });
  }
  if (m.criticalUntested > 0) {
    flags.push({
      code: "UNTESTED_CRITICAL",
      severity: "medium",
      message: `${m.criticalUntested} critical assumption${m.criticalUntested === 1 ? "" : "s"} with no evidence either way.`,
    });
  }
  if (m.evidence >= 4 && m.opinionOrAssumptionEvidence / m.evidence >= 0.6) {
    flags.push({
      code: "OPINION_HEAVY",
      severity: "low",
      message: "Most of the “evidence” is opinion or assumption — little has been observed or measured.",
    });
  }
  if (m.advisorMessages7d >= 15 && m.fieldRecords7d === 0) {
    flags.push({
      code: "ADVISOR_OVER_FIELDWORK",
      severity: "low",
      message: "Talking to the AI advisor a lot, but logging no field work this week.",
    });
  }
  if (m.overdueStages.length) {
    flags.push({
      code: "BEHIND_MILESTONE",
      severity: "high",
      message: `Past the deadline for: ${m.overdueStages.join(", ")}.`,
    });
  }
  if (m.unansweredShocks > 0) {
    flags.push({
      code: "SHOCK_UNANSWERED",
      severity: "low",
      message: `${m.unansweredShocks} market shock${m.unansweredShocks === 1 ? "" : "s"} past due with missing responses.`,
    });
  }
  return flags;
}

/** Sort key: higher means the lecturer should look sooner. */
export function attentionScore(flags: Flag[]): number {
  return flags.reduce((acc, f) => acc + SEVERITY_WEIGHT[f.severity], 0);
}
