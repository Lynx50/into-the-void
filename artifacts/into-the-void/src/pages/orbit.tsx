import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  type OrbitThoughtSnapshot,
  getImmediateLocalOrbitThoughts,
  useMyThoughts,
  useUser,
} from "@/hooks/use-thoughts";
import { triggerHaptic } from "@/lib/haptics";

const MAX_VISIBLE_ORBIT_THOUGHTS = 32;
const PRIORITY_RECENT_THOUGHTS = 20;
const ORBIT_FALLBACK_TIMEOUT_MS = 1500;

type OrbitThought = {
  id: number | string;
  content?: string;
  mood?: string | null;
  feltThisCount?: number;
  madeThinkCount?: number;
  size: number;
  top: number;
  left: number;
  opacity: number;
  blur: number;
  zIndex: number;
  brightness: number;
  driftX: number;
  driftY: number;
  driftDuration: number;
  glow: string;
  border: string;
  highlight: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hashSeed(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createRandom(seed: number): () => number {
  let state = seed || 1;

  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getReactionBoost(feltThisCount = 0, madeThinkCount = 0): number {
  const totalReactions = feltThisCount + madeThinkCount;
  return Math.min(totalReactions, 6) * 4;
}

function mergeOrbitThoughts(
  serverThoughts: OrbitThoughtSnapshot[],
  localThoughts: OrbitThoughtSnapshot[],
): OrbitThoughtSnapshot[] {
  const merged = [...serverThoughts];

  for (const localThought of localThoughts) {
    const exists = merged.some((serverThought) => {
      return (
        String(serverThought.id) === String(localThought.id) ||
        ((serverThought.content ?? "").trim() === (localThought.content ?? "").trim() &&
          (serverThought.mood ?? null) === (localThought.mood ?? null))
      );
    });

    if (!exists) {
      merged.push(localThought);
    }
  }

  return merged;
}

function selectVisibleThoughts(thoughts: any[]): any[] {
  if (thoughts.length <= MAX_VISIBLE_ORBIT_THOUGHTS) {
    return thoughts;
  }

  const recentThoughts = thoughts.slice(
    0,
    Math.min(PRIORITY_RECENT_THOUGHTS, MAX_VISIBLE_ORBIT_THOUGHTS),
  );
  const remainingSlots = MAX_VISIBLE_ORBIT_THOUGHTS - recentThoughts.length;
  const olderThoughts = thoughts.slice(recentThoughts.length);

  if (remainingSlots <= 0 || olderThoughts.length === 0) {
    return recentThoughts;
  }

  const sampledOlderThoughts = Array.from({ length: remainingSlots }, (_, index) => {
    const position = Math.floor(((index + 0.4) / remainingSlots) * olderThoughts.length);
    return olderThoughts[Math.min(position, olderThoughts.length - 1)];
  }).filter(Boolean);

  return [...recentThoughts, ...sampledOlderThoughts];
}

function buildPositionedThoughts(thoughts: any[]): OrbitThought[] {
  const visibleThoughts = selectVisibleThoughts(thoughts);

  return visibleThoughts.map((thought: any, index: number) => {
    const feltThisCount =
      typeof thought?.feltThisCount === "number" ? thought.feltThisCount : 0;
    const madeThinkCount =
      typeof thought?.madeThinkCount === "number" ? thought.madeThinkCount : 0;
    const totalReactions = feltThisCount + madeThinkCount;
    const id = thought?.id ?? `thought-${index}`;
    const recencyRatio =
      visibleThoughts.length <= 1 ? 0 : index / (visibleThoughts.length - 1);
    const random = createRandom(hashSeed(String(id)));
    const angle = random() * Math.PI * 2;
    const baseRadius = 10 + random() * 24 + recencyRatio * 20;
    const jitterX = (random() - 0.5) * 18;
    const jitterY = (random() - 0.5) * 20;
    const centerX = 50 + (random() - 0.5) * 8;
    const centerY = 48 + (random() - 0.5) * 10;
    const left = clamp(centerX + Math.cos(angle) * baseRadius + jitterX, 10, 90);
    const top = clamp(centerY + Math.sin(angle) * (baseRadius * 0.9) + jitterY, 10, 88);
    const size =
      clamp(146 - recencyRatio * 74 + getReactionBoost(feltThisCount, madeThinkCount), 60, 164);
    const opacity = clamp(0.97 - recencyRatio * 0.5, 0.34, 0.97);
    const blur = clamp(recencyRatio * 1.9, 0, 1.9);
    const brightness = clamp(1.08 - recencyRatio * 0.26, 0.72, 1.08);
    const zIndex = visibleThoughts.length - index;
    const driftX = (random() - 0.5) * 14;
    const driftY = (random() - 0.5) * 16;
    const driftDuration = 8 + random() * 8 + recencyRatio * 3;

    return {
      id,
      content:
        typeof thought?.content === "string" && thought.content.trim().length > 0
          ? thought.content
          : "Untitled thought",
      mood: thought?.mood ?? null,
      feltThisCount,
      madeThinkCount,
      size,
      top,
      left,
      opacity,
      blur,
      zIndex,
      brightness,
      driftX,
      driftY,
      driftDuration,
      glow:
        totalReactions > 0
          ? "0 0 34px rgba(195,160,255,0.18), inset 0 0 18px rgba(220,180,255,0.07)"
          : recencyRatio < 0.35
            ? "0 0 26px rgba(155,120,255,0.16), inset 0 0 14px rgba(200,160,255,0.05)"
            : "0 0 18px rgba(120,90,220,0.08), inset 0 0 12px rgba(160,130,220,0.03)",
      border:
        totalReactions > 0
          ? "1px solid rgba(230,200,255,0.24)"
          : recencyRatio < 0.35
            ? "1px solid rgba(210,180,255,0.20)"
            : "1px solid rgba(170,145,230,0.12)",
      highlight:
        totalReactions > 0
          ? "radial-gradient(ellipse, rgba(255,255,255,0.68) 0%, rgba(255,255,255,0.18) 55%, transparent 100%)"
          : recencyRatio < 0.35
            ? "radial-gradient(ellipse, rgba(255,255,255,0.62) 0%, rgba(255,255,255,0.16) 55%, transparent 100%)"
            : "radial-gradient(ellipse, rgba(255,255,255,0.46) 0%, rgba(255,255,255,0.11) 55%, transparent 100%)",
    };
  });
}

export default function Orbit() {
  const [selectedThought, setSelectedThought] = useState<OrbitThought | null>(null);
  const [newlyArrivedIds, setNewlyArrivedIds] = useState<(number | string)[]>([]);
  const [localOrbitThoughts, setLocalOrbitThoughts] = useState<OrbitThoughtSnapshot[]>(
    () => getImmediateLocalOrbitThoughts(),
  );
  const [showLoadingMessage, setShowLoadingMessage] = useState(
    () => getImmediateLocalOrbitThoughts().length === 0,
  );
  const previousIdsRef = useRef<(number | string)[]>([]);
  const { isLoading: isSessionLoading, sessionError, refreshSession } = useUser();
  const { data, isError, isFetched } = useMyThoughts();

  useEffect(() => {
    const nextLocalThoughts = getImmediateLocalOrbitThoughts();
    setLocalOrbitThoughts(nextLocalThoughts);
    console.log("Orbit local count:", nextLocalThoughts.length);
    if (nextLocalThoughts.length > 0) {
      console.log("Orbit rendered from local");
    }
  }, []);

  const serverThoughts = useMemo(
    () => (Array.isArray(data) ? (data as OrbitThoughtSnapshot[]) : []),
    [data],
  );
  const safeThoughtsArray = useMemo(
    () => mergeOrbitThoughts(serverThoughts, localOrbitThoughts),
    [localOrbitThoughts, serverThoughts],
  );
  const hasVisibleThoughts = safeThoughtsArray.length > 0;
  const serverSettled = isFetched || isError;
  const shouldShowLoading = !hasVisibleThoughts && showLoadingMessage && !serverSettled;

  const stableThoughts = useMemo(
    () => buildPositionedThoughts(safeThoughtsArray),
    [safeThoughtsArray],
  );

  useEffect(() => {
    console.log("Orbit server count:", serverThoughts.length);
  }, [serverThoughts.length]);

  useEffect(() => {
    if (hasVisibleThoughts) {
      setShowLoadingMessage(false);
      return;
    }

    if (serverSettled) {
      setShowLoadingMessage(false);
      return;
    }

    const timeout = setTimeout(() => {
      setShowLoadingMessage(false);
      console.log("Orbit fallback triggered");
    }, ORBIT_FALLBACK_TIMEOUT_MS);

    return () => {
      clearTimeout(timeout);
    };
  }, [hasVisibleThoughts, serverSettled]);

  useEffect(() => {
    const nextIds = stableThoughts.map((thought) => thought.id);
    const previousIds = previousIdsRef.current;

    const addedIds = nextIds.filter((id) => !previousIds.includes(id));
    let timeout: ReturnType<typeof setTimeout> | undefined;

    if (previousIds.length > 0 && addedIds.length > 0) {
      setNewlyArrivedIds(addedIds);
      void triggerHaptic("light");

      timeout = setTimeout(() => {
        setNewlyArrivedIds([]);
      }, 1100);
    } else {
      setNewlyArrivedIds([]);
    }

    previousIdsRef.current = nextIds;

    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [stableThoughts]);

  const handleOpenThought = (thought: OrbitThought) => {
    void triggerHaptic("light");
    setSelectedThought(thought);
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 pb-36 overflow-hidden relative">
      <div className="pt-8 text-center">
        <h1
          className="text-4xl md:text-5xl text-white/88"
          style={{
            fontFamily: "var(--font-display)",
            fontStyle: "italic",
            textShadow:
              "0 0 50px rgba(180,140,255,0.28), 0 0 100px rgba(140,100,220,0.12)",
          }}
        >
          My Orbit
        </h1>

        <p
          className="text-xs tracking-[0.22em] text-white/28 mt-3"
          style={{
            fontFamily: "var(--font-display)",
            fontStyle: "italic",
          }}
        >
          Your released thoughts drift here over time.
        </p>

        {sessionError && (
          <div className="mt-4 flex flex-col items-center gap-2">
            <p
              className="text-[11px] tracking-wide text-amber-300/80"
              style={{
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
              }}
            >
              {sessionError}
            </p>
            <button
              onClick={() => void refreshSession()}
              className="px-4 py-2 rounded-full text-[10px] tracking-[0.22em] uppercase text-white/70 border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
            >
              Retry connection
            </button>
          </div>
        )}
      </div>

      <div className="relative h-[72vh] mt-6 overflow-hidden">
        {shouldShowLoading && (
          <p
            className="text-center text-white/30 mt-16"
            style={{
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
            }}
          >
            Loading your orbit...
          </p>
        )}

        {!hasVisibleThoughts && !shouldShowLoading && (
          <div className="text-center text-white/30 mt-20 px-6">
            <p
              className="text-lg"
              style={{
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
              }}
            >
              No thoughts in orbit yet.
            </p>
            <p className="text-sm text-white/20 mt-3">
              {isError
                ? "Orbit will refresh quietly when the connection returns."
                : "Release your first thought into the void and it will appear here."}
            </p>
          </div>
        )}

        {hasVisibleThoughts &&
          stableThoughts.map((thought) => {
            const totalReactions =
              (thought.feltThisCount ?? 0) + (thought.madeThinkCount ?? 0);
            const isNew = newlyArrivedIds.includes(thought.id);

            return (
              <motion.div
                key={thought.id}
                className="absolute"
                style={{
                  top: `${thought.top}%`,
                  left: `${thought.left}%`,
                  width: `${thought.size}px`,
                  height: `${thought.size}px`,
                  zIndex: thought.zIndex,
                  opacity: thought.opacity,
                  filter: `blur(${thought.blur}px) brightness(${thought.brightness})`,
                  transform: "translate(-50%, -50%)",
                }}
                initial={isNew ? { opacity: 0, scale: 0.78 } : false}
                animate={{
                  opacity: thought.opacity,
                  scale: isNew ? [0.78, 1.06, 1] : 1,
                  x: [0, thought.driftX, 0],
                  y: [0, thought.driftY, 0],
                }}
                transition={{
                  opacity: { duration: 0.6 },
                  scale: { duration: isNew ? 0.9 : 0.3, ease: "easeOut" },
                  x: {
                    duration: thought.driftDuration,
                    repeat: Infinity,
                    ease: "easeInOut",
                  },
                  y: {
                    duration: thought.driftDuration + 1.8,
                    repeat: Infinity,
                    ease: "easeInOut",
                  },
                }}
              >
                <button
                  onClick={() => handleOpenThought(thought)}
                  className="w-full h-full rounded-full cursor-pointer active:scale-95 transition-transform duration-200"
                  style={{
                    background:
                      totalReactions > 0
                        ? "radial-gradient(circle at 33% 30%, rgba(235,205,255,0.18) 0%, rgba(145,105,235,0.11) 52%, rgba(255,255,255,0.03) 100%)"
                        : thought.zIndex > stableThoughts.length * 0.65
                          ? "radial-gradient(circle at 33% 30%, rgba(210,180,255,0.16) 0%, rgba(130,90,220,0.08) 55%, rgba(255,255,255,0.03) 100%)"
                          : "radial-gradient(circle at 33% 30%, rgba(150,120,220,0.10) 0%, rgba(75,50,135,0.06) 55%, rgba(255,255,255,0.02) 100%)",
                    border: thought.border,
                    boxShadow: thought.glow,
                  }}
                >
                  <div className="absolute inset-0 rounded-full pointer-events-none">
                    <div
                      className="absolute"
                      style={{
                        width: "34%",
                        height: "16%",
                        top: "12%",
                        left: "15%",
                        borderRadius: "50%",
                        background: thought.highlight,
                        transform: "rotate(-30deg)",
                      }}
                    />
                    <div
                      className="absolute"
                      style={{
                        width: "10%",
                        height: "5%",
                        top: "10%",
                        left: "28%",
                        borderRadius: "50%",
                        background:
                          totalReactions > 0
                            ? "rgba(255,255,255,0.58)"
                            : "rgba(255,255,255,0.44)",
                        transform: "rotate(-30deg)",
                      }}
                    />
                  </div>
                </button>
              </motion.div>
            );
          })}
      </div>

      {selectedThought && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-6"
          onClick={() => setSelectedThought(null)}
        >
          <div
            className="w-full max-w-sm rounded-3xl p-6 sm:p-8 text-center"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "rgba(255,255,255,0.035)",
              border: "1px solid rgba(255,255,255,0.065)",
              backdropFilter: "blur(16px)",
            }}
          >
            <h2
              className="text-2xl text-white/88 mb-4"
              style={{
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
              }}
            >
              Thought
            </h2>

            {selectedThought.mood && (
              <p className="text-sm text-white/40 mb-4 uppercase tracking-[0.2em]">
                {selectedThought.mood}
              </p>
            )}

            <p
              className="text-lg text-white/75 leading-relaxed"
              style={{
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
              }}
            >
              {selectedThought.content ?? "Untitled thought"}
            </p>

            <div className="mt-6 text-sm text-white/35">
              Felt this: {selectedThought.feltThisCount ?? 0} · Made think:{" "}
              {selectedThought.madeThinkCount ?? 0}
            </div>

            <button
              className="mt-6 px-5 py-2.5 rounded-full text-sm tracking-wide text-white/75 transition-all duration-300 hover:bg-white/10"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
              onClick={() => setSelectedThought(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
