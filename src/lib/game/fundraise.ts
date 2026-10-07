// The fundraising game: ten days in Cape Coast to raise the money your
// venture needs before it can open. Pure rules, no React and no network, so
// every outcome can be tested. Money is in whole cedis (it is a game).
//
// The point is the struggle the owner described: money does not appear.
// You start with what your life card gives you, then spend time, energy and
// trotro fares visiting people and places who might help, and live with
// what you agree to (debts with weekly repayments, a share of your venture,
// strained family trust).

export type PlaceId = "hostel" | "library" | "enterprise" | "friend" | "market" | "bank" | "microfinance" | "family";
export type Slot = 0 | 1 | 2;
export const SLOT_NAMES = ["Morning", "Afternoon", "Evening"] as const;
export const DAYS = 10;
/** The practice game's target; in the course it comes from the group's own numbers. */
export const GOAL = 1500;

export interface Place {
  name: string;
  area: string;
  /** Map position in a 360 × 460 picture. */
  x: number;
  y: number;
  blurb: string;
}

export const PLACES: Record<PlaceId, Place> = {
  hostel: { name: "Your hostel", area: "Amamoma", x: 70, y: 92, blurb: "Rest, and call people back home." },
  library: { name: "Library", area: "UCC campus", x: 200, y: 62, blurb: "Prepare your pitch, or tutor first-years for cash." },
  enterprise: { name: "Enterprise office", area: "UCC campus", x: 292, y: 150, blurb: "The student enterprise fund takes applications." },
  friend: { name: "Kojo’s hostel", area: "Kwaprow", x: 120, y: 196, blurb: "Your friend Kojo. He has a little money and a lot of opinions." },
  market: { name: "Kotokuraba Market", area: "Town", x: 96, y: 300, blurb: "Count customers, carry loads for cash, or pay into susu." },
  bank: { name: "The bank", area: "Commercial Street", x: 250, y: 286, blurb: "Loans for people who can show how they’ll pay them back." },
  microfinance: { name: "Microfinance office", area: "London Bridge", x: 300, y: 380, blurb: "Small, quick loans. Expensive." },
  family: { name: "Family house", area: "Abura", x: 54, y: 404, blurb: "Your family. They love you; their money is not endless." },
};

export interface LifeCard {
  id: string;
  title: string;
  story: string;
  cash: number;
  familyTrust: number;
  friendTrust: number;
  /** What the family could spare at most, if they trust you fully. */
  familyPot: number;
  /** Chance a call to a relative far away brings money. */
  relativeChance: number;
  relativeGift: number;
}

export const LIFE_CARDS: LifeCard[] = [
  {
    id: "shop",
    title: "Your mother runs a provisions shop",
    story: "There is some money at home, and your mother expects to hear exactly what you’ll do with it.",
    cash: 300,
    familyTrust: 70,
    friendTrust: 50,
    familyPot: 600,
    relativeChance: 0.2,
    relativeGift: 100,
  },
  {
    id: "scholarship",
    title: "You’re on a scholarship",
    story: "Your fees are paid, but your allowance barely covers food. Your family has nothing to spare.",
    cash: 40,
    familyTrust: 60,
    friendTrust: 60,
    familyPot: 60,
    relativeChance: 0.1,
    relativeGift: 50,
  },
  {
    id: "working",
    title: "You work weekends at a chop bar",
    story: "You’ve saved a little and you know how to work hard. Your family can help, but not much.",
    cash: 120,
    familyTrust: 55,
    friendTrust: 45,
    familyPot: 200,
    relativeChance: 0.15,
    relativeGift: 80,
  },
  {
    id: "uncle",
    title: "Your uncle in Accra does well",
    story: "Your own pockets are nearly empty, but your uncle has said before: “If you have a plan, call me.”",
    cash: 20,
    familyTrust: 50,
    friendTrust: 55,
    familyPot: 100,
    relativeChance: 0.6,
    relativeGift: 500,
  },
];

