import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { isMigrationFile, migrationName, pendingMigrations } from "./migration-plan.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("_migrations keys on basename, not path", () => {
  assert.equal(migrationName("/migrations/0002_todos.sql"), "0002_todos.sql");
  assert.equal(migrationName("migrations/0001_auth.sql"), "0001_auth.sql");
  assert.equal(migrationName("0001_auth.sql"), "0001_auth.sql");
});

test("a file already applied, found by another path, does not re-apply", () => {
  assert.deepEqual(pendingMigrations(["/migrations/0001_auth.sql"], ["0001_auth.sql"]), []);
});

test("pending migrations are returned in name order", () => {
  assert.deepEqual(
    pendingMigrations(
      ["/migrations/0003_c.sql", "/migrations/0001_a.sql", "/migrations/0002_b.sql"],
      ["0001_a.sql"],
    ),
    [
      { name: "0002_b.sql", path: "/migrations/0002_b.sql" },
      { name: "0003_c.sql", path: "/migrations/0003_c.sql" },
    ],
  );
});

test("non-.sql entries are dropped", () => {
  assert.equal(isMigrationFile("auth"), false);
  assert.deepEqual(pendingMigrations(["auth", "README.md"], []), []);
});

test("migration names are unique, so none is silently skipped", () => {
  const names = readdirSync(join(ROOT, "migrations")).filter(isMigrationFile).map(migrationName);
  assert.equal(new Set(names).size, names.length);
});

test("migration numbers are unique, apart from one known, independent pair", () => {
  // 0006_roster (main) and 0006_group_governance were written on parallel
  // branches. They touch different tables and are both idempotent, so either
  // order yields the same schema. Neither may be renamed: _migrations keys on
  // the file name, so a rename would re-run it on databases that already have
  // it. Every new migration must take the next free number instead.
  const KNOWN = new Set(["0006"]);
  const byPrefix = new Map();
  for (const name of readdirSync(join(ROOT, "migrations")).filter((n) => n.endsWith(".sql"))) {
    const prefix = name.split("_", 1)[0];
    byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), name]);
  }
  const clashes = [...byPrefix].filter(([p, names]) => names.length > 1 && !KNOWN.has(p));
  assert.deepEqual(clashes, []);
});
