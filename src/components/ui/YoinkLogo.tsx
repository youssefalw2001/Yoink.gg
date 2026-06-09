/**
 * YOINK.GG — Complete Brand Identity SVG System
 *
 * YoinkIcon      — Crown-Dagger standalone mark (favicon / avatar / small)
 * YoinkWordmark  — Full YOINK.GG text treatment
 * YoinkLogo      — Icon + Wordmark combined (horizontal)
 * YoinkLogoStack — Icon + Wordmark stacked (vertical, hero use)
 *
 * Design brief:
 *   Icon: Crown where the lower spires become downward daggers.
 *         The shape reads as both a crown (king) and a claw (yoink/steal).
 *   Wordmark: Orbitron 900, YOINK in white, .GG in gold gradient.
 *             The dot • in .GG is a small gold coin ◎.
 *   Tagline: "The Most Dangerous 30 Seconds in Crypto."
 *
 * All sizes via the `size` prop. All inline SVG — zero deps.
 */

interface IconProps {
  size?: number;
  className?: string;
  /** "gold" (default) | "white" | "blood" | "phantom" */
  variant?: "gold" | "white" | "blood" | "phantom";
  /** Show animated glow ring */
  glow?: boolean;
}

// ─── Colour maps ──────────────────────────────────────────────────────────────
const VARIANT_COLORS = {
  gold:    { fill: "#FFD700", accent: "#FFE566", deep: "#FF9900", shadow: "rgba(255,215,0,0.5)" },
  white:   { fill: "#FFFFFF", accent: "#E0E0E0", deep: "#BDBDBD", shadow: "rgba(255,255,255,0.4)" },
  blood:   { fill: "#FF2200", accent: "#FF5533", deep: "#B81700", shadow: "rgba(255,34,0,0.5)" },
  phantom: { fill: "#7000FF", accent: "#9B40FF", deep: "#4400CC", shadow: "rgba(112,0,255,0.5)" },
} as const;

