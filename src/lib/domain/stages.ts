/**
 * The venture route: eleven stops from forming a team to pitch day.
 *
 * Content, not code paths: titles, missions and Adinkra emblems live here so
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

export type EmblemKey =
  | "nkonsonkonson"
  | "ohene_aniwa"
  | "akoma_ntoaso"
  | "hwe_mu_dua"
  | "mate_masie"
  | "ananse_ntontan"
  | "dame_dame"
  | "bese_saka"
  | "aya"
  | "sankofa"
  | "adinkrahene"
  | "mframadan";

export interface Emblem {
  key: EmblemKey;
  name: string;
  /** The widely taught meaning of the Adinkra symbol (Akan, Ghana). */
  meaning: string;
}

export const EMBLEMS: Record<EmblemKey, Emblem> = {
  nkonsonkonson: { key: "nkonsonkonson", name: "Nkonsonkonson", meaning: "Chain links — unity and human relations" },
  ohene_aniwa: { key: "ohene_aniwa", name: "Ohene Aniwa", meaning: "The king’s eyes — vigilance and watchfulness" },
  akoma_ntoaso: { key: "akoma_ntoaso", name: "Akoma Ntoaso", meaning: "Linked hearts — understanding and agreement" },
  hwe_mu_dua: { key: "hwe_mu_dua", name: "Hwe Mu Dua", meaning: "Measuring stick — examination and quality control" },
  mate_masie: { key: "mate_masie", name: "Mate Masie", meaning: "“What I hear, I keep” — wisdom and prudence" },
  ananse_ntontan: { key: "ananse_ntontan", name: "Ananse Ntontan", meaning: "The spider’s web — wisdom and creativity" },
  dame_dame: { key: "dame_dame", name: "Dame-Dame", meaning: "The draughts board — intelligence and strategy" },
  bese_saka: { key: "bese_saka", name: "Bese Saka", meaning: "Sack of cola nuts — abundance and trade" },
  aya: { key: "aya", name: "Aya", meaning: "The fern — endurance and resourcefulness" },
  sankofa: { key: "sankofa", name: "Sankofa", meaning: "“Go back and get it” — learning from the past" },
  adinkrahene: { key: "adinkrahene", name: "Adinkrahene", meaning: "Chief of the symbols — greatness and leadership" },
  mframadan: { key: "mframadan", name: "Mframadan", meaning: "Wind-resistant house — fortitude and preparedness" },
};

export interface StageDef {
  id: StageId;
  stop: number;
  title: string;
  /** One line for the route map. */
  short: string;
  /** What the group must go out and do. */
  mission: string;
  emblem: EmblemKey;
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
    mission: "Create a group or join one with a code. Nobody is the boss yet — leadership is earned later.",
    emblem: "nkonsonkonson",
    href: "/studio/group",
    needsVenture: false,
  },
  {
    id: "spot",
    stop: 2,
    title: "Spot a problem",
    short: "Your own opportunity",
    mission:
      "Go out — hostel, market, lorry station, farm — and find a real problem you can see or count. Alone. Your teammates will not see it until everyone has submitted.",
    emblem: "ohene_aniwa",
    href: "/studio/opportunity",
    needsVenture: false,
  },
  {
    id: "choose",
    stop: 3,
    title: "Choose together",
    short: "Compare and decide",
    mission:
      "Compare every submission, record your own preference first, then put one forward. A majority must endorse it.",
    emblem: "akoma_ntoaso",
    href: "/studio/select",
    needsVenture: false,
  },
  {
    id: "assume",
    stop: 4,
    title: "What must be true?",
    short: "Assumptions & evidence",
    mission:
      "List what must be true for this venture to work. Mark the ones that would kill it. Start logging what you actually know.",
    emblem: "hwe_mu_dua",
    href: "/studio/venture",
    needsVenture: true,
  },
  {
    id: "listen",
    stop: 5,
    title: "Go and listen",
    short: "Customer interviews",
    mission:
      "Talk to the people who have the problem. Ask about the last time it happened and what they spent — never “would you buy my idea?”.",
    emblem: "mate_masie",
    href: "/studio/listen",
    needsVenture: true,
  },
  {
    id: "canvas",
    stop: 6,
    title: "Model the business",
    short: "Business model canvas",
    mission:
      "Fill the nine blocks — and link each one to evidence. A block with no evidence is still a guess, and the canvas will say so.",
    emblem: "ananse_ntontan",
    href: "/studio/canvas",
    needsVenture: true,
  },
  {
    id: "feasibility",
    stop: 7,
    title: "Can it work?",
    short: "Feasibility",
    mission:
      "Judge the venture through four lenses — market, technical, organisational, financial — and cite evidence for each verdict.",
    emblem: "dame_dame",
    href: "/studio/feasibility",
    needsVenture: true,
  },
  {
    id: "numbers",
    stop: 8,
    title: "Run the numbers",
    short: "Costs, price, break-even",
    mission:
      "Price every cost in the real market — get quotes, keep receipts. Find the number of sales where the venture stops losing money.",
    emblem: "bese_saka",
    href: "/studio/numbers",
    needsVenture: true,
  },
  {
    id: "prototype",
    stop: 9,
    title: "Build & test",
    short: "Prototype and user tests",
    mission:
      "Build the cheapest thing that tests your riskiest assumption — a paper mock-up, a WhatsApp catalogue, a one-day trial stall — and put it in front of real people.",
    emblem: "aya",
    href: "/studio/prototype",
    needsVenture: true,
  },
  {
    id: "decide",
    stop: 10,
    title: "Persevere, pivot or stop",
    short: "The honest decision",
    mission:
      "Look back at everything you learned. Decide as a group whether to carry on, change direction, or stop — stopping on good evidence is a success.",
    emblem: "sankofa",
    href: "/studio/decide",
    needsVenture: true,
  },
  {
    id: "pitch",
    stop: 11,
    title: "Pitch day",
    short: "Plan and pitch",
    mission:
      "Your business plan is assembled from your record — every claim traceable to evidence. Write the parts only you can write, then pitch it.",
    emblem: "adinkrahene",
    href: "/studio/pitch",
    needsVenture: true,
  },
];

export const STAGE_BY_ID = Object.fromEntries(STAGES.map((s) => [s.id, s])) as Record<StageId, StageDef>;

export const CANVAS_BLOCKS = [
  { key: "segments", title: "Customer segments", prompt: "Who exactly has this problem? Which ones will pay first?" },
  { key: "value", title: "Value proposition", prompt: "What gets better for them — in their words, not yours?" },
  { key: "channels", title: "Channels", prompt: "How do they hear about you and get it? WhatsApp status, hall reps, the market queen?" },
  { key: "relationships", title: "Customer relationships", prompt: "Why do they come back — and what makes them trust you?" },
  { key: "revenue", title: "Revenue streams", prompt: "Who pays, how much, how often, and by what means — cash, MoMo?" },
  { key: "resources", title: "Key resources", prompt: "What must you have: equipment, space, skills, stock?" },
  { key: "activities", title: "Key activities", prompt: "What must you do every week for this to work?" },
  { key: "partners", title: "Key partners", prompt: "Who must say yes: hall management, suppliers, drivers, assembly?" },
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
