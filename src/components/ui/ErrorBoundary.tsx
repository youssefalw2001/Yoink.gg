/**
 * ErrorBoundary — catches render crashes so a bug shows a readable message
 * instead of a blank page (the Phantom in-app browser symptom). Without this,
 * any uncaught error in the tree leaves only the body background visible.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface for debugging in the (in-app) browser console.
    // eslint-disable-next-line no-console
    console.error("YOINK.GG crashed:", error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: "100dvh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: 24,
            textAlign: "center",
            background: "#08080f",
            color: "#eef1f6",
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          <div style={{ fontSize: 13, letterSpacing: "0.2em", textTransform: "uppercase", color: "#FFD700" }}>
            Something broke
          </div>
          <div style={{ maxWidth: 420, fontSize: 12, color: "#8892a4", wordBreak: "break-word" }}>
            {this.state.error.message || "An unexpected error occurred."}
          </div>
          <button
            type="button"
            onClick={() => { this.setState({ error: null }); location.reload(); }}
            style={{
              marginTop: 8,
              padding: "10px 20px",
              borderRadius: 12,
              border: "1px solid rgba(255,215,0,0.4)",
              background: "rgba(255,215,0,0.1)",
              color: "#FFD700",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