export type Source = "savings" | "family" | "friend" | "jobs" | "susu" | "bank" | "microfinance" | "grant" | "relative";

export interface Debt {
  source: "family" | "friend" | "bank" | "microfinance";
  amount: number;
  /** Total to pay back, spread over the venture's six weeks. */
  totalRepay: number;
  weekly: number;
  note: string;
  /** Interest per week (0.03 = 3%); none for family and friends. */
  ratePerWeek?: number;
}

export interface Offer {
  source: "bank" | "microfinance";
  amount: number;
  ratePerWeek: number;
  weeks: number;
}

export interface LogLine {
  day: number;
  text: string;
  tone: "good" | "bad" | "info";
}

export interface GameState {
  seed: number;
  /** Cedis needed to open. Older saves have none: use goalOf(). */
  goal?: number;
  cardId: string;
  day: number;
  slot: Slot;
  at: PlaceId;
  cash: number;
  energy: number;
  familyTrust: number;
  friendTrust: number;
  /** 0..3: how ready your pitch is. */
  pitch: number;
  /** 0..5: notes from counting and asking customers. */
  evidence: number;
  raised: Partial<Record<Source, number>>;
  debts: Debt[];
  equityGiven: number;
  familyAsks: number;
  friendAsked: boolean;
  shareSold: boolean;
  relativeCalled: boolean;
  susuPaid: number;
  susuToday: boolean;
  susuCollected: boolean;
  grantApplied: boolean;
  grantPaid: boolean;
  bankTriedDay: number | null;
  microfinanceTried: boolean;
  offer: Offer | null;
  familyPotLeft: number;
  log: LogLine[];
  over: boolean;
}

// -------------------------------------------------------------- randomness

/** Small seeded generator (mulberry32): the same seed and day give the same luck. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const roll = (s: GameState, salt: number) => rng(s.seed * 31 + s.day * 977 + salt)();

export const goalOf = (s: GameState) => s.goal ?? GOAL;

export function cardOf(s: GameState): LifeCard {
  return LIFE_CARDS.find((c) => c.id === s.cardId) ?? LIFE_CARDS[0];
}

export function newGame(seed: number, cardId?: string, goal: number = GOAL): GameState {
  const card = cardId ? (LIFE_CARDS.find((c) => c.id === cardId) ?? LIFE_CARDS[0]) : LIFE_CARDS[Math.floor(rng(seed)() * LIFE_CARDS.length)];
  return {
    seed,
    goal,
    cardId: card.id,
    day: 1,
    slot: 0,
    at: "hostel",
    cash: card.cash,
    energy: 100,
    familyTrust: card.familyTrust,
    friendTrust: card.friendTrust,
    pitch: 0,
    evidence: 0,
    raised: { savings: card.cash },
    debts: [],
    equityGiven: 0,
    familyAsks: 0,
    friendAsked: false,
    shareSold: false,
    relativeCalled: false,
    susuPaid: 0,
    susuToday: false,
    susuCollected: false,
    grantApplied: false,
    grantPaid: false,
    bankTriedDay: null,
    microfinanceTried: false,
    offer: null,
    familyPotLeft: card.familyPot,
    log: [{ day: 1, text: `Day 1. You have GHS ${card.cash}. Your venture needs GHS ${goal} to open in ${DAYS} days.`, tone: "info" }],
    over: false,
  };
}

// ------------------------------------------------------------------ travel

export interface TravelOption {
  mode: "walk" | "trotro";
  label: string;
  energy: number;
  fare: number;
}

export function travelOptions(s: GameState, to: PlaceId): TravelOption[] {
  if (to === s.at) return [];
  const a = PLACES[s.at];
  const b = PLACES[to];
  const far = Math.hypot(a.x - b.x, a.y - b.y) > 170 || to === "family" || s.at === "family";
  return [
    { mode: "trotro", label: "Take a trotro", energy: 5, fare: to === "family" || s.at === "family" ? 5 : 2 },
    { mode: "walk", label: "Walk", energy: far ? 30 : 12, fare: 0 },
  ];
}

export function travel(s: GameState, to: PlaceId, mode: TravelOption["mode"]): GameState {
  const opt = travelOptions(s, to).find((o) => o.mode === mode);
  if (!opt || s.over) return s;
  if (s.cash < opt.fare) return note(s, `You don’t have GHS ${opt.fare} for the trotro.`, "bad");
  if (s.energy < opt.energy) return note(s, "You’re too tired to walk that far. Rest first.", "bad");
  return { ...s, at: to, cash: s.cash - opt.fare, energy: s.energy - opt.energy, offer: to === s.at ? s.offer : null };
}

// ----------------------------------------------------------------- actions

export type ActionId =
  | "rest"
  | "call_relative"
  | "prepare_pitch"
  | "tutor"
  | "apply_grant"
  | "borrow_friend"
  | "sell_share"
  | "hang_out"
  | "count_customers"
  | "porter"
  | "susu_pay"
  | "susu_collect"
  | "bank_interview"
  | "microfinance_apply"
  | "accept_offer"
  | "decline_offer"
  | "ask_family_gift"
  | "ask_family_loan"
  | "help_family";

export interface Action {
  id: ActionId;
  label: string;
  detail: string;
  slots: number;
  energy: number;
  cost: number;
  /** Why it cannot be done right now, if it can't. */
  blocked?: string;
}

