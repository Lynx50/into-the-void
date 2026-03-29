import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { MOODS, type MoodId } from "@/components/mood-icon";
import { useSubmitThought, useReceiveThought, useReceiveCount, useMyThoughts, useUser } from "@/hooks/use-thoughts";
import { FloatingBubbleReceive } from "@/components/floating-bubble-receive";
import { ReceivedThought } from "@workspace/api-client-react";

export default function Home() {
  const { userId, isReady } = useUser();
  const [content, setContent] = useState("");
  const [selectedMood, setSelectedMood] = useState<MoodId | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [receivedThought, setReceivedThought] = useState<ReceivedThought | null>(null);
  const [receiveError, setReceiveError] = useState<string | null>(null);

  const submitMutation = useSubmitThought();
  const receiveMutation = useReceiveThought();
  const { data: receiveCountData } = useReceiveCount();
  const { data: myThoughts } = useMyThoughts();

  const isOverLimit = receiveCountData?.remaining === 0;
  const hasSubmitted = myThoughts && myThoughts.length > 0;
  const lastThought = myThoughts?.[0];
  const lastThoughtReactions = lastThought
    ? lastThought.feltThisCount + lastThought.madeThinkCount
    : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !userId) return;

    submitMutation.mutate(
      {
        data: {
          userId,
          content: content.trim(),
          mood: selectedMood,
        },
      },
      {
        onSuccess: () => {
          setContent("");
          setSelectedMood(null);
          setIsSuccess(true);
          setTimeout(() => setIsSuccess(false), 3500);
        },
      }
    );
  };

  const handleReceive = () => {
    if (!userId || isOverLimit) return;
    setReceiveError(null);

    receiveMutation.mutate(
      { data: { userId } },
      {
        onSuccess: (data) => {
          setReceivedThought(data);
        },
        onError: (err: any) => {
          if (err.status === 404) {
            setReceiveError("The void is quiet. Be the first to release one.");
          } else if (err.status === 429) {
            setReceiveError("You've reached your limit for today.");
          } else if (err.status === 403) {
            setReceiveError("Release a thought first to unlock receiving.");
          } else {
            setReceiveError("Failed to reach the void.");
          }
          setTimeout(() => setReceiveError(null), 4000);
        },
      }
    );
  };

  const receiveDisabled = receiveMutation.isPending || isOverLimit || !isReady || !hasSubmitted;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 pb-36">

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2, delay: 0.2 }}
        className="absolute top-10 left-0 right-0 text-center pointer-events-none"
      >
        <h1
          className="text-4xl md:text-5xl text-white/90"
          style={{ fontFamily: "var(--font-display)", fontStyle: "italic", textShadow: "0 0 40px rgba(180,140,255,0.3)" }}
        >
          Into the Void
        </h1>
        <p className="text-xs font-medium tracking-[0.25em] text-white/30 mt-3 uppercase">
          Release. Receive. Let go.
        </p>

        {/* Feedback line: last thought engagement */}
        <AnimatePresence>
          {lastThought && lastThoughtReactions > 0 && (
            <motion.p
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2 text-[11px] tracking-wide text-white/25"
            >
              Your last thought touched {lastThoughtReactions} {lastThoughtReactions === 1 ? "person" : "people"}
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Release Input */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1, delay: 0.4 }}
        className="w-full max-w-xl mt-16 z-10"
      >
        <form onSubmit={handleSubmit} className="relative">
          <div
            className="rounded-3xl p-6 sm:p-8 transition-all duration-500"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.07)",
              boxShadow: "0 0 0 0 rgba(140,100,255,0)",
            }}
          >
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Say it... no one knows it's you"
              maxLength={280}
              className="w-full bg-transparent border-none text-xl sm:text-2xl text-white/85 placeholder:text-white/18 focus:outline-none focus:ring-0 resize-none min-h-[110px] leading-relaxed"
              style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
            />

            <div className="flex justify-between items-center mt-5 pt-5 border-t border-white/5">
              {/* Mood chips — minimal */}
              <div className="flex gap-1.5">
                {MOODS.map((mood) => {
                  const Icon = mood.icon;
                  const isSelected = selectedMood === mood.id;
                  return (
                    <button
                      key={mood.id}
                      type="button"
                      onClick={() => setSelectedMood(isSelected ? null : mood.id)}
                      title={mood.label}
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300",
                        isSelected
                          ? "bg-white/12 scale-110"
                          : "opacity-30 hover:opacity-60 hover:bg-white/5"
                      )}
                    >
                      <Icon className={cn("w-4 h-4", isSelected ? mood.color : "text-white/70")} />
                    </button>
                  );
                })}
              </div>

              <button
                type="submit"
                disabled={!content.trim() || submitMutation.isPending}
                className={cn(
                  "flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium tracking-wide transition-all duration-500",
                  content.trim() && !submitMutation.isPending
                    ? "bg-primary/70 hover:bg-primary/90 text-white cursor-pointer shadow-[0_0_20px_rgba(140,100,255,0.25)]"
                    : "bg-white/5 text-white/25 cursor-not-allowed"
                )}
              >
                {submitMutation.isPending ? "Releasing..." : "Release"}
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <AnimatePresence>
            {isSuccess && (
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="absolute -bottom-9 left-0 right-0 text-center text-xs tracking-[0.25em] uppercase text-primary/70"
              >
                ✦ Your thought is drifting through the void
              </motion.p>
            )}
          </AnimatePresence>
        </form>
      </motion.div>

      {/* Receive section */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2, delay: 0.9 }}
        className="mt-20 z-10 flex flex-col items-center gap-4"
      >
        {/* Emotional hook */}
        <AnimatePresence>
          {hasSubmitted && !isOverLimit && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm text-white/35 tracking-wide"
              style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
            >
              A thought is waiting for you...
            </motion.p>
          )}
          {!hasSubmitted && isReady && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-white/25 tracking-wide text-center max-w-[180px]"
            >
              Release a thought first to unlock receiving
            </motion.p>
          )}
        </AnimatePresence>

        {/* Receive button — the main focus */}
        <button
          onClick={handleReceive}
          disabled={receiveDisabled}
          className={cn(
            "relative group flex items-center justify-center w-28 h-28 sm:w-36 sm:h-36 rounded-full transition-all duration-700",
            !receiveDisabled ? "hover:scale-105 cursor-pointer" : "opacity-40 cursor-not-allowed"
          )}
        >
          {/* Glow layers */}
          {!receiveDisabled && (
            <>
              <div className="absolute inset-0 rounded-full bg-primary/15 blur-2xl scale-125 animate-pulse" />
              <div className="absolute inset-0 rounded-full border border-primary/25 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite]" />
              <div className="absolute inset-[-6px] rounded-full border border-primary/10 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite_0.8s]" />
            </>
          )}

          {/* Bubble body */}
          <div
            className="absolute inset-0 rounded-full transition-all duration-500 group-hover:bg-white/10"
            style={{
              background: "radial-gradient(circle at 35% 35%, rgba(180,140,255,0.12) 0%, rgba(100,60,200,0.06) 60%, transparent 100%)",
              border: "1px solid rgba(200,160,255,0.18)",
              boxShadow: receiveDisabled ? "none" : "0 0 30px rgba(140,100,255,0.15), inset 0 0 20px rgba(200,160,255,0.04)",
            }}
          />
          {/* Shine */}
          {!receiveDisabled && (
            <div className="absolute top-4 left-6 w-6 h-3 rounded-full bg-white/15 blur-sm rotate-[-30deg]" />
          )}

          <div className="relative z-10 flex flex-col items-center gap-1.5">
            {receiveMutation.isPending ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
                className="w-6 h-6 rounded-full border border-white/30 border-t-white/80"
              />
            ) : (
              <span className="text-white/60 group-hover:text-white/90 transition-colors text-base font-medium tracking-wide">
                Receive
              </span>
            )}
          </div>
        </button>

        {/* Status line */}
        <div className="h-6 text-center">
          {receiveError ? (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-red-400/70 tracking-wide"
            >
              {receiveError}
            </motion.p>
          ) : receiveCountData ? (
            <p className="text-[10px] font-medium tracking-[0.2em] text-white/20 uppercase">
              {receiveCountData.remaining} / {receiveCountData.limit} receives remaining today
            </p>
          ) : null}
        </div>
      </motion.div>

      {/* Floating bubble overlay */}
      <AnimatePresence>
        {receivedThought && (
          <FloatingBubbleReceive
            thought={receivedThought}
            onClose={() => setReceivedThought(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
