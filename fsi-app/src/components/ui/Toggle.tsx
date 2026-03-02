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
            <span className="text-sm font-medium text-text-primary group-hover:text-text-accent transition-colors duration-300">
              {label}
            </span>
          )}
          {description && (
            <span className="text-xs text-text-secondary">{description}</span>
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
          "rounded-full border transition-all duration-300",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--cyan)]/50",
          checked
            ? "border-[var(--cyan)]/30 bg-[var(--cyan)]/20"
            : "border-border-light bg-surface-overlay"
        )}
        style={{ transitionTimingFunction: "var(--ease-out-expo)" }}
      >
        <span
          className={cn(
            "inline-block h-3.5 w-3.5 rounded-full transition-all duration-300",
            checked
              ? "translate-x-[18px] bg-[var(--cyan)]"
              : "translate-x-[3px] bg-[var(--sage)]/50"
          )}
          style={{ transitionTimingFunction: "var(--ease-out-expo)" }}
        />
      </button>
    </label>
  );
}
