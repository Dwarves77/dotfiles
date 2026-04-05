"use client";

import { useMemo } from "react";
import { cn } from "@/lib/cn";
import { useNavigationStore } from "@/stores/navigationStore";
import type { Resource, Dispute, ChangeLogEntry } from "@/types/resource";
import { urgencyScore } from "@/lib/scoring";
import { AlertTriangle, RefreshCw, Star, Database } from "lucide-react";

interface SummaryStripProps {
  resources: Resource[];
  changelog: Record<string, ChangeLogEntry[]>;
  disputes: Record<string, Dispute>;
}

export function SummaryStrip({ resources, changelog, disputes }: SummaryStripProps) {
  const { pushFocusView } = useNavigationStore();

  const stats = useMemo(() => {
    const critical = resources.filter((r) => r.priority === "CRITICAL");
    const changedIds = Object.keys(changelog);
    const changed = resources.filter((r) => changedIds.includes(r.id));
    const disputedIds = Object.entries(disputes)
      .filter(([, d]) => d.note)
      .map(([id]) => id);
    const disputed = resources.filter((r) => disputedIds.includes(r.id));

    return { critical, changed, disputed, total: resources.length };
  }, [resources, changelog, disputes]);

  // Action Required = Critical priority OR due within 90 days
  const now = new Date();
  const q = new Date(now.getTime() + 90 * 864e5);
  const dueIds = new Set(
    resources.filter((r) => r.timeline?.some((m) => { const d = new Date(m.date); return d >= now && d <= q; })).map((r) => r.id)
  );
  const actionRequired = resources.filter((r) => r.priority === "CRITICAL" || dueIds.has(r.id));

  const cards = [
    {
      label: "Action Required",
      count: actionRequired.length,
      icon: AlertTriangle,
      color: "var(--critical)",
      onClick: () =>
        pushFocusView({
          title: "Action Required",
          resourceIds: actionRequired.map((r) => r.id),
          why: Object.fromEntries(
            actionRequired.map((r) => [
              r.id,
              r.priority === "CRITICAL"
                ? r.reasoning || "Critical priority"
                : `Milestone due within 90 days`,
            ])
          ),
        }),
    },
    {
      label: "Changed",
      count: stats.changed.length,
      icon: RefreshCw,
      color: "#C77700",
      onClick: () =>
        pushFocusView({
          title: "Recently Changed",
          resourceIds: stats.changed.map((r) => r.id),
        }),
    },
    {
      label: "Disputed",
      count: stats.disputed.length,
      icon: Star,
      color: "#FF9500",
      onClick: () =>
        pushFocusView({
          title: "Disputed Resources",
          resourceIds: stats.disputed.map((r) => r.id),
          why: Object.fromEntries(
            stats.disputed.map((r) => [r.id, disputes[r.id]?.note || ""])
          ),
        }),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {cards.map(({ label, count, icon: Icon, color, onClick }) => (
          <button
            key={label}
            onClick={onClick}
            className={cn(
              "flex flex-col items-center gap-1.5 px-6 py-5",
              "border rounded-lg",
              "hover:bg-[var(--color-surface-raised)]",
              "transition-all duration-200 cursor-pointer"
            )}
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-surface)",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            }}
          >
            <Icon size={16} strokeWidth={2} style={{ color }} />
            <span className="text-2xl font-bold tabular-nums text-text-primary">
              {count}
            </span>
            <span className="text-xs font-semibold tracking-wider uppercase text-text-muted" style={{ color }}>
              {label}
            </span>
          </button>
        ))}
      </div>
      {/* Priority Legend */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 px-1">
        <span className="text-[11px] text-text-muted">
          <span className="font-bold text-[#FF3B30]">CRITICAL</span> — Immediate action required, deadlines within 90 days or active enforcement
        </span>
        <span className="text-[11px] text-text-muted">
          <span className="font-bold text-[#FF9500]">HIGH</span> — Significant impact, action needed within 6 months
        </span>
        <span className="text-[11px] text-text-muted">
          <span className="font-bold text-[#8e8e93]">MODERATE</span> — Monitor and plan, 6-12 month horizon
        </span>
        <span className="text-[11px] text-text-muted">
          <span className="font-bold text-[#aeaeb2]">LOW</span> — Awareness only, no immediate action
        </span>
      </div>
    </div>
  );
}
