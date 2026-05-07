"use client";

import { useWorkspaceStore } from "@/stores/workspaceStore";
import {
  ArrowUpRight,
  LayoutDashboard,
  ScrollText,
  Settings as SettingsIcon,
  Shield,
  Users,
  Database,
  Map as MapIcon,
} from "lucide-react";

// ───────────────────────────────────────────────────────────────────────────
// QuickLinksSection (PR-L Profile restoration — Decision #15, F7)
//
// Internal navigation rail for surfaces a user accesses frequently from
// their profile context. Reuses existing routes — no new endpoints.
// Admin-only entries are gated by workspace role.
// ───────────────────────────────────────────────────────────────────────────

interface LinkRow {
  label: string;
  href: string;
  description: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const LINKS: LinkRow[] = [
  {
    label: "Dashboard",
    href: "/",
    description: "Today's intelligence and weekly briefing",
    icon: <LayoutDashboard size={14} />,
  },
  {
    label: "Regulations",
    href: "/regulations",
    description: "Browse the regulatory intelligence index",
    icon: <ScrollText size={14} />,
  },
  {
    label: "Settings",
    href: "/settings",
    description: "Notifications, briefings, dashboard sections",
    icon: <SettingsIcon size={14} />,
  },
  {
    label: "Community",
    href: "/community",
    description: "Discussions, vendor directory, events",
    icon: <Users size={14} />,
  },
  {
    label: "Map",
    href: "/map",
    description: "Geographic view of regulations and sources",
    icon: <MapIcon size={14} />,
  },
  {
    label: "Market intel",
    href: "/market",
    description: "Carbon prices, fuel mandates, market signals",
    icon: <Database size={14} />,
  },
  {
    label: "Admin Panel",
    href: "/admin",
    description: "Issues queue, integrity flags, staged updates",
    icon: <Shield size={14} />,
    adminOnly: true,
  },
];

export function QuickLinksSection() {
  const userRole = useWorkspaceStore((s) => s.userRole);
  const isAdmin = userRole === "owner" || userRole === "admin";

  const visible = LINKS.filter((l) => !l.adminOnly || isAdmin);

  return (
    <section
      className="rounded-lg border"
      style={{
        borderColor: "var(--color-border-subtle)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      <header
        className="px-4 py-3 border-b"
        style={{ borderColor: "var(--color-border-subtle)" }}
      >
        <h3
          className="text-[10px] font-bold uppercase"
          style={{
            letterSpacing: "0.14em",
            color: "var(--color-text-muted)",
          }}
        >
          Quick links
        </h3>
      </header>
      <ul className="divide-y" style={{ borderColor: "var(--color-border-subtle)" }}>
        {visible.map((l) => (
          <li key={l.href}>
            <a
              href={l.href}
              className="flex items-start gap-3 px-4 py-3 transition-colors group"
              style={{ color: "inherit" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.backgroundColor =
                  "var(--color-surface-raised)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.backgroundColor =
                  "transparent";
              }}
            >
              <span
                className="inline-flex items-center justify-center w-7 h-7 rounded-md shrink-0"
                style={{
                  backgroundColor: "var(--color-surface-overlay)",
                  color: "var(--color-text-secondary)",
                }}
              >
                {l.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div
                  className="flex items-center gap-1.5 text-sm font-semibold"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {l.label}
                  <ArrowUpRight
                    size={12}
                    className="opacity-0 group-hover:opacity-60 transition-opacity"
                  />
                </div>
                <div
                  className="text-xs"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {l.description}
                </div>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
