// Events: cohort-wide shocks and group-specific incidents, the responses
// groups choose, and the combined modifiers the other modules apply.
import { EngineInputError, type PeriodContext } from "../context.ts";
import { cashBalance } from "../context.ts";
import { formatGhs } from "../money.ts";
import { Rng } from "../rng.ts";
import type {
  ActiveEvent,
  CohortEventInstance,
  Decisions,
  Effect,
  EventDef,
  EventOccurrence,
  Scenario,
  SimState,
  TriggerDef,
} from "../types.ts";

export interface Modifiers {
  supplierCost: number;
  demandAll: number;
  demandBySegment: Record<string, number>;
  capacity: number;
  marketingEffectiveness: number;
  fixedCostAdd: number;
  perUnitCostAdd: number;
  reputationAdd: number;
  competitorPrice: number;
  spoilage: number;
  awarenessAdd: number;
  qualityAdd: number;
  switchingCostAdd: number;
  newCompetitors: string[];
  /** instanceIds that contributed to each metric, for explanations. */
  sources: Record<string, string[]>;
}

export function neutralModifiers(): Modifiers {
  return {
    supplierCost: 1,
    demandAll: 1,
    demandBySegment: {},
    capacity: 1,
    marketingEffectiveness: 1,
    fixedCostAdd: 0,
    perUnitCostAdd: 0,
    reputationAdd: 0,
    competitorPrice: 1,
    spoilage: 1,
    awarenessAdd: 0,
    qualityAdd: 0,
    switchingCostAdd: 0,
    newCompetitors: [],
    sources: {},
  };
}

export function demandModifier(m: Modifiers, segmentId: string): number {
  return m.demandAll * (m.demandBySegment[segmentId] ?? 1);
}

function applyEffect(m: Modifiers, e: Effect, instanceId: string): void {
  (m.sources[e.metric] ??= []).push(instanceId);
  switch (e.metric) {
    case "supplier_cost":
      m.supplierCost *= e.value;
      return;
    case "demand":
      if (e.segmentId) m.demandBySegment[e.segmentId] = (m.demandBySegment[e.segmentId] ?? 1) * e.value;
      else m.demandAll *= e.value;
      return;
    case "capacity":
      m.capacity *= e.value;
      return;
    case "marketing_effectiveness":
      m.marketingEffectiveness *= e.value;
      return;
    case "fixed_cost":
      m.fixedCostAdd += e.value;
      return;
    case "per_unit_cost":
      m.perUnitCostAdd += e.value;
      return;
    case "reputation":
      m.reputationAdd += e.value;
      return;
    case "competitor_price":
      m.competitorPrice *= e.value;
      return;
    case "spoilage":
      m.spoilage *= e.value;
      return;
    case "awareness":
      m.awarenessAdd += e.value;
      return;
    case "quality":
      m.qualityAdd += e.value;
      return;
    case "switching_cost":
      m.switchingCostAdd += e.value;
      return;
    case "new_competitor":
      if (e.competitorId) m.newCompetitors.push(e.competitorId);
      return;
  }
}

function describeEffect(e: Effect): string {
  const seg = e.segmentId ? ` (${e.segmentId})` : "";
  switch (e.metric) {
    case "fixed_cost":
      return `extra cost ${formatGhs(e.value)} per period`;
    case "per_unit_cost":
      return `extra ${formatGhs(e.value)} per unit sold`;
    case "reputation":
      return `reputation ${e.value >= 0 ? "+" : ""}${e.value} per period`;
    case "awareness":
      return `${e.value} more people aware of you`;
    case "quality":
    case "switching_cost":
      return `${e.metric.replace("_", " ")} ${e.value >= 0 ? "+" : ""}${e.value}`;
    case "new_competitor":
      return `new competitor enters: ${e.competitorId}`;
    default:
      return `${e.metric.replace(/_/g, " ")}${seg} ×${e.value}`;
  }
}

function eventDef(scenario: Scenario, eventId: string): EventDef {
  const def = scenario.events.find((e) => e.id === eventId);
  if (!def) throw new EngineInputError(`Unknown event "${eventId}"`);
  return def;
}

