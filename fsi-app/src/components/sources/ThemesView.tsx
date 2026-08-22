"use client";

// Connection Themes view (flywheel U3).
//
// Reads /api/admin/themes — the last connection_themes snapshot (flywheel U1 cluster.mjs, persisted by
// U2's analyze-corpus.mjs). Each theme is a cluster of intelligence_items connected by shared provenance
// (item_cross_references), ranked by convergence (surface span x density x recency).
//
// Same shape as IntersectionDetectionView (fetch-on-mount, bearer token, grouped-by-band cards) —
// deliberately mirrored, not reinvented, since it's the established pattern for this admin dashboard.
//
// Member items are shown as id/date chips, not links: no confirmed intelligence_items detail-page route
// exists in this app to link to (checked before building this), so this renders what's real instead of
// inventing a href that would 404.

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Network } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { GfmSection } from "@/components/shared/GfmSection";

interface ThemeBrief {
  title: string;
  brief_md: string;
  generated_at: string;
  stale: boolean;
}

interface Theme {
  id: string;
  computed_at: string;
  member_ids: string[];
  dominant_signals: { signal: string; weight: number }[];
  surfaces: string[];
  density: number;
  convergence: number;
  pivots: { id: string; centrality: number }[];
  brief: ThemeBrief | null;
}

interface Stats {
  total: number;
  avg_convergence: number;
  cross_surface_count: number;
  single_surface_count: number;
}

interface LastRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "ok" | "error";
  nodes_read: number | null;
  edges_read: number | null;
  nodes_clustered: number | null;
  edges_used: number | null;
  themes_written: number | null;
  gaps_flagged: number | null;
  rounds: number | null;
}

// Convergence bands mirrored from src/lib/connections/theme-stats.mjs's CONVERGENCE_BANDS (kept as a
// literal here rather than imported — this file is a client component bundled for the browser, that
// module is a plain .mjs the route also imports server-side; duplicating two numbers is simpler and
// safer than adding a shared-bundle boundary for a two-constant object. If these drift, theme-stats.mjs
// stays the source of truth for the route's own banding.)
const CONVERGENCE_BANDS = { high: 1.5, medium: 0.5 };
function band(c: number): "high" | "medium" | "low" {
  if (c >= CONVERGENCE_BANDS.high) return "high";
  if (c >= CONVERGENCE_BANDS.medium) return "medium";
  return "low";
}

