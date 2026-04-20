import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send } from "lucide-react";
import { ReceivedThought } from "@workspace/api-client-react";
import { FloatingBubbleReceive } from "@/components/floating-bubble-receive";
import { MOODS, type MoodId } from "@/components/mood-icon";
import {
  saveThoughtToOrbitAfterRelease,
  useMyThoughts,
  useReceiveCount,
  useReceiveThought,
  useSubmitThought,
  useUser,
} from "@/hooks/use-thoughts";
import { useNetwork } from "@/hooks/use-network";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { triggerHaptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

export default function Home() {
  const { userId, isReady, isLoading, sessionError, refreshSession } = useUser();
  const { isOnline } = useNetwork();

  const [content, setContent] = useState("");
  const [selectedMood, setSelectedMood] = useState<MoodId | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [receivedThought, setReceivedThought] = useState<ReceivedThought | null>(
    null,
  );
  const [receiveError, setReceiveError] = useState<string | null>(null);
  const [newReactionMessage, setNewReactionMessage] = useState(false);

  const previousReactionCountRef = useRef(0);

  const submitMutation = useSubmitThought();
  const receiveMutation = useReceiveThought();
  const { data: receiveCountData, isLoading: isReceiveCountLoading } =
    useReceiveCount();
  const { data: myThoughts } = useMyThoughts({
    refetchInterval: false,
    refetchOnWindowFocus: false,
    staleTime: 30000,
  });

  const { canInstall, triggerInstall } = usePwaInstall();

  const remainingReceives = receiveCountData?.remaining ?? 3;
  const receiveLimit = receiveCountData?.limit ?? 3;
  const isOverLimit = !isReceiveCountLoading && remainingReceives <= 0;

  const hasSubmitted = !!(myThoughts && myThoughts.length > 0);
  const lastThought = myThoughts?.[0];
  const lastThoughtReactions = lastThought
    ? (lastThought.feltThisCount ?? 0) + (lastThought.madeThinkCount ?? 0)
    : 0;

  const submitDisabled =
    !isOnline || !isReady || !content.trim() || submitMutation.isPending || isLoading;

  const receiveDisabled =
    !isOnline ||
    receiveMutation.isPending ||
    isOverLimit ||
    !isReady ||
    !hasSubmitted ||
    isLoading;

  useEffect(() => {
    const currentCount = lastThoughtReactions ?? 0;
    const previousCount = previousReactionCountRef.current;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    if (currentCount > previousCount && previousCount !== 0) {
      setNewReactionMessage(true);

      timeout = setTimeout(() => {
        setNewReactionMessage(false);
      }, 4000);
    }

    previousReactionCountRef.current = currentCount;

    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [lastThoughtReactions]);

  useEffect(() => {
    if (!isOnline) {
      setSubmitError(null);
      setReceiveError("You're offline right now.");
      return;
    }

    setReceiveError(null);
  }, [isOnline]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!isOnline) {
      setSubmitError("You're offline right now. Reconnect to release your thought.");
      setTimeout(() => setSubmitError(null), 4000);
      return;
    }

    if (!isReady) {
      setSubmitError("Still connecting to the void. Try again in a moment.");
      setTimeout(() => setSubmitError(null), 4000);
      return;
    }

    if (!content.trim() || !userId || submitMutation.isPending) {
      return;
    }

    void triggerHaptic("medium");

    const trimmedContent = content.trim();
    const moodToSubmit = selectedMood;

    setSubmitError(null);

    submitMutation.mutate(
      { data: { userId, content: trimmedContent, mood: moodToSubmit } },
      {
        onSuccess: () => {
          saveThoughtToOrbitAfterRelease({
            id: `local-${Date.now()}`,
            content: trimmedContent,
            mood: moodToSubmit,
            feltThisCount: 0,
            madeThinkCount: 0,
          });

          setContent("");
          setSelectedMood(null);
          setIsSuccess(true);
          setTimeout(() => setIsSuccess(false), 3500);
        },
        onError: (err: any) => {
          if (err?.status === 422) {
            setSubmitError("This thought can't be shared here.");
          } else if (err?.status === 401) {
            setSubmitError("Your session expired. Reconnecting now.");
            void refreshSession();
          } else if (err?.status === 0) {
            setSubmitError("Couldn't reach the server.");
          } else {
            setSubmitError("Couldn't release that one. Try again.");
          }
          setTimeout(() => setSubmitError(null), 4000);
        },
      },
    );
  };

  const handleReceive = () => {
    if (!isOnline) {
      setReceiveError("You're offline right now. Reconnect to receive a thought.");
      setTimeout(() => {
        setReceiveError((current) =>
          current === "You're offline right now. Reconnect to receive a thought."
            ? null
            : current,
        );
      }, 4000);
      return;
    }

    if (!isReady) {
      setReceiveError("Still connecting to the void. Try again in a moment.");
      setTimeout(() => {
        setReceiveError((current) =>
          current === "Still connecting to the void. Try again in a moment."
            ? null
            : current,
        );
      }, 4000);
      return;
    }

    if (isOverLimit) {
      setReceiveError("You've reached your limit for today.");
      setTimeout(() => {
        setReceiveError((current) =>
          current === "You've reached your limit for today." ? null : current,
        );
      }, 4000);
      return;
    }

    if (receiveDisabled || !userId) {
      return;
    }

    void triggerHaptic("medium");
    setReceiveError(null);

    receiveMutation.mutate(
      { data: { userId } },
      {
        onSuccess: (data) => setReceivedThought(data),
        onError: (err: any) => {
          if (err?.status === 404) {
            setReceiveError("No new thoughts right now. Release one and come back later.");
          } else if (err?.status === 429) {
            setReceiveError("You've reached your limit for today.");
          } else if (err?.status === 403) {
            setReceiveError("Release a thought first to unlock receiving.");
          } else if (err?.status === 408) {
            setReceiveError("The void took too long to answer. Try again.");
          } else if (err?.status === 401) {
            setReceiveError("Your session expired. Reconnecting now.");
            void refreshSession();
          } else if (err?.status === 0) {
            setReceiveError("Couldn't reach the server.");
          } else {
            setReceiveError("Failed to reach the void.");
          }
          setTimeout(() => setReceiveError(null), 4000);
        },
      },
    );
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 pb-36">
      <motion.div
        initial={{ opacity: 0, y: -18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.4, ease: "easeOut" }}
        className="absolute top-10 left-0 right-0 text-center pointer-events-none"
      >
        <h1
          className="text-4xl md:text-5xl text-white/88"
          style={{
            fontFamily: "var(--font-display)",
            fontStyle: "italic",
            textShadow:
              "0 0 50px rgba(180,140,255,0.28), 0 0 100px rgba(140,100,220,0.12)",
          }}
        >
          Into the Void
        </h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 1.2 }}
          className="text-xs tracking-[0.22em] text-white/28 mt-3"
          style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
        >
          Let it go... see what's out there.
        </motion.p>

        <AnimatePresence>
          {newReactionMessage && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
              className="mt-2.5 text-[11px] tracking-wide text-primary/70"
              style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
            >
              Someone resonated with one of your thoughts.
            </motion.p>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {lastThought && lastThoughtReactions > 0 && (
            <motion.p
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.8 }}
              className="mt-2.5 text-[11px] tracking-wide text-white/20"
            >
              Your last thought touched {lastThoughtReactions}{" "}
              {lastThoughtReactions === 1 ? "person" : "people"}
            </motion.p>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {!isOnline && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.5 }}
              className="mt-2.5 text-[11px] tracking-wide text-red-400/70"
              style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
            >
              You're offline. Reconnect to send or receive.
            </motion.p>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {sessionError && isOnline && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.5 }}
              className="mt-3 flex flex-col items-center gap-2 pointer-events-auto"
            >
              <p
                className="text-[11px] tracking-wide text-amber-300/80"
                style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
              >
                {sessionError}
              </p>
              <button
                onClick={() => void refreshSession()}
                className="px-4 py-2 rounded-full text-[10px] tracking-[0.22em] uppercase text-white/70 border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
              >
                Retry connection
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.1, delay: 0.3, ease: "easeOut" }}
        className="w-full max-w-xl mt-16 z-10"
      >
        <form onSubmit={handleSubmit} className="relative">
          <div
            className="rounded-3xl p-6 sm:p-8 transition-all duration-700"
            style={{
              background: "rgba(255,255,255,0.035)",
              border: "1px solid rgba(255,255,255,0.065)",
            }}
          >
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Say it... no one knows it's you"
              maxLength={280}
              className="w-full bg-transparent border-none text-xl sm:text-2xl text-white/85 placeholder:text-white/18 focus:outline-none focus:ring-0 resize-none min-h-[110px] leading-relaxed"
              style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
            />

            <div className="flex justify-between items-center mt-5 pt-5 border-t border-white/[0.05]">
              <div className="flex gap-2">
                {MOODS.map((mood) => {
                  const Icon = mood.icon;
                  const isSelected = selectedMood === mood.id;

                  return (
                    <button
                      key={mood.id}
                      type="button"
                      onClick={() => {
                        void triggerHaptic("light");
                        setSelectedMood(isSelected ? null : mood.id);
                      }}
                      title={mood.label}
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center transition-all duration-400",
                        isSelected
                          ? "bg-white/10 scale-110"
                          : "opacity-25 hover:opacity-50 hover:bg-white/5",
                      )}
                    >
                      <Icon
                        className={cn(
                          "w-4 h-4 transition-colors duration-300",
                          isSelected ? mood.color : "text-white/60",
                        )}
                      />
                    </button>
                  );
                })}
              </div>

              <button
                type="submit"
                disabled={submitDisabled}
                className={cn(
                  "flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium tracking-wide transition-all duration-500",
                  !submitDisabled
                    ? "bg-primary/65 hover:bg-primary/85 text-white cursor-pointer shadow-[0_0_24px_rgba(140,100,255,0.22)]"
                    : "bg-white/5 text-white/22 cursor-not-allowed",
                )}
              >
                {submitMutation.isPending
                  ? "Releasing..."
                  : isLoading
                    ? "Connecting..."
                    : "Release"}
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <AnimatePresence>
            {submitError ? (
              <motion.p
                key="submit-error"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                className="absolute -bottom-9 left-0 right-0 text-center text-xs tracking-wide text-red-400/70"
              >
                {submitError}
              </motion.p>
            ) : isSuccess ? (
              <motion.p
                key="submit-success"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6 }}
                className="absolute -bottom-9 left-0 right-0 text-center text-xs tracking-[0.25em] uppercase text-primary/60"
              >
                drifting into the void
              </motion.p>
            ) : null}
          </AnimatePresence>
        </form>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.6, delay: 0.8 }}
        className="mt-16 z-10 flex flex-col items-center gap-5"
      >
        <AnimatePresence mode="wait">
          {!isOnline ? (
            <motion.p
              key="offline"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8 }}
              className="text-sm text-red-400/60 tracking-wide text-center"
              style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
            >
              You're offline right now.
            </motion.p>
          ) : isLoading ? (
            <motion.p
              key="connecting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8 }}
              className="text-sm text-white/30 tracking-wide"
              style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
            >
              Connecting to the void...
            </motion.p>
          ) : hasSubmitted && !isOverLimit ? (
            <motion.p
              key="waiting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8 }}
              className="text-sm text-white/30 tracking-wide"
              style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
            >
              Someone left this here for you...
            </motion.p>
          ) : isOverLimit ? (
            <motion.p
              key="limit"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-white/20 tracking-wide"
            >
              Come back tomorrow for more.
            </motion.p>
          ) : isReady ? (
            <motion.p
              key="gate"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-white/20 tracking-wide text-center max-w-[200px]"
            >
              Release a thought first to receive one.
            </motion.p>
          ) : null}
        </AnimatePresence>

        <button
          onClick={handleReceive}
          disabled={receiveDisabled}
          className={cn(
            "relative flex items-center justify-center w-32 h-32 sm:w-36 sm:h-36 rounded-full transition-all duration-700 focus:outline-none",
            !receiveDisabled
              ? "cursor-pointer hover:scale-[1.06] active:scale-[0.97]"
              : "opacity-35 cursor-not-allowed",
          )}
        >
          {!receiveDisabled && (
            <motion.div
              className="absolute inset-0 rounded-full"
              animate={{ opacity: [0.14, 0.22, 0.14], scale: [1, 1.04, 1] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
              style={{
                background:
                  "radial-gradient(circle, rgba(160,120,255,0.22) 0%, rgba(160,120,255,0.08) 45%, transparent 72%)",
                transform: "translateZ(0)",
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden",
              }}
            />
          )}

          <div
            className="absolute inset-0 rounded-full transition-all duration-500"
            style={{
              background:
                "radial-gradient(circle at 33% 30%, rgba(200,170,255,0.14) 0%, rgba(120,80,210,0.07) 55%, transparent 100%)",
              border: "1px solid rgba(200,170,255,0.2)",
              boxShadow: receiveDisabled
                ? "none"
                : "0 0 36px rgba(140,100,255,0.18), inset 0 0 24px rgba(200,160,255,0.04)",
            }}
          />

          {!receiveDisabled && (
            <div className="absolute top-[16%] left-[22%] w-[22%] h-[10%] rounded-full bg-white/18 blur-[3px] rotate-[-30deg]" />
          )}

          <div className="relative z-10 flex flex-col items-center gap-1">
            {receiveMutation.isPending ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 3.5, ease: "linear" }}
                className="w-5 h-5 rounded-full border border-white/25 border-t-white/70"
              />
            ) : (
              <span
                style={{
                  fontFamily: "system-ui, -apple-system, sans-serif",
                  fontSize: "0.8rem",
                  fontWeight: 500,
                  letterSpacing: "0.18em",
                  color: "rgba(255,255,255,0.72)",
                }}
              >
                RECEIVE
              </span>
            )}
          </div>
        </button>

        <div className="h-5 text-center">
          <AnimatePresence mode="wait">
            {receiveError ? (
              <motion.p
                key="err"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-xs text-red-400/60 tracking-wide"
              >
                {receiveError}
              </motion.p>
            ) : receiveCountData && isOnline ? (
              <motion.p
                key="count"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-[10px] tracking-[0.22em] text-white/18 uppercase"
              >
                {remainingReceives} / {receiveLimit} receives remaining today
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>
      </motion.div>

      <AnimatePresence>
        {receivedThought && (
          <FloatingBubbleReceive
            thought={receivedThought}
            onClose={() => setReceivedThought(null)}
            onReceiveAnother={
              !isOverLimit && isOnline
                ? () => {
                    setReceivedThought(null);
                    setTimeout(() => handleReceive(), 550);
                  }
                : undefined
            }
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {canInstall && (
          <motion.button
            key="pwa-install"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.4 }}
            onClick={triggerInstall}
            className="fixed bottom-6 right-5 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full text-xs tracking-widest uppercase text-white/70 border border-white/10 bg-white/5 backdrop-blur-md hover:bg-white/10 hover:text-white/90 transition-colors"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 13 13"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="opacity-70"
            >
              <path
                d="M6.5 1v7M3.5 5.5 6.5 8.5l3-3M1.5 10.5h10"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Install App
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
