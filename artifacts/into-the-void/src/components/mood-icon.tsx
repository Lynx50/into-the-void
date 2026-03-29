import { CloudRain, Sun, Moon, Zap, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export const MOODS = [
  { id: "sad", icon: CloudRain, label: "Heavy", color: "text-blue-300" },
  { id: "happy", icon: Sun, label: "Light", color: "text-yellow-200" },
  { id: "thoughtful", icon: Moon, label: "Deep", color: "text-indigo-300" },
  { id: "frustrated", icon: Zap, label: "Static", color: "text-orange-400" },
  { id: "funny", icon: Sparkles, label: "Floating", color: "text-pink-300" },
] as const;

export type MoodId = typeof MOODS[number]["id"];

interface MoodIconProps {
  moodId: string | null | undefined;
  className?: string;
  showLabel?: boolean;
}

export function MoodIcon({ moodId, className, showLabel = false }: MoodIconProps) {
  if (!moodId) return null;
  
  const mood = MOODS.find(m => m.id === moodId);
  if (!mood) return null;

  const Icon = mood.icon;

  return (
    <div className={cn("flex items-center gap-1.5", mood.color, className)}>
      <Icon className="w-4 h-4" strokeWidth={2} />
      {showLabel && <span className="text-xs font-medium tracking-wide">{mood.label}</span>}
    </div>
  );
}