export function actionsAt(s: GameState): Action[] {
  const a: Action[] = [];
  const slotsLeft = 3 - s.slot;
  const add = (x: Action) => {
    let blocked = x.blocked;
    if (!blocked && x.slots > slotsLeft) blocked = "Not enough of the day left.";
    if (!blocked && s.energy < x.energy) blocked = "You’re too tired. Rest first.";
    if (!blocked && s.cash < x.cost) blocked = `You need GHS ${x.cost}.`;
    a.push({ ...x, blocked });
  };
  if (s.offer) {
    const o = s.offer;
    add({ id: "accept_offer", label: `Accept GHS ${o.amount}`, detail: `Pay back GHS ${repayTotal(o)} over ${o.weeks} weeks (GHS ${weeklyOf(o)} a week).`, slots: 0, energy: 0, cost: 0 });
    add({ id: "decline_offer", label: "Say no, thank you", detail: "Walk away without the loan.", slots: 0, energy: 0, cost: 0 });
    return a;
  }
  switch (s.at) {
    case "hostel":
      add({ id: "rest", label: "Rest", detail: "Get your energy back.", slots: 1, energy: 0, cost: 0 });
      add({
        id: "call_relative",
        label: cardOf(s).id === "uncle" ? "Call your uncle in Accra" : "Call a relative far away",
        detail: "Costs airtime. Better if you can explain your plan.",
        slots: 1,
        energy: 5,
        cost: 5,
        blocked: s.relativeCalled ? "You already called. Calling again would be begging." : undefined,
      });
      break;
    case "library":
      add({
        id: "prepare_pitch",
        label: "Prepare your pitch",
        detail: "Work out your numbers and how you’ll pay money back.",
        slots: 1,
        energy: 20,
        cost: 0,
        blocked: s.pitch >= 3 ? "Your pitch is as ready as it gets." : undefined,
      });
      add({ id: "tutor", label: "Tutor first-years", detail: "Earn GHS 40. Afternoons and evenings.", slots: 1, energy: 35, cost: 0, blocked: s.slot === 0 ? "No one wants tutoring this early." : undefined });
      break;
    case "enterprise":
      add({
        id: "apply_grant",
        label: "Apply to the enterprise fund",
        detail: "Results on day 8. A strong pitch and real evidence help.",
        slots: 1,
        energy: 15,
        cost: 0,
        blocked: s.grantApplied ? "You’ve applied. Results come on day 8." : s.pitch < 2 ? "They want a prepared pitch (2 of 3). Work on it at the library." : undefined,
      });
      break;
    case "friend":
      add({
        id: "borrow_friend",
        label: "Ask Kojo to lend you GHS 120",
        detail: "You’ll owe him. Friendships and money don’t always mix.",
        slots: 1,
        energy: 5,
        cost: 0,
        blocked: s.friendAsked ? "You’ve already asked Kojo." : undefined,
      });
      add({
        id: "sell_share",
        label: "Offer Kojo a 10% share for GHS 250",
        detail: "No repayments, but he owns part of your venture.",
        slots: 1,
        energy: 10,
        cost: 0,
        blocked: s.shareSold ? "Kojo already owns a share." : s.pitch < 1 ? "He wants to hear a pitch first. Prepare one at the library." : undefined,
      });
      add({ id: "hang_out", label: "Buy Kojo waakye and catch up", detail: "Costs GHS 10. Good for the friendship.", slots: 1, energy: 0, cost: 10 });
      break;
    case "market":
      add({
        id: "count_customers",
        label: "Count customers and ask questions",
        detail: "Evidence that people will pay. Banks ask for it.",
        slots: 1,
        energy: 25,
        cost: 0,
        blocked: s.evidence >= 5 ? "You have plenty of notes." : s.slot === 2 ? "The market is quiet in the evening." : undefined,
      });
      add({ id: "porter", label: "Carry loads for traders", detail: "Earn GHS 30. Mornings only. Hard work.", slots: 1, energy: 45, cost: 0, blocked: s.slot !== 0 ? "The loads are carried in the morning." : undefined });
      add({
        id: "susu_pay",
        label: "Pay GHS 20 into susu",
        detail: "Auntie Esi keeps it safe. Collect it from day 8, less one day’s fee.",
        slots: 0,
        energy: 0,
        cost: 20,
        blocked: s.susuToday ? "You’ve paid today." : s.susuCollected ? "You’ve collected your susu." : undefined,
      });
      if (s.susuPaid > 0) {
        add({
          id: "susu_collect",
          label: `Collect your susu (GHS ${Math.max(0, s.susuPaid - 20)})`,
          detail: "Everything you paid in, less one day’s contribution as her fee.",
          slots: 0,
          energy: 0,
          cost: 0,
          blocked: s.susuCollected ? "Already collected." : s.day < 8 ? "Auntie Esi pays out from day 8." : undefined,
        });
      }
      break;
    case "bank":
      add({
        id: "bank_interview",
        label: "See the loans officer",
        detail: "Takes most of the day (the queue). She’ll ask three questions.",
        slots: 2,
        energy: 20,
        cost: 0,
        blocked: s.bankTriedDay !== null && s.day - s.bankTriedDay < 3 ? `Come back on day ${s.bankTriedDay + 3}.` : s.debts.some((d) => d.source === "bank") ? "You already have a loan from this bank." : undefined,
      });
      break;
    case "microfinance":
      add({
        id: "microfinance_apply",
        label: "Apply for a group loan",
        detail: "Quick. Your group guarantees each other.",
        slots: 1,
        energy: 10,
        cost: 0,
        blocked: s.microfinanceTried ? "You’ve already applied here." : undefined,
      });
      break;
    case "family":
      add({
        id: "ask_family_gift",
        label: "Ask the family for help",
        detail: s.familyAsks ? "Asking again will cost you trust." : "A gift, if they believe in you.",
        slots: 1,
        energy: 10,
        cost: 0,
        blocked: s.familyPotLeft <= 0 ? "There is nothing left to give." : undefined,
      });
      add({
        id: "ask_family_loan",
        label: "Ask to borrow, and promise to pay back",
        detail: "More than a gift, but you’ll repay it from your venture.",
        slots: 1,
        energy: 10,
        cost: 0,
        blocked: s.debts.some((d) => d.source === "family") ? "You already owe the family." : s.familyPotLeft <= 0 ? "There is nothing left to lend." : undefined,
      });
      add({ id: "help_family", label: "Help at home for the day", detail: "No money today. They’ll trust you more.", slots: 2, energy: 20, cost: 0 });
      break;
  }
  return a;
}

