/**
 * Activity events as plain sentences — for the team feed on Today and the
 * lecturer's "What's happening". Private acts (reflections, peer ratings) are
 * deliberately absent: they never appear in anyone's feed.
 */
const VERBS: Record<string, string> = {
  GROUP_CREATED: "started the group",
  GROUP_JOINED: "joined the group",
  GROUP_LEFT: "left the group",
  OPPORTUNITY_SUBMITTED: "sealed their opportunity",
  PREFERENCE_RECORDED: "recorded a preference",
  PROPOSAL_CREATED: "put a venture to the vote",
  PROPOSAL_ENDORSED: "endorsed the proposal",
  PROPOSAL_OBJECTED: "objected to the proposal",
  PROPOSAL_WITHDRAWN: "withdrew their proposal",
  VENTURE_CREATED: "— the group ratified its venture",
  ASSUMPTION_CREATED: "wrote down an assumption",
  ASSUMPTION_STATUS: "updated an assumption",
  EVIDENCE_CREATED: "added to the notebook",
  EVIDENCE_LINKED: "linked evidence to an assumption",
  INTERVIEW_LOGGED: "logged an interview",
  CANVAS_ENTRY_ADDED: "added to the canvas",
  CANVAS_EVIDENCE_LINKED: "backed a canvas block with evidence",
  CANVAS_ENTRY_RETIRED: "crossed out a canvas note",
  FEASIBILITY_ASSESSED: "judged feasibility",
  FINANCE_SAVED: "updated the numbers",
  PROTOTYPE_CREATED: "built a prototype",
  PROTOTYPE_TESTED: "tested the prototype with someone",
  DECISION_PROPOSED: "proposed the big decision",
  DECISION_ENDORSED: "endorsed the decision",
  DECISION_OBJECTED: "objected to the decision",
  DECISION_RATIFIED: "— the group made its decision",
  PLAN_SECTION_SAVED: "wrote part of the plan",
  MARKET_EVENT_RESPONDED: "answered a market shock",
  FEEDBACK_GIVEN: "Your lecturer left feedback",
  MESSAGE_SENT: "sent a message",
  STAFF_MESSAGE: "Your lecturer sent a message",
  MEMBER_MARKED_INACTIVE: "A member was marked inactive by the lecturer",
  AI_SESSION_STARTED: "started a conversation with the advisor",
};

/** Events that should show in a feed, and how. */
export function activitySentence(eventType: string, who: string | null): string | null {
  const verb = VERBS[eventType];
  if (!verb) return null;
  if (verb.startsWith("— ")) return `The group ${verb.slice(12)}`;
  if (/^[A-Z]/.test(verb)) return verb;
  return `${who ?? "Someone"} ${verb}`;
}

/** Field work — the things that make a group "active" in the real sense. */
export const FIELD_EVENTS = new Set(["INTERVIEW_LOGGED", "EVIDENCE_CREATED", "PROTOTYPE_TESTED"]);

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d}d` : `${Math.floor(d / 7)}w`;
}
