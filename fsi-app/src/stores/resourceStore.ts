"use client";

import { create } from "zustand";
import type { Resource } from "@/types/resource";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

// ── Persistence helpers ──
// One authed-JSON seam for every workspace/personal write. It returns the
// server's error MESSAGE, not just a boolean, because the dual-scope archive
// has user-actionable failures the UI must show verbatim — the role gate's
// "requires the admin or owner role. You can archive it just for yourself
// instead." is the whole point of the 403 and must not be swallowed into a
// generic toast.
async function persistJson(
  path: string,
  payload: Record<string, unknown>,
  method: "POST" | "DELETE"
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const supabase = createSupabaseBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      console.warn(
        `[resourceStore] No auth session — ${path} change is local-only and will be lost on reload.`
      );
      return { ok: false, error: "You are signed out. Sign in and try again." };
    }
    const resp = await fetch(path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.error(
        `[resourceStore] ${path} ${method} returned ${resp.status}: ${text.slice(0, 300)}`
      );
      let message = `Request failed (${resp.status}).`;
      try {
        const parsed = JSON.parse(text) as { error?: unknown };
        if (typeof parsed.error === "string" && parsed.error) message = parsed.error;
      } catch {
        /* non-JSON body — keep the status-code message */
      }
      return { ok: false, error: message };
    }
    return { ok: true, error: null };
  } catch (e: any) {
    console.error(`[resourceStore] ${path} request failed:`, e?.message || e);
    return { ok: false, error: "Network error. Your change was not saved." };
  }
}

// Thin boolean wrapper over persistJson for the override route — the shape the
// pre-existing priority/dismiss/owner actions already expect.
async function persistOverride(
  payload: { itemId: string } & Record<string, unknown>,
  method: "POST" | "DELETE"
): Promise<boolean> {
  const { ok } = await persistJson("/api/workspace/overrides", payload, method);
  return ok;
}

type SortKey = "urgency" | "priority" | "alpha" | "added" | "modified";

interface Filters {
  modes: string[];
  topics: string[];
  jurisdictions: string[];
  priorities: string[];
  verticals: string[];
  confidence: string[];
  search: string;
  searchScope: "profile" | "all";
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
  // Sprint 3 follow-up Part 2 (migration 111): per-workspace dismissal.
  // ISO timestamp when set; null when not dismissed. Distinct from
  // is_archived — dismissed hides the regulation from active Kanban
  // and surfaces it in the bottom stash drawer with a Restore action.
  dismissedAt?: string | null;
  // Phase 1 ownership (migration 234): org-scoped assignee. ownerName is
  // resolved server-side (org roster); null when unassigned OR when the
  // assignee has left the org — the merge layer renders that as unassigned.
  ownerUserId?: string | null;
  ownerName?: string | null;
}

// ── Personal item state ──
// Dual-scope archive (migration 235), the per-USER layer. Sits ABOVE the
// workspace override the same way the override sits above platform data:
// platform → org override → personal state. A personal archive hides the item
// for this user only and is ungated by design (no role, no reason, no fan-out) —
// it is not a team action.
export interface PersonalItemState {
  itemId: string;
  isArchived: boolean;
  archiveNote: string | null;
  archivedAt: string | null;
}

// ── Synopsis + Change types ──
export interface StoredSynopsis {
  sector: string;
  summary: string;
  urgencyScore: number | null;
}

export interface StoredChange {
  changeType: string;
  changeSeverity: string;
  changeSummary: string;
}

interface ResourceState {
  // Platform data (shared, never mutated by workspace actions)
  resources: Resource[];
  archived: Resource[];

  // Sector synopses: itemId -> sector -> synopsis
  synopses: Map<string, Map<string, StoredSynopsis>>;
  // Intelligence changes: itemId -> most recent change
  intelligenceChanges: Map<string, StoredChange>;
  // Sector display names: sector id -> display name
  sectorDisplayNames: Map<string, string>;

  // Workspace overrides (org-scoped, layered on top of platform data)
  overrides: Map<string, WorkspaceOverride>;

