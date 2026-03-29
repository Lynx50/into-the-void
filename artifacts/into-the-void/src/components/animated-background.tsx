import { motion } from "framer-motion";
import { useEffect, useState } from "react";

interface Bubble {
  id: number;
  size: number;
  x: number;
  y: number;
  duration: number;
  delay: number;
}

export function AnimatedBackground() {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);

  useEffect(() => {
    // Generate random floating bubbles
    const newBubbles = Array.from({ length: 15 }).map((_, i) => ({
      id: i,
      size: Math.random() * 100 + 50, // 50px to 150px
      x: Math.random() * 100, // 0 to 100 vw
      y: Math.random() * 100 + 100, // start below screen
      duration: Math.random() * 20 + 20, // 20s to 40s
      delay: Math.random() * -20, // stagger start times
    }));
    setBubbles(newBubbles);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
      {bubbles.map((bubble) => (
        <motion.div
          key={bubble.id}
          className="absolute rounded-full bg-white/[0.015] border border-white/[0.02] backdrop-blur-[1px]"
          style={{
            width: bubble.size,
            height: bubble.size,
            left: `${bubble.x}vw`,
          }}
          initial={{ y: "100vh", opacity: 0 }}
          animate={{ 
            y: "-20vh", 
            opacity: [0, 1, 1, 0],
            x: [`${bubble.x}vw`, `${bubble.x + (Math.random() * 10 - 5)}vw`, `${bubble.x}vw`]
          }}
          transition={{
            y: {
              duration: bubble.duration,
              repeat: Infinity,
              ease: "linear",
              delay: bubble.delay,
            },
            opacity: {
              duration: bubble.duration,
              repeat: Infinity,
              ease: "linear",
              delay: bubble.delay,
              times: [0, 0.2, 0.8, 1]
            },
            x: {
              duration: bubble.duration * 0.8,
              repeat: Infinity,
              ease: "easeInOut",
              delay: bubble.delay,
            }
          }}
        />
      ))}
    </div>
  );
}
