"use client";

import { cn } from "@/lib/cn";
import { useNavigationStore } from "@/stores/navigationStore";
import type { TabId } from "@/types/resource";
import {
  LayoutDashboard, Scale, TrendingUp, Globe,
  GraduationCap, MapPin, Settings, User,
  MessageSquare,
} from "lucide-react";

// Primary navigation — action-oriented labels
const PRIMARY_TABS: { id: TabId; label: string; icon: typeof Scale }[] = [
  { id: "home", label: "Dashboard", icon: LayoutDashboard },
  { id: "regulations", label: "Regulations", icon: Scale },
  { id: "technology", label: "Market Intelligence", icon: TrendingUp },
  { id: "regional", label: "Operations", icon: Globe },
  { id: "research", label: "Research & Sources", icon: GraduationCap },
];

// Utility bar — right-aligned
const UTILITY_TABS: { id: string; label: string; icon: typeof MapPin; href?: string }[] = [
  { id: "community", label: "Community", icon: MessageSquare, href: "/community" },
  { id: "map", label: "Map", icon: MapPin },
  { id: "settings", label: "Settings", icon: Settings },
];

export function TabBar() {
  const { tab, setTab } = useNavigationStore();

  return (
    <nav
      className="sticky top-0 z-30 flex items-center border-b bg-[var(--color-background)] overflow-x-auto"
      style={{ borderColor: "var(--color-border-subtle)" }}
    >
      {/* Primary tabs */}
      <div className="flex items-center">
        {PRIMARY_TABS.map(({ id, label, icon: Icon }) => {
          const isActive = tab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id as TabId)}
              className={cn(
                "relative flex items-center gap-1.5 px-3 py-3 shrink-0",
                "text-[13px] font-medium",
                "transition-colors duration-200 cursor-pointer",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]",
                isActive
                  ? "text-[var(--color-text-primary)]"
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              )}
            >
              <Icon size={14} strokeWidth={isActive ? 2.5 : 2} />
              {label}
              {isActive && (
                <span
                  className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full"
                  style={{ backgroundColor: "var(--color-primary)" }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Utility tabs — right-aligned */}
      <div className="flex items-center">
        {UTILITY_TABS.map(({ id, label, icon: Icon, href }) => {
          if (href) {
            return (
              <a
                key={id}
                href={href}
                className="relative flex items-center gap-1 px-2.5 py-3 shrink-0 text-[12px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                <Icon size={13} strokeWidth={2} />
                <span className="hidden sm:inline">{label}</span>
              </a>
            );
          }
          const isActive = tab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id as TabId)}
              className={cn(
                "relative flex items-center gap-1 px-2.5 py-3 shrink-0",
                "text-[12px] font-medium",
                "transition-colors duration-200 cursor-pointer",
                isActive
                  ? "text-[var(--color-text-primary)]"
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              )}
            >
              <Icon size={13} strokeWidth={isActive ? 2.5 : 2} />
              <span className="hidden sm:inline">{label}</span>
              {isActive && (
                <span
                  className="absolute bottom-0 left-1 right-1 h-[2px] rounded-full"
                  style={{ backgroundColor: "var(--color-primary)" }}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
