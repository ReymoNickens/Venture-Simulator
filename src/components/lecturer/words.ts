// Activity event types in the words a lecturer would use.
const EVENT_WORDS: Record<string, string> = {
  GROUP_CREATED: "created the group",
  GROUP_JOINED: "joined the group",
  OPPORTUNITY_CREATED: "started writing up a problem",
  OPPORTUNITY_SUBMITTED: "submitted their problem",
  SELECTION_STARTED: "opened picking (everyone had submitted)",
  GROUP_STATUS: "moved the group to its next stage",
  PREFERENCE_RECORDED: "recorded which problem they would pick",
  OPPORTUNITY_SELECTED: "recorded the group's choice",
  VENTURE_CREATED: "recorded the group's choice",
  EVIDENCE_CREATED: "logged evidence",
  ASSUMPTION_CREATED: "added an assumption",
  EVIDENCE_LINKED: "linked evidence to an assumption",
  AI_SESSION_STARTED: "started a conversation with the advisor",
  SIMULATION_STARTED: "launched the simulated venture",
  SIMULATION_DECISIONS_SUBMITTED: "submitted a week in the simulation",
};

export function eventWords(type: string): string {
  return EVENT_WORDS[type] ?? type.toLowerCase().replaceAll("_", " ");
}

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 14) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}
