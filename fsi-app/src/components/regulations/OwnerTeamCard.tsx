"use client";

/**
 * OwnerTeamCard — right-rail card for /regulations/[id].
 *
 * Per dispatch F23: "OWNER & TEAM card (assignee, team distribution,
 * last update)".
 *
 * Phase 1 ownership (migration 234): the Assignee row is now INTERACTIVE —
 * a roster-fed select persisting the org-scoped owner through the store's
 * setOwner action (optimistic, rollback on failure; the server enforces
 * assignee-is-org-member). Roster is caller-scoped (no org_id needed
 * client-side).
 *
 * PERF-9 (2026-09-04, item 5, ADR-026 §4): the roster reads from the shared
 * useWorkspaceBootstrap() singleton (GET /api/workspace/bootstrap) instead of
 * its own independent fetch of /api/workspace/members — one of three call
 * sites (alongside usePersonalStateHydration and useListOrder) that used to
 * each fire their own per-user round trip on the same navigation.
 *
 * Honest rendering (unchanged doctrine):
 *   - lastVerifiedDate as "Last update" — the most honest single timestamp
 *     we have on the row.
 *   - No fabricated team-distribution/headcount data. The legacy role-chip
 *     split rendered only for legacy "A + B" strings; real assignees are
 *     single people, so the chips section is retired with the legacy field.
 */

import type { Resource } from "@/types/resource";
import { formatDate } from "@/lib/format";
import { useResourceStore } from "@/stores/resourceStore";
import { useWorkspaceBootstrap } from "@/lib/hooks/useWorkspaceBootstrap";

interface OwnerTeamCardProps {
  resource: Resource;
  /** Server-read current assignee (detail pages don't hydrate the override
   *  store on direct load). The store entry, once present (any live edit),
   *  takes precedence — including an explicit clear-to-null. */
  initialOwner?: { userId: string; name: string } | null;
}

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--text-2)",
  marginBottom: 6,
};

export function OwnerTeamCard({ resource: r, initialOwner = null }: OwnerTeamCardProps) {
  const setOwner = useResourceStore((s) => s.setOwner);
  const override = useResourceStore((s) => s.overrides.get(r.id));

  // Effective assignee: the store entry once one exists (live edits,
  // including clear-to-null), else the server-read initialOwner, else the
  // merged resource field (index surfaces hydrate ownerName into actionOwner).
  const ownerUserId = override ? override.ownerUserId ?? null : initialOwner?.userId ?? null;
  const ownerName = override
    ? override.ownerName ?? null
    : initialOwner?.name ?? r.actionOwner ?? null;

  // null while the bootstrap hasn't settled yet (or the roster is empty —
  // see below), non-null once it has. `data.members` is itself null when the
  // caller has no org (see /api/workspace/bootstrap's loadMembers), which
  // renders identically to "still loading": the read-only line, not an empty
  // assignable select — an org-less user was never able to assign anyone.
  const { data: bootstrap, settled: bootstrapSettled, error: bootstrapError } = useWorkspaceBootstrap();
  const members = bootstrap?.members ?? null;
  const rosterFailed = bootstrapSettled && (bootstrapError !== null || bootstrap?.members == null);

  const lastUpdate = r.lastVerifiedDate ? formatDate(r.lastVerifiedDate) : null;

  const onSelect = (value: string) => {
    if (value === "") {
      setOwner(r.id, null, null);
      return;
    }
    const member = (members || []).find((m) => m.user_id === value);
    if (member) setOwner(r.id, member.user_id, member.display_name);
  };

  // The select's value must be an option that exists. When the assignee has
  // left the org (ownerUserId set, not in roster) we fall back to "" and let
  // the read-only line below carry the honest state.
  const selectValue =
    ownerUserId && (members || []).some((m) => m.user_id === ownerUserId) ? ownerUserId : "";

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-sub)",
        borderRadius: "var(--r-md)",
        padding: "14px 16px",
        boxShadow: "var(--shadow)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--muted)",
          marginBottom: 10,
        }}
      >
        Owner & team
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={LABEL_STYLE}>Assignee</div>
        {members === null ? (
          // Roster still loading (or unavailable): render the current state
          // read-only rather than an empty select that looks assignable.
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: ownerName ? "var(--text)" : "var(--muted)",
              lineHeight: 1.4,
            }}
          >
            {ownerName || "Unassigned"}
            {rosterFailed && (
              <span style={{ display: "block", fontSize: 10.5, fontWeight: 600, color: "var(--muted)", marginTop: 2 }}>
                Roster unavailable — assignment is disabled right now.
              </span>
            )}
          </div>
        ) : (
          <select
            aria-label="Assign owner"
            value={selectValue}
            onChange={(e) => onSelect(e.target.value)}
            style={{
              width: "100%",
              fontFamily: "inherit",
              fontSize: 12.5,
              fontWeight: 700,
              padding: "7px 8px",
              borderRadius: 6,
              border: "1px solid var(--border-sub)",
              background: "var(--surface)",
              color: selectValue ? "var(--text)" : "var(--muted)",
              cursor: "pointer",
            }}
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.display_name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div>
        <div style={LABEL_STYLE}>Last update</div>
        <div
          style={{
            fontSize: 12.5,
            color: lastUpdate ? "var(--text)" : "var(--muted)",
            fontWeight: 600,
          }}
        >
          {lastUpdate || "Not recorded"}
        </div>
      </div>
    </div>
  );
}
