"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "./AuthProvider";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { User, ChevronDown } from "lucide-react";
import { useAdminAttention } from "@/lib/hooks/useAdminAttention";

// Hotfix-3 Fix #4 (2026-05-07): UserMenu lives in the shared layout, so
// its full body shipped on every route's First Load JS (~2.2 kB shared
// overhead per the audit). The dropdown panel + ThemeToggle + extra
// lucide icons (LogOut/Shield/Settings/Sun/Moon) only matter when the
// user opens the menu. Extract to a separate chunk and dynamic-import
// with `ssr: false` — the trigger button stays SSR-rendered, so logged-in
// users still see their menu trigger immediately on first paint, but the
// dropdown body cost is paid only on click.
const UserMenuDropdown = dynamic(
  () => import("./UserMenuDropdown"),
  { ssr: false }
);

export function UserMenu() {
  const { user, signOut } = useAuth();
  const orgName = useWorkspaceStore((s) => s.orgName);
  const userRole = useWorkspaceStore((s) => s.userRole);
  const [open, setOpen] = useState(false);

  // Wave 2 follow-up: admin-attention dot was orphaned when PR-D removed
  // the Admin rail entry. Restored here on the dropdown's "Admin Panel"
  // entry. The hook is a no-op for non-admins (returns total = 0 and
  // never fires a network request), so we can call it unconditionally.
  const { total: adminAttentionTotal } = useAdminAttention();

  if (!user) return null;

  const displayName = user.email?.split("@")[0] || "User";
  const isAdmin = userRole === "owner" || userRole === "admin";
  const showAdminDot = isAdmin && adminAttentionTotal > 0;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors cursor-pointer min-w-0 max-w-full"
        style={{
          color: "var(--color-text-secondary)",
          backgroundColor: open ? "var(--color-surface-raised)" : "transparent",
        }}
        aria-label={
          showAdminDot
            ? `Open user menu (${adminAttentionTotal} admin item${
                adminAttentionTotal === 1 ? "" : "s"
              } need attention)`
            : "Open user menu"
        }
      >
        <User size={14} className="shrink-0" />
        {/* V-08 (2026-07-11): truncate long email-prefix display names so the chip never
            overflows the sidebar footer's min-w-0 column. */}
        <span className="hidden sm:block truncate min-w-0 flex-1 text-left">{displayName}</span>
        <ChevronDown size={12} className="shrink-0" />
        {showAdminDot && (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
            style={{ backgroundColor: "var(--color-error)" }}
          />
        )}
      </button>

      {open && (
        <UserMenuDropdown
          user={user}
          orgName={orgName}
          isAdmin={isAdmin}
          showAdminDot={showAdminDot}
          adminAttentionTotal={adminAttentionTotal}
          onClose={() => setOpen(false)}
          onSignOut={signOut}
        />
      )}
    </div>
  );
}
