"use client";

/**
 * Sidebar — the nav card (UI system handoff 2026-09-06, README §0.3):
 * "Nav 252px, always — one width, so the page never shifts on navigation
 * (the audit found two nav widths)." White card, radius 10, margin
 * `20px 0 16px 16px` (operator audit item 4.2, 2026-09-07 ruling: the 20px
 * top margin aligns the card with the content column's own 20px top
 * padding — was `16px 0 16px 16px`), band-gradient 3px cap, sections
 * Brief / Intelligence / Network / Operator, counts right-aligned in each
 * row.
 *
 * Supersedes the pre-existing 208px sidebar (docs/design/audit-2026-09-06/
 * ASSESSMENT.md's "two nav widths" finding — the OTHER width lived in
 * CommunitySidebar.tsx's own layout, unaffected by this file, since that
 * component renders a distinct in-page rail, not the primary nav).
 *
 * MOBILE 390 (lane mobframe, 2026-09-07, docs/design/handoff-2026-09-06's
 * mobile-390 spec, DRAWER): below 768 the 252px desktop nav card is
 * replaced by a 288px drawer, opened from AppShell's <TopBar/> hamburger
 * (not this component's own trigger any more — control is lifted to
 * AppShell so ONE open/close state drives both the hamburger icon and the
 * drawer, per the mobile spec's TOP BAR + DRAWER sections). Same nav
 * structure (SECTIONS, counts, footer rows) as the desktop card — additive
 * `variant` rendering inside the ONE navRows() builder below, never a
 * second nav-item component (no new component; mobile is the desktop part
 * at a smaller measure, per the mobile spec's own framing).
 */

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { User } from "lucide-react";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import { useAuth } from "@/components/auth/AuthProvider";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useWorkspaceBootstrap } from "@/lib/hooks/useWorkspaceBootstrap";
import { useAdminAttention } from "@/lib/hooks/useAdminAttention";
import { BandGradientRule } from "@/components/ui/BandGradientRule";
import { formatNumber } from "@/lib/format";

// Deferred so the drawer/mobile bundle doesn't pay for UserMenuDropdown's
// chunk on first paint; the footer's single user row (both variants,
// operator ruling 2026-09-07) mounts it only once opened.
const UserMenuDropdownLazy = dynamic(() => import("@/components/auth/UserMenuDropdown"), { ssr: false });

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
// Network = Community; Operator = Account (+ Admin, role-gated). Same
// sections, same counts, on the drawer (mobile spec, DRAWER section).
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

// Flat [href, label] list, longest-href-first, so a detail route
// ("/regulations/xyz") resolves to its section's label ("Regulations")
// via prefix match without a second route table. Exported for <TopBar/>'s
// centred page title (mobile spec, TOP BAR: "centre: page title") — the
// ONE place nav-route → label lives, never duplicated per CLAUDE.md rule 13.
const FLAT_NAV_ITEMS: NavItem[] = [
  ...SECTIONS.flatMap((s) => s.items),
  { href: "/profile", label: "Account" },
  { href: "/admin", label: "Admin" },
].sort((a, b) => b.href.length - a.href.length);

export function navTitleForPath(pathname: string): string {
  if (pathname === "/") return "Dashboard";
  const match = FLAT_NAV_ITEMS.find((item) => item.href !== "/" && pathname.startsWith(item.href));
  return match?.label ?? APP_NAME;
}

export interface SidebarProps {
  /** Mobile drawer open state — controlled by AppShell (raised so the
   *  <TopBar/> hamburger and this drawer share one state, mobile spec
   *  TOP BAR + DRAWER). Ignored above 768 (desktop nav card always shows). */
  drawerOpen?: boolean;
  onDrawerClose?: () => void;
}

