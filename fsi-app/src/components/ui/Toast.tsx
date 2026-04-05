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
        setTimeout(onDismiss, 300);
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
        "rounded-lg border text-sm font-medium shadow-lg",
        "transition-all duration-300",
        show ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
      )}
      style={{
        borderColor: variant === "success" ? "var(--color-success)" : "var(--color-error)",
        backgroundColor: "var(--color-surface)",
        color: variant === "success" ? "var(--color-success)" : "var(--color-error)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
      }}
    >
      <Icon size={14} strokeWidth={2.5} />
      {message}
    </div>
  );
}
