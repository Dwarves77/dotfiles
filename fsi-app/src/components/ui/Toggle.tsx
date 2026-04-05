"use client";

import { cn } from "@/lib/cn";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  className?: string;
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  className,
}: ToggleProps) {
  return (
    <label
      className={cn(
        "flex items-center justify-between gap-3 cursor-pointer group",
        className
      )}
    >
      {(label || description) && (
        <div className="flex flex-col gap-0.5">
          {label && (
            <span className="text-sm font-medium text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)] transition-colors duration-200">
              {label}
            </span>
          )}
          {description && (
            <span className="text-xs text-[var(--color-text-secondary)]">{description}</span>
          )}
        </div>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center",
          "rounded-full border transition-all duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]",
          checked
            ? "border-[var(--color-primary)]/30 bg-[var(--color-primary)]/15"
            : "border-[var(--color-border)] bg-[var(--color-surface-overlay)]"
        )}
      >
        <span
          className={cn(
            "inline-block h-3.5 w-3.5 rounded-full transition-all duration-200",
            checked
              ? "translate-x-[18px] bg-[var(--color-primary)]"
              : "translate-x-[3px] bg-[var(--color-text-disabled)]"
          )}
        />
      </button>
    </label>
  );
}
