import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { actionsAt, bankDecision, DAYS, fundingPlan, GOAL, newGame, perform, summary, travel, finish, type GameState } from "./fundraise.ts";

const go = (s: GameState, to: Parameters<typeof travel>[1]) => travel(s, to, "trotro");

describe("fundraising game", () => {
  it("starts from the life card, with the goal ahead", () => {
    const s = newGame(1, "uncle");
    assert.equal(s.cash, 20);
    assert.equal(s.day, 1);
    assert.equal(s.at, "hostel");
    assert.ok(s.cash < GOAL);
  });

  it("travel costs a fare or energy", () => {
    const s = newGame(1, "shop");
    const bus = travel(s, "market", "trotro");
    assert.equal(bus.cash, s.cash - 2);
    const walk = travel(s, "market", "walk");
    assert.equal(walk.cash, s.cash);
    assert.ok(walk.energy < s.energy);
  });

  it("actions use time; after the evening a new day starts with energy partly back", () => {
    let s = go(newGame(2, "working"), "library");
    s = perform(s, "prepare_pitch");
    assert.equal(s.slot, 1);
    s = perform(s, "tutor");
    s = perform(s, "tutor");
    assert.equal(s.day, 2);
    assert.equal(s.slot, 0);
    assert.equal(s.raised.jobs, 80);
  });

  it("the bank lends to the prepared and turns away the unprepared", () => {
    let ready = newGame(3, "shop");
    ready = { ...ready, pitch: 3, evidence: 3, cash: 300 };
    const good = bankDecision(ready, [0, 0, 0]);
    assert.equal(good.offer?.amount, 1000);
    const bluff = bankDecision({ ...ready, pitch: 0, evidence: 0, familyTrust: 30 }, [0, 2, 2]);
    assert.equal(bluff.offer, null);
    assert.match(bluff.reason, /show me people will actually pay/);
  });

  it("a loan you accept becomes cash now and weekly repayments later", () => {
    let s = go({ ...newGame(4, "shop"), pitch: 3, evidence: 3 }, "bank");
    s = perform(s, "bank_interview", [0, 0, 0]);
    assert.ok(s.offer);
    const before = s.cash;
    s = perform(s, "accept_offer");
    assert.equal(s.cash, before + 1000);
    assert.equal(s.debts[0].weekly, Math.ceil(1180 / 6));
    assert.equal(s.slot, 2, "the bank queue took most of the day");
  });

  it("asking family again costs more trust and brings less", () => {
    let s = go(newGame(5, "shop"), "family");
    s = perform(s, "ask_family_gift");
    const first = s.raised.family ?? 0;
    const trustAfterFirst = s.familyTrust;
    s = perform(s, "ask_family_gift");
    const second = (s.raised.family ?? 0) - first;
    assert.ok(first > second && second >= 0);
    assert.ok(s.familyTrust < trustAfterFirst);
  });

  it("susu pays out from day 8, less one contribution", () => {
    let s = go(newGame(6, "working"), "market");
    for (let i = 0; i < 3; i++) {
      s = perform(s, "susu_pay");
      s = perform(s, "rest"); // not available at the market: blocked, nothing happens
      s = { ...s, day: s.day + 1, susuToday: false };
    }
    assert.equal(s.susuPaid, 60);
    assert.ok(actionsAt(s).find((a) => a.id === "susu_collect")?.blocked);
    s = { ...s, day: 8 };
    s = perform(s, "susu_collect");
    assert.equal(s.raised.susu, 40);
  });

  it("ends after day 10 and sums up debts, shares and the gap", () => {
    let s = newGame(7, "scholarship");
    for (let i = 0; i < DAYS * 3; i++) s = perform(s, "rest");
    assert.equal(s.over, true);
    const sum = summary(s);
    assert.equal(sum.short, GOAL - s.cash);
    assert.ok(sum.lessons.some((l) => /short/.test(l)));
    const done = finish(newGame(8));
    assert.equal(done.over, true);
  });

  it("the same seed gives the same luck", () => {
    const play = () => {
      let s = newGame(9, "uncle");
      s = perform(s, "call_relative");
      return s.cash;
    };
    assert.equal(play(), play());
  });

  it("uses the venture's own target when given one", () => {
    const s = newGame(10, "shop", 2400);
    assert.equal(s.goal, 2400);
    assert.match(s.log[0].text, /GHS 2400/);
    assert.equal(summary(s).short, 2400 - s.cash);
  });

  it("hands the venture its own cash as capital and every loan as a debt", () => {
    let s = go({ ...newGame(11, "shop"), pitch: 3, evidence: 3 }, "bank");
    s = perform(s, "bank_interview", [0, 0, 0]);
    s = perform(s, "accept_offer");
    const plan = fundingPlan(s);
    assert.equal(plan.loans.length, 1);
    assert.deepEqual(plan.loans[0], { id: "raised_1_bank", source: "bank", amount: 100000, ratePerPeriodBp: 300, termPeriods: 6, flatInterest: true });
    assert.equal(plan.startingCash + plan.loans[0].amount, s.cash * 100);
  });

  it("opens with only the cash the group still holds when it spent some of a loan", () => {
    // GHS 20 of its own, borrow GHS 120 from Kojo, then spend on a fare and susu.
    let s = go(newGame(5, "uncle"), "friend");
    s = perform(s, "borrow_friend");
    assert.equal(s.debts.length, 1, "Kojo lends");
    s = go(s, "market");
    s = finish(perform(s, "susu_pay"));
    assert.ok(s.cash < 120, "some of the loan was spent");
    const plan = fundingPlan(s);
    const cashIn = plan.startingCash + plan.loans.reduce((a, l) => a + l.amount - (l.spentBeforeOpening ?? 0), 0);
    assert.equal(cashIn, s.cash * 100);
    assert.equal(plan.loans[0].amount, 12000, "still owed in full");
  });
});
