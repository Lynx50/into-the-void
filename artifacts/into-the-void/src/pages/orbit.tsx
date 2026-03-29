import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, Brain, MoonStar, X } from "lucide-react";
import { useMyThoughts } from "@/hooks/use-thoughts";
import { MoodIcon } from "@/components/mood-icon";
import { Thought } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

interface BubbleData {
  id: string;
  thought: Thought | null;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
  driftX: number;
  driftY: number;
  glowOpacity: number;
  hue: number;
  isPhantom: boolean;
}

const MIN_BUBBLES = 7;

function buildBubbles(thoughts: Thought[] | undefined): BubbleData[] {
  const vw = typeof window !== "undefined" ? window.innerWidth : 390;
  const vh = typeof window !== "undefined" ? window.innerHeight : 844;

  const maxReactions = thoughts && thoughts.length > 0
    ? Math.max(...thoughts.map((t) => t.feltThisCount + t.madeThinkCount), 1)
    : 1;

  const placed: { x: number; y: number; size: number }[] = [];

  function placeAt(size: number): { x: number; y: number } {
    let x = 0, y = 0, attempts = 0;
    const margin = (size / vw) * 80;
    do {
      x = margin + Math.random() * (92 - margin * 2);
      y = margin * 0.5 + Math.random() * (85 - margin);
      attempts++;
    } while (
      attempts < 50 &&
      placed.some((p) => {
        const dx = ((x - p.x) / 100) * vw;
        const dy = ((y - p.y) / 100) * vh;
        return Math.sqrt(dx * dx + dy * dy) < (size + p.size) / 2 + 24;
      })
    );
    placed.push({ x, y, size });
    return { x, y };
  }

  const result: BubbleData[] = [];

  (thoughts ?? []).forEach((thought, i) => {
    const engagement = thought.feltThisCount + thought.madeThinkCount;
    const normalized = engagement / maxReactions;
    const size = 82 + normalized * 98;
    const { x, y } = placeAt(size);
    const hue = 242 + (i * 13) % 52;
    result.push({
      id: `thought-${thought.id}`,
      thought,
      x,
      y,
      size,
      duration: 22 + Math.random() * 18,
      delay: -(Math.random() * 16),
      driftX: (Math.random() - 0.5) * 22,
      driftY: (Math.random() - 0.5) * 26,
      glowOpacity: 0.07 + normalized * 0.16,
      hue,
      isPhantom: false,
    });
  });

  const phantomCount = Math.max(0, MIN_BUBBLES - result.length);
  for (let p = 0; p < phantomCount; p++) {
    const size = 56 + Math.random() * 52;
    const { x, y } = placeAt(size);
    const hue = 238 + (p * 17) % 48;
    result.push({
      id: `phantom-${p}`,
      thought: null,
      x,
      y,
      size,
      duration: 26 + Math.random() * 20,
      delay: -(Math.random() * 20),
      driftX: (Math.random() - 0.5) * 18,
      driftY: (Math.random() - 0.5) * 22,
      glowOpacity: 0.025 + Math.random() * 0.025,
      hue,
      isPhantom: true,
    });
  }

  return result;
}

