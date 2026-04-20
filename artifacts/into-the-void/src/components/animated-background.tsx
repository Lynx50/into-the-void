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

  // Roughly 1 in 5 loads
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
      opacity: isBigBubble ? random(0.075, 0.1) : random(0.065, 0.09),
      borderOpacity: isBigBubble ? random(0.09, 0.12) : random(0.075, 0.11),
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
            "radial-gradient(ellipse at top, rgba(38,22,88,0.22) 0%, rgba(10,8,22,0.08) 42%, rgba(4,3,10,0) 72%)",
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
              "radial-gradient(circle at 32% 28%, rgba(190,160,255,0.18) 0%, rgba(120,88,220,0.10) 42%, rgba(75,52,150,0.05) 70%, rgba(25,18,55,0.015) 100%)",
            border: `1px solid rgba(190,160,255,${bubble.borderOpacity})`,
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.03), 0 0 18px rgba(90,60,180,0.03)",
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
                "radial-gradient(ellipse, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.05) 55%, transparent 100%)",
              transform: "rotate(-28deg)",
            }}
          />
        </motion.div>
      ))}
    </div>
  );
}

export default memo(AnimatedBackground);