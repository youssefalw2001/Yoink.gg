/**
 * YOINK.GG — WalletContext (REAL wallet, devnet)
 *
 * Connects a real Solana wallet (Phantom / Solflare / any Wallet-Standard
 * wallet) and reads the real on-chain balance. These actions move ZERO funds.
 *
 * The app's existing surface — useWallet() returning
 *   { connected, publicKey, connecting, walletBalance, connect, disconnect }
 * — is preserved exactly, so every consumer keeps working unchanged.
 *
 * IMPORTANT: gameplay stakes are still simulated. No SOL leaves the wallet.
 * Real-money staking/payouts require the deployed, audited on-chain program
 * (see solana/programs/kings-bag). Do not wire gameplay transactions to
 * mainnet until that program is live and audited.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { PublicKey } from "@solana/web3.js";
import {
  ConnectionProvider,
  WalletProvider as AdapterWalletProvider,
  useWallet as useAdapterWallet,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider, useWalletModal } from "@solana/wallet-adapter-react-ui";
import { RPC_ENDPOINT, connection, LAMPORTS_PER_SOL } from "@/lib/solana";

export interface WalletState {
  connected:     boolean;
  publicKey:     string | null;
  connecting:    boolean;
  /** Real on-chain SOL balance, fetched via RPC after connect. */
  walletBalance: number;
  connect:       () => Promise<void>;
  disconnect:    () => void;
}

const WalletCtx = createContext<WalletState | null>(null);

/** Bridges the real wallet adapter to the app's legacy useWallet() shape. */
function WalletBridge({ children }: { children: ReactNode }) {
  const { publicKey, connected, connecting, disconnect: adapterDisconnect } = useAdapterWallet();
  const { setVisible } = useWalletModal();
  const [walletBalance, setWalletBalance] = useState(0);

  const pkStr = publicKey ? publicKey.toBase58() : null;

  // Fetch + poll the real on-chain balance while connected.
  useEffect(() => {
    if (!pkStr) {
      setWalletBalance(0);
      return;
    }
    let active = true;
    const pk = new PublicKey(pkStr);
    const fetchBalance = async () => {
      try {
        const lamports = await connection.getBalance(pk);
        if (active) setWalletBalance(+(lamports / LAMPORTS_PER_SOL).toFixed(4));
      } catch {
        /* RPC hiccup — keep last known balance */
      }
    };
    fetchBalance();
    const id = setInterval(fetchBalance, 20_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [pkStr]);

  // Open the wallet modal (Phantom / Solflare / etc.)
  const connect = useCallback(async () => {
    setVisible(true);
  }, [setVisible]);

  const disconnect = useCallback(() => {
    adapterDisconnect().catch(() => {});
  }, [adapterDisconnect]);

  const value: WalletState = {
    connected,
    publicKey: pkStr,
    connecting,
    walletBalance,
    connect,
    disconnect,
  };

  return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  // Empty array — Phantom, Solflare and other Wallet-Standard wallets register
  // themselves automatically and appear in the modal when installed.
  const wallets = useMemo(() => [], []);

  return (
    <ConnectionProvider endpoint={RPC_ENDPOINT}>
      <AdapterWalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <WalletBridge>{children}</WalletBridge>
        </WalletModalProvider>
      </AdapterWalletProvider>
    </ConnectionProvider>
  );
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletCtx);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}
