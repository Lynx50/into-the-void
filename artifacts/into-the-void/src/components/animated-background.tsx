import { memo, useMemo } from "react";
import { motion } from "framer-motion";

type BubbleConfig = {
  size: number;
  top: string;
  left: string;
  duration: number;
  delay: number;
  driftX: number;
  driftY: number;
  opacity: number;
  borderOpacity: number;
};

function random(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function createBubbles(): BubbleConfig[] {
  const bubbleCount = 6;
  const bigBubbleIndex = Math.random() < 0.2
    ? Math.floor(Math.random() * bubbleCount)
    : -1;

  return Array.from({ length: bubbleCount }).map((_, index) => {
    const isBigBubble = index === bigBubbleIndex;

    return {
      size: isBigBubble ? random(300, 380) : random(140, 320),
      top: `${random(0, 80)}%`,
      left: `${random(-10, 85)}%`,
      duration: isBigBubble ? random(22, 30) : random(18, 26),
      delay: random(0, 3),
      driftX: isBigBubble ? random(-12, 12) : random(-16, 16),
      driftY: isBigBubble ? random(-12, 12) : random(-16, 16),
      opacity: isBigBubble ? random(0.085, 0.11) : random(0.075, 0.1),
      borderOpacity: isBigBubble ? random(0.11, 0.15) : random(0.09, 0.13),
    };
  });
}

function AnimatedBackground() {
  const bubbles = useMemo(() => createBubbles(), []);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 15%, #1c2145 0%, #111531 45%, #060812 100%)",
        }}
      />

      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 34%, rgba(145,105,235,0.25) 0%, rgba(110,86,210,0.15) 30%, rgba(0,0,0,0) 64%)",
        }}
      />

      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 23%, rgba(245,236,255,0.06) 0%, rgba(180,140,255,0.05) 14%, rgba(0,0,0,0) 42%)",
        }}
      />

      {bubbles.map((bubble, index) => (
        <motion.div
          key={index}
          className="absolute rounded-full"
          initial={{ x: 0, y: 0 }}
          animate={{
            x: [0, bubble.driftX, 0, -bubble.driftX / 2, 0],
            y: [0, bubble.driftY, 0, -bubble.driftY / 2, 0],
          }}
          transition={{
            duration: bubble.duration,
            repeat: Infinity,
            repeatType: "mirror",
            ease: "easeInOut",
            delay: bubble.delay,
          }}
          style={{
            top: bubble.top,
            left: bubble.left,
            width: bubble.size,
            height: bubble.size,
            opacity: bubble.opacity,
            background:
              "radial-gradient(circle at 32% 28%, rgba(200,175,255,0.20) 0%, rgba(128,96,228,0.12) 42%, rgba(78,55,155,0.06) 70%, rgba(25,18,55,0.02) 100%)",
            border: `1px solid rgba(190,160,255,${bubble.borderOpacity})`,
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.04), 0 0 22px rgba(95,70,185,0.05)",
            transform: "translateZ(0)",
            willChange: "transform",
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
          }}
        >
          <div
            className="absolute"
            style={{
              width: "30%",
              height: "13%",
              top: "11%",
              left: "16%",
              borderRadius: "50%",
              background:
                "radial-gradient(ellipse, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.06) 55%, transparent 100%)",
              transform: "rotate(-28deg)",
            }}
          />
        </motion.div>
      ))}
    </div>
  );
}

export default memo(AnimatedBackground);
