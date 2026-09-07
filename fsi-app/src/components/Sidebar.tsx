"use client";

/**
 * Sidebar — the nav card (UI system handoff 2026-09-06, README §0.3):
 * "Nav 252px, always — one width, so the page never shifts on navigation
 * (the audit found two nav widths)." White card, radius 10, margin
 * `16px 0 16px 16px`, band-gradient 3px cap, sections Brief / Intelligence
 * / Network / Operator, counts right-aligned in each row.
 *
 * Supersedes the pre-existing 208px sidebar (docs/design/audit-2026-09-06/
 * ASSESSMENT.md's "two nav widths" finding — the OTHER width lived in
 * CommunitySidebar.tsx's own layout, unaffected by this file, since that
 * component renders a distinct in-page rail, not the primary nav).
 */

import { usePathname } from "next/navigation";
import Link from "next/link";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { UserMenu } from "@/components/auth/UserMenu";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useWorkspaceBootstrap } from "@/lib/hooks/useWorkspaceBootstrap";
import { BandGradientRule } from "@/components/ui/BandGradientRule";
import { formatNumber } from "@/lib/format";

interface NavItem {
  href: string;
  label: string;
  /** Key into NavCounts, when this item carries a live count. */
  countKey?: "regulations" | "market" | "research" | "operations" | "community" | "watchlist";
}

interface NavSection {
  label: string;
  items: NavItem[];
}

// README §0.3: "sections Brief / Intelligence / Network / Operator, counts
// right-aligned in each row." Brief = Dashboard + Watchlist (the reader's
// own view of the ledger); Intelligence = the four surfaces + Map;
// Network = Community; Operator = Account (+ Admin, role-gated).
const SECTIONS: NavSection[] = [
  {
    label: "Brief",
    items: [
      { href: "/", label: "Dashboard" },
      { href: "/watchlist", label: "Watchlist", countKey: "watchlist" },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { href: "/regulations", label: "Regulations", countKey: "regulations" },
      { href: "/market", label: "Market", countKey: "market" },
      { href: "/research", label: "Research", countKey: "research" },
      { href: "/operations", label: "Operations", countKey: "operations" },
      { href: "/map", label: "Map" },
    ],
  },
  {
    label: "Network",
    items: [{ href: "/community", label: "Community", countKey: "community" }],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const userRole = useWorkspaceStore((s) => s.userRole);
  const isAdmin = userRole === "owner" || userRole === "admin";
  const { data: bootstrap } = useWorkspaceBootstrap();
  const counts = bootstrap?.navCounts;

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  // The nav cap's segment widths are the workspace's REAL urgency mix
  // (README §0.2: "segment widths proportional to the live band counts"),
  // never a fabricated split. counts.byPriority is the same
  // WorkspaceAggregates.byPriority the dashboard's band tiles read.
  // BandGradientRule itself falls back to an even split when every count
  // is zero (first paint, before the bootstrap fetch resolves).
  const gradientCounts = {
    immediate: counts?.byPriority.CRITICAL ?? 0,
    action: counts?.byPriority.HIGH ?? 0,
    monitor: counts?.byPriority.MODERATE ?? 0,
    awareness: counts?.byPriority.LOW ?? 0,
  };

  const renderNavItem = ({ href, label, countKey }: NavItem) => {
    const active = isActive(href);
    const count = countKey && counts ? counts[countKey] : undefined;
    return (
      <Link
        key={href}
        href={href}
        onClick={() => setMobileOpen(false)}
        aria-current={active ? "page" : undefined}
        className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-md text-[13px] transition-colors"
        style={{
          color: active ? "var(--ink)" : "var(--ink-2)",
          backgroundColor: active ? "var(--tag)" : undefined,
          borderLeft: `2px solid ${active ? "var(--brand)" : "transparent"}`,
          fontWeight: active ? 800 : 600,
        }}
      >
        <span>{label}</span>
        {count != null && (
          <span
            style={{
              fontSize: "var(--fs-11)",
              fontWeight: 700,
              color: "var(--ink-3)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatNumber(count)}
          </span>
        )}
      </Link>
    );
  };

  const navDivider = (
    <div className="my-2.5 mx-3 h-px" style={{ backgroundColor: "var(--line-3)" }} aria-hidden="true" />
  );

  const navContent = (
    <>
      <BandGradientRule counts={gradientCounts} />
      <div className="px-4 py-5 border-b" style={{ borderColor: "var(--line-1)" }}>
        <Link href="/" prefetch={false} className="block">
          <h1
            className="text-xl uppercase"
            style={{ color: "var(--ink)", fontFamily: "var(--font-display)", fontWeight: 400, letterSpacing: "0.04em" }}
          >
            {APP_NAME}
          </h1>
          <p className="text-[10px] font-bold tracking-[0.15em] uppercase mt-0.5" style={{ color: "var(--ink-3)" }}>
            {APP_TAGLINE}
          </p>
        </Link>
      </div>

      <nav className="py-3 px-2.5 flex flex-col gap-2.5 overflow-y-auto min-h-0">
        {SECTIONS.map((section, i) => (
          <div key={section.label}>
            {i > 0 && navDivider}
            <p
              style={{
                fontSize: "var(--fs-95)",
                fontWeight: 800,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--ink-3)",
                margin: "4px 12px 4px",
              }}
            >
              {section.label}
            </p>
            <div className="flex flex-col gap-0.5">{section.items.map(renderNavItem)}</div>
          </div>
        ))}
      </nav>

      <div className="flex-1" />

      <div className="flex flex-col" style={{ borderTop: "1px solid var(--line-3)" }}>
        <p
          style={{
            fontSize: "var(--fs-95)",
            fontWeight: 800,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
            margin: "10px 12px 2px",
          }}
        >
          Operator
        </p>
        <div className="flex items-center gap-2 px-3.5 pb-3.5">
          <div className="min-w-0 flex-1">
            <UserMenu />
          </div>
          {isAdmin && (
            <Link
              href="/admin"
              prefetch={false}
              onClick={() => setMobileOpen(false)}
              aria-current={isActive("/admin") ? "page" : undefined}
              className="shrink-0 text-[10px] font-extrabold tracking-[0.08em] uppercase rounded-md px-2.5 py-1.5 transition-colors"
              style={{
                color: isActive("/admin") ? "var(--brand)" : "var(--ink-2)",
                border: `1px solid ${isActive("/admin") ? "var(--brand)" : "var(--line-1)"}`,
              }}
            >
              Admin
            </Link>
          )}
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop nav card — 252px, always. */}
      <aside
        className="hidden md:flex flex-col shrink-0 overflow-hidden"
        style={{
          width: 252,
          maxHeight: "calc(100vh - 32px)",
          margin: "16px 0 16px 16px",
          background: "var(--card)",
          border: "1px solid var(--line-1)",
          borderRadius: "var(--radius-card)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        {navContent}
      </aside>

      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="md:hidden fixed top-3 left-3 z-50 p-2 rounded-lg"
        style={{ backgroundColor: "var(--card)", border: "1px solid var(--line-1)", color: "var(--ink)" }}
        aria-label="Toggle navigation"
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 z-40"
            style={{ backgroundColor: "rgba(0,0,0,0.3)" }}
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className="md:hidden fixed top-0 left-0 z-50 flex flex-col h-screen overflow-y-auto"
            style={{ width: 252, backgroundColor: "var(--card)", borderRight: "1px solid var(--line-1)" }}
          >
            {navContent}
          </aside>
        </>
      )}
    </>
  );
}