// ------------------------------------------------------------ bank interview

export interface InterviewQuestion {
  q: string;
  answers: { text: string; score: (s: GameState) => number }[];
}

export const BANK_QUESTIONS: InterviewQuestion[] = [
  {
    q: "How do you know people will pay for this?",
    answers: [
      { text: "We counted people and asked them. I have our notes here.", score: (s) => (s.evidence >= 2 ? 2 : -1) },
      { text: "Everybody needs it. It’s obvious.", score: () => 0 },
      { text: "My friends all said it’s a great idea.", score: () => 0 },
    ],
  },
  {
    q: "How will you pay the loan back each week?",
    answers: [
      { text: "From sales. We know how many we must sell each week to cover it.", score: (s) => (s.pitch >= 2 ? 2 : 1) },
      { text: "My family will help if we struggle.", score: () => 1 },
      { text: "We’ll figure it out as we go.", score: () => 0 },
    ],
  },
  {
    q: "What if sales are slow in the first weeks?",
    answers: [
      { text: "We keep costs low and hold some cash back for those weeks.", score: (s) => (s.cash >= 150 ? 2 : 1) },
      { text: "We’ll spend more on marketing.", score: () => 1 },
      { text: "That won’t happen.", score: () => 0 },
    ],
  },
];

/** The officer's verdict from the answers, the pitch, the evidence and a guarantor. */
export function bankDecision(s: GameState, answers: number[]): { score: number; offer: Offer | null; reason: string } {
  const fromAnswers = BANK_QUESTIONS.reduce((sum, q, i) => sum + (q.answers[answers[i]]?.score(s) ?? 0), 0);
  const guarantor = s.familyTrust >= 60 ? 1 : 0;
  const score = fromAnswers + s.pitch + Math.min(s.evidence, 3) + guarantor;
  if (score >= 10) {
    return { score, offer: { source: "bank", amount: 1000, ratePerWeek: 0.03, weeks: 6 }, reason: "“Your numbers hold up and you’ve done the work. We can lend you GHS 1,000.”" };
  }
  if (score >= 6) {
    return { score, offer: { source: "bank", amount: 400, ratePerWeek: 0.05, weeks: 6 }, reason: "“I’m not fully convinced, but I’ll start you small: GHS 400.”" };
  }
  return {
    score,
    offer: null,
    reason:
      s.evidence < 2
        ? "“Come back when you can show me people will actually pay.”"
        : "“Your plan isn’t ready. Work out how you’ll repay us, then come back.”",
  };
}

