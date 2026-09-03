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
 */

import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { fetchObligationRegister, fetchForwardEventCount } from "@/lib/obligations/read-register.mjs";
import { ObligationRegisterFilterBar, type ObligationRow } from "@/components/regulations/ObligationRegisterFilterBar";

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

    rows = (await fetchObligationRegister(supabase, { itemId: variant === "detail" ? resolvedItemId : undefined, limit: 500 })) as ObligationRow[];
    if (variant === "list" && rows.length === 0) {
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

  return <ObligationRegisterFilterBar rows={rows} variant={variant} sourceEventCount={sourceEventCount} />;
}
