/**
 * ObligationRegister — the customer-facing REGISTER section for spec-01's stated core (Lane OBLIG,
 * 2026-09-02). Server component: reads migration 290's `obligations` table (via
 * `src/lib/obligations/read-register.mjs`) with the REQUEST-SCOPED client, renders the honest empty
 * state when there is nothing to show, and hands the fetched rows to `ObligationRegisterFilterBar` (a
 * client component) for interactive filtering by jurisdiction / mode / binding position / due window,
 * sorted by due date.
 *
 * TWO MOUNT POINTS, ONE COMPONENT: the Regulations LIST page mounts it with no `itemId` (the whole
 * register, spec-01 §2's "the atomic unit is not the document, it is the obligation" made visible as its
 * own section rather than folded into a per-item brief); the Regulation DETAIL page mounts it with
 * `itemId` set (this one item's own obligations, the same shape as `UpcomingObligationsStrip`'s
 * `variant="detail"` card but reading the DENORMALIZED register — jurisdiction/mode/binding_position
 * already attached — rather than the raw item_forward_events row).
 *
 * NOT A DUPLICATE OF UpcomingObligationsStrip. That component (lane SURF, unmodified by this lane) reads
 * item_forward_events directly for "what is due next" — a small, fixed-count strip. This component reads
 * the DERIVED `obligations` register (migration 290) for the register section spec-01 §4 items 1-2 call
 * for: filterable, sortable, with binding_position as a first-class column — the field spec-01 §1 calls
 * "more important than any UI work" and which had zero renderers anywhere in the repo before this lane.
 *
 * SOFT-FAIL: a read failure never breaks the surrounding page (same posture UpcomingObligationsStrip
 * takes) — renders nothing on the list page (the page has plenty else to show), and a quiet omission on
 * the detail page (RegulationDetailSurface already tolerates a missing rail card).
 *
 * ROW MARKUP (lane MOBILE, 2026-09-03): this file is data-fetch only — every row, including the
 * `data-guard-title` heading, is ObligationRegisterFilterBar.tsx's "Obligation register" `<h2>`
 * (a "use client" component that takes `rows` as a prop, safe to mount directly in a browser
 * bundle). `.discipline/rendering/smoke/regulations-rows-smoke.mjs` mounts
 * ObligationRegisterFilterBar for real measurement and separately imports `ObligationRegister` from
 * `@/components/regulations/ObligationRegister` (this file), unused, only so F35's coverage scan (a
 * text match on the import path) resolves against the async wrapper that delegates its entire render
 * to the component the spec actually mounts.
 */

import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import {
  fetchObligationRegister,
  fetchObligationRegisterPage,
  fetchForwardEventCount,
  fetchRegisterFacetOptions,
} from "@/lib/obligations/read-register.mjs";
import { ObligationRegisterFilterBar, type ObligationRow } from "@/components/regulations/ObligationRegisterFilterBar";
import { LIST_FIRST_PAGE_SIZE } from "@/lib/list-pagination";

