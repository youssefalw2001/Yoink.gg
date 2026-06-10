/**
 * YOINK.GG — Wallet Context
 *
 * Simulates Phantom wallet connect today.
 * When real Phantom is ready, replace the connect() body with:
 *   const { publicKey, connect } = useWallet(); // @solana/wallet-adapter-react
 * Everything else stays the same.
 *
 * State:
 *   connected   — boolean
 *   publicKey   — base58 string | null
 *   connecting  — spinner state during handshake
 *   connect()   — opens wallet (today: generates a simulated key after 600ms)
 *   disconnect()
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
    setConnecting(true);
    // Simulate 600ms wallet handshake — swap for real Phantom later
    await new Promise<void>((r) => setTimeout(r, 600));
    setPublicKey(randomWallet());
    setConnecting(false);
  }, []);

  const disconnect = useCallback(() => {
    setPublicKey(null);
  }, []);

  return (
    <WalletCtx.Provider
      value={{ connected: !!publicKey, publicKey, connecting, connect, disconnect }}
    >
      {children}
    </WalletCtx.Provider>
  );
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletCtx);
  if (!ctx) throw new Error("useWallet must be inside <WalletProvider>");
  return ctx;
}
