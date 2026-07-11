"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/ErrorState";
import { reportClientError } from "@/components/telemetry/GlobalErrorReporter";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // R0.2 error-boundary integration: route render/server-component errors
  // reach this boundary (window.onerror does NOT see them), so report here.
  // The digest ties the client report back to the Vercel server log line.
  useEffect(() => {
    void reportClientError(
      `${error.message}${error.digest ? ` [digest:${error.digest}]` : ""}`,
      error.stack
    );
  }, [error]);

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6">
      <div className="mb-4">
        <h1
          className="text-2xl sm:text-3xl font-bold tracking-tight"
          style={{ color: "var(--color-text-primary)" }}
        >
          Caro&apos;s Ledge
        </h1>
        <p
          className="text-xs font-medium tracking-wide uppercase mt-0.5"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Freight Sustainability Intelligence
        </p>
      </div>

      <ErrorState
        title="Failed to load dashboard data"
        message={
          error.message.includes("fetch")
            ? "Could not connect to the database. Check your network connection and Supabase configuration."
            : `An unexpected error occurred: ${error.message}`
        }
        onRetry={reset}
      />
    </div>
  );
}
