import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, Brain, MoonStar, X } from "lucide-react";
import { useMyThoughts } from "@/hooks/use-thoughts";
import { MoodIcon } from "@/components/mood-icon";
import { Thought } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

interface BubbleData {
  thought: Thought;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
  driftX: number;
  driftY: number;
  glowOpacity: number;
}

function useBubbles(thoughts: Thought[] | undefined): BubbleData[] {
  const [bubbles, setBubbles] = useState<BubbleData[]>([]);

  useEffect(() => {
    if (!thoughts || thoughts.length === 0) {
      setBubbles([]);
      return;
    }

    const maxReactions = Math.max(
      ...thoughts.map((t) => t.feltThisCount + t.madeThinkCount),
      1
    );

    const placed: { x: number; y: number; size: number }[] = [];

    const newBubbles = thoughts.map((thought) => {
      const engagement = thought.feltThisCount + thought.madeThinkCount;
      const normalized = engagement / maxReactions;
      // Size: 80px (no reactions) → 180px (max reactions)
      const size = 80 + normalized * 100;

      let x = 0, y = 0, attempts = 0;
      const vw = typeof window !== "undefined" ? window.innerWidth : 400;
      const vh = typeof window !== "undefined" ? window.innerHeight : 700;

      do {
        x = 10 + Math.random() * 78;
        y = 8 + Math.random() * 72;
        attempts++;
      } while (
        attempts < 40 &&
        placed.some((p) => {
          const dx = ((x - p.x) / 100) * vw;
          const dy = ((y - p.y) / 100) * vh;
          return Math.sqrt(dx * dx + dy * dy) < (size + p.size) / 2 + 20;
        })
      );

      placed.push({ x, y, size });

      return {
        thought,
        x,
        y,
        size,
        duration: 20 + Math.random() * 16,
        delay: -(Math.random() * 15),
        driftX: (Math.random() - 0.5) * 20,
        driftY: (Math.random() - 0.5) * 24,
        glowOpacity: 0.06 + normalized * 0.14,
      };
    });

    setBubbles(newBubbles);
  }, [thoughts]);

  return bubbles;
}

