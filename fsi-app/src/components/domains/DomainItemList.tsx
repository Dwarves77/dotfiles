"use client";

import { useMemo, useState } from "react";
import { useResourceStore } from "@/stores/resourceStore";
import { SectorSynopsisView } from "@/components/resource/SectorSynopsis";
import { PriorityBadge } from "@/components/ui/PriorityBadge";
import { INFO_TYPE_COLORS, INFO_TYPE_LABELS, getInfoType } from "@/lib/constants";
import { UrgencyFilterBar, MARKET_INTEL_URGENCY, RESEARCH_URGENCY } from "@/components/ui/UrgencyFilterBar";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Resource } from "@/types/resource";

interface DomainItemListProps {
  domain: number;
  emptyMessage?: string;
}

export function DomainItemList({ domain, emptyMessage }: DomainItemListProps) {
  const resources = useResourceStore((s) => s.resources);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [urgencyFilter, setUrgencyFilter] = useState<string | null>(null);

  const domainItems = useMemo(() => {
    return resources.filter((r) => {
      if (domain === 2) return r.type === "technology";
      if (domain === 3) return r.topic === "regional" || r.sub === "regional";
      if (domain === 4) return r.type === "market_signal";
      if (domain === 6) return r.topic === "facility" || r.sub === "facility";
      if (domain === 7) return r.type === "research_finding";
      return false;
    });
  }, [resources, domain]);

  // Urgency counts for the filter bar
  const urgencyCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    domainItems.forEach((r) => { counts[r.priority] = (counts[r.priority] || 0) + 1; });
    return counts;
  }, [domainItems]);

  // Apply urgency filter
  const filteredItems = useMemo(() => {
    if (!urgencyFilter) return domainItems;
    return domainItems.filter((r) => r.priority === urgencyFilter);
  }, [domainItems, urgencyFilter]);

  // Which urgency config to use
  const urgencyConfig = domain === 4 || domain === 2 ? MARKET_INTEL_URGENCY : domain === 7 ? RESEARCH_URGENCY : null;

  if (domainItems.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Urgency filter bar */}
      {urgencyConfig && (
        <div className="mb-2">
          <UrgencyFilterBar
            options={urgencyConfig}
            activeFilter={urgencyFilter}
            onFilter={setUrgencyFilter}
            counts={urgencyCounts}
          />
        </div>
      )}

      {filteredItems.map((item) => {
        const isExpanded = expandedId === item.id;
        return (
          <div
            key={item.id}
            className={cn(
              "rounded-lg border transition-all duration-200",
              isExpanded && "ring-1 ring-[var(--color-border-medium)]"
            )}
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-surface)",
              borderLeftColor: INFO_TYPE_COLORS[getInfoType(item.type)],
              borderLeftWidth: "3px",
            }}
          >
            {/* Card header */}
            <button
              onClick={() => setExpandedId(isExpanded ? null : item.id)}
              className="w-full flex items-start gap-3 p-4 text-left cursor-pointer"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h3
                    className="text-[15px] font-bold leading-snug"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {item.title}
                  </h3>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* TODO: badge-migration — PriorityBadge does not yet
                        support a `label` override. The previous Badge call
                        displayed urgencyConfig's localized label (e.g.
                        "Tracking" / "Watching") instead of the bare priority
                        enum. Re-introduce a `label?: string` prop on
                        PriorityBadge if those custom labels need to come
                        back, or render a separate inline label here. */}
                    <PriorityBadge level={item.priority} />
                    <ChevronDown
                      size={14}
                      className={cn(
                        "transition-transform duration-200",
                        isExpanded && "rotate-180"
                      )}
                      style={{ color: "var(--color-text-muted)" }}
                    />
                  </div>
                </div>
                <p
                  className="text-[13px] leading-relaxed line-clamp-2"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {item.note || item.whatIsIt}
                </p>
              </div>
            </button>

            {/* Expanded: sector synopsis */}
            {isExpanded && (
              <div
                className="px-4 pb-4 pt-2"
                style={{ borderTop: "1px solid var(--color-border-subtle)" }}
              >
                <SectorSynopsisView
                  itemId={item.id}
                  fullBrief={item.fullBrief}
                  fallbackWhatIsIt={item.whatIsIt}
                  fallbackWhyMatters={item.whyMatters}
                  fallbackKeyData={item.keyData}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
