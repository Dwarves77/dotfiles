"use client";

import { useState, useMemo } from "react";
import type { Resource } from "@/types/resource";
import { useResourceStore } from "@/stores/resourceStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { Search, RotateCcw, Users, User } from "lucide-react";

// Dual-scope archive (migration 235). Two different things land a row in this
// list and they restore through different routes, so the row has to say which:
//
//   team     — workspace_item_overrides (or a platform archive). Visible to the
//              whole workspace; restoreResource clears it for everyone.
//   personal — user_item_state, this user only. restorePersonal clears it, and
//              only for them. Nobody else ever saw it hidden.
//
// A single unlabelled "Restore" across both would be a lie in one direction or
// the other, so the scope is stated on every row.
type ArchiveScope = "team" | "personal";

interface ArchiveRow {
  resource: Resource;
  scope: ArchiveScope;
}

export function ArchiveViewer() {
  const { archived, resources, personalState, restoreResource, restorePersonal } =
    useResourceStore();
  const { navigateToResource } = useNavigationStore();
  const [search, setSearch] = useState("");
  const [filterReason, setFilterReason] = useState("");
  const [restoreError, setRestoreError] = useState<{ id: string; message: string } | null>(null);

  // Team rows keep their existing source (the store's archived list, which the
  // workspace RPC already resolves through effective_archived). Personal rows
  // are additive on top — a user with no personal state gets exactly the list
  // this component produced before.
  const rows = useMemo<ArchiveRow[]>(() => {
    const teamRows: ArchiveRow[] = archived.map((r) => ({ resource: r, scope: "team" }));
    const seen = new Set(archived.map((r) => r.id));

    const byId = new Map<string, Resource>();
    for (const r of resources) byId.set(r.id, r);

    const personalRows: ArchiveRow[] = [];
    for (const p of personalState.values()) {
      if (!p.isArchived) continue;
      // Already archived team-wide: the wider scope is what is actually hiding
      // it, so show that row. Once the team archive is lifted this row
      // reappears under its personal label — which is the truth.
      if (seen.has(p.itemId)) continue;
      // The corpus is normally in the store by the time this renders. If it is
      // not, fall back to a stub carrying the id rather than dropping the row —
      // an unrestorable personal archive is worse than an unlabelled one.
      const base = byId.get(p.itemId);
      personalRows.push({
        scope: "personal",
        resource: {
          ...(base ?? ({ id: p.itemId, title: p.itemId, note: "", tags: [] } as unknown as Resource)),
          isArchived: true,
          archiveNote: p.archiveNote || undefined,
          archivedDate: (p.archivedAt || "").slice(0, 10) || undefined,
        },
      });
    }

    return [...teamRows, ...personalRows];
  }, [archived, resources, personalState]);

  const filtered = useMemo(() => {
    return rows.filter(({ resource: r }) => {
      if (filterReason && r.archiveReason !== filterReason) return false;
      if (search) {
        const q = search.toLowerCase();
        const s = `${r.title} ${r.note} ${(r.tags || []).join(" ")}`.toLowerCase();
        if (!s.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, filterReason]);

  const reasons = useMemo(() => {
    const set = new Set(rows.map(({ resource: r }) => r.archiveReason).filter(Boolean));
    return Array.from(set);
  }, [rows]);

  async function handleRestore(row: ArchiveRow) {
    setRestoreError(null);
    if (row.scope === "personal") {
      // Personal restore round-trips and can fail (signed out, offline); the
      // store rolls the optimistic delete back, so the row must say so.
      const failure = await restorePersonal(row.resource.id);
      if (failure) setRestoreError({ id: row.resource.id, message: failure });
      return;
    }
    restoreResource(row.resource.id);
  }

  if (rows.length === 0) {
    return (
      <div className="space-y-3">
        <h3 className="text-xs font-semibold tracking-wider uppercase text-text-primary">
          Archive
        </h3>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <p className="text-sm font-medium text-text-primary">No archived resources</p>
          <p className="text-xs mt-1 text-text-secondary max-w-sm">
            When resources are superseded, expired, or archived from the Regulations tab, they appear here for review and restoration.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold tracking-wider uppercase text-text-primary">
        Archive ({rows.length})
      </h3>

      {/* Search + Filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-secondary" />
          <input
            type="text"
            placeholder="Search archive..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-7 pr-2 py-1.5 text-xs bg-surface-input border border-border-subtle rounded-md text-text-primary placeholder:text-text-secondary/50 outline-none"
          />
        </div>
        <select
          value={filterReason}
          onChange={(e) => setFilterReason(e.target.value)}
          className="text-xs p-1.5 bg-surface-overlay border border-border-light rounded-md text-text-primary"
        >
          <option value="">All reasons</option>
          {reasons.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <p className="text-sm font-medium text-text-primary">No matching archived resources</p>
          <p className="text-xs mt-1 text-text-secondary">
            Try adjusting your search or filter criteria.
          </p>
        </div>
      ) : (
      <div className="space-y-1.5">
        {filtered.map((row) => {
          const r = row.resource;
          const isPersonal = row.scope === "personal";
          return (
          <div
            key={`${row.scope}:${r.id}`}
            className="flex items-center gap-3 px-3 py-2 border border-border-subtle rounded-md hover:border-border-light transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p className="text-xs text-text-primary truncate">{r.title}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {/* Which scope archived this, stated plainly — it decides who
                    else sees the item hidden and what Restore actually undoes. */}
                <span
                  className="flex items-center gap-1 text-xs text-text-secondary"
                  title={
                    isPersonal
                      ? "You archived this for yourself. Your teammates still see it."
                      : "Archived for the whole workspace."
                  }
                >
                  {isPersonal ? (
                    <User size={10} strokeWidth={2} aria-hidden="true" />
                  ) : (
                    <Users size={10} strokeWidth={2} aria-hidden="true" />
                  )}
                  {isPersonal ? "Just you" : "Whole team"}
                </span>
                {r.archiveReason && (
                  <span className="text-xs text-text-secondary">{r.archiveReason}</span>
                )}
                {r.archivedDate && (
                  <span className="text-xs text-text-secondary">{r.archivedDate}</span>
                )}
                {r.replacedBy && (
                  <button
                    onClick={() => navigateToResource(r.replacedBy!)}
                    className="text-xs text-text-accent hover:underline cursor-pointer"
                  >
                    Replacement
                  </button>
                )}
              </div>
              {restoreError?.id === r.id && (
                <p role="alert" className="text-xs text-text-secondary mt-0.5">
                  {restoreError.message}
                </p>
              )}
            </div>
            <button
              onClick={() => handleRestore(row)}
              className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary cursor-pointer transition-colors"
              aria-label={
                isPersonal
                  ? `Restore ${r.title} for yourself`
                  : `Restore ${r.title} for the whole team`
              }
            >
              <RotateCcw size={10} strokeWidth={2} />
              Restore
            </button>
          </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
