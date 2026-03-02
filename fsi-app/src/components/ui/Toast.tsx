"use client";

import { cn } from "@/lib/cn";
import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";

interface ToastProps {
  message: string;
  visible: boolean;
  onDismiss: () => void;
  duration?: number;
  variant?: "success" | "error";
}

export function Toast({
  message,
  visible,
  onDismiss,
  duration = 3000,
  variant = "success",
}: ToastProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (visible) {
      setShow(true);
      const timer = setTimeout(() => {
        setShow(false);
        setTimeout(onDismiss, 400);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [visible, duration, onDismiss]);

  if (!visible) return null;

  const Icon = variant === "success" ? Check : X;

  return (
    <div
      className={cn(
        "fixed bottom-6 right-6 z-50",
        "flex items-center gap-2 px-4 py-3",
        "rounded-[2px] border text-sm font-medium",
        "transition-all duration-400",
        show
          ? "translate-y-0 opacity-100"
          : "translate-y-2 opacity-0",
        variant === "success"
          ? "border-white/10 bg-[var(--charcoal)] text-white"
          : "border-[var(--critical)]/30 bg-[var(--charcoal)] text-[var(--critical)]"
      )}
      style={{ transitionTimingFunction: "var(--ease-out-expo)" }}
    >
      <Icon size={14} strokeWidth={2.5} />
      {message}
    </div>
  );
}
