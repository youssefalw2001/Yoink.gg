/**
 * PuterStatus — shows whether Puter.js AI is connected.
 *
 * Puter.js loads async from CDN. Once loaded, users can generate
 * AI images for free (user-pays model).
 *
 * Shows:
 *   • Loading: pulsing dot
 *   • Connected: green "AI" badge
 *   • Not available: hidden (no need to alarm users)
 */

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type PuterState = "loading" | "ready" | "unavailable";

function checkPuter(): PuterState {
  if (typeof window === "undefined") return "loading";
  return typeof (window as Window & { puter?: unknown }).puter !== "undefined"
    ? "ready"
    : "unavailable";
}

export function PuterStatus() {
  const [state, setState] = useState<PuterState>("loading");

  useEffect(() => {
    // Check immediately
    if (checkPuter() === "ready") { setState("ready"); return; }

    // Poll — Puter.js loads async from CDN
    let attempts = 0;
    const id = setInterval(() => {
      attempts++;
      if (checkPuter() === "ready") {
        setState("ready");
        clearInterval(id);
      } else if (attempts > 30) { // 3s timeout
        setState("unavailable");
        clearInterval(id);
      }
    }, 100);
    return () => clearInterval(id);
  }, []);

  // Don't show anything if unavailable — no need to alarm users
  if (state === "unavailable") return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
        className="flex items-center gap-1.5 rounded-full border px-2.5 py-1"
        style={{
          borderColor: state === "ready" ? "rgba(0,230,118,0.3)" : "rgba(255,215,0,0.2)",
          background:  state === "ready" ? "rgba(0,230,118,0.08)" : "rgba(255,215,0,0.06)",
        }}
        title={state === "ready" ? "AI image generation active (Puter.js)" : "Loading AI..."}
      >
        {state === "ready" ? (
          <>
            <Sparkles className="h-3 w-3 text-emerald" aria-hidden />
            <span className="font-mono text-[10px] font-bold text-emerald">AI</span>
          </>
        ) : (
          <>
            <span
              className="h-2 w-2 rounded-full bg-gold"
              style={{ animation: "blink 1s ease-in-out infinite", willChange: "opacity" }}
              aria-hidden
            />
            <span className="font-mono text-[10px] text-gold/70">AI</span>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