// ----------------------------------------------------------------- perform

const repayTotal = (o: Offer) => Math.round(o.amount * (1 + o.ratePerWeek * o.weeks));
const weeklyOf = (o: Offer) => Math.ceil(repayTotal(o) / o.weeks);

function note(s: GameState, text: string, tone: LogLine["tone"] = "info"): GameState {
  return { ...s, log: [...s.log, { day: s.day, text, tone }] };
}

function addRaised(s: GameState, source: Source, amount: number): GameState {
  return { ...s, cash: s.cash + amount, raised: { ...s.raised, [source]: (s.raised[source] ?? 0) + amount } };
}

/** Use up time; past the evening, a new day starts (energy partly back, maybe a surprise). */
function spend(s: GameState, slots: number): GameState {
  let next: GameState = { ...s };
  let slot = next.slot + slots;
  while (slot >= 3 && !next.over) {
    slot -= 3;
    next = startDay({ ...next, day: next.day + 1 });
  }
  return next.over ? next : { ...next, slot: Math.min(slot, 2) as Slot };
}

const SURPRISES: { day: number; apply: (s: GameState) => GameState }[] = [
  { day: 3, apply: (s) => note({ ...s, cash: Math.max(0, s.cash - 50) }, "Your phone screen cracks. The repair costs GHS 50.", "bad") },
  { day: 5, apply: (s) => note({ ...s, familyPotLeft: Math.floor(s.familyPotLeft / 2) }, "Your little brother’s school fees are due. The family has less to spare now.", "bad") },
  { day: 7, apply: (s) => note(addRaised(s, "friend", 20), "A classmate finally pays back the GHS 20 she owed you.", "good") },
];

