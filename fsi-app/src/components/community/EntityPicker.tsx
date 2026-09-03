"use client";

/**
 * EntityPicker — entity-bound posting UI (spec 05 §5 component 2, acceptance 6: "every thread
 * binds to at least one spine entity"). Lets the author bind a post to one or more spine entities
 * (corridor / jurisdiction / instrument / technology / organisation — src/lib/entities/entity-id.mjs
 * KINDS) before it can be submitted.
 *
 * No entity search/list API exists in this lane's write set or contract (checked: grep across
 * src/app/api found nothing under an "entities" path — see this lane's report, [INFERRED]/
 * documented there). The candidate list is therefore supplied by the SERVER page that renders this
 * component — community/[slug]/page.tsx queries `entities` (world-readable per migration 282's RLS
 * posture, same posture as `sources`/`regions`) directly, the same way every other /community/*
 * page already reads its own data server-side, and threads the rows down as `candidates`. This
 * component only filters and selects from what it's given; the search box's free-text query is
 * matched against `canonical_name` client-side over the candidate set already on the page, plus
 * (optionally) round-trips through the URL so the server can widen the candidate set on submit —
 * see the `onSearchSubmit` prop.
 */

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import type { CommunityEntityRef } from "./types";

const KIND_LABELS: Record<string, string> = {
  corridor: "Corridor",
  jurisdiction: "Jurisdiction",
  instrument: "Instrument",
  technology: "Technology",
  organisation: "Organisation",
};

interface EntityPickerProps {
  candidates: CommunityEntityRef[];
  value: CommunityEntityRef[];
  onChange: (next: CommunityEntityRef[]) => void;
  /** Optional — when the caller wants a wider server-side search than the candidate list already
   * on the page, this fires on Enter/blur with the raw query text. The page decides what to do with
   * it (typically a `router.push` to `?entityQuery=...`, which re-renders with a wider candidate
   * set). Omit to keep the picker purely client-side-filtered. */
  onSearchSubmit?: (query: string) => void;
  disabled?: boolean;
}

export function EntityPicker({
  candidates,
  value,
  onChange,
  onSearchSubmit,
  disabled,
}: EntityPickerProps) {
  const [query, setQuery] = useState("");

  const selectedIds = useMemo(() => new Set(value.map((e) => e.entity_id)), [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q
      ? candidates.filter((c) => c.canonical_name.toLowerCase().includes(q))
      : candidates;
    return pool.filter((c) => !selectedIds.has(c.entity_id)).slice(0, 12);
  }, [candidates, query, selectedIds]);

  const add = (entity: CommunityEntityRef) => {
    if (selectedIds.has(entity.entity_id)) return;
    onChange([...value, entity]);
    setQuery("");
  };

  const remove = (entityId: string) => {
    onChange(value.filter((e) => e.entity_id !== entityId));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label
        htmlFor="entity-picker-search"
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--color-text-secondary)",
        }}
      >
        Bind to spine entities <span style={{ color: "var(--color-high, #b45309)" }}>*</span>
      </label>

      {value.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {value.map((e) => (
            <span
              key={e.entity_id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "3px 8px",
                fontSize: 11.5,
                fontWeight: 600,
                color: "var(--color-text-primary)",
                background: "var(--color-bg-base)",
                border: "1px solid var(--color-border)",
                borderRadius: 4,
                maxWidth: "100%",
                minWidth: 0,
              }}
            >
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--color-text-muted)",
                  flexShrink: 0,
                }}
              >
                {KIND_LABELS[e.kind] ?? e.kind}
              </span>
              <span style={{ overflowWrap: "anywhere", minWidth: 0 }}>{e.canonical_name}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(e.entity_id)}
                  aria-label={`Remove ${e.canonical_name}`}
                  style={{
                    background: "transparent",
                    border: 0,
                    padding: 0,
                    /* UX law 2 (Fitts's Law): an icon-only control needs a real hit target, not just
                       a visually-sized icon — 24px on the shorter axis, achieved here without
                       inflating the chip's visual height via negative margin so the click area
                       extends into the chip's own padding and the row gap around it. */
                    width: 24,
                    height: 24,
                    margin: "-6px -6px -6px 0",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--color-text-muted)",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  <X size={11} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      <input
        id="entity-picker-search"
        type="text"
        value={query}
        disabled={disabled}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (filtered.length === 1) {
              add(filtered[0]);
            } else if (onSearchSubmit && query.trim()) {
              onSearchSubmit(query.trim());
            }
          }
        }}
        placeholder="Search a corridor, jurisdiction, instrument, technology, or organisation…"
        style={{
          background: "var(--color-bg-base)",
          border: "1px solid var(--color-border)",
          borderRadius: 4,
          padding: "8px 10px",
          fontSize: 12.5,
          color: "var(--color-text-primary)",
          fontFamily: "inherit",
          outline: "none",
        }}
      />

      {query.trim().length > 0 && filtered.length > 0 && (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 4,
            border: "1px solid var(--color-border)",
            borderRadius: 4,
            background: "var(--color-bg-surface)",
            maxHeight: 180,
            overflowY: "auto",
          }}
        >
          {filtered.map((c) => (
            <li key={c.entity_id}>
              <button
                type="button"
                onClick={() => add(c)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  textAlign: "left",
                  background: "transparent",
                  border: 0,
                  padding: "6px 8px",
                  fontSize: 12,
                  color: "var(--color-text-primary)",
                  cursor: "pointer",
                  display: "flex",
                  gap: 8,
                  alignItems: "baseline",
                }}
              >
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--color-text-muted)",
                    flexShrink: 0,
                  }}
                >
                  {KIND_LABELS[c.kind] ?? c.kind}
                </span>
                <span style={{ overflowWrap: "anywhere" }}>{c.canonical_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {value.length === 0 && (
        <p
          style={{
            margin: 0,
            fontSize: 11,
            color: "var(--color-text-muted)",
            lineHeight: 1.4,
          }}
        >
          Every post binds to at least one spine entity — that's what makes it reachable from
          Regulations, Market Intel, Research, and Operations, not just this forum.
        </p>
      )}
    </div>
  );
}
