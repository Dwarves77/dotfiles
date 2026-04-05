"use client";

import { cn } from "@/lib/cn";
import { useNavigationStore } from "@/stores/navigationStore";
import type { TabId } from "@/types/resource";
import {
  Home, Scale, Zap, Globe, TrendingUp, Database,
  Building, GraduationCap, Settings,
} from "lucide-react";

const TABS: { id: TabId; label: string; shortLabel?: string; icon: typeof Home }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "regulations", label: "Regulations", shortLabel: "Regs", icon: Scale },
  { id: "technology", label: "Technology", shortLabel: "Tech", icon: Zap },
  { id: "regional", label: "Regional", icon: Globe },
  { id: "geopolitical", label: "Geopolitical", shortLabel: "Geopolitical", icon: TrendingUp },
  { id: "sources", label: "Sources", icon: Database },
  { id: "facilities", label: "Facilities", icon: Building },
  { id: "research", label: "Research", icon: GraduationCap },
  { id: "settings", label: "Settings", icon: Settings },
];

export function TabBar() {
  const { tab, setTab } = useNavigationStore();

  return (
    <nav
      className="sticky top-0 z-30 flex items-center border-b bg-[var(--color-background)]/95 backdrop-blur-sm overflow-x-auto"
      style={{ borderColor: "var(--color-border-subtle)" }}
    >
      {TABS.map(({ id, label, shortLabel, icon: Icon }) => {
        const isActive = tab === id;
        return (
          <button
            key={id}
            onClick={() => setTab(id)}
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
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">{shortLabel || label}</span>
            {isActive && (
              <span
                className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full"
                style={{ backgroundColor: "var(--color-primary)" }}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
