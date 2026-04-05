"use client";

import { cn } from "@/lib/cn";
import { type ButtonHTMLAttributes, forwardRef } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--color-invert-bg)] text-[var(--color-invert-text)] border-transparent hover:opacity-90 active:opacity-80",
  secondary:
    "border-[var(--color-border)] text-[var(--color-text-primary)] bg-transparent hover:bg-[var(--color-surface-raised)]",
  ghost:
    "border-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-overlay)] hover:text-[var(--color-text-primary)]",
  danger:
    "border-[var(--color-error)]/30 text-[var(--color-error)] hover:bg-[var(--color-error)] hover:text-white",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "secondary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2",
          "rounded-md border font-medium",
          "transition-all duration-200",
          "cursor-pointer disabled:cursor-not-allowed disabled:opacity-40",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-2",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
