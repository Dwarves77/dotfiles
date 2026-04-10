"use client";

import { useMemo } from "react";
import { useNavigationStore } from "@/stores/navigationStore";
import type { Resource, Dispute, ChangeLogEntry } from "@/types/resource";
import { AlertTriangle, ArrowUp, Minus, ArrowDown } from "lucide-react";

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
      icon: Minus,
      color: "#CA8A04",
      bg: "rgba(202, 138, 4, 0.08)",
      ids: stats.moderate,
    },
    {
      label: "Low",
      desc: "Awareness only",
      count: stats.low.length,
      icon: ArrowDown,
      color: "#16A34A",
      bg: "rgba(22, 163, 74, 0.08)",
      ids: stats.low,
    },
  ];

  return (
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
            className="text-4xl font-black tabular-nums mb-1"
            style={{ color: "var(--color-text-primary)" }}
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
  );
}
