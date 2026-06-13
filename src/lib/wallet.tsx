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
 * CONNECT STRATEGY: connect DIRECTLY to the detected wallet (Phantom is the
 * injected wallet inside its own in-app browser, so the modal is unreliable
 * there). The wallet-adapter modal is only a fallback when no wallet is
 * detected (e.g. desktop without an extension → shows install links).
 *
 * IMPORTANT: gameplay stakes are still simulated. No SOL leaves the wallet.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
import { WalletReadyState } from "@solana/wallet-adapter-base";
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

const isReady = (rs: WalletReadyState) =>
  rs === WalletReadyState.Installed || rs === WalletReadyState.Loadable;

/** Bridges the real wallet adapter to the app's legacy useWallet() shape. */
function WalletBridge({ children }: { children: ReactNode }) {
  const {
    publicKey, connected, connecting, wallet, wallets,
    select, connect: adapterConnect, disconnect: adapterDisconnect,
  } = useAdapterWallet();
  const { setVisible } = useWalletModal();
  const [walletBalance, setWalletBalance] = useState(0);

  // Set when the user pressed Connect, so the effect below finishes the
  // connection once a wallet has been selected.
  const wantConnect = useRef(false);

  const pkStr = publicKey ? publicKey.toBase58() : null;

  // Fetch + poll the real on-chain balance while connected.
  useEffect(() => {
    if (!pkStr) { setWalletBalance(0); return; }
    let active = true;
    const pk = new PublicKey(pkStr);
    const fetchBalance = async () => {
      try {
        const lamports = await connection.getBalance(pk);
        if (active) setWalletBalance(+(lamports / LAMPORTS_PER_SOL).toFixed(4));
      } catch { /* RPC hiccup — keep last known balance */ }
    };
    fetchBalance();
    const id = setInterval(fetchBalance, 20_000);
    return () => { active = false; clearInterval(id); };
  }, [pkStr]);

  // Finish the connect once a wallet is selected (select() is async to settle).
  useEffect(() => {
    if (wantConnect.current && wallet && !connected && !connecting) {
      wantConnect.current = false;
      adapterConnect().catch(() => setVisible(true));
    }
  }, [wallet, connected, connecting, adapterConnect, setVisible]);

  const connect = useCallback(async () => {
    if (connected) return;
    // A wallet is already selected → just connect it.
    if (wallet) {
      try { await adapterConnect(); } catch { setVisible(true); }
      return;
    }
    // Pick the best detected wallet (prefer Phantom), then connect.
    const phantom = wallets.find((w) => w.adapter.name === "Phantom" && isReady(w.readyState));
    const anyReady = wallets.find((w) => isReady(w.readyState));
    const pick = phantom ?? anyReady;
    if (pick) {
      wantConnect.current = true;
      select(pick.adapter.name); // selection triggers the connect effect
    } else {
      // No wallet detected (e.g. desktop w/o extension) → modal w/ install links.
      setVisible(true);
    }
  }, [connected, wallet, wallets, select, adapterConnect, setVisible]);

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
  // themselves automatically (and are detected for direct connect).
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
