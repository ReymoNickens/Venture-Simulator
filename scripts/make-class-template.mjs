#!/usr/bin/env node
/**
 * Writes public/templates/class-list-template.xlsx: the sheet course reps
 * download, fill in and upload. Sheet 1 has only the headings (so nothing in
 * it is mistaken for a student); sheet 2 explains how to fill it in.
 *
 *   node scripts/make-class-template.mjs
 *
 * Built by hand with fflate (already a dependency of read-excel-file) so no
 * spreadsheet library is needed at runtime or build time.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { strToU8, zipSync } from "fflate";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public/templates/class-list-template.xlsx");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const cell = (ref, text, style = 0) =>
  `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ""}><is><t xml:space="preserve">${esc(text)}</t></is></c>`;

const headers = ["Full name", "Index number", "Email", "Programme"];
const listSheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0" tabSelected="1"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols><col min="1" max="1" width="32" customWidth="1"/><col min="2" max="2" width="22" customWidth="1"/><col min="3" max="3" width="36" customWidth="1"/><col min="4" max="4" width="34" customWidth="1"/></cols>
<sheetData><row r="1">${headers.map((h, i) => cell(`${"ABCD"[i]}1`, h, 1)).join("")}</row></sheetData>
</worksheet>`;

const help = [
  ["How to fill in the class list", 1],
  ["", 0],
  ["1. Use the first sheet, \"Class list\". Keep the headings in row 1 exactly as they are.", 0],
  ["2. One student per row, starting in row 2. Include yourself.", 0],
  ["3. Full name: as on the university register, e.g. Ama Serwaa Mensah.", 0],
  ["4. Index number: exactly as issued, e.g. PS/ITC/22/0001. Students type this to activate.", 0],
  ["5. Email: the address each student will sign in with, e.g. their stu.ucc.edu.gh email.", 0],
  ["6. Programme: optional. Leave blank to use the programme you entered for the class.", 0],
  ["", 0],
  ["You can upload again at any time to add late students or fix a typo.", 0],
  ["Students who have already activated are never changed by a new upload.", 0],
];
const helpSheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<cols><col min="1" max="1" width="100" customWidth="1"/></cols>
<sheetData>${help.map(([t, s], i) => `<row r="${i + 1}">${t ? cell(`A${i + 1}`, t, s) : ""}</row>`).join("")}</sheetData>
</worksheet>`;

const files = {
  "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
  "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
  "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Class list" sheetId="1" r:id="rId1"/><sheet name="How to fill this in" sheetId="2" r:id="rId2"/></sheets>
</workbook>`,
  "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
  "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFD84D"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>
</styleSheet>`,
  "xl/worksheets/sheet1.xml": listSheet,
  "xl/worksheets/sheet2.xml": helpSheet,
};

const zip = zipSync(
  Object.fromEntries(Object.entries(files).map(([k, v]) => [k, [strToU8(v), { mtime: new Date("2026-01-01") }]])),
);
await mkdir(dirname(out), { recursive: true });
await writeFile(out, zip);
console.log(`[make-class-template] wrote ${out} (${zip.length} bytes)`);
