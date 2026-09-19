// RD-11-transport-hold-gate: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-11-transport-hold-gate',
    skill: 'remediation-discipline',
    section: 'Section 4 — category 10: The transport hold gate (fetch-primitive scrape-hold gate)',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    text: 'The scrape hold MUST be a first-class mechanical gate at the single canonical fetch primitive: assertFetchAllowed(url) throws FetchHoldError while SCRAPE_HOLD is engaged, so "scrape hold LIVE, zero fetches" is enforced in code, not by credential-absence. Because fetch is single-homed, no other file may construct a raw Browserless content fetch that bypasses the gate. The hold defaults to LIFTED (explicit operator control) so wiring it does not break prod; a canonical-URL cache (url-canon single home, per-source TTL) + per-run telemetry accompany it.',
    anchor: 'The transport hold gate (fetch-primitive scrape-hold gate)',
    enforcedBy: ['fitness:F16', 'selftest:fsi-app/src/lib/sources/fetch-hold.test.mjs'],
    residual: 'F16 (grep-class, red-then-green: the primitive missing assertFetchAllowed is RED; a raw Browserless /content fetch in a non-sanctioned file is RED with file:line) gates the STRUCTURAL guarantee — the hold gate is present at the single primitive and un-bypassable. fetch-hold.test.mjs proves the PURE core red-then-green: engaged→throws (fetchImpl never called), lifted→passes, canonical cache HIT on url-canon-equivalent URLs, TTL freshness, hold-blocked/hit/miss telemetry. NAMED RESIDUAL: the hold DEFAULTS to LIFTED (prod-preserving) — the build-time zero-fetch posture is held by the runners deleting BROWSERLESS_API_KEY as belt-and-suspenders + the operator engaging SCRAPE_HOLD; lifting the hold (SCRAPE_HOLD=off) is the operator cadence ruling. The cache store is per-run in-memory (a durable/DB-backed cache is a future extension); TTL table is a small curated host list + a 24h default (REVISIT as sources are added).',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
  };
