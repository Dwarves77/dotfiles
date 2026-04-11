"use client";

import { cn } from "@/lib/cn";
import { useNavigationStore } from "@/stores/navigationStore";
import { useResourceStore } from "@/stores/resourceStore";
import { ResourceCard } from "@/components/resource/ResourceCard";
import { ResourceDetail } from "@/components/resource/ResourceDetail";
import { TOPIC_COLORS } from "@/lib/constants";
import type { Resource, ChangeLogEntry, Dispute, Supersession } from "@/types/resource";
import { X } from "lucide-react";

interface FocusViewProps {
  resources: Resource[];
  changelog: Record<string, ChangeLogEntry[]>;
  disputes: Record<string, Dispute>;
  xrefPairs: [string, string][];
  supersessions: Supersession[];
  resourceMap: Map<string, Resource>;
  onToast: (msg: string) => void;
}

export function FocusView({
  resources,
  changelog,
  disputes,
  xrefPairs,
  supersessions,
  resourceMap,
  onToast,
}: FocusViewProps) {
  const { focusView, clearNav } = useNavigationStore();
  const { expandedId } = useResourceStore();

  if (!focusView) return null;

  const items = focusView.resourceIds
    .map((id) => resources.find((r) => r.id === id))
    .filter(Boolean) as Resource[];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">{focusView.title}</h2>
          <span className="text-xs text-text-secondary">
            {items.length} item{items.length !== 1 ? "s" : ""}
          </span>
        </div>
        <button
          onClick={clearNav}
          aria-label="Close focus view"
          className="p-1 text-text-secondary hover:text-text-primary cursor-pointer transition-colors"
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm font-medium text-text-primary">No matching resources</p>
          <p className="text-xs mt-1 text-text-secondary">
            The resources in this view may have been archived or removed.
          </p>
        </div>
      ) : (
      <div className="flex flex-col gap-2">
        {items.map((r) => {
          const isExpanded = expandedId === r.id;
          return (
            <div
              key={r.id}
              id={`resource-${r.id}`}
              className={cn(
                "cl-row-card card-expand",
                `cl-priority-${r.priority.toLowerCase()}`,
                isExpanded && "ring-1 ring-[var(--color-border-medium)]"
              )}
            >
              <ResourceCard
                resource={r}
                why={focusView.why?.[r.id]}
                embedded
              />
              {isExpanded && (
                <ResourceDetail
                  resource={r}
                  changelog={changelog}
                  disputes={disputes}
                  xrefPairs={xrefPairs}
                  supersessions={supersessions}
                  resourceMap={resourceMap}
                  onToast={onToast}
                />
              )}
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
