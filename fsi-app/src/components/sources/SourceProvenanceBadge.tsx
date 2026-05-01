"use client";

import { ExternalLink } from "lucide-react";
import { useSourceStore } from "@/stores/sourceStore";

interface SourceProvenanceBadgeProps {
  sourceId?: string;
}

// Tier accent colours — picks a small visual cue per source tier.
// T1 primary text gets the strongest accent; T2-T3 get muted variants;
// T4+ fall back to the neutral surface so the badge doesn't shout for
// lower-authority sources. Hex anchors match the navy brand accent.
const TIER_ACCENT: Record<number, string> = {
  1: "#1E3A8A", // navy
  2: "#2563EB", // blue
  3: "#0891B2", // cyan
  4: "#475569", // slate
  5: "#64748B", // slate-light
  6: "#94A3B8", // slate-muted
  7: "#94A3B8",
};

export function SourceProvenanceBadge({ sourceId }: SourceProvenanceBadgeProps) {
  const sources = useSourceStore((s) => s.sources);

  if (!sourceId) return null;
  const source = sources.find((s) => s.id === sourceId);
  if (!source) return null;

  const tier = source.tier;
  const accent = TIER_ACCENT[tier] || "#475569";
  const score = source.trust_score?.overall ?? null;

  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] font-medium transition-colors duration-200 hover:bg-[var(--color-surface-raised)]"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-surface)",
        color: "var(--color-text-secondary)",
      }}
      title={`${source.name} · Tier ${tier} · open source portal`}
      aria-label={`Source: ${source.name}, Tier ${tier}${score !== null ? `, trust score ${score}` : ""}`}
    >
      <span
        className="inline-flex items-center justify-center text-[10px] font-bold tabular-nums shrink-0 px-1 rounded-sm"
        style={{
          color: accent,
          backgroundColor: `${accent}14`,
          border: `1px solid ${accent}33`,
        }}
      >
        T{tier}
      </span>
      <span className="truncate max-w-[140px]" style={{ color: "var(--color-text-primary)" }}>
        {source.name}
      </span>
      {score !== null && (
        <span className="tabular-nums" style={{ color: "var(--color-text-muted)" }}>
          {score}%
        </span>
      )}
      <ExternalLink size={10} strokeWidth={2} style={{ color: "var(--color-text-muted)" }} />
    </a>
  );
}
