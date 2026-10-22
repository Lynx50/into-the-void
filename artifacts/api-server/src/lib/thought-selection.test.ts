import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyThoughtSource,
  isFallbackSeedEligible,
  isSelectionCandidateEligible,
  isSelectionContentEligible,
  RECENT_POOL_WEIGHT,
  selectReceiveCandidate,
  selectWeightedCandidate,
  type SelectionCandidate,
} from "./thought-selection.ts";

const baseCandidate: SelectionCandidate = {
  id: 1,
  userId: "other-user",
  content: "A meaningful thought",
  createdAt: new Date("2026-10-01T12:00:00Z"),
  moderationStatus: "active",
};

test("weighted selection uses approximately sixty percent recent thoughts", () => {
  const recent = ["recent"];
  const established = ["established"];
  let recentCount = 0;
  for (let index = 0; index < 100; index += 1) {
    const values = [index / 100, 0];
    const selected = selectWeightedCandidate(
      recent,
      established,
      () => values.shift() ?? 0,
    );
    if (selected === "recent") recentCount += 1;
  }
  assert.equal(RECENT_POOL_WEIGHT, 0.6);
  assert.equal(recentCount, 60);
});

test("selection falls back when either age pool is sparse", () => {
  assert.equal(
    selectWeightedCandidate([], ["older"], () => 0),
    "older",
  );
  assert.equal(
    selectWeightedCandidate(["newer"], [], () => 0),
    "newer",
  );
  assert.equal(
    selectWeightedCandidate([], [], () => 0),
    undefined,
  );
});

test("quarantined, rejected and deleted thoughts are never eligible", () => {
  for (const moderationStatus of [
    "quarantined",
    "rejected",
    "deleted",
  ] as const) {
    assert.equal(
      isSelectionCandidateEligible(
        { ...baseCandidate, moderationStatus },
        "current-user",
        new Set(),
      ),
      false,
    );
  }
});

test("own thoughts and previously seen thoughts are excluded", () => {
  assert.equal(
    isSelectionCandidateEligible(
      { ...baseCandidate, userId: "current-user" },
      "current-user",
      new Set(),
    ),
    false,
  );
  assert.equal(
    isSelectionCandidateEligible(baseCandidate, "current-user", new Set([1])),
    false,
  );
});

test("seed and user-generated sources remain distinguishable", () => {
  assert.equal(classifyThoughtSource("__seed__"), "seed");
  assert.equal(classifyThoughtSource("anonymous-user"), "user");
  assert.equal(
    isSelectionCandidateEligible(
      { ...baseCandidate, userId: "__seed__" },
      "current-user",
      new Set(),
    ),
    false,
  );
});

test("approved seeds are fallback only and never mix into the primary user pool", () => {
  const userSelection = selectReceiveCandidate(
    ["recent-user"],
    ["established-user"],
    ["seed"],
    () => 0,
  );
  assert.deepEqual(userSelection, {
    candidate: "recent-user",
    source: "user",
  });

  const seedSelection = selectReceiveCandidate([], [], ["seed"], () => 0);
  assert.deepEqual(seedSelection, { candidate: "seed", source: "seed" });
});

test("seed fallback remains available when the genuine user pool is exhausted", () => {
  assert.deepEqual(
    selectReceiveCandidate([], [], ["safe-seed"], () => 0.8),
    {
      candidate: "safe-seed",
      source: "seed",
    },
  );
  assert.equal(
    selectReceiveCandidate([], [], [], () => 0),
    undefined,
  );
});

test("inactive, reported, blank and seen seeds are never eligible fallback", () => {
  const seed = { ...baseCandidate, userId: "__seed__" };
  assert.equal(isFallbackSeedEligible(seed, new Set()), true);
  assert.equal(
    isFallbackSeedEligible(
      { ...seed, moderationStatus: "quarantined" },
      new Set(),
    ),
    false,
  );
  assert.equal(
    isFallbackSeedEligible(
      { ...seed, moderationStatus: "rejected" },
      new Set(),
    ),
    false,
  );
  assert.equal(
    isFallbackSeedEligible({ ...seed, moderationStatus: "deleted" }, new Set()),
    false,
  );
  assert.equal(
    isFallbackSeedEligible({ ...seed, reported: true }, new Set()),
    false,
  );
  assert.equal(
    isFallbackSeedEligible({ ...seed, content: "   " }, new Set()),
    false,
  );
  assert.equal(
    isFallbackSeedEligible({ ...seed, content: "test 123" }, new Set()),
    false,
  );
  assert.equal(isFallbackSeedEligible(seed, new Set([seed.id])), false);
});

test("obvious test variants are excluded without rejecting short emotional text", () => {
  for (const content of ["test", "testing_2", "hello test", "asdf", "qwerty"]) {
    assert.equal(isSelectionContentEligible(content), false);
  }
  for (const content of ["I feel lost", "sad", "I miss home"]) {
    assert.equal(isSelectionContentEligible(content), true);
  }
});

test("candidate choice is not oldest-first and is deterministically testable", () => {
  const established = ["oldest", "middle", "newest-established"];
  const selected = selectWeightedCandidate([], established, () => 0.99);
  assert.equal(selected, "newest-established");
});
