// Pure formatting of the advisor's per-turn context brief. Kept free of
// database and network code so it can be tested directly.
//
// Personal data rule: the brief goes to an external model provider, so it
// never contains student names, index numbers or programmes. Authors are
// referred to as "Member 1", "Member 2", ... numbered by student id order, so
// the labels stay stable across turns without identifying anyone.

export interface AdvisorBriefInput {
  stage: string;
  groupStatus: string | null;
  groupName: string | null;
  opportunities: {
    authorId: string;
    status: string;
    problem: string;
    observedEvidence: string;
    currentAlternatives: string;
    potentialCustomer: string;
    uncertainties: string;
  }[];
  preferences: { authorId: string; rationale: string; problem: string }[];
  venture: { name: string; selectionRationale: string } | null;
  evidence: { title: string; classification: string; content: string }[];
  assumptions: { statement: string; importance: string; confidence: string }[];
}

export function memberLabels(authorIds: string[]): Map<string, string> {
  const unique = [...new Set(authorIds)].sort();
  return new Map(unique.map((id, i) => [id, `Member ${i + 1}`]));
}

export function formatAdvisorBrief(input: AdvisorBriefInput): string {
  const labels = memberLabels([
    ...input.opportunities.map((o) => o.authorId),
    ...input.preferences.map((p) => p.authorId),
  ]);
  const who = (id: string) => labels.get(id) ?? "A member";
  const opps = input.opportunities;
  const prefs = input.preferences;
  return [
    `COURSE RULES: Students must back claims with evidence. The platform does not pick winners.`,
    `STAGE: ${input.stage}. Group status: ${input.groupStatus ?? "unknown"}. Group: ${input.groupName ?? ""}.`,
    opps.length
      ? `OPPORTUNITIES:\n${opps
          .map(
            (o) =>
              `- [${o.status}] ${who(o.authorId)}: ${o.problem}\n  evidence: ${o.observedEvidence}\n  alternatives: ${o.currentAlternatives}\n  customer: ${o.potentialCustomer}\n  unknowns: ${o.uncertainties}`,
          )
          .join("\n")}`
      : "OPPORTUNITIES: none submitted.",
    prefs.length
      ? `PREFERENCES:\n${prefs.map((p) => `- ${who(p.authorId)} prefers “${p.problem}” because: ${p.rationale}`).join("\n")}`
      : "PREFERENCES: none yet.",
    input.venture
      ? `VENTURE: ${input.venture.name}\nSELECTION RATIONALE: ${input.venture.selectionRationale}`
      : "VENTURE: not created.",
    input.evidence.length
      ? `EVIDENCE:\n${input.evidence.map((e) => `- (${e.classification}) ${e.title}: ${e.content}`).join("\n")}`
      : "EVIDENCE: none.",
    input.assumptions.length
      ? `ASSUMPTIONS:\n${input.assumptions.map((a) => `- [${a.importance}/${a.confidence}] ${a.statement}`).join("\n")}`
      : "ASSUMPTIONS: none.",
  ].join("\n\n");
}
