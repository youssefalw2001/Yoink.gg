/**
 * YOINK.GG — Void Eye Brand Identity
 *
 * Concept: A single hexagonal eye with a gold coin for a pupil.
 * The eye = watching the timer, waiting to strike.
 * The hexagon = blockchain-native, web3.
 * The coin pupil = money, greed, crypto.
 * The slit = danger, focus, predatory instinct.
 *
 * Variants:
 *   VoidEyeIcon   — standalone mark (favicon / header / avatar)
 *   YoinkWordmark — YOINK in white + .GG in gold (HTML, not SVG text)
 *   YoinkLogo     — icon + wordmark side by side
 *   YoinkLogoStack— stacked hero version
 */

interface IconProps {
  size?: number;
  className?: string;
  /** "gold" | "phantom" | "blood" | "white" */
  variant?: "gold" | "phantom" | "blood" | "white";
  /** Animate the pupil with a slow pulse */
  pulse?: boolean;
}

const COLORS = {
  gold:    { hex: "#FFD700", soft: "#FFE566", deep: "#FF9900", pupil: "#FF9900" },
  phantom: { hex: "#7000FF", soft: "#9B40FF", deep: "#4400CC", pupil: "#7000FF" },
  blood:   { hex: "#FF2200", soft: "#FF5533", deep: "#B81700", pupil: "#FF2200" },
  white:   { hex: "#FFFFFF", soft: "#E0E0E0", deep: "#BDBDBD", pupil: "#FFD700" },
} as const;

