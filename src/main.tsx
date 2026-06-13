import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { WalletProvider } from "@/lib/wallet.tsx";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

// NOTE: @solana/wallet-adapter-react-ui/styles.css is imported inside
// wallet-solana.tsx (lazy loaded) — NOT here. This keeps the Solana chunk
// out of the critical rendering path for faster first paint.

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <WalletProvider>
        <App />
      </WalletProvider>
    </ErrorBoundary>
  </StrictMode>,
);
