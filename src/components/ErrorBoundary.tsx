import type { ReactNode } from "react";
import { Component } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: unknown) {
    console.error("Renderer error boundary captured an error", error, errorInfo);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="surface-ambient flex min-h-screen items-center justify-center p-6">
        <div className="glass-panel w-full max-w-md rounded-2xl p-6">
          <div className="flex items-center gap-3">
            <div
              aria-hidden
              className="flex size-9 items-center justify-center rounded-lg bg-destructive/15 text-destructive"
            >
              <AlertTriangle className="size-4" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-semibold tracking-tight">
                Something went wrong
              </h1>
              <p className="mt-0.5 text-xs text-muted-foreground">
                The renderer process crashed. You can reload the window to recover.
              </p>
            </div>
          </div>

          <pre className="mt-4 max-h-40 overflow-auto rounded-lg border border-border bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-destructive-foreground/90">
            {this.state.error.message}
          </pre>

          <div className="mt-4 flex justify-end">
            <Button onClick={() => window.location.reload()} size="sm">
              <RotateCcw />
              Reload window
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
