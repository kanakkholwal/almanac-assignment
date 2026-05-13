import type { ReactNode } from "react";
import { Component } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: unknown) {
    console.error("Renderer error boundary captured an error", error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#160d1d] p-6 text-surface-ink">
          <div className="glass-panel max-w-lg rounded-[1.75rem] p-6">
            <h1 className="text-xl font-semibold">Almanac hit a renderer error</h1>
            <p className="mt-3 text-sm leading-6 text-surface-muted">
              The UI crashed gracefully. You can reload the app window or restart the desktop app.
            </p>
            <pre className="mt-4 overflow-auto rounded-2xl bg-black/20 p-4 text-xs text-rose-100">
              {this.state.error.message}
            </pre>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
