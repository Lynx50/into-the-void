export type PositiveReactionType = "felt_this" | "made_think";

export function reactionNotificationBody(type: PositiveReactionType): string {
  return type === "felt_this"
    ? "Someone felt what you shared."
    : "Something you shared made someone pause and think.";
}

export function isReactionNotificationEligible(input: {
  isNewReaction: boolean;
  thoughtOwnerId: string;
  reactorId: string;
}): boolean {
  return input.isNewReaction && input.thoughtOwnerId !== input.reactorId;
}

export const THOUGHT_REACHED_NOTIFICATION_BODY =
  "A thought you released reached someone in the void.";

export function isThoughtDeliveryNotificationEligible(input: {
  isNewReceive: boolean;
  isGenuineUserThought: boolean;
  thoughtOwnerId: string;
  recipientId: string;
}): boolean {
  return (
    input.isNewReceive &&
    input.isGenuineUserThought &&
    input.thoughtOwnerId !== input.recipientId
  );
}
