"use client";

/**
 * Supersessions — the "Earlier · replaced" ledger of the unified change log
 * (TEMPLATE 01, HANDOFF §6.3 + mock).
 *
 * Superseded regulations are a RECORD, never mixed into the active lists (the
 * mock's binding rule). Each row: a REPLACED chip (rust, destructive-quiet),
 * the old title, "superseded by {new} — retained for record", and the date.
 * Collapsed to 4 rows with an "All N replaced →" expander.
 *
 * Rows link to the successor regulation when it resolves; single-character
 * internal identifiers are never shown (shortLabel renders a neutral pending
 * label instead).
 */

import { useState } from "react";
import Link from "next/link";
import type { Resource, Supersession } from "@/types/resource";

interface SupersessionsProps {
  supersessions: Supersession[];
  resourceMap: Map<string, Resource>;
}

const COLLAPSED = 4;

function shortLabel(raw: string | undefined, fallback: string | undefined): string {
  const candidate = (raw && raw.trim()) || (fallback && fallback.trim()) || "";
  if (!candidate) return "Title pending";
  return candidate;
}

export function Supersessions({ supersessions, resourceMap }: SupersessionsProps) {
  const [open, setOpen] = useState(false);
  if (supersessions.length === 0) return null;

  const total = supersessions.length;
  const shown = open ? supersessions : supersessions.slice(0, COLLAPSED);

  return (
    <div>
      <p
        style={{
          fontSize: 10.5,
          fontWeight: 800,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--color-text-muted)",
          margin: "0 0 8px",
          padding: "0 2px",
        }}
      >
        Earlier · {total} replaced
      </p>
      <div
        style={{
          background: "var(--color-bg-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        {shown.map((s, i) => {
          const oldR = resourceMap.get(s.old);
          const newR = resourceMap.get(s.new);
          const oldLabel = shortLabel(s.oldTitle, oldR?.title);
          const newLabel = shortLabel(s.newTitle, newR?.title);
          const dateLabel = s.date ? s.date.slice(0, 7) : "";
          const successorHref = newR ? `/regulations/${s.new}` : null;
          const rowInner = (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "110px 1fr auto",
                gap: 14,
                alignItems: "center",
                padding: "11px 18px",
                borderTop: i === 0 ? "0" : "1px solid var(--color-border-subtle)",
              }}
            >
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: 800,
                  letterSpacing: "0.09em",
                  textTransform: "uppercase",
                  color: "var(--destructive-quiet, #9A3412)",
                  border: "1px solid rgba(154,52,45,0.35)",
                  borderRadius: 4,
                  padding: "3px 8px",
                  textAlign: "center",
                }}
              >
                Replaced
              </span>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "var(--color-text-secondary)" }}>
                  {oldLabel}
                </p>
                <p style={{ fontSize: 11.5, color: "var(--color-text-muted)", margin: "1px 0 0" }}>
                  superseded by <span style={{ fontWeight: 700, color: "var(--color-text-primary)" }}>{newLabel}</span> —
                  retained for record
                </p>
              </div>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
                {dateLabel}
              </span>
            </div>
          );
          return successorHref ? (
            <Link key={i} href={successorHref} prefetch={false} style={{ display: "block", textDecoration: "none", color: "inherit" }}>
              {rowInner}
            </Link>
          ) : (
            <div key={i}>{rowInner}</div>
          );
        })}

        {total > COLLAPSED && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            style={{
              width: "100%",
              textAlign: "left",
              fontFamily: "inherit",
              padding: "11px 18px",
              background: "var(--color-bg-surface)",
              border: "none",
              borderTop: "1px solid var(--color-border-subtle)",
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 800, color: "var(--color-primary)" }}>
              {open ? "Show fewer" : `All ${total} replaced →`}
            </span>
            <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
              superseded items never mix into active lists
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
