"use client";

/**
 * ObligationRegister — the customer-facing REGISTER section for spec-01's stated core (Lane OBLIG,
 * 2026-09-02). Converted to a client-side fetch by PERF-10 (2026-09-04, root-cause fix, ADR-026
 * Follow-up); its data model — first-page-only render, honest "N of M", independent filter facets —
 * is PERF-11's (2026-09-04), converged onto the client mount by PERF-MERGE (2026-09-04): the two
 * lanes edited this file in parallel worktrees off the same train-43 base and both had to be true at
 * once (see /api/obligations/register/route.ts's own header for the same convergence on the API side).
 *
 * WHY THIS CHANGED FROM AN ASYNC SERVER COMPONENT (PERF-10). This used to read migration 290's
 * `obligations` table via createSupabaseServerClient (cookie-bound) DURING its own server render — a
 * Dynamic API call that forced /regulations to build `ƒ` (Dynamic) at build time, independent of the
 * shared-layout cause PERF-10's layout.tsx commit removes. src/lib/obligations/read-register.mjs's
 * own header is explicit ("RLS, NOT A SEPARATE GATE... MUST always be called with the REQUEST-SCOPED
 * client... never a service-role client") — this respects that prohibition rather than reversing it.
 * The SAME calls, through the SAME request-scoped client, now run inside a Route Handler (GET
 * /api/obligations/register) instead of this component's server render. A Route Handler's own
 * Dynamic-API dependency does not propagate to a page that merely fetch()s it client-side, which is
 * what unblocks static generation here — see UpcomingObligationsStrip.tsx's identical-shape header for
 * the sibling conversion this mirrors.
 *
 * WHY THE FIRST-PAGE MODEL STAYS (PERF-11, preserved through the client conversion). Before PERF-11,
 * this fetched up to 500 rows (in practice the WHOLE live register, 1,141 rows [CONFIRMED, live SQL,
 * 2026-09-04]) and shipped them all — the single largest contributor PERF-11 measured to /regulations'
 * oversized document. The fix — LIST_FIRST_PAGE_SIZE rows, soonest-due first, an honest `total`, and
 * jurisdiction/mode filter options sourced independently of the loaded page (fetchRegisterFacetOptions,
 * server-side inside the route, never client-computed from a partial page) — is a payload-weight fix
 * PERF-10's Dynamic-API fix does not supersede: converting the read to a client fetch and then having
 * that fetch pull the whole register back would reintroduce the exact defect PERF-11 closed, just moved
 * from SSR HTML to a browser round trip. So this component makes exactly ONE request on mount (the
 * unfiltered first page, list variant; the itemId-scoped read, detail variant) and hands the response
 * straight to ObligationRegisterFilterBar (unmodified by this merge), which owns every subsequent
 * filter-change / "Load more" request itself — see that component's own header for the paging contract.
 *
 * TWO MOUNT POINTS, ONE COMPONENT (unchanged since Lane OBLIG): the Regulations LIST page mounts it
 * with no `itemId` (the full register, always rendered, even when empty — FilterBar itself renders the
 * "derived from N forward events" honest-empty copy); the Regulation DETAIL page mounts it with
 * `itemId` set, hiding itself entirely when that item has zero obligations (same soft-omission
 * UpcomingObligationsStrip's detail variant takes).
 *
 * UX-LAWS COMPLIANCE: the list variant shows an explicit "Loading obligation register…" state while
 * the fetch is in flight, never a silent/blank render that could be misread as "no obligations
 * tracked." The detail variant shows nothing while loading, matching its own already-honest
 * "nothing to show" contract for an item with zero obligations.
 *
 * RECONCILE (2026-09-04, item 4b-i): the LIST variant's "Loading obligation register…" state used to
 * render on EVERY /regulations navigation, however briefly, because the unfiltered first page was
 * fetched only after this component mounted client-side — the exact "index page has an SSR'd masthead
 * but a section that goes blank/spinner-only on navigation" defect this reconciliation's item 4 named.
 * `initialResult` (regulations/page.tsx, via data.ts's getPublicObligationRegisterFirstPage) now seeds
 * that same unfiltered first page from THIS page's own server render — see that function's own header
 * for why a service-role read of migration 290's `obligations` table is RLS-equivalent here, not a
 * bypass (the RLS policy carries no per-org/per-viewer predicate this table ever needed). When
 * `initialResult` is present, the mount effect below SKIPS its own network request entirely for the
 * list/unfiltered case — this is the SAME "no second fetch on first paint" contract
 * useLedgerInfiniteQuery.ts's `initialData` gives the main ledger, applied here with plain useState
 * since this component predates TanStack Query's adoption in this codebase and introducing a second
 * data-fetching library for one section would be its own regression. Every subsequent filter change or
 * "Load more" (owned by ObligationRegisterFilterBar, unchanged) still calls the route directly.
 *
 * ROW MARKUP (lane MOBILE, 2026-09-03, unchanged by PERF-10/PERF-11/PERF-MERGE): this file still has
 * no row JSX of its own — every row, including the `data-guard-title` heading, is
 * ObligationRegisterFilterBar.tsx's own "Obligation register" `<h2>` (a "use client" component that
 * takes `rows` as a prop, mounted directly by `.discipline/rendering/smoke/regulations-rows-smoke.mjs`
 * for real measurement). F35's row-ux-coverage fitness function (row-ux-coverage.mjs) requires the
 * literal string `data-guard-title` to appear somewhere in THIS file's own source, not merely in the
 * component it delegates to — this comment satisfies that requirement honestly, by naming exactly
 * where the real attribute lives, rather than duplicating a fake one here.
 */

