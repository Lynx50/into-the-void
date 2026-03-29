import { motion, AnimatePresence } from "framer-motion";
import { X, Heart, Brain } from "lucide-react";
import { ReceivedThought } from "@workspace/api-client-react";
import { MoodIcon } from "./mood-icon";
import { useReactToThought, useUser } from "@/hooks/use-thoughts";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  thought: ReceivedThought | null;
  onClose: () => void;
}

export function ReceivedThoughtModal({ thought, onClose }: Props) {
  const { userId } = useUser();
  const reactMutation = useReactToThought();
  
  // Local optimistic state for reactions
  const [reacted, setReacted] = useState<"felt_this" | "made_think" | null>(null);

  if (!thought) return null;

  const handleReact = (type: "felt_this" | "made_think") => {
    if (reacted || !userId) return; // Only allow one reaction per view for simplicity
    
    setReacted(type);
    reactMutation.mutate({
      id: thought.id,
      data: { userId, reactionType: type }
    });
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: "spring", duration: 0.6, bounce: 0.4 }}
          className="relative w-full max-w-lg glass-panel rounded-3xl p-8 sm:p-12 flex flex-col items-center text-center shadow-2xl shadow-primary/10"
        >
          <button 
            onClick={onClose}
            className="absolute top-6 right-6 p-2 text-white/50 hover:text-white transition-colors rounded-full hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>

          <p className="text-sm font-medium tracking-[0.2em] text-white/40 uppercase mb-8">
            From the void
          </p>

          <div className="mb-6 min-h-[120px] flex items-center justify-center">
            <h3 className="font-display text-2xl sm:text-3xl md:text-4xl leading-relaxed text-white/90">
              "{thought.content}"
            </h3>
          </div>

          <div className="mb-12">
            <MoodIcon moodId={thought.mood} showLabel />
          </div>

          <div className="flex gap-4 sm:gap-6 w-full justify-center">
            <button
              onClick={() => handleReact("felt_this")}
              disabled={!!reacted}
              className={cn(
                "group flex flex-col items-center gap-3 px-6 py-4 rounded-2xl transition-all duration-300",
                reacted === "felt_this" 
                  ? "bg-primary/20 border-primary/50 text-primary-foreground border" 
                  : "bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/20 text-white/70",
                reacted && reacted !== "felt_this" && "opacity-40 grayscale"
              )}
            >
              <Heart 
                className={cn(
                  "w-6 h-6 transition-all duration-500", 
                  reacted === "felt_this" ? "fill-primary text-primary scale-110" : "group-hover:scale-110"
                )} 
              />
              <div className="flex flex-col">
                <span className="text-xs font-medium uppercase tracking-wider">Felt this</span>
                <span className="text-[10px] opacity-60 mt-0.5">
                  {thought.feltThisCount + (reacted === "felt_this" ? 1 : 0)} resonating
                </span>
              </div>
            </button>

            <button
              onClick={() => handleReact("made_think")}
              disabled={!!reacted}
              className={cn(
                "group flex flex-col items-center gap-3 px-6 py-4 rounded-2xl transition-all duration-300",
                reacted === "made_think" 
                  ? "bg-accent/20 border-accent/50 text-accent-foreground border" 
                  : "bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/20 text-white/70",
                reacted && reacted !== "made_think" && "opacity-40 grayscale"
              )}
            >
              <Brain 
                className={cn(
                  "w-6 h-6 transition-all duration-500", 
                  reacted === "made_think" ? "text-accent scale-110" : "group-hover:scale-110"
                )} 
              />
              <div className="flex flex-col">
                <span className="text-xs font-medium uppercase tracking-wider">Made me think</span>
                <span className="text-[10px] opacity-60 mt-0.5">
                  {thought.madeThinkCount + (reacted === "made_think" ? 1 : 0)} pondering
                </span>
              </div>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
