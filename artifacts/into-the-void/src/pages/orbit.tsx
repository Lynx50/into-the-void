import { useEffect, useRef, useState } from "react";
import { Navigation } from "@/components/navigation";
import { useMyThoughts, useUser } from "@/hooks/use-thoughts";
import { triggerHaptic } from "@/lib/haptics";

type OrbitThought = {
  id: number | string;
  content?: string;
  mood?: string | null;
  feltThisCount?: number;
  madeThinkCount?: number;
  top: string;
  left: string;
  size: number;
};

const orbitLayouts: Record<
  number,
  { top: string; left: string; size: number }[]
> = {
  1: [{ top: "34%", left: "36%", size: 124 }],
  2: [
    { top: "30%", left: "22%", size: 96 },
    { top: "46%", left: "54%", size: 114 },
  ],
  3: [
    { top: "22%", left: "36%", size: 110 },
    { top: "46%", left: "16%", size: 94 },
    { top: "56%", left: "56%", size: 100 },
  ],
  4: [
    { top: "18%", left: "34%", size: 108 },
    { top: "34%", left: "14%", size: 92 },
    { top: "38%", left: "58%", size: 104 },
    { top: "62%", left: "30%", size: 96 },
  ],
  5: [
    { top: "16%", left: "34%", size: 110 },
    { top: "30%", left: "12%", size: 92 },
    { top: "34%", left: "58%", size: 104 },
    { top: "56%", left: "22%", size: 98 },
    { top: "62%", left: "54%", size: 90 },
  ],
  6: [
    { top: "14%", left: "34%", size: 108 },
    { top: "26%", left: "12%", size: 90 },
    { top: "28%", left: "58%", size: 100 },
    { top: "48%", left: "20%", size: 96 },
    { top: "54%", left: "56%", size: 92 },
    { top: "70%", left: "34%", size: 88 },
  ],
  7: [
    { top: "12%", left: "34%", size: 106 },
    { top: "24%", left: "10%", size: 88 },
    { top: "24%", left: "60%", size: 100 },
    { top: "44%", left: "18%", size: 94 },
    { top: "46%", left: "56%", size: 92 },
    { top: "64%", left: "22%", size: 90 },
    { top: "68%", left: "52%", size: 86 },
  ],
  8: [
    { top: "10%", left: "34%", size: 104 },
    { top: "20%", left: "10%", size: 86 },
    { top: "20%", left: "60%", size: 98 },
    { top: "38%", left: "18%", size: 92 },
    { top: "40%", left: "58%", size: 90 },
    { top: "56%", left: "24%", size: 88 },
    { top: "60%", left: "54%", size: 86 },
    { top: "74%", left: "34%", size: 84 },
  ],
};

const defaultOrbitPositions = [
  { top: "10%", left: "34%", size: 104 },
  { top: "20%", left: "10%", size: 86 },
  { top: "20%", left: "60%", size: 98 },
  { top: "38%", left: "18%", size: 92 },
  { top: "40%", left: "58%", size: 90 },
  { top: "56%", left: "24%", size: 88 },
  { top: "60%", left: "54%", size: 86 },
  { top: "74%", left: "34%", size: 84 },
];

function getReactionBoost(feltThisCount = 0, madeThinkCount = 0): number {
  const totalReactions = feltThisCount + madeThinkCount;
  const cappedReactions = Math.min(totalReactions, 5);
  return cappedReactions * 4;
}

function getReactionGlow(totalReactions: number): string {
  if (totalReactions <= 0) {
    return "0 0 18px rgba(140,100,255,0.08), inset 0 0 12px rgba(200,160,255,0.03)";
  }

  if (totalReactions === 1) {
    return "0 0 24px rgba(180,140,255,0.14), inset 0 0 14px rgba(200,160,255,0.05)";
  }

  if (totalReactions <= 3) {
    return "0 0 30px rgba(190,150,255,0.18), inset 0 0 16px rgba(210,170,255,0.06)";
  }

  return "0 0 36px rgba(205,165,255,0.22), inset 0 0 18px rgba(220,180,255,0.08)";
}

function getReactionBorder(totalReactions: number): string {
  if (totalReactions <= 0) {
    return "1px solid rgba(200,170,255,0.16)";
  }

  if (totalReactions === 1) {
    return "1px solid rgba(215,185,255,0.22)";
  }

  if (totalReactions <= 3) {
    return "1px solid rgba(225,195,255,0.26)";
  }

  return "1px solid rgba(235,205,255,0.30)";
}

function buildPositionedThoughts(thoughts: any[]): OrbitThought[] {
  const visibleThoughts = thoughts.slice(0, 8);
  const activeLayout =
    orbitLayouts[visibleThoughts.length] || defaultOrbitPositions;

  return visibleThoughts.map((thought: any, index: number) => {
    const baseLayout = activeLayout[index % activeLayout.length];
    const feltThisCount =
      typeof thought?.feltThisCount === "number" ? thought.feltThisCount : 0;
    const madeThinkCount =
      typeof thought?.madeThinkCount === "number" ? thought.madeThinkCount : 0;

    const reactionBoost = getReactionBoost(feltThisCount, madeThinkCount);

    return {
      id: thought?.id ?? `thought-${index}`,
      content:
        typeof thought?.content === "string" && thought.content.trim().length > 0
          ? thought.content
          : "Untitled thought",
      mood: thought?.mood ?? null,
      feltThisCount,
      madeThinkCount,
      top: baseLayout.top,
      left: baseLayout.left,
      size: baseLayout.size + reactionBoost,
    };
  });
}

