/**
 * WalletButton — connected to WalletContext.
 *
 * States:
 *   disconnected → gold "Connect Wallet" button
 *   connecting   → spinner + "Connecting…"
 *   connected    → green blink dot + truncated address + copy icon
 *                  click to open a small disconnect dropdown
 */

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet, Check, Copy, LogOut, Loader, ChevronDown } from "lucide-react";
import { truncateAddress } from "@/lib/utils";
import { useWallet } from "@/lib/wallet";

export function WalletButton() {
  const { connected, publicKey, connecting, connect, disconnect } = useWallet();
  const [menuOpen,  setMenuOpen]  = useState(false);
  const [copied,    setCopied]    = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  function handleCopy() {
    if (!publicKey) return;
    navigator.clipboard.writeText(publicKey).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function handleDisconnect() {
    setMenuOpen(false);
    disconnect();
  }

  // Close menu on outside click
  function handleBlur(e: React.FocusEvent) {
    if (!menuRef.current?.contains(e.relatedTarget as Node)) {
      setMenuOpen(false);
    }
  }

  // ── Disconnected ─────────────────────────────────────────────────────────
  if (!connected && !connecting) {
    return (
      <motion.button
        type="button"
        onClick={connect}
        whileTap={{ scale: 0.96 }}
        transition={{ duration: 0.14 }}
        className="flex items-center gap-2 rounded-xl border border-gold/30 bg-gold/10 px-3.5 py-2 font-mono text-[13px] font-bold text-gold transition-colors duration-150 hover:bg-gold/15"
        style={{ willChange: "transform" }}
        aria-label="Connect wallet"
      >
        <Wallet className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden sm:inline">Connect Wallet</span>
        <span className="sm:hidden">Connect</span>
      </motion.button>
    );
  }

  // ── Connecting ────────────────────────────────────────────────────────────
  if (connecting) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 font-mono text-[13px] text-slate">
        <Loader
          className="h-3.5 w-3.5 animate-spin"
          aria-hidden
          style={{ willChange: "transform" }}
        />
        <span className="hidden sm:inline">Connecting…</span>
      </div>
    );
  }

  // ── Connected ─────────────────────────────────────────────────────────────
  return (
    <div ref={menuRef} className="relative" onBlur={handleBlur}>
      <motion.button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        whileTap={{ scale: 0.96 }}
        transition={{ duration: 0.14 }}
        className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 font-mono text-[13px] text-white transition-colors duration-150 hover:bg-white/[0.07]"
        style={{ willChange: "transform" }}
        aria-label="Wallet menu"
        aria-expanded={menuOpen}
      >
        {/* Live blink dot */}
        <span className="blink-dot" aria-hidden />
        <span className="text-gold-soft">
          {truncateAddress(publicKey!, 4, 4)}
        </span>
        <ChevronDown
          className="h-3 w-3 text-dim transition-transform duration-200"
          style={{ transform: menuOpen ? "rotate(180deg)" : "rotate(0deg)", willChange: "transform" }}
          aria-hidden
        />
      </motion.button>

      {/* Dropdown */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 top-full z-50 mt-2 flex w-48 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[rgba(13,13,24,0.96)] shadow-xl backdrop-blur-xl"
            style={{ willChange: "transform" }}
          >
            {/* Full address */}
            <div className="border-b border-white/[0.06] px-4 py-3">
              <p className="font-mono text-[10px] text-dim">Connected</p>
              <p className="mt-0.5 truncate font-mono text-xs text-white">
                {truncateAddress(publicKey!, 6, 6)}
              </p>
            </div>

            {/* Copy */}
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-3 px-4 py-3 font-mono text-xs text-slate transition-colors duration-150 hover:bg-white/[0.05] hover:text-white"
            >
              {copied
                ? <Check className="h-3.5 w-3.5 text-emerald" aria-hidden />
                : <Copy className="h-3.5 w-3.5" aria-hidden />}
              {copied ? "Copied!" : "Copy address"}
            </button>

            {/* Disconnect */}
            <button
              type="button"
              onClick={handleDisconnect}
              className="flex items-center gap-3 border-t border-white/[0.06] px-4 py-3 font-mono text-xs text-blood transition-colors duration-150 hover:bg-blood/[0.08]"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden />
              Disconnect
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
