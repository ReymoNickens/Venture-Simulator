// Deterministic pseudo-random numbers (ADR 0003).
//
// cyrb128 hashes a string seed to four 32-bit words; sfc32 turns them into a
// stream of uniform numbers in [0, 1). Both use only 32-bit integer
// arithmetic, so the same seed gives the same numbers on every machine.
//
// Every module draws from its own named stream so adding a draw in one module
// never shifts the numbers another module sees.

function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

export interface RngDraw {
  stream: string;
  index: number;
  value: number;
}

export class RngStream {
  readonly name: string;
  private a: number;
  private b: number;
  private c: number;
  private d: number;
  private count = 0;
  private readonly log: RngDraw[];

  constructor(seed: string, name: string, log: RngDraw[]) {
    this.name = name;
    [this.a, this.b, this.c, this.d] = cyrb128(`${seed}|${name}`);
    this.log = log;
    // Discard the first outputs: sfc32 needs a few rounds to mix a new state.
    for (let i = 0; i < 12; i++) this.raw();
  }

  private raw(): number {
    this.a >>>= 0;
    this.b >>>= 0;
    this.c >>>= 0;
    this.d >>>= 0;
    let t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    t = (t + this.d) | 0;
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  /** Uniform in [0, 1). Recorded so explanations can cite the exact draw. */
  next(): number {
    return this.nextDraw().value;
  }

  nextDraw(): RngDraw {
    const draw = { stream: this.name, index: this.count++, value: this.raw() };
    this.log.push(draw);
    return draw;
  }

  /** True with probability p, plus the draw that decided it. */
  chance(p: number): { hit: boolean; draw: RngDraw } {
    const draw = this.nextDraw();
    return { hit: draw.value < p, draw };
  }

  /**
   * Bell-shaped noise with mean 0 and standard deviation `sigma`, from the
   * Irwin-Hall sum of 4 uniforms (no log/cos, see ADR 0003). Bounded to
   * ±2*sqrt(3)*sigma, so a single draw can never produce an absurd outlier.
   */
  noise(sigma: number): number {
    return this.noiseDraw(sigma).value;
  }

  noiseDraw(sigma: number): RngDraw {
    let sum = 0;
    for (let i = 0; i < 4; i++) sum += this.raw();
    const draw = { stream: this.name, index: this.count++, value: (sum - 2) * Math.sqrt(3) * sigma };
    this.log.push(draw);
    return draw;
  }
}

/** A family of named streams sharing one seed, with a shared draw log. */
export class Rng {
  readonly seed: string;
  readonly draws: RngDraw[] = [];
  private streams = new Map<string, RngStream>();

  constructor(seed: string) {
    this.seed = seed;
  }

  stream(name: string): RngStream {
    let s = this.streams.get(name);
    if (!s) {
      s = new RngStream(this.seed, name, this.draws);
      this.streams.set(name, s);
    }
    return s;
  }
}
