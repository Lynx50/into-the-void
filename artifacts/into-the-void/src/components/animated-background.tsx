import { motion } from "framer-motion";
import { useEffect, useRef, useState, useMemo } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────

type MotionType = "rise" | "drift" | "breathe";
type Depth = 0 | 1 | 2; // 0=far, 1=mid, 2=near

interface Bubble {
  id: number;
  depth: Depth;
  size: number;
  startX: number;
  startY: number;
  duration: number;
  delay: number;
  baseOpacity: number;
  motionType: MotionType;
  wobbleX: number;
  wobbleY: number;
  hue: number;
}

// ─── Starfield ───────────────────────────────────────────────────────────────

function Starfield() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = W;
    canvas.height = H;

    // Far stars — tiny, faint
    for (let i = 0; i < 170; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H;
      const r = 0.18 + Math.random() * 0.42;
      const a = 0.05 + Math.random() * 0.20;
      const isBlue = Math.random() < 0.14;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = isBlue ? `rgba(185,208,255,${a})` : `rgba(255,255,255,${a})`;
      ctx.fill();
    }

    // Mid stars — sharper, slightly brighter
    for (let i = 0; i < 52; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H;
      const r = 0.38 + Math.random() * 0.62;
      const a = 0.18 + Math.random() * 0.34;
      const isBlue = Math.random() < 0.10;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = isBlue ? `rgba(195,215,255,${a})` : `rgba(255,255,255,${a})`;
      ctx.fill();
    }

    // Bright accent stars — with subtle violet halo
    for (let i = 0; i < 11; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H;
      const r = 0.65 + Math.random() * 0.85;
      const a = 0.52 + Math.random() * 0.38;

      // Soft halo
      const grd = ctx.createRadialGradient(x, y, 0, x, y, r * 7);
      grd.addColorStop(0, `rgba(215,205,255,${a * 0.14})`);
      grd.addColorStop(1, "rgba(180,180,255,0)");
      ctx.beginPath();
      ctx.arc(x, y, r * 7, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();

      // Core
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fill();
    }
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ opacity: 0.88 }}
    />
  );
}

// ─── Glass Sphere Shell ───────────────────────────────────────────────────────

interface GlassSphereProps {
  size: number;
  hue: number;
  baseOpacity: number;
  depth: Depth;
}

function GlassSphere({ size, hue, baseOpacity, depth }: GlassSphereProps) {
  const dm = depth === 0 ? 0.55 : depth === 1 ? 0.78 : 1.0;
  const o = baseOpacity * dm;
  const glowR = depth === 0 ? 0.028 : depth === 1 ? 0.055 : 0.10;
  const spec = Math.min(o * 6.5, 0.88);
  const sec = Math.min(o * 2.8, 0.36);
  const blurPx = Math.max(size * 0.2, 6);

  return (
    <div className="relative w-full h-full" style={{ overflow: "visible" }}>

      {/* Layer 0: Outer ambient glow */}
      <div className="absolute rounded-full" style={{
        inset: "-32%",
        background: `radial-gradient(circle, hsla(${hue},62%,68%,${glowR * 1.7}) 0%, hsla(${hue},50%,50%,${glowR * 0.4}) 42%, transparent 70%)`,
        filter: `blur(${blurPx}px)`,
        zIndex: 0,
      }} />

      {/* Layer 1: Rim illumination — glass edge catches more light */}
      <div className="absolute inset-0 rounded-full" style={{
        background: `radial-gradient(circle at 50% 50%, transparent 42%, hsla(${hue},55%,82%,${o * 1.1}) 80%, rgba(255,255,255,${o * 0.9}) 100%)`,
        zIndex: 1,
      }} />

      {/* Layer 2: Glass body — tinted translucent with subtle inner shading */}
      <div className="absolute inset-0 rounded-full" style={{
        background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,${o * 1.5}) 0%, hsla(${hue},52%,72%,${o * 0.75}) 30%, hsla(${hue},45%,48%,${o * 0.45}) 65%, hsla(${hue + 20},38%,25%,${o * 0.3}) 100%)`,
        border: `1px solid rgba(255,255,255,${Math.min(o * 4.5, 0.55)})`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,${Math.min(o * 3, 0.45)}), inset 0 -1px 0 rgba(0,0,0,${o * 1.4}), inset 0 0 ${size * 0.18}px rgba(255,255,255,${o * 0.18}), 0 0 ${size * 0.28}px hsla(${hue},50%,65%,${glowR * 1.0})`,
        zIndex: 2,
      }} />

      {/* Layer 3: Primary specular highlight — upper-left, soft bright oval */}
      <div className="absolute rounded-full" style={{
        width: "34%", height: "18%",
        top: "10%", left: "13%",
        background: `radial-gradient(ellipse, rgba(255,255,255,${spec}) 0%, rgba(255,255,255,${spec * 0.35}) 55%, transparent 100%)`,
        filter: "blur(1.5px)",
        transform: "rotate(-32deg)",
        zIndex: 3,
      }} />

      {/* Layer 4: Tiny sharp glint (crispest point of the specular) */}
      <div className="absolute rounded-full" style={{
        width: "10%", height: "5%",
        top: "7%", left: "26%",
        background: `rgba(255,255,255,${Math.min(spec * 0.9, 0.82)})`,
        filter: "blur(0.4px)",
        transform: "rotate(-32deg)",
        zIndex: 3,
      }} />

      {/* Layer 5: Secondary reflection — lower-right, very faint (opposite light bounce) */}
      <div className="absolute rounded-full" style={{
        width: "26%", height: "12%",
        bottom: "13%", right: "9%",
        background: `radial-gradient(ellipse, rgba(255,255,255,${sec}) 0%, transparent 100%)`,
        filter: "blur(3px)",
        transform: "rotate(-32deg)",
        zIndex: 3,
      }} />
    </div>
  );
}

