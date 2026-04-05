"use client";

import { ErrorState } from "@/components/ui/ErrorState";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