  // Personal state (user-scoped, layered on top of the org override)
  personalState: Map<string, PersonalItemState>;

  // Filters
  filters: Filters;
  sort: SortKey;

  // Sector session state
  sessionSectorOverride: boolean;     // true when session sectors differ from workspace profile
  workspaceSectorSnapshot: string[];  // snapshot of workspace profile at init time

  // UI
  expandedId: string | null;

  // Actions — platform data (set on load only)
  setResources: (resources: Resource[]) => void;
  setArchived: (archived: Resource[]) => void;
  setSynopses: (synopses: { itemId: string; sector: string; summary: string; urgencyScore: number | null }[]) => void;
  setIntelligenceChanges: (changes: { itemId: string; changeType: string; changeSeverity: string; changeSummary: string }[]) => void;
  setSectorDisplayNames: (names: { sector: string; displayName: string }[]) => void;

  // Actions — workspace overrides (write to override layer, not platform data)
  setOverrides: (overrides: WorkspaceOverride[]) => void;
  updatePriority: (id: string, priority: Resource["priority"]) => void;
  // Dual-scope archive (migration 235). Both archive actions RESOLVE to an
  // error message (null on success) rather than firing and forgetting: the
  // workspace path can legitimately refuse (403 role gate, 400 missing reason)
  // and the dialog must show the server's own wording.
  archiveResource: (id: string, reason: string, note: string) => Promise<string | null>;
  restoreResource: (id: string) => void;
  // Personal scope — ungated, hides the item for this user only.
  setPersonalState: (rows: PersonalItemState[]) => void;
  archivePersonal: (id: string, note: string) => Promise<string | null>;
  restorePersonal: (id: string) => Promise<string | null>;
  // Sprint 3 follow-up Part 2: dismiss/restore for the dismissed-stash
  // drawer on /regulations. Dismiss = hide from active Kanban + surface
  // in stash drawer; restore = clear the dismissed_at timestamp so the
  // regulation returns to its (priority_override-or-platform) column.
  dismissResource: (id: string) => void;
  restoreDismissed: (id: string) => void;
  // Phase 1 ownership (migration 234): assign/clear the org-scoped owner.
  // ownerName rides along so the UI renders the display name immediately
  // (optimistic) without a roster re-fetch.
  setOwner: (id: string, ownerUserId: string | null, ownerName: string | null) => void;

  // Actions — filters
  toggleFilter: (dimension: keyof Omit<Filters, "search" | "searchScope">, value: string) => void;
  setSearch: (search: string) => void;
  setSearchScope: (scope: "profile" | "all") => void;
  clearFilters: () => void;
  setSort: (sort: SortKey) => void;

  // Actions — sector session
  initSessionSectors: (workspaceProfile: string[]) => void;
  resetToWorkspaceSectors: () => void;

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
  searchScope: "profile",
};