// ─── VoidEyeIcon ─────────────────────────────────────────────────────────────
export function VoidEyeIcon({
  size = 40,
  className,
  variant = "gold",
  pulse = false,
}: IconProps) {
  const c = COLORS[variant];
  const s = size;
  const cx = s / 2;
  const cy = s / 2;

  // Hexagon points centered at cx,cy with radius r
  const hexPoints = (r: number) =>
    Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 180) * (60 * i - 30);
      return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
    }).join(" ");

  const outerR = s * 0.46;
  const innerR = s * 0.38;

  // Eye lid curves — top arc + bottom arc meeting at left/right points
  const eyeW = s * 0.28;
  const eyeH = s * 0.18;
  const eyeTop    = `M ${cx - eyeW} ${cy} Q ${cx} ${cy - eyeH} ${cx + eyeW} ${cy}`;
  const eyeBottom = `Q ${cx} ${cy + eyeH} ${cx - eyeW} ${cy}`;
  const eyePath   = `${eyeTop} ${eyeBottom} Z`;

  // Pupil — coin shape (circle + ◎ mark)
  const pupilR  = s * 0.09;
  const innerPR = s * 0.055;

  return (
    <svg
      viewBox={`0 0 ${s} ${s}`}
      width={s}
      height={s}
      fill="none"
      className={className}
      aria-label="YOINK.GG — Void Eye"
    >
      <defs>
        <radialGradient id={`veg-${variant}-${s}`} cx="50%" cy="40%" r="60%">
          <stop offset="0%"   stopColor={c.soft} />
          <stop offset="50%"  stopColor={c.hex}  />
          <stop offset="100%" stopColor={c.deep} />
        </radialGradient>
        <radialGradient id={`veglow-${variant}-${s}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor={c.hex}  stopOpacity="0.35" />
          <stop offset="100%" stopColor={c.hex}  stopOpacity="0"    />
        </radialGradient>
        <filter id={`vegf-${s}`}>
          <feGaussianBlur stdDeviation={s * 0.05} result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        {/* Slit pupil gradient — dark center, glowing edge */}
        <linearGradient id={`vslit-${s}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={c.deep}  />
          <stop offset="40%"  stopColor={c.hex}   />
          <stop offset="100%" stopColor={c.deep}  />
        </linearGradient>
      </defs>

      {/* Outer glow halo */}
      <polygon
        points={hexPoints(outerR * 1.12)}
        fill={`url(#veglow-${variant}-${s})`}
      />

      {/* Hexagon frame */}
      <polygon
        points={hexPoints(outerR)}
        fill={`rgba(8,8,15,0.95)`}
        stroke={`url(#veg-${variant}-${s})`}
        strokeWidth={s * 0.035}
        strokeLinejoin="round"
      />

      {/* Inner hex ring — subtle */}
      <polygon
        points={hexPoints(innerR)}
        fill="none"
        stroke={c.hex}
        strokeWidth={s * 0.012}
        strokeOpacity="0.25"
        strokeLinejoin="round"
      />

      {/* Eye white */}
      <path
        d={eyePath}
        fill={`rgba(8,8,15,0.9)`}
        stroke={c.hex}
        strokeWidth={s * 0.022}
        strokeLinejoin="round"
      />

      {/* Pupil — coin circle */}
      <circle
        cx={cx}
        cy={cy}
        r={pupilR}
        fill={`url(#veg-${variant}-${s})`}
        filter={`url(#vegf-${s})`}
        style={pulse ? { willChange: "opacity", animation: "border-breathe 2.4s ease-in-out infinite" } : undefined}
      />
      {/* Inner ring of coin */}
      <circle
        cx={cx}
        cy={cy}
        r={innerPR}
        fill="rgba(8,8,15,0.7)"
        stroke={c.soft}
        strokeWidth={s * 0.016}
      />
      {/* Coin center dot */}
      <circle cx={cx} cy={cy} r={s * 0.018} fill={c.soft} />

      {/* Vertical slit — the predatory iris */}
      <ellipse
        cx={cx}
        cy={cy}
        rx={pupilR * 0.28}
        ry={pupilR * 0.78}
        fill={`url(#vslit-${s})`}
        opacity="0.85"
      />

      {/* Highlight sparkle top-left of pupil */}
      <circle
        cx={cx - pupilR * 0.35}
        cy={cy - pupilR * 0.38}
        r={s * 0.014}
        fill="white"
        opacity="0.6"
      />

      {/* Corner hex tick marks — circuit board aesthetic */}
      {[0, 2, 4].map((i) => {
        const a1 = (Math.PI / 180) * (60 * i - 30);
        const a2 = (Math.PI / 180) * (60 * (i + 1) - 30);
        const p1x = cx + outerR * 0.72 * Math.cos(a1 + 0.3);
        const p1y = cy + outerR * 0.72 * Math.sin(a1 + 0.3);
        const p2x = cx + outerR * 0.72 * Math.cos(a2 - 0.3);
        const p2y = cy + outerR * 0.72 * Math.sin(a2 - 0.3);
        return (
          <line
            key={i}
            x1={p1x} y1={p1y} x2={p2x} y2={p2y}
            stroke={c.hex}
            strokeWidth={s * 0.014}
            strokeOpacity="0.18"
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

// ─── YoinkWordmark — HTML-based (no SVG text, no gradient ID conflicts) ───────
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
        {/* .GG — gold-text-gradient CSS class, never dark, never conflicts */}
        <span className="gold-text-gradient">.GG</span>
      </span>
      {showTagline && (
        <span
          className="font-mono text-slate"
          style={{ fontSize: `calc(${s.fontSize} * 0.38)`, letterSpacing: "0.18em", marginTop: "0.3em" }}
        >
          THE MOST DANGEROUS 30 SECONDS IN CRYPTO
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
const LOGO_WM_SIZE: Record<string, WordmarkProps["size"]> = { sm: "sm", md: "md", lg: "lg", xl: "xl" };

export function YoinkLogo({
  size = "md",
  className,
  showTagline = false,
  iconVariant = "gold",
  pulse = false,
}: LogoProps) {
  return (
    <div className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <VoidEyeIcon size={LOGO_ICON_PX[size]} variant={iconVariant} pulse={pulse} />
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
      <VoidEyeIcon size={size} variant={iconVariant} pulse />
      <div className="flex flex-col items-center gap-1">
        <span
          className="font-display font-black leading-none tracking-tight"
          style={{ fontSize: size * 0.25 }}
          aria-label="YOINK.GG"
        >
          <span className="text-white">YOINK</span>
          <span className="gold-text-gradient">.GG</span>
        </span>
        {/* gold underline */}
        <div
          className="h-px w-full"
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
            THE MOST DANGEROUS 30 SECONDS IN CRYPTO
          </span>
        )}
      </div>
    </div>
  );
}
