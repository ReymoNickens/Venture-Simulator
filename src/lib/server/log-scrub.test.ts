import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scrub } from "./log-scrub.ts";

describe("server error log scrubbing", () => {
  it("removes photo data URLs and long base64", () => {
    const out = scrub(`insert failed for data:image/jpeg;base64,${"A".repeat(5000)} and ${"B".repeat(300)}`);
    assert.doesNotMatch(out, /AAAA|BBBB/);
    assert.match(out, /data:\[redacted\]/);
  });

  it("removes API keys, bearer tokens and cookie values", () => {
    const out = scrub(
      "401 from provider: sk-ant-api03-SECRETSECRET xai-abcdefghijklmnopqrstu Authorization: Bearer abc.def.ghi __Host-evp-auth.session_token=tok123; cookie: x=y",
    );
    assert.doesNotMatch(out, /SECRETSECRET|abcdefghijklmnopqrstu|abc\.def\.ghi|tok123/);
  });

  it("truncates", () => {
    assert.equal(scrub("word ".repeat(2_000)).length, 500);
  });
});
