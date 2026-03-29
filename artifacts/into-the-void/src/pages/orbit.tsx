import { useState, useEffect, useRef } from "react";
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
  xDrift: number;
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
      // Size: 90px (no reactions) → 170px (max reactions)
      const size = 90 + normalized * 80;

      let x = 0;
      let y = 0;
      let attempts = 0;
      do {
        x = 8 + Math.random() * 78;
        y = 5 + Math.random() * 80;
        attempts++;
      } while (
        attempts < 30 &&
        placed.some((p) => {
          const dx = ((x - p.x) / 100) * window.innerWidth;
          const dy = ((y - p.y) / 100) * window.innerHeight;
          return Math.sqrt(dx * dx + dy * dy) < (size + p.size) / 2 + 10;
        })
      );

      placed.push({ x, y, size });

      return {
        thought,
        x,
        y,
        size,
        duration: 18 + Math.random() * 12,
        delay: Math.random() * -15,
        xDrift: (Math.random() - 0.5) * 3,
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

  return (
    <div className="min-h-screen relative overflow-hidden pb-24">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 pt-10 text-center pointer-events-none"
      >
        <h1
          className="text-4xl md:text-5xl text-white/90"
          style={{ fontFamily: "var(--font-display)", fontStyle: "italic", textShadow: "0 0 40px rgba(180,140,255,0.25)" }}
        >
          My Orbit
        </h1>
        <p className="text-[10px] font-medium tracking-[0.25em] text-white/25 mt-3 uppercase">
          Thoughts you've released
        </p>
      </motion.div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center items-center py-40">
          <div className="w-8 h-8 rounded-full border border-primary/40 border-t-primary animate-spin" />
        </div>
      ) : thoughts && thoughts.length > 0 ? (
        <>
          {/* Floating bubbles */}
          <div className="absolute inset-0 top-24">
            {bubbles.map((b, i) => {
              const engagement = b.thought.feltThisCount + b.thought.madeThinkCount;
              const opacity = 0.55 + Math.min(engagement / 10, 1) * 0.35;

              return (
                <motion.button
                  key={b.thought.id}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.08, type: "spring", stiffness: 120, damping: 18 }}
                  className="absolute cursor-pointer select-none focus:outline-none"
                  style={{
                    left: `${b.x}%`,
                    top: `${b.y}%`,
                    width: b.size,
                    height: b.size,
                    transform: "translate(-50%, -50%)",
                  }}
                  onClick={() => setSelected(b.thought)}
                >
                  <motion.div
                    className="w-full h-full rounded-full flex flex-col items-center justify-center gap-1 px-3"
                    animate={{
                      y: [0, -12, 0, 8, 0],
                      x: [0, b.xDrift, 0, -b.xDrift * 0.6, 0],
                    }}
                    transition={{
                      duration: b.duration,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: b.delay,
                    }}
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.95 }}
                    style={{
                      background: `radial-gradient(circle at 35% 35%, rgba(180,140,255,${opacity * 0.22}) 0%, rgba(100,60,200,${opacity * 0.1}) 60%, transparent 100%)`,
                      border: `1px solid rgba(200,160,255,${opacity * 0.3})`,
                      boxShadow: `0 0 ${20 + engagement * 4}px rgba(140,100,255,${0.08 + engagement * 0.015})`,
                    }}
                  >
                    {/* Shine */}
                    <div className="absolute top-[15%] left-[22%] w-[25%] h-[12%] rounded-full bg-white/10 blur-[2px] rotate-[-30deg]" />

                    <p
                      className="text-white/70 leading-tight text-center overflow-hidden"
                      style={{
                        fontFamily: "var(--font-display)",
                        fontStyle: "italic",
                        fontSize: Math.max(10, Math.min(14, b.size / 10)),
                        display: "-webkit-box",
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: "vertical",
                        maxHeight: "60%",
                        padding: "0 8px",
                      }}
                    >
                      {b.thought.content}
                    </p>

                    {engagement > 0 && (
                      <div className="flex items-center gap-1.5 text-white/30 mt-1">
                        <Heart className="w-2.5 h-2.5" />
                        <span style={{ fontSize: 9 }}>{engagement}</span>
                      </div>
                    )}
                  </motion.div>
                </motion.button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="absolute bottom-24 right-4 flex flex-col items-end gap-1 pointer-events-none">
            <span className="text-[9px] tracking-widest text-white/15 uppercase">Bigger = more reactions</span>
          </div>
        </>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex flex-col items-center justify-center py-36 text-center px-8"
        >
          <div className="w-20 h-20 rounded-full bg-white/3 flex items-center justify-center mb-6"
            style={{ border: "1px solid rgba(255,255,255,0.05)" }}>
            <MoonStar className="w-7 h-7 text-white/15" strokeWidth={1} />
          </div>
          <h3 className="text-2xl text-white/50 mb-2"
            style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}>
            Your orbit is empty
          </h3>
          <p className="text-white/25 text-sm tracking-wide">
            Release a thought to see it float here.
          </p>
        </motion.div>
      )}

      {/* Thought detail panel */}
      <AnimatePresence>
        {selected && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/70 backdrop-blur-md"
              onClick={() => setSelected(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.85, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 200, damping: 24 }}
              className="relative w-full max-w-sm z-10 rounded-3xl p-8 flex flex-col items-center text-center"
              style={{
                background: "rgba(12,8,30,0.95)",
                border: "1px solid rgba(180,140,255,0.18)",
                boxShadow: "0 0 60px rgba(140,100,255,0.12), 0 20px 60px rgba(0,0,0,0.7)",
              }}
            >
              <button
                onClick={() => setSelected(null)}
                className="absolute top-5 right-5 p-1.5 rounded-full text-white/30 hover:text-white/70 hover:bg-white/8 transition-all"
              >
                <X className="w-4 h-4" />
              </button>

              {selected.mood && (
                <div className="mb-4">
                  <MoodIcon moodId={selected.mood} showLabel />
                </div>
              )}

              <p
                className="text-2xl sm:text-3xl leading-relaxed text-white/85 mb-8"
                style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
              >
                "{selected.content}"
              </p>

              <div className="flex gap-6 border-t border-white/6 pt-6 w-full justify-center">
                <div className="flex flex-col items-center gap-1.5">
                  <Heart className={cn("w-5 h-5", selected.feltThisCount > 0 ? "text-pink-400" : "text-white/20")} />
                  <span className="text-sm font-medium text-white/60">{selected.feltThisCount}</span>
                  <span className="text-[10px] text-white/25 tracking-wider">Felt this</span>
                </div>
                <div className="w-px bg-white/6" />
                <div className="flex flex-col items-center gap-1.5">
                  <Brain className={cn("w-5 h-5", selected.madeThinkCount > 0 ? "text-violet-400" : "text-white/20")} />
                  <span className="text-sm font-medium text-white/60">{selected.madeThinkCount}</span>
                  <span className="text-[10px] text-white/25 tracking-wider">Made think</span>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
