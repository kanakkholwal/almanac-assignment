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
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="surface-card w-full max-w-md rounded-sm p-6">
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-eyebrow text-muted-foreground">
            <AlertTriangle className="size-3 text-destructive" />
            Renderer Error
          </div>
          <h1 className="font-sans text-[18px] tracking-tight text-foreground">
            Something went wrong
          </h1>
          <p className="mt-2 font-sans text-[13px] leading-relaxed text-muted-foreground">
            The renderer process crashed. Reload the window to recover.
          </p>

          <pre className="mt-4 max-h-40 overflow-auto rounded-sm border border-hairline bg-canvas-soft p-3 font-mono text-[11px] leading-relaxed text-foreground/80">
            {this.state.error.message}
          </pre>

          <div className="mt-4 flex justify-end">
            <Button onClick={() => window.location.reload()} size="sm" variant="outline">
              <RotateCcw />
              Reload window
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
