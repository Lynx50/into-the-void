import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Send } from "lucide-react";
import { ReceivedThought } from "@workspace/api-client-react";
import { FloatingBubbleReceive } from "@/components/floating-bubble-receive";
import { MOODS, type MoodId } from "@/components/mood-icon";
import {
  markReceivedThoughtAsShown,
  popPreloadedReceiveThought,
  prewarmOrbitExperience,
  prewarmReceiveExperience,
  reconcileOrbitThoughtAfterRelease,
  removeLocalOrbitThought,
  restorePreloadedReceiveThought,
  saveThoughtToOrbitAfterRelease,
  useClaimReceivedThought,
  useMyThoughts,
  useReceiveCount,
  useReceiveThought,
  useSubmitThought,
  useUser,
} from "@/hooks/use-thoughts";
import { apiFetch } from "@/lib/api";
import { useNetwork } from "@/hooks/use-network";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { triggerHaptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

export default function Home() {
  const RELEASE_SUCCESS_MS = 3800;
  const RELEASE_FEEDBACK_MS = 1100;
  const RECEIVE_CALM_WAIT_MS = 1200;
  const CACHED_RECEIVE_SHOW_DELAY_MS = 420;

  const { userId, isReady, isLoading, sessionError, refreshSession } = useUser();
  const { isOnline, checkNetwork } = useNetwork();
  const queryClient = useQueryClient();

  const [content, setContent] = useState("");
  const [selectedMood, setSelectedMood] = useState<MoodId | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [receivedThought, setReceivedThought] = useState<ReceivedThought | null>(
    null,
  );
  const [receiveError, setReceiveError] = useState<string | null>(null);
  const [newReactionMessage, setNewReactionMessage] = useState(false);
  const [hasUnlockedReceive, setHasUnlockedReceive] = useState(false);
  const [isReleaseOptimistic, setIsReleaseOptimistic] = useState(false);
  const [receivePendingMessage, setReceivePendingMessage] = useState<string | null>(
    null,
  );
  const [isReceiving, setIsReceiving] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);

  const previousReactionCountRef = useRef(0);
  const releaseSuccessTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const releaseFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const receivePendingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const prewarmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startupPrewarmRef = useRef<string | null>(null);

  const submitMutation = useSubmitThought();
  const receiveMutation = useReceiveThought();
  const claimReceiveMutation = useClaimReceivedThought();
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

  const hasSubmittedThoughts = !!(myThoughts && myThoughts.length > 0);
  const hasSubmitted = hasSubmittedThoughts || hasUnlockedReceive;
  const lastThought = myThoughts?.[0];
  const lastThoughtReactions = lastThought
    ? (lastThought.feltThisCount ?? 0) + (lastThought.madeThinkCount ?? 0)
    : 0;

  const submitDisabled =
    !isOnline || !content.trim() || submitMutation.isPending || isReleaseOptimistic;

  const receiveDisabled =
    !isOnline ||
    isReceiving ||
    isOverLimit ||
    !isReady ||
    !hasSubmitted ||
    isLoading;

  useEffect(() => {
    if (hasSubmittedThoughts) {
      setHasUnlockedReceive(true);
    }
  }, [hasSubmittedThoughts]);

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
      setIsReceiving(false);
      setSubmitError(null);
      setReceiveError("No internet connection.");
      return;
    }

    setReceiveError(null);
  }, [isOnline]);

  useEffect(() => {
    if (isReceiving) {
      if (receivePendingTimeoutRef.current) {
        clearTimeout(receivePendingTimeoutRef.current);
      }

      receivePendingTimeoutRef.current = setTimeout(() => {
        setReceivePendingMessage("Listening to the void...");
      }, RECEIVE_CALM_WAIT_MS);

      return;
    }

    if (receivePendingTimeoutRef.current) {
      clearTimeout(receivePendingTimeoutRef.current);
      receivePendingTimeoutRef.current = null;
    }

    setReceivePendingMessage(null);
  }, [isReceiving]);

  useEffect(() => {
    if (!isOnline || !userId || startupPrewarmRef.current === userId) {
      return;
    }

    startupPrewarmRef.current = userId;
    void prewarmReceiveExperience(userId).catch(() => {
      // Quiet warm-up should never interrupt first render.
    });
  }, [isOnline, userId]);

  useEffect(() => {
    if (!isOnline || !content.trim()) {
      if (prewarmTimeoutRef.current) {
        clearTimeout(prewarmTimeoutRef.current);
        prewarmTimeoutRef.current = null;
      }
      return;
    }

    if (prewarmTimeoutRef.current) {
      clearTimeout(prewarmTimeoutRef.current);
    }

    prewarmTimeoutRef.current = setTimeout(() => {
      void prewarmReceiveExperience(userId)
        .then((activeUserId) =>
          Promise.allSettled([
            queryClient.setQueryData(
              ["receive-count", activeUserId],
              queryClient.getQueryData(["receive-count", activeUserId]),
            ),
            queryClient.prefetchQuery({
              queryKey: ["receive-count", activeUserId],
              queryFn: () =>
                apiFetch<{ count: number; limit: number; remaining: number }>(
                  `/thoughts/receive-count?userId=${encodeURIComponent(activeUserId)}`,
                ),
            }),
            queryClient.prefetchQuery({
              queryKey: ["my-thoughts", activeUserId],
              queryFn: () =>
                apiFetch<any[]>(
                  `/thoughts/my?userId=${encodeURIComponent(activeUserId)}`,
                ),
            }),
          ]),
        )
        .catch(() => {
          // Quiet prewarming should never interrupt the main flow.
        });
    }, 500);

    return () => {
      if (prewarmTimeoutRef.current) {
        clearTimeout(prewarmTimeoutRef.current);
        prewarmTimeoutRef.current = null;
      }
    };
  }, [content, isOnline, queryClient, userId]);

  useEffect(() => {
    return () => {
      if (releaseSuccessTimeoutRef.current) {
        clearTimeout(releaseSuccessTimeoutRef.current);
      }
      if (releaseFeedbackTimeoutRef.current) {
        clearTimeout(releaseFeedbackTimeoutRef.current);
      }
      if (receivePendingTimeoutRef.current) {
        clearTimeout(receivePendingTimeoutRef.current);
      }
      if (prewarmTimeoutRef.current) {
        clearTimeout(prewarmTimeoutRef.current);
      }
    };
  }, []);

  const handleRetryConnection = async () => {
    const online = checkNetwork();

    if (!online) {
      setSubmitError(null);
      setReceiveError("No internet connection.");
      return;
    }

    setSubmitError(null);
    setReceiveError(null);
    submitMutation.reset();
    receiveMutation.reset();
    claimReceiveMutation.reset();

    await refreshSession(false);

    const activeUserId = userId || startupPrewarmRef.current;
    if (!activeUserId) {
      return;
    }

    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: ["receive-count", activeUserId] }),
      queryClient.invalidateQueries({ queryKey: ["my-thoughts", activeUserId] }),
      queryClient.refetchQueries({ queryKey: ["receive-count", activeUserId] }),
      queryClient.refetchQueries({ queryKey: ["my-thoughts", activeUserId] }),
      prewarmReceiveExperience(activeUserId),
    ]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!isOnline) {
      setSubmitError("No internet connection.");
      setTimeout(() => setSubmitError(null), 4000);
      return;
    }

    if (!content.trim() || submitMutation.isPending || isReleaseOptimistic) {
      return;
    }

    void triggerHaptic("medium");

    const trimmedContent = content.trim();
    const moodToSubmit = selectedMood;
    const optimisticOrbitId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimisticCreatedAt = Date.now();

    setSubmitError(null);
    setIsReleaseOptimistic(true);
    setHasUnlockedReceive(true);
    setContent("");
    setSelectedMood(null);
    setIsSuccess(true);

    if (releaseSuccessTimeoutRef.current) {
      clearTimeout(releaseSuccessTimeoutRef.current);
    }
    if (releaseFeedbackTimeoutRef.current) {
      clearTimeout(releaseFeedbackTimeoutRef.current);
    }

    releaseSuccessTimeoutRef.current = setTimeout(() => {
      setIsSuccess(false);
    }, RELEASE_SUCCESS_MS);

    releaseFeedbackTimeoutRef.current = setTimeout(() => {
      setIsReleaseOptimistic(false);
    }, RELEASE_FEEDBACK_MS);

    saveThoughtToOrbitAfterRelease({
      id: optimisticOrbitId,
      content: trimmedContent,
      mood: moodToSubmit,
      feltThisCount: 0,
      madeThinkCount: 0,
      localCreatedAt: optimisticCreatedAt,
      createdAt: new Date(optimisticCreatedAt).toISOString(),
    });

    submitMutation.mutate(
      { data: { userId: userId || undefined, content: trimmedContent, mood: moodToSubmit } },
      {
        onSuccess: (data) => {
          reconcileOrbitThoughtAfterRelease(optimisticOrbitId, {
            id: data?.id ?? optimisticOrbitId,
            content: data?.content ?? trimmedContent,
            mood: data?.mood ?? moodToSubmit,
            feltThisCount: data?.feltThisCount ?? 0,
            madeThinkCount: data?.madeThinkCount ?? 0,
            createdAt: data?.createdAt ?? new Date(optimisticCreatedAt).toISOString(),
          });
          void prewarmReceiveExperience(userId || undefined).catch(() => {
            // Quiet prewarm should not affect release success.
          });
          void prewarmOrbitExperience(userId || undefined).catch(() => {
            // Quiet prewarm should not affect release success.
          });
        },
        onError: (err: any) => {
          setIsReleaseOptimistic(false);
          setIsSuccess(false);
          setContent(trimmedContent);
          setSelectedMood(moodToSubmit);
          removeLocalOrbitThought(optimisticOrbitId);

          if (releaseSuccessTimeoutRef.current) {
            clearTimeout(releaseSuccessTimeoutRef.current);
            releaseSuccessTimeoutRef.current = null;
          }
          if (releaseFeedbackTimeoutRef.current) {
            clearTimeout(releaseFeedbackTimeoutRef.current);
            releaseFeedbackTimeoutRef.current = null;
          }

          if (err?.status === 422) {
            setSubmitError("This thought can't be shared here.");
          } else if (err?.status === 401) {
            setSubmitError("Your session expired. Reconnecting now.");
            void refreshSession(true);
          } else if (err?.status === 0) {
            setSubmitError("No internet connection. Check your signal and try again.");
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
      setReceiveError("No internet connection.");
      setTimeout(() => {
        setReceiveError((current) =>
          current === "No internet connection."
            ? null
            : current,
        );
      }, 4000);
      return;
    }

    if (!isReady) {
      void prewarmReceiveExperience(userId || undefined).catch(() => {
        // Quiet retry.
      });
      setReceiveError("The void is waking up. Try again in a moment.");
      setTimeout(() => {
        setReceiveError((current) =>
          current === "The void is waking up. Try again in a moment." ? null : current,
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
    setIsReceiving(true);

    const cachedThought = popPreloadedReceiveThought(userId);
    if (cachedThought) {
      claimReceiveMutation.mutate(
        {
          data: {
            userId,
            thoughtId: cachedThought.id,
          },
        },
        {
          onSuccess: () => {
            window.setTimeout(() => {
              markReceivedThoughtAsShown(userId, cachedThought.id);
              setReceivedThought(cachedThought);
              setIsReceiving(false);
            }, CACHED_RECEIVE_SHOW_DELAY_MS);
          },
          onError: (err: any) => {
            if (err?.status === 429) {
              setReceiveError("You've reached your limit for today.");
            } else if (err?.status === 401) {
              setReceiveError("Your session expired. Reconnecting now.");
              void refreshSession(true);
              restorePreloadedReceiveThought(userId, cachedThought);
            } else if (err?.status === 0 || err?.status === 408) {
              setReceiveError("The void is waking up. Try again in a moment.");
              restorePreloadedReceiveThought(userId, cachedThought);
            } else if (err?.status === 409 || err?.status === 404) {
              setReceiveError("No new thoughts right now. Try again later.");
            } else {
              setReceiveError("Couldn't reach the void. Try again.");
              restorePreloadedReceiveThought(userId, cachedThought);
            }
            setIsReceiving(false);
            setTimeout(() => setReceiveError(null), 4000);
          },
          onSettled: () => {
            void prewarmReceiveExperience(userId).catch(() => {
              // Quiet refill should not interrupt display.
            });
          },
        },
      );
      return;
    }

    receiveMutation.mutate(
      { data: { userId } },
      {
        onSuccess: (data) => {
          markReceivedThoughtAsShown(userId, data.id);
          setReceivedThought(data);
          void prewarmReceiveExperience(userId).catch(() => {
            // Quiet refill should not interrupt display.
          });
        },
        onError: (err: any) => {
          if (err?.status === 404) {
            setReceiveError("No new thoughts right now. Try again later.");
          } else if (err?.status === 429) {
            setReceiveError("You've reached your limit for today.");
          } else if (err?.status === 403) {
            setReceiveError("Release a thought first to unlock receiving.");
          } else if (err?.status === 408) {
            setReceiveError("The void is waking up. Try again in a moment.");
          } else if (err?.status === 401) {
            setReceiveError("Your session expired. Reconnecting now.");
            void refreshSession(true);
          } else if (err?.status === 0) {
            setReceiveError("No internet connection. Check your signal and try again.");
          } else {
            setReceiveError("Couldn't reach the void. Try again.");
          }
          setTimeout(() => setReceiveError(null), 4000);
        },
        onSettled: () => {
          setIsReceiving(false);
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
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.5 }}
              className="mt-3 flex flex-col items-center gap-2 pointer-events-auto"
            >
              <p
                className="text-[11px] tracking-wide text-red-400/70"
                style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
              >
                No internet connection.
              </p>
              <button
                onClick={() => void handleRetryConnection()}
                className="px-4 py-2 rounded-full text-[10px] tracking-[0.22em] uppercase text-white/70 border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
              >
                Retry connection
              </button>
            </motion.div>
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
                onClick={() => void handleRetryConnection()}
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
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.38, ease: "easeOut" }}
          className="text-center text-base sm:text-[17px] text-white/75 mt-6 mb-5 tracking-wide"
          style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
        >
          Write what you can't say out loud.
        </motion.p>

        <form onSubmit={handleSubmit} className="relative">
          <div
            className="relative rounded-3xl p-6 sm:p-8 transition-all duration-700 overflow-hidden"
            style={{
              background: "rgba(255,255,255,0.09)",
              border: isInputFocused
                ? "1px solid rgba(220,205,255,0.48)"
                : "1px solid rgba(230,210,255,0.35)",
              boxShadow: isInputFocused
                ? "0 0 72px rgba(145,105,235,0.42), 0 0 135px rgba(145,105,235,0.24), inset 0 0 46px rgba(255,255,255,0.06)"
                : "0 0 55px rgba(145,105,235,0.35), 0 0 110px rgba(145,105,235,0.18), inset 0 0 42px rgba(255,255,255,0.05)",
              backdropFilter: "blur(25px)",
            }}
          >
            <div
              className="pointer-events-none absolute inset-0 rounded-[inherit]"
              style={{
                background:
                  "linear-gradient(145deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 18%, rgba(255,255,255,0.015) 42%, rgba(90,58,175,0.08) 100%)",
              }}
            />

            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-24 rounded-t-[inherit]"
              style={{
                background:
                  "linear-gradient(to bottom, rgba(255,255,255,0.25), rgba(255,255,255,0.05), transparent)",
              }}
            />

            <div
              className="pointer-events-none absolute left-[8%] right-[8%] top-[1px] h-px rounded-full"
              style={{
                background:
                  "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.34) 16%, rgba(242,230,255,0.62) 50%, rgba(255,255,255,0.34) 84%, rgba(255,255,255,0) 100%)",
                boxShadow: "0 0 16px rgba(232,214,255,0.28)",
              }}
            />

            <div
              className="pointer-events-none absolute -left-8 top-0 h-28 w-40 rounded-full blur-2xl"
              style={{
                background:
                  "radial-gradient(circle, rgba(255,255,255,0.18) 0%, rgba(214,186,255,0.18) 28%, rgba(145,105,235,0.08) 58%, transparent 100%)",
              }}
            />

            <div
              className="pointer-events-none absolute -right-10 top-1 h-24 w-32 rounded-full blur-2xl"
              style={{
                background:
                  "radial-gradient(circle, rgba(255,255,255,0.12) 0%, rgba(214,186,255,0.16) 26%, rgba(145,105,235,0.08) 58%, transparent 100%)",
              }}
            />

            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
              placeholder="Type your thought here..."
              maxLength={280}
              className="relative z-10 w-full bg-transparent border-none text-xl sm:text-2xl text-white/95 placeholder:text-white/70 focus:outline-none focus:ring-0 resize-none min-h-[110px] leading-tight"
              style={{
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
                lineHeight: 1.22,
              }}
            />

            <p
              className="relative z-10 mt-3 text-xs sm:text-[13px] text-white/72 tracking-wide"
              style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
            >
              No name. No profile. Just let it go.
            </p>

            <div className="flex justify-between items-center mt-5 pt-5 border-t border-white/[0.05]">
              <div className="flex flex-col gap-2">
                <p
                  className="text-[10px] tracking-[0.22em] uppercase text-white/58"
                  style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
                >
                  Optional mood
                </p>

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
                      aria-label={mood.ariaLabel}
                      title={mood.ariaLabel}
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center transition-all duration-400",
                        isSelected
                          ? "bg-white/14 scale-110 shadow-[0_0_16px_rgba(180,140,255,0.28)]"
                          : "opacity-[0.58] hover:opacity-85 hover:bg-white/10",
                      )}
                    >
                      <Icon
                        className={cn(
                          "w-4 h-4 transition-colors duration-300",
                          isSelected ? mood.color : "text-white/78",
                        )}
                      />
                    </button>
                  );
                })}
                </div>
              </div>

              <button
                type="submit"
                disabled={submitDisabled}
                className={cn(
                  "flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold tracking-wide transition-all duration-300 active:scale-[0.97]",
                  !submitDisabled
                    ? "text-white cursor-pointer shadow-[0_0_25px_rgba(156,107,255,0.6),0_0_50px_rgba(156,107,255,0.3)]"
                    : "text-white/70 cursor-not-allowed opacity-100",
                )}
                style={{
                  background: submitDisabled
                    ? "rgba(255,255,255,0.12)"
                    : "linear-gradient(135deg, #9c6bff, #6f4cff)",
                  border: "none",
                }}
              >
                {submitMutation.isPending
                  ? "Released"
                  : isReleaseOptimistic || isSuccess
                    ? "Released"
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
              className="absolute -bottom-9 left-0 right-0 text-center text-xs tracking-wide text-red-300/80"
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
              className="text-sm text-red-300/80 tracking-wide text-center"
              style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
            >
              You're offline right now.
            </motion.p>
          ) : hasSubmitted && !isOverLimit ? (
            <motion.p
              key="waiting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8 }}
              className="text-sm text-white/62 tracking-wide"
              style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
            >
              Someone left this here for you...
            </motion.p>
          ) : isOverLimit ? (
            <motion.p
              key="limit"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-white/58 tracking-wide"
            >
              Come back tomorrow for more.
            </motion.p>
          ) : isReady ? (
            <motion.p
              key="gate"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-white/58 tracking-wide text-center max-w-[220px]"
            >
              Release a thought first to unlock Receive.
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
                  "radial-gradient(circle, rgba(168,126,255,0.34) 0%, rgba(160,120,255,0.18) 45%, transparent 72%)",
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
                "radial-gradient(circle at 33% 30%, rgba(224,198,255,0.24) 0%, rgba(152,108,240,0.12) 46%, rgba(80,54,155,0.08) 72%, transparent 100%)",
              border: "1px solid rgba(200,170,255,0.5)",
              boxShadow: receiveDisabled
                ? "none"
                : "0 0 40px rgba(150,110,255,0.25), inset 0 0 20px rgba(255,255,255,0.05)",
            }}
          />

          {!receiveDisabled && (
            <div className="absolute top-[15%] left-[21%] w-[24%] h-[11%] rounded-full bg-white/28 blur-[4px] rotate-[-30deg]" />
          )}

          <div className="relative z-10 flex flex-col items-center gap-1">
            {isReceiving ? (
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
                  color: "rgba(255,255,255,0.94)",
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
                className="text-xs text-red-300/80 tracking-wide"
              >
                {receiveError}
              </motion.p>
            ) : receivePendingMessage ? (
              <motion.p
                key="pending"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-xs text-white/58 tracking-wide"
                style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
              >
                {receivePendingMessage}
              </motion.p>
            ) : receiveCountData && isOnline ? (
              <motion.p
                key="count"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-[10px] tracking-[0.22em] text-white/52 uppercase"
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
