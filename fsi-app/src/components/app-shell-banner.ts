/**
 * The AppShell "no workspace yet" banner's predicate, split into its own plain-.ts module (rather
 * than living inline in AppShell.tsx) specifically so it is unit-testable with `node --test` + jiti
 * without mounting JSX — this repo's established constraint for testing logic that lives inside a
 * React component (see src/components/regulations/band-empty-state.ts's own header, and
 * src/components/ui/WatchButton.npmtest.mjs's: "this repo has no JSX test infrastructure... to mount
 * the component").
 *
 * STEP 2(b) FIX (PERF-MERGE, 2026-09-04) [CONFIRMED root cause, this lane]. Live regression, coordinator
 * in Chrome on carosledge.com, 2026-09-04 19:56 UTC: the "No workspace yet. Accept an invitation or
 * create your own to start collaborating." banner rendered for a signed-in operator whose org DOES
 * exist ("workspace verticals: Live events · Fine art" visible in the same masthead).
 *
 * MECHANISM: AuthProvider.tsx's `onAuthStateChange` listener sets `user` independently of, and
 * typically faster than, `seed()` (which resolves `orgId` from a client `fetch("/api/auth/identity")`
 * — see that file's header for why the fetch is now client-side, post-PERF-10). This produces a real,
 * every-load window where `user` is truthy and `orgId` has not resolved yet. The PRE-FIX predicate
 * (`!!user && !orgId`) could not distinguish that window from "resolved: no org", because `!orgId` is
 * true for both `undefined` (unresolved) and `null` (resolved, no org) under the old `orgId: string |
 * null` type. `docs/design/ux-laws.md` forbids a surface showing a false state while data loads.
 *
 * THE FIX: `orgId` is now three-valued (`undefined` = unresolved, `null` = resolved-no-org, `string` =
 * resolved-with-org — see AuthProvider.tsx's AuthContext interface). This predicate renders the banner
 * ONLY for a RESOLVED null; `undefined` renders nothing, same as the rest of the shell's loading chrome.
 */
export function computeShowNoWorkspaceBanner(params: {
  user: unknown;
  /** Three-valued — see this file's header. MUST be `orgId === null`, never a bare falsy check. */
  orgId: string | null | undefined;
  pathname: string;
  /** Route prefixes where the banner is suppressed (already mid-setup-flow, no need to nag). */
  suppressRoutes: readonly string[];
}): boolean {
  const { user, orgId, pathname, suppressRoutes } = params;
  return (
    !!user &&
    orgId === null &&
    !suppressRoutes.some((r) => pathname.startsWith(r))
  );
}
