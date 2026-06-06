"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import {
  LayoutDashboard, Scale, TrendingUp, Globe,
  GraduationCap, MessageSquare, MapPin, Shield,
  Menu, X, Cpu,
} from "lucide-react";
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
  icon: typeof LayoutDashboard;
}

const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/regulations", label: "Regulations", icon: Scale },
  { href: "/technology", label: "Technology", icon: Cpu },
  { href: "/market", label: "Market Intel", icon: TrendingUp },
  { href: "/research", label: "Research", icon: GraduationCap },
  { href: "/operations", label: "Operations", icon: Globe },
  { href: "/map", label: "Map", icon: MapPin },
];

const COMMUNITY_NAV: NavItem[] = [
  { href: "/community", label: "Community", icon: MessageSquare },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Admin", icon: Shield },
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
  "/technology",
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

  const renderNavItem = ({ href, label, icon: Icon }: NavItem) => (
    <Link
      key={href}
      href={href}
      prefetch={NO_PREFETCH_HREFS.has(href) ? false : undefined}
      onClick={() => setMobileOpen(false)}
      className={cn(
        "relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors",
        isActive(href)
          ? "font-semibold"
          : "hover:bg-[var(--color-bg-raised)]"
      )}
      style={{
        color: isActive(href) ? "var(--color-text-primary)" : "var(--color-text-secondary)",
        backgroundColor: isActive(href) ? "var(--color-active-bg)" : undefined,
        fontWeight: isActive(href) ? 600 : 400,
      }}
    >
      <Icon size={18} strokeWidth={isActive(href) ? 2.2 : 1.8} />
      {label}
    </Link>
  );

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

      {/* Main nav, three groups separated by dividers per design rebuild */}
      <nav className="py-2 px-2 space-y-0.5">
        {PRIMARY_NAV.map(renderNavItem)}
        {navDivider}
        {COMMUNITY_NAV.map(renderNavItem)}
        {isAdmin && (
          <>
            {navDivider}
            {ADMIN_NAV.map(renderNavItem)}
          </>
        )}
      </nav>

      {/* Spacer, pushes user footer to the bottom of the rail */}
      <div className="flex-1" />

      {/* Bottom, user menu only (Settings is inside the dropdown) */}
      <div className="px-3 py-3">
        <UserMenu />
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex flex-col shrink-0 h-screen sticky top-0 border-r overflow-y-auto"
        style={{
          width: 220,
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
            className="md:hidden fixed top-0 left-0 z-50 flex flex-col h-screen w-[220px] overflow-y-auto"
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
