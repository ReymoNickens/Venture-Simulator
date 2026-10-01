// Build the marks sheet as a real .xlsx in the browser (fflate zips the
// handful of XML parts), so lecturers open it straight in Excel.
import { strToU8, zipSync } from "fflate";
import type { MarksRow } from "./data.ts";

const HEADERS = [
  "Full name",
  "Index number",
  "Email",
  "Activated",
  "Group",
  "Problem submitted",
  "Pick recorded",
  "Evidence logged",
  "Assumptions added",
  "Advisor questions",
  "Simulation weeks submitted",
  "Total activity",
  "Last active",
] as const;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const col = (i: number) => String.fromCharCode(65 + i);

function cell(ref: string, v: string | number, style = 0): string {
  const s = style ? ` s="${style}"` : "";
  return typeof v === "number"
    ? `<c r="${ref}"${s}><v>${v}</v></c>`
    : `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
}

export function marksWorkbook(rows: MarksRow[], title: string): Uint8Array {
  const yes = (b: boolean) => (b ? "Yes" : "No");
  const data = rows.map((r) => [
    r.fullName,
    r.indexNumber,
    r.email,
    yes(r.activated),
    r.group,
    yes(r.problemSubmitted),
    yes(r.pickRecorded),
    r.evidence,
    r.assumptions,
    r.advisorQuestions,
    r.simWeeksSubmitted,
    r.activity,
    r.lastActive,
  ]);
  const sheetRows = [
    `<row r="1">${cell("A1", title, 1)}</row>`,
    `<row r="2">${cell("A2", "Activity counts are a starting point for marking, not a mark. Generated " + new Date().toLocaleString())}</row>`,
    `<row r="4">${HEADERS.map((h, i) => cell(`${col(i)}4`, h, 1)).join("")}</row>`,
    ...data.map((r, ri) => `<row r="${ri + 5}">${r.map((v, i) => cell(`${col(i)}${ri + 5}`, v)).join("")}</row>`),
  ].join("");
  const widths = [28, 18, 30, 11, 22, 12, 12, 12, 12, 12, 14, 12, 13];
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>
<sheetData>${sheetRows}</sheetData>
</worksheet>`;
  const files: Record<string, string> = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Marks" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
</styleSheet>`,
    "xl/worksheets/sheet1.xml": sheet,
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
}
