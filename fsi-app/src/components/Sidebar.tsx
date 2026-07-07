"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { UserMenu } from "@/components/auth/UserMenu";
import { useWorkspaceStore } from "@/stores/workspaceStore";

// Design rebuild 2026-05-24 (per design_handoff_2026-05/HANDOFF.md Fix 5):
// Sidebar grammar restructured into three groups separated by dividers.
// Intelligence pages (Dashboard + four intelligence surfaces + Map) sit
// above the first divider. Community sits between dividers, signalling
// its distinct role as peer information sharing rather than intelligence
// content. Admin sits below the second divider, gated on workspace role
// 'owner' or 'admin'. This supersedes the PR-D IA refactor (2026-05-06)
// which routed Admin through the UserMenu dropdown; the operator handoff
// explicitly restores Admin to the rail because it was unreachable from
// any other page.

interface NavItem {
  href: string;
  label: string;
}

// Redesign T02 (HANDOFF §5): text-only nav, no icons, order
// Dashboard → Regulations → Market Intel → Research → Operations → Map,
// divider, Community. Admin is NOT in the nav — it lives in the footer
// row as a small uppercase bordered button beside the user chip.
const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/regulations", label: "Regulations" },
  { href: "/market", label: "Market Intel" },
  { href: "/research", label: "Research" },
  { href: "/operations", label: "Operations" },
  { href: "/map", label: "Map" },
];

const COMMUNITY_NAV: NavItem[] = [
  { href: "/community", label: "Community" },
];

// Routes whose server components run Supabase queries on render. Auto-
// prefetch on a hover-sweep across the sidebar can fan out 6-8 parallel
// RSC renders, each firing 3-15 PostgREST round-trips. We disable
// prefetch on these data-heavy targets to keep nav-hover from prewarming
// every workspace surface at once. Click latency is preserved by Next's
// in-flight RSC dedupe and by the pages' own server-render speed.
const NO_PREFETCH_HREFS = new Set<string>([
  "/",
  "/regulations",
  "/market",
  "/research",
  "/operations",
  "/map",
  "/community",
  "/admin",
]);

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const userRole = useWorkspaceStore((s) => s.userRole);
  const isAdmin = userRole === "owner" || userRole === "admin";

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const renderNavItem = ({ href, label }: NavItem) => {
    const active = isActive(href);
    return (
      <Link
        key={href}
        href={href}
        prefetch={NO_PREFETCH_HREFS.has(href) ? false : undefined}
        onClick={() => setMobileOpen(false)}
        aria-current={active ? "page" : undefined}
        className="flex items-center px-3 py-2.5 rounded-md text-[13px] transition-colors"
        style={{
          // Redesign T02 (HANDOFF §5): active = orange tint + 2px orange
          // left border + ink text + bold; resting = secondary ink.
          color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
          backgroundColor: active ? "rgba(232,97,10,0.09)" : undefined,
          borderLeft: `2px solid ${active ? "var(--color-primary)" : "transparent"}`,
          fontWeight: active ? 800 : 600,
        }}
      >
        {label}
      </Link>
    );
  };

  const navDivider = (
    <div
      className="my-2.5 mx-3 h-px"
      style={{ backgroundColor: "var(--color-border-subtle)" }}
      aria-hidden="true"
    />
  );

  const navContent = (
    <>
      {/* Logo */}
      <div className="px-4 py-5 border-b" style={{ borderColor: "var(--color-border)" }}>
        {/* perf round 3 (2026-05-09): logo Link sat next to the NAV_ITEMS
            Dashboard entry, both pointing at "/". The nav entry already
            opts out via NO_PREFETCH_HREFS, but this logo Link defaulted
            to auto-prefetch and re-fired the dashboard RSC fetch on every
            authenticated route mount, landing ~1.2s post-FCP. Same data
            surface, prefetched twice. prefetch={false} matches the nav
            entry and eliminates the duplicate. */}
        <Link href="/" prefetch={false} className="block">
          <h1
            className="text-xl uppercase"
            style={{
              color: "var(--color-text-primary)",
              fontFamily: "var(--font-display)",
              fontWeight: 400,
              letterSpacing: "0.04em",
            }}
          >
            {APP_NAME}
          </h1>
          <p
            className="text-[10px] font-bold tracking-[0.15em] uppercase mt-0.5"
            style={{ color: "var(--color-text-muted)" }}
          >
            {APP_TAGLINE}
          </p>
        </Link>
      </div>

      {/* Main nav — text-only, two groups separated by a divider per
          redesign T02 (HANDOFF §5). Admin is not here; it is a footer
          button beside the user chip. */}
      <nav className="py-3 px-2.5 flex flex-col gap-0.5">
        {PRIMARY_NAV.map(renderNavItem)}
        {navDivider}
        {COMMUNITY_NAV.map(renderNavItem)}
      </nav>

      {/* Spacer, pushes user footer to the bottom of the rail */}
      <div className="flex-1" />

      {/* Footer row (HANDOFF §5): user chip (opens Account / user menu) +
          Admin button. Admin stays role-gated — a non-admin never sees it. */}
      <div
        className="flex items-center gap-2 px-3.5 py-3.5"
        style={{ borderTop: "1px solid var(--color-border-subtle)" }}
      >
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
              color: isActive("/admin") ? "var(--color-primary)" : "var(--color-text-secondary)",
              border: `1px solid ${isActive("/admin") ? "var(--color-primary)" : "var(--color-border-strong)"}`,
            }}
          >
            Admin
          </Link>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex flex-col shrink-0 h-screen sticky top-0 border-r overflow-y-auto"
        style={{
          width: 208,
          backgroundColor: "var(--color-bg-surface)",
          borderColor: "var(--color-border)",
        }}
      >
        {navContent}
      </aside>

      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="md:hidden fixed top-3 left-3 z-50 p-2 rounded-lg"
        style={{
          backgroundColor: "var(--color-bg-surface)",
          border: "1px solid var(--color-border)",
          color: "var(--color-text-primary)",
        }}
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
            className="md:hidden fixed top-0 left-0 z-50 flex flex-col h-screen w-[208px] overflow-y-auto"
            style={{
              backgroundColor: "var(--color-bg-surface)",
              borderRight: "1px solid var(--color-border)",
            }}
          >
            {navContent}
          </aside>
        </>
      )}
    </>
  );
}