function triggerMet(trigger: TriggerDef | null, state: SimState): boolean {
  if (!trigger) return true;
  let actual = 0;
  switch (trigger.metric) {
    case "inventory_units":
      actual = Object.values(state.inventory).reduce((s, i) => s + i.units, 0);
      break;
    case "reputation":
      actual = state.reputation;
      break;
    case "cash":
      actual = cashBalance(state.ledger);
      break;
    case "customers":
      actual = Object.values(state.customers).reduce((s, c) => s + c.active, 0);
      break;
  }
  return trigger.op === "gte" ? actual >= trigger.value : actual <= trigger.value;
}

/**
 * Draw the cohort-wide events for one period. Called ONCE per cohort per
 * period by the server; the result is stored and passed to every group's run
 * (ADR 0004). `cohortSeed` is derived server-side from the cohort id and
 * period.
 */
export function drawCohortEvents(
  scenario: Scenario,
  cohortSeed: string,
  period: number,
  activeEventIds: readonly string[],
  pastEventIds: readonly string[],
): CohortEventInstance[] {
  if (period < scenario.eventSettings.firstEventPeriod.value) return [];
  const rng = new Rng(cohortSeed);
  const freq = scenario.eventSettings.frequency.value;
  const max = scenario.eventSettings.maxNewCohortEventsPerPeriod.value;
  const hits: CohortEventInstance[] = [];
  for (const def of scenario.events) {
    if (def.scope !== "cohort") continue;
    // Draw for every cohort event every period, eligible or not, so one
    // event's eligibility never shifts another event's draw.
    const { hit } = rng.stream(`cohort-event:${def.id}`).chance(def.probability.value * freq);
    if (!hit) continue;
    if (activeEventIds.includes(def.id)) continue;
    if (def.oncePerRun && pastEventIds.includes(def.id)) continue;
    if (hits.length >= max) break;
    hits.push({ instanceId: `${def.id}@${period}`, eventId: def.id, period, origin: "drawn" });
  }
  return hits;
}

export interface EventStepResult {
  active: ActiveEvent[];
  pastEventIds: string[];
  modifiers: Modifiers;
  occurrences: EventOccurrence[];
}