export const useResourceStore = create<ResourceState>((set, get) => ({
  resources: [],
  archived: [],
  synopses: new Map(),
  intelligenceChanges: new Map(),
  sectorDisplayNames: new Map(),
  overrides: new Map(),
  personalState: new Map(),
  filters: { ...emptyFilters },
  sort: "urgency",
  sessionSectorOverride: false,
  workspaceSectorSnapshot: [],
  expandedId: null,

  setResources: (resources) => set({ resources }),
  setArchived: (archived) => set({ archived }),

  setSynopses: (list) => {
    const map = new Map<string, Map<string, StoredSynopsis>>();
    for (const s of list) {
      if (!map.has(s.itemId)) map.set(s.itemId, new Map());
      map.get(s.itemId)!.set(s.sector, { sector: s.sector, summary: s.summary, urgencyScore: s.urgencyScore });
    }
    set({ synopses: map });
  },

  setIntelligenceChanges: (list) => {
    const map = new Map<string, StoredChange>();
    for (const c of list) {
      if (!map.has(c.itemId)) {
        map.set(c.itemId, { changeType: c.changeType, changeSeverity: c.changeSeverity, changeSummary: c.changeSummary });
      }
    }
    set({ intelligenceChanges: map });
  },

  setSectorDisplayNames: (list) => {
    const map = new Map<string, string>();
    for (const s of list) map.set(s.sector, s.displayName);
    set({ sectorDisplayNames: map });
  },

  // Load workspace overrides from Supabase
  setOverrides: (overrideList) => {
    const map = new Map<string, WorkspaceOverride>();
    overrideList.forEach((o) => map.set(o.itemId, o));
    set({ overrides: map });
  },

  // Write to workspace override layer — NOT mutating platform data.
  // Optimistically updates local state, then POSTs to
  // /api/workspace/overrides. On failure, rolls back to the prior state so
  // the UI accurately reflects what's persisted in workspace_item_overrides.
  //
  // Sprint 3 followup Part 2: when the dropdown sets a priority on a
  // currently-dismissed regulation, the dismissed flag is cleared in the
  // same write (the menu item contract per the dispatch spec: "userPriority
  // = X, clear dismissed").
  updatePriority: (id, priority) => {
    const prev = get().overrides.get(id);
    set((state) => {
      const newOverrides = new Map(state.overrides);
      const existing = newOverrides.get(id) || {
        itemId: id,
        priorityOverride: null,
        isArchived: false,
        archiveReason: null,
        archiveNote: null,
        notes: "",
        dismissedAt: null,
      };
      newOverrides.set(id, {
        ...existing,
        priorityOverride: priority,
        dismissedAt: null,
      });
      return { overrides: newOverrides };
    });
    persistOverride(
      { itemId: id, priorityOverride: priority, dismissedAt: null },
      "POST"
    ).then((ok) => {
      if (!ok) {
        set((state) => {
          const rolled = new Map(state.overrides);
          if (prev) rolled.set(id, prev);
          else rolled.delete(id);
          return { overrides: rolled };
        });
      }
    });
  },

  // Phase 1 ownership (migration 234): assign/clear the org-scoped owner.
  // Same optimistic-write-rollback contract as updatePriority; the server
  // additionally enforces that the assignee is a member of the caller's org
  // (a 403 rolls the optimistic assignment back).
  setOwner: (id, ownerUserId, ownerName) => {
    const prev = get().overrides.get(id);
    set((state) => {
      const newOverrides = new Map(state.overrides);
      const existing = newOverrides.get(id) || {
        itemId: id,
        priorityOverride: null,
        isArchived: false,
        archiveReason: null,
        archiveNote: null,
        notes: "",
        dismissedAt: null,
      };
      newOverrides.set(id, {
        ...existing,
        ownerUserId,
        ownerName: ownerUserId === null ? null : ownerName,
      });
      return { overrides: newOverrides };
    });
    persistOverride({ itemId: id, ownerUserId }, "POST").then((ok) => {
      if (!ok) {
        set((state) => {
          const rolled = new Map(state.overrides);
          if (prev) rolled.set(id, prev);
          else rolled.delete(id);
          return { overrides: rolled };
        });
      }
    });
  },

  // Sprint 3 followup Part 2: dismiss = hide from active Kanban + surface
  // in stash drawer. Per dispatch spec: "dismissed = true, clear
  // userPriority". The clear-priority side ensures restoring a dismissed
  // regulation surfaces it back to its platform-default column rather than
  // a stale user override the operator may not remember setting.
  dismissResource: (id) => {
    const prev = get().overrides.get(id);
    const now = new Date().toISOString();
    set((state) => {
      const newOverrides = new Map(state.overrides);
      const existing = newOverrides.get(id) || {
        itemId: id,
        priorityOverride: null,
        isArchived: false,
        archiveReason: null,
        archiveNote: null,
        notes: "",
        dismissedAt: null,
      };
      newOverrides.set(id, {
        ...existing,
        dismissedAt: now,
        priorityOverride: null,
      });
      return { overrides: newOverrides };
    });
    persistOverride(
      { itemId: id, dismissedAt: now, priorityOverride: null },
      "POST"
    ).then((ok) => {
      if (!ok) {
        set((state) => {
          const rolled = new Map(state.overrides);
          if (prev) rolled.set(id, prev);
          else rolled.delete(id);
          return { overrides: rolled };
        });
      }
    });
  },

  // Sprint 3 followup Part 2: restore = clear dismissed_at, leaving any
  // other override fields untouched (notes, archive triad). Card returns
  // to its (priority_override-or-platform-default) column on the Kanban.
  restoreDismissed: (id) => {
    const prev = get().overrides.get(id);
    set((state) => {
      const newOverrides = new Map(state.overrides);
      const existing = newOverrides.get(id);
      if (existing) {
        newOverrides.set(id, { ...existing, dismissedAt: null });
      }
      return { overrides: newOverrides };
    });
    persistOverride({ itemId: id, dismissedAt: null }, "POST").then((ok) => {
      if (!ok) {
        set((state) => {
          const rolled = new Map(state.overrides);
          if (prev) rolled.set(id, prev);
          else rolled.delete(id);
          return { overrides: rolled };
        });
      }
    });
  },

  // WORKSPACE archive via the override layer — platform item stays untouched.
  // Team-wide effect, so the server may refuse (role gate / missing reason);
  // the refusal message is returned to the caller and the optimistic write is
  // rolled back. Awaited rather than fire-and-forget for exactly that reason.
  archiveResource: async (id, reason, note) => {
    const prev = get().overrides.get(id);
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
    });
    const { ok, error } = await persistJson(
      "/api/workspace/overrides",
      { itemId: id, isArchived: true, archiveReason: reason, archiveNote: note },
      "POST"
    );
    if (!ok) {
      set((state) => {
        const rolled = new Map(state.overrides);
        if (prev) rolled.set(id, prev);
        else rolled.delete(id);
        return { overrides: rolled };
      });
    }
    return ok ? null : error;
  },

  // Load the caller's personal state (GET /api/workspace/personal-state).
  setPersonalState: (rows) => {
    const map = new Map<string, PersonalItemState>();
    rows.forEach((r) => map.set(r.itemId, r));
    set({ personalState: map });
  },

  // PERSONAL archive — this user only. No role gate, no required reason, no
  // notification fan-out: it is not a team action and must never read as one.
  archivePersonal: async (id, note) => {
    const prev = get().personalState.get(id);
    set((state) => {
      const next = new Map(state.personalState);
      next.set(id, {
        itemId: id,
        isArchived: true,
        archiveNote: note || null,
        archivedAt: new Date().toISOString(),
      });
      return { personalState: next };
    });
    const { ok, error } = await persistJson(
      "/api/workspace/personal-state",
      { itemId: id, isArchived: true, archiveNote: note || null },
      "POST"
    );
    if (!ok) {
      set((state) => {
        const rolled = new Map(state.personalState);
        if (prev) rolled.set(id, prev);
        else rolled.delete(id);
        return { personalState: rolled };
      });
    }
    return ok ? null : error;
  },

  restorePersonal: async (id) => {
    const prev = get().personalState.get(id);
    set((state) => {
      const next = new Map(state.personalState);
      next.delete(id);
      return { personalState: next };
    });
    const { ok, error } = await persistJson(
      "/api/workspace/personal-state",
      { itemId: id, isArchived: false, archiveNote: null },
      "POST"
    );
    if (!ok) {
      set((state) => {
        const rolled = new Map(state.personalState);
        if (prev) rolled.set(id, prev);
        return { personalState: rolled };
      });
    }
    return ok ? null : error;
  },

  // Restore: clear archive flag in the override row
  restoreResource: (id) => {
    const prev = get().overrides.get(id);
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
    });
    persistOverride(
      { itemId: id, isArchived: false, archiveReason: null, archiveNote: null },
      "POST"
    ).then((ok) => {
      if (!ok) {
        set((state) => {
          const rolled = new Map(state.overrides);
          if (prev) rolled.set(id, prev);
          else rolled.delete(id);
          return { overrides: rolled };
        });
      }
    });
  },

  toggleFilter: (dimension, value) =>
    set((state) => {
      const arr = state.filters[dimension] as string[];
      const next = arr.includes(value)
        ? arr.filter((v) => v !== value)
        : [...arr, value];
      // Detect if sector filter now differs from workspace snapshot
      const sectorOverride = dimension === "verticals"
        ? JSON.stringify([...next].sort()) !== JSON.stringify([...state.workspaceSectorSnapshot].sort())
        : state.sessionSectorOverride;
      return {
        filters: { ...state.filters, [dimension]: next },
        sessionSectorOverride: sectorOverride,
      };
    }),

  setSearch: (search) =>
    set((state) => ({ filters: { ...state.filters, search } })),

  setSearchScope: (searchScope) =>
    set((state) => ({ filters: { ...state.filters, searchScope } })),

  clearFilters: () => set((state) => ({
    filters: { ...emptyFilters, verticals: state.workspaceSectorSnapshot },
    sessionSectorOverride: false,
  })),

  setSort: (sort) => set({ sort }),

  // Sector session management
  initSessionSectors: (workspaceProfile) =>
    set((state) => ({
      workspaceSectorSnapshot: workspaceProfile,
      filters: { ...state.filters, verticals: workspaceProfile },
      sessionSectorOverride: false,
    })),

  resetToWorkspaceSectors: () =>
    set((state) => ({
      filters: { ...state.filters, verticals: state.workspaceSectorSnapshot },
      sessionSectorOverride: false,
    })),

  setExpanded: (expandedId) => set({ expandedId }),
}));

