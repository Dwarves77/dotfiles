// Surface-health evaluation logic for /api/health/surfaces (Wave-β R0.2).
//
// PURE module (repo pattern) so the must-have / zero-legal semantics are
// unit-testable with node --test. The route (src/app/api/health/surfaces/
// route.ts) gathers the counts; THIS module decides ok/not-ok.
//
// Semantics (per the R0.2 dispatch brief):
//   - MUST-HAVE surfaces (dashboard, regulations, market, research,
//     operations) are unhealthy when the backing fetch errored OR when the
//     backing row count is zero — a populated platform whose regulations
//     surface renders from zero rows is a silent outage, not an empty state.
//   - ZERO-LEGAL surfaces (community, map, assistant-config,
//     onboarding-config) are unhealthy only when the fetch errored; zero rows
//     is an honest empty state (e.g. no community posts yet).

export const MUST_HAVE_SURFACES = [
  "dashboard",
  "regulations",
  "market",
  "research",
  "operations",
];

export const ZERO_LEGAL_SURFACES = [
  "community",
  "map",
  "assistant-config",
  "onboarding-config",
];

export const ALL_SURFACES = [...MUST_HAVE_SURFACES, ...ZERO_LEGAL_SURFACES];

/**
 * Evaluate one surface probe.
 * @param {string} name        surface name (must be in ALL_SURFACES)
 * @param {number|null} rows   backing row count (null when the fetch errored)
 * @param {string|null} error  fetch error message, if any
 * @returns {{ ok: boolean, backing_rows: number|null, error: string|null }}
 */
export function evaluateSurface(name, rows, error) {
  if (!ALL_SURFACES.includes(name)) {
    // Unknown surface names fail loudly — a typo in the route's probe table
    // must not read as green.
    return { ok: false, backing_rows: rows ?? null, error: `unknown surface: ${name}` };
  }
  if (error) {
    return { ok: false, backing_rows: rows ?? null, error };
  }
  const count = typeof rows === "number" && Number.isFinite(rows) ? rows : null;
  if (count === null) {
    return { ok: false, backing_rows: null, error: "no count returned" };
  }
  if (MUST_HAVE_SURFACES.includes(name) && count === 0) {
    return { ok: false, backing_rows: 0, error: "must-have surface has zero backing rows" };
  }
  return { ok: true, backing_rows: count, error: null };
}

/**
 * Overall health: every surface result ok AND every RPC probe ok.
 * @param {Record<string, {ok: boolean}>} surfaces
 * @param {Record<string, {ok: boolean}>} rpcs
 */
export function overallOk(surfaces, rpcs) {
  const surfaceValues = Object.values(surfaces ?? {});
  if (surfaceValues.length === 0) return false;
  const surfacesOk = surfaceValues.every((s) => s && s.ok === true);
  const rpcsOk = Object.values(rpcs ?? {}).every((r) => r && r.ok === true);
  return surfacesOk && rpcsOk;
}

/**
 * seed_leak signal: post Wave-α A1 the dashboard seed fallback is DELETED, so
 * the dashboard can no longer render seed data — but a zero-row dashboard is
 * the same customer-visible symptom the seed fallback used to mask. We assert
 * backing_rows > 0: seed_leak=false iff the dashboard provably renders from
 * real rows.
 * @param {number|null} dashboardRows
 */
export function seedLeak(dashboardRows) {
  return !(typeof dashboardRows === "number" && dashboardRows > 0);
}
