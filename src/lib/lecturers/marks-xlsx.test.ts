import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readSheet } from "read-excel-file/node";
import { marksWorkbook } from "./marks-xlsx.ts";

describe("marks sheet", () => {
  it("is a real workbook with a header row and one row per student", async () => {
    const bytes = marksWorkbook(
      [
        {
          fullName: "Ama & Co <Mensah>",
          indexNumber: "PS/1",
          email: "ama@x.edu",
          activated: true,
          group: "Group A",
          problemSubmitted: true,
          pickRecorded: false,
          evidence: 4,
          assumptions: 1,
          advisorQuestions: 2,
          simWeeksSubmitted: 3,
          activity: 12,
          lastActive: "2026-10-01",
        },
      ],
      "ENT 302 · BSc Business · Level 300",
    );
    const rows = await readSheet(Buffer.from(bytes));
    assert.equal(rows[0][0], "ENT 302 · BSc Business · Level 300");
    assert.equal(rows[3][0], "Full name");
    assert.deepEqual(rows[4].slice(0, 9), ["Ama & Co <Mensah>", "PS/1", "ama@x.edu", "Yes", "Group A", "Yes", "No", 4, 1]);
  });
});
