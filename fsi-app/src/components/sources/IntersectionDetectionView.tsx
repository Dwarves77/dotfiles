"use client";

// Intersection Detection view.
//
// Reads /api/admin/intersections (which calls the detect_intersections RPC
// from migration 021) and surfaces pairs of intelligence_items that share
// operational scenarios AND compliance objects. The B.2 regeneration
// populates the underlying tags; this view makes them visible.
//
// Each pair is canonicalized (A.id < B.id, no double-counting). Strength
// score ranks rows: more shared scenarios + compliance objects + explicit
// related_items linkage = stronger intersection.

import { useEffect, useMemo, useState } from "react";
import { Loader2, ArrowLeftRight, Link2, AlertCircle } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

interface Intersection {
  item_a_id: string;
  item_a_title: string;
  item_a_legacy_id: string | null;
  item_a_priority: string;
  item_a_intersection_summary: string | null;
  item_b_id: string;
  item_b_title: string;
  item_b_legacy_id: string | null;
  item_b_priority: string;
  item_b_intersection_summary: string | null;
  shared_scenarios: string[] | null;
  shared_compliance_objects: string[] | null;
  explicitly_linked: boolean;
  strength: number;
}

interface Stats {
  total: number;
  explicit_count: number;
  by_strength: { strong: number; medium: number; weak: number };
}

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: "var(--color-error)",
  HIGH: "var(--color-warning)",
  MODERATE: "var(--color-text-secondary)",
  LOW: "var(--color-text-muted)",
};

export function IntersectionDetectionView() {
  const supabase = createSupabaseBrowserClient();
  const [data, setData] = useState<Intersection[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [minStrength, setMinStrength] = useState(7);

  async function load(strength: number) {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `/api/admin/intersections?minStrength=${strength}&limit=200`,
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

  useEffect(() => { load(minStrength); }, [minStrength]); // eslint-disable-line react-hooks/exhaustive-deps

  const grouped = useMemo(() => {
    const strong = data.filter((d) => d.strength >= 12);
    const medium = data.filter((d) => d.strength >= 8 && d.strength < 12);
    const weak = data.filter((d) => d.strength < 8);
    return { strong, medium, weak };
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-sm" style={{ color: "var(--color-text-muted)" }}>
        <Loader2 size={14} className="animate-spin" /> Detecting intersections…
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
          No intersections detected at min strength {minStrength}
        </h3>
        <p className="mt-1 text-xs max-w-sm" style={{ color: "var(--color-text-secondary)" }}>
          Intersections appear after intelligence items have been regenerated under the SKILL.md 2026-04-29 contract. Lower the minimum-strength threshold to see weaker connections, or run B.2 regeneration to populate more items.
        </p>
        <button
          onClick={() => setMinStrength(Math.max(1, minStrength - 2))}
          className="mt-4 px-3 py-1.5 text-xs font-medium rounded border"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
        >
          Lower threshold to {Math.max(1, minStrength - 2)}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats banner */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatBox label="Total intersections" value={stats.total} />
        <StatBox label="Strong (≥12)" value={stats.by_strength.strong} accent="success" />
        <StatBox label="Medium (8-11)" value={stats.by_strength.medium} accent="warning" />
        <StatBox label="Weak (<8)" value={stats.by_strength.weak} />
        <StatBox label="Explicitly linked" value={stats.explicit_count} accent="primary" />
      </div>

      {/* Threshold control */}
      <div className="flex items-center gap-3 text-xs">
        <span style={{ color: "var(--color-text-muted)" }}>Min strength:</span>
        {[1, 5, 7, 10, 12, 15].map((s) => (
          <button
            key={s}
            onClick={() => setMinStrength(s)}
            className="px-2 py-0.5 rounded border"
            style={{
              borderColor: minStrength === s ? "var(--color-primary)" : "var(--color-border)",
              backgroundColor: minStrength === s ? "var(--color-primary)20" : "var(--color-surface)",
              color: "var(--color-text-primary)",
            }}
          >
            {s}
          </button>
        ))}
        <span style={{ color: "var(--color-text-muted)" }}>
          (3 pts/scenario + 2 pts/compliance-object + 5 pts explicit-link + 2 pts both-high-priority)
        </span>
      </div>

      {/* Strong */}
      {grouped.strong.length > 0 && (
        <Section title="Strong intersections" subtitle="Multiple shared scenarios + compliance objects, often explicitly linked">
          {grouped.strong.map((row) => <IntersectionCard key={`${row.item_a_id}-${row.item_b_id}`} row={row} />)}
        </Section>
      )}

      {/* Medium */}
      {grouped.medium.length > 0 && (
        <Section title="Medium intersections" subtitle="Some shared scenarios + compliance objects">
          {grouped.medium.map((row) => <IntersectionCard key={`${row.item_a_id}-${row.item_b_id}`} row={row} />)}
        </Section>
      )}

      {/* Weak */}
      {grouped.weak.length > 0 && (
        <Section title="Weak intersections" subtitle="Limited overlap — review for genuine connection vs common-tag noise">
          {grouped.weak.map((row) => <IntersectionCard key={`${row.item_a_id}-${row.item_b_id}`} row={row} />)}
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
  const aColor = PRIORITY_COLORS[row.item_a_priority] || PRIORITY_COLORS.MODERATE;
  const bColor = PRIORITY_COLORS[row.item_b_priority] || PRIORITY_COLORS.MODERATE;

  return (
    <div
      className="rounded-lg border p-3"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
    >
      {/* Header row: items + strength badge */}
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
            <span style={{ color: "var(--color-text-muted)" }} className="text-[10px]">intersects with</span>
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
          <div className="text-base font-bold tabular-nums" style={{ color: "var(--color-primary)" }}>{row.strength}</div>
          {row.explicitly_linked && (
            <div className="flex items-center gap-1 text-[10px] mt-0.5" style={{ color: "var(--color-primary)" }}>
              <Link2 size={9} /> explicit
            </div>
          )}
        </div>
      </div>

      {/* Shared tags */}
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
        {row.shared_scenarios && row.shared_scenarios.length > 0 && (
          <div>
            <div style={{ color: "var(--color-text-muted)" }}>Shared scenarios ({row.shared_scenarios.length}):</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {row.shared_scenarios.map((s) => (
                <span key={s} className="px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--color-primary)15", color: "var(--color-primary)" }}>
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
        {row.shared_compliance_objects && row.shared_compliance_objects.length > 0 && (
          <div>
            <div style={{ color: "var(--color-text-muted)" }}>Shared compliance objects ({row.shared_compliance_objects.length}):</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {row.shared_compliance_objects.map((s) => (
                <span key={s} className="px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--color-warning)15", color: "var(--color-warning)" }}>
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

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