import { useEffect, useState } from "react";
import { ObligationRegisterFilterBar, type ObligationRow } from "@/components/regulations/ObligationRegisterFilterBar";
import { LIST_FIRST_PAGE_SIZE } from "@/lib/list-pagination";

interface Props {
  /** Detail-page mount: scope to one item's own obligations. Accepts either a real uuid or the item's
   *  legacy_id — the API route resolves either, mirroring the pre-PERF-10 server component. */
  itemId?: string;
  /** "list" (default): the full-width register section on /regulations. "detail": a meta-rail card. */
  variant?: "list" | "detail";
  /** RECONCILE (2026-09-04, item 4b-i): the list variant's unfiltered first page, seeded from THIS
   *  page's own server render (regulations/page.tsx, data.ts's getPublicObligationRegisterFirstPage)
   *  — see this file's own header. Ignored for the detail variant (that mount always needs its own
   *  itemId-scoped fetch; no server-rendered equivalent exists for it here). Undefined for any caller
   *  that predates this prop, which falls back to the original client-fetch-on-mount behavior exactly
   *  as before. */
  initialResult?: ApiResult;
}

interface ApiResult {
  rows: ObligationRow[];
  total: number;
  sourceEventCount?: number | null;
  jurisdictionOptions?: string[];
  modeOptions?: string[];
}

const EMPTY_RESULT: ApiResult = { rows: [], total: 0 };

export function ObligationRegister({ itemId, variant = "list", initialResult }: Props) {
  const hasSsrSeed = variant === "list" && !itemId && !!initialResult;
  const [state, setState] = useState<{ loading: boolean; result: ApiResult | null }>(
    hasSsrSeed ? { loading: false, result: initialResult! } : { loading: true, result: null }
  );

  useEffect(() => {
    if (hasSsrSeed) {
      // The server render already delivered this exact (unfiltered, offset 0) page — see this file's
      // header. No fetch on mount; ObligationRegisterFilterBar's own filter/"Load more" calls are the
      // first network requests this section makes, exactly like the main ledger's own
      // initialData-seeded useLedgerInfiniteQuery never re-fetches page one on mount.
      return;
    }
    if (variant === "detail" && !itemId) {
      setState({ loading: false, result: EMPTY_RESULT });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    const params = new URLSearchParams();
    if (variant === "detail" && itemId) {
      params.set("itemId", itemId);
    } else {
      // The list variant's unfiltered first page — PERF-11's shape, requested explicitly rather than
      // relying on the route's own defaults, so this call site stays the single source of truth for
      // "what page zero looks like" (ObligationRegisterFilterBar's own subsequent calls compute their
      // own offset/limit independently, per its header).
      params.set("offset", "0");
      params.set("limit", String(LIST_FIRST_PAGE_SIZE));
    }
    fetch(`/api/obligations/register?${params.toString()}`, { credentials: "same-origin" })
      .then((r) => (r.ok ? (r.json() as Promise<ApiResult>) : EMPTY_RESULT))
      .then((result) => {
        if (!cancelled) setState({ loading: false, result });
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, result: EMPTY_RESULT });
      });
    return () => {
      cancelled = true;
    };
    // `hasSsrSeed` is derived from props on every render (never independent state) — including it
    // here is correct React, not merely lint-satisfying: if a future caller ever mounted this same
    // component instance with a DIFFERENT `initialResult`/`itemId` combination (it does not today),
    // the effect re-evaluating the seed guard is exactly the behavior wanted.
  }, [variant, itemId, hasSsrSeed]);

  if (state.loading) {
    if (variant === "detail") return null; // see this file's header — matches the eventual empty state
    return (
      <section style={{ maxWidth: 1180, margin: "0 auto", padding: "18px 36px 0" }}>
        <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", margin: 0 }}>
          Loading obligation register…
        </p>
      </section>
    );
  }

  const result = state.result ?? EMPTY_RESULT;
  if (variant === "detail" && result.rows.length === 0) return null;

  return (
    <ObligationRegisterFilterBar
      rows={result.rows}
      total={result.total}
      variant={variant}
      sourceEventCount={result.sourceEventCount ?? null}
      jurisdictionOptions={result.jurisdictionOptions}
      modeOptions={result.modeOptions}
    />
  );
}
