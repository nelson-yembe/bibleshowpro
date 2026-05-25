import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-3 bg-[#06080d] p-6 text-center">
          <p className="text-sm font-semibold text-[var(--color-foreground)]">Something went wrong</p>
          <p className="max-w-md text-xs text-[var(--color-muted-foreground)]">
            {this.state.error.message || "An unexpected error occurred."}
          </p>
          <button
            type="button"
            onClick={() => {
              this.setState({ error: null });
              window.location.href = "/";
            }}
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold text-white"
          >
            Return to Dashboard
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
