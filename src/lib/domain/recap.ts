/**
 * The weekly recap: a crew's week in the field, as a card worth sharing.
 *
 * Crew-level only. It counts what the group did together and never ranks,
 * names or counts individual teammates. A recap you post on your status
 * should never show who stayed home. Private acts (reflections, peer ratings)
 * never reach the activity feed, so they cannot leak in here either.
 *
 * Weeks run Monday to Sunday in UTC. Cape Coast is on GMT all year, so UTC
 * is local time for every student and the result doesn't change between
 * server and phone.
 */
import type { ActivityEvent, EvidenceItem, Interview, PrototypeTest, WorkspaceSnapshot } from "./types.ts";

const DAY = 86_400_000;

export interface RecapInput {
  crewName: string;
  activity: ActivityEvent[];
  interviews: Interview[];
  prototypeTests: PrototypeTest[];
  evidence: EvidenceItem[];
}

export interface Persona {
  key: "street" | "makers" | "explorers" | "notetakers" | "warming" | "quiet";
  title: string;
  line: string;
}

export interface WeeklyRecap {
  /** Monday 00:00 UTC, ISO. */
  weekStart: string;
  /** "21–27 Sep" */
  label: string;
  /** The week hasn't ended yet. */
  inProgress: boolean;
  crewName: string;
  interviews: number;
  tests: number;
  /** Notebook entries that aren't the record of an interview or a test. */
  notes: number;
  /** Everything the crew did this week that shows in the team feed. */
  actions: number;
  /** Teammates who did field work. Never shown as "N of M". */
  peopleInField: number;
  /** Distinct places, most visited first. */
  places: string[];
  /** A consented interview quote, anonymous. */
  quote: string | null;
  /** Big group moments, in the order they happened. */
  moments: string[];
  persona: Persona;
}

/** localStorage: the newest finished week this device has opened, so Today stops offering it. */
export const RECAP_SEEN_KEY = (owner: string) => `evp:recap-seen:${owner}`;

export function recapInputFrom(data: WorkspaceSnapshot): RecapInput {
  return {
    crewName: data.venture?.name || data.group?.groupName || "Our crew",
    activity: data.activity,
    interviews: data.work.interviews,
    prototypeTests: data.work.prototypeTests,
    evidence: data.evidence,
  };
}

const MOMENTS: Record<string, string> = {
  VENTURE_CREATED: "Picked your venture",
  PROTOTYPE_CREATED: "Built a prototype",
  DECISION_RATIFIED: "Made the big decision",
  MARKET_EVENT_RESPONDED: "Answered a market shock",
};

/** Events that are private or not the crew's own doing. */
const NOT_CREW = new Set(["FEEDBACK_GIVEN", "STAFF_MESSAGE", "MEMBER_MARKED_INACTIVE", "MESSAGE_SENT"]);

// Fixed, not toLocaleDateString: ICU spells September "Sept" on some phones.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function weekStartOf(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - sinceMonday * DAY);
}

export function weekLabel(start: Date): string {
  const end = new Date(start.getTime() + 6 * DAY);
  const month = (d: Date) => MONTHS[d.getUTCMonth()];
  const day = (d: Date) => d.getUTCDate();
  return month(start) === month(end)
    ? `${day(start)}–${day(end)} ${month(end)}`
    : `${day(start)} ${month(start)} – ${day(end)} ${month(end)}`;
}

function inWeek(iso: string | null | undefined, start: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && t >= start && t < start + 7 * DAY;
}