export function stepEvents(
  ctx: PeriodContext,
  state: SimState,
  decisions: Decisions,
  cohortEvents: CohortEventInstance[],
): EventStepResult {
  const { scenario, period } = ctx;
  const active: ActiveEvent[] = state.activeEvents
    .filter((e) => e.endsAfterPeriod >= period)
    .map((e) => ({ ...e }));
  const pastEventIds = [...state.pastEventIds];

  // Responses may only name events that are waiting for one.
  for (const instanceId of Object.keys(decisions.eventResponses)) {
    const ev = active.find((e) => e.instanceId === instanceId);
    if (!ev || ev.response !== null) {
      throw new EngineInputError(`No event "${instanceId}" is waiting for a response`);
    }
  }

  // 1. Events that started last period now take the group's response, or
  //    the default if the group did not choose one. Either way, it is final.
  for (const ev of active) {
    if (ev.response !== null) continue;
    const def = eventDef(scenario, ev.eventId);
    const chosen = decisions.eventResponses[ev.instanceId];
    const responseId = chosen ?? def.defaultResponseId;
    const response = def.responses.find((r) => r.id === responseId);
    if (!response) throw new EngineInputError(`Event "${def.id}" has no response "${responseId}"`);
    ev.response = response.id;
    ev.respondedPeriod = period;
    ev.responseWasDefault = chosen === undefined;
    const lineId = ctx.explain(
      "events",
      "event_response",
      response.id,
      chosen
        ? `${def.name}: your group chose "${response.label}".`
        : `${def.name}: no response was chosen in time, so "${response.label}" applied by default.`,
      {
        decisions: chosen ? [`eventResponses.${ev.instanceId}`] : [],
        events: [ev.instanceId],
        params: [`events[${def.id}].responses[${response.id}].cost`],
      },
    );
    ctx.post("event_response", -response.cost.value, `${def.name}: ${response.label}`, ev.instanceId, lineId);
  }

  // 2. New cohort events (drawn once for the whole cohort, ADR 0004).
  for (const ce of cohortEvents) {
    if (ce.period !== period) {
      throw new EngineInputError(`Cohort event ${ce.instanceId} is for period ${ce.period}, not ${period}`);
    }
    const def = eventDef(scenario, ce.eventId);
    if (def.scope !== "cohort") throw new EngineInputError(`Event "${def.id}" is not a cohort event`);
    if (active.some((e) => e.instanceId === ce.instanceId)) continue;
    active.push(newActive(ce.instanceId, def, period));
    if (!pastEventIds.includes(def.id)) pastEventIds.push(def.id);
  }

  // 3. Group events: triggered by this venture's own situation.
  if (period >= scenario.eventSettings.firstEventPeriod.value) {
    const freq = scenario.eventSettings.frequency.value;
    for (const def of scenario.events) {
      if (def.scope !== "group") continue;
      const { hit, draw } = ctx
        .rng.stream(`group-event:${def.id}`)
        .chance(def.probability.value * freq);
      if (!hit) continue;
      if (active.some((e) => e.eventId === def.id)) continue;
      if (def.oncePerRun && pastEventIds.includes(def.id)) continue;
      if (!triggerMet(def.trigger, state)) continue;
      const instanceId = `${def.id}@${period}`;
      active.push(newActive(instanceId, def, period));
      if (!pastEventIds.includes(def.id)) pastEventIds.push(def.id);
      ctx.explain(
        "events",
        "group_event",
        def.id,
        `${def.name} happened to your venture${def.trigger ? ` (possible because ${def.trigger.metric.replace("_", " ")} ${def.trigger.op === "gte" ? "≥" : "≤"} ${def.trigger.value})` : ""}.`,
        { params: [`events[${def.id}].probability`], events: [instanceId], rng: [draw] },
      );
    }
  }

  // 4. Combine every active event's effects into one set of modifiers.
  const modifiers = neutralModifiers();
  const occurrences: EventOccurrence[] = [];
  for (const ev of active) {
    const def = eventDef(scenario, ev.eventId);
    const response = ev.response ? def.responses.find((r) => r.id === ev.response) : undefined;
    const effects = response ? response.effects : def.impact;
    for (const e of effects) applyEffect(modifiers, e, ev.instanceId);
    ctx.explain(
      "events",
      "event_effects",
      ev.instanceId,
      `${def.name} (${ev.startedPeriod === period ? "new this period" : `since period ${ev.startedPeriod}`}${response ? `, response: ${response.label}` : ""}): ${effects.length ? effects.map(describeEffect).join("; ") : "no further effect"}.`,
      { events: [ev.instanceId], params: [`events[${def.id}].${response ? `responses[${response.id}].effects` : "impact"}`] },
    );
    const needsResponse = ev.response === null && def.duration > 1;
    occurrences.push({
      instanceId: ev.instanceId,
      eventId: def.id,
      name: def.name,
      type: def.type,
      severity: def.severity,
      scope: def.scope,
      description: def.description,
      status: ev.startedPeriod === period ? "new" : ev.endsAfterPeriod === period ? "final" : "ongoing",
      startedPeriod: ev.startedPeriod,
      endsAfterPeriod: ev.endsAfterPeriod,
      response: ev.response,
      responseWasDefault: ev.responseWasDefault,
      availableResponses: needsResponse
        ? def.responses.map((r) => ({ id: r.id, label: r.label, description: r.description, cost: r.cost.value }))
        : [],
      mustRespondBy: needsResponse ? period + 1 : null,
    });
  }

  // An event lasting one period can never be responded to: close it now so
  // it does not wait for a response in the next period.
  for (const ev of active) {
    const def = eventDef(scenario, ev.eventId);
    if (ev.response === null && def.duration <= 1) {
      ev.response = def.defaultResponseId;
      ev.respondedPeriod = period;
      ev.responseWasDefault = true;
    }
  }

  return { active, pastEventIds, modifiers, occurrences };
}

function newActive(instanceId: string, def: EventDef, period: number): ActiveEvent {
  return {
    instanceId,
    eventId: def.id,
    scope: def.scope,
    startedPeriod: period,
    endsAfterPeriod: period + def.duration - 1,
    response: null,
    respondedPeriod: null,
    responseWasDefault: false,
  };
}
