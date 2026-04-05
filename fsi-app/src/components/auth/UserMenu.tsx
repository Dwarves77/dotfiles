"use client";

import { useState } from "react";
import { useAuth } from "./AuthProvider";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { LogOut, User, ChevronDown, Shield } from "lucide-react";

export function UserMenu() {
  const { user, signOut } = useAuth();
  const orgName = useWorkspaceStore((s) => s.orgName);
  const [open, setOpen] = useState(false);

  if (!user) return null;

  const displayName = user.email?.split("@")[0] || "User";
  const isAdmin = true; // TODO: check org_memberships role

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
            className="absolute right-0 top-full mt-1 z-50 w-64 rounded-lg border shadow-lg"
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
