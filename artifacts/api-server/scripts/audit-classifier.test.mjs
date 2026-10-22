import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTO_QUARANTINE,
  KEEP,
  MANUAL_REVIEW,
  classifyContent,
  normalizeContent,
} from "./audit-classifier.mjs";

test("Arabic letters survive normalization and are not classified as blank", () => {
  assert.equal(normalizeContent("هذا شعور حقيقي"), "هذا شعور حقيقي");
  assert.equal(classifyContent("هذا شعور حقيقي").classification, KEEP);
  assert.ok(!classifyContent("اه").reasons.includes("blank"));
});

test("Cyrillic letters survive normalization and are not classified as blank", () => {
  assert.equal(normalizeContent("Привет мир"), "привет мир");
  assert.equal(classifyContent("Привет").classification, KEEP);
  assert.ok(!classifyContent("Привет").reasons.includes("blank"));
});

test("emoji-only content is distinguished from blank content", () => {
  const result = classifyContent("❤️");
  assert.equal(result.classification, MANUAL_REVIEW);
  assert.deepEqual(result.reasons, ["emoji-only"]);
  assert.ok(!result.reasons.includes("blank"));
});

test("punctuation-only content remains a high-confidence blank", () => {
  const result = classifyContent("...");
  assert.equal(result.classification, AUTO_QUARANTINE);
  assert.ok(result.reasons.includes("blank"));
});
