// The perf-budget REGISTRY (lane PERF-ARCH, 2026-09-04) — the same registry-of-classified-
// constants shape F17's CAP_REGISTRY already established (fsi-app/.discipline/fitness/functions/
// F17-size-cap-doctrine.mjs), applied to the CI perf budget the dispatch asked for: "document
// decoded size per listing route, self.__next_f bytes, sequential DB hops per request... with the
// numbers from the waterfall as the initial ratchet and the targets."
//
// Plain .mjs (not .ts): F37 (fsi-app/.discipline/fitness/functions/F37-perf-budget.mjs) imports
// this directly under the fitness runner's plain `node` process — no tsc/bundler step, matching
// F17/every other fitness-function registry's own file type.
//
// TWO NUMBERS PER METRIC, NOT ONE — stated honestly, not asserted as already met:
//   - `ratchet`: the CURRENT measured ceiling. A future re-measurement may LOWER it (real
//     improvement) but F37 fails if a re-measurement RAISES it without also raising `evidence`'s
//     date and citation — i.e. a regression must be seen and cited, never silently absorbed by
//     bumping the number up to match. F37 cannot itself diff against git history (a fitness
//     function only sees the current file's content, per F17's own established design) — the
//     enforced invariant is honesty of the CURRENT snapshot (present, dated, evidence-labeled,
//     internally consistent), not an automatic historical ratchet. A real regression still shows
//     up: the very next re-measurement either matches this file (nothing to do) or the lane that
//     ran it must edit `ratchet` here WITH a new dated citation — silently letting the number drift
//     with no citation update is what F37 actually catches (see F37's own check()).
//   - `target`: the operator's stated goal for this metric (docs/decisions/ADR-027-*.md §"CI
//     budget"), enforced to be <= ratchet (a target can only ask for equal-or-better than today,
//     never encode giving up ground) but NOT itself gated on being met yet — the whole point of a
//     ratchet is that `ratchet` starts above `target` and closes over time, one lane at a time.
//
// UNITS: documentBytes / nextFBytes in bytes (UTF-8 decoded document size / the `self.__next_f`
// RSC payload embed, per the dispatch's own phase list); sequentialDbHops as an integer count;
// warmRscMs / coldRscMs / dclMs in milliseconds.
//
// SOURCE OF THE INITIAL NUMBERS: docs/audits/perf-waterfall-2026-09-04.md (this lane's own
// measurement pass) and, where this lane's own container could not re-run a live browser
// measurement, docs/audits/perf-load-times-2026-09-03.md's own [CONFIRMED] figures, carried
// forward with their original citation and NOT re-labeled [CONFIRMED] by this file — see each
// entry's own `evidence` string for its real status.
//
// PERF-13 (2026-09-04, item 6): added clickToFirstPaintMs/clickToContentMs to "regulations-detail"
// and tightened "regulations-list".documentBytes, both sourced from
// docs/audits/perf-clickthrough-2026-09-04.md — the coordinator's own live Chrome capture against
// carosledge.com (2026-09-04 23:10-23:20 UTC), relayed to this lane as its dispatch and written up
// in that file specifically so these citations point at a real document (this lane's sandbox has no
// route to carosledge.com to re-run the capture itself — see that file's own header for the exact
// evidence-status caveat, and this lane's REPORT for the sandbox limitation in full).

export const REQUIRED_ROUTES = Object.freeze([
  "regulations-list",
  "regulations-detail",
  "workspace-bootstrap",
]);

