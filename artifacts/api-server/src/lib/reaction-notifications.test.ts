import assert from "node:assert/strict";
import test from "node:test";
import {
  isReactionNotificationEligible,
  isThoughtDeliveryNotificationEligible,
  reactionNotificationBody,
  THOUGHT_REACHED_NOTIFICATION_BODY,
} from "./reaction-notification-copy.ts";

test("uses anonymous copy for felt-this reactions", () => {
  assert.equal(
    reactionNotificationBody("felt_this"),
    "Someone felt what you shared.",
  );
});

test("uses anonymous copy for a genuinely delivered thought", () => {
  assert.equal(
    THOUGHT_REACHED_NOTIFICATION_BODY,
    "A thought you released reached someone in the void.",
  );
});

test("preloads, seed thoughts and self-deliveries never notify", () => {
  assert.equal(
    isThoughtDeliveryNotificationEligible({
      isNewReceive: true,
      isGenuineUserThought: true,
      thoughtOwnerId: "owner",
      recipientId: "recipient",
    }),
    true,
  );
  assert.equal(
    isThoughtDeliveryNotificationEligible({
      isNewReceive: false,
      isGenuineUserThought: true,
      thoughtOwnerId: "owner",
      recipientId: "recipient",
    }),
    false,
  );
  assert.equal(
    isThoughtDeliveryNotificationEligible({
      isNewReceive: true,
      isGenuineUserThought: false,
      thoughtOwnerId: "seed",
      recipientId: "recipient",
    }),
    false,
  );
  assert.equal(
    isThoughtDeliveryNotificationEligible({
      isNewReceive: true,
      isGenuineUserThought: true,
      thoughtOwnerId: "same",
      recipientId: "same",
    }),
    false,
  );
});

test("uses anonymous copy for made-think reactions", () => {
  assert.equal(
    reactionNotificationBody("made_think"),
    "Something you shared made someone pause and think.",
  );
});

test("only a new reaction from another anonymous user is eligible", () => {
  assert.equal(
    isReactionNotificationEligible({
      isNewReaction: true,
      thoughtOwnerId: "owner",
      reactorId: "reactor",
    }),
    true,
  );
  assert.equal(
    isReactionNotificationEligible({
      isNewReaction: false,
      thoughtOwnerId: "owner",
      reactorId: "reactor",
    }),
    false,
  );
  assert.equal(
    isReactionNotificationEligible({
      isNewReaction: true,
      thoughtOwnerId: "same-user",
      reactorId: "same-user",
    }),
    false,
  );
});
