"use client";

import { useMemo } from "react";
import { cn } from "@/lib/cn";
import { useNavigationStore } from "@/stores/navigationStore";
import type { Resource, Dispute, ChangeLogEntry } from "@/types/resource";
import { urgencyScore } from "@/lib/scoring";
import { AlertTriangle, RefreshCw, Star } from "lucide-react";

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
      color: "#DC2626",
      bg: "rgba(220, 38, 38, 0.08)",
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
      color: "#D97706",
      bg: "rgba(217, 119, 6, 0.08)",
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
      color: "#E8610A",
      bg: "rgba(232, 97, 10, 0.08)",
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
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        {cards.map(({ label, count, icon: Icon, color, bg, onClick }) => (
          <button
            key={label}
            onClick={onClick}
            className="cl-stat-card cursor-pointer group"
          >
            {/* Icon badge — colored circle like APEX */}
            <div
              className="inline-flex items-center justify-center w-10 h-10 rounded-xl mb-3"
              style={{ backgroundColor: bg }}
            >
              <Icon size={20} strokeWidth={2} style={{ color }} />
            </div>
            {/* Hero number */}
            <div
              className="text-4xl font-black tabular-nums mb-1"
              style={{ color: "var(--color-text-primary)" }}
            >
              {count}
            </div>
            {/* Label */}
            <div
              className="text-xs font-bold tracking-widest uppercase"
              style={{ color }}
            >
              {label}
            </div>
          </button>
        ))}
      </div>

      {/* Priority Legend — horizontal row */}
      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        {[
          { level: "CRITICAL", color: "#DC2626", desc: "Immediate action — deadlines within 90 days" },
          { level: "HIGH", color: "#D97706", desc: "Action needed within 6 months" },
          { level: "MODERATE", color: "#CA8A04", desc: "Monitor and plan — 6-12 month horizon" },
          { level: "LOW", color: "#9CA3AF", desc: "Awareness only" },
        ].map(({ level, color, desc }) => (
          <div key={level} className="flex items-center gap-2">
            <span
              className="shrink-0 w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
              <span className="font-bold" style={{ color }}>{level}</span> — {desc}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
