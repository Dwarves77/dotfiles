"use client";

import { cn } from "@/lib/cn";
import { type ButtonHTMLAttributes, forwardRef } from "react";

type ButtonVariant = "default" | "outline" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantStyles: Record<ButtonVariant, string> = {
  default:
    "border-border-medium text-text-primary hover:bg-invert-bg hover:text-invert-text active:opacity-90",
  outline:
    "border-[var(--sage)]/30 text-text-secondary hover:border-[var(--sage)] hover:text-text-primary",
  ghost:
    "border-transparent text-text-secondary hover:bg-surface-overlay hover:text-text-primary",
  danger:
    "border-[var(--critical)]/30 text-[var(--critical)] hover:bg-[var(--critical)] hover:text-text-primary",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-1 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2",
          "rounded-[2px] border font-medium",
          "transition-all duration-400",
          "cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--cyan)]/50",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        style={{ transitionTimingFunction: "var(--ease-out-expo)" }}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
