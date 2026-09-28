import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import {
  classification,
  input,
  InputError,
  line,
  noInput,
  photoData,
  photoMime,
  rationale,
  safeId,
  sourceType,
  text,
  title,
  uuid,
} from "./schemas.ts";

// The same shape createEvidence validates with.
const evidence = input(
  z.strictObject({
    clientId: uuid.optional(),
    title,
    content: text(),
    sourceType,
    classification,
    photoData: photoData.nullish(),
    photoMime: photoMime.nullish(),
  }),
);

const good = {
  clientId: "3f1e2b1c-9a4d-4c7e-8f00-1234567890ab",
  title: "Queue at the Science shuttle stop",
  content: "Counted 41 people at 7:40am.",
  sourceType: "observation" as const,
  classification: "fact" as const,
};

const rejects = (fn: () => unknown, pattern?: RegExp) =>
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof InputError, `expected InputError, got ${String(err)}`);
    if (pattern) assert.match(err.message, pattern);
    return true;
  });

describe("server-function input validation", () => {
  it("accepts a well-formed evidence item and trims text", () => {
    const out = evidence({ ...good, title: "  padded  " });
    assert.equal(out.title, "padded");
  });

  it("rejects an unknown classification", () => {
    rejects(() => evidence({ ...good, classification: "gossip" as never }), /classification/i);
  });

  it("rejects unknown keys (strict objects)", () => {
    rejects(() => evidence({ ...good, studentId: "someone-else" } as never), /unexpected fields/i);
  });

  it("rejects a client id that is not a UUID", () => {
    rejects(() => evidence({ ...good, clientId: "1; drop table students" }));
  });

  it("rejects a non-JPEG photo", () => {
    rejects(
      () => evidence({ ...good, photoData: "data:image/png;base64,iVBORw0KGgo=", photoMime: "image/jpeg" }),
      /JPEG/,
    );
    rejects(() => evidence({ ...good, photoData: "data:image/jpeg;base64,/9j/", photoMime: "image/png" as never }));
  });

  it("rejects an oversized photo before it is decoded", () => {
    const huge = `data:image/jpeg;base64,${"A".repeat(4_000_100)}`;
    rejects(() => evidence({ ...good, photoData: huge, photoMime: "image/jpeg" }), /too large/i);
  });

  it("enforces length caps", () => {
    rejects(() => evidence({ ...good, title: "x".repeat(121) }), /120/);
    rejects(() => evidence({ ...good, content: "x".repeat(4001) }), /4000/);
  });

  it("rejects control characters in single-line fields but allows newlines in long text", () => {
    const one = input(z.strictObject({ name: line(120, "Name") }));
    rejects(() => one({ name: "Ama\u0000Owusu" }), /characters/);
    rejects(() => one({ name: "Ama\nOwusu" }), /characters/);
    assert.equal(evidence({ ...good, content: "line one\nline two" }).content, "line one\nline two");
  });

  it("requires a selection rationale of at least 40 characters", () => {
    const r = input(z.strictObject({ rationale }));
    rejects(() => r({ rationale: "Because." }), /alternatives/);
    assert.ok(r({ rationale: "x".repeat(40) }));
  });

  it("accepts seeded non-UUID ids only from a strict character set", () => {
    assert.equal(safeId.parse("offering_entr201_2026s1"), "offering_entr201_2026s1");
    assert.throws(() => safeId.parse("offering'; --"));
  });

  it("rejects any payload sent to a function that takes none", () => {
    const none = input(noInput);
    assert.equal(none(undefined), undefined);
    rejects(() => none({ sneaky: true } as never));
  });
});
