import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { MOODS, type MoodId } from "@/components/mood-icon";
import { useSubmitThought, useReceiveThought, useReceiveCount, useUser } from "@/hooks/use-thoughts";
import { ReceivedThoughtModal } from "@/components/received-thought-modal";
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

  const isOverLimit = receiveCountData?.remaining === 0;

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
          setTimeout(() => setIsSuccess(false), 3000);
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
            setReceiveError("The void is quiet right now. Try again later.");
          } else if (err.status === 429) {
            setReceiveError("You've reached your limit for today.");
          } else {
            setReceiveError("Failed to reach the void.");
          }
          setTimeout(() => setReceiveError(null), 4000);
        }
      }
    );
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 pb-32">
      
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.2 }}
        className="absolute top-12 left-0 right-0 text-center pointer-events-none"
      >
        <h1 className="text-3xl md:text-5xl font-display italic text-white/90 text-glow">
          Into the Void
        </h1>
        <p className="text-sm font-medium tracking-[0.2em] text-white/40 mt-3 uppercase">
          Release. Receive. Reflect.
        </p>
      </motion.div>

      {/* Main Submit Area */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, delay: 0.4 }}
        className="w-full max-w-2xl mt-16 z-10"
      >
        <form onSubmit={handleSubmit} className="relative group">
          <div className="glass-panel rounded-3xl p-6 sm:p-8 transition-all duration-500 focus-within:bg-white/[0.08] focus-within:border-white/20 focus-within:shadow-[0_0_40px_rgba(255,255,255,0.05)]">
            
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What's weighing on your mind?"
              maxLength={280}
              className="w-full bg-transparent border-none text-xl sm:text-2xl font-display text-white/90 placeholder:text-white/20 focus:outline-none focus:ring-0 resize-none min-h-[120px] no-scrollbar leading-relaxed"
            />

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mt-6 border-t border-white/5 pt-6">
              
              {/* Mood Selector */}
              <div className="flex flex-wrap gap-2">
                {MOODS.map((mood) => {
                  const Icon = mood.icon;
                  const isSelected = selectedMood === mood.id;
                  return (
                    <button
                      key={mood.id}
                      type="button"
                      onClick={() => setSelectedMood(isSelected ? null : mood.id)}
                      className={cn(
                        "p-2.5 rounded-full transition-all duration-300 group/btn",
                        isSelected 
                          ? "bg-white/15 border border-white/30 shadow-lg" 
                          : "bg-transparent border border-transparent hover:bg-white/5 hover:border-white/10 text-white/40"
                      )}
                      title={mood.label}
                    >
                      <Icon 
                        className={cn(
                          "w-5 h-5 transition-all duration-300",
                          isSelected ? mood.color : "group-hover/btn:text-white/80"
                        )} 
                      />
                    </button>
                  );
                })}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={!content.trim() || submitMutation.isPending}
                className={cn(
                  "flex items-center gap-2 px-6 py-3 rounded-full font-medium tracking-wide text-sm transition-all duration-500",
                  content.trim() && !submitMutation.isPending
                    ? "bg-primary/80 hover:bg-primary text-white shadow-[0_0_20px_rgba(100,50,200,0.3)] hover:shadow-[0_0_30px_rgba(100,50,200,0.5)] cursor-pointer"
                    : "bg-white/5 text-white/30 cursor-not-allowed"
                )}
              >
                <span>{submitMutation.isPending ? "Releasing..." : "Release"}</span>
                <Send className="w-4 h-4" />
              </button>

            </div>
          </div>

          {/* Success Message */}
          <AnimatePresence>
            {isSuccess && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute -bottom-12 left-0 right-0 text-center text-sm tracking-widest uppercase text-primary font-medium"
              >
                Your thought is in the void
              </motion.div>
            )}
          </AnimatePresence>
        </form>
      </motion.div>

      {/* Receive Area */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.8 }}
        className="mt-24 z-10 flex flex-col items-center"
      >
        <button
          onClick={handleReceive}
          disabled={receiveMutation.isPending || isOverLimit || !isReady}
          className={cn(
            "relative group flex items-center justify-center w-24 h-24 sm:w-32 sm:h-32 rounded-full transition-all duration-700",
            !isOverLimit && !receiveMutation.isPending
              ? "hover:scale-105 cursor-pointer"
              : "opacity-50 cursor-not-allowed grayscale"
          )}
        >
          <div className="absolute inset-0 rounded-full bg-white/5 backdrop-blur-sm border border-white/10 group-hover:border-white/30 group-hover:bg-white/10 transition-all duration-500" />
          
          {/* Pulsing ring */}
          {!isOverLimit && (
             <div className="absolute inset-0 rounded-full border border-primary/30 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite]" />
          )}

          <div className="flex flex-col items-center gap-2 text-white/70 group-hover:text-white transition-colors z-10">
            {receiveMutation.isPending ? (
              <motion.div 
                animate={{ rotate: 360 }} 
                transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
              >
                <Search className="w-6 h-6 sm:w-8 sm:h-8 opacity-50" />
              </motion.div>
            ) : (
              <Search className="w-6 h-6 sm:w-8 sm:h-8" />
            )}
            <span className="text-[10px] sm:text-xs font-medium tracking-[0.2em] uppercase">
              Receive
            </span>
          </div>
        </button>

        <div className="mt-6 text-center h-8">
          {receiveError ? (
            <motion.p 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="text-sm text-destructive tracking-wide"
            >
              {receiveError}
            </motion.p>
          ) : receiveCountData ? (
            <p className="text-xs font-medium tracking-[0.15em] text-white/30 uppercase">
              {receiveCountData.remaining} / {receiveCountData.limit} remaining today
            </p>
          ) : null}
        </div>
      </motion.div>

      {/* Modal for received thought */}
      {receivedThought && (
        <ReceivedThoughtModal 
          thought={receivedThought} 
          onClose={() => setReceivedThought(null)} 
        />
      )}

    </div>
  );
}
