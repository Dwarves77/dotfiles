// Portfolio server read (lane S8-D, 2026-10-07; spec 00 section 5; migration 362). Builds the two view models
// the /dashboard/portfolio pages render, from rows the service in portfolio-core.mjs reads and from the
// already-held items and entities those rows point at. Nothing here writes, and nothing it computes is
// stored: the roll-ups are derived per request from held data only.
//
// REUSE, not construction. Item rows are read by the dashboard's own bounded by-id read
// (fetchBriefResourcesByIds, exported for this lane), enriched with source tier and bias chips by
// enrichRowSourceChips, and come out of the one row derivation every list uses (toListRowFields in
// src/lib/list-row-fields.ts, with its scoreResource fallback), the due date from dueInfo, the surface from
// canonicalSurfaceForItem (the same answer the row's own link uses), the corridor label from the
// corridor-scope reader's parser and unlocode-names. The service client is injected so a test can fake it; the pages pass the service-role
// client and the org they resolved from the session cookie, and every read below is filtered by that org
// or reads platform data the customer read gate already governs (verified, not archived).
//
// BOUNDED (F38/F39): member reads are capped at 500 by the service; item and entity lookups are chunked
// `.in()` reads over at most those 500 ids.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Resource } from "@/types/resource";
import { toListRowFields } from "@/lib/list-row-fields";
import { dueInfo } from "@/lib/dashboard/row-fields";
import { canonicalSurfaceForItem } from "@/lib/item-links";
import { enrichRowSourceChips, fetchBriefResourcesByIds, fetchWorkspaceOverrideRowsRaw } from "@/lib/supabase-server";
import { parseCorridorCanonicalName } from "@/lib/entities/corridor-scope";
import { formatCorridorLabel } from "@/lib/entities/unlocode-names.mjs";
import { computeRollup, getPortfolio, listMembers, listPortfolios } from "@/lib/portfolio/portfolio-core.mjs";
import type {
  PortfolioDetailView,
  PortfolioEntityRow,
  PortfolioItemRow,
  PortfolioSummary,
  PortfolioSurfaceKey,
} from "@/lib/portfolio/types";

const LOOKUP_CHUNK = 100;
/** fetchBriefResourcesByIds bounds each call at 40 ids (BRIEF_READ_CAP). */
const BRIEF_CHUNK = 40;

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

interface EntityRow {
  entity_id: string;
  kind: string;
  canonical_name: string;
  display_name: string | null;
}

export type PortfolioReadError = { ok: false; status: number; error: string };

export async function readPortfolioIndex(
  sb: SupabaseClient,
  orgId: string
): Promise<{ ok: true; portfolios: PortfolioSummary[]; countsTruncated: boolean } | PortfolioReadError> {
  const res = await listPortfolios(sb, orgId);
  if (!res.ok) return res;
  return { ok: true, portfolios: res.portfolios, countsTruncated: res.countsTruncated };
}

function entityLabel(e: EntityRow): string {
  if (e.display_name) return e.display_name;
  if (e.kind === "corridor") {
    const parsed = parseCorridorCanonicalName(e.canonical_name);
    if (parsed) return formatCorridorLabel(parsed);
  }
  return e.canonical_name;
}

