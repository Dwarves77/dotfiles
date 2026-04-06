"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { useNavigationStore } from "@/stores/navigationStore";
import { Badge } from "@/components/ui/Badge";
import { PRIORITY_COLORS } from "@/lib/constants";
import type { Resource, ChangeLogEntry } from "@/types/resource";
import { ChevronDown } from "lucide-react";

interface WhatChangedProps {
  resources: Resource[];
  changelog: Record<string, ChangeLogEntry[]>;
  auditDate?: string;
}

export function WhatChanged({ resources, changelog, auditDate }: WhatChangedProps) {
  const { pushFocusView, navigateToResource } = useNavigationStore();
  const [open, setOpen] = useState(false);

  const changedIds = Object.keys(changelog);
  const changed = resources.filter((r) => changedIds.includes(r.id));
  const newResources = auditDate
    ? resources.filter((r) => r.added === auditDate)
    : [];

  if (changed.length === 0 && newResources.length === 0) return null;

  const allIds = [...new Set([...newResources.map((r) => r.id), ...changed.map((r) => r.id)])];

  return (
    <div className="border rounded-lg border-[var(--color-border)] bg-[var(--color-surface)]">
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
          <div>
            <h3 className="text-[13px] font-semibold tracking-wider uppercase text-text-secondary group-hover:text-text-primary transition-colors">
              What Changed ({allIds.length})
            </h3>
            <p className="text-[11px] text-text-muted mt-0.5">
              Since last audit — {auditDate || "recent"}
            </p>
          </div>
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
              <span className="text-xs font-bold tracking-wider uppercase text-[#34C759] block mb-2">
                New ({newResources.length})
              </span>
              <div className="divide-y divide-border-subtle">
                {newResources.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => navigateToResource(r.id)}
                    className="w-full text-left flex items-center gap-3 px-1 py-2.5 hover:bg-surface-overlay cursor-pointer transition-colors"
                  >
                    <span className="text-xs font-semibold text-[#34C759] shrink-0">NEW</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-text-primary truncate">{r.title}</p>
                      <p className="text-xs text-text-secondary truncate">{r.note}</p>
                    </div>
                    <Badge label={r.priority} color={PRIORITY_COLORS[r.priority]} />
                  </button>
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
              <div className="divide-y divide-border-subtle">
                {changed.map((r) => {
                  const changes = changelog[r.id] || [];
                  return (
                    <button
                      key={r.id}
                      onClick={() => navigateToResource(r.id)}
                      className="w-full text-left px-1 py-3 hover:bg-surface-overlay cursor-pointer transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-medium text-text-primary truncate flex-1">
                          {r.title}
                        </p>
                        <Badge label={r.priority} color={PRIORITY_COLORS[r.priority]} />
                      </div>
                      {changes.map((ch, i) => (
                        <div key={i} className="mb-1.5 last:mb-0">
                          <span className="text-xs font-semibold text-[#C77700]">
                            {ch.fields?.join(", ")}
                          </span>
                          {ch.prev && (
                            <p className="text-xs text-text-secondary line-through">
                              {ch.prev.slice(0, 120)}
                            </p>
                          )}
                          {ch.now && (
                            <p className="text-xs text-text-primary font-medium">
                              {ch.now.slice(0, 120)}
                            </p>
                          )}
                          {ch.impact && (
                            <p className="text-xs text-[#C77700]">{ch.impact}</p>
                          )}
                        </div>
                      ))}
                    </button>
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
