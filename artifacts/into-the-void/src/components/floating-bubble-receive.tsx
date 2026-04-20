import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Brain, Heart } from "lucide-react";
import { ReceivedThought } from "@workspace/api-client-react";
import { useReactToThought, useUser } from "@/hooks/use-thoughts";
import { trackEvent } from "@/lib/analytics";
import { apiFetch } from "@/lib/api";
import { triggerHaptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { MoodIcon } from "./mood-icon";

const WHISPERS = [
  "You're not alone.",
  "Someone else felt this too.",
  "Another mind, same thought.",
  "This came from someone like you.",
];

const REPORTED_THOUGHTS_SESSION_KEY = "void_reported_thought_ids_session_v1";

type Phase =
  | "arriving"
  | "waiting"
  | "tapping"
  | "expanding"
  | "reading"
  | "reacted"
  | "fading";

interface Props {
  thought: ReceivedThought;
  onClose: () => void;
  onReceiveAnother?: () => void;
}

function saveReportedThoughtId(thoughtId: number | string) {
  try {
    const raw = sessionStorage.getItem(REPORTED_THOUGHTS_SESSION_KEY);
    const existing: Array<number | string> = raw ? JSON.parse(raw) : [];

    if (!existing.includes(thoughtId)) {
      sessionStorage.setItem(
        REPORTED_THOUGHTS_SESSION_KEY,
        JSON.stringify([...existing, thoughtId]),
      );
    }
  } catch {
    // Ignore storage issues in ephemeral report tracking.
  }
}

export function FloatingBubbleReceive({
  thought,
  onClose,
  onReceiveAnother,
}: Props) {
  const { userId } = useUser();
  const reactMutation = useReactToThought();

  const [phase, setPhase] = useState<Phase>("arriving");
  const [reacted, setReacted] = useState<"felt_this" | "made_think" | null>(
    null,
  );
  const [reportPhase, setReportPhase] = useState<"idle" | "picking" | "done">(
    "idle",
  );
  const [reportError, setReportError] = useState<string | null>(null);

  const whisper = useMemo(
    () => WHISPERS[Math.floor(Math.random() * WHISPERS.length)],
    [],
  );

  const isBubble =
    phase === "arriving" || phase === "waiting" || phase === "tapping";
  const isExpanding = phase === "expanding";
  const isCard = phase === "reading" || phase === "reacted";

  const shapeW = isBubble ? 220 : 338;
  const shapeH = isBubble ? 220 : 560;
  const shapeR = isBubble ? 110 : 32;

  const handleBubbleTap = () => {
    if (phase !== "waiting") {
      return;
    }

    void triggerHaptic("medium");
    void trackEvent("received_bubble_opened", {
      has_mood: Boolean(thought.mood),
    });
    setPhase("tapping");
  };

  const handleReact = (type: "felt_this" | "made_think") => {
    if (reacted || !userId || phase !== "reading") {
      return;
    }

    void triggerHaptic("medium");
    setReacted(type);
    setPhase("reacted");
    reactMutation.mutate({ id: thought.id, data: { userId, reactionType: type } });

    setTimeout(() => {
      setPhase("fading");
      setTimeout(onClose, 500);
    }, 1800);
  };

  const handleSkip = () => {
    setPhase("fading");
    setTimeout(onClose, 450);
  };

  const handleReceiveAnother = () => {
    setPhase("fading");
    setTimeout(() => onReceiveAnother?.(), 450);
  };

  const handleReport = async (
    category: "harmful" | "abusive" | "inappropriate",
  ) => {
    if (reportPhase === "done" || !userId) {
      return;
    }

    setReportError(null);
    void triggerHaptic("light");
    setReportPhase("done");
    saveReportedThoughtId(thought.id);

    void trackEvent("thought_reported", {
      category,
      has_mood: Boolean(thought.mood),
    });

    try {
      await apiFetch(`/thoughts/${thought.id}/report`, {
        method: "POST",
        body: JSON.stringify({ userId, category }),
      });
    } catch (error: any) {
      setReportError(
        error?.status === 401
          ? "Your session expired. Reopen the app and try again."
          : "Saved locally for now.",
      );
    }

    setTimeout(() => {
      setPhase("fading");
      setTimeout(onClose, 450);
    }, 1400);
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: phase === "fading" ? 0 : 1 }}
      transition={{ duration: 0.35 }}
    >
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: phase === "fading" ? 0 : 1 }}
        transition={{ duration: 0.35 }}
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(16,8,38,0.92) 0%, rgba(4,2,14,0.98) 100%)",
        }}
        onClick={isCard ? handleSkip : undefined}
      />

      <motion.div
        className="relative z-10"
        initial={{ y: -260, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{
          duration: phase === "arriving" ? 1.1 : 0.2,
          ease: [0.22, 0.61, 0.36, 1],
        }}
        onAnimationComplete={() => {
          if (phase === "arriving") {
            setPhase("waiting");
          }
        }}
      >
        <motion.div
          animate={
            phase === "waiting"
              ? { y: [0, -8, 0] }
              : phase === "tapping"
                ? { scale: [1, 0.96, 1.02, 1] }
                : { y: 0, scale: 1 }
          }
          transition={
            phase === "waiting"
              ? { duration: 3.8, repeat: Infinity, ease: "easeInOut" }
              : phase === "tapping"
                ? { duration: 0.28, ease: "easeInOut" }
                : { duration: 0.2 }
          }
          onAnimationComplete={() => {
            if (phase === "tapping") {
              setPhase("expanding");
            }
          }}
          style={{ cursor: phase === "waiting" ? "pointer" : "default" }}
          onClick={handleBubbleTap}
        >
          {isBubble && (
            <div
              className="absolute pointer-events-none"
              style={{
                inset: "-24%",
                borderRadius: "50%",
                background:
                  "radial-gradient(circle, rgba(145,105,255,0.14) 0%, rgba(100,60,200,0.05) 48%, transparent 72%)",
              }}
            />
          )}

          <motion.div
            className="relative overflow-hidden"
            animate={{
              width: shapeW,
              height: shapeH,
              borderRadius: shapeR,
            }}
            transition={{
              duration: isExpanding ? 0.55 : 0.2,
              ease: [0.22, 0.61, 0.36, 1],
            }}
            onAnimationComplete={() => {
              if (phase === "expanding") {
                setPhase("reading");
              }
            }}
            style={{ zIndex: 1 }}
          >
            <AnimatePresence>
              {isBubble && (
                <motion.div
                  key="bubble-shell"
                  className="absolute inset-0"
                  initial={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.22 }}
                  style={{
                    background:
                      "radial-gradient(circle at 32% 28%, rgba(255,255,255,0.18) 0%, rgba(155,115,255,0.12) 30%, rgba(92,62,192,0.07) 62%, rgba(42,22,92,0.04) 100%)",
                    border: "1px solid rgba(200,170,255,0.24)",
                    boxShadow:
                      "inset 0 1px 0 rgba(255,255,255,0.20), 0 0 28px rgba(128,88,255,0.12)",
                    transform: "translateZ(0)",
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                  }}
                >
                  <div
                    className="absolute"
                    style={{
                      width: "36%",
                      height: "18%",
                      top: "10%",
                      left: "13%",
                      borderRadius: "50%",
                      background:
                        "radial-gradient(ellipse, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.18) 55%, transparent 100%)",
                      transform: "rotate(-32deg)",
                    }}
                  />
                  <div
                    className="absolute"
                    style={{
                      width: "10%",
                      height: "5%",
                      top: "8%",
                      left: "26%",
                      borderRadius: "50%",
                      background: "rgba(255,255,255,0.65)",
                      transform: "rotate(-32deg)",
                    }}
                  />

                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5">
                    <span className="text-white/36 text-[10px] tracking-[0.36em] uppercase">
                      tap to open
                    </span>
                    <div
                      className="w-5 h-px"
                      style={{ background: "rgba(255,255,255,0.13)" }}
                    />
                    <span className="text-white/20 text-[9px] tracking-widest">
                      from the void
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {!isBubble && (
                <motion.div
                  key="card-shell"
                  className="absolute inset-0"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  style={{
                    background: "rgba(9, 5, 24, 0.97)",
                    border: "1px solid rgba(175,140,255,0.14)",
                    boxShadow:
                      "0 0 32px rgba(105,65,255,0.10), 0 18px 40px rgba(0,0,0,0.55)",
                    backdropFilter: "blur(10px)",
                    WebkitBackdropFilter: "blur(10px)",
                  }}
                />
              )}
            </AnimatePresence>

            <motion.div
              className="absolute inset-0 flex flex-col items-center text-center overflow-hidden"
              style={{ padding: "24px 24px 20px" }}
              animate={{ opacity: isCard ? 1 : 0 }}
              transition={{ duration: 0.28, delay: isCard ? 0.08 : 0 }}
            >
              <motion.p
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: isCard ? 1 : 0, y: isCard ? 0 : 6 }}
                transition={{ delay: 0.12, duration: 0.3 }}
                className="mb-3 shrink-0 text-[10px] font-medium tracking-[0.34em] text-white/26 uppercase"
              >
                anonymous · from the void
              </motion.p>

              {thought.mood && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: isCard ? 1 : 0, y: isCard ? 0 : 6 }}
                  transition={{ delay: 0.18, duration: 0.3 }}
                  className="mb-3 shrink-0"
                >
                  <MoodIcon moodId={thought.mood} showLabel />
                </motion.div>
              )}

              <div className="relative flex min-h-0 w-full flex-1 items-center justify-center">
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: isCard ? 1 : 0, y: isCard ? 0 : 10 }}
                  transition={{ delay: 0.24, duration: 0.38 }}
                  className="max-w-[260px] text-center text-[1.8rem] leading-[1.4] text-white/92"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontStyle: "italic",
                  }}
                >
                  "
                  {thought.content ??
                    "A quiet thought drifted in, but it arrived incomplete."}
                  "
                </motion.p>
              </div>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: isCard ? 1 : 0 }}
                transition={{ delay: 0.34, duration: 0.4 }}
                className="mb-3 mt-1 shrink-0 text-center text-[11px] tracking-wider text-white/28"
                style={{
                  fontFamily: "var(--font-display)",
                  fontStyle: "italic",
                }}
              >
                {whisper}
              </motion.p>

              <motion.div
                animate={{ opacity: isCard ? 1 : 0, y: isCard ? 0 : 8 }}
                transition={{ delay: 0.42, duration: 0.35 }}
                className="w-full shrink-0"
              >
                <div className="flex w-full gap-3">
                  <button
                    onClick={() => handleReact("felt_this")}
                    disabled={!!reacted || reportPhase === "done"}
                    className={cn(
                      "flex-1 flex flex-col items-center gap-2 py-4 rounded-[28px] transition-all duration-300 border",
                      reacted === "felt_this"
                        ? "bg-pink-500/20 border-pink-500/35 text-pink-300"
                        : reacted || reportPhase === "done"
                          ? "opacity-25 bg-white/3 border-white/5 text-white/25"
                          : "bg-white/5 border-white/8 hover:bg-white/9 hover:border-white/16 text-white/52 cursor-pointer",
                    )}
                  >
                    <Heart
                      className={cn(
                        "h-5 w-5 transition-all duration-300",
                        reacted === "felt_this" ? "fill-pink-400 text-pink-400" : "",
                      )}
                    />
                    <div>
                      <div className="text-[12px] font-medium tracking-wide">
                        Felt this
                      </div>
                      <div className="mt-1 text-[10px] opacity-40">
                        {(thought.feltThisCount ?? 0) +
                          (reacted === "felt_this" ? 1 : 0)}
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => handleReact("made_think")}
                    disabled={!!reacted || reportPhase === "done"}
                    className={cn(
                      "flex-1 flex flex-col items-center gap-2 py-4 rounded-[28px] transition-all duration-300 border",
                      reacted === "made_think"
                        ? "bg-violet-500/20 border-violet-500/35 text-violet-300"
                        : reacted || reportPhase === "done"
                          ? "opacity-25 bg-white/3 border-white/5 text-white/25"
                          : "bg-white/5 border-white/8 hover:bg-white/9 hover:border-white/16 text-white/52 cursor-pointer",
                    )}
                  >
                    <Brain
                      className={cn(
                        "h-5 w-5 transition-all duration-300",
                        reacted === "made_think" ? "text-violet-400" : "",
                      )}
                    />
                    <div>
                      <div className="text-[12px] font-medium tracking-wide">
                        Made me think
                      </div>
                      <div className="mt-1 text-[10px] opacity-40">
                        {(thought.madeThinkCount ?? 0) +
                          (reacted === "made_think" ? 1 : 0)}
                      </div>
                    </div>
                  </button>
                </div>

                {!reacted && reportPhase !== "done" && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: isCard ? 1 : 0 }}
                    transition={{ delay: 0.52, duration: 0.35 }}
                    className="mt-4 flex gap-3"
                  >
                    {onReceiveAnother && (
                      <button
                        onClick={handleReceiveAnother}
                        className="flex-1 py-2 text-[10px] tracking-[0.22em] uppercase text-white/32 hover:text-white/58 transition-colors"
                      >
                        Receive another
                      </button>
                    )}

                    <button
                      onClick={handleSkip}
                      className="flex-1 py-2 text-[10px] tracking-[0.22em] uppercase text-white/20 hover:text-white/38 transition-colors"
                    >
                      Let it drift
                    </button>
                  </motion.div>
                )}

                {reacted && (
                  <motion.p
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="mt-4 text-center text-[11px] tracking-wider text-white/36"
                  >
                    {reacted === "felt_this"
                      ? "You resonated with this."
                      : "You let it make you think."}
                  </motion.p>
                )}

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{
                    opacity: isCard ? (reportPhase === "done" ? 0.95 : 1) : 0,
                  }}
                  transition={{ delay: 0.65, duration: 0.35 }}
                  className="mt-4 w-full"
                >
                  {reportPhase === "done" ? (
                    <div className="text-center">
                      <p className="text-[10px] tracking-[0.18em] uppercase text-white/60">
                        Thought reported
                      </p>
                      {reportError && (
                        <p className="mt-1 text-[9px] tracking-wide text-white/30">
                          {reportError}
                        </p>
                      )}
                    </div>
                  ) : reportPhase === "picking" ? (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25 }}
                      className="flex justify-center gap-2"
                    >
                      {(["Harmful", "Abusive", "Inappropriate"] as const).map(
                        (label) => (
                          <button
                            key={label}
                            onClick={() =>
                              handleReport(
                                label.toLowerCase() as
                                  | "harmful"
                                  | "abusive"
                                  | "inappropriate",
                              )
                            }
                            className="cursor-pointer rounded-lg border px-2.5 py-1.5 text-[9px] tracking-wide uppercase text-white/52 transition-colors hover:text-white/78"
                            style={{
                              borderColor: "rgba(255,255,255,0.08)",
                              background: "rgba(255,255,255,0.02)",
                            }}
                          >
                            {label}
                          </button>
                        ),
                      )}
                    </motion.div>
                  ) : (
                    <div className="flex justify-center">
                      <button
                        onClick={() => setReportPhase("picking")}
                        className="cursor-pointer px-4 py-2 text-[10px] tracking-[0.22em] uppercase text-white/42 transition-colors hover:text-white/62"
                        style={{
                          borderTop: "1px solid rgba(255,255,255,0.06)",
                          borderBottom: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        Report this thought
                      </button>
                    </div>
                  )}
                </motion.div>
              </motion.div>
            </motion.div>
          </motion.div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
