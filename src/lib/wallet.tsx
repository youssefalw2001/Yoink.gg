/**
 * YOINK.GG — WalletContext (REAL wallet, devnet)
 *
 * Connects a real Solana wallet (Phantom / Solflare / any Wallet-Standard
 * wallet) and reads the real on-chain balance. These actions move ZERO funds.
 *
 * useWallet() returns
 *   { connected, publicKey, connecting, walletBalance, previewMode,
 *     connect, disconnect, enterPreview, exitPreview }
 *
 * PREVIEW MODE: grants full app access without a wallet connection, entered from
 * the landing screen via "Preview without connecting". Because all gameplay is
 * simulated regardless, a guest gets the real experience — there is simply no
 * wallet attached, so `publicKey` is null and `walletBalance` is 0. Connecting a
 * real wallet exits preview automatically; the two are mutually exclusive.
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
  /**
   * Guest state: the visitor is exploring the app WITHOUT a connected wallet.
   * All gameplay is simulated either way, so preview mode grants the full app
   * surface — it simply never has a wallet attached. Mutually exclusive with
   * `connected`: connecting a real wallet exits preview automatically.
   */
  previewMode:   boolean;
  connect:       () => Promise<void>;
  disconnect:    () => void;
  /** Enter guest/preview mode without connecting a wallet. */
  enterPreview:  () => void;
  /** Leave preview mode (back to the landing gate). */
  exitPreview:   () => void;
}

const WalletCtx = createContext<WalletState | null>(null);

const isReady = (rs: WalletReadyState) =>
  rs === WalletReadyState.Installed || rs === WalletReadyState.Loadable;

// ── Preview-mode persistence ─────────────────────────────────────────────────
// Guarded like every other storage read in the app: private mode and blocked
// storage must degrade to "not in preview", never throw on mount.
const PREVIEW_KEY = "yoink_preview_v1";

function loadPreview(): boolean {
  try {
    return localStorage.getItem(PREVIEW_KEY) === "1";
  } catch {
    return false;
  }
}

function savePreview(on: boolean): void {
  try {
    if (on) localStorage.setItem(PREVIEW_KEY, "1");
    else localStorage.removeItem(PREVIEW_KEY);
  } catch { /* ignore */ }
}

/** Bridges the real wallet adapter to the app's useWallet() shape. */
function WalletBridge({ children }: { children: ReactNode }) {
  const {
    publicKey, connected, connecting, wallet, wallets,
    select, connect: adapterConnect, disconnect: adapterDisconnect,
  } = useAdapterWallet();
  const { setVisible } = useWalletModal();
  const [walletBalance, setWalletBalance] = useState(0);
  // Persisted so a guest who reloads (or reopens the PWA) is not thrown back to
  // the gate while their vault, XP and referral ledger are all still on disk.
  const [previewMode, setPreviewMode] = useState<boolean>(loadPreview);

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
    // Skip polling while the tab is hidden — an idle background tab hammering RPC
    // every 20s wastes the user's bandwidth and our rate limit for a number
    // nobody can see. Refetch immediately on return so the balance is never stale
    // at the moment it actually matters.
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void fetchBalance();
    }, 20_000);
    const onVisible = () => { if (!document.hidden) void fetchBalance(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
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
    // Mark intent to connect FIRST, so the effect above completes the
    // connection once a wallet is selected — whether that happens via our
    // direct pick OR via the user choosing one in the wallet-adapter modal.
    // (Previously the modal path never set this flag, so picking Phantom in
    // the modal selected it but never actually connected → stuck on connect.)
    wantConnect.current = true;
    if (wallet) {
      try { await adapterConnect(); } catch { setVisible(true); }
      return;
    }
    const phantom = wallets.find((w) => w.adapter.name === "Phantom" && isReady(w.readyState));
    const anyReady = wallets.find((w) => isReady(w.readyState));
    const pick = phantom ?? anyReady;
    if (pick) {
      select(pick.adapter.name);
    } else {
      setVisible(true);
    }
  }, [connected, wallet, wallets, select, adapterConnect, setVisible]);

  const disconnect = useCallback(() => {
    adapterDisconnect().catch(() => {});
  }, [adapterDisconnect]);

  const enterPreview = useCallback(() => { setPreviewMode(true); savePreview(true); }, []);
  const exitPreview  = useCallback(() => { setPreviewMode(false); savePreview(false); }, []);

  // A real connection always supersedes preview mode, so the two can never be
  // reported as active at once.
  useEffect(() => {
    if (connected) { setPreviewMode(false); savePreview(false); }
  }, [connected]);

  const value: WalletState = {
    connected,
    publicKey: pkStr,
    connecting,
    walletBalance,
    // Never both: `connected` wins if the effect above has not run yet.
    previewMode: previewMode && !connected,
    connect,
    disconnect,
    enterPreview,
    exitPreview,
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
