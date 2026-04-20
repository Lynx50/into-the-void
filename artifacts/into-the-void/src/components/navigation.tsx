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
      <nav className="glass-panel rounded-full px-6 py-3 flex items-center gap-5 pointer-events-auto">
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
                    ? "text-primary-foreground"
                    : "text-muted-foreground group-hover:text-white/80"
                )}
              >
                <item.icon
                  className="w-5 h-5"
                  strokeWidth={isActive ? 2.5 : 1.5}
                />
                <span className="text-[10px] font-medium tracking-widest uppercase whitespace-nowrap">
                  {item.label}
                </span>
              </div>

              {isActive && (
                <motion.div
                  layoutId="nav-pill"
                  className="absolute inset-0 bg-white/10 rounded-full -z-10"
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