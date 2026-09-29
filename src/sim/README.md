# Simulation engine (`src/sim/`)

A pure, deterministic TypeScript module that runs one period of one
simulated venture:

```
runPeriod({ engineVersion, scenario, state, decisions, cohortEvents, seed, financing })
  -> { newState, transactions, outcomes, events, explanation, learningSignals }
```

No database, network, clock or `Math.random`: lint enforces it
(`eslint.config.mjs`, see docs/decisions/0002 and 0003). The server stores
inputs and outputs; the engine only computes.

## Try it

```
npm run sim                                  # careful team, 6 periods
npm run sim -- --strategy careless           # a team that runs out of cash
npm run sim -- --explain                     # every line of the explanation trail
npm run sim -- --sim group-7 --cohort ucc-a  # a different group / cohort seed
npm run sim -- --json > run.json             # canonical JSON, byte-identical per seed
```

## Map

| File | What it does |
|---|---|
| `types.ts` | The data contract: scenario, state, decisions, outputs |
| `engine.ts` | `runPeriodV1`: orchestrates one period in a fixed order |
| `versions.ts` | Engine registry. Old versions stay runnable |
| `context.ts` | Explanation trail + the ONLY way cash changes (`post`) |
| `modules/events.ts` | Cohort and group events, responses, modifiers |
| `modules/financing.ts` | Disbursements, repayment schedules, interest |
| `modules/operations.ts` | Orders, deliveries, stock, capacity, spoilage |
| `modules/demand.ts` | Attractiveness of an offer vs. competitors |
| `modules/customers.ts` | Funnel: awareness → leads → customers → demand |
| `modules/competition.ts` | Competitor sales and reactions |
| `modules/finance.ts` | P&L, cash flow, break-even, runway |
| `modules/signals.ts` | Learning signals: observations + reflection questions |
| `scenarios/campus-food-stall.ts` | Default scenario. Every number is `assumption: true` |
| `rng.ts`, `money.ts`, `canonical.ts`, `params.ts` | Determinism, pesewas, provenance |
| `view.ts` | `studentView`: strips lecturer-only lines |
| `run.ts`, `strategies.ts`, `cli.ts` | Multi-period runner, reference strategies, CLI |

## Order of one period

1. Events: expire old ones, apply responses (or the default), add new
   cohort events, draw group events, combine modifiers.
2. Approved financing arrives.
3. Stock: last period's orders arrive (paid on delivery), new orders placed
   (capped by cash, supplier capacity).
4. Marketing spend (capped by cash).
5. Capacity.
6. Customer funnel and demand per product × segment (with per-group noise).
7. Sales = min(demand, stock, capacity); revenue, cost of goods, per-unit costs.
8. Stock-out churn and complaints.
9. Spoilage.
10. Fixed costs and event costs.
11. Loan interest and scheduled repayments (always posted: a debt never vanishes).
12. Competitors serve the rest of the market, then react for next period.
13. Reputation.
14. P&L, cash flow, break-even, runway, status (`cash_out` if cash < 0).
15. Learning signals.
