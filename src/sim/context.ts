// Per-period working context: the explanation trail and the append-only
// ledger. Modules never change cash directly; they post transactions here.
import { assertPesewas, type Pesewas } from "./money.ts";
import type { Rng, RngDraw } from "./rng.ts";
import type {
  ExplanationLine,
  Scenario,
  Transaction,
  TxCategory,
  Visibility,
} from "./types.ts";

export class EngineInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineInputError";
  }
}

export interface ExplainInputs {
  decisions?: string[];
  params?: string[];
  events?: string[];
  rng?: RngDraw[];
  lines?: string[];
}

export class PeriodContext {
  readonly scenario: Scenario;
  readonly period: number;
  readonly rng: Rng;
  readonly lines: ExplanationLine[] = [];
  readonly transactions: Transaction[] = [];
  private txSeq = 0;
  private lineSeq = 0;
  private balance: Pesewas;

  constructor(scenario: Scenario, period: number, rng: Rng, openingCash: Pesewas) {
    this.scenario = scenario;
    this.period = period;
    this.rng = rng;
    this.balance = openingCash;
  }

  /** Cash right now: opening balance plus every transaction posted so far. */
  get cash(): Pesewas {
    return this.balance;
  }

  explain(
    module: string,
    metric: string,
    value: number | string,
    text: string,
    inputs: ExplainInputs = {},
    visibility: Visibility = "student",
  ): string {
    this.lineSeq += 1;
    const id = `p${this.period}.${module}.${this.lineSeq}`;
    const out: ExplanationLine["inputs"] = {};
    if (inputs.decisions?.length) out.decisions = inputs.decisions;
    if (inputs.params?.length) out.params = inputs.params;
    if (inputs.events?.length) out.events = inputs.events;
    if (inputs.lines?.length) out.lines = inputs.lines;
    if (inputs.rng?.length) {
      out.rng = inputs.rng.map((d) => ({ stream: d.stream, index: d.index, value: d.value }));
    }
    this.lines.push({ id, module, metric, value, text, inputs: out, visibility });
    return id;
  }

  /** The ONLY way cash changes. Zero amounts are not recorded. */
  post(
    category: TxCategory,
    amount: Pesewas,
    memo: string,
    ref: string | null,
    explainId: string,
  ): Transaction | null {
    assertPesewas(amount, `transaction "${memo}"`);
    if (amount === 0) return null;
    this.txSeq += 1;
    const tx: Transaction = {
      id: `${this.period}:${this.txSeq}`,
      period: this.period,
      category,
      amount,
      memo,
      ref,
      explainId,
    };
    this.transactions.push(tx);
    this.balance += amount;
    return tx;
  }
}

/** Cash is derived, never stored: the sum of the ledger. */
export function cashBalance(ledger: readonly Transaction[]): Pesewas {
  let sum = 0;
  for (const tx of ledger) sum += tx.amount;
  return sum;
}
