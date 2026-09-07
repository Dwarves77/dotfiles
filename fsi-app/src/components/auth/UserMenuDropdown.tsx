"use client";

/**
 * UserMenuDropdown — extracted from UserMenu.tsx for Hotfix-3 Fix #4
 * (2026-05-07).
 *
 * UserMenu lives in the shared layout, so its full body shipped on every
 * route's First Load JS (~2.2 kB shared overhead per the audit). Most
 * users never open the menu on most pages. By extracting the dropdown
 * panel into this separate chunk and dynamic-importing it with
 * `ssr: false` from the trigger only when `open === true`, the shared
 * layout no longer pays the dropdown body cost on first paint.
 *
 * Dark mode toggle removed 2026-09-06 (UI system handoff: dark mode is
 * retired by design, not deferred — see docs/design/handoff-2026-09-06).
 *
 * Reuse-before-construction: this is a near-direct port of the inline
 * markup that previously lived in UserMenu.tsx — same Zustand stores,
 * same icons, same hover styling, same a11y labels. Only the open-state
 * lives in the parent now (the parent decides when to mount this).
 *
 * Trigger, 2026-09-07 (operator ruling, superseding R2's two-row footer):
 * Sidebar.tsx's ONE nav-card footer row (the logged-in person's name) is
 * now this component's only trigger, on both the desktop card and the
 * mobile drawer — the separate Account/Admin rows are gone. Item rows
 * below are 44px min-height / 12px padding per that same ruling ("too
 * tight" against the old px-4 py-2 rows).
 */

import type { User } from "@supabase/supabase-js";
import { LogOut, User as UserIcon, Shield, Settings } from "lucide-react";

interface UserMenuDropdownProps {
  user: User;
  orgName: string | null;
  isAdmin: boolean;
  showAdminDot: boolean;
  adminAttentionTotal: number;
  onClose: () => void;
  onSignOut: () => void;
}

export default function UserMenuDropdown({
  user,
  orgName,
  isAdmin,
  showAdminDot,
  adminAttentionTotal,
  onClose,
  onSignOut,
}: UserMenuDropdownProps) {
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
      />

      {/* Dropdown */}
      <div
        className="absolute left-0 bottom-full mb-1 z-50 w-64 rounded-lg border shadow-lg"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-surface)",
          boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
        }}
      >
        {/* User info */}
        <div
          className="px-4 py-3 border-b"
          style={{ borderColor: "var(--color-border-subtle)" }}
        >
          <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
            {user.email}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            {orgName}
          </p>
          {isAdmin && (
            <span
              className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded"
              style={{
                color: "var(--color-primary)",
                backgroundColor: "var(--color-active-bg)",
              }}
            >
              <Shield size={8} />
              Admin
            </span>
          )}
        </div>

        {/* Actions — 44px min-height, 12px padding (operator ruling
            2026-09-07: "too tight"), not the old px-4 py-2 (~34px) rows. */}
        <div className="py-1">
          <a
            href="/profile"
            className="flex items-center gap-2 text-sm transition-colors"
            style={{ minHeight: 44, padding: 12, color: "var(--color-text-secondary)" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-surface-raised)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <UserIcon size={14} />
            Workspace profile
          </a>
          {isAdmin && (
            <a
              href="/admin"
              className="flex items-center gap-2 text-sm transition-colors"
              style={{ minHeight: 44, padding: 12, color: "var(--color-text-secondary)" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-surface-raised)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              aria-label={
                showAdminDot
                  ? `Admin panel — ${adminAttentionTotal} item${
                      adminAttentionTotal === 1 ? "" : "s"
                    } need attention`
                  : "Admin panel"
              }
            >
              <Shield size={14} />
              <span className="flex-1">Admin panel</span>
              {showAdminDot && (
                <span
                  className="inline-flex items-center justify-center text-[10px] font-semibold px-1.5 rounded-full"
                  style={{
                    minWidth: 16,
                    height: 16,
                    backgroundColor: "var(--color-error)",
                    color: "#fff",
                  }}
                >
                  {adminAttentionTotal > 99 ? "99+" : adminAttentionTotal}
                </span>
              )}
            </a>
          )}
          <a
            href="/settings"
            className="flex items-center gap-2 text-sm transition-colors"
            style={{ minHeight: 44, padding: 12, color: "var(--color-text-secondary)" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-surface-raised)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <Settings size={14} />
            Settings
          </a>
          <button
            onClick={onSignOut}
            className="w-full flex items-center gap-2 text-sm transition-colors cursor-pointer"
            style={{ minHeight: 44, padding: 12, color: "var(--color-text-secondary)" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-surface-raised)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </div>
    </>
  );
}
