"use client";

import { useEffect, useRef } from "react";

export function useScrollToResource(resourceId: string | null) {
  const prevId = useRef<string | null>(null);

  useEffect(() => {
    if (resourceId && resourceId !== prevId.current) {
      prevId.current = resourceId;
      setTimeout(() => {
        const el = document.getElementById(`resource-${resourceId}`);
        if (el) {
          // Account for sticky header + filter bar (~160px)
          const y = el.getBoundingClientRect().top + window.scrollY - 160;
          window.scrollTo({ top: y, behavior: "smooth" });
        }
      }, 100);
    } else if (!resourceId) {
      prevId.current = null;
    }
  }, [resourceId]);
}
