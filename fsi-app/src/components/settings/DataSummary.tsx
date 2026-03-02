"use client";

import { useMemo } from "react";
import type { Resource } from "@/types/resource";
import { JURISDICTIONS } from "@/lib/constants";
import { getJurisdiction } from "@/lib/scoring";

interface DataSummaryProps {
  resources: Resource[];
  archived: Resource[];
}

export function DataSummary({ resources, archived }: DataSummaryProps) {
  const stats = useMemo(() => {
    const byPri: Record<string, number> = {};
    const byJur: Record<string, number> = {};
    const byMode: Record<string, number> = {};
    const byTopic: Record<string, number> = {};

    resources.forEach((r) => {
      byPri[r.priority] = (byPri[r.priority] || 0) + 1;
      const jur = r.jurisdiction || getJurisdiction(r);
      byJur[jur] = (byJur[jur] || 0) + 1;
      const modes = r.modes || [r.cat];
      modes.forEach((m) => { byMode[m] = (byMode[m] || 0) + 1; });
      const topic = r.topic || r.sub;
      byTopic[topic] = (byTopic[topic] || 0) + 1;
    });

    return { byPri, byJur, byMode, byTopic };
  }, [resources]);

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold tracking-wider uppercase text-white">
        Data Summary
      </h3>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="text-center">
          <span className="text-2xl font-display text-white">{resources.length}</span>
          <span className="block text-xs text-[var(--sage)] uppercase tracking-wider">Active</span>
        </div>
        <div className="text-center">
          <span className="text-2xl font-display text-white">{archived.length}</span>
          <span className="block text-xs text-[var(--sage)] uppercase tracking-wider">Archived</span>
        </div>
        <div className="text-center">
          <span className="text-2xl font-display text-white">
            {Object.keys(stats.byJur).length}
          </span>
          <span className="block text-xs text-[var(--sage)] uppercase tracking-wider">Jurisdictions</span>
        </div>
        <div className="text-center">
          <span className="text-2xl font-display text-white">
            {Object.keys(stats.byTopic).length}
          </span>
          <span className="block text-xs text-[var(--sage)] uppercase tracking-wider">Topics</span>
        </div>
      </div>

      {/* Jurisdiction Coverage */}
      <div>
        <span className="text-xs font-semibold tracking-wider uppercase text-[var(--sage)] block mb-2">
          Jurisdiction Coverage
        </span>
        <div className="space-y-1">
          {Object.entries(stats.byJur)
            .sort(([, a], [, b]) => b - a)
            .map(([jur, count]) => {
              const label = JURISDICTIONS.find((j) => j.id === jur)?.label || jur;
              const pct = (count / resources.length) * 100;
              return (
                <div key={jur} className="flex items-center gap-2">
                  <span className="text-xs text-[var(--sage)] w-20 shrink-0">{label}</span>
                  <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--cyan)] rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-[var(--sage)] tabular-nums w-6 text-right">
                    {count}
                  </span>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
