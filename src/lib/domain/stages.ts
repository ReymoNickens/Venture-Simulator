/**
 * The venture route: eleven stops from forming a team to pitch day.
 *
 * Content, not code paths: titles, missions, settings and sticker icons live here so
 * the screens stay generic and a later course configuration can re-word them.
 * Completion is computed from the record itself — never a checkbox a student
 * ticks — so "done" always means the evidence exists.
 */

export type StageId =
  | "team"
  | "spot"
  | "choose"
  | "assume"
  | "listen"
  | "canvas"
  | "feasibility"
  | "numbers"
  | "prototype"
  | "decide"
  | "pitch";

/** Vector sticker shown for each stop (see StopSticker). */
export type StopIcon =
  | "users"
  | "eye"
  | "vote"
  | "flask"
  | "mic"
  | "grid"
  | "gauge"
  | "coins"
  | "hammer"
  | "compass"
  | "megaphone";

/** Sticker colour for each stop. */
export type Tint = "butter" | "coral" | "lilac" | "cobalt" | "mint" | "pink";

export interface StageDef {
  id: StageId;
  stop: number;
  title: string;
  /** One line for the route map. */
  short: string;
  /** What to do, in one or two short sentences. */
  mission: string;
  /** Where in Cape Coast this stop tends to happen. */
  setting: string;
  /** Shown while the stop is still ahead: enough to want it, not enough to know it. */
  teaser: string;
  /** Said when the stop is done — the payoff. */
  payoff: string;
  icon: StopIcon;
  tint: Tint;
  href:
    | "/studio/group"
    | "/studio/opportunity"
    | "/studio/select"
    | "/studio/venture"
    | "/studio/listen"
    | "/studio/canvas"
    | "/studio/feasibility"
    | "/studio/numbers"
    | "/studio/prototype"
    | "/studio/decide"
    | "/studio/pitch";
  /** Needs a ratified venture before it opens. */
  needsVenture: boolean;
}

