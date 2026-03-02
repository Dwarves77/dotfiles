"use client";

import { cn } from "@/lib/cn";
import { useNavigationStore } from "@/stores/navigationStore";
import type { TabId } from "@/types/resource";
import { Home, Compass, Settings } from "lucide-react";

const TABS: { id: TabId; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "explore", label: "Explore", icon: Compass },
  { id: "settings", label: "Settings", icon: Settings },
];

export function TabBar() {
  const { tab, setTab } = useNavigationStore();

  return (
    <nav className="sticky top-0 z-30 flex items-center gap-1 border-b border-white/6 bg-[var(--navy)]/95 backdrop-blur-sm">
      {TABS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => setTab(id)}
          className={cn(
            "relative flex items-center gap-2 px-5 py-3",
            "text-xs font-semibold tracking-wider uppercase",
            "transition-all duration-300 cursor-pointer",
            tab === id
              ? "text-white"
              : "text-[var(--sage)] hover:text-white"
          )}
          style={{ transitionTimingFunction: "var(--ease-out-expo)" }}
        >
          <Icon size={14} strokeWidth={2} />
          {label}
          {tab === id && (
            <span className="absolute bottom-0 left-0 right-0 h-px bg-white" />
          )}
        </button>
      ))}
    </nav>
  );
}
