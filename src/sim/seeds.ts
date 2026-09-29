// Seeds are derived on the server from stored ids, never supplied by a
// client (ADR 0003). The same simulation and period always gets the same
// seed, so a stored run can be recomputed exactly.

export function groupSeed(simulationId: string, period: number): string {
  return `sim:${simulationId}:${period}`;
}

export function cohortSeed(cohortId: string, period: number): string {
  return `cohort:${cohortId}:${period}`;
}