export function Sidebar({ drawerOpen = false, onDrawerClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const userRole = useWorkspaceStore((s) => s.userRole);
  const orgName = useWorkspaceStore((s) => s.orgName);
  const isAdmin = userRole === "owner" || userRole === "admin";
  const { data: bootstrap } = useWorkspaceBootstrap();
  const counts = bootstrap?.navCounts;
  // Coordinator default (2026-09-07, resolving the third-footer-row defect
  // confirmed against artboard 02 / ruling R2): the desktop card's Account
  // row is itself the trigger for the menu the deleted third row used to
  // open, so sign-out (and everything else that menu held) keeps a home.
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const { total: adminAttentionTotal } = useAdminAttention();
  const showAdminDot = isAdmin && adminAttentionTotal > 0;

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

  // ── One nav-item renderer, two size variants (mobile spec DRAWER:
  //    "min-height 44px, padding 0 10px, radius 6px, 14px text" vs the
  //    desktop card's own smaller row) — additive, not a second component. ──
  const renderNavItem = (variant: "card" | "drawer") => ({ href, label, countKey }: NavItem) => {
    const active = isActive(href);
    const count = countKey && counts ? counts[countKey] : undefined;
    const drawer = variant === "drawer";
    return (
      <Link
        key={href}
        href={href}
        onClick={drawer ? onDrawerClose : undefined}
        aria-current={active ? "page" : undefined}
        className="flex items-center justify-between gap-2 transition-colors"
        style={
          drawer
            ? {
                minHeight: 44,
                padding: "0 10px",
                borderRadius: 6,
                fontSize: 14,
                color: "var(--ink)",
                backgroundColor: active ? "var(--tag)" : undefined,
                fontWeight: active ? 700 : 500,
              }
            : {
                padding: "10px 12px",
                borderRadius: 6,
                fontSize: "var(--fs-13)",
                color: active ? "var(--ink)" : "var(--ink-2)",
                backgroundColor: active ? "var(--tag)" : undefined,
                // dc.html p1 active row: an INSET 3px spine, not a border — drawn inside the
                // row so it never shifts row content (design audit 2026-09-07, B98).
                boxShadow: active ? "inset 3px 0px 0px var(--brand)" : "none",
                fontWeight: active ? 700 : 600,
              }
        }
      >
        <span>{label}</span>
        {count != null && (
          <span
            style={{
              fontSize: drawer ? 11 : "var(--fs-11)",
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

  const navSections = (variant: "card" | "drawer") => {
    const drawer = variant === "drawer";
    return SECTIONS.map((section, i) => (
      <div
        key={section.label}
        style={
          drawer && i > 0
            ? { borderTop: "1px solid var(--line-2)", marginTop: 6 }
            : undefined
        }
      >
        {!drawer && i > 0 && (
          <div className="my-2.5 mx-3 h-px" style={{ backgroundColor: "var(--line-3)" }} aria-hidden="true" />
        )}
        <p
          style={{
            fontSize: "var(--fs-95)",
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
            margin: drawer ? 0 : "4px 12px 4px",
            padding: drawer ? "10px 8px 4px" : undefined,
          }}
        >
          {section.label}
        </p>
        <div className="flex flex-col" style={{ gap: drawer ? 2 : 2 }}>
          {section.items.map(renderNavItem(variant))}
        </div>
      </div>
    ));
  };

  // ── Footer (README §0.3 nav card / mobile spec DRAWER footer). Operator
  //    ruling 2026-09-07, superseding R2's two-row footer: "signout lives
  //    in account, keep it there" / "we don't need separate Account and
  //    Admin buttons visible if they pop up as options when you click the
  //    logged-in person's name" / "too tight". ONE row now, on both the
  //    desktop card and the mobile drawer (one implementation) — the
  //    logged-in person's name (avatar glyph + name) with the workspace
  //    name right-aligned, muted, in the old Account row's own style. It
  //    opens the same UserMenuDropdown (Workspace profile, Admin panel —
  //    role-gated, with its attention count — Settings, Sign out),
  //    anchored above the row (it opens upward at the foot, per
  //    production). Falls back to a plain link to /profile when there is
  //    no signed-in user (nothing to open a menu about). ──
  const footer = (variant: "card" | "drawer") => {
    const drawer = variant === "drawer";
    const displayName = user?.email?.split("@")[0] || "User";
    return (
      <div className="flex flex-col" style={{ borderTop: `1px solid ${drawer ? "var(--line-2)" : "var(--line-3)"}` }}>
        {user ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setAccountMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={accountMenuOpen}
              aria-label={
                showAdminDot
                  ? `Open account menu (${adminAttentionTotal} admin item${adminAttentionTotal === 1 ? "" : "s"} need attention)`
                  : "Open account menu"
              }
              className="w-full flex items-center justify-between cursor-pointer"
              style={{
                minHeight: 44,
                padding: "0 10px",
                gap: 8,
                color: "var(--ink)",
                background: accountMenuOpen ? "var(--tag)" : "transparent",
                border: "none",
                textAlign: "left",
              }}
            >
              <span className="flex items-center min-w-0" style={{ gap: 8 }}>
                <User size={16} className="shrink-0" aria-hidden="true" />
                <span className="truncate" style={{ fontSize: 14, fontWeight: 700 }}>
                  {displayName}
                </span>
              </span>
              <span
                className="truncate shrink-0"
                style={{ fontSize: "var(--fs-11)", color: "var(--ink-3)", maxWidth: 100, fontWeight: 600 }}
              >
                {orgName || "—"}
              </span>
            </button>
            {accountMenuOpen && (
              <UserMenuDropdownLazy
                user={user}
                orgName={orgName}
                isAdmin={isAdmin}
                showAdminDot={showAdminDot}
                adminAttentionTotal={adminAttentionTotal}
                onClose={() => setAccountMenuOpen(false)}
                onSignOut={signOut}
              />
            )}
          </div>
        ) : (
          <Link
            href="/profile"
            prefetch={false}
            onClick={drawer ? onDrawerClose : undefined}
            aria-current={isActive("/profile") ? "page" : undefined}
            className="flex items-center justify-between"
            style={{ minHeight: 44, padding: "0 10px", gap: 8, color: "var(--ink)" }}
          >
            <span style={{ fontSize: 14, fontWeight: 700 }}>Account</span>
            <span
              className="truncate"
              style={{ fontSize: "var(--fs-11)", color: "var(--ink-3)", maxWidth: 140, fontWeight: 600 }}
            >
              {orgName || "—"}
            </span>
          </Link>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Desktop nav card — 252px, always, at md (768px) and up.
          Operator report 2026-09-07 ("the side navigation bar does not
          reach the length of the page"), CONFIRMED against the artboard
          (dc.html, artboard id="p2" and every page artboard): the page
          frame's row (AppShell's `.flex w-full` frame div) stretches the
          content column to full height, but this card's own box was
          capped by `maxHeight: calc(100vh - 36px)` with no `align-self`
          of its own — a height that tracks the viewport, not the frame
          row's actual (post-stretch) box, so on any layout where the
          frame row's height differs from a bare `100vh` read (a page
          zoom, a fractional-pixel viewport, a future banner above the
          frame) the card's cap and the row's real height drift apart and
          the card stops at its OWN content height instead of the frame's.
          Root-fixed once, here, per the artboard's own box model: the
          card is `align-self: stretch` (the artboard nav card is
          `align-self:stretch` inside the frame's `grid-template-columns:
          252px 1fr`) with `height: auto` and no `maxHeight` at all — it
          now always equals the frame row's real box, however that box is
          produced, the same way the content column already does one flex
          item over. */}
      <aside
        className="hidden md:flex flex-col shrink-0 overflow-hidden"
        style={{
          width: 252,
          height: "auto",
          // Inline, not a `self-stretch` Tailwind class: the design-audit harness
          // (fsi-app/.discipline/rendering/audit) mounts this component with only
          // globals.css/theme.css injected, no compiled Tailwind utility CSS, so a
          // class-only `align-self` would be silently inert there (and unverifiable)
          // even though it works in the real, fully-built app. Inline style is the
          // one form that is true in both.
          // fitness-allow: F42 (THE NAV CARD. Ruling 5.2 (2026-09-07) names the nav card cap as
          // one of exactly three places sitewide that carry the BAND-coloured 3px rule
          // (BandGradientRule below), so this card must NOT mount SectionRule; it is the one card
          // whose top edge is a different rule by ruling, not by omission. Operator 2026-09-08:
          // "Do not touch: band tiles, band-block rules, masthead type, command bar, the frame
          // widths".)
          alignSelf: "stretch",
          // Operator audit item 4.2 (2026-09-07, CLOSED ruling): "Nav card top margin becomes 20px
          // (margin: 20px 0 16px 16px) so it aligns with the content column's 20px top padding."
          margin: "20px 0 16px 16px",
          background: "var(--card)",
          border: "1px solid var(--line-1)",
          borderRadius: "var(--radius-card)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <BandGradientRule counts={gradientCounts} />
        <div className="px-4 py-5 border-b" style={{ borderColor: "var(--line-1)" }}>
          <Link href="/" prefetch={false} className="block">
            <h1
              className="text-xl uppercase"
              data-guard-display="wordmark"
              style={{ color: "var(--ink)", fontFamily: "var(--font-display)", fontWeight: 400, letterSpacing: "0.04em" }}
            >
              {APP_NAME}
            </h1>
            <p className="text-[10px] font-bold tracking-[0.15em] uppercase mt-0.5" style={{ color: "var(--ink-3)" }}>
              {APP_TAGLINE}
            </p>
          </Link>
        </div>
        {/* `flex: 1` here (the artboard's own section-list wrapper carries
            it) is what makes the footer land at the card's foot instead of
            immediately under the last nav row — a plain spacer div only
            worked when the card's own height matched its content, which is
            exactly the defect above. */}
        <nav className="py-3 px-2.5 flex-1 flex flex-col gap-2.5 overflow-y-auto min-h-0">
          {navSections("card")}
        </nav>
        {footer("card")}
      </aside>

      {/* Mobile drawer — below 768, controlled by AppShell/TopBar. Width
          288px (mobile spec DRAWER: "NOT 208: after 18px padding, 208
          leaves 14px of text room"). Scrim rgba(26,26,26,.3) — the app's
          existing value per the spec. */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Navigation">
          <div
            className="fixed inset-0"
            style={{ backgroundColor: "rgba(26,26,26,.3)" }}
            onClick={onDrawerClose}
          />
          <aside
            className="fixed top-0 left-0 flex flex-col h-screen overflow-y-auto"
            style={{ width: 288, background: "var(--card)", borderRight: "1px solid var(--line-1)" }}
          >
            <BandGradientRule counts={gradientCounts} />
            <div style={{ padding: "16px 18px 12px", borderBottom: "1px solid var(--line-2)" }}>
              <Link href="/" prefetch={false} onClick={onDrawerClose} className="block">
                <h1
                  className="uppercase"
                  data-guard-display="wordmark"
                  style={{ color: "var(--ink)", fontFamily: "var(--font-display)", fontWeight: 400, letterSpacing: "0.04em", fontSize: 19 }}
                >
                  {APP_NAME}
                </h1>
                <p
                  className="uppercase"
                  style={{ fontSize: "8.5px", fontWeight: 700, letterSpacing: "0.14em", color: "var(--ink-3)", margin: "3px 0 0" }}
                >
                  {APP_TAGLINE}
                </p>
              </Link>
            </div>
            <nav className="flex flex-col overflow-y-auto min-h-0" style={{ padding: "8px 10px", gap: 2 }}>
              {navSections("drawer")}
            </nav>
            <div className="flex-1" />
            {footer("drawer")}
          </aside>
        </div>
      )}
    </>
  );
}
