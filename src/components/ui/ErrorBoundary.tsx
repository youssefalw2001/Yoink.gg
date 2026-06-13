/**
 * ErrorBoundary — catches render crashes so a bug shows a readable message
 * instead of a blank page (the Phantom in-app browser symptom). Without this,
 * any uncaught error in the tree leaves only the body background visible.
 *
 * DIAGNOSTIC MODE: shows the error message, the originating component stack,
 * and the raw stack trace, with a one-tap "Copy details" button. This makes
 * production-only crashes (e.g. a minified ".slice of undefined") traceable
 * without browser devtools — critical for debugging the in-app wallet browser.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props { children: ReactNode; }
interface State { error: Error | null; componentStack: string | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info?.componentStack ?? null });
    // eslint-disable-next-line no-console
    console.error("YOINK.GG crashed:", error, info?.componentStack);
  }

  private details(): string {
    const { error, componentStack } = this.state;
    return [
      `Message: ${error?.message ?? "unknown"}`,
      ``,
      `Stack:`,
      error?.stack ?? "(no stack)",
      ``,
      `Component stack:`,
      componentStack ?? "(no component stack)",
    ].join("\n");
  }

  render() {
    if (this.state.error) {
      const { error, componentStack } = this.state;
      // First meaningful frame of the component stack — names the culprit.
      const culprit = (componentStack ?? "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)[0] ?? "";

      return (
        <div
          style={{
            minHeight: "100dvh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-start",
            gap: 14,
            padding: 24,
            paddingTop: 48,
            textAlign: "center",
            background: "#08080f",
            color: "#eef1f6",
            fontFamily: "'JetBrains Mono', monospace",
            overflowY: "auto",
          }}
        >
          <div style={{ fontSize: 13, letterSpacing: "0.2em", textTransform: "uppercase", color: "#FFD700" }}>
            Something broke
          </div>

          <div style={{ maxWidth: 460, fontSize: 12, color: "#FF6B6B", wordBreak: "break-word" }}>
            {error?.message || "An unexpected error occurred."}
          </div>

          {culprit && (
            <div style={{ maxWidth: 460, fontSize: 11, color: "#00E676", wordBreak: "break-word" }}>
              Crashed in: {culprit}
            </div>
          )}

          <pre
            style={{
              maxWidth: 460,
              maxHeight: 220,
              overflow: "auto",
              textAlign: "left",
              fontSize: 10,
              lineHeight: 1.5,
              color: "#8892a4",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 12,
              padding: 12,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {componentStack ?? error?.stack ?? ""}
          </pre>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(this.details()).catch(() => {});
              }}
              style={{
                padding: "10px 18px",
                borderRadius: 12,
                border: "1px solid rgba(0,230,118,0.4)",
                background: "rgba(0,230,118,0.1)",
                color: "#00E676",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Copy details
            </button>
            <button
              type="button"
              onClick={() => { this.setState({ error: null, componentStack: null }); location.reload(); }}
              style={{
                padding: "10px 18px",
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
        </div>
      );
    }
    return this.props.children;
  }
}
