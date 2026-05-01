import { Link, useLocation } from "wouter";
import { Sparkles, Orbit, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export function Navigation() {
  const [location] = useLocation();

  const navItems = [
    { href: "/", icon: Sparkles, label: "The Void" },
    { href: "/orbit", icon: Orbit, label: "My Orbit" },
    { href: "/info", icon: Info, label: "Info" },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 p-6 flex justify-center pointer-events-none z-40">
      <nav
        className="glass-panel rounded-full px-6 py-3 flex items-center gap-5 pointer-events-auto"
        style={{
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.15)",
          boxShadow:
            "0 0 24px rgba(145,105,235,0.14), inset 0 0 18px rgba(255,255,255,0.03)",
        }}
      >
        {navItems.map((item) => {
          const isActive = location === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative group px-4 py-2"
            >
              <div
                className={cn(
                  "flex flex-col items-center gap-1 transition-colors duration-300",
                  isActive
                    ? "text-white"
                    : "text-white/60 group-hover:text-white/88"
                )}
              >
                <item.icon
                  className={cn("w-5 h-5", isActive && "drop-shadow-[0_0_8px_rgba(180,140,255,0.35)]")}
                  strokeWidth={isActive ? 2.5 : 1.5}
                />
                <span className="text-[10px] font-medium tracking-widest uppercase whitespace-nowrap">
                  {item.label}
                </span>
              </div>

              {isActive && (
                <motion.div
                  layoutId="nav-pill"
                  className="absolute inset-0 rounded-full -z-10"
                  style={{
                    background: "rgba(255,255,255,0.12)",
                    boxShadow: "0 0 24px rgba(145,105,235,0.22)",
                  }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
