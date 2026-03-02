"use client";

import { useNavigationStore } from "@/stores/navigationStore";
import { ArrowLeft, X } from "lucide-react";

export function NavigationStack() {
  const { navStack, focusView, popNav, clearNav } = useNavigationStore();

  if (navStack.length === 0 && !focusView) return null;

  return (
    <div className="flex items-center gap-3 px-1 py-3">
      {navStack.length > 0 && (
        <button
          onClick={popNav}
          className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors duration-200 cursor-pointer"
        >
          <ArrowLeft size={14} strokeWidth={2} />
          Back
        </button>
      )}
      {focusView && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-text-primary tracking-wide uppercase">
            {focusView.title}
          </span>
          <span className="text-xs tabular-nums text-text-secondary">
            {focusView.resourceIds.length}
          </span>
          <button
            onClick={clearNav}
            className="ml-2 p-0.5 text-text-secondary hover:text-text-primary transition-colors duration-200 cursor-pointer"
          >
            <X size={12} strokeWidth={2.5} />
          </button>
        </div>
      )}
    </div>
  );
}
