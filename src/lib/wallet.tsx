/**
 * YOINK.GG — WalletContext
 *
 * Simulates Phantom wallet connect today.
 *
 * SWAP GUIDE — When real Phantom is ready:
 *   Replace the connect() body with:
 *     const adapter = new PhantomWalletAdapter();
 *     await adapter.connect();
 *     setPublicKey(adapter.publicKey!.toBase58());
 *     const bal = await connection.getBalance(adapter.publicKey!) / 1e9;
 *     setWalletBalance(bal);
 *   Everything else (context shape, gate, WalletButton) stays identical.
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
  connected:     boolean;
  publicKey:     string | null;
  connecting:    boolean;
  /**
   * Wallet SOL balance.
   * Simulation: seeded 0.05–8 SOL (realistic retail distribution).
   * Production: fetched from RPC via getBalance() after connect.
   * Used by the Wallet Balance Gate to warn players entering expensive rooms.
   */
  walletBalance: number;
  connect:       () => Promise<void>;
  disconnect:    () => void;
}

const WalletCtx = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [publicKey,     setPublicKey]     = useState<string | null>(null);
  const [connecting,    setConnecting]    = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);

  const connect = useCallback(async () => {
    if (connecting) return;
    setConnecting(true);
    // Simulation: instant connect — no fake delay.
    // Real Phantom: await adapter.connect() then fetch balance from RPC.
    const bal = +(0.05 + Math.random() * 7.95).toFixed(3);
    setPublicKey(randomWallet());
    setWalletBalance(bal);
    setConnecting(false);
  }, [connecting]);

  const disconnect = useCallback(() => {
    setPublicKey(null);
    setWalletBalance(0);
  }, []);

  return (
    <WalletCtx.Provider
      value={{ connected: !!publicKey, publicKey, connecting, walletBalance, connect, disconnect }}
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
