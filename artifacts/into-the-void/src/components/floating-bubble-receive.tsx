import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, Brain } from "lucide-react";
import { ReceivedThought } from "@workspace/api-client-react";
import { MoodIcon } from "./mood-icon";
import { useReactToThought, useUser } from "@/hooks/use-thoughts";
import { cn } from "@/lib/utils";

type Phase = "floating" | "popping" | "revealed" | "reacted" | "fading";

interface Props {
  thought: ReceivedThought;
  onClose: () => void;
}

export function FloatingBubbleReceive({ thought, onClose }: Props) {
  const { userId } = useUser();
  const reactMutation = useReactToThought();
  const [phase, setPhase] = useState<Phase>("floating");
  const [reacted, setReacted] = useState<"felt_this" | "made_think" | null>(null);

  const handleBubbleTap = () => {
    if (phase !== "floating") return;
    setPhase("popping");
    setTimeout(() => setPhase("revealed"), 400);
  };

  const handleReact = (type: "felt_this" | "made_think") => {
    if (reacted || !userId || phase !== "revealed") return;
    setReacted(type);
    setPhase("reacted");
    reactMutation.mutate({ id: thought.id, data: { userId, reactionType: type } });
    setTimeout(() => {
      setPhase("fading");
      setTimeout(onClose, 800);
    }, 1800);
  };

  const handleSkip = () => {
    setPhase("fading");
    setTimeout(onClose, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center pb-32 px-4" onClick={phase === "floating" ? handleBubbleTap : undefined}>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={phase !== "floating" ? handleSkip : undefined}
      />

      <AnimatePresence mode="wait">
        {/* PHASE: Floating bubble — tap to pop */}
        {(phase === "floating" || phase === "popping") && (
          <motion.div
            key="bubble"
            initial={{ y: 200, opacity: 0, scale: 0.4 }}
            animate={
              phase === "floating"
                ? { y: 0, opacity: 1, scale: 1 }
                : { scale: [1, 1.3, 0], opacity: [1, 1, 0] }
            }
            transition={
              phase === "floating"
                ? { type: "spring", stiffness: 60, damping: 14, duration: 1.2 }
                : { duration: 0.4, ease: "easeOut" }
            }
            className="relative z-10 cursor-pointer select-none"
            onClick={handleBubbleTap}
          >
            {/* Outer glow ring */}
            <div className="absolute inset-0 rounded-full bg-primary/10 blur-2xl scale-150 animate-pulse" />
            {/* Outer pulse ring */}
            <div className="absolute inset-0 rounded-full border border-primary/20 animate-[ping_2.5s_cubic-bezier(0,0,0.2,1)_infinite]" />

            {/* Bubble body */}
            <div
              className="relative w-52 h-52 sm:w-64 sm:h-64 rounded-full flex flex-col items-center justify-center gap-2"
              style={{
                background: "radial-gradient(circle at 35% 35%, rgba(180,140,255,0.18) 0%, rgba(100,60,200,0.08) 50%, rgba(60,30,120,0.04) 100%)",
                border: "1px solid rgba(200,160,255,0.25)",
                boxShadow: "0 0 40px rgba(140,100,255,0.2), inset 0 0 30px rgba(200,160,255,0.05)",
              }}
            >
              {/* Bubble shine */}
              <div className="absolute top-6 left-8 w-8 h-4 rounded-full bg-white/15 blur-sm rotate-[-30deg]" />
              <div className="absolute top-4 left-10 w-3 h-2 rounded-full bg-white/25 blur-[2px] rotate-[-30deg]" />

              <span className="text-white/50 text-xs tracking-[0.25em] uppercase font-medium">tap to open</span>
              <div className="w-8 h-px bg-white/15" />
              <span className="text-white/30 text-[10px] tracking-widest">from the void</span>
            </div>
          </motion.div>
        )}

        {/* PHASE: Thought revealed */}
        {(phase === "revealed" || phase === "reacted") && (
          <motion.div
            key="revealed"
            initial={{ opacity: 0, scale: 0.7, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -20 }}
            transition={{ type: "spring", stiffness: 180, damping: 22 }}
            className="relative z-10 w-full max-w-sm"
          >
            {/* Particle burst (decorative dots) */}
            {[...Array(8)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-1.5 h-1.5 rounded-full bg-primary/60"
                style={{ left: "50%", top: "50%" }}
                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                animate={{
                  x: Math.cos((i / 8) * Math.PI * 2) * 90,
                  y: Math.sin((i / 8) * Math.PI * 2) * 90,
                  opacity: 0,
                  scale: 0,
                }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
            ))}

            <div
              className="rounded-3xl p-8 sm:p-10 flex flex-col items-center text-center"
              style={{
                background: "rgba(15,10,35,0.92)",
                border: "1px solid rgba(180,140,255,0.2)",
                boxShadow: "0 0 60px rgba(140,100,255,0.15), 0 20px 60px rgba(0,0,0,0.6)",
              }}
            >
              <p className="text-[10px] font-medium tracking-[0.3em] text-white/30 uppercase mb-6">
                anonymous · from the void
              </p>

              {thought.mood && (
                <div className="mb-4">
                  <MoodIcon moodId={thought.mood} showLabel />
                </div>
              )}

              <p
                className="text-2xl sm:text-3xl leading-relaxed text-white/90 mb-8"
                style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
              >
                "{thought.content}"
              </p>

              {/* Reaction buttons */}
              <div className="flex gap-3 w-full">
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
                  <Heart
                    className={cn(
                      "w-6 h-6 transition-all duration-500",
                      reacted === "felt_this" ? "fill-pink-400 text-pink-400 scale-110" : ""
                    )}
                  />
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
                  <Brain
                    className={cn(
                      "w-6 h-6 transition-all duration-500",
                      reacted === "made_think" ? "text-violet-400 scale-110" : ""
                    )}
                  />
                  <div>
                    <div className="text-xs font-medium tracking-wide">Made me think</div>
                    <div className="text-[10px] opacity-50 mt-0.5">
                      {thought.madeThinkCount + (reacted === "made_think" ? 1 : 0)}
                    </div>
                  </div>
                </button>
              </div>

              {!reacted && (
                <button
                  onClick={handleSkip}
                  className="mt-5 text-[10px] tracking-widest uppercase text-white/20 hover:text-white/40 transition-colors"
                >
                  Let it drift away
                </button>
              )}

              {reacted && (
                <motion.p
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 text-[11px] tracking-wider text-white/40"
                >
                  {reacted === "felt_this" ? "You resonated with this." : "You let it make you think."}
                </motion.p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