// ─── Bubble generators ────────────────────────────────────────────────────────

function rnd(a: number, b: number) {
  return a + Math.random() * (b - a);
}

function makeBubbles(): Bubble[] {
  const bubbles: Bubble[] = [];
  let id = 0;

  // Far layer — 6–8 small, very slow
  const farCount = Math.floor(rnd(6, 9));
  for (let i = 0; i < farCount; i++) {
    const motionType: MotionType = Math.random() < 0.5 ? "rise" : "drift";
    bubbles.push({
      id: id++, depth: 0,
      size: rnd(20, 58),
      startX: rnd(2, 96),
      startY: motionType === "rise" ? rnd(105, 135) : rnd(4, 92),
      duration: rnd(55, 82),
      delay: -(Math.random() * 70),
      baseOpacity: rnd(0.04, 0.075),
      motionType,
      wobbleX: rnd(4, 12) * (Math.random() < 0.5 ? 1 : -1),
      wobbleY: rnd(6, 16) * (Math.random() < 0.5 ? 1 : -1),
      hue: rnd(238, 280),
    });
  }

  // Mid layer — 5–7 varied, moderate
  const midCount = Math.floor(rnd(5, 8));
  for (let i = 0; i < midCount; i++) {
    const motionRoll = Math.random();
    const motionType: MotionType = motionRoll < 0.4 ? "rise" : motionRoll < 0.78 ? "drift" : "breathe";
    bubbles.push({
      id: id++, depth: 1,
      size: rnd(55, 125),
      startX: rnd(3, 94),
      startY: motionType === "rise" ? rnd(108, 130) : rnd(5, 90),
      duration: rnd(32, 52),
      delay: -(Math.random() * 45),
      baseOpacity: rnd(0.055, 0.095),
      motionType,
      wobbleX: rnd(8, 18) * (Math.random() < 0.5 ? 1 : -1),
      wobbleY: rnd(10, 24) * (Math.random() < 0.5 ? 1 : -1),
      hue: rnd(240, 278),
    });
  }

  // Near layer — 2–4 larger, most visible
  const nearCount = Math.floor(rnd(2, 5));
  for (let i = 0; i < nearCount; i++) {
    const motionType: MotionType = Math.random() < 0.55 ? "drift" : "rise";
    bubbles.push({
      id: id++, depth: 2,
      size: rnd(95, 175),
      startX: rnd(5, 92),
      startY: motionType === "rise" ? rnd(110, 135) : rnd(8, 88),
      duration: rnd(24, 40),
      delay: -(Math.random() * 30),
      baseOpacity: rnd(0.085, 0.14),
      motionType,
      wobbleX: rnd(10, 22) * (Math.random() < 0.5 ? 1 : -1),
      wobbleY: rnd(14, 28) * (Math.random() < 0.5 ? 1 : -1),
      hue: rnd(242, 275),
    });
  }

  return bubbles;
}

// ─── Bubble motion wrappers ───────────────────────────────────────────────────