export default function Orbit() {
  const { data: thoughts, isLoading } = useMyThoughts();
  const [selected, setSelected] = useState<Thought | null>(null);
  const [tappedId, setTappedId] = useState<string | null>(null);

  const bubbles = useMemo(() => buildBubbles(thoughts), [thoughts]);

  const handleBubbleTap = (b: BubbleData) => {
    if (b.isPhantom || !b.thought) return;
    setTappedId(b.id);
    setTimeout(() => {
      setSelected(b.thought);
      setTappedId(null);
    }, 200);
  };

  const thoughtCount = (thoughts ?? []).length;

  return (
    <div className="min-h-screen relative overflow-hidden pb-24">
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
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-[10px] font-medium tracking-[0.3em] text-white/20 mt-3 uppercase"
        >
          {thoughtCount > 0 ? "Tap a memory to open it" : "Release thoughts to fill your orbit"}
        </motion.p>
      </motion.div>

      {isLoading ? (
        <div className="flex justify-center items-center py-40">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
            className="w-7 h-7 rounded-full border border-primary/30 border-t-primary/80"
          />
        </div>
      ) : (
        <div className="absolute inset-0 top-28">
          {bubbles.map((b, i) => {
            const isTapped = tappedId === b.id;
            const isInteractive = !b.isPhantom && b.thought !== null;

            return (
              <motion.div
                key={b.id}
                className={cn("absolute select-none", isInteractive ? "cursor-pointer" : "cursor-default")}
                style={{
                  left: `${b.x}%`,
                  top: `${b.y}%`,
                  width: b.size,
                  height: b.size,
                  transform: "translate(-50%, -50%)",
                  zIndex: isInteractive ? 10 : 4,
                }}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  delay: i * 0.07,
                  type: "spring",
                  stiffness: 90,
                  damping: 18,
                }}
                onClick={() => handleBubbleTap(b)}
              >
                {/* Ambient outer glow — pulses slowly */}
                <motion.div
                  className="absolute rounded-full"
                  animate={{
                    opacity: [b.glowOpacity * 0.6, b.glowOpacity * 1.6, b.glowOpacity * 0.75, b.glowOpacity * 0.6],
                  }}
                  transition={{ duration: b.duration * 0.55, repeat: Infinity, ease: "easeInOut", delay: b.delay }}
                  style={{
                    inset: "-35%",
                    background: `radial-gradient(circle, hsla(${b.hue},62%,70%,1) 0%, transparent 65%)`,
                    filter: `blur(${b.size * 0.18}px)`,
                  }}
                />

                {/* Glass sphere body — drifting */}
                <motion.div
                  className="w-full h-full rounded-full relative overflow-hidden"
                  animate={{
                    x: isTapped
                      ? [0, 12, -7, 0]
                      : [0, b.driftX * 0.35, b.driftX * 0.8, b.driftX * 0.5, 0, -b.driftX * 0.2, 0],
                    y: isTapped
                      ? [0, -10, 5, 0]
                      : [0, b.driftY * 0.5, b.driftY * 0.2, b.driftY * 0.9, b.driftY * 0.4, 0],
                    scale: isTapped ? [1, 1.2, 0.88, 1] : [1, 1.025, 0.982, 1.015, 1],
                  }}
                  transition={
                    isTapped
                      ? { duration: 0.24, ease: "easeOut" }
                      : { duration: b.duration, repeat: Infinity, ease: "easeInOut", delay: b.delay }
                  }
                  whileHover={isInteractive ? { scale: 1.11, transition: { duration: 0.4 } } : undefined}
                  style={b.isPhantom ? {
                    background: `radial-gradient(circle at 30% 26%, rgba(255,255,255,0.04) 0%, hsla(${b.hue},28%,55%,0.025) 50%, transparent 100%)`,
                    border: `1px solid rgba(255,255,255,0.07)`,
                  } : {
                    background: `radial-gradient(circle at 28% 24%, rgba(255,255,255,0.22) 0%, hsla(${b.hue},62%,80%,0.14) 24%, hsla(${b.hue},50%,52%,0.08) 58%, hsla(${b.hue + 18},42%,28%,0.05) 100%)`,
                    border: `1px solid rgba(255,255,255,${b.glowOpacity * 3.5 + 0.1})`,
                    boxShadow: `inset 0 1px 0 rgba(255,255,255,${b.glowOpacity * 2.5}), inset 0 -1px 0 rgba(0,0,0,0.08), 0 0 ${18 + (b.thought?.feltThisCount ?? 0) * 5 + (b.thought?.madeThinkCount ?? 0) * 5}px hsla(${b.hue},50%,68%,${b.glowOpacity + 0.04})`,
                    backdropFilter: "blur(6px)",
                    WebkitBackdropFilter: "blur(6px)",
                  }}
                >
                  {/* Specular highlight */}
                  {!b.isPhantom && (
                    <>
                      <div
                        className="absolute rounded-full"
                        style={{
                          width: "32%", height: "16%",
                          top: "11%", left: "15%",
                          background: `radial-gradient(ellipse, rgba(255,255,255,0.78) 0%, transparent 100%)`,
                          filter: "blur(2px)",
                          transform: "rotate(-32deg)",
                        }}
                      />
                      <div
                        className="absolute rounded-full"
                        style={{
                          width: "12%", height: "6%",
                          top: "7%", left: "26%",
                          background: "rgba(255,255,255,0.55)",
                          filter: "blur(0.8px)",
                          transform: "rotate(-32deg)",
                        }}
                      />
                    </>
                  )}
                </motion.div>

                {/* Reaction dot — real thoughts only */}
                {isInteractive && b.thought && (b.thought.feltThisCount + b.thought.madeThinkCount) > 0 && (
                  <div
                    className="absolute bottom-[10%] left-1/2 -translate-x-1/2 flex items-center gap-1"
                    style={{ opacity: 0.38 }}
                  >
                    <Heart className="text-pink-300/80" style={{ width: 7, height: 7 }} />
                    <span className="text-white/50" style={{ fontSize: 7, fontFamily: "system-ui" }}>
                      {b.thought.feltThisCount + b.thought.madeThinkCount}
                    </span>
                  </div>
                )}
              </motion.div>
            );
          })}

          {thoughtCount > 0 && (
            <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
              <p className="text-[9px] tracking-[0.32em] text-white/12 uppercase">
                {thoughtCount} {thoughtCount === 1 ? "memory" : "memories"} in your orbit
              </p>
            </div>
          )}
        </div>
      )}

      {/* Thought reveal */}
      <AnimatePresence>
        {selected && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.45 }}
              className="absolute inset-0 bg-black/78 backdrop-blur-xl"
              onClick={() => setSelected(null)}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.7, y: 28 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.86, y: 14 }}
              transition={{ type: "spring", stiffness: 140, damping: 22 }}
              className="relative w-full max-w-sm z-10 rounded-3xl p-9 flex flex-col items-center text-center"
              style={{
                background: "rgba(8,4,24,0.97)",
                border: "1px solid rgba(180,140,255,0.15)",
                boxShadow: "0 0 90px rgba(140,100,255,0.09), 0 28px 90px rgba(0,0,0,0.8)",
              }}
            >
              <button
                onClick={() => setSelected(null)}
                className="absolute top-5 right-5 p-2 rounded-full text-white/22 hover:text-white/55 hover:bg-white/5 transition-all duration-300"
              >
                <X className="w-4 h-4" />
              </button>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.05 }}
                className="text-[9px] font-medium tracking-[0.38em] text-white/20 uppercase mb-5"
                style={{ fontFamily: "system-ui" }}
              >
                your memory
              </motion.p>

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
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.14, duration: 0.6 }}
                className="text-2xl sm:text-3xl leading-relaxed text-white/85 mb-8"
                style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
              >
                "{selected.content}"
              </motion.p>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.26 }}
                className="flex gap-8 border-t border-white/[0.055] pt-6 w-full justify-center"
              >
                <div className="flex flex-col items-center gap-1.5">
                  <Heart className={cn("w-5 h-5", selected.feltThisCount > 0 ? "text-pink-400" : "text-white/16")} />
                  <span className="text-sm font-semibold text-white/55" style={{ fontFamily: "system-ui" }}>
                    {selected.feltThisCount}
                  </span>
                  <span className="text-[9px] text-white/20 tracking-wider uppercase" style={{ fontFamily: "system-ui" }}>
                    Felt this
                  </span>
                </div>
                <div className="w-px bg-white/[0.055]" />
                <div className="flex flex-col items-center gap-1.5">
                  <Brain className={cn("w-5 h-5", selected.madeThinkCount > 0 ? "text-violet-400" : "text-white/16")} />
                  <span className="text-sm font-semibold text-white/55" style={{ fontFamily: "system-ui" }}>
                    {selected.madeThinkCount}
                  </span>
                  <span className="text-[9px] text-white/20 tracking-wider uppercase" style={{ fontFamily: "system-ui" }}>
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
