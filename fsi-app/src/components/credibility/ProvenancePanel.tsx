"use client";

/**
 * ProvenancePanel, expandable per-source provenance detail.
 *
 * Per Q8 (Assistant inline citations) and DP-1 (single-pane operator review):
 * when a user expands a citation count, source badge, or assistant footnote,
 * this panel renders the full provenance in one pane. No drill-down through
 * multiple modals; everything the user needs to evaluate a source's
 * credibility is here.
 *
 * Surface usage per Q9:
 *   - Assistant: panel renders on citation footnote click
 *   - Research: panel renders on citation count expansion
 *   - Operations / Regulations: panel renders on source badge expansion
 *   - Market Intel: panel renders on signal source expansion
 *
 * The panel composes the other credibility components rather than reinventing
 * any of them. That keeps the credibility vocabulary consistent (a tier here
 * renders identically to a tier on a Regulations card).
 *
 * Stable contract: pass the full source shape. The panel decides what to
 * render based on which fields are populated. Missing fields render nothing;
 * the panel does NOT fall back to placeholders for unknown values (silence
 * is more informative than a placeholder for a credibility surface).
 */

import type { CSSProperties } from "react";
import { ExternalLink } from "lucide-react";
import { CredibilityBadge } from "./CredibilityBadge";
import { BiasBadge, type BiasTag } from "./BiasBadge";
import { CitationCountChip } from "./CitationCountChip";
import { RecencyChip } from "./RecencyChip";

export interface ProvenanceSource {
  id?: string;
  name: string;
  url?: string;
  tier?: number;
  /** Optional override of the tier's canonical label. */
  tierLabel?: string;
  biasTags?: BiasTag[];
  citationCount?: number;
  recency?: string | Date | null;
  /** Optional one-line description / institutional context. */
  description?: string;
}

export interface ProvenancePanelProps {
  source: ProvenanceSource;
}

const PANEL_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: 14,
  backgroundColor: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md, 10px)",
  boxShadow: "var(--shadow-card, 0 1px 3px rgba(0,0,0,0.06))",
};

const ROW_STYLE: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
};

const SECTION_LABEL_STYLE: CSSProperties = {
  fontSize: 9,
  fontWeight: 800,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--color-text-muted)",
  marginBottom: 4,
};

export function ProvenancePanel({ source }: ProvenancePanelProps) {
  const hasBias = source.biasTags && source.biasTags.length > 0;
  const hasCitations = typeof source.citationCount === "number" && source.citationCount > 0;
  const hasRecency = source.recency !== null && source.recency !== undefined;

  return (
    <section
      aria-label={`Source provenance: ${source.name}`}
      style={PANEL_STYLE}
    >
      {/* Header: name + tier */}
      <header style={ROW_STYLE}>
        {source.url ? (
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontSize: 14,
              fontWeight: 700,
              color: "var(--color-text-primary)",
              textDecoration: "none",
              lineHeight: 1.3,
            }}
            title={`Open ${source.name} in a new tab`}
          >
            {source.name}
            <ExternalLink size={12} strokeWidth={2} style={{ color: "var(--color-text-muted)" }} />
          </a>
        ) : (
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--color-text-primary)",
              lineHeight: 1.3,
            }}
          >
            {source.name}
          </span>
        )}
        {typeof source.tier === "number" && (
          <CredibilityBadge tier={source.tier} size="md" showLabel />
        )}
      </header>

      {/* Optional description / institutional context */}
      {source.description && (
        <p
          style={{
            margin: 0,
            fontSize: 12,
            lineHeight: 1.5,
            color: "var(--color-text-secondary)",
          }}
        >
          {source.description}
        </p>
      )}

      {/* Bias tags row */}
      {hasBias && (
        <div>
          <div style={SECTION_LABEL_STYLE}>Bias profile</div>
          <BiasBadge tags={source.biasTags!} layout="grouped" />
        </div>
      )}

      {/* Signal row: citation count + recency */}
      {(hasCitations || hasRecency) && (
        <div>
          <div style={SECTION_LABEL_STYLE}>Signals</div>
          <div style={ROW_STYLE}>
            {hasCitations && (
              <CitationCountChip
                count={source.citationCount!}
                recency={source.recency ?? null}
                sourceId={source.id}
                expandable={false}
              />
            )}
            {!hasCitations && hasRecency && (
              <RecencyChip timestamp={source.recency!} size="md" />
            )}
          </div>
        </div>
      )}
    </section>
  );
}