function RisingBubble({ b }: { b: Bubble }) {
  const diag = b.wobbleX * 2.8;
  return (
    <motion.div
      className="absolute pointer-events-none"
      style={{
        width: b.size, height: b.size,
        left: `${b.startX}%`,
        bottom: `-${b.size + 10}px`,
        transform: "translateX(-50%)",
        zIndex: b.depth,
      }}
      animate={{
        y: [`0px`, `-${130 + b.size}vh`],
        x: [0, diag * 0.3, diag, diag * 0.5, 0, -diag * 0.25, 0],
        opacity: [0, b.baseOpacity, b.baseOpacity, b.baseOpacity * 0.85, 0],
        scale: [0.75, 1, 0.97, 1.02, 0.94],
      }}
      transition={{
        y: { duration: b.duration, repeat: Infinity, ease: "linear", delay: b.delay },
        x: { duration: b.duration * 0.65, repeat: Infinity, ease: "easeInOut", delay: b.delay },
        opacity: { duration: b.duration, repeat: Infinity, ease: "linear", delay: b.delay, times: [0, 0.07, 0.72, 0.93, 1] },
        scale: { duration: b.duration * 0.55, repeat: Infinity, ease: "easeInOut", delay: b.delay },
      }}
    >
      <GlassSphere size={b.size} hue={b.hue} baseOpacity={b.baseOpacity} depth={b.depth} />
    </motion.div>
  );
}

function DriftingBubble({ b }: { b: Bubble }) {
  const path = useMemo(() => {
    const n = 5;
    const xs = Array.from({ length: n + 1 }, (_, k) =>
      k === n ? 0 : b.wobbleX * (Math.random() * 2 - 1)
    );
    const ys = Array.from({ length: n + 1 }, (_, k) =>
      k === n ? 0 : b.wobbleY * (Math.random() * 2 - 1)
    );
    return { xs, ys };
  }, [b.wobbleX, b.wobbleY]);

  return (
    <motion.div
      className="absolute pointer-events-none"
      style={{
        width: b.size, height: b.size,
        left: `${b.startX}%`,
        top: `${b.startY}%`,
        transform: "translate(-50%, -50%)",
        zIndex: b.depth,
      }}
      animate={{
        x: path.xs,
        y: path.ys,
        opacity: [b.baseOpacity * 0.65, b.baseOpacity * 1.35, b.baseOpacity * 0.85, b.baseOpacity * 1.15, b.baseOpacity * 0.7, b.baseOpacity * 0.65],
        scale: [1, 1.03, 0.975, 1.02, 0.99, 1],
      }}
      transition={{ duration: b.duration, repeat: Infinity, ease: "easeInOut", delay: b.delay }}
    >
      <GlassSphere size={b.size} hue={b.hue} baseOpacity={b.baseOpacity} depth={b.depth} />
    </motion.div>
  );
}

function BreathingBubble({ b }: { b: Bubble }) {
  return (
    <motion.div
      className="absolute pointer-events-none"
      style={{
        width: b.size, height: b.size,
        left: `${b.startX}%`,
        top: `${b.startY}%`,
        transform: "translate(-50%, -50%)",
        zIndex: b.depth,
      }}
      animate={{
        opacity: [b.baseOpacity * 0.35, b.baseOpacity * 1.25, b.baseOpacity * 0.5, b.baseOpacity * 1.1, b.baseOpacity * 0.35],
        scale: [1, 1.07, 0.965, 1.04, 1],
        x: [0, b.wobbleX * 0.12, 0],
        y: [0, b.wobbleY * 0.10, 0],
      }}
      transition={{ duration: b.duration, repeat: Infinity, ease: "easeInOut", delay: b.delay }}
    >
      <GlassSphere size={b.size} hue={b.hue} baseOpacity={b.baseOpacity} depth={b.depth} />
    </motion.div>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function AnimatedBackground() {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);

  useEffect(() => {
    setBubbles(makeBubbles());
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
      {/* Deep space gradient */}
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at 18% 52%, rgba(65,25,130,0.07) 0%, transparent 56%), radial-gradient(ellipse at 80% 20%, rgba(30,48,115,0.055) 0%, transparent 50%), radial-gradient(ellipse at 58% 84%, rgba(50,12,95,0.05) 0%, transparent 46%)",
        }}
      />

      {/* Canvas starfield */}
      <Starfield />

      {/* Depth-layered glass sphere bubbles */}
      {bubbles.map((b) => {
        if (b.motionType === "rise") return <RisingBubble key={b.id} b={b} />;
        if (b.motionType === "drift") return <DriftingBubble key={b.id} b={b} />;
        return <BreathingBubble key={b.id} b={b} />;
      })}
    </div>
  );
}
