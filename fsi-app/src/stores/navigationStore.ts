"use client";

import { create } from "zustand";
import { useResourceStore } from "@/stores/resourceStore";
import type { TabId, FocusView, NavEntry } from "@/types/resource";

interface NavigationState {
  // Current state
  tab: TabId;
  focusView: FocusView | null;
  navStack: NavEntry[];

  // Actions
  setTab: (tab: TabId) => void;
  pushFocusView: (focusView: FocusView) => void;
  popNav: () => void;
  clearNav: () => void;
  navigateToResource: (resourceId: string) => void;
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  tab: "home",
  focusView: null,
  navStack: [],

  setTab: (tab) =>
    set({
      tab,
      focusView: null,
      navStack: [],
    }),

  pushFocusView: (focusView) =>
    set((state) => ({
      tab: "explore",
      focusView,
      navStack: [
        ...state.navStack,
        { tab: state.tab, focusView: state.focusView },
      ],
    })),

  popNav: () =>
    set((state) => {
      if (state.navStack.length === 0) return { focusView: null };
      const prev = state.navStack[state.navStack.length - 1];
      return {
        tab: prev.tab,
        focusView: prev.focusView || null,
        navStack: state.navStack.slice(0, -1),
      };
    }),

  clearNav: () => set({ navStack: [], focusView: null }),

  navigateToResource: (resourceId) => {
    // Push current state onto nav stack, switch to explore, expand + scroll
    set((state) => ({
      tab: "explore",
      focusView: null,
      navStack: [
        ...state.navStack,
        { tab: state.tab, focusView: state.focusView },
      ],
    }));
    // Expand the target resource (triggers auto-scroll via useScrollToResource)
    useResourceStore.getState().setExpanded(resourceId);
  },
}));
