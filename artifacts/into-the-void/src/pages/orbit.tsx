import { motion } from "framer-motion";
import { format } from "date-fns";
import { Heart, Brain, MoonStar } from "lucide-react";
import { useMyThoughts } from "@/hooks/use-thoughts";
import { MoodIcon } from "@/components/mood-icon";

export default function Orbit() {
  const { data: thoughts, isLoading } = useMyThoughts();

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-12 pb-32">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl mx-auto pt-8 sm:pt-12 mb-12 sm:mb-20 text-center"
      >
        <h1 className="text-3xl md:text-5xl font-display italic text-white/90 text-glow">
          My Orbit
        </h1>
        <p className="text-sm font-medium tracking-[0.2em] text-white/40 mt-4 uppercase">
          Thoughts you've released into the void
        </p>
      </motion.div>

      <div className="max-w-4xl mx-auto">
        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin opacity-50" />
          </div>
        ) : thoughts && thoughts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {thoughts.map((thought, i) => (
              <motion.div
                key={thought.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="glass-panel glass-panel-hover rounded-3xl p-6 sm:p-8 flex flex-col"
              >
                <div className="flex justify-between items-start mb-6">
                  <MoodIcon moodId={thought.mood} />
                  <span className="text-[10px] uppercase tracking-widest text-white/30 font-medium">
                    {format(new Date(thought.createdAt), "MMM d, yyyy")}
                  </span>
                </div>

                <p className="font-display text-xl sm:text-2xl text-white/80 leading-relaxed mb-8 flex-grow">
                  "{thought.content}"
                </p>

                <div className="flex gap-6 mt-auto border-t border-white/5 pt-4">
                  <div className="flex items-center gap-2 text-white/40">
                    <Heart className="w-4 h-4" />
                    <span className="text-xs font-medium tracking-wider">{thought.feltThisCount}</span>
                  </div>
                  <div className="flex items-center gap-2 text-white/40">
                    <Brain className="w-4 h-4" />
                    <span className="text-xs font-medium tracking-wider">{thought.madeThinkCount}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col items-center justify-center py-32 text-center"
          >
            <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center mb-6">
              <MoonStar className="w-8 h-8 text-white/20" strokeWidth={1} />
            </div>
            <h3 className="font-display text-2xl text-white/60 mb-2">Your orbit is empty</h3>
            <p className="text-white/30 text-sm tracking-wide">
              Release a thought to see it float here.
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
