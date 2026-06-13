/**
 * YOINK.GG — WalletContext (REAL wallet, devnet)
 *
 * Connects a real Solana wallet (Phantom / Solflare / any Wallet-Standard
 * wallet) and reads the real on-chain balance. These actions move ZERO funds.
 *
 * The app's existing surface — useWallet() returning
 *   { connected, publicKey, connecting, walletBalance, previewMode, connect, disconnect, enterPreview }
 * — is preserved exactly, so every consumer keeps working unchanged.
 *
 * PREVIEW MODE: allows full app access without a wallet connection.
 * All gameplay remains simulated. Entered via "Skip — preview the app".
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
import "@solana/wallet-adapter-react-ui/styles.css";
import { RPC_ENDPOINT, connection, LAMPORTS_PER_SOL } from "@/lib/solana";

export interface WalletState {
  connected:     boolean;
  publicKey:     string | null;
  connecting:    boolean;
  /** Real on-chain SOL balance, fetched via RPC after connect. */
  walletBalance: number;
  /** Preview mode — app is accessible without a real wallet connection. */
  previewMode:   boolean;
  connect:       () => Promise<void>;
  disconnect:    () => void;
  /** Enter preview mode (bypasses wallet gate, simulated stakes only). */
  enterPreview:  () => void;
}

const WalletCtx = createContext<WalletState | null>(null);

const isReady = (rs: WalletReadyState) =>
  rs === WalletReadyState.Installed || rs === WalletReadyState.Loadable;

/** Bridges the real wallet adapter to the app's useWallet() shape. */
function WalletBridge({ children }: { children: ReactNode }) {
  const {
    publicKey, connected, connecting, wallet, wallets,
    select, connect: adapterConnect, disconnect: adapterDisconnect,
  } = useAdapterWallet();
  const { setVisible } = useWalletModal();
  const [walletBalance, setWalletBalance] = useState(0);
  const [previewMode, setPreviewMode] = useState(() => {
    try { return sessionStorage.getItem("yoink_preview") === "1"; } catch { return false; }
  });

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

  // Finish the connect once a wallet is selected.
  useEffect(() => {
    if (wantConnect.current && wallet && !connected && !connecting) {
      wantConnect.current = false;
      adapterConnect().catch(() => setVisible(true));
    }
  }, [wallet, connected, connecting, adapterConnect, setVisible]);

  const connect = useCallback(async () => {
    if (connected) return;
    if (wallet) {
      try { await adapterConnect(); } catch { setVisible(true); }
      return;
    }
    const phantom = wallets.find((w) => w.adapter.name === "Phantom" && isReady(w.readyState));
    const anyReady = wallets.find((w) => isReady(w.readyState));
    const pick = phantom ?? anyReady;
    if (pick) {
      wantConnect.current = true;
      select(pick.adapter.name);
    } else {
      setVisible(true);
    }
  }, [connected, wallet, wallets, select, adapterConnect, setVisible]);

  const disconnect = useCallback(() => {
    setPreviewMode(false);
    try { sessionStorage.removeItem("yoink_preview"); } catch {}
    adapterDisconnect().catch(() => {});
  }, [adapterDisconnect]);

  const enterPreview = useCallback(() => {
    setPreviewMode(true);
    try { sessionStorage.setItem("yoink_preview", "1"); } catch {}
  }, []);

  const value: WalletState = {
    connected: connected || previewMode,
    publicKey: pkStr ?? (previewMode ? "PREViEW00000000000000000000000000000000000" : null),
    connecting,
    walletBalance: previewMode && !pkStr ? 0 : walletBalance,
    previewMode,
    connect,
    disconnect,
    enterPreview,
  };

  return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>;
}

export function WalletProvider({ children }: { children: ReactNode }) {
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
