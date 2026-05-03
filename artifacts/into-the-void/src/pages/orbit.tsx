import { useEffect, useMemo, useState } from "react";
import {
  getOrbitLocalDebugCounts,
  type OrbitThoughtSnapshot,
  getImmediateLocalOrbitThoughts,
  ORBIT_LOCAL_THOUGHTS_UPDATED_EVENT,
  useMyThoughts,
  useUser,
} from "@/hooks/use-thoughts";
import { triggerHaptic } from "@/lib/haptics";

const MAX_VISIBLE_ORBIT_THOUGHTS = 38;
const PRIORITY_RECENT_THOUGHTS = 22;
const ORBIT_FALLBACK_TIMEOUT_MS = 1500;
const ORBIT_DEBUG = import.meta.env.DEV;
const ORBIT_LAYOUT_MAP_KEY = "void_orbit_layout_map";

type PersistedBubbleLayout = {
  top: number;
  left: number;
  size: number;
  zIndex: number;
  opacity: number;
  edgeOpacity: number;
  blur: number;
  brightness: number;
  depth: number;
  auraOpacity: number;
};

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
  edgeOpacity: number;
  blur: number;
  zIndex: number;
  brightness: number;
  depth: number;
  auraOpacity: number;
  pulseDuration: number;
  pulseScale: number;
  driftX: number;
  driftY: number;
  driftRotate: number;
  driftDuration: number;
  glow: string;
  border: string;
  highlight: string;
};

