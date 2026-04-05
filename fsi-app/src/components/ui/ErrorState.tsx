"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "./Button";

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = "Something went wrong",
  message = "We couldn't load this data. Check your connection and try again.",
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
        style={{ backgroundColor: "rgba(220, 38, 38, 0.08)" }}
      >
        <AlertTriangle size={24} style={{ color: "var(--color-error)" }} />
      </div>
      <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
        {title}
      </h3>
      <p className="text-xs mt-1 max-w-sm" style={{ color: "var(--color-text-secondary)" }}>
        {message}
      </p>
      {onRetry && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          className="mt-4"
        >
          <RefreshCw size={12} />
          Try again
        </Button>
      )}
    </div>
  );
}
