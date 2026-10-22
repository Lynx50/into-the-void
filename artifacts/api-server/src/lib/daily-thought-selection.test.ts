import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPublicDailyThoughtResponse,
  getUtcDateKey,
  isDailyThoughtCandidateEligible,
  selectDailyThoughtCandidate,
  type DailyThoughtCandidate,
} from "./daily-thought-selection.ts";

const NOW = new Date("2026-10-22T12:00:00.000Z");

function candidate(
  patch: Partial<DailyThoughtCandidate> = {},
): DailyThoughtCandidate {
  return {
    id: 1,
    userId: "usr_a",
    content: "I finally admitted that slowing down might be what I need today.",
    moderationStatus: "active",
    createdAt: new Date("2026-10-20T10:00:00.000Z"),
    feltThisCount: 0,
    madeThinkCount: 0,
    reportCount: 0,
    previouslySelected: false,
    authorLastSelectedAt: null,
    ...patch,
  };
}

test("seed, test, reported and quarantined content are excluded", () => {
  const result = selectDailyThoughtCandidate(
    [
      candidate({ id: 1, userId: "__seed__" }),
      candidate({ id: 2, content: "test" }),
      candidate({ id: 3, reportCount: 1 }),
      candidate({ id: 4, moderationStatus: "quarantined" }),
      candidate({ id: 5 }),
    ],
    { now: NOW, random: () => 0 },
  );
  assert.equal(result?.candidate.id, 5);
});

test("previously selected thoughts never repeat", () => {
  const result = selectDailyThoughtCandidate(
    [candidate({ id: 1, previouslySelected: true }), candidate({ id: 2 })],
    { now: NOW, random: () => 0 },
  );
  assert.equal(result?.candidate.id, 2);
});

test("author cooldown is enforced and only relaxed when necessary", () => {
  const recentSelection = new Date("2026-10-10T00:00:00.000Z");
  const standard = selectDailyThoughtCandidate(
    [
      candidate({ id: 1, authorLastSelectedAt: recentSelection }),
      candidate({ id: 2, userId: "usr_b" }),
    ],
    { now: NOW, random: () => 0 },
  );
  assert.equal(standard?.candidate.id, 2);
  assert.equal(standard?.selectionMode, "standard");

  const relaxed = selectDailyThoughtCandidate(
    [candidate({ id: 1, authorLastSelectedAt: recentSelection })],
    { now: NOW, random: () => 0 },
  );
  assert.equal(relaxed?.candidate.id, 1);
  assert.equal(relaxed?.selectionMode, "cooldown_relaxed");
});

test("requesting user's thought is excluded when an alternative exists", () => {
  const result = selectDailyThoughtCandidate(
    [candidate({ id: 1 }), candidate({ id: 2, userId: "usr_b" })],
    { now: NOW, requestingUserId: "usr_a", random: () => 0 },
  );
  assert.equal(result?.candidate.id, 2);
  assert.equal(result?.requesterExcluded, true);
});

test("old and recent genuine thoughts both remain eligible", () => {
  const recent = candidate({ id: 1 });
  const old = candidate({
    id: 2,
    userId: "usr_b",
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    feltThisCount: 5,
  });
  assert.equal(
    selectDailyThoughtCandidate([recent, old], {
      now: NOW,
      random: () => 0.999,
    })?.candidate.id,
    1,
  );
  assert.equal(
    selectDailyThoughtCandidate([recent, old], {
      now: NOW,
      random: () => 0,
    })?.candidate.id,
    2,
  );
});

test("quality shortlist selection is random rather than highest-only", () => {
  const high = candidate({ id: 1, feltThisCount: 8 });
  const normal = candidate({ id: 2, userId: "usr_b" });
  const first = selectDailyThoughtCandidate([high, normal], {
    now: NOW,
    random: () => 0,
  });
  const second = selectDailyThoughtCandidate([high, normal], {
    now: NOW,
    random: () => 0.999,
  });
  assert.equal(first?.candidate.id, 1);
  assert.equal(second?.candidate.id, 2);
});

test("no eligible thought produces no daily selection", () => {
  assert.equal(
    selectDailyThoughtCandidate(
      [candidate({ createdAt: new Date("2026-10-22T11:30:00.000Z") })],
      { now: NOW },
    ),
    null,
  );
});

test("a selected thought that is later quarantined becomes unavailable", () => {
  assert.equal(
    isDailyThoughtCandidateEligible(
      candidate({ moderationStatus: "quarantined" }),
      NOW,
    ),
    false,
  );
});

test("the author is privately excluded without exposing identifiers", () => {
  const selection = {
    dateUtc: "2026-10-22",
    text: "A genuine anonymous thought that has enough meaningful detail.",
    authorUserId: "usr_author",
  };
  assert.deepEqual(
    buildPublicDailyThoughtResponse(selection, "usr_author", "2026-10-22"),
    { available: false, dateUtc: "2026-10-22" },
  );
  const publicResponse = buildPublicDailyThoughtResponse(
    selection,
    "usr_other",
    "2026-10-22",
  );
  assert.deepEqual(publicResponse, {
    available: true,
    dateUtc: "2026-10-22",
    text: selection.text,
  });
  assert.equal("authorUserId" in publicResponse, false);
  assert.equal("thoughtId" in publicResponse, false);
});

test("UTC date key is stable across timezone representations", () => {
  assert.equal(
    getUtcDateKey(new Date("2026-10-22T23:30:00-05:00")),
    "2026-10-23",
  );
});