type StableBubbleLayoutResult = {
  thoughts: OrbitThought[];
  layoutMap: Record<string, PersistedBubbleLayout>;
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

function getThoughtTime(thought: OrbitThoughtSnapshot): number {
  if (
    typeof (thought as { localCreatedAt?: number }).localCreatedAt === "number" &&
    Number.isFinite((thought as { localCreatedAt?: number }).localCreatedAt)
  ) {
    return (thought as { localCreatedAt?: number }).localCreatedAt as number;
  }

  if (typeof (thought as { createdAt?: string | null }).createdAt === "string") {
    const parsed = new Date(
      (thought as { createdAt?: string | null }).createdAt as string,
    ).getTime();
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  const numericId = Number(thought.id);
  return Number.isFinite(numericId) ? numericId : hashSeed(String(thought.id));
}

function getStableThoughtKey(thought: OrbitThoughtSnapshot): string {
  const numericId = Number(thought.id);
  if (Number.isInteger(numericId) && numericId > 0) {
    return `id:${numericId}`;
  }

  const timestamp = getThoughtTime(thought);
  const content = (thought.content ?? "").trim();
  const mood = thought.mood ?? "";
  return `content:${hashSeed(`${content}|${mood}|${timestamp}`)}`;
}

function sortOrbitThoughts(thoughts: OrbitThoughtSnapshot[]): OrbitThoughtSnapshot[] {
  return [...thoughts].sort((a, b) => {
    const timeDiff = getThoughtTime(b) - getThoughtTime(a);
    if (timeDiff !== 0) {
      return timeDiff;
    }

    return String(b.id).localeCompare(String(a.id));
  });
}

function buildThoughtIdentityKey(thoughts: OrbitThoughtSnapshot[]): string {
  return thoughts
    .map((thought) => getStableThoughtKey(thought))
    .join("|");
}

function readOrbitLayoutMap(): Record<string, PersistedBubbleLayout> {
  try {
    const raw = localStorage.getItem(ORBIT_LAYOUT_MAP_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeOrbitLayoutMap(layoutMap: Record<string, PersistedBubbleLayout>): void {
  try {
    localStorage.setItem(ORBIT_LAYOUT_MAP_KEY, JSON.stringify(layoutMap));
  } catch {
    // Layout persistence is best effort only.
  }
}

function selectVisibleThoughts(thoughts: OrbitThoughtSnapshot[]): OrbitThoughtSnapshot[] {
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
    const position = Math.floor(
      ((index + 0.45) / remainingSlots) * olderThoughts.length,
    );
    return olderThoughts[Math.min(position, olderThoughts.length - 1)];
  }).filter(Boolean) as OrbitThoughtSnapshot[];

  return [...recentThoughts, ...sampledOlderThoughts];
}

const LOW_COUNT_LAYOUTS: Record<number, Array<{ top: number; left: number }>> = {
  1: [{ top: 48, left: 50 }],
  2: [
    { top: 44, left: 34 },
    { top: 56, left: 66 },
  ],
  3: [
    { top: 41, left: 50 },
    { top: 58, left: 33 },
    { top: 58, left: 67 },
  ],
  4: [
    { top: 38, left: 34 },
    { top: 39, left: 66 },
    { top: 61, left: 36 },
    { top: 60, left: 68 },
  ],
  5: [
    { top: 36, left: 50 },
    { top: 47, left: 30 },
    { top: 48, left: 70 },
    { top: 65, left: 38 },
    { top: 64, left: 63 },
  ],
  6: [
    { top: 35, left: 39 },
    { top: 35, left: 61 },
    { top: 49, left: 28 },
    { top: 49, left: 72 },
    { top: 65, left: 40 },
    { top: 65, left: 60 },
  ],
};

function getStableBubbleLayout(thoughts: OrbitThoughtSnapshot[]): StableBubbleLayoutResult {
  const visibleThoughts = selectVisibleThoughts(thoughts);
  const densityFactor = clamp(
    visibleThoughts.length / MAX_VISIBLE_ORBIT_THOUGHTS,
    0,
    1,
  );
  const existingLayoutMap = readOrbitLayoutMap();
  const nextLayoutMap: Record<string, PersistedBubbleLayout> = {
    ...existingLayoutMap,
  };

  const positionedThoughts = visibleThoughts.map((thought, index) => {
    const feltThisCount =
      typeof thought?.feltThisCount === "number" ? thought.feltThisCount : 0;
    const madeThinkCount =
      typeof thought?.madeThinkCount === "number" ? thought.madeThinkCount : 0;
    const totalReactions = feltThisCount + madeThinkCount;
    const id = getStableThoughtKey(thought);
    const recencyRatio =
      visibleThoughts.length <= 1 ? 0 : index / (visibleThoughts.length - 1);
    const depth = 1 - recencyRatio;
    const random = createRandom(hashSeed(String(id)));
    const lowCountLayout =
      visibleThoughts.length <= 6
        ? LOW_COUNT_LAYOUTS[visibleThoughts.length]?.[index]
        : null;
    const angle = random() * Math.PI * 2;
    const baseRadius =
      4 +
      random() * 14 +
      recencyRatio * (28 + densityFactor * 10) +
      (1 - depth) * 6;
    const crowdingFactor = 8 + densityFactor * 10;
    const jitterX = (random() - 0.5) * (14 + crowdingFactor);
    const jitterY = (random() - 0.5) * (16 + crowdingFactor);
    const centerX = 50 + (random() - 0.5) * 10;
    const centerY = 49 + (random() - 0.5) * 12;
    const left = clamp(
      lowCountLayout
        ? lowCountLayout.left + (random() - 0.5) * 2.5
        : centerX + Math.cos(angle) * baseRadius + jitterX,
      12,
      88,
    );
    const top = clamp(
      lowCountLayout
        ? lowCountLayout.top + (random() - 0.5) * 2.2
        : centerY + Math.sin(angle) * (baseRadius * 0.9) + jitterY,
      12,
      86,
    );
    const size = clamp(
      62 + depth * 92 + getReactionBoost(feltThisCount, madeThinkCount) + random() * 16,
      60,
      176,
    );
    const edgeDistanceX = Math.abs(left - 50) / 40;
    const edgeDistanceY = Math.abs(top - 50) / 38;
    const edgeFade = clamp(Math.max(edgeDistanceX, edgeDistanceY), 0, 1);
    const edgeOpacity = clamp(1 - edgeFade * 0.35, 0.62, 1);
    const opacity = clamp((0.68 + depth * 0.28) * edgeOpacity, 0.65, 1);
    const blur = clamp((1 - depth) * 1.8, 0, 2.1);
    const brightness = clamp(0.82 + depth * 0.28, 0.82, 1.12);
    const zIndex = visibleThoughts.length - index;
    const auraOpacity = clamp(
      0.12 + depth * 0.16 + totalReactions * 0.012,
      0.12,
      0.32,
    );

    const persistedLayout = existingLayoutMap[id];
    const computedLayout: PersistedBubbleLayout = persistedLayout ?? {
      top,
      left,
      size,
      zIndex: visibleThoughts.length - index,
      opacity,
      edgeOpacity,
      blur,
      brightness,
      depth,
      auraOpacity,
    };

    nextLayoutMap[id] = computedLayout;

    return {
      id,
      content:
        typeof thought?.content === "string" && thought.content.trim().length > 0
          ? thought.content
          : "Untitled thought",
      mood: thought?.mood ?? null,
      feltThisCount,
      madeThinkCount,
      size: computedLayout.size,
      top: computedLayout.top,
      left: computedLayout.left,
      opacity: computedLayout.opacity,
      edgeOpacity: computedLayout.edgeOpacity,
      blur: computedLayout.blur,
      zIndex: computedLayout.zIndex,
      brightness: computedLayout.brightness,
      depth: computedLayout.depth,
      auraOpacity: computedLayout.auraOpacity,
      pulseDuration: 0,
      pulseScale: 1,
      driftX: 0,
      driftY: 0,
      driftRotate: 0,
      driftDuration: 0,
      glow:
        totalReactions > 0
          ? "0 0 30px rgba(170,110,255,0.28), 0 0 70px rgba(120,80,220,0.16), inset 0 0 28px rgba(255,255,255,0.10), inset -6px -10px 20px rgba(0,0,0,0.25)"
          : depth > 0.55
            ? "0 0 30px rgba(170,110,255,0.28), 0 0 70px rgba(120,80,220,0.16), inset 0 0 28px rgba(255,255,255,0.10), inset -6px -10px 20px rgba(0,0,0,0.25)"
            : "0 0 22px rgba(140,96,220,0.18), 0 0 48px rgba(92,62,170,0.10), inset 0 0 22px rgba(255,255,255,0.08), inset -6px -10px 18px rgba(0,0,0,0.20)",
      border:
        totalReactions > 0
          ? "1px solid rgba(220,200,255,0.28)"
          : depth > 0.55
            ? "1px solid rgba(220,200,255,0.28)"
            : "1px solid rgba(200,180,240,0.20)",
      highlight:
        totalReactions > 0
          ? "radial-gradient(ellipse, rgba(255,255,255,0.74) 0%, rgba(255,255,255,0.22) 52%, transparent 100%)"
          : depth > 0.55
            ? "radial-gradient(ellipse, rgba(255,255,255,0.70) 0%, rgba(255,255,255,0.20) 52%, transparent 100%)"
            : "radial-gradient(ellipse, rgba(255,255,255,0.60) 0%, rgba(255,255,255,0.14) 52%, transparent 100%)",
    };
  });

  return {
    thoughts: positionedThoughts,
    layoutMap: nextLayoutMap,
  };
}

export default function Orbit() {
  const [selectedThought, setSelectedThought] = useState<OrbitThought | null>(null);
  const [localOrbitThoughts, setLocalOrbitThoughts] = useState<OrbitThoughtSnapshot[]>(
    () => getImmediateLocalOrbitThoughts(),
  );
  const [showLoadingMessage, setShowLoadingMessage] = useState(
    () => getImmediateLocalOrbitThoughts().length === 0,
  );
  const [tappedThoughtId, setTappedThoughtId] = useState<number | string | null>(null);
  const { sessionError, refreshSession } = useUser();
  const { data, isError, isFetched } = useMyThoughts({
    refetchInterval: false,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    staleTime: 60000,
  });

  useEffect(() => {
    const syncLocalOrbitThoughts = () => {
      const nextLocalThoughts = getImmediateLocalOrbitThoughts();
      setLocalOrbitThoughts(nextLocalThoughts);
      if (ORBIT_DEBUG) {
        const debugCounts = getOrbitLocalDebugCounts();
        console.log("Orbit local raw count:", debugCounts.rawCount);
        console.log("Orbit visible local count:", debugCounts.visibleCount);
        if (nextLocalThoughts.length > 0) {
          console.log("Orbit rendered from local");
        }
      }
    };

    syncLocalOrbitThoughts();
    window.addEventListener("focus", syncLocalOrbitThoughts);
    document.addEventListener("visibilitychange", syncLocalOrbitThoughts);
    window.addEventListener("storage", syncLocalOrbitThoughts);
    window.addEventListener(
      ORBIT_LOCAL_THOUGHTS_UPDATED_EVENT,
      syncLocalOrbitThoughts as EventListener,
    );

    return () => {
      window.removeEventListener("focus", syncLocalOrbitThoughts);
      document.removeEventListener("visibilitychange", syncLocalOrbitThoughts);
      window.removeEventListener("storage", syncLocalOrbitThoughts);
      window.removeEventListener(
        ORBIT_LOCAL_THOUGHTS_UPDATED_EVENT,
        syncLocalOrbitThoughts as EventListener,
      );
    };
  }, []);

  const serverThoughts = useMemo(() => {
    const incoming = Array.isArray(data) ? (data as OrbitThoughtSnapshot[]) : [];
    const localKeys = new Set(localOrbitThoughts.map((thought) => getStableThoughtKey(thought)));
    return sortOrbitThoughts(
      incoming.filter((thought) => !localKeys.has(getStableThoughtKey(thought))),
    );
  }, [data, localOrbitThoughts]);
  const mergedThoughts = useMemo(() => {
    const mergedMap = new Map<string, OrbitThoughtSnapshot>();

    for (const thought of localOrbitThoughts) {
      mergedMap.set(getStableThoughtKey(thought), thought);
    }

    for (const thought of serverThoughts) {
      const stableKey = getStableThoughtKey(thought);
      const existing = mergedMap.get(stableKey);
      if (!existing) {
        mergedMap.set(stableKey, thought);
        continue;
      }

      mergedMap.set(stableKey, {
        ...thought,
        ...existing,
        id: existing.id ?? thought.id,
        content: existing.content ?? thought.content,
        mood: existing.mood ?? thought.mood,
        feltThisCount:
          typeof thought.feltThisCount === "number"
            ? thought.feltThisCount
            : existing.feltThisCount,
        madeThinkCount:
          typeof thought.madeThinkCount === "number"
            ? thought.madeThinkCount
            : existing.madeThinkCount,
        createdAt: existing.createdAt ?? thought.createdAt,
        localCreatedAt: existing.localCreatedAt ?? getThoughtTime(existing),
      });
    }

    return sortOrbitThoughts([...mergedMap.values()]);
  }, [localOrbitThoughts, serverThoughts]);
  const thoughtIdentityKey = useMemo(
    () => buildThoughtIdentityKey(mergedThoughts),
    [mergedThoughts],
  );
  const hasVisibleThoughts = mergedThoughts.length > 0;
  const serverSettled = isFetched || isError;
  const shouldShowLoading = !hasVisibleThoughts && showLoadingMessage && !serverSettled;

  const stableBubbleLayout = useMemo(
    () => getStableBubbleLayout(mergedThoughts),
    [thoughtIdentityKey],
  );
  const stableThoughts = stableBubbleLayout.thoughts;

  useEffect(() => {
    writeOrbitLayoutMap(stableBubbleLayout.layoutMap);
  }, [thoughtIdentityKey, stableBubbleLayout.layoutMap]);

  useEffect(() => {
    if (ORBIT_DEBUG) {
      console.log("Orbit server count:", serverThoughts.length);
      console.log("Orbit merged count:", mergedThoughts.length);
      console.log("Orbit rendered real bubbles count:", stableThoughts.length);
      console.log("Orbit phantom bubbles count:", 0);
      console.log(
        "Orbit layout map count:",
        Object.keys(stableBubbleLayout.layoutMap).length,
      );
    }
  }, [mergedThoughts.length, serverThoughts.length, stableThoughts.length, stableBubbleLayout.layoutMap]);

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
      if (ORBIT_DEBUG) {
        console.log("Orbit fallback triggered");
      }
    }, ORBIT_FALLBACK_TIMEOUT_MS);

    return () => {
      clearTimeout(timeout);
    };
  }, [hasVisibleThoughts, serverSettled]);

  useEffect(() => {
    if (!ORBIT_DEBUG) {
      return;
    }

    console.log(
      "Orbit state:",
      shouldShowLoading
        ? "loading"
        : hasVisibleThoughts
          ? "showing-thoughts"
          : "empty",
    );
  }, [hasVisibleThoughts, shouldShowLoading]);

  const handleOpenThought = (thought: OrbitThought) => {
    void triggerHaptic("light");
    setTappedThoughtId(thought.id);
    setSelectedThought(thought);

    window.setTimeout(() => {
      setTappedThoughtId((current) => (current === thought.id ? null : current));
    }, 260);
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 pb-36 overflow-hidden relative">
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute inset-[-12%]"
          style={{
            background:
              "radial-gradient(circle at 50% 12%, rgba(182,146,255,0.14) 0%, rgba(116,84,204,0.10) 18%, rgba(56,38,118,0.06) 36%, rgba(10,8,28,0) 74%)",
            filter: "blur(42px)",
          }}
        />
        <div
          className="absolute left-1/2 top-[28%] h-[46vh] w-[72vw] max-w-[760px] -translate-x-1/2 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(158,116,246,0.10) 0%, rgba(108,76,190,0.07) 32%, rgba(20,14,42,0) 72%)",
            filter: "blur(32px)",
          }}
        />
      </div>

      <div className="pt-8 text-center">
        <h1
          className="text-4xl md:text-5xl text-white/90"
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
          className="text-xs tracking-[0.22em] text-white/50 mt-3"
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

      <div className="relative min-h-[72vh] -mt-2 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute left-1/2 top-[12%] h-[12rem] w-[28rem] max-w-[88vw] -translate-x-1/2 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(214,188,255,0.08) 0%, rgba(154,118,245,0.08) 42%, rgba(20,14,42,0) 78%)",
              filter: "blur(26px)",
            }}
          />
        </div>

        {shouldShowLoading && (
          <p
            className="text-center text-white/56 mt-16"
            style={{
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
            }}
          >
            Loading your orbit...
          </p>
        )}

        {!hasVisibleThoughts && !shouldShowLoading && (
          <div className="text-center text-white/56 mt-20 px-6">
            <p
              className="text-lg"
              style={{
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
              }}
            >
              No thoughts in orbit yet.
            </p>
            <p className="text-sm text-white/56 mt-3">
              {isError
                ? "Orbit will refresh quietly when the connection returns."
                : "Release one into the void first."}
            </p>
          </div>
        )}

        {hasVisibleThoughts &&
          stableThoughts.map((thought) => {
            const totalReactions =
              (thought.feltThisCount ?? 0) + (thought.madeThinkCount ?? 0);
            const isTapped = tappedThoughtId === thought.id;

            return (
              <div
                key={thought.id}
                className="absolute"
                style={{
                  top: `${thought.top}%`,
                  left: `${thought.left}%`,
                  width: `${thought.size}px`,
                  height: `${thought.size}px`,
                  zIndex: thought.zIndex + 10,
                  opacity: thought.opacity,
                  filter: `blur(${thought.blur}px) brightness(${thought.brightness})`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <button
                  onClick={() => handleOpenThought(thought)}
                  className="w-full h-full rounded-full cursor-pointer active:scale-95 transition-transform duration-200 relative"
                  style={{
                    opacity: thought.edgeOpacity,
                    transform: isTapped ? "scale(1.06)" : "scale(1)",
                    transition: "transform 180ms ease, box-shadow 180ms ease",
                    background:
                      "radial-gradient(circle at 30% 25%, rgba(255,255,255,0.38), transparent 14%), radial-gradient(circle at 50% 50%, rgba(170,120,255,0.30), rgba(50,35,95,0.38) 65%, rgba(15,12,35,0.5))",
                    border: thought.border,
                    boxShadow: isTapped
                      ? `${thought.glow}, 0 0 88px rgba(185,136,255,0.18)`
                      : thought.glow,
                  }}
                >
                  <div
                    className="absolute inset-[-10%] rounded-full pointer-events-none"
                    style={{
                      opacity: isTapped ? thought.auraOpacity : thought.auraOpacity * 0.8,
                      background:
                        "radial-gradient(circle, rgba(180,145,255,0.18) 0%, rgba(130,96,225,0.08) 44%, rgba(0,0,0,0) 72%)",
                      filter: "blur(14px)",
                      transition: "opacity 180ms ease",
                    }}
                  />

                  <div
                    className="absolute inset-[14%] rounded-full pointer-events-none"
                    style={{
                      border: "1px solid rgba(255,255,255,0.08)",
                      opacity: 0.45,
                    }}
                  />

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
                            : "rgba(255,255,255,0.52)",
                        transform: "rotate(-30deg)",
                      }}
                    />
                  </div>
                </button>
              </div>
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
              border: "1px solid rgba(220,205,255,0.12)",
              backdropFilter: "blur(16px)",
              boxShadow:
                "0 0 34px rgba(145,105,235,0.12), inset 0 0 24px rgba(255,255,255,0.02)",
            }}
          >
            <h2
              className="text-2xl text-white/92 mb-4"
              style={{
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
              }}
            >
              Thought
            </h2>

            {selectedThought.mood && (
              <p className="text-sm text-white/60 mb-4 uppercase tracking-[0.2em]">
                {selectedThought.mood}
              </p>
            )}

            <p
              className="text-lg text-white/86 leading-relaxed"
              style={{
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
              }}
            >
              {selectedThought.content ?? "Untitled thought"}
            </p>

            <div className="mt-6 text-sm text-white/60">
              Felt this: {selectedThought.feltThisCount ?? 0} · Made think:{" "}
              {selectedThought.madeThinkCount ?? 0}
            </div>

            <button
              className="mt-6 px-5 py-2.5 rounded-full text-sm tracking-wide text-white/88 transition-all duration-300 hover:bg-white/12"
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(220,205,255,0.14)",
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
