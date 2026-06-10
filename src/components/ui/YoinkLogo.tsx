/**
 * YOINK.GG — The Snatch Brand Identity
 *
 * Concept: A single abstract hand — three curved fingers reaching down to
 * snatch something. The negative space at the base of the fingers traces a
 * subtle "Y". Ultra minimal. One shape. New generation energy.
 *
 * The reaching hand = aggression, speed, the grab.
 * The Y negative space = the brand, baked in, not spelled out.
 * Gold → Blood gradient = money at the top, danger at the tips.
 *
 * Variants:
 *   SnatchIcon       — standalone mark (favicon / header / avatar)
 *   VoidEyeIcon      — alias for SnatchIcon (backwards compat)
 *   YoinkWordmark    — YOINK in white + .GG in gold (HTML, not SVG text)
 *   YoinkLogo        — icon + wordmark side by side
 *   YoinkLogoStack   — stacked hero version
 */

interface IconProps {
  size?: number;
  className?: string;
  /** "gold" | "phantom" | "blood" | "white" */
  variant?: "gold" | "phantom" | "blood" | "white";
  /** Subtle idle breathe on the mark */
  pulse?: boolean;
}

const COLORS = {
  gold:    { top: "#FFE566", mid: "#FFD700", tip: "#FF4400" },
  phantom: { top: "#9B40FF", mid: "#7000FF", tip: "#4400CC" },
  blood:   { top: "#FF5533", mid: "#FF2200", tip: "#8B0000" },
  white:   { top: "#FFFFFF", mid: "#E0E0E0", tip: "#FFD700" },
} as const;

// ─── SnatchIcon ───────────────────────────────────────────────────────────────
// The mark: a downward-reaching three-finger snatch.
// 4 smooth cubic-bezier paths. Readable at 16px. Dramatic at 200px.
// The Y negative space lives between the three finger roots at ~(50, 52).

export function SnatchIcon({
  size = 40,
  className,
  variant = "gold",
  pulse = false,
}: IconProps) {
  const c      = COLORS[variant];
  const gradId = `sg-${variant}-${size}`;
  const glowId = `sgg-${variant}-${size}`;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      fill="none"
      className={className}
      aria-label="YOINK.GG"
      style={
        pulse
          ? { willChange: "transform", animation: "border-breathe 2.4s ease-in-out infinite" }
          : undefined
      }
    >
      <defs>
        <linearGradient id={gradId} x1="50" y1="10" x2="50" y2="92" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor={c.top} />
          <stop offset="55%"  stopColor={c.mid} />
          <stop offset="100%" stopColor={c.tip} />
        </linearGradient>
        <radialGradient id={glowId} cx="50%" cy="25%" r="55%">
          <stop offset="0%"   stopColor={c.mid} stopOpacity="0.35" />
          <stop offset="100%" stopColor={c.mid} stopOpacity="0"    />
        </radialGradient>
      </defs>

      {/* Glow halo */}
      <ellipse cx="50" cy="30" rx="38" ry="32" fill={`url(#${glowId})`} />

      {/* ① Index finger — sweeps left, sharp tip */}
      <path
        d="M 38 22 C 33 22,27 28,25 38 C 23 48,24 62,27 82 C 27.5 85,30 87,32 86 C 34 85,35 83,35 80 C 34 65,34 52,36 44 C 38 36,41 30,41 26 C 41 23,40 22,38 22 Z"
        fill={`url(#${gradId})`}
      />

      {/* ② Middle finger — tallest, dominant */}
      <path
        d="M 50 14 C 46 14,43 18,43 24 C 43 34,44 52,46 72 C 47 80,48 88,50 90 C 52 88,53 80,54 72 C 56 52,57 34,57 24 C 57 18,54 14,50 14 Z"
        fill={`url(#${gradId})`}
      />

      {/* ③ Ring finger — mirrors index */}
      <path
        d="M 62 22 C 60 22,59 23,59 26 C 59 30,62 36,64 44 C 66 52,66 65,65 80 C 65 83,66 85,68 86 C 70 87,72.5 85,73 82 C 76 62,77 48,75 38 C 73 28,67 22,62 22 Z"
        fill={`url(#${gradId})`}
      />

      {/* ④ Palm arc — bridges three finger bases. Concave dip = Y negative space */}
      <path
        d="M 26 34 C 26 28,31 20,38 18 C 42 16,45 15,50 14 C 55 15,58 16,62 18 C 69 20,74 28,74 34 C 70 32,66 28,62 27 C 58 26,55 26,50 26 C 45 26,42 26,38 27 C 34 28,30 32,26 34 Z"
        fill={`url(#${gradId})`}
        opacity="0.72"
      />

      {/* Highlight glint on middle finger */}
      <path
        d="M 49 18 C 49 24,49 36,49 52"
        stroke="rgba(255,255,255,0.28)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Backwards-compat alias — Header and other files import VoidEyeIcon
export const VoidEyeIcon = SnatchIcon;

// ─── YoinkWordmark ────────────────────────────────────────────────────────────
interface WordmarkProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  showTagline?: boolean;
}

