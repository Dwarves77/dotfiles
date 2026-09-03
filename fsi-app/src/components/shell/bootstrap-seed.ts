// Pure composition + once-only-apply logic behind BootstrapBoundary.tsx / AuthProvider.tsx
// (PERF-4, 2026-09-03, docs/audits/perf-load-times-2026-09-03.md dispatch item (1): "DOCUMENT loads
// still block first paint on `await resolveServerBootstrap()`"). Kept import-free — no react, no
// next/*, no @supabase/* — so it is plain `node --test`-able, the same "pure core, real wiring in the
// .tsx/.ts sibling" split this repo already uses for load-detail-core.ts and
// regulation-obligations-core.ts (see each module's own header for the rationale: `node --test` cannot
// resolve a bare `next/*` value import outside Next's bundler).
//
// WHY THIS EXISTS: src/app/layout.tsx used to `await resolveServerBootstrap()` (a real Supabase round
// trip: auth.getUser + org_memberships + profiles + workspace_settings) BEFORE returning any JSX — a
// plain synchronous block on RootLayout's own render that blocked the RSC stream and every route's own
// `loading.tsx` on every DOCUMENT (cold/hard-reload/first-visit) load. PERF-3 (2026-09-03) already
// stopped AWAITING it on client-side (RSC) navigations; this lane stops awaiting it on document loads
// too: the layout now creates the promise and returns the shell immediately, and BootstrapBoundary.tsx
// (a small client component sitting OUTSIDE the shell's own render path — see its own header) is the
// only thing that actually blocks on it, via React's `use()`, inside its own `<Suspense fallback={null}>`.
// Once the promise resolves, BootstrapBoundary calls AuthProvider's seed callback exactly once — this
// module is that "exactly once, compose the right shape" logic, extracted so it's provable without a
// browser.

/** Structural echo of ServerBootstrap (src/lib/api/server-bootstrap.ts) — restated here, not imported,
 *  so this file has zero runtime dependency on that module (which itself value-imports
 *  supabase-server-client.ts → @supabase/ssr → eventually next/headers). Only the fields this module's
 *  logic actually touches. */
export interface BootstrapLike {
  user: { id: string } | null;
  orgId: string | null;
  orgName: string;
  role: "owner" | "admin" | "member" | "viewer" | null;
  sectors: string[];
  workspaceSectors: string[];
}

/** What AuthProvider's seed() applies to its context + the workspace store. */
export interface AuthSeed {
  user: BootstrapLike["user"];
  orgId: string | null;
  orgName: string;
  role: BootstrapLike["role"];
  sectors: string[];
}

const EMPTY_SEED: AuthSeed = { user: null, orgId: null, orgName: "", role: null, sectors: [] };

/**
 * Composes a resolved bootstrap (or `null` — the anonymous/signed-out case, and the same value the
 * RSC-navigation skip already passes per PERF-3's `isRscNavigation` mechanism) into the shape
 * AuthProvider's context needs.
 *
 * Sector composition rule UNCHANGED from the pre-PERF-4 layout.tsx (Section 6.8, lane HYG-2 fix,
 * 2026-09-02): a per-user override (`bootstrap.sectors`, from `profiles.sector_overrides`) wins when
 * non-empty; otherwise the workspace default (`bootstrap.workspaceSectors`, from
 * `workspace_settings.sector_profile`). Moving where this composition runs (from layout.tsx's JSX
 * expression into this pure function) must not change its result — see this module's test file for the
 * HYG-2 regression case this guards.
 */
export function resolveAuthSeed(bootstrap: BootstrapLike | null): AuthSeed {
  if (!bootstrap) return EMPTY_SEED;
  return {
    user: bootstrap.user,
    orgId: bootstrap.orgId,
    orgName: bootstrap.orgName,
    role: bootstrap.role,
    sectors: bootstrap.sectors.length > 0 ? bootstrap.sectors : bootstrap.workspaceSectors,
  };
}

/**
 * Seed-once guard. BootstrapBoundary may be handed a resolved bootstrap more than once over the
 * component's lifetime (it never unmounts across a client-side navigation, same as AuthProvider before
 * it — see rsc-navigation.ts's header) — a real one on the first document load, then an
 * already-resolved `null` on every RSC navigation after it (PERF-3's skip). Only the FIRST delivery may
 * be applied; every later one — real or the RSC-nav `null` placeholder — must be silently discarded, or
 * a background navigation would overwrite an already-seeded signed-in user's state with an anonymous
 * one. This is the same "AuthProvider ignores updates past first mount" contract PERF-3 documented for
 * `useState(initialUser)`'s own once-only initializer; it has to be re-stated explicitly here because
 * the seed now arrives via an effect (an event), not a render-time initial value, so there is no
 * initializer to rely on implicitly.
 */
export function shouldApplySeed(alreadySeeded: boolean): boolean {
  return !alreadySeeded;
}
