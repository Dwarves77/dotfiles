"use client";

// Per-item metadata strip rendered alongside IntelligenceBrief.
// Surfaces the structured intersection-readiness fields the agent
// emits during regeneration: topic_tags, operational_scenario_tags,
// compliance_object_tags, related_items, intersection_summary,
// plus the severity/urgency/format_type triad and last regeneration
// timestamp.
//
// Self-fetching: takes itemId, queries /api/intelligence-items/[id]/metadata.
// Renders nothing while loading (no skeleton thrash) — strip appears
// when ready, ~50-200ms.

import { useEffect, useState } from "react";
import { Tag, Building, Layers, Clock, Link as LinkIcon } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

interface ItemMetadata {
  id: string;
  legacy_id: string | null;
  title: string;
  item_type: string | null;
  severity: string | null;
  priority: string | null;
  urgency_tier: string | null;
  format_type: string | null;
  topic_tags: string[];
  operational_scenario_tags: string[];
  compliance_object_tags: string[];
  related_items: Array<{ id: string; title: string; legacy_id: string | null }>;
  intersection_summary: string | null;
  sources_used_count: number;
  last_regenerated_at: string | null;
  regeneration_skill_version: string | null;
}

const SEVERITY_COLORS: Record<string, string> = {
  "ACTION REQUIRED": "var(--color-error)",
  "COST ALERT": "var(--color-warning)",
  "WINDOW CLOSING": "var(--color-warning)",
  "COMPETITIVE EDGE": "var(--color-primary)",
  "MONITORING": "var(--color-text-secondary)",
};

const URGENCY_COLORS: Record<string, string> = {
  watch: "var(--color-error)",
  elevated: "var(--color-warning)",
  stable: "var(--color-success)",
  informational: "var(--color-text-muted)",
};

interface Props {
  itemId: string;
}

export function IntelligenceMetadataStrip({ itemId }: Props) {
  const supabase = createSupabaseBrowserClient();
  const [meta, setMeta] = useState<ItemMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`/api/intelligence-items/${itemId}/metadata`, {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });
        if (cancelled) return;
        if (!res.ok) {
          const payload = await res.json();
          setError(payload.error || `HTTP ${res.status}`);
          return;
        }
        const payload = await res.json();
        setMeta(payload.item);
      } catch (e: any) {
        if (!cancelled) setError(e.message);
      }
    })();
    return () => { cancelled = true; };
  }, [itemId]); // eslint-disable-line react-hooks/exhaustive-deps

  // While loading, render nothing — strip materialises when ready
  if (error || !meta) return null;

  // If the item hasn't been regenerated under the current contract, skip
  if (!meta.regeneration_skill_version) return null;

  const sevColor = meta.severity ? SEVERITY_COLORS[meta.severity] || "var(--color-text-secondary)" : null;
  const urgColor = meta.urgency_tier ? URGENCY_COLORS[meta.urgency_tier] || "var(--color-text-muted)" : null;

  const hasIntersection = meta.intersection_summary || meta.related_items.length > 0;

  return (
    <div
      className="rounded-lg border p-4 mb-4 space-y-3"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
    >
      {/* Top row: severity + urgency + format + last regen */}
      <div className="flex items-center gap-3 flex-wrap text-[11px]">
        {meta.severity && sevColor && (
          <span className="px-2 py-0.5 rounded font-semibold uppercase tracking-wide" style={{ color: sevColor, backgroundColor: "var(--color-surface-raised)" }}>
            {meta.severity}
          </span>
        )}
        {meta.urgency_tier && urgColor && (
          <span className="px-2 py-0.5 rounded font-medium" style={{ color: urgColor, backgroundColor: "var(--color-surface-raised)" }}>
            {meta.urgency_tier}
          </span>
        )}
        {meta.format_type && (
          <span className="px-2 py-0.5 rounded" style={{ color: "var(--color-text-muted)", backgroundColor: "var(--color-surface-raised)" }}>
            {meta.format_type.replace(/_/g, " ")}
          </span>
        )}
        {meta.last_regenerated_at && (
          <span className="ml-auto flex items-center gap-1" style={{ color: "var(--color-text-muted)" }}>
            <Clock size={10} />
            regenerated {new Date(meta.last_regenerated_at).toLocaleDateString()}
            {meta.regeneration_skill_version && ` · contract ${meta.regeneration_skill_version}`}
          </span>
        )}
      </div>

      {/* Tags grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px]">
        {meta.topic_tags.length > 0 && (
          <TagSection label="Topics" icon={<Tag size={10} />} tags={meta.topic_tags} accent="var(--color-text-secondary)" />
        )}
        {meta.operational_scenario_tags.length > 0 && (
          <TagSection label="Operational scenarios" icon={<Layers size={10} />} tags={meta.operational_scenario_tags} accent="var(--color-primary)" />
        )}
        {meta.compliance_object_tags.length > 0 && (
          <TagSection label="Compliance objects" icon={<Building size={10} />} tags={meta.compliance_object_tags} accent="var(--color-warning)" />
        )}
      </div>

      {/* Intersection block */}
      {hasIntersection && (
        <div
          className="p-3 rounded"
          style={{ backgroundColor: "var(--color-primary)10", borderLeft: "3px solid var(--color-primary)" }}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <LinkIcon size={11} style={{ color: "var(--color-primary)" }} />
            <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-primary)" }}>
              Intersections with adjacent regulations
            </span>
          </div>
          {meta.intersection_summary && (
            <p className="text-[12px] leading-relaxed mb-2" style={{ color: "var(--color-text-primary)" }}>
              {meta.intersection_summary}
            </p>
          )}
          {meta.related_items.length > 0 && (
            <div className="text-[11px] space-y-0.5">
              <span style={{ color: "var(--color-text-muted)" }}>Related items:</span>
              <ul className="ml-4 list-disc">
                {meta.related_items.map((r) => (
                  <li key={r.id} style={{ color: "var(--color-text-secondary)" }}>
                    {r.title}
                    {r.legacy_id && <span className="ml-1.5 text-[10px] tabular-nums" style={{ color: "var(--color-text-muted)" }}>{r.legacy_id}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Source count footer */}
      <div className="text-[10px] flex items-center justify-end" style={{ color: "var(--color-text-muted)" }}>
        Brief grounded in {meta.sources_used_count} source{meta.sources_used_count === 1 ? "" : "s"} from the registry
      </div>
    </div>
  );
}

function TagSection({ label, icon, tags, accent }: { label: string; icon: React.ReactNode; tags: string[]; accent: string }) {
  return (
    <div>
      <div className="flex items-center gap-1 mb-1" style={{ color: "var(--color-text-muted)" }}>
        {icon}
        <span className="font-semibold uppercase tracking-wide text-[10px]">{label}</span>
        <span className="text-[10px] tabular-nums">({tags.length})</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {tags.map((t) => (
          <span
            key={t}
            className="px-1.5 py-0.5 rounded text-[11px]"
            style={{ color: accent, backgroundColor: "var(--color-surface-raised)" }}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
