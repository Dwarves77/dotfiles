"use client";

// Intersection Detection view — flywheel U3 supersession.
//
// Reads /api/admin/intersections, which now assembles canonical pairs from the PERSISTED connection
// graph (item_cross_references — discover.mjs is the one scoring home; the detect_intersections RPC
// is retired, migration 265). Each pair carries the engine's score (0..1) and its grounded BASIS —
// the real shared attributes that justify the connection. No basis, no edge, no card.
//
// Score bands mirror pair-view.mjs (documented heuristic against discover.mjs's weights:
// shared_source 0.4, shared_scenario 0.3/tag, shared_compliance_object
// 0.18/tag, shared_jurisdiction_topic 0.2):
//   strong >= 0.9 · medium >= 0.5 · weak < 0.5 · explicit = curated edge, no engine score.

import { useEffect, useMemo, useState } from "react";
import { Loader2, ArrowLeftRight, Link2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

interface BasisEntry {
  signal: string;
  detail?: string;
  weight?: number;
}

interface Intersection {
  item_a_id: string;
  item_a_title: string | null;
  item_a_legacy_id: string | null;
  item_a_priority: string | null;
  item_a_intersection_summary: string | null;
  item_b_id: string;
  item_b_title: string | null;
  item_b_legacy_id: string | null;
  item_b_priority: string | null;
  item_b_intersection_summary: string | null;
  basis: BasisEntry[];
  explicitly_linked: boolean;
  score: number | null;
  band: "strong" | "medium" | "weak" | "explicit";
}

interface Stats {
  total: number;
  explicit_count: number;
  by_band: { strong: number; medium: number; weak: number; explicit: number };
}

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: "var(--color-error)",
  HIGH: "var(--color-warning)",
  MODERATE: "var(--color-text-secondary)",
  LOW: "var(--color-text-muted)",
};

// Signal chip palette — substantive signals lead with primary; the weaker corroborating signals stay
// neutral so a card's visual weight tracks the engine's weights.
const SIGNAL_COLORS: Record<string, string> = {
  shared_source: "var(--color-success)",
  shared_scenario: "var(--color-primary)",
  shared_compliance_object: "var(--color-warning)",
  shared_jurisdiction_topic: "var(--color-text-secondary)",
};

const THRESHOLDS = [0.3, 0.5, 0.7, 0.9];

export function IntersectionDetectionView() {
  const supabase = createSupabaseBrowserClient();
  const [data, setData] = useState<Intersection[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [minScore, setMinScore] = useState(0.5);

  async function load(score: number) {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `/api/admin/intersections?minScore=${score}&limit=200`,
        { headers: { Authorization: `Bearer ${session?.access_token}` } }
      );
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error || "Failed to load intersections");
      } else {
        setData(payload.intersections || []);
        setStats(payload.stats || null);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(minScore); }, [minScore]); // eslint-disable-line react-hooks/exhaustive-deps

  const grouped = useMemo(() => ({
    strong: data.filter((d) => d.band === "strong"),
    medium: data.filter((d) => d.band === "medium"),
    weak: data.filter((d) => d.band === "weak"),
    explicit: data.filter((d) => d.band === "explicit"),
  }), [data]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-sm" style={{ color: "var(--color-text-muted)" }}>
        <Loader2 size={14} className="animate-spin" /> Loading connection pairs…
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-3 rounded text-sm" style={{ backgroundColor: "var(--color-error)15", color: "var(--color-error)" }}>
        {error}
      </div>
    );
  }
  if (!stats || stats.total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <ArrowLeftRight size={24} style={{ color: "var(--color-text-muted)" }} />
        <h3 className="mt-3 text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
          No connection pairs at min score {minScore}
        </h3>
        <p className="mt-1 text-xs max-w-sm" style={{ color: "var(--color-text-secondary)" }}>
          Pairs come from the persisted connection graph. Populate or refresh it with
          scripts/connections/backfill-edges.mjs, or lower the minimum-score threshold to see weaker
          connections.
        </p>
        <button
          onClick={() => setMinScore(0.3)}
          className="mt-4 px-3 py-1.5 text-xs font-medium rounded border"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
        >
          Lower threshold to 0.3
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats banner */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatBox label="Total pairs" value={stats.total} />
        <StatBox label={`Strong (≥${0.9})`} value={stats.by_band.strong} accent="success" />
        <StatBox label={`Medium (≥${0.5})`} value={stats.by_band.medium} accent="warning" />
        <StatBox label={`Weak (<${0.5})`} value={stats.by_band.weak} />
        <StatBox label="Explicitly linked" value={stats.explicit_count} accent="primary" />
      </div>

      {/* Threshold control */}
      <div className="flex items-center gap-3 text-xs">
        <span style={{ color: "var(--color-text-muted)" }}>Min score:</span>
        {THRESHOLDS.map((s) => (
          <button
            key={s}
            onClick={() => setMinScore(s)}
            className="px-2 py-0.5 rounded border tabular-nums"
            style={{
              borderColor: minScore === s ? "var(--color-primary)" : "var(--color-border)",
              backgroundColor: minScore === s ? "var(--color-primary)20" : "var(--color-surface)",
              color: "var(--color-text-primary)",
            }}
          >
            {s}
          </button>
        ))}
        <span style={{ color: "var(--color-text-muted)" }}>
          (engine weights: instrument 0.9 · source 0.4 · scenario 0.3/tag · compliance 0.18/tag · jurisdiction+topic 0.2)
        </span>
      </div>

      {grouped.strong.length > 0 && (
        <Section title="Strong connections" subtitle="Same instrument across surfaces, or several substantive signals stacked">
          {grouped.strong.map((row) => <IntersectionCard key={`${row.item_a_id}-${row.item_b_id}`} row={row} />)}
        </Section>
      )}

      {grouped.medium.length > 0 && (
        <Section title="Medium connections" subtitle="Multiple substantive signals (e.g. shared source + scenario)">
          {grouped.medium.map((row) => <IntersectionCard key={`${row.item_a_id}-${row.item_b_id}`} row={row} />)}
        </Section>
      )}

      {grouped.weak.length > 0 && (
        <Section title="Weak connections" subtitle="A single substantive signal near the discovery threshold — review for genuine connection">
          {grouped.weak.map((row) => <IntersectionCard key={`${row.item_a_id}-${row.item_b_id}`} row={row} />)}
        </Section>
      )}

      {grouped.explicit.length > 0 && (
        <Section title="Curated links" subtitle="Manually linked or entity-extracted pairs with no engine score">
          {grouped.explicit.map((row) => <IntersectionCard key={`${row.item_a_id}-${row.item_b_id}`} row={row} />)}
        </Section>
      )}
    </div>
  );
}

