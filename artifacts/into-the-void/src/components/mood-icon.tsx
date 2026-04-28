import { CloudRain, Sun, Moon, Zap, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export const MOODS = [
  {
    id: "sad",
    icon: CloudRain,
    label: "Heavy",
    ariaLabel: "Heavy mood",
    description: "heavy / sad / low",
    color: "text-blue-300",
  },
  {
    id: "happy",
    icon: Sun,
    label: "Light",
    ariaLabel: "Light mood",
    description: "light / happy / positive",
    color: "text-yellow-200",
  },
  {
    id: "thoughtful",
    icon: Moon,
    label: "Quiet",
    ariaLabel: "Quiet mood",
    description: "quiet / reflective / tired",
    color: "text-indigo-300",
  },
  {
    id: "frustrated",
    icon: Zap,
    label: "Intense",
    ariaLabel: "Intense mood",
    description: "intense / anxious / charged",
    color: "text-orange-400",
  },
  {
    id: "funny",
    icon: Sparkles,
    label: "Hopeful",
    ariaLabel: "Hopeful mood",
    description: "hopeful / inspired / meaningful",
    color: "text-pink-300",
  },
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