function startDay(s: GameState): GameState {
  if (s.day > DAYS) return { ...s, day: DAYS, over: true, offer: null };
  let next: GameState = { ...s, slot: 0, energy: Math.min(100, s.energy + 50), susuToday: false, offer: null };
  next = note(next, `Day ${next.day}.`, "info");
  const surprise = SURPRISES.find((x) => x.day === next.day);
  if (surprise && roll(next, 7) < 0.75) next = surprise.apply(next);
  if (next.day === 8 && next.grantApplied && !next.grantPaid) {
    const strength = next.pitch + Math.min(next.evidence, 3);
    const luck = roll(next, 11);
    const amount = strength >= 5 ? (luck < 0.7 ? 800 : 300) : strength >= 3 ? (luck < 0.5 ? 300 : 0) : 0;
    next = { ...next, grantPaid: true };
    next = amount
      ? note(addRaised(next, "grant", amount), `The enterprise fund awards you GHS ${amount}.`, "good")
      : note(next, "The enterprise fund turns you down this round. Too many applicants with stronger evidence.", "bad");
  }
  return next;
}

export function perform(s: GameState, id: ActionId, answers: number[] = []): GameState {
  if (s.over) return s;
  const action = actionsAt(s).find((a) => a.id === id);
  if (!action) return s;
  if (action.blocked) return note(s, action.blocked, "bad");
  let next: GameState = { ...s, energy: s.energy - action.energy, cash: s.cash - action.cost };
  const card = cardOf(s);

  switch (id) {
    case "rest":
      next = note({ ...next, energy: Math.min(100, next.energy + 40) }, "You rest. Energy back up.", "info");
      break;
    case "call_relative": {
      next = { ...next, relativeCalled: true };
      const chance = card.relativeChance + (next.pitch >= 2 ? 0.2 : 0);
      next =
        roll(next, 3) < chance
          ? note(addRaised(next, "relative", card.relativeGift), `They listen to your plan and send GHS ${card.relativeGift} by Mobile Money.`, "good")
          : note(next, "They’re kind, but they can’t help right now.", "bad");
      break;
    }
    case "prepare_pitch":
      next = note({ ...next, pitch: next.pitch + 1 }, `You work on your pitch (${next.pitch + 1} of 3 ready).`, "good");
      break;
    case "tutor":
      next = note(addRaised(next, "jobs", 40), "Two first-years pay you GHS 40 for help with statistics.", "good");
      break;
    case "apply_grant":
      next = note({ ...next, grantApplied: true }, "You hand in your application. Results on day 8.", "info");
      break;
    case "borrow_friend":
      next = { ...next, friendAsked: true };
      if (next.friendTrust >= 45) {
        next = addRaised({ ...next, friendTrust: next.friendTrust - 10 }, "friend", 120);
        next = {
          ...next,
          debts: [...next.debts, { source: "friend", amount: 120, totalRepay: 120, weekly: 20, note: "Kojo, no interest" }],
        };
        next = note(next, "Kojo lends you GHS 120. “Don’t make me chase you for it.”", "good");
      } else {
        next = note(next, "Kojo says he’s broke this month. You suspect he isn’t sure about you.", "bad");
      }
      break;
    case "sell_share":
      next = note(addRaised({ ...next, shareSold: true, equityGiven: next.equityGiven + 10 }, "friend", 250), "Kojo pays GHS 250 for 10% of your venture.", "good");
      break;
    case "hang_out":
      next = note({ ...next, friendTrust: Math.min(100, next.friendTrust + 15) }, "Waakye and stories. Kojo warms to your idea.", "good");
      break;
    case "count_customers":
      next = note({ ...next, evidence: next.evidence + 1 }, `You count and ask. Evidence notes: ${next.evidence + 1}.`, "good");
      break;
    case "porter":
      next = note(addRaised(next, "jobs", 30), "You carry loads all morning. GHS 30, and sore shoulders.", "good");
      break;
    case "susu_pay":
      next = note({ ...next, susuPaid: next.susuPaid + 20, susuToday: true }, `Auntie Esi marks your card. Paid in: GHS ${next.susuPaid + 20}.`, "info");
      break;
    case "susu_collect": {
      const payout = Math.max(0, next.susuPaid - 20);
      next = note(addRaised({ ...next, susuCollected: true }, "susu", payout), `You collect GHS ${payout} from Auntie Esi.`, "good");
      break;
    }
    case "bank_interview": {
      const verdict = bankDecision(next, answers);
      next = { ...next, bankTriedDay: next.day, offer: verdict.offer };
      next = note(next, `The loans officer: ${verdict.reason}`, verdict.offer ? "good" : "bad");
      return next; // the decision on the offer happens before the day moves on
    }
    case "microfinance_apply": {
      const offer: Offer = { source: "microfinance", amount: 400, ratePerWeek: 0.08, weeks: 6 };
      next = note({ ...next, microfinanceTried: true, offer }, `They can lend GHS ${offer.amount} today, at 8% a week.`, "info");
      return next;
    }
    case "accept_offer": {
      const o = next.offer!;
      next = addRaised({ ...next, offer: null }, o.source, o.amount);
      next = {
        ...next,
        debts: [
          ...next.debts,
          {
            source: o.source,
            amount: o.amount,
            totalRepay: repayTotal(o),
            weekly: weeklyOf(o),
            note: `${Math.round(o.ratePerWeek * 100)}% a week for ${o.weeks} weeks`,
            ratePerWeek: o.ratePerWeek,
          },
        ],
      };
      next = note(next, `You sign. GHS ${o.amount} now; GHS ${weeklyOf(o)} a week to repay from week 1.`, "good");
      return spend(next, o.source === "bank" ? 2 : 1);
    }
    case "decline_offer":
      next = note({ ...next, offer: null }, "You thank them and leave without the loan.", "info");
      return spend(next, next.at === "bank" ? 2 : 1);
    case "ask_family_gift": {
      const share = s.familyAsks === 0 ? 0.6 : 0.25;
      const amount = Math.min(next.familyPotLeft, Math.round((card.familyPot * share * next.familyTrust) / 100 / 10) * 10);
      next = { ...next, familyAsks: next.familyAsks + 1, familyTrust: Math.max(0, next.familyTrust - (s.familyAsks === 0 ? 10 : 20)) };
      next =
        amount > 0
          ? note(addRaised({ ...next, familyPotLeft: next.familyPotLeft - amount }, "family", amount), s.familyAsks === 0 ? `Your mother asks hard questions, then gives you GHS ${amount}.` : `A long silence. Then GHS ${amount}, and a look you won’t forget.`, "good")
          : note(next, "“We’ve given what we can.”", "bad");
      break;
    }
    case "ask_family_loan": {
      const amount = Math.min(next.familyPotLeft, Math.round((card.familyPot * 0.9 * next.familyTrust) / 100 / 10) * 10);
      if (amount <= 0) {
        next = note(next, "They can’t lend you anything right now.", "bad");
        break;
      }
      next = addRaised({ ...next, familyPotLeft: next.familyPotLeft - amount, familyTrust: Math.max(0, next.familyTrust - 5) }, "family", amount);
      next = {
        ...next,
        debts: [...next.debts, { source: "family", amount, totalRepay: amount, weekly: Math.ceil(amount / 6), note: "Family, no interest, but they will ask" }],
      };
      next = note(next, `They lend you GHS ${amount}. “We want it back by the end of the semester.”`, "good");
      break;
    }
    case "help_family":
      next = note({ ...next, familyTrust: Math.min(100, next.familyTrust + 15) }, "You spend the day helping at home. They see you differently.", "good");
      break;
  }
  return spend(next, action.slots);
}

