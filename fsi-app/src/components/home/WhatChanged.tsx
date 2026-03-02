"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { useNavigationStore } from "@/stores/navigationStore";
import { ResourceCard } from "@/components/resource/ResourceCard";
import type { Resource, ChangeLogEntry } from "@/types/resource";
import { ChevronDown } from "lucide-react";

interface WhatChangedProps {
  resources: Resource[];
  changelog: Record<string, ChangeLogEntry[]>;
  auditDate?: string;
}

export function WhatChanged({ resources, changelog, auditDate }: WhatChangedProps) {
  const { pushFocusView } = useNavigationStore();
  const [open, setOpen] = useState(true);

  const changedIds = Object.keys(changelog);
  const changed = resources.filter((r) => changedIds.includes(r.id));
  const newResources = auditDate
    ? resources.filter((r) => r.added === auditDate)
    : [];

  if (changed.length === 0 && newResources.length === 0) return null;

  const allIds = [...new Set([...newResources.map((r) => r.id), ...changed.map((r) => r.id)])];

  return (
    <div className="border border-border-subtle rounded-[2px] bg-surface-subtle">
      <div className="flex items-center justify-between p-4">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 cursor-pointer group"
        >
          <ChevronDown
            size={14}
            strokeWidth={2}
            className={cn(
              "text-text-secondary transition-transform duration-300",
              !open && "-rotate-90"
            )}
            style={{ transitionTimingFunction: "var(--ease-out-expo)" }}
          />
          <span className="text-xs font-semibold tracking-wider uppercase text-text-secondary group-hover:text-text-primary transition-colors">
            What Changed ({allIds.length})
          </span>
        </button>
        <button
          onClick={() =>
            pushFocusView({
              title: "What Changed",
              resourceIds: allIds,
            })
          }
          className="text-xs text-text-secondary hover:text-text-primary cursor-pointer transition-colors"
        >
          View all &rarr;
        </button>
      </div>
      {open && (
        <div className="px-4 pb-4 space-y-4">
          {/* NEW Resources */}
          {newResources.length > 0 && (
            <div>
              <span className="text-xs font-semibold tracking-wider uppercase text-[#34C759] block mb-2">
                New ({newResources.length})
              </span>
              <div className="space-y-2">
                {newResources.map((r) => (
                  <ResourceCard key={r.id} resource={r} why="New resource" />
                ))}
              </div>
            </div>
          )}

          {/* UPDATED Resources */}
          {changed.length > 0 && (
            <div>
              <span className="text-xs font-semibold tracking-wider uppercase text-[#C77700] block mb-2">
                Updated ({changed.length})
              </span>
              <div className="space-y-2">
                {changed.map((r) => {
                  const changes = changelog[r.id] || [];
                  const summary = changes
                    .map((ch) => {
                      const parts: string[] = [];
                      if (ch.fields?.length) parts.push(ch.fields.join(", "));
                      if (ch.impact) parts.push(ch.impact);
                      return parts.join(" — ");
                    })
                    .filter(Boolean)
                    .join("; ");
                  return (
                    <div key={r.id}>
                      <ResourceCard resource={r} why={summary || "Updated"} />
                      {/* Change details below card */}
                      {changes.some((ch) => ch.prev || ch.now) && (
                        <div className="mt-1 ml-4 space-y-1">
                          {changes.map((ch, i) => (
                            <div key={i} className="text-xs">
                              {ch.prev && (
                                <p className="text-text-secondary line-through">
                                  {ch.prev.slice(0, 120)}
                                </p>
                              )}
                              {ch.now && (
                                <p className="text-text-primary font-medium">
                                  {ch.now.slice(0, 120)}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