// ─── YoinkIcon — Crown-Dagger mark ───────────────────────────────────────────
export function YoinkIcon({ size = 40, className, variant = "gold", glow = false }: IconProps) {
  const c = VARIANT_COLORS[variant];
  const s = size;
  // Normalised to 40×40 viewBox, scaled by `size`
  return (
    <svg
      viewBox="0 0 40 40"
      width={s}
      height={s}
      fill="none"
      className={className}
      aria-label="YOINK.GG logo mark"
    >
      <defs>
        <linearGradient id={`yig-${variant}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={c.accent} />
          <stop offset="50%"  stopColor={c.fill} />
          <stop offset="100%" stopColor={c.deep} />
        </linearGradient>
        {glow && (
          <filter id="yiglow">
            <feGaussianBlur stdDeviation="2.5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        )}
      </defs>

      {/* glow halo */}
      {glow && (
        <circle cx="20" cy="20" r="18"
          fill={c.shadow.replace("0.5", "0.18")}
          style={{ willChange: "opacity", animation: "border-breathe 3s ease-in-out infinite" }}
        />
      )}

      {/*
        Crown-Dagger path:
        Five crown points at top → the shape widens → the lower three
        interior spires point downward like daggers.
        The outer two legs curve like crown base supports.
      */}
      <path
        d={[
          // Outer shape — crown silhouette
          "M 4 28",          // bottom-left foot
          "L 4 18",          // left base
          "L 10 22",         // left inner shoulder
          "L 14 8",          // left spire tip (up)
          "L 20 14",         // center-left valley
          "L 20 6",          // center tip (tallest)
          "L 20 14",         // back through center
          "L 26 8",          // right spire tip (up)
          "L 30 22",         // right inner shoulder
          "L 36 18",         // right base
          "L 36 28",         // bottom-right foot
          // Dagger cuts — three downward points inside the crown base
          "L 30 28",
          "L 28 34",         // right inner dagger tip (down)
          "L 26 28",
          "L 20 28",
          "L 20 36",         // center dagger tip (longest, down)
          "L 20 28",
          "L 14 28",
          "L 12 34",         // left inner dagger tip (down)
          "L 10 28",
          "Z",
        ].join(" ")}
        fill={`url(#yig-${variant})`}
        stroke={c.accent}
        strokeWidth="0.6"
        strokeLinejoin="round"
        filter={glow ? "url(#yiglow)" : undefined}
      />

      {/* Jewel in crown center */}
      <circle cx="20" cy="18" r="3"
        fill={variant === "gold" ? "#FF1744" : variant === "blood" ? "#FFD700" : c.accent}
        stroke={c.accent}
        strokeWidth="0.5"
      />
      <circle cx="19" cy="17" r="1" fill="white" opacity="0.45" />

      {/* Two side jewels */}
      <circle cx="11" cy="20" r="1.8"
        fill={variant === "gold" ? "#7000FF" : c.accent}
        stroke={c.accent} strokeWidth="0.4" opacity="0.9"
      />
      <circle cx="29" cy="20" r="1.8"
        fill={variant === "gold" ? "#00C853" : c.accent}
        stroke={c.accent} strokeWidth="0.4" opacity="0.9"
      />
    </svg>
  );
}

// ─── YoinkWordmark — Text treatment only ─────────────────────────────────────
interface WordmarkProps {
  size?: "sm" | "md" | "lg" | "xl" | "hero";
  className?: string;
  showTagline?: boolean;
  /** "default" | "mono" (all white) | "inverted" (dark bg becomes light) */
  style?: "default" | "mono";
}

const WORDMARK_SIZES = {
  sm:   { fontSize: 16, tagSize: 7,  letterSpacing: 1,   tagSpacing: 2  },
  md:   { fontSize: 22, tagSize: 8,  letterSpacing: 1.5, tagSpacing: 2  },
  lg:   { fontSize: 32, tagSize: 10, letterSpacing: 2,   tagSpacing: 2.5 },
  xl:   { fontSize: 48, tagSize: 13, letterSpacing: 3,   tagSpacing: 3  },
  hero: { fontSize: 72, tagSize: 18, letterSpacing: 4,   tagSpacing: 3.5 },
} as const;

export function YoinkWordmark({ size = "md", className, showTagline = false, style = "default" }: WordmarkProps) {
  const s = WORDMARK_SIZES[size];
  const yoinkColor = style === "mono" ? "white" : "white";
  const ggColor    = style === "mono" ? "white" : "url(#wg)";

  // viewBox scales with font size
  const vw = s.fontSize * 7.2;
  const vh = showTagline ? s.fontSize * 2.4 : s.fontSize * 1.35;

  return (
    <svg
      viewBox={`0 0 ${vw} ${vh}`}
      width={vw}
      height={vh}
      className={className}
      aria-label="YOINK.GG wordmark"
    >
      <defs>
        <linearGradient id="wg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#FFE566" />
          <stop offset="50%"  stopColor="#FFD700" />
          <stop offset="100%" stopColor="#FF9900" />
        </linearGradient>
      </defs>

      {/* YOINK */}
      <text
        x="0" y={s.fontSize * 0.92}
        fontFamily="'Orbitron', sans-serif"
        fontWeight="900"
        fontSize={s.fontSize}
        fill={yoinkColor}
        letterSpacing={s.letterSpacing}
      >
        YOINK
      </text>

      {/* .GG in gold */}
      <text
        x={s.fontSize * 4.05} y={s.fontSize * 0.92}
        fontFamily="'Orbitron', sans-serif"
        fontWeight="900"
        fontSize={s.fontSize}
        fill={ggColor}
        letterSpacing={s.letterSpacing}
      >
        .GG
      </text>

      {/* Tagline */}
      {showTagline && (
        <text
          x="0" y={s.fontSize * 1.5}
          fontFamily="'Space Grotesk', sans-serif"
          fontWeight="500"
          fontSize={s.tagSize}
          fill="#8892a4"
          letterSpacing={s.tagSpacing}
        >
          THE MOST DANGEROUS 30 SECONDS IN CRYPTO
        </text>
      )}
    </svg>
  );
}

// ─── YoinkLogo — Icon + Wordmark horizontal ───────────────────────────────────
interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  showTagline?: boolean;
  iconVariant?: IconProps["variant"];
}

const LOGO_ICON_SIZES = { sm: 24, md: 36, lg: 52, xl: 72 } as const;
const LOGO_TEXT_SIZES: Record<string, WordmarkProps["size"]> = {
  sm: "sm", md: "md", lg: "lg", xl: "xl",
};

export function YoinkLogo({ size = "md", className, showTagline = false, iconVariant = "gold" }: LogoProps) {
  const iconSize = LOGO_ICON_SIZES[size];
  const textSize = LOGO_TEXT_SIZES[size];
  const ws       = WORDMARK_SIZES[textSize ?? "md"];
  const gap      = iconSize * 0.35;
  const totalW   = iconSize + gap + ws.fontSize * 7.2;
  const totalH   = showTagline ? ws.fontSize * 2.6 : Math.max(iconSize, ws.fontSize * 1.35);
  const textY    = (totalH - ws.fontSize * 1.35) / 2;

  return (
    <svg
      viewBox={`0 0 ${totalW} ${totalH}`}
      width={totalW}
      height={totalH}
      className={className}
      aria-label="YOINK.GG"
    >
      <defs>
        <linearGradient id={`lg-${iconVariant}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={VARIANT_COLORS[iconVariant].accent} />
          <stop offset="100%" stopColor={VARIANT_COLORS[iconVariant].deep} />
        </linearGradient>
        <linearGradient id="lwg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#FFE566" />
          <stop offset="50%"  stopColor="#FFD700" />
          <stop offset="100%" stopColor="#FF9900" />
        </linearGradient>
      </defs>

      {/* Icon — scaled into iconSize×iconSize box */}
      <g transform={`scale(${iconSize / 40})`}>
        <YoinkIconInline
          variant={iconVariant}
          gradId={`lg-${iconVariant}`}
        />
      </g>

      {/* YOINK */}
      <text
        x={iconSize + gap} y={textY + ws.fontSize * 0.9}
        fontFamily="'Orbitron', sans-serif"
        fontWeight="900"
        fontSize={ws.fontSize}
        fill="white"
        letterSpacing={ws.letterSpacing}
      >YOINK</text>

      {/* .GG */}
      <text
        x={iconSize + gap + ws.fontSize * 4.05} y={textY + ws.fontSize * 0.9}
        fontFamily="'Orbitron', sans-serif"
        fontWeight="900"
        fontSize={ws.fontSize}
        fill="url(#lwg)"
        letterSpacing={ws.letterSpacing}
      >.GG</text>

      {showTagline && (
        <text
          x={iconSize + gap} y={textY + ws.fontSize * 1.5}
          fontFamily="'Space Grotesk', sans-serif"
          fontWeight="500"
          fontSize={ws.tagSize}
          fill="#8892a4"
          letterSpacing={ws.tagSpacing}
        >THE MOST DANGEROUS 30 SECONDS IN CRYPTO</text>
      )}
    </svg>
  );
}

// ─── YoinkLogoStack — Stacked (icon above wordmark) — for hero/OG use ─────────
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
  const c = VARIANT_COLORS[iconVariant];
  return (
    <svg
      viewBox="0 0 240 200"
      width={size}
      height={(size / 240) * 200}
      className={className}
      aria-label="YOINK.GG stacked logo"
    >
      <defs>
        <linearGradient id="stig" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={c.accent} />
          <stop offset="50%"  stopColor={c.fill} />
          <stop offset="100%" stopColor={c.deep} />
        </linearGradient>
        <linearGradient id="stwg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#FFE566" />
          <stop offset="50%"  stopColor="#FFD700" />
          <stop offset="100%" stopColor="#FF9900" />
        </linearGradient>
        <filter id="stglow">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* Large crown-dagger icon centered */}
      <g transform="translate(100, 4) scale(1)">
        <YoinkIconInline variant={iconVariant} gradId="stig" size={40} glowFilterId="stglow" />
      </g>

      {/* YOINK.GG wordmark */}
      <text x="120" y="108"
        textAnchor="middle"
        fontFamily="'Orbitron', sans-serif"
        fontWeight="900"
        fontSize="38"
        fill="white"
        letterSpacing="3"
      >YOINK<tspan fill="url(#stwg)">.GG</tspan></text>

      {/* Gold underline accent */}
      <line x1="40" y1="118" x2="200" y2="118"
        stroke="url(#stwg)" strokeWidth="1.5" opacity="0.6"
      />

      {showTagline && (
        <text x="120" y="140"
          textAnchor="middle"
          fontFamily="'Space Grotesk', sans-serif"
          fontWeight="500"
          fontSize="10"
          fill="#8892a4"
          letterSpacing="2"
        >THE MOST DANGEROUS 30 SECONDS IN CRYPTO</text>
      )}
    </svg>
  );
}

// ─── Internal: icon path (reusable inside SVG context) ───────────────────────
function YoinkIconInline({
  variant = "gold",
  gradId,
  glowFilterId,
}: {
  variant?: IconProps["variant"];
  gradId: string;
  size?: number;
  glowFilterId?: string;
}) {
  const c = VARIANT_COLORS[variant];
  return (
    <>
      <path
        d={[
          "M 4 28","L 4 18","L 10 22","L 14 8",
          "L 20 14","L 20 6","L 20 14","L 26 8",
          "L 30 22","L 36 18","L 36 28",
          "L 30 28","L 28 34","L 26 28",
          "L 20 28","L 20 36","L 20 28",
          "L 14 28","L 12 34","L 10 28","Z",
        ].join(" ")}
        fill={`url(#${gradId})`}
        stroke={c.accent}
        strokeWidth="0.6"
        strokeLinejoin="round"
        filter={glowFilterId ? `url(#${glowFilterId})` : undefined}
      />
      <circle cx="20" cy="18" r="3"
        fill={variant === "gold" ? "#FF1744" : variant === "blood" ? "#FFD700" : c.accent}
        stroke={c.accent} strokeWidth="0.5"
      />
      <circle cx="19" cy="17" r="1" fill="white" opacity="0.45" />
      <circle cx="11" cy="20" r="1.8"
        fill={variant === "gold" ? "#7000FF" : c.accent}
        stroke={c.accent} strokeWidth="0.4" opacity="0.9"
      />
      <circle cx="29" cy="20" r="1.8"
        fill={variant === "gold" ? "#00C853" : c.accent}
        stroke={c.accent} strokeWidth="0.4" opacity="0.9"
      />
    </>
  );
}