/** Stop raising money early and see where you stand. */
export function finish(s: GameState): GameState {
  return { ...s, over: true, offer: null };
}

// ----------------------------------------------------------------- summary

export interface Summary {
  cash: number;
  short: number;
  weeklyRepayments: number;
  totalToRepay: number;
  equityGiven: number;
  bySource: { source: Source; amount: number }[];
  lessons: string[];
}

export const SOURCE_NAMES: Record<Source, string> = {
  savings: "Your savings",
  family: "Family",
  friend: "Friends",
  jobs: "Part-time work",
  susu: "Susu savings",
  bank: "Bank loan",
  microfinance: "Microfinance loan",
  grant: "Enterprise fund",
  relative: "Relative far away",
};

export function summary(s: GameState): Summary {
  const weekly = s.debts.reduce((a, d) => a + d.weekly, 0);
  const owed = s.debts.reduce((a, d) => a + d.totalRepay, 0);
  const lessons: string[] = [];
  if (weekly > 0) lessons.push(`Your venture must find GHS ${weekly} every week for repayments before it pays you anything.`);
  if (s.equityGiven > 0) lessons.push(`Kojo owns ${s.equityGiven}% of your venture: no repayments, but a share of every profit, for good.`);
  if (s.debts.some((d) => d.source === "microfinance")) lessons.push("Microfinance was quick, but at 8% a week it is the most expensive money you raised.");
  if (s.evidence < 2) lessons.push("With little evidence, the people with the most money were the hardest to convince.");
  if (s.familyTrust < 40) lessons.push("Family trust is a resource too, and you spent a lot of it.");
  if (s.susuPaid > 0 && !s.susuCollected) lessons.push(`GHS ${s.susuPaid} is still with Auntie Esi. Saving takes time to pay off.`);
  if (s.cash < goalOf(s)) lessons.push(`You are GHS ${goalOf(s) - s.cash} short. Start smaller, or keep going after money you haven’t tried yet.`);
  return {
    cash: s.cash,
    short: Math.max(0, goalOf(s) - s.cash),
    weeklyRepayments: weekly,
    totalToRepay: owed,
    equityGiven: s.equityGiven,
    bySource: (Object.entries(s.raised) as [Source, number][]).filter(([, v]) => v > 0).map(([source, amount]) => ({ source, amount })),
    lessons,
  };
}

// ------------------------------------------------------------ funding plan

/** A loan as the venture's simulation needs it: pesewas, interest per week in basis points. */
export interface OpeningLoan {
  id: string;
  source: "family" | "bank" | "microfinance";
  amount: number;
  ratePerPeriodBp: number;
  termPeriods: number;
}

/**
 * What the game hands to the venture: the cash that is the group's own (savings,
 * gifts, wages, susu, grant, a share sold) as starting capital, and every loan
 * as a debt that is repaid with interest from the first week. Pesewas.
 */
export function fundingPlan(s: GameState, termPeriods = 6): { startingCash: number; loans: OpeningLoan[] } {
  const loans: OpeningLoan[] = s.debts.map((d, i) => ({
    id: `raised_${i + 1}_${d.source}`,
    // The engine knows friends and family together.
    source: d.source === "friend" ? "family" : d.source,
    amount: d.amount * 100,
    ratePerPeriodBp: Math.round((d.ratePerWeek ?? 0) * 10000),
    termPeriods,
  }));
  const borrowed = loans.reduce((a, l) => a + l.amount, 0);
  return { startingCash: Math.max(0, s.cash * 100 - borrowed), loans };
}
