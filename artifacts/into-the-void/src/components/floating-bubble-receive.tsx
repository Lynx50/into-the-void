import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, Brain } from "lucide-react";
import { ReceivedThought } from "@workspace/api-client-react";
import { MoodIcon } from "./mood-icon";
import { useReactToThought, useUser } from "@/hooks/use-thoughts";
import { cn } from "@/lib/utils";

type Phase = "arriving" | "waiting" | "tapping" | "revealed" | "reacted" | "fading";

interface Props {
  thought: ReceivedThought;
  onClose: () => void;
}

export function FloatingBubbleReceive({ thought, onClose }: Props) {
  const { userId } = useUser();
  const reactMutation = useReactToThought();
  const [phase, setPhase] = useState<Phase>("arriving");
  const [reacted, setReacted] = useState<"felt_this" | "made_think" | null>(null);

  const handleBubbleTap = () => {
    if (phase !== "waiting") return;
    setPhase("tapping");
    setTimeout(() => setPhase("revealed"), 520);
  };

  const handleReact = (type: "felt_this" | "made_think") => {
    if (reacted || !userId || phase !== "revealed") return;
    setReacted(type);
    setPhase("reacted");
    reactMutation.mutate({ id: thought.id, data: { userId, reactionType: type } });
    setTimeout(() => {
      setPhase("fading");
      setTimeout(onClose, 750);
    }, 2200);
  };

  const handleSkip = () => {
    setPhase("fading");
    setTimeout(onClose, 700);
  };

  const showBubble = phase === "arriving" || phase === "waiting" || phase === "tapping";
  const showCard = phase === "revealed" || phase === "reacted";

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: phase === "fading" ? 0 : 1 }}
      transition={{ duration: phase === "fading" ? 0.75 : 0.4 }}
      onAnimationComplete={() => { if (phase === "fading") onClose(); }}
    >
      {/* Dimmed backdrop — fades in with the arrival */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{
          opacity: showBubble ? 1 : 1,
          background: showCard
            ? "radial-gradient(ellipse at center, rgba(18,8,45,0.82) 0%, rgba(4,2,14,0.97) 100%)"
            : "radial-gradient(ellipse at center, rgba(14,6,38,0.72) 0%, rgba(4,2,14,0.92) 100%)",
        }}
        transition={{ duration: showCard ? 0.6 : 1.4 }}
        style={{
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
        }}
        onClick={showCard ? handleSkip : undefined}
      />

      <AnimatePresence mode="wait">
        {/* ── BUBBLE PHASE ── */}
        {showBubble && (
          <motion.div
            key="bubble"
            className="relative z-10 flex flex-col items-center select-none"
            style={{ cursor: phase === "waiting" ? "pointer" : "default" }}
            initial={{ y: -400, opacity: 0, scale: 0.65 }}
            animate={
              phase === "arriving"
                ? { y: 0, opacity: 1, scale: 1 }
                : phase === "tapping"
                ? { scale: [1, 0.86, 0.86], opacity: [1, 1, 0] }
                : { y: 0, opacity: 1, scale: 1 }
            }
            transition={
              phase === "arriving"
                ? { duration: 2.2, ease: [0.18, 0.58, 0.32, 1.0] }
                : phase === "tapping"
                ? { duration: 0.48, times: [0, 0.32, 1], ease: "easeInOut" }
                : { duration: 0 }
            }
            onAnimationComplete={() => {
              if (phase === "arriving") setPhase("waiting");
            }}
            onClick={handleBubbleTap}
          >
            {/* Ripple rings — only in waiting */}
            {phase === "waiting" && [0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="absolute rounded-full"
                style={{
                  width: 220, height: 220,
                  border: "1px solid rgba(160,120,255,0.18)",
                  top: 0, left: 0,
                }}
                initial={{ scale: 1, opacity: 0.4 }}
                animate={{ scale: 1.72 + i * 0.2, opacity: 0 }}
                transition={{
                  duration: 2.6,
                  repeat: Infinity,
                  ease: "easeOut",
                  delay: i * 0.82,
                }}
              />
            ))}

            {/* Bubble shell — breathing when waiting */}
            <motion.div
              className="relative rounded-full"
              style={{ width: 220, height: 220 }}
              animate={phase === "waiting" ? { scale: [1, 1.032, 1, 0.972, 1] } : { scale: 1 }}
              transition={phase === "waiting" ? { duration: 3.4, repeat: Infinity, ease: "easeInOut" } : {}}
            >
              {/* Outer ambient glow */}
              <div className="absolute rounded-full pointer-events-none" style={{
                inset: "-38%",
                background: "radial-gradient(circle, rgba(140,100,255,0.16) 0%, rgba(100,60,200,0.06) 45%, transparent 68%)",
                filter: "blur(22px)",
              }} />

              {/* Rim illumination */}
              <div className="absolute inset-0 rounded-full" style={{
                background: "radial-gradient(circle at 50% 50%, transparent 44%, rgba(175,145,255,0.22) 80%, rgba(255,255,255,0.16) 100%)",
              }} />

              {/* Glass body */}
              <div className="absolute inset-0 rounded-full" style={{
                background: "radial-gradient(circle at 32% 28%, rgba(255,255,255,0.20) 0%, rgba(155,115,255,0.11) 30%, rgba(95,65,195,0.07) 62%, rgba(45,25,95,0.04) 100%)",
                border: "1px solid rgba(200,170,255,0.30)",
                boxShadow: [
                  "inset 0 1px 0 rgba(255,255,255,0.28)",
                  "inset 0 -1px 0 rgba(0,0,0,0.18)",
                  "inset 0 0 32px rgba(155,115,255,0.06)",
                  "0 0 55px rgba(130,90,255,0.20)",
                ].join(", "),
              }} />

              {/* Shimmer sweep — only in waiting */}
              {phase === "waiting" && (
                <div className="absolute inset-0 rounded-full overflow-hidden">
                  <motion.div
                    style={{
                      position: "absolute",
                      top: "-60%",
                      left: "-40%",
                      width: "45%",
                      height: "220%",
                      background: "linear-gradient(108deg, transparent 0%, rgba(255,255,255,0.10) 50%, transparent 100%)",
                      transform: "skewX(-18deg)",
                    }}
                    initial={{ x: "-100%" }}
                    animate={{ x: "680%" }}
                    transition={{
                      duration: 3.8,
                      repeat: Infinity,
                      repeatDelay: 2.0,
                      ease: [0.4, 0, 0.6, 1],
                    }}
                  />
                </div>
              )}

              {/* Primary specular highlight */}
              <div className="absolute rounded-full" style={{
                width: "36%", height: "18%",
                top: "10%", left: "13%",
                background: "radial-gradient(ellipse, rgba(255,255,255,0.86) 0%, rgba(255,255,255,0.28) 55%, transparent 100%)",
                filter: "blur(1.5px)",
                transform: "rotate(-32deg)",
              }} />
              {/* Tiny sharp glint */}
              <div className="absolute rounded-full" style={{
                width: "10.5%", height: "5.5%",
                top: "7%", left: "26%",
                background: "rgba(255,255,255,0.78)",
                filter: "blur(0.5px)",
                transform: "rotate(-32deg)",
              }} />
              {/* Secondary lower-right reflection */}
              <div className="absolute rounded-full" style={{
                width: "26%", height: "12%",
                bottom: "13%", right: "10%",
                background: "radial-gradient(ellipse, rgba(255,255,255,0.30) 0%, transparent 100%)",
                filter: "blur(3px)",
                transform: "rotate(-32deg)",
              }} />

              {/* Text inside bubble */}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 z-10">
                {phase === "waiting" && (
                  <motion.div
                    className="flex flex-col items-center gap-2"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 1.0, delay: 0.4 }}
                  >
                    <span className="text-white/38 text-[10px] tracking-[0.34em] uppercase">tap to open</span>
                    <div className="w-6 h-px bg-white/14" />
                    <span className="text-white/20 text-[9px] tracking-widest">from the void</span>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* ── REVEALED PHASE ── */}
        {showCard && (
          <motion.div
            key="revealed"
            className="relative z-10 w-full max-w-sm"
            initial={{ opacity: 0, scale: 0.86, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: -18 }}
            transition={{ duration: 0.72, ease: [0.22, 0.61, 0.36, 1] }}
          >
            <div
              className="rounded-3xl p-8 sm:p-10 flex flex-col items-center text-center"
              style={{
                background: "rgba(12,7,30,0.95)",
                border: "1px solid rgba(175,138,255,0.18)",
                boxShadow: [
                  "0 0 90px rgba(110,70,255,0.12)",
                  "0 28px 90px rgba(0,0,0,0.70)",
                ].join(", "),
              }}
            >
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.22, duration: 0.65 }}
                className="text-[10px] font-medium tracking-[0.32em] text-white/28 uppercase mb-6"
              >
                anonymous · from the void
              </motion.p>

              {thought.mood && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35, duration: 0.55 }}
                  className="mb-4"
                >
                  <MoodIcon moodId={thought.mood} showLabel />
                </motion.div>
              )}

              <motion.p
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45, duration: 0.85, ease: "easeOut" }}
                className="text-2xl sm:text-3xl leading-relaxed text-white/90 mb-8"
                style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
              >
                "{thought.content}"
              </motion.p>

              {/* Reaction buttons */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.72, duration: 0.6 }}
                className="flex gap-3 w-full"
              >
                <button
                  onClick={() => handleReact("felt_this")}
                  disabled={!!reacted}
                  className={cn(
                    "flex-1 flex flex-col items-center gap-2.5 py-4 px-3 rounded-2xl transition-all duration-300 border",
                    reacted === "felt_this"
                      ? "bg-pink-500/20 border-pink-500/40 text-pink-300"
                      : reacted
                      ? "opacity-30 bg-white/3 border-white/5 text-white/30"
                      : "bg-white/5 border-white/8 hover:bg-white/10 hover:border-white/20 text-white/60 cursor-pointer"
                  )}
                >
                  <Heart className={cn("w-6 h-6 transition-all duration-500", reacted === "felt_this" ? "fill-pink-400 text-pink-400 scale-110" : "")} />
                  <div>
                    <div className="text-xs font-medium tracking-wide">Felt this</div>
                    <div className="text-[10px] opacity-50 mt-0.5">
                      {thought.feltThisCount + (reacted === "felt_this" ? 1 : 0)}
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => handleReact("made_think")}
                  disabled={!!reacted}
                  className={cn(
                    "flex-1 flex flex-col items-center gap-2.5 py-4 px-3 rounded-2xl transition-all duration-300 border",
                    reacted === "made_think"
                      ? "bg-violet-500/20 border-violet-500/40 text-violet-300"
                      : reacted
                      ? "opacity-30 bg-white/3 border-white/5 text-white/30"
                      : "bg-white/5 border-white/8 hover:bg-white/10 hover:border-white/20 text-white/60 cursor-pointer"
                  )}
                >
                  <Brain className={cn("w-6 h-6 transition-all duration-500", reacted === "made_think" ? "text-violet-400 scale-110" : "")} />
                  <div>
                    <div className="text-xs font-medium tracking-wide">Made me think</div>
                    <div className="text-[10px] opacity-50 mt-0.5">
                      {thought.madeThinkCount + (reacted === "made_think" ? 1 : 0)}
                    </div>
                  </div>
                </button>
              </motion.div>

              {!reacted && (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.05, duration: 0.55 }}
                  onClick={handleSkip}
                  className="mt-5 text-[10px] tracking-widest uppercase text-white/20 hover:text-white/42 transition-colors"
                >
                  Let it drift away
                </motion.button>
              )}

              {reacted && (
                <motion.p
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                  className="mt-4 text-[11px] tracking-wider text-white/40"
                >
                  {reacted === "felt_this" ? "You resonated with this." : "You let it make you think."}
                </motion.p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
