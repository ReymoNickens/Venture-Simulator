// Turn the rows of an uploaded class list (Excel or CSV) into people, and
// say plainly what is wrong with any row. Course reps will rename headers,
// leave blank lines, type index numbers as numbers and paste in extra
// columns, so this is forgiving about layout and strict about content.
import { normalisePerson, personProblem, type PersonInput } from "./service.ts";

export const TEMPLATE_HEADERS = ["Full name", "Index number", "Email", "Programme"] as const;

type Column = "fullName" | "indexNumber" | "email" | "programme";

const HEADER_WORDS: Record<Column, RegExp> = {
  fullName: /^(full\s*)?name(s)?$|^student(\s*name)?$|^name of student$/,
  indexNumber: /^index(\s*(number|no\.?|#))?$|^student\s*id$|^reg(istration)?\s*(number|no\.?)$/,
  email: /^e-?mail(\s*address)?$|^student\s*e-?mail$/,
  programme: /^program(me)?$|^course\s*of\s*study$/,
};

export interface SheetPerson extends PersonInput {
  /** Row number as the rep sees it in Excel (1-based, header included). */
  row: number;
}

export interface SheetResult {
  people: SheetPerson[];
  problems: { row: number; reason: string }[];
  /** Set when the sheet cannot be read at all, e.g. no header row found. */
  fatal: string | null;
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  // Index numbers typed as numbers come back as 10987654 or 1.0987654E7.
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

function matchHeader(text: string): Column | null {
  const t = text.toLowerCase().replace(/[*:]/g, "").replace(/\s+/g, " ").trim();
  for (const [col, re] of Object.entries(HEADER_WORDS) as [Column, RegExp][]) {
    if (re.test(t)) return col;
  }
  return null;
}

export function rowsToPeople(rows: readonly (readonly unknown[])[]): SheetResult {
  // The header is the first row (within the first ten) naming the three
  // required columns; anything above it (a title, a date) is ignored.
  let headerAt = -1;
  let columns: Partial<Record<Column, number>> = {};
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const found: Partial<Record<Column, number>> = {};
    rows[i].forEach((cell, j) => {
      const col = matchHeader(cellText(cell));
      if (col && found[col] === undefined) found[col] = j;
    });
    if (found.fullName !== undefined && found.indexNumber !== undefined && found.email !== undefined) {
      headerAt = i;
      columns = found;
      break;
    }
  }
  if (headerAt === -1) {
    return {
      people: [],
      problems: [],
      fatal: `Could not find the column headings. The first row should read: ${TEMPLATE_HEADERS.join(", ")}. Download the template and copy your list into it.`,
    };
  }

  const people: SheetPerson[] = [];
  const problems: SheetResult["problems"] = [];
  const seen = new Map<string, number>();
  for (let i = headerAt + 1; i < rows.length; i++) {
    const r = rows[i];
    const get = (c: Column) => (columns[c] === undefined ? "" : cellText(r[columns[c]!]));
    const raw = { fullName: get("fullName"), indexNumber: get("indexNumber"), email: get("email"), programme: get("programme") };
    const rowNumber = i + 1;
    if (!raw.fullName && !raw.indexNumber && !raw.email) continue; // blank line
    const problem = personProblem(normalisePerson(raw));
    if (problem) {
      problems.push({ row: rowNumber, reason: problem });
      continue;
    }
    const p = normalisePerson(raw);
    const dupe = seen.get(p.email) ?? seen.get(p.indexNumber);
    if (dupe) {
      problems.push({ row: rowNumber, reason: `Same email or index number as row ${dupe}` });
      continue;
    }
    seen.set(p.email, rowNumber);
    seen.set(p.indexNumber, rowNumber);
    people.push({ row: rowNumber, ...raw });
  }
  if (!people.length && !problems.length) {
    return { people, problems, fatal: "The sheet has headings but no students under them." };
  }
  return { people, problems, fatal: null };
}

/** A small CSV reader: quoted fields, doubled quotes, commas or semicolons. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
