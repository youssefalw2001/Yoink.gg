/**
 * YOINK.GG — Lightweight Wallet Context (ZERO Solana imports)
 *
 * This module provides the wallet context, useWallet() hook, and the
 * WalletProvider shell. It contains NO Solana dependencies — those are
 * lazily loaded from wallet-solana.tsx after initial paint.
 *
 * Result: The Connect/Preview screen renders instantly (~229KB gzip critical
 * path instead of ~341KB). Solana libs (112KB gzip) load in the background.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

// ─── Public interface ────────────────────────────────────────────────────────
export interface WalletState {
  connected:     boolean;
  publicKey:     string | null;
  connecting:    boolean;
  walletBalance: number;
  previewMode:   boolean;
  connect:       () => Promise<void>;
  disconnect:    () => void;
  enterPreview:  () => void;
}

// ─── Context ─────────────────────────────────────────────────────────────────
const WalletCtx = createContext<WalletState | null>(null);

export function useWallet(): WalletState {
  const ctx = useContext(WalletCtx);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}

// ─── Provider ────────────────────────────────────────────────────────────────

/**
 * Lightweight wallet provider that renders children IMMEDIATELY.
 * Solana dependencies load in the background — the app is usable
 * (preview mode, connect screen) without waiting for the heavy chunk.
 */
export function WalletProvider({ children }: { children: ReactNode }) {
  const [previewMode, setPreviewMode] = useState(() => {
    try { return sessionStorage.getItem("yoink_preview") === "1"; } catch { return false; }
  });

  // Wallet state — starts disconnected, updated by Solana bridge when it loads
  const [walletState, setWalletState] = useState<Omit<WalletState, "previewMode" | "enterPreview">>({
    connected: false,
    publicKey: null,
    connecting: false,
    walletBalance: 0,
    connect: async () => {
      // If Solana not loaded yet, this will be replaced when it loads.
      // In the meantime, show a brief loading state.
      setWalletState((s) => ({ ...s, connecting: true }));
    },
    disconnect: () => {},
  });

  // Ref for the Solana bridge to push state updates back to us
  const bridgeRef = useRef<{ update: (state: Partial<WalletState>) => void } | null>(null);
  bridgeRef.current = {
    update: (partial) => {
      setWalletState((prev) => ({ ...prev, ...partial }));
    },
  };

  // Solana bridge component (lazy loaded)
  const [SolanaBridge, setSolanaBridge] = useState<React.ComponentType<{
    children: ReactNode;
    walletCtxRef: React.MutableRefObject<{ update: (state: Partial<WalletState>) => void } | null>;
    previewMode: boolean;
  }> | null>(null);

  // Load Solana bridge in the background after initial paint
  useEffect(() => {
    import("@/lib/wallet-solana").then((m) => {
      setSolanaBridge(() => m.SolanaWalletBridge);
    });
  }, []);

  const enterPreview = useCallback(() => {
    setPreviewMode(true);
    try { sessionStorage.setItem("yoink_preview", "1"); } catch {}
  }, []);

  const disconnect = useCallback(() => {
    setPreviewMode(false);
    try { sessionStorage.removeItem("yoink_preview"); } catch {}
    walletState.disconnect();
  }, [walletState]);

  const value: WalletState = {
    ...walletState,
    connected: walletState.connected || previewMode,
    previewMode,
    enterPreview,
    disconnect,
  };

  // Render the Solana provider tree wrapping children once loaded.
  // Before it loads, children still render with the minimal context above.
  const content = SolanaBridge ? (
    <SolanaBridge walletCtxRef={bridgeRef} previewMode={previewMode}>
      {children}
    </SolanaBridge>
  ) : (
    children
  );

  return <WalletCtx.Provider value={value}>{content}</WalletCtx.Provider>;
}
