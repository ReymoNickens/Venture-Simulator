import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isDue, nextAttemptAt, retryDelayMs, RETRY_BASE_MS, RETRY_MAX_MS } from "./retry.ts";

describe("retryDelayMs", () => {
  it("doubles from the base delay", () => {
    assert.equal(retryDelayMs(0), 0);
    assert.equal(retryDelayMs(1), RETRY_BASE_MS);
    assert.equal(retryDelayMs(2), RETRY_BASE_MS * 2);
    assert.equal(retryDelayMs(3), RETRY_BASE_MS * 4);
  });

  it("caps at the maximum, even after very many attempts", () => {
    assert.equal(retryDelayMs(10), RETRY_MAX_MS);
    assert.equal(retryDelayMs(1_000), RETRY_MAX_MS);
  });
});

describe("isDue", () => {
  const now = new Date("2026-09-28T12:00:00Z");

  it("sends pending and interrupted items straight away", () => {
    assert.equal(isDue({ status: "pending" }, now), true);
    assert.equal(isDue({ status: "syncing" }, now), true);
  });

  it("holds a failed item until its backoff has passed", () => {
    const item = { status: "error", nextAttemptAt: nextAttemptAt(3, now) };
    assert.equal(isDue(item, now), false);
    assert.equal(isDue(item, new Date(now.getTime() + retryDelayMs(3))), true);
  });

  it("lets a manual retry skip the backoff", () => {
    const item = { status: "error", nextAttemptAt: nextAttemptAt(5, now) };
    assert.equal(isDue(item, now, true), true);
  });

  it("retries a failed item from before backoff existed", () => {
    assert.equal(isDue({ status: "error" }, now), true);
  });

  it("never re-sends a finished item", () => {
    assert.equal(isDue({ status: "done" }, now, true), false);
  });
});
