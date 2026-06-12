import { ShieldCheck, ScrollText, BadgeCheck } from "lucide-react";

const ITEMS = [
  { icon: BadgeCheck, label: "18+ Only" },
  { icon: ShieldCheck, label: "Gamble Responsibly" },
  { icon: BadgeCheck, label: "Provably Fair (devnet)" },
  { icon: ScrollText, label: "Terms" },
];

export function Footer() {
  return (
    <footer className="relative z-10 mt-auto border-t border-white/[0.06] bg-[rgba(8,8,15,0.6)] backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-4 py-6 sm:flex-row sm:justify-between sm:px-6">
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2 sm:gap-x-3">
          {ITEMS.map(({ icon: Icon, label }, i) => (
            <span key={label} className="flex items-center gap-2">
              {i > 0 && <span className="hidden text-dim sm:inline">·</span>}
              <span className="flex items-center gap-1.5 text-xs text-slate">
                <Icon className="h-3.5 w-3.5 text-dim" aria-hidden />
                {label}
              </span>
            </span>
          ))}
        </div>
        <p className="font-mono text-[11px] text-dim">
          YOINK.GG — entertainment only · no real funds at risk
        </p>
      </div>
    </footer>
  );
}
