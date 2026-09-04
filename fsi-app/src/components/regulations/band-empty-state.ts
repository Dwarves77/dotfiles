/**
 * Empty-band copy for the four-band regulations ledger (FIRSTPAGE lane, 2026-09-04,
 * docs/audits/perf-load-times-2026-09-03.md §14). Split into its own plain-.ts module (rather than
 * living inline in RegulationsLedger.tsx) specifically so it is unit-testable with `node --test` +
 * jiti without mounting JSX — this repo's established constraint for testing logic that lives inside
 * a React component (see src/components/ui/WatchButton.npmtest.mjs's own header: "this repo has no
 * JSX test infrastructure... to mount the component").
 *
 * THE DEFECT THIS REPLACES: RegulationsLedger.tsx's band body used to render the literal string "No
 * matching regulations in this band." any time `rows.length === 0`, with no regard for WHY the band
 * had no rows yet. [CONFIRMED, live production, 2026-09-04 ~08:15 UTC] the customer surface showed
 * exactly that text under the "Immediate" (13 total) and "Action" (12 total) band headers while the
 * page's own masthead still read "Loading the full ledger…" — nothing had been filtered out; the SSR
 * first page simply had not carried any of those rows yet (see buildWorkspaceItemsQuery's header in
 * supabase-server.ts for that half of the fix), and the client backfill (`restStatus`) had not
 * finished. "No matching" asserts a filter ran and excluded every row; during an in-progress load
 * that assertion is false.
 *
 * THE FIX: only claim "no match" once there is a real basis for the claim — the load is done
 * (`restStatus !== "loading"`), a filter is active (a filter narrowing an otherwise-nonempty band to
 * zero rows IS a true "no match"), or the band is genuinely empty corpus-wide (`total === 0`, where
 * there was never anything to load). In the one remaining case — the authoritative band total
 * (`total`, from the counts RPC, independent of how many rows have streamed in) is positive, nothing
 * is filtering, and the backfill is still in flight — say so honestly instead.
 */
export function bandEmptyStateText(params: {
  /** Authoritative band total from the counts RPC (bandCount(b.key)), NOT rows.length. */
  total: number;
  restStatus: "loading" | "done" | "error";
  anyFilterActive: boolean;
}): string {
  const { total, restStatus, anyFilterActive } = params;
  if (total > 0 && restStatus === "loading" && !anyFilterActive) {
    return `Loading ${total} regulation${total === 1 ? "" : "s"}…`;
  }
  return "No matching regulations in this band.";
}
