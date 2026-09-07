"use client";

/**
 * TopBar — the mobile top bar (lane mobframe, 2026-09-07,
 * docs/design/handoff-2026-09-06's mobile-390 spec, TOP BAR). Replaces the
 * desktop nav card below 768px: "height 56px, background #FFFFFF,
 * border-bottom 1px solid rgba(0,0,0,.08); 3px band-proportion rule sits
 * directly above it, full width; left: hamburger (44x44); centre: page
 * title (Anton, uppercase, 16px, ellipsis); right: search glyph (44x44),
 * avatar (24px circle, initial, unread dot)."
 *
 * No new nav-item component: the band rule reuses <BandGradientRule/>, the
 * page title reads <Sidebar/>'s own `navTitleForPath` (one route→label
 * table, not a second one), and the hamburger drives the SAME drawer
 * open/close state <Sidebar/> renders — lifted to <AppShell/> so this bar
 * and the drawer share one source of truth.
 *
 * Search glyph: the spec draws it but does not design its behaviour (only
 * the CommandBar in the Masthead is the search/ask surface — no per-page
 * ask panel, no second search UI). Provisional behaviour, logged in
 * DEVIATION-LOG.md: focuses and scrolls to the page's own CommandBar
 * input (`#cl-command-bar-input`, CommandBar.tsx) rather than opening
 * anything new.
 *
 * Avatar unread dot: wired to the same unread-notifications count
 * NotificationsBell already polls (useUnreadNotificationsCount,
 * /api/community/notifications — migration 032, RLS self-only). No
 * app-wide "unread" concept exists beyond notifications; if that ever
 * changes, this is the one place the dot is wired.
 */

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navTitleForPath } from "@/components/Sidebar";
import { useAuth } from "@/components/auth/AuthProvider";
import { useUnreadNotificationsCount } from "@/lib/hooks/useUnreadNotificationsCount";
import { useWorkspaceBootstrap } from "@/lib/hooks/useWorkspaceBootstrap";
import { BandGradientRule } from "@/components/ui/BandGradientRule";

function focusCommandBar() {
  const el = document.getElementById("cl-command-bar-input") as HTMLInputElement | null;
  if (!el) return;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.focus();
}

export interface TopBarProps {
  onMenuClick: () => void;
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const pathname = usePathname();
  const title = navTitleForPath(pathname);
  const { user } = useAuth();
  const { unreadCount } = useUnreadNotificationsCount();
  const { data: bootstrap } = useWorkspaceBootstrap();
  const counts = bootstrap?.navCounts;

  const gradientCounts = {
    immediate: counts?.byPriority.CRITICAL ?? 0,
    action: counts?.byPriority.HIGH ?? 0,
    monitor: counts?.byPriority.MODERATE ?? 0,
    awareness: counts?.byPriority.LOW ?? 0,
  };

  const initial = (user?.email ?? "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="md:hidden" style={{ position: "sticky", top: 0, zIndex: 30 }}>
      <BandGradientRule counts={gradientCounts} />
      <header
        style={{
          height: 56,
          background: "var(--card)",
          borderBottom: "1px solid var(--line-2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 6px",
        }}
      >
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open navigation"
          style={{
            width: 44,
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "none",
            border: "none",
            color: "var(--ink)",
            flexShrink: 0,
          }}
        >
          <Menu size={17} aria-hidden="true" />
        </button>

        <h1
          className="uppercase truncate"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 400,
            fontSize: 16,
            letterSpacing: "0.04em",
            color: "var(--ink)",
            margin: 0,
            minWidth: 0,
            flex: "1 1 auto",
            textAlign: "center",
          }}
        >
          {title}
        </h1>

        <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
          <button
            type="button"
            onClick={focusCommandBar}
            aria-label="Search"
            style={{
              width: 44,
              height: 44,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "none",
              border: "none",
              color: "var(--ink-3)",
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 16 }}>⌕</span>
          </button>

          <Link
            href="/profile"
            prefetch={false}
            aria-label={
              unreadCount > 0
                ? `Account, ${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
                : "Account"
            }
            style={{
              width: 44,
              height: 44,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                position: "relative",
                width: 24,
                height: 24,
                borderRadius: "50%",
                border: "1px solid rgba(0,0,0,.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                fontWeight: 700,
                color: "var(--ink)",
                background: "var(--card)",
              }}
            >
              {initial}
              {unreadCount > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: -1,
                    right: -1,
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "var(--immediate)",
                    border: "1.5px solid #FFFFFF",
                  }}
                />
              )}
            </span>
          </Link>
        </div>
      </header>
    </div>
  );
}
