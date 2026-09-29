// Run a scenario from the command line and print a readable trail.
//
//   npm run sim -- --strategy careful --sim demo-1 --cohort ucc-2026
//   npm run sim -- --strategy careless --explain
//   npm run sim -- --json > run.json      (canonical JSON, byte-identical per seed)
import { canonicalJson, campusFoodStall, formatGhs, simulate, STRATEGIES, studentView } from "./index.ts";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const strategyName = arg("strategy", "careful");
const strategy = STRATEGIES[strategyName];
if (!strategy) {
  console.error(`Unknown strategy "${strategyName}". Choose: ${Object.keys(STRATEGIES).join(", ")}`);
  process.exit(2);
}
const outputs = simulate({
  scenario: campusFoodStall,
  simulationId: arg("sim", "demo"),
  cohortId: arg("cohort", "demo-cohort"),
  strategy,
  periods: Number(arg("periods", String(campusFoodStall.periodCount.value))),
});

if (flag("json")) {
  process.stdout.write(`${canonicalJson(outputs)}\n`);
} else {
  const view = flag("lecturer") ? outputs : outputs.map(studentView);
  console.log(`${campusFoodStall.name}, strategy "${strategyName}", seed base "${arg("sim", "demo")}"\n`);
  for (const o of view) {
    const x = o.outcomes;
    console.log(`=== Period ${o.period} (seed ${o.seed}) — ${x.status.toUpperCase()}`);
    console.log(
      `  Revenue ${formatGhs(x.revenue)} | Profit ${formatGhs(x.profit)} | Cash ${formatGhs(x.openingCash)} -> ${formatGhs(x.closingCash)} | Sold ${x.unitsSold}/${x.unitsDemanded} | Customers ${x.customers} | Share ${(x.marketShare * 100).toFixed(1)}% | Reputation ${x.reputation.toFixed(1)}`,
    );
    for (const e of o.events) {
      console.log(`  EVENT ${e.name} [${e.status}]${e.response ? ` response: ${e.response}${e.responseWasDefault ? " (default)" : ""}` : ""}`);
    }
    for (const s of o.learningSignals) console.log(`  SIGNAL ${s.code}: ${s.message}`);
    if (flag("explain")) for (const l of o.explanation) console.log(`    · [${l.module}] ${l.text}`);
    console.log("");
  }
}
