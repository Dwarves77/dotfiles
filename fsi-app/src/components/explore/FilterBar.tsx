"use client";

import { Pill } from "@/components/ui/Pill";
import { useResourceStore } from "@/stores/resourceStore";
import { MODES, TOPICS, JURISDICTIONS, PRIORITIES, PRIORITY_COLORS, TOPIC_COLORS } from "@/lib/constants";
import { useMemo } from "react";
import { X } from "lucide-react";

export function FilterBar() {
  const { filters, toggleFilter, clearFilters, resources } = useResourceStore();
  const hasActiveFilters = filters.modes.length > 0 || filters.topics.length > 0 ||
    filters.jurisdictions.length > 0 || filters.priorities.length > 0;

  // Compute counts for each filter value
  const counts = useMemo(() => {
    const modeCounts: Record<string, number> = {};
    const topicCounts: Record<string, number> = {};
    const jurCounts: Record<string, number> = {};
    const priCounts: Record<string, number> = {};

    resources.forEach((r) => {
      const modes = r.modes || [r.cat];
      modes.forEach((m) => { modeCounts[m] = (modeCounts[m] || 0) + 1; });
      const topic = r.topic || r.sub;
      topicCounts[topic] = (topicCounts[topic] || 0) + 1;
      const jur = r.jurisdiction || "";
      jurCounts[jur] = (jurCounts[jur] || 0) + 1;
      priCounts[r.priority] = (priCounts[r.priority] || 0) + 1;
    });

    return { modeCounts, topicCounts, jurCounts, priCounts };
  }, [resources]);

  return (
    <div className="space-y-3">
      {/* Clear Filters */}
      {hasActiveFilters && (
        <button
          onClick={clearFilters}
          className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary cursor-pointer transition-colors"
        >
          <X size={12} strokeWidth={2} />
          Clear all filters
        </button>
      )}
      {/* Modes */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold tracking-wider uppercase text-text-secondary mr-1 w-12">Mode</span>
        {MODES.map(({ id, label }) => (
          <Pill
            key={id}
            label={label}
            active={filters.modes.includes(id)}
            count={counts.modeCounts[id]}
            onClick={() => toggleFilter("modes", id)}
          />
        ))}
      </div>

      {/* Topics */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold tracking-wider uppercase text-text-secondary mr-1 w-12">Topic</span>
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
      </div>

      {/* Jurisdictions — grouped by region */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold tracking-wider uppercase text-text-secondary mr-1 w-12">Region</span>
        {JURISDICTIONS.filter(({ id }) => counts.jurCounts[id]).map(({ id, label }) => (
          <Pill
            key={id}
            label={label}
            active={filters.jurisdictions.includes(id)}
            count={counts.jurCounts[id]}
            onClick={() => toggleFilter("jurisdictions", id)}
          />
        ))}
      </div>

      {/* Priorities */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold tracking-wider uppercase text-text-secondary mr-1 w-12">Priority</span>
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
      </div>
    </div>
  );
}
