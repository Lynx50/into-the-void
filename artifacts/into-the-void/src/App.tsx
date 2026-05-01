import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { FirebaseAnalytics } from "@capacitor-firebase/analytics";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AnimatedBackground from "@/components/animated-background";
import { Navigation } from "@/components/navigation";
import { prewarmOrbitExperience, prewarmReceiveExperience } from "@/hooks/use-thoughts";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Orbit from "@/pages/orbit";
import Info from "@/pages/info";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
const ONBOARDING_STORAGE_KEY = "into_the_void_onboarding_seen_v1";

async function trackEvent(
  name: string,
  params?: Record<string, string | number | boolean>,
): Promise<void> {
  try {
    if (!Capacitor.isNativePlatform()) return;

    await FirebaseAnalytics.logEvent({
      name,
      params,
    });
  } catch (error) {
    console.error("Analytics error:", error);
  }
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/orbit" component={Orbit} />
      <Route path="/info" component={Info} />
      <Route component={NotFound} />
    </Switch>
  );
}

type OnboardingStep = {
  title: string;
  body: string;
};

const onboardingSteps: OnboardingStep[] = [
  {
    title: "Release",
    body: "Let go of an anonymous thought and send it into the dark.",
  },
  {
    title: "Choose a mood",
    body: "Before you release a thought, you can tap a mood icon to give it a feeling — heavy, light, quiet, charged, or hopeful. It's optional.",
  },
  {
    title: "Receive",
    body: "Find thoughts left behind by other people out there in the void.",
  },
  {
    title: "Orbit",
    body: "Your released thoughts drift into My Orbit and live there as glowing bubbles.",
  },
];

function OnboardingOverlay() {
  const [stepIndex, setStepIndex] = useState(0);

  const isLastStep = stepIndex === onboardingSteps.length - 1;
  const step = onboardingSteps[stepIndex];

  const finishOnboarding = () => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
    window.location.reload();
  };

  const goNext = () => {
    if (isLastStep) {
      finishOnboarding();
      return;
    }

    setStepIndex((current) => current + 1);
  };

  const skipOnboarding = () => {
    finishOnboarding();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-6 py-8">
      <div className="absolute inset-0 bg-black/72 backdrop-blur-md" />

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="relative w-full max-w-md rounded-[2rem] p-6 sm:p-8 text-center"
        style={{
          background: "rgba(255,255,255,0.045)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow:
            "0 0 40px rgba(140,100,255,0.14), inset 0 0 24px rgba(255,255,255,0.02)",
        }}
      >
        <p
          className="text-[11px] tracking-[0.28em] uppercase text-white/35 mb-5"
          style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
        >
          Into the Void
        </p>

        <div className="flex items-center justify-center gap-2 mb-6">
          {onboardingSteps.map((_, index) => (
            <div
              key={index}
              className="h-1.5 rounded-full transition-all duration-300"
              style={{
                width: index === stepIndex ? "26px" : "8px",
                background:
                  index === stepIndex
                    ? "rgba(190,150,255,0.72)"
                    : "rgba(255,255,255,0.16)",
                boxShadow:
                  index === stepIndex
                    ? "0 0 12px rgba(160,120,255,0.35)"
                    : "none",
              }}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={stepIndex}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28 }}
          >
            <h2
              className="text-3xl text-white/88 mb-4"
              style={{
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
                textShadow:
                  "0 0 34px rgba(180,140,255,0.18), 0 0 70px rgba(140,100,220,0.08)",
              }}
            >
              {step.title}
            </h2>

            <p
              className="text-base leading-relaxed text-white/68 min-h-[88px] px-2"
              style={{
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
              }}
            >
              {step.body}
            </p>
          </motion.div>
        </AnimatePresence>

        <div className="mt-8 flex flex-col gap-3">
          <button
            onClick={goNext}
            className="w-full rounded-full px-5 py-3 text-sm tracking-[0.18em] uppercase text-white transition-all duration-300"
            style={{
              background: "rgba(145,105,235,0.42)",
              border: "1px solid rgba(215,185,255,0.18)",
              boxShadow: "0 0 24px rgba(140,100,255,0.16)",
            }}
          >
            {isLastStep ? "Enter the Void" : "Next"}
          </button>

          {!isLastStep && (
            <button
              onClick={skipOnboarding}
              className="w-full rounded-full px-5 py-3 text-xs tracking-[0.18em] uppercase text-white/50 transition-all duration-300 hover:text-white/70"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              Skip
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function AppShell() {
  const [hasSeenOnboarding] = useState(() => {
    return localStorage.getItem(ONBOARDING_STORAGE_KEY) === "true";
  });

  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <div className="relative min-h-screen w-full flex flex-col selection:bg-primary/30">
        <AnimatedBackground />
        <main className="flex-1 w-full h-full relative z-10">
          <Router />
        </main>
        <Navigation />
        {!hasSeenOnboarding && <OnboardingOverlay />}
      </div>
    </WouterRouter>
  );
}

function App() {
  useEffect(() => {
    trackEvent("app_open");
    void Promise.allSettled([
      prewarmOrbitExperience(),
      prewarmReceiveExperience(),
    ]).catch(() => {
      // Quiet warm-up should never affect first render.
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppShell />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
