import { motion } from "framer-motion";
import { useEffect, useState, useMemo } from "react";

type MotionType = "rise" | "drift" | "breathe";

interface Bubble {
  id: number;
  size: number;
  startX: number;
  startY: number;
  duration: number;
  delay: number;
  opacity: number;
  blur: number;
  motionType: MotionType;
  wobbleX: number;
  wobbleY: number;
  hue: number;
}

function randomBetween(a: number, b: number) {
  return a + Math.random() * (b - a);
}

function makeBubbles(): Bubble[] {
  const total = Math.floor(randomBetween(14, 20));
  const bubbles: Bubble[] = [];

  for (let i = 0; i < total; i++) {
    const roll = Math.random();
    let sizeCategory: "small" | "medium" | "large";
    let size: number;

    if (roll < 0.6) {
      sizeCategory = "small";
      size = randomBetween(28, 72);
    } else if (roll < 0.88) {
      sizeCategory = "medium";
      size = randomBetween(72, 140);
    } else {
      sizeCategory = "large";
      size = randomBetween(140, 210);
    }

    const motionRoll = Math.random();
    let motionType: MotionType;
    if (motionRoll < 0.45) motionType = "rise";
    else if (motionRoll < 0.82) motionType = "drift";
    else motionType = "breathe";

    const isFast = Math.random() < 0.3;
    let duration: number;
    if (motionType === "rise") {
      duration = isFast ? randomBetween(18, 30) : randomBetween(38, 60);
    } else if (motionType === "drift") {
      duration = isFast ? randomBetween(14, 22) : randomBetween(28, 48);
    } else {
      duration = randomBetween(6, 14);
    }

    const baseOpacity = sizeCategory === "large" ? 0.05 : sizeCategory === "medium" ? 0.07 : 0.09;
    const opacity = baseOpacity + Math.random() * 0.04;

    bubbles.push({
      id: i,
      size,
      startX: randomBetween(2, 96),
      startY: motionType === "rise" ? randomBetween(100, 130) : randomBetween(4, 94),
      duration,
      delay: -(Math.random() * duration),
      opacity,
      blur: sizeCategory === "large" ? randomBetween(3, 7) : randomBetween(0.5, 2.5),
      motionType,
      wobbleX: randomBetween(6, 20) * (Math.random() < 0.5 ? 1 : -1),
      wobbleY: randomBetween(8, 28) * (Math.random() < 0.5 ? 1 : -1),
      hue: randomBetween(235, 285),
    });
  }

  return bubbles;
}

function RisingBubble({ b }: { b: Bubble }) {
  const diagonalX = b.wobbleX * 3;
  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={{
        width: b.size,
        height: b.size,
        left: `${b.startX}%`,
        bottom: `-${b.size}px`,
        background: `radial-gradient(circle at 33% 30%, hsla(${b.hue},55%,80%,${b.opacity * 2}) 0%, hsla(${b.hue},45%,60%,${b.opacity}) 50%, transparent 100%)`,
        border: `1px solid hsla(${b.hue},50%,80%,${b.opacity * 2.5})`,
        boxShadow: `0 0 ${b.size * 0.35}px hsla(${b.hue},50%,70%,${b.opacity * 0.7})`,
        filter: `blur(${b.blur}px)`,
        transform: "translateX(-50%)",
      }}
      animate={{
        y: [0, `-${b.startY + 120}vh`],
        x: [0, diagonalX * 0.4, diagonalX, diagonalX * 0.6, 0, -diagonalX * 0.3, 0],
        opacity: [0, b.opacity, b.opacity, b.opacity, 0],
        scale: [0.7, 1, 0.97, 1.02, 0.95],
      }}
      transition={{
        y: { duration: b.duration, repeat: Infinity, ease: "linear", delay: b.delay },
        x: { duration: b.duration * 0.7, repeat: Infinity, ease: "easeInOut", delay: b.delay },
        opacity: { duration: b.duration, repeat: Infinity, ease: "linear", delay: b.delay, times: [0, 0.08, 0.7, 0.92, 1] },
        scale: { duration: b.duration * 0.5, repeat: Infinity, ease: "easeInOut", delay: b.delay },
      }}
    />
  );
}

function DriftingBubble({ b }: { b: Bubble }) {
  const path = useMemo(() => {
    const steps = 5;
    const xs = Array.from({ length: steps }, () => b.wobbleX * (Math.random() - 0.5) * 2);
    const ys = Array.from({ length: steps }, () => b.wobbleY * (Math.random() - 0.5) * 2);
    xs.push(xs[0]);
    ys.push(ys[0]);
    return { xs, ys };
  }, [b.wobbleX, b.wobbleY]);

  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={{
        width: b.size,
        height: b.size,
        left: `${b.startX}%`,
        top: `${b.startY}%`,
        transform: "translate(-50%, -50%)",
        background: `radial-gradient(circle at 35% 32%, hsla(${b.hue},55%,82%,${b.opacity * 1.9}) 0%, hsla(${b.hue},45%,58%,${b.opacity}) 55%, transparent 100%)`,
        border: `1px solid hsla(${b.hue},50%,82%,${b.opacity * 2.2})`,
        boxShadow: `0 0 ${b.size * 0.38}px hsla(${b.hue},50%,70%,${b.opacity * 0.6})`,
        filter: `blur(${b.blur}px)`,
      }}
      animate={{
        x: path.xs,
        y: path.ys,
        opacity: [b.opacity * 0.7, b.opacity * 1.4, b.opacity, b.opacity * 1.2, b.opacity * 0.8, b.opacity * 0.7],
        scale: [1, 1.03, 0.98, 1.02, 0.99, 1],
      }}
      transition={{
        duration: b.duration,
        repeat: Infinity,
        ease: "easeInOut",
        delay: b.delay,
      }}
    />
  );
}

function BreathingBubble({ b }: { b: Bubble }) {
  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={{
        width: b.size,
        height: b.size,
        left: `${b.startX}%`,
        top: `${b.startY}%`,
        transform: "translate(-50%, -50%)",
        background: `radial-gradient(circle at 38% 35%, hsla(${b.hue},45%,78%,${b.opacity * 1.5}) 0%, hsla(${b.hue},35%,55%,${b.opacity * 0.6}) 60%, transparent 100%)`,
        border: `1px solid hsla(${b.hue},40%,78%,${b.opacity * 1.8})`,
        filter: `blur(${b.blur + 2}px)`,
      }}
      animate={{
        opacity: [b.opacity * 0.4, b.opacity * 1.3, b.opacity * 0.5, b.opacity * 1.1, b.opacity * 0.4],
        scale: [1, 1.06, 0.97, 1.04, 1],
        x: [0, b.wobbleX * 0.15, 0],
        y: [0, b.wobbleY * 0.12, 0],
      }}
      transition={{
        duration: b.duration,
        repeat: Infinity,
        ease: "easeInOut",
        delay: b.delay,
      }}
    />
  );
}

export function AnimatedBackground() {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);

  useEffect(() => {
    setBubbles(makeBubbles());
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 15% 55%, rgba(75,30,140,0.07) 0%, transparent 58%), radial-gradient(ellipse at 82% 18%, rgba(35,55,120,0.06) 0%, transparent 52%), radial-gradient(ellipse at 55% 82%, rgba(55,15,100,0.05) 0%, transparent 48%)",
        }}
      />

      {bubbles.map((b) => {
        if (b.motionType === "rise") return <RisingBubble key={b.id} b={b} />;
        if (b.motionType === "drift") return <DriftingBubble key={b.id} b={b} />;
        return <BreathingBubble key={b.id} b={b} />;
      })}
    </div>
  );
}
