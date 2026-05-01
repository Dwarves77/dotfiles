"use client";

import { useState, useMemo } from "react";
import { useResourceStore } from "@/stores/resourceStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { Search, RotateCcw } from "lucide-react";

export function ArchiveViewer() {
  const { archived, restoreResource } = useResourceStore();
  const { navigateToResource } = useNavigationStore();
  const [search, setSearch] = useState("");
  const [filterReason, setFilterReason] = useState("");

  const filtered = useMemo(() => {
    return archived.filter((r) => {
      if (filterReason && r.archiveReason !== filterReason) return false;
      if (search) {
        const q = search.toLowerCase();
        const s = `${r.title} ${r.note} ${(r.tags || []).join(" ")}`.toLowerCase();
        if (!s.includes(q)) return false;
      }
      return true;
    });
  }, [archived, search, filterReason]);

  const reasons = useMemo(() => {
    const set = new Set(archived.map((r) => r.archiveReason).filter(Boolean));
    return Array.from(set);
  }, [archived]);

  if (archived.length === 0) {
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
        Archive ({archived.length})
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
        {filtered.map((r) => (
          <div
            key={r.id}
            className="flex items-center gap-3 px-3 py-2 border border-border-subtle rounded-md hover:border-border-light transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p className="text-xs text-text-primary truncate">{r.title}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-text-secondary">{r.archiveReason}</span>
                <span className="text-xs text-text-secondary">{r.archivedDate}</span>
                {r.replacedBy && (
                  <button
                    onClick={() => navigateToResource(r.replacedBy!)}
                    className="text-xs text-text-accent hover:underline cursor-pointer"
                  >
                    Replacement
                  </button>
                )}
              </div>
            </div>
            <button
              onClick={() => restoreResource(r.id)}
              className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary cursor-pointer transition-colors"
            >
              <RotateCcw size={10} strokeWidth={2} />
              Restore
            </button>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}
