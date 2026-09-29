// What a student is allowed to see of a period's output. Lecturer-only
// explanation lines (e.g. the hidden rapport mechanic, ADR 0008) are
// removed here, and every student-facing API must go through this.
import type { ExplanationLine, PeriodOutput } from "./types.ts";

export type StudentPeriodView = Omit<PeriodOutput, "newState" | "explanation"> & {
  explanation: ExplanationLine[];
};

export function studentView(output: PeriodOutput): StudentPeriodView {
  const hidden = new Set(output.explanation.filter((l) => l.visibility !== "student").map((l) => l.id));
  const explanation = output.explanation
    .filter((l) => !hidden.has(l.id))
    .map((l) =>
      l.inputs.lines?.some((id) => hidden.has(id))
        ? { ...l, inputs: { ...l.inputs, lines: l.inputs.lines.filter((id) => !hidden.has(id)) } }
        : l,
    );
  const { newState: _state, explanation: _all, ...rest } = output;
  return { ...rest, explanation };
}
