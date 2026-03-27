"use client";

import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";
import { ModeBadge } from "@/components/ui/ModeBadge";
import { Tag } from "@/components/ui/Tag";
import { useResourceStore } from "@/stores/resourceStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { PRIORITY_COLORS, TOPIC_COLORS } from "@/lib/constants";
import { ChevronDown, Share2 } from "lucide-react";
import type { Resource } from "@/types/resource";

interface ResourceCardProps {
  resource: Resource;
  why?: string;
  onShareClick?: (e: React.MouseEvent) => void;
  embedded?: boolean;
}

export function ResourceCard({ resource: r, why, onShareClick, embedded }: ResourceCardProps) {
  const { expandedId, setExpanded } = useResourceStore();
  const { toggleFilter } = useResourceStore();
  const { pushFocusView } = useNavigationStore();
  const isExpanded = expandedId === r.id;
  const modes = r.modes || [r.cat];
  const topicColor = TOPIC_COLORS[r.topic || ""] || undefined;

  const content = (
    <div
      className="flex items-start gap-3 px-4 py-3.5 cursor-pointer"
      onClick={() => setExpanded(isExpanded ? null : r.id)}
    >
        <div className="flex-1 min-w-0">
          {/* Mode badges + priority */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5">
              {modes.map((m) =>
                m === "air" || m === "road" || m === "ocean" ? (
                  <ModeBadge
                    key={m}
                    mode={m as "air" | "road" | "ocean"}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFilter("modes", m);
                    }}
                  />
                ) : null
              )}
            </div>
            <div className="flex items-center gap-2">
              <Badge
                label={r.priority}
                color={PRIORITY_COLORS[r.priority]}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFilter("priorities", r.priority);
                }}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onShareClick) {
                    onShareClick(e);
                  } else {
                    // Expand card to access share menu
                    setExpanded(r.id);
                  }
                }}
                className="p-1 text-text-secondary hover:text-text-primary transition-colors duration-200"
              >
                <Share2 size={12} strokeWidth={2} />
              </button>
              <ChevronDown
                size={14}
                strokeWidth={2}
                className={cn(
                  "text-text-secondary transition-transform duration-300",
                  isExpanded && "rotate-180"
                )}
                style={{ transitionTimingFunction: "var(--ease-out-expo)" }}
              />
            </div>
          </div>

          {/* Title */}
          <h3 className="text-[15px] font-semibold text-text-primary leading-tight mb-1" style={{ letterSpacing: "-0.1px" }}>
            {r.title}
          </h3>

          {/* Note */}
          <p className="text-[13px] leading-[20px] text-text-secondary line-clamp-2 mb-1">
            {r.note}
          </p>

          {/* Reasoning — why this priority */}
          {r.reasoning && (
            <p className="text-[13px] leading-[20px] text-text-accent/80 line-clamp-2 mb-2 italic">
              {r.reasoning}
            </p>
          )}

          {/* Why (from focus view) */}
          {why && (
            <p className="text-[13px] text-text-accent italic mb-2">
              {why}
            </p>
          )}

          {/* Tags */}
          <div className="flex flex-wrap gap-1">
            {r.tags?.slice(0, 5).map((tag) => (
              <Tag
                key={tag}
                label={tag}
                onClick={(e) => {
                  e.stopPropagation();
                  // Filter by tag text (search)
                  useResourceStore.getState().setSearch(tag);
                }}
              />
            ))}
          </div>
        </div>
      </div>
  );

  if (embedded) return content;

  return (
    <div
      id={`resource-${r.id}`}
      className={cn(
        "border rounded-lg card-expand",
        "hover:border-border-light",
        isExpanded
          ? "border-border-light bg-surface-card"
          : "border-border-subtle bg-surface-card hover:bg-surface-card-hover hover:-translate-y-px"
      )}
      style={{
        borderLeftWidth: 4,
        borderLeftColor: topicColor || "var(--border-subtle)",
        transitionTimingFunction: "var(--ease-out-expo)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.25), 0 1px 2px rgba(0,0,0,0.18)",
        transition: "all 150ms ease",
      }}
    >
      {content}
    </div>
  );
}
