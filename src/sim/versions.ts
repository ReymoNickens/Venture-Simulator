// Every engine version ever used stays runnable, so a stored run can always
// be recomputed with the code that produced it (brief: "engine versioning").
// When formulas change, add runPeriodV2 beside v1; never edit v1's behaviour.
import { EngineInputError } from "./context.ts";
import { ENGINE_V1, runPeriodV1 } from "./engine.ts";
import type { PeriodInput, PeriodOutput } from "./types.ts";

const ENGINES: Record<string, (input: PeriodInput) => PeriodOutput> = {
  [ENGINE_V1]: runPeriodV1,
};

export const CURRENT_ENGINE_VERSION = ENGINE_V1;

export function supportedEngineVersions(): string[] {
  return Object.keys(ENGINES);
}

export function runPeriod(input: PeriodInput): PeriodOutput {
  const engine = ENGINES[input.engineVersion];
  if (!engine) throw new EngineInputError(`Unknown engine version "${input.engineVersion}"`);
  return engine(input);
}
