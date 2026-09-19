// RD-16-transport-hold-all-four: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.
//
  // RD-15 (no-unreachability-hold-without-exhaustion-record) — NAMED RESIDUAL, NOT YET AN ENTRY (comment only,  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
  // intentionally not in the INVARIANTS array so it is not build-failing yet). The anti-parking invariant: an
  // item MUST NOT reach a hold-or-delete call on UNREACHABILITY grounds without a stored EXHAUSTION RECORD (proof
  // of what was tried per candidate × transport). As of the seek-more unit (2026-07-06, feat/seek-more) the
  // RECORD SHAPE + its interim durable home now EXIST: src/lib/sources/seek-more.mjs (generateCandidates →
  // the escalation ladder returns the per-attempt exhaustion record; exhaustionFlagRow /
  // persistExhaustionRecord persist it via the INTERIM FLAG PATTERN — integrity_flags, created_by=  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
  // 'exhaustion_record', category='source_issue', subject_ref=itemId, attempts in recommended_actions jsonb —  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
  // superseded by migration 147 sources.fetch_status). RD-15 is SEQUENCED LAST: it is wired build-FAILING only
  // AFTER (a) migration 147 lands the durable fetch_status column and (b) Jason's batch-1 go-line, so the gate
  // is not turned on before the persistence path it polices is live end-to-end. Until then this comment is the
  // registered residual (same pattern as a deferred-for-cost named residual), and the seek-more selftest
  // (src/lib/sources/seek-more.test.mjs) proves the record shape + interim persistence red-then-green.

  

export const invariant = {
    id: 'RD-16-transport-hold-all-four',
    skill: 'remediation-discipline',
    section: 'Section 4 — category 10: The transport hold gate (all four transports)',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    text: 'The scrape hold MUST gate ALL FOUR transports — direct-HTTP, API, RSS, Browserless — at their canonical entry points, not only the Browserless primitive: assertFetchAllowed(url) throws FetchHoldError while SCRAPE_HOLD is engaged, so "hold LIVE, zero fetches" is airtight across every transport (CODE-1 F-02). A transport module that makes a network fetch without the hold check FAILS the discipline gate (widened fitness F16 over TRANSPORT_MODULES). Paired with the hold: the url-canon-keyed, per-source-TTL fetch cache is INJECTED into buildLiveTransports (the cacheGet seam escalateFetch checks first) so a re-ground / retry / refresh of the same url does not re-fetch (CODE-1 F-03).',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    anchor: 'The transport hold gate (fetch-primitive scrape-hold gate)',
    enforcedBy: ['fitness:F16', 'selftest:fsi-app/src/lib/sources/fetch-hold.test.mjs'],
    residual: 'F16 widened (C5, 2026-07-11): beyond the primitive-carries-the-gate + no-raw-Browserless checks, F16 now enumerates TRANSPORT_MODULES (api-fetch.ts, canonical-pipeline.ts — the direct-HTTP + API-ladder home) and REDs any that lack assertFetchAllowed. Gated inline: directFetchClean (direct-HTTP), apiFetchForHost (API-ladder), apiFetch (api-fetch.ts); browserlessFetch was already gated (RD-11). (The RSS transport rss-fetch.ts was purged 2026-07-18 (dormant-systems P-5, dead code — only a test called rssFetch, buildLiveTransports never wired it) and removed from TRANSPORT_MODULES.) The fetch cache (fetch-hold.mjs cacheGet/cachePut) is now injected into buildLiveTransports keyed on the canonical URL with the per-host TTL table, so escalateFetch reads a fresh hit before any transport fires. fetch-hold.test.mjs proves the pure core (engaged→throws / lifted→passes / cache HIT on url-canon-equivalent URLs / TTL freshness) red-then-green; F16-transport-hold-gate.test.mjs proves the widened gate REDs a transport module missing the call. NAMED RESIDUAL: the cache store is PROCESS-scoped in-memory (correct for the batch runners, a cold no-op per serverless invocation); a durable/DB-backed cache stays a future extension. The hold still DEFAULTS to LIFTED (prod-preserving); engaging it is the operator cadence control.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
  };
