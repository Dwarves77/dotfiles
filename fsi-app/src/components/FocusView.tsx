"use client";

import { useNavigationStore } from "@/stores/navigationStore";
import { ResourceCard } from "@/components/resource/ResourceCard";
import { TimelineBar } from "@/components/resource/TimelineBar";
import type { Resource } from "@/types/resource";
import { X } from "lucide-react";

interface FocusViewProps {
  resources: Resource[];
}

export function FocusView({ resources }: FocusViewProps) {
  const { focusView, clearNav } = useNavigationStore();

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
          className="p-1 text-text-secondary hover:text-text-primary cursor-pointer transition-colors"
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>

      {/* Timeline preview for items with timelines */}
      <div className="space-y-2">
        {items.map((r) => (
          <div key={r.id}>
            <ResourceCard
              resource={r}
              why={focusView.why?.[r.id]}
            />
            {r.timeline && r.timeline.length > 0 && (
              <div className="mt-1 ml-4">
                <TimelineBar items={r.timeline} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
