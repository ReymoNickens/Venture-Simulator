import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatPhone, isPhoneEmail, normalisePhone, phoneEmail } from "./phone.ts";

describe("phone numbers", () => {
  it("accepts the ways Ghanaian numbers are written", () => {
    for (const v of ["0244123456", "024 412 3456", "024-412-3456", "233244123456", "+233 24 412 3456", "00233244123456", "244123456"]) {
      assert.equal(normalisePhone(v), "+233244123456", v);
    }
  });
  it("keeps other countries that use +", () => {
    assert.equal(normalisePhone("+44 7700 900123"), "+447700900123");
  });
  it("refuses what is not a number", () => {
    for (const v of ["", "12345", "02441234", "+233 24 412 34567", "abc", "0244123456789"]) {
      assert.equal(normalisePhone(v), null, v);
    }
  });
  it("formats Ghanaian numbers the local way", () => {
    assert.equal(formatPhone("+233244123456"), "024 412 3456");
    assert.equal(formatPhone("+447700900123"), "+447700900123");
  });
  it("makes and recognises placeholder emails", () => {
    assert.equal(phoneEmail("+233244123456"), "233244123456@phone.ent302.invalid");
    assert.equal(isPhoneEmail("233244123456@phone.ent302.invalid"), true);
    assert.equal(isPhoneEmail("ama@ucc.edu.gh"), false);
  });
});