export function ThemesView() {
  const supabase = createSupabaseBrowserClient();
  const [data, setData] = useState<Theme[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [lastRun, setLastRun] = useState<LastRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`/api/admin/themes?limit=200`, {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });
        const payload = await res.json();
        if (!res.ok) {
          setError(payload.error || "Failed to load themes");
        } else {
          setData(payload.themes || []);
          setStats(payload.stats || null);
          setLastRun(payload.last_run || null);
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const grouped = useMemo(() => {
    const high = data.filter((t) => band(t.convergence) === "high");
    const medium = data.filter((t) => band(t.convergence) === "medium");
    const low = data.filter((t) => band(t.convergence) === "low");
    return { high, medium, low };
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-sm" style={{ color: "var(--color-text-muted)" }}>
        <Loader2 size={14} className="animate-spin" /> Loading connection themes…
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
        <Network size={24} style={{ color: "var(--color-text-muted)" }} />
        <h3 className="mt-3 text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
          No connection themes yet
        </h3>
        <p className="mt-1 text-xs max-w-sm" style={{ color: "var(--color-text-secondary)" }}>
          Themes appear after scripts/connections/analyze-corpus.mjs (flywheel U2) has run at least once
          against a corpus with discovered connections (flywheel U0/U1).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatBox label="Total themes" value={stats.total} />
        <StatBox label="Cross-surface" value={stats.cross_surface_count} accent="primary" />
        <StatBox label="Single-surface" value={stats.single_surface_count} />
        <StatBox label="Avg convergence" value={Number(stats.avg_convergence.toFixed(2))} />
      </div>

      {lastRun && (
        <div className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
          Last run {lastRun.started_at ? new Date(lastRun.started_at).toLocaleString() : "—"} ·{" "}
          status {lastRun.status}
          {lastRun.status === "error" && (
            <span style={{ color: "var(--color-error)" }}> (see connection_theme_runs.error_message)</span>
          )}
          {typeof lastRun.nodes_clustered === "number" && (
            <> · {lastRun.nodes_clustered} nodes, {lastRun.edges_used ?? 0} edges, {lastRun.themes_written ?? 0} themes, {lastRun.gaps_flagged ?? 0} gaps flagged</>
          )}
        </div>
      )}

      {grouped.high.length > 0 && (
        <Section title="High convergence" subtitle="Cross-surface, dense, recent membership">
          {grouped.high.map((t) => <ThemeCard key={t.id} theme={t} />)}
        </Section>
      )}
      {grouped.medium.length > 0 && (
        <Section title="Medium convergence" subtitle="Some span or density, not both at once">
          {grouped.medium.map((t) => <ThemeCard key={t.id} theme={t} />)}
        </Section>
      )}
      {grouped.low.length > 0 && (
        <Section title="Low convergence" subtitle="Single-surface or sparse — review for genuine grouping vs incidental overlap">
          {grouped.low.map((t) => <ThemeCard key={t.id} theme={t} />)}
        </Section>
      )}
    </div>
  );
}

function StatBox({ label, value, accent }: { label: string; value: number; accent?: "primary" }) {
  const color = accent === "primary" ? "var(--color-primary)" : "var(--color-text-primary)";
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

function ThemeCard({ theme }: { theme: Theme }) {
  const [briefOpen, setBriefOpen] = useState(false);
  const brief = theme.brief;

  return (
    <div className="rounded-lg border p-3" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] tabular-nums" style={{ color: "var(--color-text-muted)" }}>
              {theme.id.slice(0, 8)}…
            </span>
            <span className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
              {theme.member_ids.length} members
            </span>
            {theme.surfaces.map((s) => (
              <span key={s} className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ color: "var(--color-primary)", backgroundColor: "var(--color-primary)15" }}>
                {s}
              </span>
            ))}
          </div>
          {theme.pivots.length > 0 && (
            <div className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
              Pivots: {theme.pivots.map((p) => `${p.id.slice(0, 8)}… (${p.centrality.toFixed(2)})`).join(", ")}
            </div>
          )}
          {theme.dominant_signals.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
              {theme.dominant_signals.slice(0, 3).map((s) => (
                <span key={s.signal} className="px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--color-warning)15", color: "var(--color-warning)" }}>
                  {s.signal} ({s.weight.toFixed(2)})
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="text-base font-bold tabular-nums" style={{ color: "var(--color-primary)" }}>{theme.convergence.toFixed(2)}</div>
          <div className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>density {theme.density.toFixed(2)}</div>
        </div>
      </div>

      {brief && (
        <div className="mt-2 pt-2" style={{ borderTop: "1px solid var(--color-border)" }}>
          <button
            type="button"
            className="flex items-center gap-1.5 text-[11px] font-medium"
            style={{ color: "var(--color-primary)" }}
            onClick={() => setBriefOpen((open) => !open)}
          >
            {briefOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            Brief
            {brief.stale && (
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                style={{ color: "var(--color-warning)", backgroundColor: "var(--color-warning)15" }}
              >
                STALE
              </span>
            )}
          </button>

          {briefOpen && (
            <div className="mt-2 space-y-2">
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  {brief.title}
                </span>
                <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                  Generated {new Date(brief.generated_at).toLocaleString()}
                </span>
              </div>

              {brief.stale && (
                <div
                  className="text-[11px] font-medium px-2 py-1 rounded"
                  style={{ color: "var(--color-warning)", backgroundColor: "var(--color-warning)15" }}
                >
                  STALE — membership changed since generation
                </div>
              )}

              <div className="p-2 rounded" style={{ backgroundColor: "var(--color-surface-raised)" }}>
                <GfmSection markdown={brief.brief_md} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
