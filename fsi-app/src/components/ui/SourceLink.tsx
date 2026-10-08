"use client";

/**
 * SourceLink: the one underlined, 28 px source-name link used on a fact's provenance line (lane S8-F2,
 * 2026-10-08). It was typed inline in FactCard's matrix card, and the Operations statements block needed
 * the same anchor; a second copy tripped F45 (duplicate code), so both import this.
 */

import type { ReactNode } from "react";

export function SourceLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 28,
        color: "var(--ink-2)",
        textDecoration: "underline",
        textDecorationColor: "var(--link-line)",
      }}
    >
      {children}
    </a>
  );
}
