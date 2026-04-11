"use client";

import { useMemo, useState } from "react";
import { useResourceStore } from "@/stores/resourceStore";
import { SectorSynopsisView } from "@/components/resource/SectorSynopsis";
import { Badge } from "@/components/ui/Badge";
import { PRIORITY_COLORS } from "@/lib/constants";
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

  // Filter resources by domain — resources from the store include all items
  // Domain items were inserted with a domain field; legacy items are domain 1
  const domainItems = useMemo(() => {
    // For now, domain filtering uses the item_type or category since domain isn't on the Resource type
    // Domain 2 = technology items, Domain 4 = market_signal items
    // We check if the resource has a matching category pattern
    return resources.filter((r) => r.domain === domain);
  }, [resources, domain]);

  if (domainItems.length === 0) {
    return (
      <div
        className="text-center py-12 rounded-lg"
        style={{ backgroundColor: "var(--color-surface-raised)", color: "var(--color-text-muted)" }}
      >
        <p className="text-sm">{emptyMessage || "No intelligence items in this domain yet."}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {domainItems.map((item) => {
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
                    <Badge label={item.priority} color={PRIORITY_COLORS[item.priority]} />
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
                  {item.note || item.whatIsIt?.slice(0, 200)}
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
