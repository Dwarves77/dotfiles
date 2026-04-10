"use client";

import { useMemo } from "react";
import { useNavigationStore } from "@/stores/navigationStore";
import type { Resource, Dispute, ChangeLogEntry } from "@/types/resource";
import { AlertTriangle, ArrowUp, Eye, Shield } from "lucide-react";

interface SummaryStripProps {
  resources: Resource[];
  changelog: Record<string, ChangeLogEntry[]>;
  disputes: Record<string, Dispute>;
}

export function SummaryStrip({ resources, changelog, disputes }: SummaryStripProps) {
  const { pushFocusView } = useNavigationStore();

  const stats = useMemo(() => {
    const critical = resources.filter((r) => r.priority === "CRITICAL");
    const high = resources.filter((r) => r.priority === "HIGH");
    const moderate = resources.filter((r) => r.priority === "MODERATE");
    const low = resources.filter((r) => r.priority === "LOW");
    return { critical, high, moderate, low };
  }, [resources]);

  const cards = [
    {
      label: "Critical",
      desc: "Immediate action — 90 days",
      count: stats.critical.length,
      icon: AlertTriangle,
      color: "#DC2626",
      bg: "rgba(220, 38, 38, 0.08)",
      ids: stats.critical,
    },
    {
      label: "High",
      desc: "Action needed — 6 months",
      count: stats.high.length,
      icon: ArrowUp,
      color: "#D97706",
      bg: "rgba(217, 119, 6, 0.08)",
      ids: stats.high,
    },
    {
      label: "Moderate",
      desc: "Monitor — 6-12 month horizon",
      count: stats.moderate.length,
      icon: Eye,
      color: "#CA8A04",
      bg: "rgba(202, 138, 4, 0.08)",
      ids: stats.moderate,
    },
    {
      label: "Low",
      desc: "No action needed — awareness only",
      count: stats.low.length,
      icon: Shield,
      color: "#16A34A",
      bg: "rgba(22, 163, 74, 0.08)",
      ids: stats.low,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Priority legend */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
        {[
          { label: "CRITICAL", color: "#DC2626", desc: "90 days" },
          { label: "HIGH", color: "#D97706", desc: "6 months" },
          { label: "MODERATE", color: "#CA8A04", desc: "6–12 months" },
          { label: "LOW", color: "#16A34A", desc: "Awareness" },
        ].map(({ label, color, desc }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="shrink-0 w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
              <span className="font-bold" style={{ color }}>{label}</span> {desc}
            </span>
          </div>
        ))}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {cards.map(({ label, desc, count, icon: Icon, color, bg, ids }) => (
          <button
            key={label}
            onClick={() =>
              pushFocusView({
                title: `${label} Priority`,
                resourceIds: ids.map((r) => r.id),
                why: Object.fromEntries(
                  ids.map((r) => [r.id, r.reasoning || `${label} priority`])
                ),
              })
            }
            className="cl-stat-card cursor-pointer group"
          >
            <div
              className="inline-flex items-center justify-center w-10 h-10 rounded-xl mb-3"
              style={{ backgroundColor: bg }}
            >
              <Icon size={20} strokeWidth={2} style={{ color }} />
            </div>
            <div
              className="cl-stat-number tabular-nums mb-1"
            >
              {count}
            </div>
            <div
              className="text-xs font-bold tracking-widest uppercase mb-0.5"
              style={{ color }}
            >
              {label}
            </div>
            <div className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
              {desc}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
