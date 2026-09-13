"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean };

/** Captures React render errors; posts to Sentry when NEXT_PUBLIC_SENTRY_DSN is set. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn) {
      console.error(error, info);
      return;
    }
    try {
      const url = new URL(dsn);
      const publicKey = url.username;
      const projectId = url.pathname.replace(/^\//, "");
      const ingest = `${url.protocol}//${url.host}/api/${projectId}/store/`;
      void fetch(ingest, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=crm-frontend/1.0`,
        },
        body: JSON.stringify({
          event_id: crypto.randomUUID().replace(/-/g, ""),
          timestamp: Date.now() / 1000,
          platform: "javascript",
          level: "error",
          exception: {
            values: [{ type: error.name, value: error.message }],
          },
          extra: { componentStack: info.componentStack },
        }),
      }).catch(() => undefined);
    } catch {
      console.error(error, info);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="max-w-md rounded-xl border border-zinc-200 bg-white p-6 text-center shadow-sm">
            <h1 className="text-lg font-semibold">Something went wrong</h1>
            <p className="mt-2 text-sm text-zinc-600">
              The page crashed. Refresh to continue; the error was logged if monitoring is
              configured.
            </p>
            <button
              type="button"
              className="mt-4 rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white"
              onClick={() => this.setState({ hasError: false })}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
