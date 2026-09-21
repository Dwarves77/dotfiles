"use client";

/**
 * PartsList: the /admin/parts index body (lane w10-factcard-b, 2026-09-20; Amendment 1
 * section B.2). One row per registered part, linking to its own /admin/parts/<slug> sign-off page.
 * Uses SectionCard for the shell so a page.tsx never retypes the card-shell literal (F42/F49).
 */
import Link from "next/link";
import { SectionCard } from "@/components/ui/SectionCard";

export interface PartEntry {
  slug: string;
  name: string;
  summary: string;
}

export function PartsList({ parts }: { parts: PartEntry[] }) {
  return (
    <SectionCard padding={0} dataAudit="admin-parts-list">
      {parts.map((p, i) => (
        <Link
          key={p.slug}
          href={`/admin/parts/${p.slug}`}
          style={{
            display: "block",
            padding: "16px 20px",
            borderBottom: i < parts.length - 1 ? "1px solid var(--color-border-subtle)" : "none",
            textDecoration: "none",
            color: "inherit",
            minHeight: 44,
          }}
        >
          <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: "0 0 4px" }}>{p.name}</p>
          <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--text-2)", margin: 0, maxWidth: "72ch" }}>{p.summary}</p>
        </Link>
      ))}
    </SectionCard>
  );
}
