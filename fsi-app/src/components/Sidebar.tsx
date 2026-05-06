"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import {
  LayoutDashboard, Scale, TrendingUp, Globe,
  GraduationCap, MessageSquare, MapPin, Settings,
  Shield, User,
  Menu, X,
} from "lucide-react";
import { useState } from "react";
import { UserMenu } from "@/components/auth/UserMenu";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useAdminAttention } from "@/lib/hooks/useAdminAttention";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** When true, only render for users with role owner|admin. */
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/regulations", label: "Regulations", icon: Scale },
  { href: "/market", label: "Market Intel", icon: TrendingUp },
  { href: "/research", label: "Research", icon: GraduationCap },
  { href: "/operations", label: "Operations", icon: Globe },
  { href: "/map", label: "Map", icon: MapPin },
  { href: "/admin", label: "Admin", icon: Shield, adminOnly: true },
  { href: "/profile", label: "Profile", icon: User },
  { href: "/settings", label: "Settings", icon: Settings },
];

// Routes whose server components run Supabase queries on render. Auto-
// prefetch on a hover-sweep across the sidebar can fan out 6-8 parallel
// RSC renders, each firing 3-15 PostgREST round-trips. We disable
// prefetch on these data-heavy targets to keep nav-hover from prewarming
// every workspace surface at once. Click latency is preserved by Next's
// in-flight RSC dedupe and by the pages' own server-render speed.
//
// Left at default auto-prefetch (cheap targets):
//   - /profile  (not investigated as data-heavy)
//   - /settings (ISR via `export const revalidate = 60`)
const NO_PREFETCH_HREFS = new Set<string>([
  "/",
  "/regulations",
  "/market",
  "/research",
  "/operations",
  "/map",
  "/admin",
  "/community",
]);

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const userRole = useWorkspaceStore((s) => s.userRole);
  const isAdmin = userRole === "owner" || userRole === "admin";
  const visibleNavItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  // Admin attention badge (W2.E). The hook itself short-circuits for
  // non-admin / unauthenticated users — the dot below additionally gates
  // on `isAdmin` so a stale value can never leak to a non-admin row.
  const { total: adminAttentionTotal } = useAdminAttention();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const navContent = (
    <>
      {/* Logo */}
      <div className="px-4 py-5 border-b" style={{ borderColor: "var(--color-border)" }}>
        <Link href="/" className="block">
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

      {/* Main nav */}
      <nav className="py-2 px-2 space-y-0.5">
        {visibleNavItems.map(({ href, label, icon: Icon, adminOnly }) => {
          const showAttentionDot =
            adminOnly && isAdmin && adminAttentionTotal > 0;
          const dotTitle = showAttentionDot
            ? `${adminAttentionTotal} item${
                adminAttentionTotal === 1 ? "" : "s"
              } need attention`
            : undefined;
          return (
            <Link
              key={href}
              href={href}
              prefetch={NO_PREFETCH_HREFS.has(href) ? false : undefined}
              onClick={() => setMobileOpen(false)}
              title={dotTitle}
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
              {showAttentionDot && (
                <span
                  aria-label={dotTitle}
                  role="status"
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 10,
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "var(--color-critical)",
                    boxShadow: "0 0 0 2px var(--color-bg-surface)",
                  }}
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Spacer — pushes community to middle area */}
      <div className="flex-1" />

      {/* Community — standalone middle section */}
      <div className="px-2 py-2 border-t border-b" style={{ borderColor: "var(--color-border)" }}>
        <Link
          href="/community"
          prefetch={false}
          onClick={() => setMobileOpen(false)}
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors",
            isActive("/community")
              ? "font-semibold"
              : "hover:bg-[var(--color-bg-raised)]"
          )}
          style={{
            color: isActive("/community") ? "var(--color-text-primary)" : "var(--color-text-secondary)",
            backgroundColor: isActive("/community") ? "var(--color-active-bg)" : undefined,
            borderLeft: isActive("/community") ? "3px solid var(--color-primary)" : "3px solid transparent",
          }}
        >
          <MessageSquare size={18} strokeWidth={isActive("/community") ? 2.2 : 1.8} />
          <span className="hidden lg:inline">Community</span>
        </Link>
      </div>

      {/* Bottom — user menu only (Settings is inside the dropdown) */}
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
