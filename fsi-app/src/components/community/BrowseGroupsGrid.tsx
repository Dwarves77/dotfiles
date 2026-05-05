"use client";

/**
 * BrowseGroupsGrid — client wrapper around a grid of <GroupCard>s.
 *
 * Owns:
 *   - the toast hook for join success/error notifications
 *   - empty-state rendering when the upstream filter produced 0 groups
 *
 * Data flow: parent server component fetches the visible groups +
 * derives membershipState for each, passes them in. After a join, the
 * card optimistically transitions its own state to 'member' and we
 * surface a toast — full reconciliation happens on the next route
 * navigation/refresh.
 */

import { useState } from "react";
import { Toast } from "@/components/ui/Toast";
import { GroupCard, type GroupCardMembershipState } from "./GroupCard";
import type { CommunityGroupSummary } from "./types";

export interface BrowseRow {
  group: CommunityGroupSummary & { description?: string | null };
  membershipState: GroupCardMembershipState;
}

interface BrowseGroupsGridProps {
  rows: BrowseRow[];
  emptyState?: {
    title: string;
    body: string;
  };
}

export function BrowseGroupsGrid({ rows, emptyState }: BrowseGroupsGridProps) {
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    variant: "success" | "error";
  }>({ visible: false, message: "", variant: "success" });

  const showToast = (message: string, variant: "success" | "error" = "success") =>
    setToast({ visible: true, message, variant });

  if (rows.length === 0) {
    return (
      <div
        style={{
          padding: "48px 32px",
          border: "1px dashed var(--color-border)",
          borderRadius: 8,
          background: "var(--color-bg-surface)",
          textAlign: "center",
          maxWidth: 720,
          margin: "0 auto",
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 22,
            fontWeight: 400,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "var(--color-text-primary)",
            margin: "0 0 8px",
          }}
        >
          {emptyState?.title ?? "No groups yet"}
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "var(--color-text-secondary)",
            margin: 0,
            lineHeight: 1.55,
          }}
        >
          {emptyState?.body ??
            "Try a different region — the directory scopes by jurisdiction."}
        </p>
      </div>
    );
  }

  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: 16,
        }}
      >
        {rows.map((row) => (
          <GroupCard
            key={row.group.id}
            group={row.group}
            membershipState={row.membershipState}
            onJoined={() => showToast(`Joined ${row.group.name}`, "success")}
            onError={(msg) => showToast(msg, "error")}
          />
        ))}
      </div>
      <Toast
        message={toast.message}
        visible={toast.visible}
        variant={toast.variant}
        onDismiss={() => setToast((t) => ({ ...t, visible: false }))}
      />
    </>
  );
}