export const STAGES: StageDef[] = [
  {
    id: "team",
    stop: 1,
    title: "Team up",
    short: "Form your group",
    mission: "Start a group or join one with a code. Nobody is the boss yet.",
    setting: "Sam Jonah Library",
    teaser: "Every venture starts with the people around the table.",
    payoff: "Your crew is set. Now each of you goes out alone.",
    icon: "users",
    tint: "butter",
    href: "/studio/group",
    needsVenture: false,
  },
  {
    id: "spot",
    stop: 2,
    title: "Spot a problem",
    short: "Your own opportunity",
    mission: "Go out and find one real problem you can see or count. Alone — your group sees it only when everyone is done.",
    setting: "Your hall, Science Market, Kotokuraba",
    teaser: "Somewhere between your hall and Kotokuraba, someone is losing time or money every day.",
    payoff: "Sealed. When the last teammate submits, every idea opens at once.",
    icon: "eye",
    tint: "coral",
    href: "/studio/opportunity",
    needsVenture: false,
  },
  {
    id: "choose",
    stop: 3,
    title: "Choose together",
    short: "Compare and decide",
    mission: "Read every idea. Pick yours first, then the group votes. A majority decides.",
    setting: "Wherever your group meets",
    teaser: "Ten ideas go in. One comes out.",
    payoff: "You have a venture. Now find out if it is true.",
    icon: "vote",
    tint: "lilac",
    href: "/studio/select",
    needsVenture: false,
  },
  {
    id: "assume",
    stop: 4,
    title: "What must be true?",
    short: "Assumptions & evidence",
    mission: "Write down what must be true for this to work. Mark the ones that would sink it.",
    setting: "Your group chat",
    teaser: "Every idea hides a guess that could sink it. You will find yours.",
    payoff: "You know what could kill it. Next: go and ask.",
    icon: "flask",
    tint: "cobalt",
    href: "/studio/venture",
    needsVenture: true,
  },
  {
    id: "listen",
    stop: 5,
    title: "Go and listen",
    short: "Customer interviews",
    mission: "Talk to the people with the problem. Ask what happened last time — not whether they like your idea.",
    setting: "Kotokuraba, Science Market, the halls",
    teaser: "You leave the classroom. Someone in Cape Coast has the answer you need.",
    payoff: "You heard it from them, not from your head. That changes everything after this.",
    icon: "mic",
    tint: "pink",
    href: "/studio/listen",
    needsVenture: true,
  },
  {
    id: "canvas",
    stop: 6,
    title: "Model the business",
    short: "Business model canvas",
    mission: "Fill nine blocks. Link each to evidence — anything unlinked stays a guess.",
    setting: "On one page",
    teaser: "Nine blocks. Most businesses leave half of them as wishes.",
    payoff: "Your whole business on one page — and you know which parts are real.",
    icon: "grid",
    tint: "mint",
    href: "/studio/canvas",
    needsVenture: true,
  },
  {
    id: "feasibility",
    stop: 7,
    title: "Can it work?",
    short: "Feasibility",
    mission: "Judge it four ways: market, delivery, team, money. Back every verdict.",
    setting: "Four honest questions",
    teaser: "Four questions every investor asks. Better you ask them first.",
    payoff: "You have looked at it from every side.",
    icon: "gauge",
    tint: "butter",
    href: "/studio/feasibility",
    needsVenture: true,
  },
  {
    id: "numbers",
    stop: 8,
    title: "Run the numbers",
    short: "Costs, price, break-even",
    mission: "Price every cost for real — ask at Kotokuraba, keep receipts. Find the sales that cover your costs.",
    setting: "Kotokuraba and Science Market stalls",
    teaser: "One number decides whether this is a business or a hobby.",
    payoff: "You know your break-even. Most student plans never do.",
    icon: "coins",
    tint: "coral",
    href: "/studio/numbers",
    needsVenture: true,
  },
  {
    id: "prototype",
    stop: 9,
    title: "Build & test",
    short: "Prototype and user tests",
    mission: "Make the cheapest version you can this week. Put it in front of five real people. Watch what they do.",
    setting: "A table at Science, a hall corridor, a WhatsApp status",
    teaser: "You will put something real in someone’s hands. Their face tells you more than any survey.",
    payoff: "Real people touched it. Now you decide with your eyes open.",
    icon: "hammer",
    tint: "lilac",
    href: "/studio/prototype",
    needsVenture: true,
  },
  {
    id: "decide",
    stop: 10,
    title: "Persevere, pivot or stop",
    short: "The honest decision",
    mission: "Look back at everything you found. Decide together: carry on, change, or stop.",
    setting: "Looking back",
    teaser: "The hardest call in business. Stopping can be the right answer.",
    payoff: "You made the call on evidence. That is the skill.",
    icon: "compass",
    tint: "cobalt",
    href: "/studio/decide",
    needsVenture: true,
  },
  {
    id: "pitch",
    stop: 11,
    title: "Pitch day",
    short: "Plan and pitch",
    mission: "Your plan is already built from your record. Write the four parts only you can write, then pitch.",
    setting: "In front of the room",
    teaser: "Everything you gathered becomes one story. You tell it.",
    payoff: "Route complete. You did the real thing.",
    icon: "megaphone",
    tint: "pink",
    href: "/studio/pitch",
    needsVenture: true,
  },
];

export const STAGE_BY_ID = Object.fromEntries(STAGES.map((s) => [s.id, s])) as Record<StageId, StageDef>;

export const CANVAS_BLOCKS = [
  { key: "segments", title: "Customer segments", prompt: "Who exactly has this problem? Which ones will pay first?" },
  { key: "value", title: "Value proposition", prompt: "What gets better for them — in their words, not yours?" },
  { key: "channels", title: "Channels", prompt: "How do they hear about you and get it? WhatsApp status, hall reps, a stall at Science?" },
  { key: "relationships", title: "Customer relationships", prompt: "Why do they come back — and what makes them trust you?" },
  { key: "revenue", title: "Revenue streams", prompt: "Who pays, how much, how often, and by what means — cash, MoMo?" },
  { key: "resources", title: "Key resources", prompt: "What must you have: equipment, space, skills, stock?" },
  { key: "activities", title: "Key activities", prompt: "What must you do every week for this to work?" },
  { key: "partners", title: "Key partners", prompt: "Who must say yes: hall management, Kotokuraba suppliers, drivers, the Metro Assembly?" },
  { key: "costs", title: "Cost structure", prompt: "What costs the most — and which costs rise when the cedi falls?" },
] as const;