export default function Orbit() {
  const { data: thoughts, isLoading } = useMyThoughts();
  const bubbles = useBubbles(thoughts);
  const [selected, setSelected] = useState<Thought | null>(null);
  const [tappedId, setTappedId] = useState<number | null>(null);

  const handleBubbleTap = (thought: Thought) => {
    setTappedId(thought.id);
    // Brief tap-scale then open
    setTimeout(() => {
      setSelected(thought);
      setTappedId(null);
    }, 220);
  };

  return (
    <div className="min-h-screen relative overflow-hidden pb-24">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2, ease: "easeOut" }}
        className="relative z-10 pt-10 text-center pointer-events-none"
      >
        <h1
          className="text-4xl md:text-5xl text-white/88"
          style={{
            fontFamily: "var(--font-display)",
            fontStyle: "italic",
            textShadow: "0 0 40px rgba(180,140,255,0.22)",
          }}
        >
          My Orbit
        </h1>
        <p className="text-[10px] font-medium tracking-[0.28em] text-white/22 mt-3 uppercase">
          Tap a memory to open it
        </p>
      </motion.div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center items-center py-40">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
            className="w-7 h-7 rounded-full border border-primary/30 border-t-primary/80"
          />
        </div>
      ) : thoughts && thoughts.length > 0 ? (
        <div className="absolute inset-0 top-28">
          {bubbles.map((b, i) => {
            const engagement = b.thought.feltThisCount + b.thought.madeThinkCount;
            const isTapped = tappedId === b.thought.id;

            // Iridescence shifts slightly per bubble
            const hue = 250 + (i % 5) * 12;

            return (
              <motion.div
                key={b.thought.id}
                className="absolute cursor-pointer select-none"
                style={{
                  left: `${b.x}%`,
                  top: `${b.y}%`,
                  width: b.size,
                  height: b.size,
                  transform: "translate(-50%, -50%)",
                  zIndex: 10,
                }}
                initial={{ opacity: 0, scale: 0.2 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  delay: i * 0.1,
                  type: "spring",
                  stiffness: 100,
                  damping: 16,
                }}
                onClick={() => handleBubbleTap(b.thought)}
              >
                {/* Ambient glow */}
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: `radial-gradient(circle, hsla(${hue},60%,70%,${b.glowOpacity}) 0%, transparent 70%)`,
                    filter: "blur(12px)",
                    transform: "scale(1.5)",
                  }}
                />

                {/* Bubble */}
                <motion.div
                  className="w-full h-full rounded-full relative overflow-hidden"
                  animate={{
                    x: [0, b.driftX * 0.4, b.driftX, b.driftX * 0.6, 0],
                    y: [0, b.driftY * 0.6, b.driftY * 0.2, b.driftY, 0],
                    scale: isTapped ? [1, 1.15, 0.92] : [1, 1.02, 0.99, 1.01, 1],
                  }}
                  transition={
                    isTapped
                      ? { duration: 0.22, ease: "easeOut" }
                      : {
                          duration: b.duration,
                          repeat: Infinity,
                          ease: "easeInOut",
                          delay: b.delay,
                        }
                  }
                  whileHover={{ scale: 1.08 }}
                  style={{
                    background: `radial-gradient(circle at 32% 28%, hsla(${hue},60%,85%,0.18) 0%, hsla(${hue + 20},50%,60%,0.08) 50%, transparent 100%)`,
                    border: `1px solid hsla(${hue},50%,80%,0.22)`,
                    boxShadow: `0 0 ${16 + engagement * 5}px hsla(${hue},50%,70%,${b.glowOpacity + 0.04})`,
                  }}
                >
                  {/* Shine highlight */}
                  <div
                    className="absolute rounded-full bg-white/18"
                    style={{
                      width: "30%",
                      height: "13%",
                      top: "14%",
                      left: "20%",
                      filter: "blur(2px)",
                      transform: "rotate(-30deg)",
                    }}
                  />
                  {/* Secondary tiny shine */}
                  <div
                    className="absolute rounded-full bg-white/10"
                    style={{
                      width: "12%",
                      height: "6%",
                      top: "10%",
                      left: "28%",
                      filter: "blur(1px)",
                      transform: "rotate(-30deg)",
                    }}
                  />
                </motion.div>

                {/* Reaction dot — only if has reactions */}
                {engagement > 0 && (
                  <div
                    className="absolute bottom-[12%] left-1/2 -translate-x-1/2 flex items-center gap-1"
                    style={{ opacity: 0.4 }}
                  >
                    <Heart className="text-pink-300" style={{ width: 8, height: 8 }} />
                    <span className="text-white/60" style={{ fontSize: 8 }}>{engagement}</span>
                  </div>
                )}
              </motion.div>
            );
          })}

          {/* Subtle hint */}
          <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
            <p className="text-[9px] tracking-[0.3em] text-white/12 uppercase">
              {thoughts.length} {thoughts.length === 1 ? "memory" : "memories"} floating
            </p>
          </div>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="flex flex-col items-center justify-center py-36 text-center px-8"
        >
          <motion.div
            animate={{ scale: [1, 1.06, 1], opacity: [0.4, 0.7, 0.4] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="w-20 h-20 rounded-full mb-8 flex items-center justify-center"
            style={{
              background: "radial-gradient(circle at 35% 35%, rgba(180,140,255,0.08) 0%, transparent 100%)",
              border: "1px solid rgba(200,160,255,0.1)",
            }}
          >
            <MoonStar className="w-7 h-7 text-white/18" strokeWidth={1} />
          </motion.div>
          <h3
            className="text-2xl text-white/45 mb-2"
            style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
          >
            Your orbit is empty
          </h3>
          <p className="text-white/22 text-sm tracking-wide">
            Release a thought to see it float here.
          </p>
        </motion.div>
      )}

      {/* Thought reveal panel */}
      <AnimatePresence>
        {selected && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="absolute inset-0 bg-black/75 backdrop-blur-lg"
              onClick={() => setSelected(null)}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.75, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.88, y: 12 }}
              transition={{ type: "spring", stiffness: 160, damping: 22 }}
              className="relative w-full max-w-sm z-10 rounded-3xl p-9 flex flex-col items-center text-center"
              style={{
                background: "rgba(10,6,28,0.96)",
                border: "1px solid rgba(180,140,255,0.16)",
                boxShadow:
                  "0 0 80px rgba(140,100,255,0.1), 0 24px 80px rgba(0,0,0,0.75)",
              }}
            >
              <button
                onClick={() => setSelected(null)}
                className="absolute top-5 right-5 p-2 rounded-full text-white/25 hover:text-white/60 hover:bg-white/6 transition-all duration-300"
              >
                <X className="w-4 h-4" />
              </button>

              <p className="text-[9px] font-medium tracking-[0.35em] text-white/22 uppercase mb-5">
                your memory
              </p>

              {selected.mood && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="mb-4"
                >
                  <MoodIcon moodId={selected.mood} showLabel />
                </motion.div>
              )}

              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="text-2xl sm:text-3xl leading-relaxed text-white/85 mb-8"
                style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
              >
                "{selected.content}"
              </motion.p>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.25 }}
                className="flex gap-8 border-t border-white/[0.06] pt-6 w-full justify-center"
              >
                <div className="flex flex-col items-center gap-1.5">
                  <Heart
                    className={cn(
                      "w-5 h-5 transition-colors",
                      selected.feltThisCount > 0 ? "text-pink-400" : "text-white/18"
                    )}
                  />
                  <span className="text-sm font-medium text-white/55">
                    {selected.feltThisCount}
                  </span>
                  <span className="text-[9px] text-white/22 tracking-wider uppercase">
                    Felt this
                  </span>
                </div>
                <div className="w-px bg-white/[0.06]" />
                <div className="flex flex-col items-center gap-1.5">
                  <Brain
                    className={cn(
                      "w-5 h-5 transition-colors",
                      selected.madeThinkCount > 0 ? "text-violet-400" : "text-white/18"
                    )}
                  />
                  <span className="text-sm font-medium text-white/55">
                    {selected.madeThinkCount}
                  </span>
                  <span className="text-[9px] text-white/22 tracking-wider uppercase">
                    Made think
                  </span>
                </div>
              </motion.div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
