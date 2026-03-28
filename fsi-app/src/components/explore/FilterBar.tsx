"use client";

import { Pill } from "@/components/ui/Pill";
import { useResourceStore } from "@/stores/resourceStore";
import { MODES, TOPICS, JURISDICTIONS, PRIORITIES, VERTICALS, PRIORITY_COLORS, TOPIC_COLORS } from "@/lib/constants";
import { useMemo } from "react";
import { X } from "lucide-react";

export function FilterBar() {
    const { filters, toggleFilter, clearFilters, resources } = useResourceStore();

  const hasActiveFilters =
        filters.modes.length > 0 ||
        filters.topics.length > 0 ||
        filters.jurisdictions.length > 0 ||
        filters.priorities.length > 0 ||
        filters.verticals.length > 0;

  // Compute counts for each filter value
  const counts = useMemo(() => {
        const modeCounts: Record<string, number> = {};
        const topicCounts: Record<string, number> = {};
        const jurCounts: Record<string, number> = {};
        const priCounts: Record<string, number> = {};
        const vertCounts: Record<string, number> = {};

                             resources.forEach((r) => {
                                     const modes = r.modes || [r.cat];
                                     modes.forEach((m) => { modeCounts[m] = (modeCounts[m] || 0) + 1; });
                                     const topic = r.topic || r.sub;
                                     topicCounts[topic] = (topicCounts[topic] || 0) + 1;
                                     const jur = r.jurisdiction || "";
                                     jurCounts[jur] = (jurCounts[jur] || 0) + 1;
                                     priCounts[r.priority] = (priCounts[r.priority] || 0) + 1;
                                     const text = `${r.title} ${r.note} ${(r.tags || []).join(" ")} ${r.whatIsIt || ""} ${r.whyMatters || ""}`.toLowerCase();
                                     VERTICALS.forEach(({ id, keywords }) => {
                                               if (keywords.some((kw) => text.includes(kw))) {
                                                           vertCounts[id] = (vertCounts[id] || 0) + 1;
                                               }
                                     });
                             });

                             return { modeCounts, topicCounts, jurCounts, priCounts, vertCounts };
  }, [resources]);

  return (
        <div className="space-y-1">
          {/* Clear Filters */}
          {hasActiveFilters && (
                  <button
                              onClick={clearFilters}
                              className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary cursor-pointer transition-colors mb-2"
                            >
                            <X size={12} strokeWidth={2} />
                            Clear all filters
                  </button>
              )}
        
          {/* Modes */}
              <FilterRow label="Mode">
                {MODES.map(({ id, label }) => (
                    <Pill
                                  key={id}
                                  label={label}
                                  active={filters.modes.includes(id)}
                                  count={counts.modeCounts[id]}
                                  onClick={() => toggleFilter("modes", id)}
                                />
                  ))}
              </FilterRow>
        
          {/* Topics */}
              <FilterRow label="Topic">
                {TOPICS.map(({ id, label }) => (
                    <Pill
                                  key={id}
                                  label={label}
                                  active={filters.topics.includes(id)}
                                  count={counts.topicCounts[id]}
                                  color={TOPIC_COLORS[id]}
                                  onClick={() => toggleFilter("topics", id)}
                                />
                  ))}
              </FilterRow>
        
          {/* Jurisdictions */}
              <FilterRow label="Region">
                {JURISDICTIONS.filter(({ id }) => counts.jurCounts[id]).map(({ id, label }) => (
                    <Pill
                                  key={id}
                                  label={label}
                                  active={filters.jurisdictions.includes(id)}
                                  count={counts.jurCounts[id]}
                                  onClick={() => toggleFilter("jurisdictions", id)}
                                />
                  ))}
              </FilterRow>
        
          {/* Priorities */}
              <FilterRow label="Priority">
                {PRIORITIES.map((pri) => (
                    <Pill
                                  key={pri}
                                  label={pri}
                                  active={filters.priorities.includes(pri)}
                                  count={counts.priCounts[pri]}
                                  color={PRIORITY_COLORS[pri]}
                                  onClick={() => toggleFilter("priorities", pri)}
                                />
                  ))}
              </FilterRow>
        
          {/* Cargo Verticals */}
              <FilterRow label="Cargo">
                {VERTICALS.filter(({ id }) => counts.vertCounts[id]).map(({ id, label }) => (
                    <Pill
                                  key={id}
                                  label={label}
                                  active={filters.verticals.includes(id)}
                                  count={counts.vertCounts[id]}
                                  onClick={() => toggleFilter("verticals", id)}
                                />
                  ))}
              </FilterRow>
        </div>
      );
}

// ── FilterRow: category label above pills, all left-aligned ──────────────────
function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
          <div className="flex items-start gap-0 py-1.5 border-b border-white/[0.04] last:border-0">
            {/* Category label — visually distinct from pill options */}
                <div className="shrink-0 w-[72px] pt-1 mr-3">
                        <span className="text-[9px] font-black tracking-[0.18em] uppercase text-text-muted/70 block">
                          {label}
                        </span>
                </div>
            {/* Options — always left-justified */}
                <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
                  {children}
                </div>
          </div>
        );

      }