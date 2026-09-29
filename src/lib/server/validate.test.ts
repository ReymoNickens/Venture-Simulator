import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import { parseInput } from "./validate.ts";

describe("parseInput", () => {
  const parse = parseInput(z.object({ price: z.number().int().positive() }));

  it("returns the parsed value", () => {
    assert.deepEqual(parse({ price: 500 }), { price: 500 });
  });

  it("throws a user-facing INVALID error naming the field", () => {
    assert.throws(
      () => parse({ price: -1 }),
      (err: unknown) =>
        (err as { code?: string }).code === "INVALID" && /^price: /.test((err as Error).message),
    );
  });
});
