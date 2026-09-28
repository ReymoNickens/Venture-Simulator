import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { databaseGuardError, poolSettings } from "./db-config.ts";

describe("fail closed without a production database", () => {
  it("allows local development without DATABASE_URL", () => {
    assert.equal(databaseGuardError({}), null);
    assert.equal(databaseGuardError({ NODE_ENV: "development" }), null);
  });

  it("refuses a production process without DATABASE_URL", () => {
    assert.match(String(databaseGuardError({ NODE_ENV: "production" })), /DATABASE_URL/);
    assert.match(String(databaseGuardError({ VERCEL: "1" })), /DATABASE_URL/);
    assert.match(String(databaseGuardError({ GROK_PROJECT_ID: "p1" })), /DATABASE_URL/);
  });

  it("treats a blank DATABASE_URL as missing", () => {
    assert.match(String(databaseGuardError({ NODE_ENV: "production", DATABASE_URL: "   " })), /DATABASE_URL/);
  });

  it("lets a local production preview opt in, but never on a hosting platform", () => {
    assert.equal(databaseGuardError({ NODE_ENV: "production", ALLOW_EPHEMERAL_DB: "true" }), null);
    assert.match(String(databaseGuardError({ VERCEL: "1", ALLOW_EPHEMERAL_DB: "true" })), /DATABASE_URL/);
  });

  it("is satisfied by a real DATABASE_URL", () => {
    assert.equal(databaseGuardError({ VERCEL: "1", DATABASE_URL: "postgres://u:p@db.neon.tech/app" }), null);
  });
});

describe("pool settings", () => {
  it("keeps pools small, bounded and on SSL for hosted databases", () => {
    const s = poolSettings("postgres://u:p@ep-x.neon.tech/app?sslmode=require", {});
    assert.equal(s.max, 5);
    assert.equal(s.statement_timeout, 15_000);
    assert.deepEqual(s.ssl, { rejectUnauthorized: true });
    assert.equal(poolSettings("postgres://u:p@ep-x.neon.tech/app", {}, "auth").max, 2);
  });

  it("does not force SSL on a local database", () => {
    assert.equal(poolSettings("postgres://u:p@localhost:5432/app", {}).ssl, undefined);
  });

  it("can be tuned by environment", () => {
    assert.equal(poolSettings("postgres://u:p@h/app", { PG_POOL_MAX: "8" }).max, 8);
    assert.equal(poolSettings("postgres://u:p@h/app", { PG_POOL_MAX: "nonsense" }).max, 5);
  });
});
