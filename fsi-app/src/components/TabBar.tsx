"use client";

import { cn } from "@/lib/cn";
import { useNavigationStore } from "@/stores/navigationStore";
import type { TabId } from "@/types/resource";
import { Home, Compass, MapPin, Settings } from "lucide-react";

const TABS: { id: TabId; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "explore", label: "Explore", icon: Compass },
  { id: "map", label: "Map", icon: MapPin },
  { id: "settings", label: "Settings", icon: Settings },
];

export function TabBar() {
  const { tab, setTab } = useNavigationStore();

  return (
    <nav className="sticky top-0 z-30 flex items-center gap-0.5 sm:gap-1 border-b border-border-subtle bg-surface-base/95 backdrop-blur-sm overflow-x-auto">
      {TABS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => setTab(id)}
          className={cn(
            "relative flex items-center gap-2 px-5 py-3",
            "text-[13px] font-semibold uppercase",
            "transition-all duration-300 cursor-pointer",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--text-accent)]/50",
            tab === id
              ? "text-text-primary"
              : "text-text-secondary hover:text-text-primary"
          )}
          style={{ transitionTimingFunction: "var(--ease-out-expo)", letterSpacing: "0px" }}
        >
          <Icon size={14} strokeWidth={2} />
          {label}
          {tab === id && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-text-accent" />
          )}
        </button>
      ))}
    </nav>
  );
}
