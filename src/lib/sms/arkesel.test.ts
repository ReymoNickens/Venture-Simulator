import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { migratedDb } from "../server/test-db.ts";
import type { Db } from "../classes/service.ts";
import { ARKESEL_URL, codeMessage, heldMessages, sendSms, sendViaArkesel, smsConfig } from "./arkesel.ts";

describe("Arkesel SMS", () => {
  it("is configured only with both key and sender", () => {
    assert.equal(smsConfig({}), null);
    assert.equal(smsConfig({ ARKESEL_API_KEY: "k" }), null);
    assert.deepEqual(smsConfig({ ARKESEL_API_KEY: " k ", ARKESEL_SENDER_ID: "ENT302" }), { apiKey: "k", senderId: "ENT302" });
  });

  it("posts the message in Arkesel's v2 format", async () => {
    let seen: { url: string; headers: Record<string, string>; body: string } | null = null;
    await sendViaArkesel({ apiKey: "key-1", senderId: "ENT302" }, "+233244123456", "hello", async (url, init) => {
      seen = { url, headers: init.headers, body: init.body };
      return { ok: true, status: 200, json: async () => ({ status: "success", data: [] }) };
    });
    assert.ok(seen);
    const s = seen as { url: string; headers: Record<string, string>; body: string };
    assert.equal(s.url, ARKESEL_URL);
    assert.equal(s.headers["api-key"], "key-1");
    assert.deepEqual(JSON.parse(s.body), { sender: "ENT302", message: "hello", recipients: ["233244123456"] });
  });

  it("reports Arkesel's refusal instead of pretending it was sent", async () => {
    await assert.rejects(
      sendViaArkesel({ apiKey: "bad", senderId: "ENT302" }, "+233244123456", "x", async () => ({
        ok: false,
        status: 401,
        json: async () => ({ status: "error", message: "Invalid API key" }),
      })),
      /Invalid API key/,
    );
  });

  it("holds codes for the owner while SMS is not set up", async () => {
    const pg = await migratedDb();
    try {
      const db: Db = { query: async <T,>(t: string, p: unknown[] = []) => (await pg.query<T>(t, p)).rows };
      assert.equal(await sendSms(db, "+233244123456", codeMessage("123456"), {}), "held");
      const held = await heldMessages(db);
      assert.equal(held.length, 1);
      assert.match(held[0].message, /^123456 is your ENT 302 sign-in code/);
    } finally {
      await pg.close();
    }
  });
});
