import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { freshSeededDb } from "../server/test-db.ts";
import type { Db } from "./service.ts";
import { createClass, ownerClasses } from "./owner.ts";

const dbOf = (pg: PGlite): Db => ({ query: async <T,>(t: string, p: unknown[] = []) => (await pg.query<T>(t, p)).rows });

describe("owner's classes", () => {
  it("adds a class once and lists it with its counts", async () => {
    const pg = await freshSeededDb();
    try {
      const db = dbOf(pg);
      const input = { courseId: "c1", programme: " BSc  Business ", level: "Level 300", semester: "S1", academicYear: "2026" };
      const { offeringId } = await createClass(db, input);
      await assert.rejects(createClass(db, { ...input, programme: "bsc business" }), /already on the list/);
      const rows = await ownerClasses(db);
      const added = rows.find((r) => r.offeringId === offeringId);
      assert.equal(added?.label, "T101 · BSc Business · Level 300 · S1 2026");
      assert.equal(added?.groups, 0);
      const seeded = rows.find((r) => r.offeringId === "off1");
      assert.equal(seeded?.groups, 2);
      assert.equal(seeded?.students, 2);
    } finally {
      await pg.close();
    }
  });

  it("asks for the programme and level", async () => {
    const pg = await freshSeededDb();
    try {
      await assert.rejects(
        createClass(dbOf(pg), { courseId: "c1", programme: "", level: "Level 300", semester: "S1", academicYear: "2026" }),
        /programme/,
      );
    } finally {
      await pg.close();
    }
  });
});
