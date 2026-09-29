import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { log, setLogSink } from "./log.ts";

function capture(fn: () => void): Record<string, unknown>[] {
  const lines: string[] = [];
  const restore = setLogSink((l) => lines.push(l));
  try {
    fn();
  } finally {
    restore();
  }
  return lines.map((l) => JSON.parse(l) as Record<string, unknown>);
}

describe("structured log", () => {
  it("writes one JSON record with allow-listed fields", () => {
    const [rec] = capture(() =>
      log("info", "sim.period_run", { simulationId: "s1", period: 2, durationMs: 14 }),
    );
    assert.deepEqual(rec, {
      level: "info",
      event: "sim.period_run",
      simulationId: "s1",
      period: 2,
      durationMs: 14,
    });
  });

  it("drops personal data and records only the field name", () => {
    const [rec] = capture(() =>
      log("warn", "auth.denied", {
        studentId: "st-1",
        fullName: "Ama Mensah",
        indexNumber: "PS/ENT/21/0001",
      }),
    );
    assert.equal(rec?.studentId, "st-1");
    assert.deepEqual(rec?.dropped, ["fullName", "indexNumber"]);
    assert.doesNotMatch(JSON.stringify(rec), /Ama|0001/);
  });
});
