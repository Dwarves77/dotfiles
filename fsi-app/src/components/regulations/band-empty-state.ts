/**
 * Empty-band state for the four-band regulations ledger (FIRSTPAGE lane, 2026-09-04,
 * docs/audits/perf-load-times-2026-09-03.md §14 — then refined by PERF-13, 2026-09-04,
 * docs/audits/perf-clickthrough-2026-09-04.md §(g)). Split into its own plain-.ts module (rather than
 * living inline in RegulationsLedger.tsx) specifically so it is unit-testable with `node --test` +
 * jiti without mounting JSX — this repo's established constraint for testing logic that lives inside
 * a React component (see src/components/ui/WatchButton.npmtest.mjs's own header: "this repo has no
 * JSX test infrastructure... to mount the component").
 *
 * GENERATION 1 DEFECT (FIRSTPAGE, fixed 2026-09-04 ~09:00 UTC): RegulationsLedger.tsx's band body
 * used to render the literal string "No matching regulations in this band." any time
 * `rows.length === 0`, with no regard for WHY the band had no rows yet — including while the whole
 * ledger's own masthead still read "Loading the full ledger…". FIRSTPAGE's fix introduced a single
 * ledger-wide `restStatus` ("loading" whenever `hasNextPage || isFetchingNextPage || pending") fed to
 * every band alike, and said "Loading N regulations…" whenever a band's authoritative total was
 * positive and that ledger-wide flag was "loading".
 *
 * GENERATION 2 DEFECT (this fix): [CONFIRMED, live production, docs/audits/perf-clickthrough-2026-
 * 09-04.md §(g), coordinator capture 2026-09-04 23:10-23:20 UTC] the "Awareness" band — priority-ordered
 * cursor pages mean it receives no rows until roughly page 37 of the stream — showed "0 shown 169 —
 * Loading 169 regulations…" for the entire session, because `hasNextPage` stays true across the
 * whole multi-minute cursor walk regardless of whether a request is *currently* in flight, or
 * whether that request could possibly be the one that reaches this band. The operator's own words:
 * "a loading state with nothing loading." `restStatus`'s "loading" bucket conflated two different
 * things — "a fetch is happening right now" (`isFetchingNextPage`, momentary) and "the cursor stream
 * isn't exhausted yet" (`hasNextPage`, true for most of a multi-minute session) — and rendered both
 * identically.
 *
 * THE FIX: four honest, mutually-exclusive states instead of a text template keyed off a
 * ledger-wide three-value flag:
 *   - "no-match": total===0 (genuinely empty corpus-wide) OR a filter narrowed a nonempty band to
 *     zero (a true "no match" claim).
 *   - "loading": a fetch is *actually in flight right now* (`isFetchingNextPage`, or the ledger's
 *     very first page is still resolving) — "Loading" appears only while something is loading, per
 *     the operator's own bar.
 *   - "error": the last `fetchNextPage` attempt itself failed, or the stream reports exhausted
 *     (`!hasNextPage`) with a positive total this band never received (a real inconsistency, not a
 *     loading artifact).
 *   - "ready": none of the above — total>0, no filter, nothing in flight right now, but more pages
 *     remain that could eventually reach this band. This is the state the old code had no name for
 *     and rendered as an indefinite "Loading" lie. It carries `total` so the caller can render the
 *     band's TRUE count plus a real, honest control ("Load more (N in this band)", wired to the same
 *     `fetchNextPage` the footer's own "Load more" button already calls — one cursor, one handler, no
 *     new fetch path) instead of a passive claim with nothing behind it.
 */
export type BandEmptyState =
  | { kind: "no-match"; text: string }
  | { kind: "loading"; text: string }
  | { kind: "error"; text: string }
  | { kind: "ready"; text: string; total: number };

export function bandEmptyState(params: {
  /** Authoritative band total from the counts RPC (bandCount(b.key)), NOT rows.length. */
  total: number;
  /** A fetchNextPage call is literally in flight right now. */
  isFetchingNextPage: boolean;
  /** More cursor pages remain beyond what has loaded (the stream is not exhausted). */
  hasNextPage: boolean;
  /** The most recent fetchNextPage attempt itself failed. */
  isFetchNextPageError: boolean;
  /** The ledger's very first page has not resolved yet (rare once SSR initialData seeds it). */
  initialLoadPending: boolean;
  anyFilterActive: boolean;
}): BandEmptyState {
  const {
    total,
    isFetchingNextPage,
    hasNextPage,
    isFetchNextPageError,
    initialLoadPending,
    anyFilterActive,
  } = params;

  if (total === 0 || anyFilterActive) {
    return { kind: "no-match", text: "No matching regulations in this band." };
  }
  if (isFetchingNextPage || initialLoadPending) {
    return { kind: "loading", text: `Loading ${total} regulation${total === 1 ? "" : "s"}…` };
  }
  if (isFetchNextPageError) {
    return {
      kind: "error",
      text: `Couldn't load more just now — ${total} regulation${total === 1 ? "" : "s"} in this band once loading resumes.`,
    };
  }
  if (hasNextPage) {
    return {
      kind: "ready",
      text: `${total} regulation${total === 1 ? "" : "s"} in this band — not loaded yet.`,
      total,
    };
  }
  // hasNextPage is false (the stream is exhausted) yet this band still has zero rows and a
  // positive total with no filter active: the corpus's declared count and what the cursor actually
  // delivered disagree (a genuine data inconsistency, not a loading artifact) — say so plainly
  // rather than claiming "no match" (false: nothing was filtered) or "loading" (false: nothing is,
  // or ever will be again, in flight).
  return {
    kind: "error",
    text: `${total} regulation${total === 1 ? "" : "s"} expected in this band but none loaded — refresh to retry.`,
  };
}
