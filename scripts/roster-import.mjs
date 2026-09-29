#!/usr/bin/env node
/**
 * Pre-loads the student roster an instructor has ahead of time, so students
 * can activate their own account (see src/lib/auth/server.ts) instead of
 * self-registering. Each row becomes an UNCLAIMED `students` row
 * (auth_user_id null) enrolled in the given course offering; a student claims
 * it later by matching its email + index number at /login.
 *
 * Usage:
 *   node scripts/roster-import.mjs roster.csv [courseOfferingId]
 *
 * CSV columns (header row required): email,index_number,full_name,programme
 * Re-running is safe: existing UNCLAIMED rows are updated in place by email;
 * already-claimed rows (a student has signed in) are left untouched.
 */
import { readFile } from "node:fs/promises";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("[roster-import] DATABASE_URL is not set.");
  process.exit(1);
}

const [, , csvPath, courseOfferingId = "offering_entr201_2026s1"] = process.argv;
if (!csvPath) {
  console.error("[roster-import] Usage: node scripts/roster-import.mjs roster.csv [courseOfferingId]");
  process.exit(1);
}

/** Minimal CSV parser — no quoted commas; trims each cell. */
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const [headerLine, ...rows] = lines;
  const headers = headerLine.split(",").map((h) => h.trim());
  return rows.map((line) => {
    const cells = line.split(",").map((c) => c.trim());
    /** @type {Record<string, string>} */
    const row = {};
    headers.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

async function main() {
  const text = await readFile(csvPath, "utf8");
  const rows = parseCsv(text);
  if (rows.length === 0) {
    console.log("[roster-import] No rows found — nothing to do.");
    return;
  }

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    const offering = await client.query("select id from course_offerings where id = $1", [
      courseOfferingId,
    ]);
    if (offering.rows.length === 0) {
      throw new Error(`Course offering ${courseOfferingId} does not exist.`);
    }

    let imported = 0;
    let skipped = 0;
    for (const row of rows) {
      const email = row.email?.trim().toLowerCase();
      const indexNumber = row.index_number?.trim().toUpperCase();
      const fullName = row.full_name?.trim();
      const programme = row.programme?.trim() ?? "";
      if (!email || !indexNumber || !fullName) {
        console.warn(`[roster-import] Skipping incomplete row: ${JSON.stringify(row)}`);
        skipped += 1;
        continue;
      }

      await client.query("begin");
      try {
        const existing = await client.query(
          "select id, auth_user_id from students where lower(email) = $1 or index_number = $2 limit 1",
          [email, indexNumber],
        );
        let studentId;
        if (existing.rows[0]) {
          if (existing.rows[0].auth_user_id) {
            // Already claimed — do not overwrite a live account's identity.
            skipped += 1;
            await client.query("rollback");
            continue;
          }
          studentId = existing.rows[0].id;
          await client.query(
            `update students set email = $1, index_number = $2, full_name = $3, programme = $4, updated_at = now()
             where id = $5`,
            [email, indexNumber, fullName, programme, studentId],
          );
        } else {
          studentId = crypto.randomUUID();
          await client.query(
            `insert into students (id, auth_user_id, email, index_number, full_name, programme, is_synthetic)
             values ($1, null, $2, $3, $4, $5, false)`,
            [studentId, email, indexNumber, fullName, programme],
          );
        }
        await client.query(
          `insert into course_enrolments (id, student_id, course_offering_id, status)
           values ($1, $2, $3, 'active')
           on conflict (student_id, course_offering_id) do nothing`,
          [crypto.randomUUID(), studentId, courseOfferingId],
        );
        await client.query("commit");
        imported += 1;
      } catch (err) {
        await client.query("rollback").catch(() => undefined);
        throw err;
      }
    }
    console.log(`[roster-import] done — ${imported} row(s) imported/updated, ${skipped} skipped.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[roster-import] failed:", err?.message || err);
  process.exit(1);
});