function StatBox({ label, value, accent }: { label: string; value: number; accent?: "success" | "warning" | "primary" }) {
  const color =
    accent === "success" ? "var(--color-success)" :
    accent === "warning" ? "var(--color-warning)" :
    accent === "primary" ? "var(--color-primary)" :
    "var(--color-text-primary)";
  return (
    <div className="p-3 rounded-lg" style={{ backgroundColor: "var(--color-surface-raised)" }}>
      <div className="text-[11px] font-medium" style={{ color: "var(--color-text-muted)" }}>{label}</div>
      <div className="text-xl font-semibold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2">
        <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{title}</h3>
        <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>{subtitle}</p>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function IntersectionCard({ row }: { row: Intersection }) {
  const aColor = PRIORITY_COLORS[row.item_a_priority ?? ""] || PRIORITY_COLORS.MODERATE;
  const bColor = PRIORITY_COLORS[row.item_b_priority ?? ""] || PRIORITY_COLORS.MODERATE;

  return (
    <div
      className="rounded-lg border p-3"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
    >
      {/* Header row: items + score badge */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ color: aColor, backgroundColor: "var(--color-surface-raised)" }}>
              {row.item_a_priority}
            </span>
            <span className="text-sm font-medium truncate" style={{ color: "var(--color-text-primary)" }}>
              {row.item_a_title}
            </span>
            {row.item_a_legacy_id && (
              <span className="text-[10px] tabular-nums" style={{ color: "var(--color-text-muted)" }}>{row.item_a_legacy_id}</span>
            )}
          </div>
          <div className="flex items-center gap-2 pl-4">
            <ArrowLeftRight size={11} style={{ color: "var(--color-text-muted)" }} />
            <span style={{ color: "var(--color-text-muted)" }} className="text-[10px]">connects with</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ color: bColor, backgroundColor: "var(--color-surface-raised)" }}>
              {row.item_b_priority}
            </span>
            <span className="text-sm font-medium truncate" style={{ color: "var(--color-text-primary)" }}>
              {row.item_b_title}
            </span>
            {row.item_b_legacy_id && (
              <span className="text-[10px] tabular-nums" style={{ color: "var(--color-text-muted)" }}>{row.item_b_legacy_id}</span>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-base font-bold tabular-nums" style={{ color: "var(--color-primary)" }}>
            {row.score != null ? row.score.toFixed(2) : "—"}
          </div>
          {row.explicitly_linked && (
            <div className="flex items-center gap-1 text-[10px] mt-0.5" style={{ color: "var(--color-primary)" }}>
              <Link2 size={9} /> explicit
            </div>
          )}
        </div>
      </div>

      {/* Grounded basis — the real shared attributes justifying the connection */}
      {row.basis.length > 0 && (
        <div className="mt-3 text-[11px]">
          <div style={{ color: "var(--color-text-muted)" }}>Basis ({row.basis.length}):</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {row.basis.map((b, i) => (
              <span
                key={`${b.signal}-${b.detail ?? i}`}
                className="px-1.5 py-0.5 rounded"
                style={{ backgroundColor: "var(--color-surface-raised)", color: SIGNAL_COLORS[b.signal] || "var(--color-text-secondary)" }}
                title={b.weight != null ? `${b.signal} (weight ${b.weight})` : b.signal}
              >
                {b.detail || b.signal}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Intersection summaries from each item */}
      {(row.item_a_intersection_summary || row.item_b_intersection_summary) && (
        <div className="mt-3 space-y-2 text-[11px]">
          {row.item_a_intersection_summary && (
            <div className="p-2 rounded" style={{ backgroundColor: "var(--color-surface-raised)" }}>
              <span className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{row.item_a_legacy_id || "A"} says: </span>
              <span style={{ color: "var(--color-text-secondary)" }}>{row.item_a_intersection_summary}</span>
            </div>
          )}
          {row.item_b_intersection_summary && (
            <div className="p-2 rounded" style={{ backgroundColor: "var(--color-surface-raised)" }}>
              <span className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{row.item_b_legacy_id || "B"} says: </span>
              <span style={{ color: "var(--color-text-secondary)" }}>{row.item_b_intersection_summary}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
