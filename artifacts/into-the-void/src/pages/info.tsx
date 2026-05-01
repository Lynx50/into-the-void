import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MOODS } from "@/components/mood-icon";
import { APP_VERSION } from "@/lib/app-version";
import {
  getHapticsEnabled,
  setHapticsEnabled,
  triggerHaptic,
} from "@/lib/haptics";

const PRIVACY_URL =
  "https://shade-pewter-4d4.notion.site/Into-the-Void-Privacy-Policy-12ff6644db4f8053ac79c03b8c303243";

const SUPPORT_EMAIL = "intothevoidapp@proton.me";

export default function Info() {
  const [hapticsEnabled, setHapticsEnabledState] = useState(getHapticsEnabled());
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const showStatus = (message: string) => {
    setStatusMessage(message);
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const resetOnboarding = () => {
    localStorage.removeItem("into_the_void_onboarding_seen_v1");
    showStatus("Onboarding reset. Reopen the app to see it again.");
  };

  const handleToggleHaptics = async () => {
    const nextValue = !hapticsEnabled;
    setHapticsEnabled(nextValue);
    setHapticsEnabledState(nextValue);

    if (nextValue) {
      await triggerHaptic("light");
    }

    showStatus(`Haptics ${nextValue ? "enabled" : "disabled"}`);
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 pb-36">
      <div className="max-w-2xl mx-auto pt-8">
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="text-center mb-8"
        >
          <h1
            className="text-4xl md:text-5xl text-white/88"
            style={{
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
              textShadow:
                "0 0 50px rgba(180,140,255,0.28), 0 0 100px rgba(140,100,220,0.12)",
            }}
          >
            Info
          </h1>

          <p className="text-xs tracking-[0.22em] text-white/28 mt-3">
            Privacy, clarity, and control.
          </p>
        </motion.div>

        <AnimatePresence>
          {statusMessage && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-4 text-center"
            >
              <p className="inline-block px-4 py-2 rounded-full text-[11px] tracking-[0.18em] uppercase text-white/65 bg-white/[0.04] border border-white/[0.08]">
                {statusMessage}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="space-y-4">
          <section className="rounded-3xl p-6 bg-white/[0.035] border border-white/[0.065]">
            <h2 className="text-xl text-white/85 mb-3">What this is</h2>
            <p className="text-white/60 text-sm leading-relaxed">
              Into the Void is a quiet space to release anonymous thoughts,
              receive thoughts from others, and watch your own thoughts drift
              into Orbit.
            </p>
          </section>

          <section className="rounded-3xl p-6 bg-white/[0.035] border border-white/[0.065]">
            <h2 className="text-xl text-white/85 mb-3">Privacy</h2>
            <p className="text-white/60 text-sm leading-relaxed">
              Thoughts are designed to feel anonymous. Avoid sharing personal or
              identifiable information.
            </p>

            <a
              href={PRIVACY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-4 text-xs tracking-[0.18em] uppercase text-white/60 hover:text-white transition-colors"
            >
              View full privacy policy →
            </a>
          </section>

          <section className="rounded-3xl p-6 bg-white/[0.035] border border-white/[0.065]">
            <h2 className="text-xl text-white/85 mb-3">Support</h2>
            <p className="text-white/60 text-sm leading-relaxed">
              Need help or want to report a problem?
            </p>

            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="inline-block mt-4 text-xs tracking-[0.18em] uppercase text-white/60 hover:text-white transition-colors break-all"
            >
              {SUPPORT_EMAIL}
            </a>
          </section>

          <section className="rounded-3xl p-6 bg-white/[0.035] border border-white/[0.065]">
            <h2 className="text-xl text-white/85 mb-3">Mood icons</h2>
            <p className="text-white/60 text-sm leading-relaxed">
              The icons under the text box are optional mood tags. They help
              give your thought a feeling before you release it.
            </p>

            <div className="mt-4 space-y-2.5">
              {MOODS.map((mood) => {
                const Icon = mood.icon;

                return (
                  <div
                    key={mood.id}
                    className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] px-4 py-3"
                  >
                    <Icon className={`h-4 w-4 ${mood.color}`} strokeWidth={2} />
                    <p className="text-sm text-white/62">
                      <span className="text-white/82">{mood.label}</span>
                      {" = "}
                      {mood.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-3xl p-6 bg-white/[0.035] border border-white/[0.065]">
            <h2 className="text-xl text-white/85 mb-4">App controls</h2>

            <div className="flex flex-col gap-3">
              <button
                onClick={handleToggleHaptics}
                className="flex justify-between items-center px-4 py-3 rounded-2xl text-sm uppercase tracking-[0.16em] text-white/70 bg-white/[0.04] border border-white/[0.08]"
              >
                <span>Haptics</span>
                <span className="text-white/50">
                  {hapticsEnabled ? "On" : "Off"}
                </span>
              </button>

              <button
                onClick={resetOnboarding}
                className="px-4 py-3 rounded-2xl text-sm uppercase tracking-[0.16em] text-white/70 bg-white/[0.04] border border-white/[0.08]"
              >
                Reset onboarding
              </button>
            </div>
          </section>
        </div>

        <p className="mt-6 text-center text-[11px] text-white/32 tracking-wide">
          Into the Void v{APP_VERSION}
        </p>
      </div>
    </div>
  );
}