export type CanvasBlockKey = (typeof CANVAS_BLOCKS)[number]["key"];

export const FEASIBILITY_LENSES = [
  {
    key: "market",
    title: "Market",
    question: "Do enough people have this problem, badly enough, and can you reach them?",
  },
  {
    key: "technical",
    title: "Technical / operational",
    question: "Can you actually deliver it — with the skills, tools and suppliers available to you?",
  },
  {
    key: "organisational",
    title: "Organisational",
    question: "Does your team have the time, roles and permissions (hall, school, assembly) to run it?",
  },
  {
    key: "financial",
    title: "Financial",
    question: "Can it cover its costs, and can you raise what it takes to start?",
  },
] as const;

export type FeasibilityLens = (typeof FEASIBILITY_LENSES)[number]["key"];

export const VERDICTS = [
  { value: "promising", label: "Promising" },
  { value: "uncertain", label: "Uncertain" },
  { value: "concerning", label: "Concerning" },
] as const;

export const PROTOTYPE_KINDS = [
  { value: "paper", label: "Paper / sketch mock-up" },
  { value: "digital_mockup", label: "Digital mock-up (Canva, Figma, slides)" },
  { value: "whatsapp", label: "WhatsApp catalogue or group" },
  { value: "landing", label: "Simple web page or form" },
  { value: "physical", label: "Physical sample" },
  { value: "service_trial", label: "Service trial / pop-up stall" },
  { value: "other", label: "Other" },
] as const;

export const PLAN_SECTIONS = [
  { key: "summary", title: "Executive summary", prompt: "In one page: the problem, who has it, what you offer, why you believe it will work — and what you still do not know." },
  { key: "team", title: "The team", prompt: "Who does what? What has each person actually contributed so far?" },
  { key: "risks", title: "Risks and what you will do", prompt: "Your most dangerous remaining assumptions, and how you would test each one next." },
  { key: "ask", title: "The ask", prompt: "What do you need — money, a partner, permission, a pilot site — and exactly what will you do with it?" },
] as const;

export type PlanSectionKey = (typeof PLAN_SECTIONS)[number]["key"];

// ── Progress ────────────────────────────────────────────────────────────────

export interface StageInput {
  inGroup: boolean;
  activeMembers: number;
  mySubmitted: boolean;
  submittedCount: number;
  myPreference: boolean;
  hasVenture: boolean;
  assumptions: number;
  criticalAssumptions: number;
  evidence: number;
  linkedAssumptions: number;
  interviews: number;
  interviewersMissing: string[];
  interviewsPerMember: number;
  interviewLinkedToAssumption: boolean;
  canvasBlocksFilled: number;
  canvasBlocksEvidenced: number;
  feasibilityLenses: number;
  feasibilityLensesEvidenced: number;
  hasFinanceModel: boolean;
  financePriceEvidenced: boolean;
  financeCostsSourcedShare: number;
  financeBreakEven: boolean;
  prototypes: number;
  prototypeTests: number;
  minPrototypeTests: number;
  decisionRatified: boolean;
  myDecideReflection: boolean;
  myPeerRatingsDone: boolean;
  planSectionsWritten: string[];
}

export interface Criterion {
  label: string;
  met: boolean;
  detail?: string;
}

export type StageState = "done" | "current" | "open" | "locked";

export interface StageProgress {
  id: StageId;
  state: StageState;
  criteria: Criterion[];
  met: number;
}

