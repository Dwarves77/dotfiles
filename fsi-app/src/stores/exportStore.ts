"use client";

import { create } from "zustand";

interface ExportState {
  // Selection
  selectedIds: string[];
  dragOrder: string[];
  format: "html" | "slack";
  level: "summary" | "standard" | "full";
  isOpen: boolean;

  // Actions
  toggleSelection: (id: string) => void;
  setDragOrder: (ids: string[]) => void;
  setFormat: (format: ExportState["format"]) => void;
  setLevel: (level: ExportState["level"]) => void;
  clearSelection: () => void;
  setOpen: (open: boolean) => void;
  selectAll: (ids: string[]) => void;
}

export const useExportStore = create<ExportState>((set) => ({
  selectedIds: [],
  dragOrder: [],
  format: "html",
  level: "standard",
  isOpen: false,

  toggleSelection: (id) =>
    set((state) => {
      const next = state.selectedIds.includes(id)
        ? state.selectedIds.filter((s) => s !== id)
        : [...state.selectedIds, id];
      return { selectedIds: next, dragOrder: next };
    }),

  setDragOrder: (dragOrder) => set({ dragOrder }),

  setFormat: (format) => set({ format }),

  setLevel: (level) => set({ level }),

  clearSelection: () => set({ selectedIds: [], dragOrder: [] }),

  setOpen: (isOpen) => set({ isOpen }),

  selectAll: (ids) => set({ selectedIds: ids, dragOrder: ids }),
}));