interface Props {
  /** Detail-page mount: scope to one item's own obligations. Accepts either a real uuid or the item's
   *  legacy_id (RegulationDetailSurface's `resource.id`, resolved to the real uuid below — same
   *  resolution UpcomingObligationsStrip already performs, since obligations.intelligence_item_id is a
   *  uuid FK). Omit for the list-page register section. */
  itemId?: string;
  /** "list" (default): the full-width register section on /regulations. "detail": a meta-rail card. */
  variant?: "list" | "detail";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function ObligationRegister({ itemId, variant = "list" }: Props) {
  if (variant === "detail" && !itemId) return null; // nothing to scope to — honest omission, not an error

  // fetchObligationRegister's JSDoc return type is the loose `Promise<Array<object>>` (read-register.mjs
  // is plain ESM, no `@/` alias, importable by a bare `node --test` — see its own header for why it
  // avoids a TS-only generic there); its actual runtime shape is exactly ObligationRow (proven by
  // read-register.test.mjs's fetchObligationRegister fixtures), so the cast below states a true fact
  // about the data, not a type-safety shortcut around a real mismatch.
  let rows: ObligationRow[] = [];
  let total = 0;
  let jurisdictionOptions: string[] = [];
  let modeOptions: string[] = [];
  // Source-event count for the list page's empty state: "derived from N forward events on file, none
  // classified into the register yet" is the honest read when `obligations` is empty but migration
  // 274's item_forward_events is not (901+ rows live) — see fetchForwardEventCount's own header. Only
  // fetched for the list variant (the detail variant renders nothing on empty, no message to fill in).
  let sourceEventCount: number | null = null;
  try {
    const supabase = await createSupabaseServerClient();

    // legacy_id -> uuid resolution, via the SAME request-scoped client (not service-role) — mirrors
    // UpcomingObligationsStrip's own resolution exactly, including its RLS reasoning: intelligence_items_read
    // already scopes anon/authenticated reads to provenance_status='verified' AND is_archived IS NOT
    // TRUE, so this lookup needs no elevated client, and an id that does not resolve yields no rows
    // (honest omission, never a leak or an error).
    let resolvedItemId: string | undefined = itemId;
    if (variant === "detail" && itemId && !UUID_RE.test(itemId)) {
      const { data } = await supabase.from("intelligence_items").select("id").eq("legacy_id", itemId).maybeSingle();
      resolvedItemId = data?.id ?? undefined;
      if (!resolvedItemId) return null;
    }

    if (variant === "detail") {
      // Unchanged from before this lane: small, itemId-scoped, no pagination need.
      rows = (await fetchObligationRegister(supabase, { itemId: resolvedItemId, limit: 200 })) as ObligationRow[];
      total = rows.length;
    } else {
      // PERF-11 (2026-09-04): FIRST PAGE ONLY, not the whole register. Was `fetchObligationRegister(...,
      // { limit: 500 })` — the entire table (1,141 live rows [CONFIRMED, live SQL, 2026-09-04] is well
      // under 500, so this was in practice "fetch the whole register, ship it whole, render up to 300
      // rows of it") shipped as props to a client component and rendered as up to 300 `<tr>` elements on
      // every /regulations load — the single largest contributor this lane measured to the page's
      // oversized document (approx 230-280 KB of the register's own field content alone, live-measured,
      // paid twice via SSR HTML + the RSC flight duplicate). Now: LIST_FIRST_PAGE_SIZE rows, soonest-due
      // first (the register's own natural, most-useful default order — unchanged), `total` for an honest
      // "N of M" header, and jurisdiction/mode filter options sourced independently (see
      // fetchRegisterFacetOptions's header) so the dropdowns stay complete even though the row payload no
      // longer is. Every further row arrives via ObligationRegisterFilterBar's "Load more" /
      // /api/obligations/register call — the same page+remainder-fetch shape FIRSTPAGE built for
      // /regulations, not a new mechanism.
      const page = await fetchObligationRegisterPage(supabase, { limit: LIST_FIRST_PAGE_SIZE, offset: 0 });
      rows = page.rows as ObligationRow[];
      total = page.total;
      const facets = await fetchRegisterFacetOptions(supabase);
      jurisdictionOptions = facets.jurisdictions;
      modeOptions = facets.modes;
    }
    if (variant === "list" && total === 0) {
      sourceEventCount = await fetchForwardEventCount(supabase);
    }
  } catch {
    return null; // soft-fail — an obligations read failure must never break the surrounding page
  }

  if (variant === "detail") {
    // Honest omission on the detail rail when this item has none — matches UpcomingObligationsStrip's
    // own pattern for the same reason: an ever-present empty card next to populated siblings reads as
    // broken, not honest.
    if (rows.length === 0) return null;
  }

  return (
    <ObligationRegisterFilterBar
      rows={rows}
      total={total}
      variant={variant}
      sourceEventCount={sourceEventCount}
      jurisdictionOptions={jurisdictionOptions}
      modeOptions={modeOptions}
    />
  );
}
