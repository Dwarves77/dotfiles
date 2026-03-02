"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/cn";

export function BackToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={cn(
        "fixed bottom-6 right-6 z-40",
        "flex items-center justify-center w-10 h-10",
        "rounded-[2px] border border-white/10 bg-[var(--charcoal)]",
        "text-[var(--sage)] hover:text-white hover:border-white/20",
        "transition-all duration-300 cursor-pointer",
        show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"
      )}
      style={{ transitionTimingFunction: "var(--ease-out-expo)" }}
      aria-label="Back to top"
    >
      <ArrowUp size={16} strokeWidth={2} />
    </button>
  );
}