export const PERF_BUDGET_REGISTRY = Object.freeze({
  "regulations-list": {
    documentBytes: {
      // PERF-13 (2026-09-04, item 6): TIGHTENED from 886_000 (2026-09-03 pre-lane figure, kept in
      // this evidence string's history rather than silently dropped — CLAUDE.md rule 14). The
      // coordinator's later live capture (docs/audits/perf-clickthrough-2026-09-04.md, 2026-09-04
      // 23:10-23:20 UTC) measured /regulations at 277 KB decoded — the intervening drop is PERF-11's
      // own windowing/payload-trim work (this file's F37 registry does not itself attribute WHICH
      // lane closed the gap; see PERF-11's own commits for that) landing between the two capture
      // dates. ratchet moves to the newer, lower, more-recently-observed number per this registry's
      // own rule: a re-measurement may LOWER the ratchet freely.
      ratchet: 277_000,
      target: 200_000,
      measuredAt: "2026-09-04",
      evidence:
        '[CONFIRMED, coordinator live Chrome measurement against carosledge.com, 2026-09-04 ' +
        '23:10-23:20 UTC, docs/audits/perf-clickthrough-2026-09-04.md] "/regulations 277 KB ' +
        "decoded\" — this lane's own sandbox has no route to carosledge.com to independently " +
        "re-run the capture (see this lane's REPORT for the exact limitation); relayed as this " +
        "lane's dispatch and recorded there so this citation points at a real, findable document.",
    },
    nextFBytes: {
      ratchet: 401_000,
      target: 100_000,
      measuredAt: "2026-09-03",
      evidence:
        '[CONFIRMED] operator-supplied pre-lane figure: "401 KB of self.__next_f" for the same ' +
        '/regulations decoded-document measurement above — the RSC payload embed specifically, ' +
        'not the whole document. Same re-measurement caveat as documentBytes.',
    },
    sequentialDbHops: {
      ratchet: 1,
      target: 1,
      measuredAt: "2026-09-04",
      evidence:
        "[CONFIRMED, by reading, RECONCILE item 1] /regulations (src/app/regulations/page.tsx) and " +
        "its scroll-pagination route (src/app/api/listings/cursor/route.ts) both now call " +
        "getPublicListingsOnly (src/lib/data.ts:408) -> cachedPublicListingsOnly -> " +
        "fetchPublicListingsOnly (src/lib/supabase-server.ts:2595) -> fetchPublicWorkspaceResources " +
        "(src/lib/supabase-server.ts:720) -> ONE serviceClient RPC call (rpcName, rpcArgs) " +
        "(get_workspace_intelligence_listings_public, migration 306) with NO org_id argument and NO " +
        "resolveOrgIdFromCookies()/cookies() read anywhere in the path — the org-scoped two-hop " +
        "shape this ratchet previously measured (resolveOrgIdFromCookies() THEN a call needing that " +
        "orgId) no longer exists on this route at all; both the SSR first page and every subsequent " +
        "scroll page pay exactly ONE DB hop, and the response is genuinely cacheable " +
        "(Cache-Control: public, s-maxage=60, stale-while-revalidate=300, route.ts's own success " +
        "path) because it carries no per-viewer input. target === ratchet: this metric is now at " +
        "goal for the hop-count axis on this route.",
    },
    domRowsOnFirstPaint: {
      ratchet: 40,
      target: 30,
      measuredAt: "2026-09-04",
      evidence:
        "[CONFIRMED, real Playwright chromium via this lane's own rendering-smoke harness — " +
        ".discipline/rendering/smoke/regulations-rows-smoke.mjs's own bundling/mount mechanism, " +
        "not a live production page (no live browser against a live Supabase-backed deploy is " +
        "available to this lane's container)] a 713-row fixture (docs/audits/perf-waterfall-2026-" +
        "09-04.md §1's own worst-observed band size) with the band OPENED (defeating " +
        "ROWS_COLLAPSED) rendered 12 actual `[data-guard-container=\"regulation-row\"]` DOM nodes " +
        "at 1440x840 and 17 at 1920x1200 — VirtualizedRowList.tsx's windowing, versus all 713 " +
        "before this lane (audit's own finding). ratchet=40 is a rounded safety margin above both " +
        "measured points (viewport-dependent: taller viewports render more rows + overscan), not " +
        "the raw 12/17 — a future re-measurement at a still-larger viewport is expected to land " +
        "under 40, not to require raising it.",
    },
    bytesPerScrollPage: {
      ratchet: 20_000,
      target: 20_000,
      measuredAt: "2026-09-04",
      evidence:
        "[CONFIRMED, by measurement — Buffer.byteLength of JSON.stringify against " +
        "toLedgerRowPayload-trimmed representative fixture rows, list-pagination.ts's real exported " +
        "function, not a reimplementation] a LIST_PAGE_SIZE=30-row /api/listings/cursor response " +
        "(30 resources with realistic title/note/tag lengths, plus nextCursor/hasMore) serializes " +
        "to 16,289 bytes (543 bytes/row average) — the per-request cost of each `fetchNextPage()` " +
        "call this lane's IntersectionObserver sentinel triggers. Real production row content " +
        "(titles/notes vary) was not measured (no live DB access from this container) — this is a " +
        "fixture-based measurement, honestly labeled, not a live-traffic sample. target === ratchet " +
        "at a round 20 KB: this metric starts already comfortably under a natural per-request " +
        "budget; the more consequential ADR-027 win this lane makes is that this number is now PAID " +
        "PER SCROLL, on demand, rather than once, unconditionally, on mount, for the entire " +
        "remainder of the corpus (the old LIST_REMAINDER_LIMIT=5000-row one-shot fetch this lane " +
        "deleted — see list-pagination.ts's own header).",
    },
    // REG-GRAIN (2026-09-05): docs/specs/01-regulations.md's own defect — the obligation register
    // rendered one row per (item, event_kind, due_date) with no obligation text at all, so genuinely
    // distinct obligations sharing those three fields (Euro 7's phase-out schedule, NZIA's several
    // 2030-01-01 targets) were indistinguishable. Measured (Supabase MCP, 2026-09-05): of 1,141 live
    // `obligations` rows, 927 survive FE-DEDUP's exact-text-twin removal, and 583 of those 927 (63%)
    // still share (item, kind, due_date) with a sibling whose text differs. The fix
    // (read-register.mjs) embeds item_forward_events.obligation_text via the existing forward_event_id
    // FK — one query, no added round trip — and trims it to OBLIGATION_TEXT_TRIM_LENGTH (160 chars).
    obligationRegisterBytesPerPage: {
      // ratchet: the WORST-CASE per-page byte cost this trim can ever produce (every one of
      // LIST_FIRST_PAGE_SIZE=60 rows carrying an obligation_text at the full 160-char trim ceiling) —
      // stated as the ceiling itself, not today's average, since a future extraction run can only
      // ever raise average text length up to that ceiling, never past it (the trim is unconditional).
      ratchet: 42_673,
      // target: today's MEASURED average-case cost (60 rows at the live corpus's actual average
      // obligation_text length, 74.8 chars) — the ratchet only reaches its worst case if every row's
      // source text happens to be long; the common case is already close to this number.
      target: 37_573,
      measuredAt: "2026-09-05",
      evidence:
        "[CONFIRMED, by measurement — Buffer.byteLength of JSON.stringify against fixture rows built " +
        "in the exact ObligationRow shape (60 rows, LIST_FIRST_PAGE_SIZE), text lengths driven by a " +
        "real Supabase MCP query against the live corpus (project kwrsbpiseruzbfwjpvsp): the 60 " +
        "soonest-due obligations' item_forward_events.obligation_text averages 74.8 chars (max 222, " +
        "well over the 160-char trim ceiling this lane adds)] before this lane's field addition, the " +
        "same 60-row page (no obligation_text) serialized to 31,813 bytes; adding obligation_text at " +
        "the live average (no row needed the 160-char cap) raised it to 37,573 bytes (+5,760 total, " +
        "+96 bytes/row average); every row forced to the full 160-char trim ceiling (the worst case " +
        "the read-time trim permits) raises it to 42,673 bytes (+10,860 total, +181 bytes/row worst " +
        "case). This is a NEW metric (the register's own per-page payload had no prior budget entry — " +
        "documentBytes above tracks the WHOLE /regulations SSR document, of which this endpoint's " +
        "first-page response is one contributor); this lane's sandbox has no route to carosledge.com " +
        "to fold this delta into a fresh live documentBytes capture, so documentBytes' own ratchet is " +
        "left untouched here rather than guessed at — see this lane's REPORT.",
    },
  },
  "regulations-detail": {
    // PERF-13 (2026-09-04, item 6): click-to-content is the metric the operator's own bar ("every
    // click should show items on a page instantly") actually names — coldRscMs/warmRscMs below
    // measure SERVER render time, not what the user's screen does. These two are new.
    clickToFirstPaintMs: {
      ratchet: 950,
      target: 165,
      measuredAt: "2026-09-04",
      evidence:
        "[CONFIRMED, coordinator live Chrome measurement against carosledge.com, 2026-09-04 " +
        "23:10-23:20 UTC, docs/audits/perf-clickthrough-2026-09-04.md §(a)/§(b)/§(c)] an " +
        "already-rendered (statically built) slug painted in 150-165ms; a never-rendered slug " +
        "(on-demand static generation, the whole corpus's steady state before this lane's item 1 " +
        "fix) cost 760-950ms with a MutationObserver on document.body recording ZERO mutations " +
        "for ~900ms of it — no first paint at all until the complete page arrived. ratchet=950 is " +
        "the worst observed point (honest starting ceiling, this registry's own rule); target=165 " +
        "is the ALREADY-ACHIEVED already-built-slug figure — item 1 (generateStaticParams " +
        "enumerating every verified slug) makes 165ms the outcome for the entire corpus that " +
        "exists at build time, closing most of the 950ms tail structurally rather than by tuning " +
        "this one route's own render path further. The residual (items minted after the last " +
        "deploy) is addressed by docs/runbooks/warm-static-detail-routes.md, not by this budget.",
    },
    clickToContentMs: {
      ratchet: 950,
      target: 165,
      measuredAt: "2026-09-04",
      evidence:
        "[CONFIRMED, coordinator live Chrome measurement, same capture as clickToFirstPaintMs " +
        "above, docs/audits/perf-clickthrough-2026-09-04.md §(a)/§(b)/§(c)] this route currently " +
        "has no INTERNAL Suspense boundary splitting 'shell painted' from 'content painted' — " +
        "page.tsx (src/app/regulations/[slug]/page.tsx) is one monolithic async Server Component " +
        "that awaits loadDetail(...) before returning any JSX at all, so first-paint and " +
        "content-paint are the SAME event on this route today (confirmed by reading, not a second " +
        "live measurement) — hence the identical ratchet/target to clickToFirstPaintMs. A nested " +
        "Suspense around the data-dependent body would only decouple these two numbers under " +
        "Next 16's cacheComponents flag (PPR's replacement); PERF-9 already scoped enabling that " +
        "flag OUT of a single lane's work (fsi-app/next.config.ts, PERF-9 comment, citing ADR-026 " +
        "§2) — a binding prior decision this lane did not reopen. Two separate entries are kept " +
        "(rather than one) so a future lane that DOES split shell-from-content under " +
        "cacheComponents has somewhere to record the resulting divergence without inventing a new " +
        "metric name.",
    },
    coldRscMs: {
      ratchet: 1_257,
      target: 300,
      measuredAt: "2026-09-03",
      evidence:
        '[CONFIRMED] docs/audits/perf-load-times-2026-09-03.md §7.2/§9.1: worst pre-PERF-2 cold ' +
        "server [perf] figure for a regulations detail click (g14 Mexico SEMARNAT) was 1257ms; " +
        "post-PERF-2 it measured 609-679ms (§9.1). This ratchet is deliberately the WORSE " +
        "(pre-fix) figure, not the best post-fix sample, because this lane's container could not " +
        "re-run a live click-through to confirm the improved figure holds under today's build — " +
        "see docs/audits/perf-waterfall-2026-09-04.md Part 1 for why re-measurement was not " +
        "possible from this container, and the honesty rule this registry's own header states.",
    },
    warmRscMs: {
      ratchet: 1_257,
      target: 300,
      measuredAt: "2026-09-03",
      evidence:
        "[CONFIRMED] docs/audits/perf-load-times-2026-09-03.md §9.5: \"Warm ... server times are " +
        'NOT meaningfully lower than cold on any surface\" — every RSC request, cold or warm, is ' +
        "cache=MISS under Cache-Control: private (ADR-026's own finding, §context point 2: the " +
        "per-viewer override read cannot be made static without a migration). warmRscMs therefore " +
        "carries the SAME ratchet as coldRscMs today, honestly, rather than a lower number this " +
        "lane has no evidence for.",
    },
    sequentialDbHops: {
      ratchet: 1,
      target: 1,
      measuredAt: "2026-09-04",
      evidence:
        "[CONFIRMED, by reading] src/lib/detail/load-detail-core.ts's loadDetailCore (line " +
        "~241-298): fetchItem, then Promise.all([fetchSections, runItemScoped, runViewerScoped]) " +
        "— ONE sequential hop (the admission-guard fetchItem) ahead of one parallel bundle, " +
        "already collapsed by PERF/PERF-2/PERF-6/PERF-7/PERF-9 (see docs/audits/perf-load-times-" +
        "2026-09-03.md §8/§12/§13, ADR-026). target === ratchet: this metric is already at goal " +
        "for the round-trip-count axis specifically — the remaining gap on this route is latency " +
        "per hop (coldRscMs/warmRscMs above), not hop count.",
    },
  },
  "workspace-bootstrap": {
    sequentialDbHops: {
      ratchet: 1,
      target: 1,
      measuredAt: "2026-09-04",
      evidence:
        "[CONFIRMED, by reading] src/app/api/workspace/bootstrap/route.ts (this lane's own wired " +
        "example): requireAuth, then ONE Promise.all([loadPersonalState, loadListOrders, " +
        "loadMembers, loadAdminAttention]) — already the PERF-9/ADR-026 §3 batched shape (\"never " +
        "more than one round trip per screen\" collapsed to auth + one parallel bundle). At goal.",
    },
  },
});

/** Every metric object's shape check, shared by F37 and by this module's own selftest. Pure. */
export function isWellFormedMetric(metric) {
  if (!metric || typeof metric !== "object") return false;
  const { ratchet, target, measuredAt, evidence } = metric;
  if (typeof ratchet !== "number" || !Number.isFinite(ratchet) || ratchet < 0) return false;
  if (typeof target !== "number" || !Number.isFinite(target) || target < 0) return false;
  if (target > ratchet) return false; // a target may only ask for equal-or-better than today
  if (typeof measuredAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(measuredAt)) return false;
  if (typeof evidence !== "string" || evidence.length < 10) return false;
  // CLAUDE.md rule 14: [CONFIRMED]/[HYPOTHESIS], allowing the repo's own established
  // "[CONFIRMED, by reading]" / "[CONFIRMED, node --test]" qualified form (see
  // docs/audits/perf-load-times-2026-09-03.md's own usage throughout), not only the bare token.
  if (!/^\[(CONFIRMED|HYPOTHESIS)[^\]]*\]/.test(evidence)) return false;
  return true;
}
