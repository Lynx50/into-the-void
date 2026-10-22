import assert from "node:assert/strict";
import test from "node:test";
import { isObviousSubmissionJunk } from "./content-safety.ts";

test("submission guard preserves short and emotional genuine thoughts", () => {
  assert.equal(isObviousSubmissionJunk("I miss you."), false);
  assert.equal(isObviousSubmissionJunk("Sad"), false);
  assert.equal(
    isObviousSubmissionJunk("I am testing my patience today."),
    false,
  );
});

test("submission guard rejects blank, exact tests and repeated spam", () => {
  assert.equal(isObviousSubmissionJunk("   "), true);
  assert.equal(isObviousSubmissionJunk("test 42"), true);
  assert.equal(isObviousSubmissionJunk("aaaaaaaa"), true);
  assert.equal(isObviousSubmissionJunk("abcabcabcabc"), true);
});