/** One portfolio, its members hydrated, grouped by surface, with the roll-ups. null when not in this org. */
export async function readPortfolioDetail(
  sb: SupabaseClient,
  orgId: string,
  portfolioId: string,
  now: Date
): Promise<{ ok: true; view: PortfolioDetailView | null } | PortfolioReadError> {
  const found = await getPortfolio(sb, orgId, portfolioId);
  if (!found.ok) return found;
  if (!found.portfolio) return { ok: true, view: null };
  const mem = await listMembers(sb, { orgId, portfolioId });
  if (!mem.ok) return mem;

  const members = mem.members.map((m: { member_kind: string; item_id: string | null; entity_id: string | null }) => ({
    kind: m.member_kind,
    itemId: m.item_id,
    entityId: m.entity_id,
  }));
  const itemIds = members.filter((m: { kind: string }) => m.kind === "item").map((m: { itemId: string | null }) => m.itemId as string);
  const entityIds = members.filter((m: { kind: string }) => m.kind !== "item").map((m: { entityId: string | null }) => m.entityId as string);

  // Held items: the SAME bounded by-id read the dashboard's cards use (fetchBriefResourcesByIds): verified, not
  // archived, with this workspace's own overrides applied (a workspace-archived item is not held here either).
  // Anything it does not return stays a member, counted in the denominator and named in `notHeld`, and is left
  // out of every figure. Read in chunks because that read bounds each call.
  const overrides = await fetchWorkspaceOverrideRowsRaw(orgId);
  const resources: Resource[] = [];
  for (const ids of chunk(itemIds, BRIEF_CHUNK)) {
    resources.push(...(await fetchBriefResourcesByIds(ids, overrides)));
  }
  // The source tier and bias chips, through the one enrichment every list uses (bounded to this portfolio's rows).
  await enrichRowSourceChips(resources, { enrichBiasTags: true });

  // The uuid and origin class of the held rows: the Resource carries the UI id (legacy id or uuid) only.
  const keyRows: Array<{ id: string; legacy_id: string | null; origin_class: string | null }> = [];
  for (const ids of chunk(itemIds, LOOKUP_CHUNK)) {
    const { data, error } = await sb
      .from("intelligence_items")
      .select("id, legacy_id, origin_class")
      // fitness-allow: F39 (an id list of one portfolio's items, at most 500 by the migration 362 cap, read in chunks of 100)
      .in("id", ids);
    if (error) return { ok: false, status: 500, error: error.message };
    keyRows.push(...((data ?? []) as typeof keyRows));
  }
  const keyByUiId = new Map(keyRows.map((r) => [r.legacy_id || r.id, r]));

  const heldItems: PortfolioItemRow[] = [];
  for (const resource of resources) {
    const key = keyByUiId.get(resource.id);
    if (!key) continue; // not one of this portfolio's members
    const due = dueInfo(resource, now);
    heldItems.push({
      ...toListRowFields(resource, now),
      itemUuid: key.id,
      surface: canonicalSurfaceForItem({ type: resource.type, domain: resource.domain }),
      originClass: key.origin_class ?? null,
      dueDays: due ? due.daysNum : null,
    });
  }

  // Entities: label and kind come from the spine row. A member whose entity row cannot be read is counted.
  const entityRows: EntityRow[] = [];
  for (const ids of chunk(entityIds, LOOKUP_CHUNK)) {
    const { data, error } = await sb
      .from("entities")
      .select("entity_id, kind, canonical_name, display_name")
      // fitness-allow: F39 (an id list of one portfolio's entities, at most 500 by the migration 362 cap, read in chunks of 100)
      .in("entity_id", ids);
    if (error) return { ok: false, status: 500, error: error.message };
    entityRows.push(...((data ?? []) as EntityRow[]));
  }
  const entityById = new Map(entityRows.map((e) => [e.entity_id, e]));
  const entityViews: PortfolioEntityRow[] = [];
  for (const m of members as Array<{ kind: string; entityId: string | null }>) {
    if (m.kind === "item" || !m.entityId) continue;
    const e = entityById.get(m.entityId);
    if (!e) continue;
    entityViews.push({
      entityId: e.entity_id,
      kind: m.kind === "corridor" ? "corridor" : "entity",
      entityKind: e.kind,
      label: entityLabel(e),
    });
  }

  const rollup = computeRollup({
    members,
    heldItems: heldItems.map((h) => ({
      id: h.itemUuid,
      surface: h.surface,
      priority: h.priority || null,
      dueDays: h.dueDays,
      originClass: h.originClass,
    })),
  });

  const order: PortfolioSurfaceKey[] = ["regulations", "market", "research", "operations"];
  const groups = order
    .map((surface) => ({
      surface,
      rows: heldItems
        .filter((h) => h.surface === surface)
        // Most urgent binding date first; items with no date after, in title order (stable, no invented rank).
        .sort((a, b) => (a.dueDays ?? Infinity) - (b.dueDays ?? Infinity) || a.title.localeCompare(b.title)),
    }))
    .filter((g) => g.rows.length > 0);

  return {
    ok: true,
    view: {
      portfolio: found.portfolio,
      rollup,
      groups,
      entityRows: entityViews,
      entitiesUnread: entityIds.length - entityViews.length,
    },
  };
}