// ── Merge Layer ──
// Combines platform resource data with workspace overrides.
// This is what the UI renders — the effective view for this workspace.

// Layer order is platform → org override → personal state. The personal layer
// is checked FIRST for archive because it is the narrower scope: a user who
// archived an item for themselves keeps it hidden regardless of what the
// workspace did, and restoring it for the team must not un-hide it for them.
// `personalState` is optional so pre-dual-scope call sites keep compiling with
// the same (resources, overrides) shape.
export function mergeWithOverrides(
  resources: Resource[],
  overrides: Map<string, WorkspaceOverride>,
  personalState?: Map<string, PersonalItemState>
): { active: Resource[]; archived: Resource[]; dismissed: Resource[] } {
  const active: Resource[] = [];
  const archived: Resource[] = [];
  const dismissed: Resource[] = [];

  for (const r of resources) {
    const override = overrides.get(r.id);
    const personal = personalState?.get(r.id);

    if (personal?.isArchived) {
      // Personal archive wins over every wider scope.
      archived.push({
        ...r,
        priority: (override?.priorityOverride as Resource["priority"]) || r.priority,
        actionOwner: override?.ownerName || r.actionOwner,
        isArchived: true,
        archiveReason: "personal",
        archiveNote: personal.archiveNote || undefined,
        archivedDate: (personal.archivedAt || new Date().toISOString()).slice(0, 10),
      });
      continue;
    }
    // Phase 1 ownership (migration 234): the org-scoped assignee surfaces
    // through the existing actionOwner field, so DashboardByOwner /
    // OwnerTeamCard / the Top-priority owner line all light up from this one
    // seam. ownerName is null for a departed member → renders unassigned.
    const actionOwner = override?.ownerName || r.actionOwner;

    if (override?.isArchived) {
      // Workspace archived this item — move to archived view
      archived.push({
        ...r,
        priority: (override.priorityOverride as Resource["priority"]) || r.priority,
        actionOwner,
        isArchived: true,
        archiveReason: override.archiveReason || undefined,
        archiveNote: override.archiveNote || undefined,
        archivedDate: new Date().toISOString().slice(0, 10),
      });
    } else if (override?.dismissedAt) {
      // Sprint 3 followup Part 2: dismissed regulations land in the
      // bottom stash drawer on /regulations. They do NOT appear in the
      // active Kanban view.
      dismissed.push({
        ...r,
        priority: (override.priorityOverride as Resource["priority"]) || r.priority,
        actionOwner,
      });
    } else {
      // Active item — apply priority override if present
      active.push({
        ...r,
        priority: (override?.priorityOverride as Resource["priority"]) || r.priority,
        actionOwner,
      });
    }
  }

  return { active, archived, dismissed };
}
