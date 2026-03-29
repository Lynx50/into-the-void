import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Heart, Brain } from "lucide-react";
import { ReceivedThought } from "@workspace/api-client-react";
import { MoodIcon } from "./mood-icon";
import { useReactToThought, useUser } from "@/hooks/use-thoughts";
import { cn } from "@/lib/utils";

const WHISPERS = [
  "You're not alone.",
  "Someone else felt this too.",
  "Another mind, same thought.",
  "This came from someone like you.",
];

// ─── Phase machine ─────────────────────────────────────────────────────────────
// arriving  → bubble drifts in from above
// waiting   → bubble breathes + shimmer + ripples; tap to proceed
// tapping   → squash → rebound (tactile feedback)
// expanding → shape morphs from sphere to card; glass fades
// reading   → thought text is visible; buttons stagger in
// reacted   → reaction submitted, confirmation shown
// fading    → everything dissolves back to home
type Phase = "arriving" | "waiting" | "tapping" | "expanding" | "reading" | "reacted" | "fading";

interface Props {
  thought: ReceivedThought;
  onClose: () => void;
  onReceiveAnother?: () => void;
}

export function FloatingBubbleReceive({ thought, onClose, onReceiveAnother }: Props) {
  const { userId } = useUser();
  const reactMutation = useReactToThought();
  const [phase, setPhase] = useState<Phase>("arriving");
  const [reacted, setReacted] = useState<"felt_this" | "made_think" | null>(null);
  const [reportPhase, setReportPhase] = useState<"idle" | "picking" | "done">("idle");
  const [textArrived, setTextArrived] = useState(false);
  const whisper = useMemo(() => WHISPERS[Math.floor(Math.random() * WHISPERS.length)], []);

  const isBubble = phase === "arriving" || phase === "waiting" || phase === "tapping";
  const isExpanding = phase === "expanding";
  const isCard = phase === "reading" || phase === "reacted";

  // Morphing shape dimensions
  const shapeW = isBubble ? 220 : 330;
  const shapeH = isBubble ? 220 : 460;
  const shapeR = isBubble ? 110 : 28;

  const handleBubbleTap = () => {
    if (phase !== "waiting") return;
    setPhase("tapping");
  };

  const handleReact = (type: "felt_this" | "made_think") => {
    if (reacted || !userId || phase !== "reading") return;
    setReacted(type);
    setPhase("reacted");
    reactMutation.mutate({ id: thought.id, data: { userId, reactionType: type } });
    setTimeout(() => {
      setPhase("fading");
      setTimeout(onClose, 800);
    }, 2400);
  };

  const handleSkip = () => {
    setPhase("fading");
    setTimeout(onClose, 700);
  };

  const handleReceiveAnother = () => {
    setPhase("fading");
    setTimeout(() => onReceiveAnother?.(), 550);
  };

  const handleReport = async (category: "harmful" | "abusive" | "inappropriate") => {
    if (reportPhase === "done" || !userId) return;
    setReportPhase("done");
    try {
      await fetch(`/api/thoughts/${thought.id}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, category }),
      });
    } catch {
      // silent
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: phase === "fading" ? 0 : 1 }}
      transition={{ duration: phase === "fading" ? 0.8 : 0.45 }}
      onAnimationComplete={() => { if (phase === "fading") onClose(); }}
    >
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.6 }}
        style={{
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          background: isCard
            ? "radial-gradient(ellipse at center, rgba(20,9,50,0.88) 0%, rgba(4,2,14,0.97) 100%)"
            : "radial-gradient(ellipse at center, rgba(14,6,38,0.72) 0%, rgba(4,2,14,0.92) 100%)",
          transition: "background 0.9s ease",
        }}
        onClick={isCard ? handleSkip : undefined}
      />

      {/* ── ARRIVAL WRAPPER ── handles y-drift into screen */}
      <motion.div
        className="relative z-10"
        initial={{ y: -420, opacity: 0, scale: 0.62 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={
          phase === "arriving"
            ? { duration: 2.25, ease: [0.18, 0.58, 0.32, 1.0] }
            : { duration: 0 }
        }
        onAnimationComplete={() => {
          if (phase === "arriving") setPhase("waiting");
        }}
      >
        {/* ── BREATHING / TAP WRAPPER ── handles scale pulse + tap squash */}
        <motion.div
          className="relative"
          animate={
            phase === "waiting"
              ? { scale: [1, 1.034, 1, 0.970, 1] }
              : phase === "tapping"
              ? { scale: [1, 0.87, 1.08, 1.0] }
              : { scale: 1 }
          }
          transition={
            phase === "waiting"
              ? { duration: 3.5, repeat: Infinity, ease: "easeInOut" }
              : phase === "tapping"
              ? { duration: 0.54, times: [0, 0.2, 0.68, 1.0], ease: "easeInOut" }
              : {}
          }
          onAnimationComplete={() => {
            if (phase === "tapping") setPhase("expanding");
          }}
          style={{ cursor: phase === "waiting" ? "pointer" : "default" }}
          onClick={handleBubbleTap}
        >
          {/* Ambient glow behind the bubble */}
          {isBubble && (
            <div
              className="absolute pointer-events-none"
              style={{
                inset: "-38%",
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(145,105,255,0.18) 0%, rgba(100,60,200,0.07) 42%, transparent 68%)",
                filter: "blur(24px)",
                zIndex: 0,
              }}
            />
          )}

          {/* Expanding ripple rings — waiting only */}
          {phase === "waiting" && [0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="absolute pointer-events-none"
              style={{
                width: 220, height: 220,
                top: 0, left: 0,
                borderRadius: "50%",
                border: "1px solid rgba(160,120,255,0.20)",
              }}
              initial={{ scale: 1, opacity: 0.38 }}
              animate={{ scale: 1.75 + i * 0.22, opacity: 0 }}
              transition={{ duration: 2.7, repeat: Infinity, ease: "easeOut", delay: i * 0.85 }}
            />
          ))}

          {/* ── MORPHING SHAPE ── sphere → card */}
          <motion.div
            className="relative overflow-hidden"
            animate={{ width: shapeW, height: shapeH, borderRadius: shapeR }}
            transition={
              isExpanding
                ? { duration: 0.78, ease: [0.22, 0.61, 0.36, 1.0] }
                : { duration: 0 }
            }
            onAnimationComplete={() => {
              if (phase === "expanding") setPhase("reading");
            }}
            style={{ position: "relative", zIndex: 1 }}
          >
            {/* ── GLASS LAYERS (fade out during expanding) ── */}
            <motion.div
              className="absolute inset-0"
              animate={{ opacity: isBubble ? 1 : 0 }}
              transition={{ duration: 0.45, delay: isExpanding ? 0.12 : 0 }}
            >
              {/* Rim illumination */}
              <div className="absolute inset-0" style={{
                background: "radial-gradient(circle at 50% 50%, transparent 44%, rgba(178,148,255,0.23) 81%, rgba(255,255,255,0.17) 100%)",
              }} />

              {/* Glass body */}
              <div className="absolute inset-0" style={{
                background: "radial-gradient(circle at 32% 28%, rgba(255,255,255,0.21) 0%, rgba(155,115,255,0.12) 30%, rgba(92,62,192,0.07) 62%, rgba(42,22,92,0.04) 100%)",
                border: "1px solid rgba(200,170,255,0.31)",
                boxShadow: [
                  "inset 0 1px 0 rgba(255,255,255,0.30)",
                  "inset 0 -1px 0 rgba(0,0,0,0.18)",
                  "inset 0 0 34px rgba(152,112,255,0.07)",
                  "0 0 58px rgba(128,88,255,0.22)",
                ].join(", "),
              }} />

              {/* Shimmer sweep — waiting only */}
              {phase === "waiting" && (
                <div className="absolute inset-0 overflow-hidden">
                  <motion.div
                    style={{
                      position: "absolute",
                      top: "-60%", left: "-40%",
                      width: "44%", height: "220%",
                      background: "linear-gradient(108deg, transparent 0%, rgba(255,255,255,0.11) 50%, transparent 100%)",
                      transform: "skewX(-18deg)",
                    }}
                    initial={{ x: "-100%" }}
                    animate={{ x: "700%" }}
                    transition={{ duration: 4.0, repeat: Infinity, repeatDelay: 2.2, ease: [0.4, 0, 0.6, 1] }}
                  />
                </div>
              )}

              {/* Primary specular highlight */}
              <div className="absolute" style={{
                width: "36%", height: "18%", top: "10%", left: "13%",
                borderRadius: "50%",
                background: "radial-gradient(ellipse, rgba(255,255,255,0.88) 0%, rgba(255,255,255,0.28) 55%, transparent 100%)",
                filter: "blur(1.5px)",
                transform: "rotate(-32deg)",
              }} />
              {/* Tiny glint */}
              <div className="absolute" style={{
                width: "10.5%", height: "5.5%", top: "7%", left: "26%",
                borderRadius: "50%",
                background: "rgba(255,255,255,0.80)",
                filter: "blur(0.5px)",
                transform: "rotate(-32deg)",
              }} />
              {/* Secondary lower-right reflection */}
              <div className="absolute" style={{
                width: "26%", height: "12%", bottom: "13%", right: "10%",
                borderRadius: "50%",
                background: "radial-gradient(ellipse, rgba(255,255,255,0.30) 0%, transparent 100%)",
                filter: "blur(3px)",
                transform: "rotate(-32deg)",
              }} />

              {/* Tap flash — brief luminous pulse on compress */}
              {phase === "tapping" && (
                <motion.div
                  className="absolute inset-0"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 0.30, 0] }}
                  transition={{ duration: 0.38, ease: "easeOut" }}
                  style={{
                    background: "radial-gradient(circle at 48% 42%, rgba(255,255,255,0.55) 0%, transparent 62%)",
                  }}
                />
              )}
            </motion.div>

            {/* ── CARD BACKGROUND (fades in during expanding) ── */}
            <motion.div
              className="absolute inset-0"
              animate={{ opacity: isBubble ? 0 : 1 }}
              transition={{ duration: 0.55, delay: isExpanding ? 0.28 : 0 }}
              style={{
                background: "rgba(9, 5, 24, 0.96)",
                border: "1px solid rgba(175,140,255,0.16)",
                boxShadow: "0 0 90px rgba(105,65,255,0.12), 0 32px 90px rgba(0,0,0,0.72)",
              }}
            />

            {/* ── BUBBLE WAITING TEXT ── */}
            <motion.div
              className="absolute inset-0 flex flex-col items-center justify-center gap-2.5"
              animate={{ opacity: isBubble && phase === "waiting" ? 1 : 0 }}
              transition={{ duration: phase === "waiting" ? 1.0 : 0.25, delay: phase === "waiting" ? 0.5 : 0 }}
            >
              <span className="text-white/36 text-[10px] tracking-[0.36em] uppercase">tap to open</span>
              <div className="w-5 h-px" style={{ background: "rgba(255,255,255,0.13)" }} />
              <span className="text-white/20 text-[9px] tracking-widest">from the void</span>
            </motion.div>

            {/* ── THOUGHT CONTENT ── fades in after expand */}
            <motion.div
              className="absolute inset-0 flex flex-col items-center text-center overflow-hidden"
              style={{ padding: "36px 28px 28px" }}
              animate={{ opacity: isCard ? 1 : 0 }}
              transition={{ duration: 0.5, delay: isCard ? 0.1 : 0 }}
            >
              {/* Label */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: isCard ? 1 : 0 }}
                transition={{ delay: 0.25, duration: 0.65 }}
                className="text-[10px] font-medium tracking-[0.34em] text-white/26 uppercase mb-5 shrink-0"
              >
                anonymous · from the void
              </motion.p>

              {/* Mood */}
              {thought.mood && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: isCard ? 1 : 0, y: isCard ? 0 : 5 }}
                  transition={{ delay: 0.38, duration: 0.55 }}
                  className="mb-3 shrink-0"
                >
                  <MoodIcon moodId={thought.mood} showLabel />
                </motion.div>
              )}

              {/* Thought text — blur-to-sharp fade + breathing glow behind it */}
              <div className="flex-1 flex items-center justify-center relative">
                {/* Breathing reading glow — very soft, pulses slowly */}
                <motion.div
                  className="absolute pointer-events-none"
                  style={{
                    inset: "-40%",
                    borderRadius: "50%",
                    background: "radial-gradient(circle, rgba(140,100,255,0.14) 0%, transparent 66%)",
                    filter: "blur(22px)",
                  }}
                  animate={{ opacity: isCard ? [0.0, 0.9, 0.4, 0.9, 0.0] : 0 }}
                  transition={{ delay: 0.6, duration: 6.5, repeat: Infinity, ease: "easeInOut" }}
                />

                {/* Arrival glow bloom — brief flash when text completes */}
                <motion.div
                  className="absolute pointer-events-none"
                  style={{
                    inset: "-28%",
                    borderRadius: "50%",
                    background: "radial-gradient(circle, rgba(200,170,255,0.28) 0%, transparent 62%)",
                    filter: "blur(18px)",
                  }}
                  animate={{ opacity: textArrived ? [0, 0.28, 0] : 0 }}
                  transition={{ duration: 1.5, ease: "easeOut" }}
                />

                <motion.p
                  animate={{
                    opacity: isCard ? 1 : 0,
                    y: isCard ? 0 : 10,
                    filter: isCard ? "blur(0px)" : "blur(5px)",
                  }}
                  transition={{ delay: 0.48, duration: 1.15, ease: "easeOut" }}
                  onAnimationComplete={() => {
                    if (isCard && !textArrived) setTextArrived(true);
                  }}
                  className="text-2xl leading-relaxed text-white/90 text-center"
                  style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
                >
                  "{thought.content}"
                </motion.p>
              </div>

              {/* Connection whisper — fades in quietly after text arrives */}
              <motion.p
                animate={{ opacity: textArrived ? 1 : 0 }}
                transition={{ duration: 1.6, ease: "easeOut" }}
                className="text-[11px] text-white/28 tracking-wider text-center shrink-0 mt-2 mb-1"
                style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
              >
                {whisper}
              </motion.p>

              {/* Reactions — staggered in late, giving linger time */}
              <motion.div
                animate={{ opacity: isCard ? 1 : 0, y: isCard ? 0 : 8 }}
                transition={{ delay: 2.8, duration: 0.85 }}
                className="w-full shrink-0 mt-4"
              >
                <div className="flex gap-2.5 w-full">
                  <button
                    onClick={() => handleReact("felt_this")}
                    disabled={!!reacted}
                    className={cn(
                      "flex-1 flex flex-col items-center gap-1.5 py-3.5 rounded-2xl transition-all duration-400 border",
                      reacted === "felt_this"
                        ? "bg-pink-500/20 border-pink-500/35 text-pink-300"
                        : reacted
                        ? "opacity-25 bg-white/3 border-white/5 text-white/25"
                        : "bg-white/5 border-white/8 hover:bg-white/9 hover:border-white/16 text-white/52 cursor-pointer"
                    )}
                  >
                    <Heart className={cn("w-5 h-5 transition-all duration-500", reacted === "felt_this" ? "fill-pink-400 text-pink-400" : "")} />
                    <div>
                      <div className="text-[11px] font-medium tracking-wide">Felt this</div>
                      <div className="text-[10px] opacity-40 mt-0.5">{thought.feltThisCount + (reacted === "felt_this" ? 1 : 0)}</div>
                    </div>
                  </button>

                  <button
                    onClick={() => handleReact("made_think")}
                    disabled={!!reacted}
                    className={cn(
                      "flex-1 flex flex-col items-center gap-1.5 py-3.5 rounded-2xl transition-all duration-400 border",
                      reacted === "made_think"
                        ? "bg-violet-500/20 border-violet-500/35 text-violet-300"
                        : reacted
                        ? "opacity-25 bg-white/3 border-white/5 text-white/25"
                        : "bg-white/5 border-white/8 hover:bg-white/9 hover:border-white/16 text-white/52 cursor-pointer"
                    )}
                  >
                    <Brain className={cn("w-5 h-5 transition-all duration-500", reacted === "made_think" ? "text-violet-400" : "")} />
                    <div>
                      <div className="text-[11px] font-medium tracking-wide">Made me think</div>
                      <div className="text-[10px] opacity-40 mt-0.5">{thought.madeThinkCount + (reacted === "made_think" ? 1 : 0)}</div>
                    </div>
                  </button>
                </div>

                {!reacted && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: isCard ? 1 : 0 }}
                    transition={{ delay: 3.6, duration: 0.8 }}
                    className="mt-4 flex gap-2.5"
                  >
                    {onReceiveAnother && (
                      <button
                        onClick={handleReceiveAnother}
                        className="flex-1 text-[10px] tracking-widest uppercase text-white/30 hover:text-white/55 transition-colors py-1"
                      >
                        Receive another
                      </button>
                    )}
                    <button
                      onClick={handleSkip}
                      className="flex-1 text-[10px] tracking-widest uppercase text-white/18 hover:text-white/38 transition-colors py-1"
                    >
                      Let it drift
                    </button>
                  </motion.div>
                )}

                {reacted && (
                  <motion.p
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.55 }}
                    className="mt-3.5 text-[11px] tracking-wider text-white/36 text-center"
                  >
                    {reacted === "felt_this" ? "You resonated with this." : "You let it make you think."}
                  </motion.p>
                )}

                {/* Report — very subtle, appears last, expands to category picker */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: isCard ? (reportPhase === "done" ? 0.22 : 0.09) : 0 }}
                  transition={{ delay: 4.8, duration: 1.0 }}
                  className="mt-5 w-full"
                >
                  {reportPhase === "done" ? (
                    <p className="text-center text-[9px] tracking-widest uppercase text-white/40">
                      Thank you for flagging this.
                    </p>
                  ) : reportPhase === "picking" ? (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4 }}
                      className="flex gap-1.5 justify-center"
                    >
                      {(["Harmful", "Abusive", "Inappropriate"] as const).map((label) => (
                        <button
                          key={label}
                          onClick={() => handleReport(label.toLowerCase() as "harmful" | "abusive" | "inappropriate")}
                          className="text-[9px] tracking-wide uppercase text-white/35 hover:text-white/60 border border-white/8 hover:border-white/18 rounded-lg px-2.5 py-1.5 transition-colors cursor-pointer"
                        >
                          {label}
                        </button>
                      ))}
                    </motion.div>
                  ) : (
                    <button
                      onClick={() => setReportPhase("picking")}
                      className="w-full text-[9px] tracking-widest uppercase text-white/35 hover:text-white/50 transition-colors cursor-pointer"
                    >
                      Flag this thought
                    </button>
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
