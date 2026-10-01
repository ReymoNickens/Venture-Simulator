import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { readSheet } from "read-excel-file/node";
import { parseCsv, rowsToPeople, TEMPLATE_HEADERS } from "./sheet.ts";

const template = fileURLToPath(new URL("../../../public/templates/class-list-template.xlsx", import.meta.url));

describe("class list sheets", () => {
  it("the downloadable template has exactly the headings the reader looks for", async () => {
    const rows = await readSheet(template);
    assert.deepEqual(rows[0], [...TEMPLATE_HEADERS]);
    const result = rowsToPeople([...rows, ["Ama Mensah", "PS/ITC/22/0002", "ama@stu.ucc.edu.gh", ""]]);
    assert.equal(result.fatal, null);
    assert.equal(result.people.length, 1);
  });

  it("copes with a title row, renamed and reordered headings, numeric index numbers and blank lines", () => {
    const result = rowsToPeople([
      ["ENT 302 class list 2026", null, null],
      ["Email Address", "Name of student", "Index No.", "Extra notes"],
      ["ama@stu.ucc.edu.gh", "Ama Mensah", 10987654, "rep"],
      [null, null, null, null],
      ["yaw@stu.ucc.edu.gh", "Yaw Boateng", "ps/itc/22/0003", ""],
    ]);
    assert.equal(result.fatal, null);
    assert.deepEqual(
      result.people.map((p) => [p.row, p.fullName, p.indexNumber, p.email]),
      [
        [3, "Ama Mensah", "10987654", "ama@stu.ucc.edu.gh"],
        [5, "Yaw Boateng", "ps/itc/22/0003", "yaw@stu.ucc.edu.gh"],
      ],
    );
  });

  it("reports bad rows with the row number the rep sees in Excel", () => {
    const result = rowsToPeople([
      ["Full name", "Index number", "Email"],
      ["Ama Mensah", "A1", "ama@stu.ucc.edu.gh"],
      ["No Email", "A2", ""],
      ["Ama Twice", "A3", "AMA@stu.ucc.edu.gh"],
      ["Bad Email", "A4", "bad.email"],
    ]);
    assert.deepEqual(result.problems, [
      { row: 3, reason: "Email is missing" },
      { row: 4, reason: "Same email or index number as row 2" },
      { row: 5, reason: "Email does not look right" },
    ]);
    assert.equal(result.people.length, 1);
  });

  it("explains a sheet with no recognisable headings", () => {
    const result = rowsToPeople([
      ["Ama Mensah", "A1", "ama@stu.ucc.edu.gh"],
      ["Yaw Boateng", "A2", "yaw@stu.ucc.edu.gh"],
    ]);
    assert.match(result.fatal ?? "", /column headings/);
  });

  it("reads CSV saved from Excel: BOM, quotes, commas inside names, semicolons", () => {
    assert.deepEqual(parseCsv('﻿Full name,Index number,Email\r\n"Mensah, Ama",A1,ama@x.edu\r\n'), [
      ["Full name", "Index number", "Email"],
      ["Mensah, Ama", "A1", "ama@x.edu"],
    ]);
    assert.deepEqual(parseCsv('Full name;Index number;Email\nKofi "KK" Asare;A2;k@x.edu'), [
      ["Full name", "Index number", "Email"],
      ['Kofi "KK" Asare', "A2", "k@x.edu"],
    ]);
  });
});