export function stageCriteria(id: StageId, s: StageInput): Criterion[] {
  const interviewTarget = Math.max(5, s.interviewsPerMember * Math.max(1, s.activeMembers));
  switch (id) {
    case "team":
      return [
        { label: "Join or create a group", met: s.inGroup },
        { label: "Have at least 3 active members", met: s.activeMembers >= 3, detail: `${s.activeMembers} active` },
      ];
    case "spot":
      return [
        { label: "Submit your own opportunity", met: s.mySubmitted },
        {
          label: "Every active member submits",
          met: s.activeMembers > 0 && s.submittedCount >= s.activeMembers,
          detail: `${s.submittedCount} of ${s.activeMembers}`,
        },
      ];
    case "choose":
      return [
        { label: "Record your own preference", met: s.myPreference || s.hasVenture },
        { label: "A majority ratifies one venture", met: s.hasVenture },
      ];
    case "assume":
      return [
        { label: "Write at least 3 assumptions", met: s.assumptions >= 3, detail: `${s.assumptions}` },
        { label: "Mark at least one as critical", met: s.criticalAssumptions >= 1 },
        { label: "Log at least 3 pieces of evidence", met: s.evidence >= 3, detail: `${s.evidence}` },
        { label: "Link evidence to an assumption", met: s.linkedAssumptions >= 1 },
      ];
    case "listen":
      return [
        {
          label: `Do ${interviewTarget} interviews as a group`,
          met: s.interviews >= interviewTarget,
          detail: `${s.interviews} of ${interviewTarget}`,
        },
        {
          label: "Every member does at least one",
          met: s.interviewersMissing.length === 0 && s.interviews > 0,
          detail: s.interviewersMissing.length ? `Still to go: ${s.interviewersMissing.join(", ")}` : undefined,
        },
        { label: "Link an interview to an assumption", met: s.interviewLinkedToAssumption },
      ];
    case "canvas":
      return [
        { label: "Fill all nine blocks", met: s.canvasBlocksFilled >= 9, detail: `${s.canvasBlocksFilled} of 9` },
        {
          label: "Back at least five blocks with evidence",
          met: s.canvasBlocksEvidenced >= 5,
          detail: `${s.canvasBlocksEvidenced} of 9`,
        },
      ];
    case "feasibility":
      return [
        { label: "Judge all four lenses", met: s.feasibilityLenses >= 4, detail: `${s.feasibilityLenses} of 4` },
        {
          label: "Cite evidence for every verdict",
          met: s.feasibilityLensesEvidenced >= 4,
          detail: `${s.feasibilityLensesEvidenced} of 4`,
        },
      ];
    case "numbers":
      return [
        { label: "Save your numbers", met: s.hasFinanceModel },
        { label: "Back the price with evidence", met: s.financePriceEvidenced },
        {
          label: "Source at least half the costs from real quotes",
          met: s.hasFinanceModel && s.financeCostsSourcedShare >= 0.5,
          detail: `${Math.round(s.financeCostsSourcedShare * 100)}% sourced`,
        },
        { label: "Reach a break-even point", met: s.financeBreakEven },
      ];
    case "prototype":
      return [
        { label: "Build a prototype", met: s.prototypes >= 1 },
        {
          label: `Test it with ${s.minPrototypeTests} people`,
          met: s.prototypeTests >= s.minPrototypeTests,
          detail: `${s.prototypeTests} of ${s.minPrototypeTests}`,
        },
      ];
    case "decide":
      return [
        { label: "The group ratifies a decision", met: s.decisionRatified },
        { label: "Write your reflection", met: s.myDecideReflection },
        { label: "Rate your teammates’ contribution", met: s.myPeerRatingsDone },
      ];
    case "pitch":
      return PLAN_SECTIONS.map((p) => ({
        label: `Write the ${p.title.toLowerCase()}`,
        met: s.planSectionsWritten.includes(p.key),
      }));
  }
}

/**
 * Every stop's state. The first three are sequential (you cannot choose before
 * submitting); after a venture exists, stops 4–11 are all open — real ventures
 * loop back — and the first unfinished one is marked "current" as the
 * recommended next move.
 */
export function stageProgress(s: StageInput): StageProgress[] {
  let currentAssigned = false;
  return STAGES.map((def) => {
    const criteria = stageCriteria(def.id, s);
    const met = criteria.filter((c) => c.met).length;
    const complete = met === criteria.length;
    let state: StageState;
    const reachable =
      def.id === "team"
        ? true
        : def.id === "spot"
          ? s.inGroup
          : def.id === "choose"
            ? s.inGroup && s.mySubmitted
            : s.hasVenture;
    if (!reachable) state = "locked";
    else if (complete) state = "done";
    else if (!currentAssigned) {
      state = "current";
      currentAssigned = true;
    } else state = "open";
    return { id: def.id, state, criteria, met };
  });
}

export function currentStage(progress: StageProgress[]): StageProgress | null {
  return progress.find((p) => p.state === "current") ?? null;
}
