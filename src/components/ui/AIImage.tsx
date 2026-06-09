/**
 * AIImage — reusable Puter.js AI image component.
 *
 * Shows a skeleton while generating, then fades in the result.
 * Falls back to a provided fallback element if Puter isn't loaded
 * or if generation fails (so the game always works without Puter).
 *
 * Usage:
 *   <AIImage
 *     generate={() => generateKingPortrait(wallet)}
 *     fallback={<KingAvatar wallet={wallet} />}
 *     className="h-20 w-20 rounded-full"
 *     alt="King portrait"
 *   />
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

type GenerateFn = () => Promise<string>;

interface AIImageProps {
  /** Async function that returns an image URL via Puter.js */
  generate: GenerateFn;
  /** Shown while loading or if Puter isn't available */
  fallback: React.ReactNode;
  className?: string;
  alt?: string;
  /** If true, don't auto-generate — wait for explicit trigger */
  lazy?: boolean;
}

type State = "idle" | "loading" | "done" | "error";

export function AIImage({
  generate,
  fallback,
  className = "",
  alt = "AI generated image",
  lazy = false,
}: AIImageProps) {
  const [state, setState]   = useState<State>(lazy ? "idle" : "loading");
  const [url, setUrl]       = useState<string | null>(null);
  const hasMounted          = useRef(false);
  const isPuterReady        = typeof window !== "undefined" && typeof (window as Window & { puter?: unknown }).puter !== "undefined";

  useEffect(() => {
    if (lazy || hasMounted.current) return;
    hasMounted.current = true;
    if (!isPuterReady) { setState("error"); return; }
    setState("loading");
    generate()
      .then((imageUrl) => { setUrl(imageUrl); setState("done"); })
      .catch(() => setState("error"));
  }, [generate, lazy, isPuterReady]);

  function trigger() {
    if (state !== "idle" && state !== "error") return;
    if (!isPuterReady) { setState("error"); return; }
    setState("loading");
    generate()
      .then((imageUrl) => { setUrl(imageUrl); setState("done"); })
      .catch(() => setState("error"));
  }

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <AnimatePresence mode="wait">
        {state === "done" && url ? (
          // ── AI image ──────────────────────────────────────────────────────
          <motion.img
            key="ai"
            src={url}
            alt={alt}
            className="absolute inset-0 h-full w-full object-cover"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          />
        ) : state === "loading" ? (
          // ── Skeleton shimmer ──────────────────────────────────────────────
          <motion.div
            key="skeleton"
            className="absolute inset-0 overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              className="absolute inset-0"
              style={{
                background: "linear-gradient(110deg, rgba(255,215,0,0.04) 0%, rgba(112,0,255,0.08) 40%, rgba(255,215,0,0.04) 80%)",
                backgroundSize: "200% 100%",
                animation: "shimmer 1.8s linear infinite",
                willChange: "background-position",
              }}
            />
            {/* Subtle AI generating indicator */}
            <div className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded-full border border-gold/20 bg-black/40 px-2 py-1 backdrop-blur-sm">
              <span
                className="h-1.5 w-1.5 rounded-full bg-gold"
                style={{ animation: "blink 1s ease-in-out infinite", willChange: "opacity" }}
              />
              <span className="font-mono text-[9px] text-gold/70">AI</span>
            </div>
          </motion.div>
        ) : (
          // ── Fallback (error or idle) ───────────────────────────────────────
          <motion.div
            key="fallback"
            className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={state === "idle" || state === "error" ? trigger : undefined}
            style={{ cursor: state === "idle" ? "pointer" : "default" }}
          >
            {fallback}
            {state === "idle" && (
              <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full border border-phantom/30 bg-black/50 px-2 py-0.5 backdrop-blur-sm">
                <span className="font-mono text-[9px] text-phantom/80">Generate</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Specialised variants ──────────────────────────────────────────────────────

/** Square avatar variant — used in KingCard */
export function AIAvatar({
  generate,
  fallback,
  className,
}: {
  generate: GenerateFn;
  fallback: React.ReactNode;
  size?: number;
  className?: string;
}) {
  return (
    <AIImage
      generate={generate}
      fallback={fallback}
      className={`rounded-2xl ${className ?? ""}`}
      alt="King portrait"
    />
  );
}

/** Wide banner variant — used in WinReveal and Leaderboard */
export function AIBanner({
  generate,
  fallback,
  className,
  alt,
}: {
  generate: GenerateFn;
  fallback: React.ReactNode;
  className?: string;
  alt?: string;
}) {
  return (
    <AIImage
      generate={generate}
      fallback={fallback}
      className={`w-full ${className ?? ""}`}
      alt={alt ?? "Banner"}
    />
  );
}
