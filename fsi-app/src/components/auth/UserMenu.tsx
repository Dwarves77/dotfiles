"use client";

import { useState } from "react";
import { useAuth } from "./AuthProvider";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { LogOut, User, ChevronDown, Shield, Settings, Sun, Moon } from "lucide-react";
import { useNavigationStore } from "@/stores/navigationStore";
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

export function UserMenu() {
  const { user, signOut } = useAuth();
  const orgName = useWorkspaceStore((s) => s.orgName);
  const userRole = useWorkspaceStore((s) => s.userRole);
  const [open, setOpen] = useState(false);

  // TEMPORARILY DISABLED for public access. Restore: if (!user) return null;

  const displayName = user?.email?.split("@")[0] || "Guest";
  // TEMPORARILY force admin visibility for public access. Restore:
  // const isAdmin = userRole === "owner" || userRole === "admin";
  const isAdmin = true;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors cursor-pointer"
        style={{
          color: "var(--color-text-secondary)",
          backgroundColor: open ? "var(--color-surface-raised)" : "transparent",
        }}
      >
        <User size={14} />
        <span className="hidden sm:inline">{displayName}</span>
        <ChevronDown size={12} />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
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
                {user?.email || "Guest"}
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
                <User size={14} />
                Workspace Profile
              </a>
              {isAdmin && (
                <a
                  href="/admin"
                  className="flex items-center gap-2 px-4 py-2 text-sm transition-colors"
                  style={{ color: "var(--color-text-secondary)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-surface-raised)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <Shield size={14} />
                  Admin Panel
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
                onClick={signOut}
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
      )}
    </div>
  );
}
