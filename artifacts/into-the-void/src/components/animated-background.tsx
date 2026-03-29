import { motion } from "framer-motion";
import { useEffect, useState } from "react";

interface Bubble {
  id: number;
  size: number;
  x: number;
  y: number;
  duration: number;
  delay: number;
  driftX: number;
  driftY: number;
  opacity: number;
  blur: number;
}

export function AnimatedBackground() {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);

  useEffect(() => {
    const count = 12 + Math.floor(Math.random() * 4); // 12–15
    const newBubbles: Bubble[] = Array.from({ length: count }).map((_, i) => {
      const size = 40 + Math.random() * 160; // 40–200px
      const isLarge = size > 120;
      return {
        id: i,
        size,
        x: Math.random() * 100,
        y: Math.random() * 100,
        duration: 22 + Math.random() * 26, // 22–48s very slow
        delay: -(Math.random() * 30), // pre-stagger so they're already moving
        driftX: (Math.random() - 0.5) * (isLarge ? 14 : 24), // px drift
        driftY: (Math.random() - 0.5) * (isLarge ? 18 : 30),
        opacity: isLarge ? 0.012 + Math.random() * 0.018 : 0.02 + Math.random() * 0.03,
        blur: isLarge ? 2 + Math.random() * 4 : 1 + Math.random() * 2,
      };
    });
    setBubbles(newBubbles);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
      {/* Deep space gradient backdrop */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 20% 50%, rgba(80,40,140,0.08) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(40,60,120,0.06) 0%, transparent 55%), radial-gradient(ellipse at 60% 80%, rgba(60,20,100,0.05) 0%, transparent 50%)",
        }}
      />

      {bubbles.map((b) => (
        <motion.div
          key={b.id}
          className="absolute rounded-full"
          style={{
            width: b.size,
            height: b.size,
            left: `${b.x}%`,
            top: `${b.y}%`,
            transform: "translate(-50%, -50%)",
            background: `radial-gradient(circle at 35% 35%, rgba(200,170,255,${b.opacity * 1.8}) 0%, rgba(140,100,220,${b.opacity}) 50%, transparent 100%)`,
            border: `1px solid rgba(200,170,255,${b.opacity * 2.5})`,
            boxShadow: `0 0 ${b.size * 0.4}px rgba(160,120,255,${b.opacity * 0.8})`,
            filter: `blur(${b.blur}px)`,
          }}
          animate={{
            x: [0, b.driftX, b.driftX * 0.3, -b.driftX * 0.5, 0],
            y: [0, b.driftY * 0.4, b.driftY, b.driftY * 0.2, 0],
            opacity: [
              b.opacity,
              b.opacity * 1.6,
              b.opacity * 0.8,
              b.opacity * 1.3,
              b.opacity,
            ],
            scale: [1, 1.04, 0.97, 1.02, 1],
          }}
          transition={{
            duration: b.duration,
            repeat: Infinity,
            ease: "easeInOut",
            delay: b.delay,
          }}
        />
      ))}
    </div>
  );
}
