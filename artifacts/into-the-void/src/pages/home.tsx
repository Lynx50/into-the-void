import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { MOODS, type MoodId } from "@/components/mood-icon";
import {
  useSubmitThought,
  useReceiveThought,
  useReceiveCount,
  useMyThoughts,
  useUser,
} from "@/hooks/use-thoughts";
import { FloatingBubbleReceive } from "@/components/floating-bubble-receive";
import { ReceivedThought } from "@workspace/api-client-react";
import { usePwaInstall } from "@/hooks/use-pwa-install";

export default function Home() {
  const { userId, isReady } = useUser();
  const [content, setContent] = useState("");
  const [selectedMood, setSelectedMood] = useState<MoodId | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [receivedThought, setReceivedThought] = useState<ReceivedThought | null>(null);
  const [receiveError, setReceiveError] = useState<string | null>(null);

  const submitMutation = useSubmitThought();
  const receiveMutation = useReceiveThought();
  const { data: receiveCountData } = useReceiveCount();
  const { data: myThoughts } = useMyThoughts();

  const { canInstall, triggerInstall } = usePwaInstall();
  const isDev = import.meta.env.DEV;
  const isOverLimit = !isDev && receiveCountData?.remaining === 0;
  const hasSubmitted = myThoughts && myThoughts.length > 0;
  const lastThought = myThoughts?.[0];
  const lastThoughtReactions = lastThought
    ? lastThought.feltThisCount + lastThought.madeThinkCount
    : 0;

  const receiveDisabled =
    receiveMutation.isPending || isOverLimit || !isReady || !hasSubmitted;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !userId) return;
    setSubmitError(null);
    submitMutation.mutate(
      { data: { userId, content: content.trim(), mood: selectedMood } },
      {
        onSuccess: () => {
          setContent("");
          setSelectedMood(null);
          setIsSuccess(true);
          setTimeout(() => setIsSuccess(false), 3500);
        },
        onError: (err: any) => {
          if (err.status === 422) {
            setSubmitError("This thought can't be shared here.");
          } else {
            setSubmitError("Couldn't release that one. Try again.");
          }
          setTimeout(() => setSubmitError(null), 4000);
        },
      }
    );
  };

  const handleReceive = () => {
    if (receiveDisabled) return;
    setReceiveError(null);
    receiveMutation.mutate(
      { data: { userId } },
      {
        onSuccess: (data) => setReceivedThought(data),
        onError: (err: any) => {
          if (err.status === 404) setReceiveError("No new thoughts right now. Release one and come back later.");
          else if (err.status === 429) setReceiveError("You've reached your limit for today.");
          else if (err.status === 403) setReceiveError("Release a thought first to unlock receiving.");
          else setReceiveError("Failed to reach the void.");
          setTimeout(() => setReceiveError(null), 4000);
        },
      }
    );
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 pb-36">

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.4, ease: "easeOut" }}
        className="absolute top-10 left-0 right-0 text-center pointer-events-none"
      >
        <h1
          className="text-4xl md:text-5xl text-white/88"
          style={{
            fontFamily: "var(--font-display)",
            fontStyle: "italic",
            textShadow: "0 0 50px rgba(180,140,255,0.28), 0 0 100px rgba(140,100,220,0.12)",
          }}
        >
          Into the Void
        </h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 1.2 }}
          className="text-xs tracking-[0.22em] text-white/28 mt-3"
          style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
        >
          Let it go… see what's out there.
        </motion.p>

        <AnimatePresence>
          {lastThought && lastThoughtReactions > 0 && (
            <motion.p
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.8 }}
              className="mt-2.5 text-[11px] tracking-wide text-white/20"
            >
              Your last thought touched {lastThoughtReactions}{" "}
              {lastThoughtReactions === 1 ? "person" : "people"}
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Release input */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.1, delay: 0.3, ease: "easeOut" }}
        className="w-full max-w-xl mt-16 z-10"
      >
        <form onSubmit={handleSubmit} className="relative">
          <div
            className="rounded-3xl p-6 sm:p-8 transition-all duration-700"
            style={{
              background: "rgba(255,255,255,0.035)",
              border: "1px solid rgba(255,255,255,0.065)",
            }}
          >
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Say it… no one knows it's you"
              maxLength={280}
              className="w-full bg-transparent border-none text-xl sm:text-2xl text-white/85 placeholder:text-white/18 focus:outline-none focus:ring-0 resize-none min-h-[110px] leading-relaxed"
              style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
            />

            <div className="flex justify-between items-center mt-5 pt-5 border-t border-white/[0.05]">
              {/* Mood chips */}
              <div className="flex gap-2">
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
                        "w-8 h-8 rounded-full flex items-center justify-center transition-all duration-400",
                        isSelected
                          ? "bg-white/10 scale-110"
                          : "opacity-25 hover:opacity-50 hover:bg-white/5"
                      )}
                    >
                      <Icon
                        className={cn(
                          "w-4 h-4 transition-colors duration-300",
                          isSelected ? mood.color : "text-white/60"
                        )}
                      />
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
                    ? "bg-primary/65 hover:bg-primary/85 text-white cursor-pointer shadow-[0_0_24px_rgba(140,100,255,0.22)]"
                    : "bg-white/5 text-white/22 cursor-not-allowed"
                )}
              >
                {submitMutation.isPending ? "Releasing…" : "Release"}
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <AnimatePresence>
            {submitError ? (
              <motion.p
                key="submit-error"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                className="absolute -bottom-9 left-0 right-0 text-center text-xs tracking-wide text-red-400/70"
              >
                {submitError}
              </motion.p>
            ) : isSuccess && (
              <motion.p
                key="submit-success"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6 }}
                className="absolute -bottom-9 left-0 right-0 text-center text-xs tracking-[0.25em] uppercase text-primary/60"
              >
                ✦ drifting into the void
              </motion.p>
            )}
          </AnimatePresence>
        </form>
      </motion.div>

      {/* Receive section */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.6, delay: 0.8 }}
        className="mt-16 z-10 flex flex-col items-center gap-5"
      >
        {/* Emotional hook */}
        <AnimatePresence mode="wait">
          {hasSubmitted && !isOverLimit ? (
            <motion.p
              key="waiting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8 }}
              className="text-sm text-white/30 tracking-wide"
              style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
            >
              Someone left this here for you…
            </motion.p>
          ) : isOverLimit ? (
            <motion.p
              key="limit"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-white/20 tracking-wide"
            >
              Come back tomorrow for more.
            </motion.p>
          ) : isReady ? (
            <motion.p
              key="gate"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-white/20 tracking-wide text-center max-w-[200px]"
            >
              Release a thought first to receive one.
            </motion.p>
          ) : null}
        </AnimatePresence>

        {/* The Receive button */}
        <button
          onClick={handleReceive}
          disabled={receiveDisabled}
          className={cn(
            "relative flex items-center justify-center w-32 h-32 sm:w-36 sm:h-36 rounded-full transition-all duration-700 focus:outline-none",
            !receiveDisabled
              ? "cursor-pointer hover:scale-[1.06] active:scale-[0.97]"
              : "opacity-35 cursor-not-allowed"
          )}
        >
          {/* Layered glow aura — only when active */}
          {!receiveDisabled && (
            <>
              {/* Outermost slow ripple */}
              <motion.div
                className="absolute rounded-full border border-primary/10"
                animate={{ scale: [1, 1.55, 1], opacity: [0.4, 0, 0.4] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                style={{ inset: -24 }}
              />
              {/* Mid ripple offset */}
              <motion.div
                className="absolute rounded-full border border-primary/15"
                animate={{ scale: [1, 1.35, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut", delay: 0.7 }}
                style={{ inset: -14 }}
              />
              {/* Inner glow pulse */}
              <motion.div
                className="absolute inset-0 rounded-full"
                animate={{ opacity: [0.12, 0.28, 0.12] }}
                transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
                style={{
                  background: "radial-gradient(circle, rgba(160,120,255,0.5) 0%, transparent 70%)",
                  filter: "blur(18px)",
                  transform: "scale(1.4)",
                }}
              />
            </>
          )}

          {/* Bubble shell */}
          <div
            className="absolute inset-0 rounded-full transition-all duration-500"
            style={{
              background:
                "radial-gradient(circle at 33% 30%, rgba(200,170,255,0.14) 0%, rgba(120,80,210,0.07) 55%, transparent 100%)",
              border: "1px solid rgba(200,170,255,0.2)",
              boxShadow: receiveDisabled
                ? "none"
                : "0 0 36px rgba(140,100,255,0.18), inset 0 0 24px rgba(200,160,255,0.04)",
            }}
          />

          {/* Bubble shine highlight */}
          {!receiveDisabled && (
            <div className="absolute top-[16%] left-[22%] w-[22%] h-[10%] rounded-full bg-white/18 blur-[3px] rotate-[-30deg]" />
          )}

          {/* Label */}
          <div className="relative z-10 flex flex-col items-center gap-1">
            {receiveMutation.isPending ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 3.5, ease: "linear" }}
                className="w-5 h-5 rounded-full border border-white/25 border-t-white/70"
              />
            ) : (
              <motion.span
                animate={{ opacity: [0.5, 0.82, 0.5] }}
                transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
                style={{
                  fontFamily: "system-ui, -apple-system, sans-serif",
                  fontSize: "0.8rem",
                  fontWeight: 500,
                  letterSpacing: "0.18em",
                  color: "rgba(255,255,255,0.72)",
                }}
              >
                RECEIVE
              </motion.span>
            )}
          </div>
        </button>

        {/* Counter / error */}
        <div className="h-5 text-center">
          <AnimatePresence mode="wait">
            {receiveError ? (
              <motion.p
                key="err"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-xs text-red-400/60 tracking-wide"
              >
                {receiveError}
              </motion.p>
            ) : receiveCountData ? (
              <motion.p
                key="count"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-[10px] tracking-[0.22em] text-white/18 uppercase"
              >
                {isDev ? "Dev mode: unlimited receives" : `${receiveCountData.remaining} / ${receiveCountData.limit} receives remaining today`}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* PWA install button — shown only when Chrome fires beforeinstallprompt */}
      <AnimatePresence>
        {canInstall && (
          <motion.button
            key="pwa-install"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.4 }}
            onClick={triggerInstall}
            className="fixed bottom-6 right-5 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full text-xs tracking-widest uppercase text-white/70 border border-white/10 bg-white/5 backdrop-blur-md hover:bg-white/10 hover:text-white/90 transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-70">
              <path d="M6.5 1v7M3.5 5.5 6.5 8.5l3-3M1.5 10.5h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Install App
          </motion.button>
        )}
      </AnimatePresence>

      {/* Bubble receive overlay */}
      <AnimatePresence>
        {receivedThought && (
          <FloatingBubbleReceive
            thought={receivedThought}
            onClose={() => setReceivedThought(null)}
            onReceiveAnother={!isOverLimit ? () => {
              setReceivedThought(null);
              setTimeout(() => handleReceive(), 550);
            } : undefined}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