/** A place name as students typed it, tidied so "kotokuraba " and "Kotokuraba" count once. */
function tidyPlace(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim().replace(/\s+/g, " ");
  if (s.length < 2) return null;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function clip(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, " ").replace(/^["“”']+|["“”']+$/g, "");
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > max * 0.6 ? space : cut.length).replace(/[,;:.\s]+$/, "")}…`;
}

export function personaFor(r: Pick<WeeklyRecap, "interviews" | "tests" | "notes" | "places" | "inProgress">): Persona {
  if (r.interviews >= 5) return { key: "street", title: "The Street Team", line: "You spent more time in town than at your desks." };
  if (r.tests >= 3) return { key: "makers", title: "The Makers", line: "You put something real in people’s hands and watched." };
  if (r.places.length >= 3) return { key: "explorers", title: "The Explorers", line: "New corners of Cape Coast, one conversation at a time." };
  if (r.interviews + r.notes + r.tests >= 3) return { key: "notetakers", title: "The Noticers", line: "You wrote down what everyone else walked past." };
  if (r.interviews + r.notes + r.tests > 0) return { key: "warming", title: "Warming Up", line: "First steps out. Next week, go further." };
  return r.inProgress
    ? { key: "quiet", title: "Blank Page", line: "Nothing logged yet this week. There’s still time." }
    : { key: "quiet", title: "A Quiet Week", line: "It happens. This week’s card is still blank. Fill it." };
}

export function weeklyRecap(input: RecapInput, weekStart: Date, now = new Date()): WeeklyRecap {
  const start = weekStartOf(weekStart).getTime();
  const within = (iso: string | null | undefined) => inWeek(iso, start);

  const interviews = input.interviews.filter((i) => within(i.createdAt));
  const tests = input.prototypeTests.filter((t) => within(t.createdAt));
  const fieldRecords = new Set(
    [...input.interviews, ...input.prototypeTests].map((x) => x.evidenceItemId).filter((id): id is string => Boolean(id)),
  );
  const evidence = input.evidence.filter((e) => within(e.createdAt));
  const notes = evidence.filter((e) => !fieldRecords.has(e.id));

  const counts = new Map<string, { name: string; n: number }>();
  for (const raw of [...interviews.map((i) => i.location), ...evidence.map((e) => e.locationContext)]) {
    const name = tidyPlace(raw);
    if (!name) continue;
    const key = name.toLowerCase();
    const hit = counts.get(key);
    if (hit) hit.n += 1;
    else counts.set(key, { name, n: 1 });
  }
  const places = [...counts.values()].sort((a, b) => b.n - a.n).map((p) => p.name);

  const quoted = interviews
    .filter((i) => i.consent && i.keyQuotes.trim().length >= 12)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const quote = quoted ? clip(quoted.keyQuotes.split(/\n+/)[0] ?? quoted.keyQuotes, 140) : null;

  const events = input.activity.filter((e) => within(e.createdAt));
  const moments = [
    ...new Set(
      [...events]
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((e) => MOMENTS[e.eventType])
        .filter((m): m is string => Boolean(m)),
    ),
  ];
  const actions = events.filter((e) => !NOT_CREW.has(e.eventType)).length;

  const fieldPeople = new Set(
    [
      ...interviews.map((i) => i.studentId),
      ...evidence.map((e) => e.studentId),
      ...events.filter((e) => e.eventType === "PROTOTYPE_TESTED").map((e) => e.studentId),
    ].filter(Boolean),
  );

  const base = {
    weekStart: new Date(start).toISOString(),
    label: weekLabel(new Date(start)),
    inProgress: now.getTime() < start + 7 * DAY,
    crewName: input.crewName,
    interviews: interviews.length,
    tests: tests.length,
    notes: notes.length,
    actions,
    peopleInField: fieldPeople.size,
    places,
    quote,
    moments,
  };
  return { ...base, persona: personaFor(base) };
}

/** The weeks worth a card: from the crew's first recorded act up to this week, newest first. */
export function recapWeeks(input: RecapInput, now = new Date(), max = 12): Date[] {
  const times = [
    ...input.activity.map((e) => e.createdAt),
    ...input.interviews.map((i) => i.createdAt),
    ...input.evidence.map((e) => e.createdAt),
  ]
    .map((iso) => new Date(iso).getTime())
    .filter((t) => !Number.isNaN(t));
  const current = weekStartOf(now).getTime();
  const first = times.length ? weekStartOf(new Date(Math.min(...times))).getTime() : current;
  const weeks: Date[] = [];
  for (let t = current; t >= first && weeks.length < max; t -= 7 * DAY) weeks.push(new Date(t));
  return weeks;
}

/** One line for Today: "4 interviews · 2 places". Empty when there is nothing to say. */
export function recapTeaser(r: WeeklyRecap): string {
  const bits: string[] = [];
  if (r.interviews) bits.push(`${r.interviews} ${r.interviews === 1 ? "interview" : "interviews"}`);
  if (r.tests) bits.push(`${r.tests} ${r.tests === 1 ? "test" : "tests"}`);
  if (r.notes) bits.push(`${r.notes} ${r.notes === 1 ? "note" : "notes"}`);
  if (r.places.length) bits.push(`${r.places.length} ${r.places.length === 1 ? "place" : "places"}`);
  return bits.join(" · ");
}
