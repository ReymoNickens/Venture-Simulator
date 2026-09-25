import assert from "node:assert/strict";
import { test } from "node:test";
import { SIGN_OUT_TIMEOUT_MS, runPreSignInSignOut, runSignOut, settleWithin } from "./sign-out-plan.mjs";

const TEST_TIMEOUT_MS = 20;

const hangs = () => new Promise(() => {});
const rejects = () => Promise.reject(new Error("network down"));

/**
 * Drain pending microtasks without advancing mocked time, so "has it finished
 * yet?" is answered by the mocked clock rather than by wall-clock luck.
 * `setImmediate` stays real — only `setTimeout` is mocked.
 */
const flush = () => new Promise((resolve) => setImmediate(resolve));

/**
 * A `runSignOut` call with the browser effects replaced by recorders, so each
 * test asserts on what actually happened rather than on how it was written.
 */
function harness(overrides = {}) {
  /** @type {string[]} */
  const order = [];
  const steps = {
    requestSignOut: () => Promise.resolve(),
    redirect: () => order.push("redirect"),
    timeoutMs: TEST_TIMEOUT_MS,
    ...overrides,
  };
  return { order, run: () => runSignOut(steps) };
}

// JS cannot delete the HttpOnly `__Host-` cookie and `cookieCache` keeps
// serving the cached session, so an unconfirmed sign-out must NOT look like one.

test("a confirmed sign-out redirects", async () => {
  const h = harness();
  await h.run();
  assert.deepEqual(h.order, ["redirect"]);
});

test("a sign-out that never settles throws and does NOT redirect", async () => {
  const h = harness({ requestSignOut: hangs });
  await assert.rejects(h.run(), /still signed in/);
  assert.deepEqual(h.order, [], "no redirect may claim a sign-out the server never made");
});

test("a rejected sign-out throws and does NOT redirect", async () => {
  const h = harness({ requestSignOut: rejects });
  await assert.rejects(h.run(), /still signed in/);
  assert.deepEqual(h.order, []);
});

test("the timeout is distinguishable from a rejection", async () => {
  await assert.rejects(harness({ requestSignOut: hangs }).run(), /timed out/);
  await assert.rejects(harness({ requestSignOut: rejects }).run(), /Sign-out failed/);
});

test("settleWithin reports the outcome and never rejects", async () => {
  assert.equal(await settleWithin(() => Promise.resolve(), TEST_TIMEOUT_MS), "ok");
  assert.equal(await settleWithin(rejects, TEST_TIMEOUT_MS), "failed");
  assert.equal(await settleWithin(hangs, TEST_TIMEOUT_MS), "timeout");
});

test("settleWithin waits its full window, then gives up rather than hanging", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let outcome = null;
  const done = settleWithin(hangs, TEST_TIMEOUT_MS).then((o) => (outcome = o));

  t.mock.timers.tick(TEST_TIMEOUT_MS - 1);
  await flush();
  assert.equal(outcome, null, "the request still has time left");

  t.mock.timers.tick(1);
  await done;
  assert.equal(outcome, "timeout", "the caller is never left waiting on a wedged request");
});

// Pre-sign-in clear (`signIn`): best effort, because it also runs when there
// is no prior session, so a failure must never block sign-in.

test("pre-sign-in: a wedged clear gives up at the sign-out bound", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let finished = false;
  const done = runPreSignInSignOut({ requestSignOut: hangs }).then(() => (finished = true));

  t.mock.timers.tick(SIGN_OUT_TIMEOUT_MS - 1);
  await flush();
  assert.equal(finished, false, "the prior session may still be ending");

  t.mock.timers.tick(1);
  await done;
  assert.equal(finished, true);
});

test("pre-sign-in: a failed clear never blocks sign-in", async () => {
  await runPreSignInSignOut({ requestSignOut: rejects, timeoutMs: TEST_TIMEOUT_MS });
});

test("the default bound is generous but finite", () => {
  assert.ok(SIGN_OUT_TIMEOUT_MS >= 5_000 && SIGN_OUT_TIMEOUT_MS <= 30_000);
});
