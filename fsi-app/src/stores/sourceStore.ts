"use client";

import { create } from "zustand";
import type { Source, ProvisionalSource, SourceTier, IntelligenceDomain } from "@/types/source";

interface SourceFilters {
  tiers: SourceTier[];
  statuses: string[];
  domains: number[];
  jurisdictions: string[];
  search: string;
}

interface SourceState {
  // Data
  sources: Source[];
  provisionalSources: ProvisionalSource[];

  // Filters
  filters: SourceFilters;

  // UI
  expandedSourceId: string | null;
  activeView: "registry" | "health" | "provisional" | "canonical" | "intersections";

  // Actions — data
  setSources: (sources: Source[]) => void;
  setProvisionalSources: (ps: ProvisionalSource[]) => void;

  // Actions — filters
  toggleTierFilter: (tier: SourceTier) => void;
  toggleStatusFilter: (status: string) => void;
  toggleDomainFilter: (domain: number) => void;
  setSourceSearch: (search: string) => void;
  clearSourceFilters: () => void;

  // Actions — UI
  setExpandedSource: (id: string | null) => void;
  setActiveView: (view: SourceState["activeView"]) => void;
}

const emptyFilters: SourceFilters = {
  tiers: [],
  statuses: [],
  domains: [],
  jurisdictions: [],
  search: "",
};

export const useSourceStore = create<SourceState>((set) => ({
  sources: [],
  provisionalSources: [],

  filters: { ...emptyFilters },
  expandedSourceId: null,
  activeView: "registry",

  setSources: (sources) => set({ sources }),
  setProvisionalSources: (provisionalSources) => set({ provisionalSources }),

  toggleTierFilter: (tier) =>
    set((state) => {
      const current = state.filters.tiers;
      const next = current.includes(tier)
        ? current.filter((t) => t !== tier)
        : [...current, tier];
      return { filters: { ...state.filters, tiers: next } };
    }),

  toggleStatusFilter: (status) =>
    set((state) => {
      const current = state.filters.statuses;
      const next = current.includes(status)
        ? current.filter((s) => s !== status)
        : [...current, status];
      return { filters: { ...state.filters, statuses: next } };
    }),

  toggleDomainFilter: (domain) =>
    set((state) => {
      const current = state.filters.domains;
      const next = current.includes(domain)
        ? current.filter((d) => d !== domain)
        : [...current, domain];
      return { filters: { ...state.filters, domains: next } };
    }),

  setSourceSearch: (search) =>
    set((state) => ({ filters: { ...state.filters, search } })),

  clearSourceFilters: () => set({ filters: { ...emptyFilters } }),

  setExpandedSource: (expandedSourceId) => set({ expandedSourceId }),
  setActiveView: (activeView) => set({ activeView }),
}));

// ── Derived: Filter sources ──
export function filterSources(
  sources: Source[],
  filters: SourceFilters
): Source[] {
  return sources.filter((s) => {
    // Phase 1.5: effective_tier per customer-facing default rule (sources
    // registry page filter operates on the dynamic credibility signal).
    // Fall back to base_tier if effective_tier is null (Day 1 invariant
    // backs base_tier).
    const t = s.effective_tier ?? s.base_tier;
    if (filters.tiers.length > 0 && !filters.tiers.includes(t)) return false;
    if (filters.statuses.length > 0 && !filters.statuses.includes(s.status)) return false;
    if (filters.domains.length > 0 && !filters.domains.some((d) => s.domains.includes(d as IntelligenceDomain))) return false;
    if (filters.jurisdictions.length > 0 && !filters.jurisdictions.some((j) => s.jurisdictions.includes(j))) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const searchable = `${s.name} ${s.description} ${s.notes}`.toLowerCase();
      if (!searchable.includes(q)) return false;
    }
    return true;
  });
}
