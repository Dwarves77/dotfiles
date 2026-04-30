"use client";

// Real-time B.2 regeneration progress banner.
//
// Reads /api/admin/b2-progress every 30s and renders a compact stats
// view: contract version, % complete, breakdown by format, tag-coverage
// gauges, recent regenerations. Useful during long full-B.2 runs where
// the user wants visibility into the queue without paging through item
// lists.

import { useEffect, useState } from "react";
import { Loader2, Activity, RefreshCw } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

interface Progress {
  contract_version: string;
  total_eligible: number;
  at_current: number;
  at_older_version: number;
  never_regenerated: number;
  pct_complete: number;
  by_format: Record<string, number>;
  by_priority: Record<string, number>;
  tag_coverage: {
    has_op_scenario_tags: number;
    has_compliance_object_tags: number;
    has_intersection_summary: number;
    has_related_items: number;
  };
  recent_regenerations: Array<{
    legacy_id: string | null;
    item_type: string;
    priority: string;
    last_regenerated_at: string;
  }>;
}

export function B2ProgressBanner() {
  const supabase = createSupabaseBrowserClient();
  const [data, setData] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  async function load() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/b2-progress", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error || "Failed to load progress");
      } else {
        setData(payload);
        setRefreshedAt(new Date());
        setError(null);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30000); // refresh every 30s
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg border text-xs"
        style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
        <Loader2 size={12} className="animate-spin" /> Loading B.2 progress…
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-3 rounded text-xs" style={{ backgroundColor: "var(--color-error)15", color: "var(--color-error)" }}>
        {error}
      </div>
    );
  }
  if (!data) return null;

  const barColor =
    data.pct_complete >= 80 ? "var(--color-success)" :
    data.pct_complete >= 40 ? "var(--color-warning)" :
    "var(--color-primary)";

  return (
    <div
      className="rounded-lg border p-4"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <Activity size={14} style={{ color: "var(--color-primary)" }} />
            <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
              B.2 Regeneration Progress
            </span>
            <span className="text-[10px] tabular-nums" style={{ color: "var(--color-text-muted)" }}>
              contract {data.contract_version}
            </span>
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            {data.at_current} / {data.total_eligible} items at current contract
            {data.at_older_version > 0 && ` · ${data.at_older_version} on older version`}
            {data.never_regenerated > 0 && ` · ${data.never_regenerated} never regenerated`}
          </div>
        </div>
        <button onClick={load} className="text-[11px] flex items-center gap-1" style={{ color: "var(--color-primary)" }}>
          <RefreshCw size={10} /> {refreshedAt ? `${Math.round((Date.now() - refreshedAt.getTime()) / 1000)}s ago` : "refresh"}
        </button>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--color-surface-raised)" }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${data.pct_complete}%`, backgroundColor: barColor }}
          />
        </div>
        <div className="text-right text-[11px] tabular-nums mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
          {data.pct_complete}% complete
        </div>
      </div>

      {/* Breakdowns */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-[11px]">
        <Group label="By format" entries={Object.entries(data.by_format)} />
        <Group label="By priority" entries={Object.entries(data.by_priority)} />
        <div>
          <div className="font-semibold mb-1" style={{ color: "var(--color-text-secondary)" }}>Tag coverage (of {data.at_current})</div>
          <div className="space-y-0.5">
            <Coverage label="op_scenario_tags" value={data.tag_coverage.has_op_scenario_tags} total={data.at_current} />
            <Coverage label="compliance_object_tags" value={data.tag_coverage.has_compliance_object_tags} total={data.at_current} />
            <Coverage label="intersection_summary" value={data.tag_coverage.has_intersection_summary} total={data.at_current} />
            <Coverage label="related_items" value={data.tag_coverage.has_related_items} total={data.at_current} />
          </div>
        </div>
        <div>
          <div className="font-semibold mb-1" style={{ color: "var(--color-text-secondary)" }}>Recent (last 10)</div>
          <div className="space-y-0.5" style={{ color: "var(--color-text-muted)" }}>
            {data.recent_regenerations.slice(0, 5).map((r) => (
              <div key={r.legacy_id || r.last_regenerated_at} className="truncate">
                {r.legacy_id || "(uuid)"} · {r.item_type}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Group({ label, entries }: { label: string; entries: Array<[string, number]> }) {
  return (
    <div>
      <div className="font-semibold mb-1" style={{ color: "var(--color-text-secondary)" }}>{label}</div>
      <div className="space-y-0.5">
        {entries
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => (
            <div key={k} className="flex justify-between" style={{ color: "var(--color-text-muted)" }}>
              <span className="truncate">{k}</span>
              <span className="tabular-nums">{v}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

function Coverage({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100);
  return (
    <div className="flex justify-between" style={{ color: "var(--color-text-muted)" }}>
      <span className="truncate">{label}</span>
      <span className="tabular-nums">{value} ({pct}%)</span>
    </div>
  );
}