const WM_SIZES = {
  xs: { fontSize: "0.7rem",  gap: "0.05em" },
  sm: { fontSize: "1rem",    gap: "0.05em" },
  md: { fontSize: "1.35rem", gap: "0.06em" },
  lg: { fontSize: "2rem",    gap: "0.06em" },
  xl: { fontSize: "3rem",    gap: "0.08em" },
} as const;

export function YoinkWordmark({ size = "md", className, showTagline = false }: WordmarkProps) {
  const s = WM_SIZES[size];
  return (
    <div className={`inline-flex flex-col ${className ?? ""}`}>
      <span
        className="font-display font-black leading-none tracking-tight"
        style={{ fontSize: s.fontSize, letterSpacing: s.gap }}
        aria-label="YOINK.GG"
      >
        <span className="text-white">YOINK</span>
        <span className="gold-text-gradient">.GG</span>
      </span>
      {showTagline && (
        <span
          className="font-mono text-slate"
          style={{ fontSize: `calc(${s.fontSize} * 0.38)`, letterSpacing: "0.18em", marginTop: "0.3em" }}
        >
          HOLD THE BAG. WIN EVERYTHING.
        </span>
      )}
    </div>
  );
}

// ─── YoinkLogo — icon + wordmark horizontal ───────────────────────────────────
interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  showTagline?: boolean;
  iconVariant?: IconProps["variant"];
  pulse?: boolean;
}

const LOGO_ICON_PX: Record<string, number> = { sm: 28, md: 36, lg: 48, xl: 64 };
const LOGO_WM_SIZE: Record<string, WordmarkProps["size"]> = {
  sm: "sm", md: "md", lg: "lg", xl: "xl",
};

export function YoinkLogo({
  size = "md",
  className,
  showTagline = false,
  iconVariant = "gold",
  pulse = false,
}: LogoProps) {
  return (
    <div className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <SnatchIcon size={LOGO_ICON_PX[size]} variant={iconVariant} pulse={pulse} />
      <YoinkWordmark size={LOGO_WM_SIZE[size]} showTagline={showTagline} />
    </div>
  );
}

// ─── YoinkLogoStack — stacked hero (lobby / OG) ───────────────────────────────
export function YoinkLogoStack({
  size = 120,
  className,
  showTagline = true,
  iconVariant = "gold",
}: {
  size?: number;
  className?: string;
  showTagline?: boolean;
  iconVariant?: IconProps["variant"];
}) {
  return (
    <div className={`inline-flex flex-col items-center gap-3 ${className ?? ""}`}>
      <SnatchIcon size={size} variant={iconVariant} pulse />
      <div className="flex flex-col items-center gap-1">
        <span
          className="font-display font-black leading-none tracking-tight"
          style={{ fontSize: size * 0.25 }}
          aria-label="YOINK.GG"
        >
          <span className="text-white">YOINK</span>
          <span className="gold-text-gradient">.GG</span>
        </span>
        <div
          className="h-px"
          style={{
            background: "linear-gradient(90deg, transparent, #FFD700, transparent)",
            width: size * 0.85,
            opacity: 0.6,
          }}
        />
        {showTagline && (
          <span
            className="font-mono text-slate text-center"
            style={{ fontSize: size * 0.07, letterSpacing: "0.18em" }}
          >
            HOLD THE BAG. WIN EVERYTHING.
          </span>
        )}
      </div>
    </div>
  );
}
