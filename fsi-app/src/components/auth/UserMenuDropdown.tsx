"use client";

/**
 * UserMenuDropdown — extracted from UserMenu.tsx for Hotfix-3 Fix #4
 * (2026-05-07).
 *
 * UserMenu lives in the shared layout, so its full body shipped on every
 * route's First Load JS (~2.2 kB shared overhead per the audit). Most
 * users never open the menu on most pages. By extracting the dropdown
 * panel + ThemeToggle into this separate chunk and dynamic-importing it
 * with `ssr: false` from the trigger only when `open === true`, the
 * shared layout no longer pays the dropdown body cost on first paint.
 *
 * Reuse-before-construction: this is a near-direct port of the inline
 * markup that previously lived in UserMenu.tsx — same Zustand stores,
 * same icons, same hover styling, same a11y labels. Only the open-state
 * lives in the parent now (the parent decides when to mount this).
 */

import type { User } from "@supabase/supabase-js";
import { LogOut, User as UserIcon, Shield, Settings, Sun, Moon } from "lucide-react";
import { useSettingsStore } from "@/stores/settingsStore";

function ThemeToggle() {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const isDark = theme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors cursor-pointer"
      style={{ color: "var(--color-text-secondary)" }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-surface-raised)")}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
    >
      {isDark ? <Sun size={14} /> : <Moon size={14} />}
      {isDark ? "Light mode" : "Dark mode"}
    </button>
  );
}

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

        {/* Actions */}
        <div className="py-1">
          <a
            href="/profile"
            className="flex items-center gap-2 px-4 py-2 text-sm transition-colors"
            style={{ color: "var(--color-text-secondary)" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-surface-raised)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <UserIcon size={14} />
            Workspace Profile
          </a>
          {isAdmin && (
            <a
              href="/admin"
              className="flex items-center gap-2 px-4 py-2 text-sm transition-colors"
              style={{ color: "var(--color-text-secondary)" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-surface-raised)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              aria-label={
                showAdminDot
                  ? `Admin Panel — ${adminAttentionTotal} item${
                      adminAttentionTotal === 1 ? "" : "s"
                    } need attention`
                  : "Admin Panel"
              }
            >
              <Shield size={14} />
              <span className="flex-1">Admin Panel</span>
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
            className="flex items-center gap-2 px-4 py-2 text-sm transition-colors"
            style={{ color: "var(--color-text-secondary)" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-surface-raised)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <Settings size={14} />
            Settings
          </a>
          <ThemeToggle />
          <button
            onClick={onSignOut}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors cursor-pointer"
            style={{ color: "var(--color-text-secondary)" }}
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
