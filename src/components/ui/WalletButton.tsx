/**
 * WalletButton — connected to WalletContext.
 *
 * ARCHITECTURAL DECISIONS:
 *
 * 1. DISCONNECT REQUIRES CONFIRMATION WHEN PLAYER IS KING.
 *    One-tap disconnect mid-round is a rage-quit trigger. If the player
 *    is currently the king, clicking disconnect shows a confirmation state
 *    with a 2-second hold button before the disconnect fires.
 *    The parent passes `isKing` prop to enable this guard.
 *    Default behaviour (not king): standard one-tap disconnect.
 *
 * 2. DROPDOWN CLOSES ON OUTSIDE CLICK via onBlur.
 *    Standard pattern — no event listeners on document.
 *
 * States:
 *   disconnected → gold "Connect Wallet" button
 *   connecting   → spinner + "Connecting…"
 *   connected    → blink dot + truncated address + chevron → dropdown
 *                  dropdown: copy address | disconnect (or "Disconnect anyway")
 */

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wallet, Check, Copy, LogOut, Loader, ChevronDown, AlertTriangle,
} from "lucide-react";
import { truncateAddress } from "@/lib/utils";
import { useWallet } from "@/lib/wallet";

interface WalletButtonProps {
  /** Pass true if this player is currently the king — enables disconnect guard */
  isKing?: boolean;
}

export function WalletButton({ isKing = false }: WalletButtonProps) {
  const { connected, publicKey, connecting, connect, disconnect } = useWallet();
  const [menuOpen,      setMenuOpen]      = useState(false);
  const [copied,        setCopied]        = useState(false);
  const [confirmDiscon, setConfirmDiscon] = useState(false);
  const menuRef      = useRef<HTMLDivElement>(null);
  const holdTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleCopy() {
    if (!publicKey) return;
    navigator.clipboard.writeText(publicKey).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function handleDisconnectClick() {
    if (isKing && !confirmDiscon) {
      // First click while king: show warning state
      setConfirmDiscon(true);
      // Auto-reset warning after 4s if user doesn't confirm
      holdTimer.current = setTimeout(() => setConfirmDiscon(false), 4000);
      return;
    }
    // Second click (or not king): fire disconnect
    if (holdTimer.current) clearTimeout(holdTimer.current);
    setConfirmDiscon(false);
    setMenuOpen(false);
    disconnect();
  }

  function handleMenuClose() {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    setConfirmDiscon(false);
    setMenuOpen(false);
  }

  function handleBlur(e: React.FocusEvent) {
    if (!menuRef.current?.contains(e.relatedTarget as Node)) {
      handleMenuClose();
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
        onClick={() => { if (!menuOpen) setMenuOpen(true); }}
        whileTap={{ scale: 0.96 }}
        transition={{ duration: 0.14 }}
        className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 font-mono text-[13px] text-white transition-colors duration-150 hover:bg-white/[0.07]"
        style={{ willChange: "transform" }}
        aria-label="Wallet menu"
        aria-expanded={menuOpen}
      >
        {/* Live blink dot */}
        <span className="blink-dot" aria-hidden />
        <span className="text-white/80">{truncateAddress(publicKey!, 4, 4)}</span>
        <ChevronDown
          className="h-3 w-3 text-dim transition-transform duration-200"
          style={{
            transform:  menuOpen ? "rotate(180deg)" : "rotate(0deg)",
            willChange: "transform",
          }}
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
            className="absolute right-0 top-full z-50 mt-2 flex w-52 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[rgba(13,13,24,0.96)] shadow-xl backdrop-blur-xl"
            style={{ willChange: "transform" }}
          >
            {/* Address display */}
            <div className="border-b border-white/[0.06] px-4 py-3">
              <p className="font-mono text-[10px] text-dim">Connected</p>
              <p className="mt-0.5 truncate font-mono text-xs text-white">
                {truncateAddress(publicKey!, 6, 6)}
              </p>
            </div>

            {/* Copy address */}
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-3 px-4 py-3 font-mono text-xs text-slate transition-colors duration-150 hover:bg-white/[0.05] hover:text-white"
            >
              {copied
                ? <Check className="h-3.5 w-3.5 text-emerald" aria-hidden />
                : <Copy className="h-3.5 w-3.5" aria-hidden />
              }
              {copied ? "Copied!" : "Copy address"}
            </button>

            {/* Disconnect — with king guard */}
            <button
              type="button"
              onClick={handleDisconnectClick}
              className={`flex items-start gap-3 border-t border-white/[0.06] px-4 py-3 text-left font-mono text-xs transition-colors duration-150 ${
                confirmDiscon
                  ? "bg-blood/[0.10] text-blood hover:bg-blood/[0.15]"
                  : "text-blood/70 hover:bg-blood/[0.07] hover:text-blood"
              }`}
            >
              <span className="mt-0.5 shrink-0">
                {confirmDiscon
                  ? <AlertTriangle className="h-3.5 w-3.5 text-blood" aria-hidden />
                  : <LogOut className="h-3.5 w-3.5" aria-hidden />
                }
              </span>
              <span>
                {confirmDiscon ? (
                  <>
                    <span className="block font-bold text-blood">Tap again to confirm</span>
                    <span className="block text-[10px] text-blood/70">
                      {isKing
                        ? "You are the King — you will lose your position"
                        : "You will be disconnected"}
                    </span>
                  </>
                ) : (
                  "Disconnect"
                )}
              </span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
