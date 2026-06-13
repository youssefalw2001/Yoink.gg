/**
 * YOINK.GG — Solana Wallet Bridge (HEAVY — dynamically imported)
 *
 * This module contains ALL Solana dependencies (@solana/web3.js, wallet adapters).
 * It is NOT in the critical path — loaded lazily after initial paint so the
 * Connect/Preview screen appears instantly without waiting for 365KB of Solana code.
 *
 * Exported as a React component tree that provides the real wallet context.
 */

import {
  useCallback,
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
import type { WalletState } from "@/lib/wallet";

// Import the adapter UI styles here (only loaded when this module loads)
import "@solana/wallet-adapter-react-ui/styles.css";

const isReady = (rs: WalletReadyState) =>
  rs === WalletReadyState.Installed || rs === WalletReadyState.Loadable;

interface BridgeProps {
  children: ReactNode;
  walletCtxRef: React.MutableRefObject<{
    update: (state: Partial<WalletState>) => void;
  } | null>;
  previewMode: boolean;
}

/**
 * Inner bridge that talks to the real Solana wallet adapter and
 * pushes state updates back to the lightweight WalletProvider context.
 */
function WalletBridgeInner({ children, walletCtxRef, previewMode }: BridgeProps) {
  const {
    publicKey, connected, connecting, wallet, wallets,
    select, connect: adapterConnect, disconnect: adapterDisconnect,
  } = useAdapterWallet();
  const { setVisible } = useWalletModal();
  const [walletBalance, setWalletBalance] = useState(0);
  const wantConnect = useRef(false);

  const pkStr = publicKey ? publicKey.toBase58() : null;

  // Fetch + poll real on-chain balance
  useEffect(() => {
    if (!pkStr) { setWalletBalance(0); return; }
    let active = true;
    const pk = new PublicKey(pkStr);
    const fetchBalance = async () => {
      try {
        const lamports = await connection.getBalance(pk);
        if (active) setWalletBalance(+(lamports / LAMPORTS_PER_SOL).toFixed(4));
      } catch { /* RPC hiccup */ }
    };
    fetchBalance();
    const id = setInterval(fetchBalance, 20_000);
    return () => { active = false; clearInterval(id); };
  }, [pkStr]);

  // Finish connect once wallet selected
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
    adapterDisconnect().catch(() => {});
  }, [adapterDisconnect]);

  // Push state back to the lightweight context provider
  useEffect(() => {
    walletCtxRef.current?.update({
      connected: connected || previewMode,
      publicKey: pkStr,
      connecting,
      walletBalance,
      connect,
      disconnect,
    });
  }, [connected, pkStr, connecting, walletBalance, previewMode, connect, disconnect, walletCtxRef]);

  return <>{children}</>;
}

interface SolanaBridgeProps {
  children: ReactNode;
  walletCtxRef: React.MutableRefObject<{
    update: (state: Partial<WalletState>) => void;
  } | null>;
  previewMode: boolean;
}

/**
 * Full Solana provider stack. Lazy-loaded — NOT in the initial bundle.
 */
export function SolanaWalletBridge({ children, walletCtxRef, previewMode }: SolanaBridgeProps) {
  const wallets = useMemo(() => [], []);

  return (
    <ConnectionProvider endpoint={RPC_ENDPOINT}>
      <AdapterWalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <WalletBridgeInner walletCtxRef={walletCtxRef} previewMode={previewMode}>
            {children}
          </WalletBridgeInner>
        </WalletModalProvider>
      </AdapterWalletProvider>
    </ConnectionProvider>
  );
}
