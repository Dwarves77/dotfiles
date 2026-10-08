// Portfolio view-model types (lane S8-D, 2026-10-07; spec 00 section 5; migration 362). Types only: the
// server read (read.ts) builds these, the two client views (src/components/portfolio) render them, and
// neither imports the other, so the client bundle never pulls in a server module.

import type { ListRowFields } from "@/lib/list-row-fields";

export type PortfolioSurfaceKey = "regulations" | "market" | "research" | "operations";

export interface PortfolioSummary {
  id: string;
  name: string;
  createdAt: string;
  memberCount: number;
}

export interface PortfolioItemRow extends ListRowFields {
  /** intelligence_items.id (the row's `id` is the UI id, legacy id or uuid, used for its link). */
  itemUuid: string;
  /** The surface this row links to and is grouped under. */
  surface: PortfolioSurfaceKey;
  /** intelligence_items.origin_class, or null when the item carries none (counted as unclassified). */
  originClass: string | null;
  /** Days to the nearest future binding date, or null. */
  dueDays: number | null;
}

export interface PortfolioEntityRow {
  entityId: string;
  kind: "corridor" | "entity";
  /** Spine kind word, for example "jurisdiction" or "corridor". */
  entityKind: string;
  /** Always a real name: display name, else a composed corridor label, else the canonical name. */
  label: string;
}

export interface PortfolioRollupView {
  total: number;
  items: { members: number; held: number; notHeld: string[] };
  entities: { corridors: number; other: number };
  bySurface: Record<PortfolioSurfaceKey, number>;
  otherSurface: number;
  byPriority: { CRITICAL: number; HIGH: number; MODERATE: number; LOW: number; unscored: number };
  nextDue: { itemId: string; days: number } | null;
  origin: { weakest: string | null; classified: number; unclassified: number };
}

export interface PortfolioDetailView {
  portfolio: { id: string; name: string; createdAt: string };
  rollup: PortfolioRollupView;
  groups: Array<{ surface: PortfolioSurfaceKey; rows: PortfolioItemRow[] }>;
  entityRows: PortfolioEntityRow[];
  /** Member entities that could not be read (should be none; counted so the denominator stays honest). */
  entitiesUnread: number;
}
