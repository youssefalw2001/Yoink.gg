/**
 * YOINK.GG — WalletContext
 *
 * Simulates Phantom wallet connect today.
 *
 * ARCHITECTURAL DECISIONS:
 *
 * 1. NO FAKE DELAY.
 *    A 600ms fake handshake trains users to expect sub-second wallet connects.
 *    When real Phantom arrives (3-8s on a loaded network), they will
 *    rage-cancel thinking the app froze. connect() is synchronous in
 *    simulation mode. The real Phantom modal provides its own timing UX.
 *
 * 2. INSTANT STATE CHANGE.
 *    We set connected = true immediately on connect(). The app gate fades in.
 *    No artificial latency.
 *
 * SWAP GUIDE — When real Phantom is ready:
 *   Replace the connect() body with:
 *     const adapter = new PhantomWalletAdapter();
 *     await adapter.connect();
 *     setPublicKey(adapter.publicKey!.toBase58());
 *   Everything else (context shape, WalletButton, gate) stays identical.
 */

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { randomWallet } from "@/lib/wallets";

export interface WalletState {
  connected:  boolean;
  publicKey:  string | null;
  connecting: boolean;
  connect:    () => Promise<void>;
  disconnect: () => void;
}

const WalletCtx = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [publicKey,  setPublicKey]  = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const connect = useCallback(async () => {
    if (connecting) return;
    setConnecting(true);
    // Simulation: instant connect — no fake delay.
    // Real Phantom: await adapter.connect() here.
    setPublicKey(randomWallet());
    setConnecting(false);
  }, [connecting]);

  const disconnect = useCallback(() => {
    setPublicKey(null);
  }, []);

  return (
    <WalletCtx.Provider
      value={{
        connected:  !!publicKey,
        publicKey,
        connecting,
        connect,
        disconnect,
      }}
    >
      {children}
    </WalletCtx.Provider>
  );
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletCtx);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}
