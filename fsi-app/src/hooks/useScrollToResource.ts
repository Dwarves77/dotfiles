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
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 80);
    } else if (!resourceId) {
      prevId.current = null;
    }
  }, [resourceId]);
}
