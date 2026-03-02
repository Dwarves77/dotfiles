"use client";

import { useState, useMemo } from "react";
import { useResourceStore } from "@/stores/resourceStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { Badge } from "@/components/ui/Badge";
import { PRIORITY_COLORS } from "@/lib/constants";
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
      <div className="text-xs text-[var(--sage)] py-4">
        No archived resources.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold tracking-wider uppercase text-white">
        Archive ({archived.length})
      </h3>

      {/* Search + Filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--sage)]" />
          <input
            type="text"
            placeholder="Search archive..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-7 pr-2 py-1.5 text-xs bg-white/[0.03] border border-white/6 rounded-[2px] text-white placeholder:text-[var(--sage)]/50 outline-none"
          />
        </div>
        <select
          value={filterReason}
          onChange={(e) => setFilterReason(e.target.value)}
          className="text-xs p-1.5 bg-white/5 border border-white/10 rounded-[2px] text-white"
        >
          <option value="">All reasons</option>
          {reasons.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      {/* List */}
      <div className="space-y-1.5">
        {filtered.map((r) => (
          <div
            key={r.id}
            className="flex items-center gap-3 px-3 py-2 border border-white/6 rounded-[2px] hover:border-white/10 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white truncate">{r.title}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-[var(--sage)]">{r.archiveReason}</span>
                <span className="text-xs text-[var(--sage)]">{r.archivedDate}</span>
                {r.replacedBy && (
                  <button
                    onClick={() => navigateToResource(r.replacedBy!)}
                    className="text-xs text-[var(--cyan)] hover:underline cursor-pointer"
                  >
                    Replacement
                  </button>
                )}
              </div>
            </div>
            <button
              onClick={() => restoreResource(r.id)}
              className="flex items-center gap-1 text-xs text-[var(--sage)] hover:text-white cursor-pointer transition-colors"
            >
              <RotateCcw size={10} strokeWidth={2} />
              Restore
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
