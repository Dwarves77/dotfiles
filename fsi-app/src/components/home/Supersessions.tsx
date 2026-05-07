"use client";

import Link from "next/link";
import type { Resource, Supersession } from "@/types/resource";

interface SupersessionsProps {
  supersessions: Supersession[];
  resourceMap: Map<string, Resource>;
}

/** Trim a long title to a short ID-like label for the strip card.
 *  The supersession seed already includes oldTitle/newTitle as the
 *  human-friendly short labels (e.g. "MEPC.304(72)") — fall back to
 *  the resource title only when oldTitle/newTitle is missing. */
function shortLabel(raw: string | undefined, fallback: string | undefined, id: string): string {
  const candidate = (raw && raw.trim()) || (fallback && fallback.trim()) || id;
  if (candidate.length > 32) return candidate.slice(0, 30).trim() + "…";
  return candidate;
}

export function Supersessions({ supersessions, resourceMap }: SupersessionsProps) {
  if (supersessions.length === 0) return null;

  const cards = supersessions.slice(0, 10);

  return (
    <div
      className="cl-rep-row"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        gap: 10,
      }}
    >
      <style>{`
        @media (max-width: 900px) { .cl-rep-row { grid-template-columns: repeat(2, 1fr) !important; } }
        @media (max-width: 480px) { .cl-rep-row { grid-template-columns: 1fr !important; } }
      `}</style>
      {cards.map((s, i) => {
        const oldR = resourceMap.get(s.old);
        const newR = resourceMap.get(s.new);
        const oldLabel = shortLabel(s.oldTitle, oldR?.title, s.old);
        const newLabel = shortLabel(s.newTitle, newR?.title, s.new);
        const dateLabel = s.date ? s.date.slice(0, 7) : "";
        const successorHref = newR ? `/regulations/${s.new}` : null;
        const card = (
          <div
            style={{
              background: "var(--color-bg-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              padding: "12px 14px",
              position: "relative",
              boxShadow: "var(--shadow-card)",
              height: "100%",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 10,
                right: 12,
                color: "var(--color-text-muted)",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              →
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "var(--color-text-primary)",
                lineHeight: 1.3,
                paddingRight: 18,
              }}
            >
              {oldLabel}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--color-text-muted)",
                marginTop: 3,
                lineHeight: 1.4,
              }}
            >
              By {newLabel}
              {dateLabel ? <><br />{dateLabel}</> : null}
            </div>
          </div>
        );
        return successorHref ? (
          <Link
            key={i}
            href={successorHref}
            style={{ textDecoration: "none", color: "inherit", display: "block" }}
          >
            {card}
          </Link>
        ) : (
          <div key={i}>{card}</div>
        );
      })}
    </div>
  );
}