function getErrorMessage(error: any): string {
  return (
    error?.message ||
    error?.body?.error ||
    "Orbit couldn't load right now. Check that the API server is reachable."
  );
}

export default function Orbit() {
  const [selectedThought, setSelectedThought] = useState<OrbitThought | null>(null);
  const [stableThoughts, setStableThoughts] = useState<OrbitThought[]>([]);
  const [newlyArrivedIds, setNewlyArrivedIds] = useState<(number | string)[]>([]);
  const previousIdsRef = useRef<(number | string)[]>([]);
  const { isLoading: isSessionLoading, sessionError, refreshSession } = useUser();

  const { data, isLoading, isError, error } = useMyThoughts();

  const safeThoughtsArray = Array.isArray(data) ? data : [];
  const visibleThoughts = safeThoughtsArray.slice(0, 8);

  useEffect(() => {
    const nextIds = visibleThoughts.map((thought: any, index: number) =>
      thought?.id ?? `thought-${index}`,
    );

    const previousIds = previousIdsRef.current;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const hasChanged =
      nextIds.length !== previousIds.length ||
      nextIds.some((id, index) => id !== previousIds[index]);

    if (!hasChanged) {
      const refreshedThoughts = buildPositionedThoughts(visibleThoughts);
      setStableThoughts(refreshedThoughts);
      return;
    }

    const nextStableThoughts = buildPositionedThoughts(visibleThoughts);
    const addedIds = nextIds.filter((id) => !previousIds.includes(id));

    setStableThoughts(nextStableThoughts);

    if (previousIds.length > 0 && addedIds.length > 0) {
      setNewlyArrivedIds(addedIds);

      void triggerHaptic("light");

      timeout = setTimeout(() => {
        setNewlyArrivedIds([]);
      }, 900);
    }

    previousIdsRef.current = nextIds;

    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [visibleThoughts]);

  const handleOpenThought = async (thought: OrbitThought) => {
    void triggerHaptic("light");
    setSelectedThought(thought);
  };

  return (
    <>
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
            Thoughts you've released into the dark.
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

        <div className="relative h-[68vh] mt-8">
          {(isLoading || isSessionLoading) && (
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

          {!isLoading && !isSessionLoading && isError && (
            <div className="text-center text-white/30 mt-20 px-6">
              <p
                className="text-lg text-red-300/80"
                style={{
                  fontFamily: "var(--font-display)",
                  fontStyle: "italic",
                }}
              >
                Orbit couldn't load.
              </p>
              <p className="text-sm text-white/35 mt-3">
                {getErrorMessage(error)}
              </p>
            </div>
          )}

          {!isLoading &&
            !isSessionLoading &&
            !isError &&
            stableThoughts.length === 0 && (
              <div className="text-center text-white/30 mt-20 px-6">
                <p
                  className="text-lg"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontStyle: "italic",
                  }}
                >
                  Your orbit is still quiet.
                </p>
                <p className="text-sm text-white/20 mt-3">
                  Release your first thought into the void and it will appear here.
                </p>
              </div>
            )}

          {!isLoading &&
            !isSessionLoading &&
            !isError &&
            stableThoughts.map((t, index) => {
              const isNew = newlyArrivedIds.includes(t.id);
              const totalReactions =
                (t.feltThisCount ?? 0) + (t.madeThinkCount ?? 0);

              return (
                <div
                  key={t.id}
                  className={`bubble-float absolute ${isNew ? "bubble-arrive" : ""}`}
                  style={{
                    top: t.top,
                    left: t.left,
                    width: `${t.size}px`,
                    height: `${t.size}px`,
                    animationDelay: isNew ? "0s" : `${index * 0.5}s`,
                  }}
                >
                  <button
                    onClick={() => handleOpenThought(t)}
                    className="bubble-shell w-full h-full rounded-full cursor-pointer active:scale-95 transition-transform duration-200"
                    style={{
                      background:
                        totalReactions > 0
                          ? "radial-gradient(circle at 33% 30%, rgba(225,195,255,0.20) 0%, rgba(145,105,235,0.10) 55%, rgba(255,255,255,0.04) 100%)"
                          : "radial-gradient(circle at 33% 30%, rgba(200,170,255,0.14) 0%, rgba(120,80,210,0.07) 55%, rgba(255,255,255,0.03) 100%)",
                      border: getReactionBorder(totalReactions),
                      boxShadow: getReactionGlow(totalReactions),
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
                          background:
                            totalReactions > 0
                              ? "radial-gradient(ellipse, rgba(255,255,255,0.66) 0%, rgba(255,255,255,0.18) 55%, transparent 100%)"
                              : "radial-gradient(ellipse, rgba(255,255,255,0.58) 0%, rgba(255,255,255,0.14) 55%, transparent 100%)",
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
                              : "rgba(255,255,255,0.5)",
                          transform: "rotate(-30deg)",
                        }}
                      />
                    </div>
                  </button>
                </div>
              );
            })}
        </div>
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

      <Navigation />
    </>
  );
}
