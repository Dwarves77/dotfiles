"use client";

import { create } from "zustand";
import type { Resource } from "@/types/resource";

type SortKey = "urgency" | "priority" | "alpha" | "added" | "modified";

interface Filters {
  modes: string[];
  topics: string[];
  jurisdictions: string[];
  priorities: string[];
  verticals: string[];
  confidence: string[];
  search: string;
}

// ── Workspace Override ──
// Per-item overrides that belong to the current workspace.
// Platform data is never mutated — overrides are layered on top.
export interface WorkspaceOverride {
  itemId: string;
  priorityOverride: string | null;
  isArchived: boolean;
  archiveReason: string | null;
  archiveNote: string | null;
  notes: string;
}

interface ResourceState {
  // Platform data (shared, never mutated by workspace actions)
  resources: Resource[];
  archived: Resource[];

  // Workspace overrides (org-scoped, layered on top of platform data)
  overrides: Map<string, WorkspaceOverride>;

  // Filters
  filters: Filters;
  sort: SortKey;

  // UI
  expandedId: string | null;

  // Actions — platform data (set on load only)
  setResources: (resources: Resource[]) => void;
  setArchived: (archived: Resource[]) => void;

  // Actions — workspace overrides (write to override layer, not platform data)
  setOverrides: (overrides: WorkspaceOverride[]) => void;
  updatePriority: (id: string, priority: Resource["priority"]) => void;
  archiveResource: (id: string, reason: string, note: string, replacedBy?: string) => void;
  restoreResource: (id: string) => void;

  // Actions — filters
  toggleFilter: (dimension: keyof Omit<Filters, "search">, value: string) => void;
  setSearch: (search: string) => void;
  clearFilters: () => void;
  setSort: (sort: SortKey) => void;

  // Actions — UI
  setExpanded: (id: string | null) => void;
}

const emptyFilters: Filters = {
  modes: [],
  topics: [],
  jurisdictions: [],
  priorities: [],
  verticals: [],
  confidence: [],
  search: "",
};

export const useResourceStore = create<ResourceState>((set, get) => ({
  resources: [],
  archived: [],
  overrides: new Map(),
  filters: { ...emptyFilters },
  sort: "urgency",
  expandedId: null,

  setResources: (resources) => set({ resources }),
  setArchived: (archived) => set({ archived }),

  // Load workspace overrides from Supabase
  setOverrides: (overrideList) => {
    const map = new Map<string, WorkspaceOverride>();
    overrideList.forEach((o) => map.set(o.itemId, o));
    set({ overrides: map });
  },

  // Write to workspace override layer — NOT mutating platform data
  updatePriority: (id, priority) =>
    set((state) => {
      const newOverrides = new Map(state.overrides);
      const existing = newOverrides.get(id) || {
        itemId: id,
        priorityOverride: null,
        isArchived: false,
        archiveReason: null,
        archiveNote: null,
        notes: "",
      };
      newOverrides.set(id, { ...existing, priorityOverride: priority });
      return { overrides: newOverrides };
    }),

  // Archive via workspace override — platform item stays untouched
  archiveResource: (id, reason, note) =>
    set((state) => {
      const newOverrides = new Map(state.overrides);
      const existing = newOverrides.get(id) || {
        itemId: id,
        priorityOverride: null,
        isArchived: false,
        archiveReason: null,
        archiveNote: null,
        notes: "",
      };
      newOverrides.set(id, {
        ...existing,
        isArchived: true,
        archiveReason: reason,
        archiveNote: note,
      });
      return { overrides: newOverrides };
    }),

  // Restore: remove archive override
  restoreResource: (id) =>
    set((state) => {
      const newOverrides = new Map(state.overrides);
      const existing = newOverrides.get(id);
      if (existing) {
        newOverrides.set(id, {
          ...existing,
          isArchived: false,
          archiveReason: null,
          archiveNote: null,
        });
      }
      return { overrides: newOverrides };
    }),

  toggleFilter: (dimension, value) =>
    set((state) => {
      const current = state.filters[dimension];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { filters: { ...state.filters, [dimension]: next } };
    }),

  setSearch: (search) =>
    set((state) => ({ filters: { ...state.filters, search } })),

  clearFilters: () => set({ filters: { ...emptyFilters } }),

  setSort: (sort) => set({ sort }),

  setExpanded: (expandedId) => set({ expandedId }),
}));

// ── Merge Layer ──
// Combines platform resource data with workspace overrides.
// This is what the UI renders — the effective view for this workspace.

export function mergeWithOverrides(
  resources: Resource[],
  overrides: Map<string, WorkspaceOverride>
): { active: Resource[]; archived: Resource[] } {
  const active: Resource[] = [];
  const archived: Resource[] = [];

  for (const r of resources) {
    const override = overrides.get(r.id);

    if (override?.isArchived) {
      // Workspace archived this item — move to archived view
      archived.push({
        ...r,
        priority: (override.priorityOverride as Resource["priority"]) || r.priority,
        isArchived: true,
        archiveReason: override.archiveReason || undefined,
        archiveNote: override.archiveNote || undefined,
        archivedDate: new Date().toISOString().slice(0, 10),
      });
    } else {
      // Active item — apply priority override if present
      active.push({
        ...r,
        priority: (override?.priorityOverride as Resource["priority"]) || r.priority,
      });
    }
  }

  return { active, archived };
}
