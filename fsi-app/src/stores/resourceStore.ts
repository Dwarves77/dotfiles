"use client";

import { create } from "zustand";
import type { Resource } from "@/types/resource";

type SortKey = "urgency" | "priority" | "alpha" | "added" | "modified";

interface Filters {
  modes: string[];
  topics: string[];
  jurisdictions: string[];
  priorities: string[];
  search: string;
}

interface ResourceState {
  // Data
  resources: Resource[];
  archived: Resource[];

  // Filters
  filters: Filters;
  sort: SortKey;

  // UI
  expandedId: string | null;

  // Actions — data
  setResources: (resources: Resource[]) => void;
  setArchived: (archived: Resource[]) => void;
  archiveResource: (id: string, reason: string, note: string, replacedBy?: string) => void;
  restoreResource: (id: string) => void;
  updatePriority: (id: string, priority: Resource["priority"]) => void;

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
  search: "",
};

export const useResourceStore = create<ResourceState>((set) => ({
  resources: [],
  archived: [],
  filters: { ...emptyFilters },
  sort: "urgency",
  expandedId: null,

  setResources: (resources) => set({ resources }),
  setArchived: (archived) => set({ archived }),

  archiveResource: (id, reason, note, replacedBy) =>
    set((state) => {
      const resource = state.resources.find((r) => r.id === id);
      if (!resource) return state;
      return {
        resources: state.resources.filter((r) => r.id !== id),
        archived: [
          ...state.archived,
          {
            ...resource,
            isArchived: true,
            archiveReason: reason,
            archiveNote: note,
            archivedDate: new Date().toISOString().slice(0, 10),
            replacedBy,
          },
        ],
      };
    }),

  restoreResource: (id) =>
    set((state) => {
      const resource = state.archived.find((r) => r.id === id);
      if (!resource) return state;
      const { isArchived, archiveReason, archiveNote, archivedDate, replacedBy, ...clean } = resource;
      return {
        archived: state.archived.filter((r) => r.id !== id),
        resources: [...state.resources, clean as Resource],
      };
    }),

  updatePriority: (id, priority) =>
    set((state) => ({
      resources: state.resources.map((r) =>
        r.id === id ? { ...r, priority } : r
      ),
    })),

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
