# Assembly inputs for the clean-room build plan, compiled from the Part 1 registers (2026-10-12)

Lane ASSEMBLE-1. Docs only, mechanical. Compiled from the 25 module registers under docs/plans/rebuild/part1/ (P1-01 to P1-26, excluding P1-11) and docs/plans/complete-build-plan-2026-10-11.md, with docs/specs/00-foundation-the-spine.md read for context. No judgement, no proposals beyond what the registers state; the coordinator makes the cut.

**P1-11 schema register absent: compiled without it.** PR 1161 "P1-11 schema" was open and unmerged when this file was compiled (master polled every 5 minutes for 90 minutes). Section C shows only the data model the 25 module registers state; the raw schema dump docs/plans/rebuild/schema-2026-10-12.sql is on master and was not read for this file.

Method. Sections A and B are parsed by script straight from every register's section 8 "New files" and "Every feature" tables (754 and 1,061 rows). Sections C to J come from an extraction pass that read each register whole and copied, row by row with its register line, the data-model, interface, duplicate, metered-call, ruling, defect, proof and LOC facts; those rows are grouped and counted here by script. 120 randomly sampled extracted rows were checked against their cited register line: 120 matched. Every row cites `<module>.md:L<n>`, a line of docs/plans/rebuild/part1/<module>.md. Status tokens ([CONFIRMED], [HYPOTHESIS], [REFUTED]) are the registers' own, carried through; this file adds none.

Reference counts (not re-read whole): docs/plans/rebuild/data-invariants.md carries 298 invariant lines, INV-001 to INV-298, plus 16 NONE lines (its Count line); INV-153 to INV-298 were appended by the Part 1 lanes. docs/plans/rebuild/protected-properties.md carries 179 property lines, PROP-001 to PROP-179, of which 51 are NOT CARRIED.

Lane ids: P1-01 auth-db, P1-02 workspace, P1-03 intake-a, P1-04 intake-b, P1-05 sources-a, P1-06 sources-b, P1-07 capture, P1-08 harness, P1-09 flywheel-a, P1-10 flywheel-b, P1-11 schema (no register on master), P1-12 runtimes-a, P1-13 runtimes-b, P1-14 mint, P1-15 producers, P1-16 obligations, P1-17 ui-kit, P1-18 shell-list, P1-19 regulations, P1-20 market, P1-21 research-ops, P1-22 community-a, P1-23 community-b, P1-24 dash-search, P1-25 admin-a, P1-26 admin-b.

| section | rows |
|---|---|
| A planned files | 754 rows; 6 new paths claimed by two lanes; 27 old-path tokens claimed by two or more lanes |
| B features | 1,061 rows; 13 lost-feature candidates from 179 cross-lane claims |
| C data model | 204 objects |
| D interfaces | 156 stated gaps; 100 one-sided needs; 22 needs to no lane id; 3 symbols offered twice |
| E cross-module duplicates | 620 duplicate rows; 14 named classes; 215 rows naming another lane or an out-of-scope copy |
| F metered and external | 117 sites |
| G rulings owed | 210 |
| H defects | 818 confirmed or listed; 80 hypothesis; 17 refuted or fixed |
| I proofs | P1 8, P2 2, P3 8, P4 3, P5 8, P6 2 rows; proofs no lane serves: none |
| J counts | current 155,281; clean 86,220; section A sum 94,687 |

## A. PLANNED FILES

Source: every row of every register's section 8 "New files" table, parsed by script (754 rows). LOC is the register's est. LOC cell; a cell that says the lines are counted elsewhere, moved, or counted by another lane is entered as 0 and marked `handoff`; a cell of the form "a + b + c" is summed; a cell with a trailing data note ("160 (+78 data)") counts the code figure only. Rows whose new-path cell carries no `src/` path (owner placeholders, ops CLIs, migrations, the Edge Function) are kept, marked `non-src`, and subtotalled apart.

| new path | lane | from old path(s) (lines) | responsibility | est LOC | flag | cite |
|---|---|---|---|---|---|---|
| src/app/api/revalidate/route.ts | P1-18 | api/revalidate/route.ts 36-65; api/cache/revalidate-item/route.ts 21-50 | one worker flush: `tags` or `itemId` | 30 |  | shell-list.md:L287 |
| src/app/error.tsx | P1-18 | app/error.tsx 1-52 | route-neutral copy, digest reference, retry, report; no raw message, no vendor name | 28 |  | shell-list.md:L264 |
| src/app/layout.tsx | P1-18 | app/layout.tsx 1-76 | fonts, metadata, `viewport` export, AuthProvider, error reporter, AppShell | 28 |  | shell-list.md:L262 |
| src/app/loading.tsx | P1-18 | app/loading.tsx 1-57 | route-neutral skeleton from P1-17's SkeletonPage | 15 |  | shell-list.md:L263 |
| src/app/market/[slug]/page.tsx | P1-20 | app/market/[slug]/page.tsx 100-122, 318-380 | static params, id redirect, loadDetail with loadMarketDetailBundle, notices | 90 |  | market.md:L272 |
| src/app/market/page.tsx | P1-20 | app/market/page.tsx 116-249 | five reads through read.ts, mounts | 80 |  | market.md:L271 |
| src/app/market/series/page.tsx, loading.tsx, [slug]/loading.tsx | P1-20 | the three files whole | route and skeletons | 60 |  | market.md:L273 |
| src/app/not-found.tsx | P1-18 | app/not-found.tsx 11-75 | honest 404 with a 44 px link | 30 |  | shell-list.md:L265 |
| src/app/privacy/page.tsx | P1-18 | app/privacy/page.tsx 1-380 | copy verbatim until counsel rules; tokens; no nested `<main>` | 320 |  | shell-list.md:L266 |
| src/core/applicability/compute.ts | P1-19 | compute-applicability.mjs 1-90 | applicability gate | 65 |  | regulations.md:L341 |
| src/core/auth/claims.ts | P1-01 | api/auth.ts 38-67; api/community-auth.ts 10-41 | one ClaimsVerifier, `userIdFromClaims(client, jwt?)` | 25 |  | auth-db.md:L232 |
| src/core/auth/ensure-profile.ts | P1-01 | auth/provision-personal-workspace.ts 38-94 | `ensureProfile(userId, email, client)` on the shared service client | 45 |  | auth-db.md:L237 |
| src/core/auth/guards.ts | P1-01 | api/community-auth.ts 43-98; api/auth.ts 78-132; api/route-guard.ts 1-101; api/rate-limit.ts 1-104; api/worker-auth.ts 1-57 | `requireUser(request)` cookie-or-bearer returning `{userId, client}`; `requireAdmin(request)` via the own-row rpc, service client handed out separately; `isRefusal`; fixed-window limiter with an honest header; `workerAuthGuard` without allowBearer | 200 |  | auth-db.md:L233 |
| src/core/auth/identity.ts | P1-01 | api/server-bootstrap.ts 48-228; api/org.ts 197-204, 274-281 (cookie wrappers become thin calls) | `resolveIdentity(client)` with IdentityLookupError, `resolveServerBootstrap` cached, viewer identity | 90 |  | auth-db.md:L236 |
| src/core/auth/membership.ts | P1-01 | api/org.ts 21-119; members/route.ts 12-48, 204-227; orgs/ban-check.mjs 8-17 | `resolveMembership` (oldest, with role), `requireOrgWriter`, `requireOwnerOrPlatformAdmin`, `assertNotLastOwner`, `checkOrgBan` | 90 |  | auth-db.md:L235 |
| src/core/auth/platform-admin.ts | P1-01 | auth/platform-admin-gate.ts 1-54; auth/admin.ts 27-82 | strict predicate, own-row rpc read, `isPlatformAdmin(userId, service)`, `requirePlatformAdmin()` page gate | 60 |  | auth-db.md:L234 |
| src/core/auth/return-path.ts | P1-01 | auth/safe-return-path.mjs 6-12; signup/page.tsx 37-41 | `sanitizeReturnPath` rejecting control characters | 10 |  | auth-db.md:L239 |
| src/core/auth/route-policy.ts | P1-01 | auth/route-policy.ts 1-87; proxy.ts 26-105 | decideRoute with exact or prefix-plus-slash matching; proxy wiring that preserves the query string in `redirect` | 90 |  | auth-db.md:L238 |
| src/core/brief/contract.ts | P1-03 | system-prompt.ts 1-593; contract-version.mjs 1-3; parse-output.ts 8-75 (the vocabularies and the severity map), 114-192 (the field list); canonical-pipeline.ts 756-779 | the 26-field table (name, type, required, format gate, vocabulary), the five format section lists' references, the sixteen rules and the integrity rule as the author's instruction, `renderAuthorInstruction(adopted)` in place of buildSystemPrompt, CONTRACT_VERSION | 300 |  | intake-a.md:L318 |
| src/core/brief/regulation-sections.ts | P1-03 | extract-regulation-sections.ts 1-350, 373-446 (table parser); timeline-parse.mjs 1-114; source-entry-filter.mjs 1-29; extract-recommended-actions.mjs 34-148; parse-record-sections.ts 58-189 | the structured parsers the detail surfaces read: action list, prose with source, obligations table, timeline entries, sources table, recommended actions, record-grade claim lines | 450 |  | intake-a.md:L322 |
| src/core/brief/sections.ts | P1-03 | extract-sections.ts 37-222; prose-extractor.ts 6-47; format-spec.ts 1-33; extract-registry.ts 1-23; formats/regulation.ts, technology.ts, operations.ts, market.ts, research.ts; timeline-section.mjs 7-81; brief-section-strip.mjs 4-35; claim-ledger-block.ts 12-27; section-markers.mjs 1-95 | one section walker, the five format specs with `role` tags (do_now, timeline, sources), `extractSections(brief, itemType)`, `findTimelineSection`, `stripSourcesSection`, `stripClaimLedgerBlocks`, `assertNoInternalMarkers` | 350 |  | intake-a.md:L321 |
| src/core/brief/timeline.ts | P1-03 | timeline-harvest.mjs 1-139; timeline-backfill-derive.mjs 17-76, 82-119, 127-145, 151-242, 257-267, 273-314, 330-351, 365-385, 420-494; derived-consistency.mjs 1-47; the shared month table from timeline-parse.mjs 1-2, gate-a-scan.mjs 18 | `toIsoDate`, `buildTimelineRows`, the eight-step derivation with its attempt log, `isDerivedConsistent`, one month table | 250 |  | intake-a.md:L323 |
| src/core/brief/validate.ts | P1-03 | parse-output.ts 380-827 (the field validation, over an object), 837-899 (claim record validation), 969-1003 (crossLinkClaimSources); metadata-vocab.ts 76-107, 151-159 (write-boundary gates) | `validateMetadata(obj, adopted)`, `validateClaimLedger(records)`, `crossLinkClaimSources` with one case rule, candidate banking for compliance objects and themes | 350 |  | intake-a.md:L319 |
| src/core/brief/vocab.ts | P1-03 | metadata-vocab.ts 21-62 | the live DB value sets (severity, priority, urgency, format, signal band, theme) and the display map | 70 |  | intake-a.md:L320 |
| src/core/briefs/frontmatter.mjs | P1-12 | record-briefs/schema 441-547; canonical-pipeline.ts 782-800 | one synthetic frontmatter builder | 60 (counted in the src/core port, shared) | handoff | runtimes-a.md:L271 |
| src/core/briefs/theme-brief-contract.ts | P1-13 | theme-briefs/schema.mjs:1-307 | sections, ceilings, exemptions, uncited figures, validator, renderer (src/lib/research/theme-brief.mjs imports it from core) | 200 |  | runtimes-b.md:L213 |
| src/core/briefs/theme-brief-material.ts | P1-13 | theme-briefs/data.mjs:1-243 | themes, briefs, lineage, material, gaps, context, needs, bundle; weights per org | 170 |  | runtimes-b.md:L214 |
| src/core/cache/cached-read.ts | P1-24 | lib/data.ts 72-79, 158-182, 235-248 (the one getter shape), lib/supabase-server.ts 2637-2705 (fallback vocabulary, `withTimeout`), lib/cache/fallback-guard.ts (P1-01 owns the file) | `cachedRead(key, { tag, revalidate, timeoutMs, empty, route })`: clears its timer, refuses to cache a payload carrying `_error`, records the seed-fallback flag once, returns the typed empty with the trigger | 90 |  | dash-search.md:L229 |
| src/core/cache/fallback-guard.ts | P1-07 | cache/fallback-guard.ts 1-59 | unchanged | 37 |  | capture.md:L180 |
| src/core/cache/fallback-guard.ts | P1-18 | cache/fallback-guard.ts 1-59 | fallback payloads never cached | 30 |  | shell-list.md:L286 |
| src/core/cache/revalidate-tags.ts | P1-08 | revalidate.mjs 31-71 | POST tags; tag names imported from the cache module | 30 |  | harness.md:L298 |
| src/core/cache/tags.ts | P1-07 | cache/revalidate-item.ts 8-33; scripts/lib/revalidate.mjs 14-21 (the mirror goes) | INTEL_ITEMS_TAG, itemTag, surfaceDetailTag, revalidateItem | 13 |  | capture.md:L179 |
| src/core/cache/tags.ts | P1-24 | lib/data.ts 102, 120, 145 | `APP_DATA_TAG`, `PUBLIC_ITEMS_TAG`, the public revalidate window | 10 |  | dash-search.md:L230 |
| src/core/capture/change-detection.ts | P1-07 | check-sources/logic.ts 67-178 (assessAndUpdateSource over fetchDocument instead of browserlessRender; classify with reachability.mjs; decideSourceAssessment; contentFingerprint; the three writes reading their errors; portal harvest), route.ts 83-128 (due-sources query and loop), 142-147 (in-process reconcile) | `runChangeDetection(service, limit)`: due sources, assess each, write sources, source_trust_events, monitoring_queue (vocabulary from one constant), harvest portal links, run the reconcile pass; returns per-source results and totals | 140 |  | capture.md:L168 |
| src/core/capture/fetch-ladder.ts (P1-07 owns) | P1-13 | run-ledger-consume.mjs:246-337 | polite, timed, charset-aware, PDF-or-HTML, API-host, EUR-Lex rendering, access-wall | 70 moved | handoff | runtimes-b.md:L210 |
| src/core/capture/fetch-policy.ts | P1-07 | capture-worker/index.ts 71-171 (ERROR_MARKERS, MIN_BYTES, MAX_PDF_BYTES, MAX_TEXT_BYTES, FETCH_TIMEOUT_MS, STORAGE_MAX_CHARS reader, RETRYABLE_STATUS, MAX_ATTEMPTS, PRIMARY_HEADERS, ALT_HEADERS_ON_403, isTextType, decodeBody), 177-220 (BodyTooLargeError, readCappedBody plus the Content-Length precheck from 353-363); scripts/sources/inaccessible-triage.mjs 53-60 (the copy goes) | the one fetch policy: constants, header pair, `fetchDocument(url)` (primary fetch, 403 alt retry, timeout, capped read, charset decode, null strip, error-marker and size refusal) returning `{status, contentType, text, bytes, pdfPages, declaredTransforms}` or a typed refusal; web-standard APIs only (fetch, TextDecoder, ReadableStream) so Deno and Node both import it by relative path | 90 |  | capture.md:L166 |
| src/core/census/identity.ts (P1-07 capture owns the census) | P1-06 | identity.mjs 15-52 | classifyIdentifier, UK_TYPES | 35 |  | sources-b.md:L230 |
| src/core/contracts/envelope.ts | P1-04 | envelope.mjs 1-330 | as today, isDegraded dropped | 190 |  | intake-b.md:L229 |
| src/core/contracts/factor-tier.ts | P1-04 | factor-tier.mjs 1-403 | tiers, scopes, validateFactor, SQL generators; resolver ported when its first reader is (P1-19..21 operations or market) | 200 |  | intake-b.md:L231 |
| src/core/contracts/source-licence.ts | P1-04 | source-licence.mjs 1-446 | register (as a data module), gate, attribution, seed SQL generator | 370 |  | intake-b.md:L230 |
| src/core/contracts/verbatim.ts | P1-04 | verbatim-grounding.mjs 1-31; record-facts.mjs 14-25 | one verbatim rule matching `validate_item_provenance` criterion 3 | 25 |  | intake-b.md:L232 |
| src/core/contracts/vocabularies.ts | P1-04 | vocabularies.mjs 1-563 | consumed vocabularies, mode normalisation; unconsumed ones land with their first reader | 290 |  | intake-b.md:L228 |
| src/core/coverage/matrix.ts | P1-06 | coverage-matrix.mjs 1-326 | pure matrix, query, view, CSV, denominator lines, with exported types | 230 |  | sources-b.md:L219 |
| src/core/coverage/request.ts | P1-06 | request-coverage.mjs 1-71 | validate and record a request; one open flag per subject_ref | 50 |  | sources-b.md:L221 |
| src/core/coverage/state.ts | P1-06 | coverage-state.mjs 1-127 | six-state copy table | 75 |  | sources-b.md:L220 |
| src/core/csv/split.ts | P1-18 | csv/split.mjs 1-43 | CSV split | 39 |  | shell-list.md:L285 |
| src/core/csv/stream.ts | P1-15 | eea-hdv-csv 1-117 | chunk-safe RFC 4180 reader with byte limit and truncation flag; `splitCsvText` becomes a wrapper (P1-04's split.mjs retires) | 110 |  | producers.md:L303 |
| src/core/db/clients.ts | P1-01 | supabase-env.ts 1-3; supabase-browser.ts 1-8; supabase-server-client.ts 1-27; supabase-service.ts 25-37; supabase-server.ts 43-55 (isSupabaseConfigured, getSupabase), 64-77 (describeSupabaseError); proxy.ts 38-57 (request-bound variant) | browser client, cookie server client, request-bound proxy client, memoised fail-closed service client, isConfigured predicates, error describer, isUuid | 70 |  | auth-db.md:L230 |
| src/core/db/paginate.ts | P1-01 | db/paginate.mjs 15-107 | fetchAllRows, assertBound, exactCount, fetchAllByIdChunks | 45 |  | auth-db.md:L231 |
| src/core/db/pg.ts | P1-08 | pg-conn.mjs 14-77 | direct Postgres for the two schema tools; explicit URL only | 30 |  | harness.md:L296 |
| src/core/db/script-writes.ts (with P1-01 core/db) | P1-08 | db.mjs 41-668; table-primary-keys.mjs (replaced by P1-11 generated keys) | read-only client proxy, PK-ordered pagination, guarded update/insert/delete/upsert with cite and reversal record, registerSource, reclassifyToSource | 220 |  | harness.md:L295 |
| src/core/detail/claim-tiers.ts | P1-19 | load-detail-core.ts 134-225 | one query: FACT claims with source `COALESCE(tier_override, base_tier)`, suppressed claims removed, fail closed to {} | 45 |  | regulations.md:L301 |
| src/core/detail/cross-page-read.ts | P1-19 | supabase-server.ts 4236-4423; lib/detail/cited-item-links.ts 1-17 | intersection summary, theme analysis (members by page, lineage, brief), fresh inferences, theme chips for list strips | 140 |  | regulations.md:L300 |
| src/core/detail/fact-model.ts | P1-19 | fact-paragraphs.ts 1-161; fact-card-model.ts 1-572 | paragraph classes, fact-card models, merge, record model, brief-grade tier match; one regex set | 330 |  | regulations.md:L304 |
| src/core/detail/id-redirect.ts | P1-19 | id-redirect.ts 1-63; item-id-filter.ts 1-7 | render, redirect to the owning slug, or not found at the uuid URL; `itemIdColumn` | 45 |  | regulations.md:L302 |
| src/core/detail/inference-view.ts | P1-19 | inference-view.mjs 1-169 | allowlist, current-row rule, citation gate, caps, customer read | 80 |  | regulations.md:L303 |
| src/core/detail/item-read.ts | P1-19 | supabase-server.ts 3776-4234 | `readDetailItem(id)`: explicit column list, verified gate, one uuid resolution returned with the row, bounded relationship reads (changelog limit, cross references, supersessions, timelines, bias tags, cited sources), sections by uuid, the mapper for the fields the four surfaces render, including recommended_actions in the shape the extractor writes | 230 |  | regulations.md:L299 |
| src/core/detail/load.ts | P1-19 | lib/detail/load-detail.ts 31-151; load-detail-core.ts 30-132, 227-332 | `loadDetail(surface, id, loadItemScoped)`: item read, canonical-surface admission, one cached item-scoped bundle, per-request inferences and correction redaction, `applyIdRedirect`; no viewer branch, no injection seam | 140 |  | regulations.md:L298 |
| src/core/detail/record-sections.ts | P1-19 | parse-record-sections.ts 1-189 | record-grade claim lines, exact-line tiers, key-date split | 100 |  | regulations.md:L308 |
| src/core/detail/relevance-route.ts | P1-19 | app/api/detail/relevance/route.ts 42-79 | per-viewer relevance and binding data; auth decision recorded (section 8, gaps) | 35 |  | regulations.md:L309 |
| src/core/detail/section-index.ts | P1-19 | section-index-data.ts 1-86 | fixed-ordinal index tables | 45 |  | regulations.md:L306 |
| src/core/detail/sources-parse.ts | P1-19 | extract-regulation-sections.ts 18-48 (15 only), 358-492; source-entry-filter.mjs 1-23 | section 15 table parser with the multi-header fix and the placeholder filter, reading only section 15 | 85 |  | regulations.md:L307 |
| src/core/detail/timeline.ts | P1-19 | timeline-math.ts 1-168; requirement-trajectory-classify.ts 1-66 | classify, collapse 4/4, next clause, obligation merge, trajectory step; `now` is a required argument | 110 |  | regulations.md:L305 |
| src/core/drain/switch.ts | P1-15 | switch 1-60 | decideDrainSwitch, readDrainSwitch (P1-05/06's judgement-drain pause read folds in) | 35 |  | producers.md:L307 |
| src/core/email/send-invitation-email.ts | P1-07 | send-invitation-email.ts 1-31 | the seam, env-gated when a provider lands; result never silent | 18 |  | capture.md:L177 |
| src/core/entities/corridor-scope.ts | P1-10 | corridor-scope.ts 1-146; corridor-scope-cache.ts 1-45 | corridor scopes, cached, with read errors surfaced and an invalidation tag the seed calls | 85 |  | flywheel-b.md:L257 |
| src/core/entities/crosswalk.ts | P1-10 | crosswalk.mjs 1-161 | schemes, validators, identifierRow with an injected clock | 95 |  | flywheel-b.md:L250 |
| src/core/entities/id.ts | P1-10 | entity-id-shape.mjs 1-37; entity-id.mjs 6-86; host-from-url.mjs 1-10; decisions.mjs 51-57; write-entity-scope.mjs 22-32 (one corridor-name parser); resolve.mjs 66-98 (merge follower) | ids, kinds, corridor seed and its parser, host, merge following | 95 |  | flywheel-b.md:L249 |
| src/core/entities/lineage.ts | P1-10 | lineage-backfill.mjs 1-214 | ADR-022 partition, lineage-gap targets | 100 |  | flywheel-b.md:L254 |
| src/core/entities/link-entities.ts | P1-10 | link-item-entities.mjs 1-62 | the mint-time spine link, every error surfaced, bounded read | 40 |  | flywheel-b.md:L252 |
| src/core/entities/link-items.ts | P1-10 | link-items.ts 46-165 | the link step | 95 |  | flywheel-b.md:L255 |
| src/core/entities/mentions.ts | P1-10 | canonical-entities.mjs 1-32; entity-resolve.mjs 1-309 | detect, resolve, bucket, type, plan, subject identity, moat boundary | 165 |  | flywheel-b.md:L253 |
| src/core/entities/plan.ts | P1-10 | entity-plan.mjs 1-88; backfill-entities.mjs 26-69 | jurisdiction, instrument, organisation planners | 75 |  | flywheel-b.md:L251 |
| src/core/entities/source-role.ts | P1-10 | source-role.mjs 1-34 | source role and congruence | 20 |  | flywheel-b.md:L256 |
| src/core/entities/unlocode-names.ts | P1-10 | unlocode-names.mjs 10-86 | names and corridor labels | 35 |  | flywheel-b.md:L258 |
| src/core/env.ts | P1-08 | env-file.mjs 1-58 | env load | 20 |  | harness.md:L297 |
| src/core/fetch/api.ts | P1-05 | api-transport.mjs 1-96 | Federal Register and eCFR official APIs | 60 |  | sources-a.md:L295 |
| src/core/fetch/cache.ts | P1-05 | fetch-hold.mjs 56-99 | canonical-key cache with host TTLs | 35 |  | sources-a.md:L298 |
| src/core/fetch/candidates.ts | P1-05 | identifier-variants.mjs 1-252; seek-more.mjs 1-157, 199-247; primary-fallback.mjs 82-173 | identity-derived candidate URLs (EU, UK, US, Norway, Ireland, APIs), EUR-Lex rendering rewrite, bounded roadblock fallback, exhaustion flag row with its write checked, held-pool retrieval | 220 |  | sources-a.md:L299 |
| src/core/fetch/classify-body.ts | P1-05 | entity-gate.mjs 1-92; primary-fallback.mjs 1-80; transport-escalation.mjs 6-84; access-wall.mjs 1-136; holdings-audit.mjs 135-155; canonical-fetch.mjs 50-56, 101-103 | one body classifier, one result enum, toText, partitionErrorBodies, urlIsRoot | 160 |  | sources-a.md:L293 |
| src/core/fetch/direct.ts | P1-05 | charset-decode.mjs 1-69; pdf-extract.mjs 1-39; sec-fair-access.ts 1-11 | the free direct GET: hold check, timeout, redirect, charset decode, PDF to text, SEC UA, truncation reported never silent | 110 |  | sources-a.md:L294 |
| src/core/fetch/hold.ts | P1-05 | fetch-hold.mjs 5-54; scrape-schedule.ts 1-59; P1-01's handoff of api/pause.ts readScrapeState, getScrapeState, isGloballyPaused | `fetchAllowed(url, caller)`: refuses while SCRAPE_HOLD is engaged or the cadence is off for an unsigned caller, fails closed on a read error; the two signed callers; cadence window math | 80 |  | sources-a.md:L292 |
| src/core/fetch/ladder.ts | P1-05 | transport-escalation.mjs 86-256; transport-runtime.mjs 1-95 | escalateFetch over cache, API, direct; exhaustion record; captureForStorage | 130 |  | sources-a.md:L296 |
| src/core/fetch/reachability.ts | P1-05 | reachability.mjs 1-31; verification-decision.mjs 1-16; check-sources-decision.mjs 1-24; fetch-now-decision.mjs 1-21 | three-way classify over the direct transport, the per-caller mappings | 45 |  | sources-a.md:L297 |
| src/core/figures/format.ts | P1-20 | figures/format-range.mjs 16-25; figures/uncertainty.mjs 1; refresh-published-price-statistics.mjs 30-51; series-board-view-model.mjs 6-46; RecalculationNotice.tsx 33-42; StatutoryFigure.tsx 44-50 | `formatFigure(value, unit, currency)`, `formatRange(low, point, high, unit, currency)` naming a missing bound, UNCERTAINTY_PCT, currency map; uses lib/format formatNumber | 15 |  | market.md:L244 |
| src/core/flags/need-targets.mjs | P1-12 | question-answers/data 12-24, 115-142 | need namespaces, open need-target reader, needOfFlag | 60 |  | runtimes-a.md:L273 |
| src/core/flywheel/cluster.ts | P1-09 | cluster.mjs 1-187 | label propagation, theme id = smallest member, per-theme stats | 120 |  | flywheel-a.md:L227 |
| src/core/flywheel/discover.ts | P1-09 | discover.mjs 62-151; signal-candidates.mjs 91-116 (the regulation-identifier token as a shared-entity basis); signal-confidence.mjs 16-36 (its weight) | `discoverConnections(item, candidates, { freq, threshold 0.3, limit 12 })` over bases shared_source, shared_scenario (idf), shared_compliance_object, shared_jurisdiction_topic, shared_entity, shared_obligation; `computeTagFrequencies` | 110 |  | flywheel-a.md:L225 |
| src/core/flywheel/edges.ts | P1-09 | write-edges.mjs 73-276 (readExistingEdges scoped to candidate pairs); pair-view.mjs 1-113; brief-candidates.mjs 17 and connection-view-model.mjs 7 (one relationship table) | `writeDiscoveredEdges`, `writeIntersectionEdges`, `pairKey`, `collapsePairs`, `bandOf`, `assemblePairs`, RELATIONSHIPS with label and specificity | 200 |  | flywheel-a.md:L230 |
| src/core/flywheel/flags.ts | P1-09 | flag-namespaces.mjs 1-94; decision-note.mjs 13-27; propose-tags.mjs 101-187 (flag row, no-derivable row, planReflect); signal-confidence.mjs 239-274 (resolution plan, pre-resolved row with an injected clock) | the namespace grammar, `buildSubjectRef`, `isInNamespace`, `planReflect` (open flags against fresh findings), born-resolved rows, decision notes | 90 |  | flywheel-a.md:L231 |
| src/core/flywheel/gaps.ts | P1-09 | gaps.mjs 1-124 (string equality replaced by jurisdiction entities); anticipate.mjs 1-129; coverage-reflection.mjs 1-43 | `detectGaps`, `computeAnticipatedTargets`, reflection rows born resolved | 150 |  | flywheel-a.md:L229 |
| src/core/flywheel/intersections.ts | P1-09 | intersections.mjs 1-171 | the AND rule, points, tiers, strength to score, basis entries, isCrossSurface with (item_type, domain) | 100 |  | flywheel-a.md:L226 |
| src/core/flywheel/signature.ts | P1-09 | run-discovery.mjs 5-35; apply-tags.mjs 497-502; discover-for-items.mjs 99-106 | CONNECTION_SIGNATURE_COLUMNS (plus domain, entity ids, obligation keys), one paged `loadSignatures(sb, { ids, since })` | 40 |  | flywheel-a.md:L224 |
| src/core/flywheel/themes.ts | P1-09 | theme-delta.mjs 1-149; theme-stats.mjs 7-46; brief-staleness.mjs 9-70 | `diffThemes`, `lineageFromThemeDelta`, `computeThemeStats`, CONVERGENCE_BANDS (one export), `computeMemberHash`, `isBriefStale`, `resolveBriefForTheme` | 150 |  | flywheel-a.md:L228 |
| src/core/flywheel/view-model.ts | P1-09 | connection-view-model.mjs 20-235; brief-candidates.mjs 75-206 | `buildConnectionRows`, `buildSupersessionRows`, `buildAllConnectionRows`, `buildIntersectionView`, `selectBriefCandidates`, `formatCandidateBlock`; surface path, label and order imported from routing | 200 |  | flywheel-a.md:L241 |
| src/core/format.ts | P1-18 | format.ts 1-85; relative-time.ts 1-78 | pinned locale, dates, numbers, pluralize, relative time | 75 |  | shell-list.md:L282 |
| src/core/grounding/config.ts | P1-03 | generation-config.ts 15, 32, 38, 47-49 | STORAGE_MAX_CHARS, SYNTH_INPUT_BUDGET_CHARS, SYNTH_PRIMARY_HARD_CEILING_CHARS, BROWSERLESS_FETCH_CONCURRENCY (the size doctrine, caps never bind or fail loud) | 20 |  | intake-a.md:L330 |
| src/core/grounding/gates.ts | P1-03 | mint-gates.mjs 1-34; defect-signatures.mjs 1-69; gate-a-scan.mjs 15-301; gate-a-match.mjs 1-25; gate-a-derived.mjs 9-45; analysis-labels.mjs 3-20; null-tier-flag.mjs 17-80 (the re-attribution shape kept, the "4c relabel" sentence replaced by rule 18's "register and rate"); audit-gate.ts 29-159; audit-gate-core.mjs 1-56 | per-FACT gates, S-CONFLATE and S-NUMERIC, Gate A harvest and scan with the two coverage arms, derived coverage, the analysis labels, null-tier flag text, the cross-item audit gate, the Layer C block reader | 420 |  | intake-a.md:L326 |
| src/core/grounding/ground.ts | P1-03 | canonical-pipeline.ts 1621-1660 (entry, lock, ticket removed), 1697-1758 (cited-host gate), 1771-1790 (error-body gate), 1816-1840 (target match), 1859-1935 (resolver, floor pool), 1945-1990 (kept filter, slot coverage), 2008-2076 (incoming collection), 2083-2171 (dominance, Gate A and B), 2172-2290 (apply, mint gates, citation edges, rpc) | `groundInjectedLedger(itemId, ledger, opts)`: the whole free grounding sequence, one function per stage | 650 |  | intake-a.md:L328 |
| src/core/grounding/ledger.ts | P1-03 | ledger-apply.mjs 1-206; ledger-dominance.mjs 13-61; ground-failure-class.mjs 1-22 | `diffLedger`, `applyLedgerDiff` (archive before change, replace-ledger archive), `eraseClaimWithProof` with its caller in the erase step, `summarizeLedger`, `ledgerRegression`, `groundRetryPlan` | 170 |  | intake-a.md:L325 |
| src/core/grounding/pool.ts | P1-03 | source-blocks.mjs 19-93; source-pool-hash.mjs 17-33; floor-attribution.mjs 12-40; section-grounding.mjs 3-15; canonical-pipeline.ts 390-430 (readAllSourcesForResolver), 1764-1790 (pool read), 1186-1210 (holdings) | `readItemPool`, `buildSourceBlocks` (floor-complete, tier-ordered), `authorityFloorFor`, `authorityFloorForFact`, `hashSourcePool`, `floorSources`, `reattributeToFloor`, `spanIsVerbatim`, `prepareSectionForGrounding` | 90 |  | intake-a.md:L324 |
| src/core/grounding/slots.ts | P1-03 | slot-prompt.mjs 5-57; slot-forcing.mjs 7-55, 63-72 | `uncoveredSlots`, `nominateForSlot` (candidates offered to the author), `decideSlotClaim` with the author as confirmer, the slot cache | 70 |  | intake-a.md:L327 |
| src/core/grounding/url-canon.ts | P1-03 | url-canon.mjs 1-22 | the JS mirror of migration 150 (fixtures to its test) | 20 |  | intake-a.md:L329 |
| src/core/harness/families.ts | P1-08 | 37 family.json; loop-run-id.mjs 17-30; upstream-artifact.mjs 18-47 | `FAMILIES`: name, owning module id, function, downstream names, apply-evidence predicate | 80 |  | harness.md:L291 |
| src/core/harness/outcome.ts | P1-08 | run-artifact.mjs 27-68, 241-281 | outcome and trigger vocabularies; the no-op contract (a noop row carries no write count above zero) | 40 |  | harness.md:L292 |
| src/core/harness/proofs.ts | P1-08 | (new; reads what record.ts writes) | the six operator proofs as queries (below) | 80 |  | harness.md:L293 |
| src/core/harness/record.ts | P1-08 | record-harness-run.mjs 59-180; emit-workflow-run-artifact.mjs 20-26 | `recordRun(row)`: one insert into `harness_runs` returning the id; `outcomeOf(results)` | 70 |  | harness.md:L289 |
| src/core/harness/run.ts | P1-08 | chained-dry-guard.mjs 14-66; upstream-artifact.mjs 56-112; run-artifact.mjs 380-416 (stamping); maintenance/lib/cli.mjs 70-108 | `runFamily(name, input)`: resolve credentials, mode (forced dry while scrape_cadence is off for any machine-fired run), kill switches; start; call the family function; record outcome (success, noop, refused, failed) with outputs; then, on success with apply evidence, call each downstream family in process with `root_run_id` and `upstream_run_id`; a skipped downstream is recorded as `noop` with its reason | 150 |  | harness.md:L290 |
| src/core/health/gate-a.ts | P1-06 | gate-a-gauges.mjs 1-121 | gauge shaping and probe verdict | 80 |  | sources-b.md:L231 |
| src/core/health/spend.ts | P1-06 | spend-health.mjs 1-159 | spend traceability verdict | 100 |  | sources-b.md:L232 |
| src/core/http/openalex.ts | P1-15 | openalex-client 1-87; research-walker 76-79 | GET with 429 backoff and polite mailto, 404 to null, work by DOI, works search; a 20-second timeout | 80 |  | producers.md:L306 |
| src/core/intake/classify-verdict.ts | P1-03 | first-fetch-classify.ts 17-71 (the instruction and its content hash), 87-139 (types), 154-169 (the user-message builder, kept as the author's input shape), 190-213 (error-body pre-gate), 261-342 (the validator) | `validateClassifyVerdict(input, verdict)`: the free half of first-fetch classify, consumed by P1-04 intake-b and the verdict-file driver | 120 |  | intake-a.md:L331 |
| src/core/jurisdictions/iso.ts | P1-19 | lib/jurisdictions/iso.ts 1-222 | ISO validation; country labels from `Intl.DisplayNames` with the subdivision and free-text tables kept [HYPOTHESIS: identical server and browser output under full ICU] | 70 |  | regulations.md:L337 |
| src/core/jurisdictions/legacy.ts | P1-19 | constants.ts 19-141 | legacy slug to ISO and region map, used only for rows without `jurisdiction_iso` | 100 |  | regulations.md:L339 |
| src/core/jurisdictions/tiers.ts | P1-19 | lib/jurisdictions/tiers.ts 1-213; lib/tier1-priority-jurisdictions.ts (sources-b scope) | one Tier-1 list, Tier 2, subnational, country group | 110 |  | regulations.md:L338 |
| src/core/lists/item-links.ts | P1-18 | item-links.ts 1-56 | canonical surface, detail href | 25 |  | shell-list.md:L277 |
| src/core/lists/pagination.ts | P1-18 | list-pagination.ts 25-157 | page sizes, remainder trim, keyset cursor | 55 |  | shell-list.md:L275 |
| src/core/lists/row-fields.ts | P1-18 | list-row-fields.ts 1-93 | ListRow fields, watch type | 45 |  | shell-list.md:L276 |
| src/core/notifications/dispatch.ts | P1-07 | dispatch.ts 8-20, 41-55 | NotificationKind, dispatchNotification on the shared service client | 25 |  | capture.md:L178 |
| src/core/perf/server-timing.ts | P1-07 | server-timing-core.ts 1-8, 10-24, 29-62, 71-78, 85-109, 136-144; server-timing.ts 20-58, 71-73 | PERF_PHASES, the request-scoped store, timePhase, recordSerializedBytes, withServerTiming, the header builder; toPerfLogLine kept only if the P1-02 bootstrap route logs it | 95 |  | capture.md:L174 |
| src/core/perf/slugs-or-empty.ts | P1-07 | static-params-fallback.mjs 1-43 | slugsOrEmpty | 25 |  | capture.md:L175 |
| src/core/producers/registry.ts + registry/*.json | P1-15 | load-registry 1-144; run-registered 1-69; the 7 JSON | validate entries (closed field set, kill switch name, entity id shape), select runs (all, registry, only), run in-process in filename order, stop at the first failure, strip ambient PRODUCER_ENTITY_ID | 160 |  | producers.md:L299 |
| src/core/producers/rows-file.ts | P1-15 | rows-file 1-83; operator-rows-contract 1-245; cli-csv-args 1-22 | load and validate a rows file, require a citation, register the cited source at the class-table tier, resolve an entity by canonical name; the operator CSV contract (two tables, 256 KiB and 500-row caps, entity-ref validation now called) | 230 |  | producers.md:L302 |
| src/core/producers/runner.ts | P1-15 | ecb-fx 196-391; eia 143-326; eu-weekly-oil 22-132; sbti 314-462; ukpn 204-380; neso 90-219; eurostat-lc 65-134; eurostat-nrg 30-75; bls 27-87; eea-hdv 49-57, 182-256; run-envelope 102-166; research-assessment 292-309, 420-562; research-walker 285-299, 438-558; grid-queue 89-167; oem-roadmap 118-196; reroute 116-195; auxiliary-energy 20-79; indexation 32-92 | `runProducer(spec, io)`: argv (`--apply`, `--input`, `--trace`, `--rows-file`, `--csv`, `--org-id`, `--limit`), env file once, gates in order (licence block, ENABLED constant, kill switch env, credentials, partial read), input from file, stdin or injected fetch, pure parse, keyed plan against existing rows read by namespace, dry print, guarded write, downstream hook (edges or entities), summary and run artifact, NetworkError exit 3, StructureError exit 2, returned exit code | 260 |  | producers.md:L298 |
| src/core/producers/summary.ts | P1-15 | producer-summary 1-60; emit-producers-artifact 15-91 | one summary writer; the producers family artifact fold with governing files read from the family descriptor | 90 |  | producers.md:L300 |
| src/core/producers/upsert-plan.ts | P1-15 | ukpn 177-198; eea-hdv-co2 59-80 (regional-facts-envelope and write-market-series planners are P1-19/20's and adopt it) | `planKeyedUpsert(existing, incoming, { key, patchable })` | 45 |  | producers.md:L301 |
| src/core/propagation/admissible.ts | P1-10 | admissible-for.ts 1-39; effective-confidence.mjs 15-36; decisions.mjs 27-31 (FLOOR) | admissibleFor, effectiveConfidence, FLOOR | 45 |  | flywheel-b.md:L238 |
| src/core/propagation/author-edges.ts | P1-10 | author-edges.mjs 22-146 | idempotent authorship of a landed figure | 65 |  | flywheel-b.md:L242 |
| src/core/propagation/drain.ts | P1-10 | drain.ts 32-420 | exact queue depth, batch read, Pass 1 invalidate, mark drained, one recompute loop over both tables, question re-open | 170 |  | flywheel-b.md:L241 |
| src/core/propagation/inference.ts | P1-10 | infer-from-question.ts 148-289 | first-inference builder, re-open of a recomputed answer's question | 90 |  | flywheel-b.md:L244 |
| src/core/propagation/methods.ts | P1-10 | methods/index.ts 3-92, 136-138; carbon-intensity.ts 1-71; market-series-delta.ts 1-86; infer-from-question.ts 52-74, 291-310 | one registry keyed by (table, method@version), never overwritten; carbon_intensity_tkm, market_series_delta, infer-from-question | 110 |  | flywheel-b.md:L240 |
| src/core/propagation/notices.ts | P1-10 | methods/superseded-notices.ts 14-117 | superseded pairs for watched entities | 65 |  | flywheel-b.md:L243 |
| src/core/propagation/register.ts | P1-10 | register-derivation.ts 38-127; infer-from-question.ts 85-146 | one validated atomic register for derived_values and inference_records rows | 70 |  | flywheel-b.md:L239 |
| src/core/propagation/signpost.ts | P1-10 | signpost-watch.ts 7-124, 161-266 | predicate evaluation, lifecycle transition, fireSignpost (as one RPC if a migration is ruled, gap 7) | 100 |  | flywheel-b.md:L245 |
| src/core/propagation/types.ts | P1-10 | propagation/types.ts 1-106 | the shared vocabulary and the inputs jsonb shape | 55 |  | flywheel-b.md:L237 |
| src/core/render-now.ts | P1-18 | render-now.ts 1-11 | one render instant | 5 |  | shell-list.md:L283 |
| src/core/routing/surface.ts | P1-09 | surface-of.mjs 1-67; domains.ts 1-24, 42-121; connection-view-model.mjs 26, 152, 160 | SURFACES, SURFACE_RULES, `surfaceOf(itemType, domain)`, `renderSurfaceOfSql`, SURFACE_PATH, SURFACE_LABELS, SURFACE_ORDER, the domain integers, DOMAIN_LABELS, `domainForItemType`, `asDomain` | 100 |  | flywheel-a.md:L242 |
| src/core/sources/bias-tags.ts | P1-05 | bias-tag-pipeline.mjs 1-152; credibility/bias-display.mjs 1-128; credibility/chip-selection.mjs 1-39 | vocabulary, one adoption band, injected writer, labels, chips, legend | 110 |  | sources-a.md:L288 |
| src/core/sources/classify.ts | P1-05 | classify-source-role.ts 1-111; vertical-fit.ts 1-73; source-type-taxonomy.mjs 1-198 | source_role, institutional type, source_type vocabulary and classifier from one tokenised name and host | 190 |  | sources-a.md:L285 |
| src/core/sources/host-class-data.ts | P1-05 | host-authority.ts 1-75, 125-214, 268-340, 365-384 | the allowlists, class regexes, ruled host instances, residue word lists | 110 |  | sources-a.md:L283 |
| src/core/sources/host-class.ts | P1-05 | host-authority.ts 76-108, 216-228, 247-263, 341-426, 435-535, 578-659 | codifiedTierForHost, classTierForHost, classTierForHostAcrossNames, permanentlyUnregisteredClass, isDoiResolverHost, residue rules, verdictPlacementForHost, placeHostWithVerdicts, decidePoolHostRegistration | 170 |  | sources-a.md:L282 |
| src/core/sources/institution.ts | P1-05 | institution.ts 1-81 | hostInstitution, tierOfSource (base_tier only), buildResolver that reports a disagreeing institution instead of picking the first row | 60 |  | sources-a.md:L284 |
| src/core/sources/officialness.ts | P1-05 | officialness.mjs 1-145 | path a or b | 85 |  | sources-a.md:L290 |
| src/core/sources/target-match.ts | P1-05 | target-match.mjs 1-308 | instrument identity match over a capture and over the pool, own-URL match | 150 |  | sources-a.md:L289 |
| src/core/sources/tier-contract.ts | P1-05 | host-authority.ts 549-565; tier-labels.ts 1-15; customer-source-tier.ts 1-44; trust.ts 215-223 (TIER_WEIGHTS) | the skill's tier table as data (tier, meaning, examples), HOST_CLASS_TIER, isKnownHostClass, customer labels derived from the table, customerSourceTier, tierLabelOf, tierScaleSpan, citation weights | 70 |  | sources-a.md:L281 |
| src/core/sources/tier-movement.ts | P1-05 | trust.ts 189-279, 332-503, 632-647, 689-702, 711-838, 840-1127, 1266-1606; tier-override-guard.mjs 1-36 | citation edge scoring and promotion, evaluatePromotion, evaluateDemotion with the cadence hold, opinion and outcome movement, decideEffectiveTier, planTierMovements, tierMovementEvent, applyTierMovements, the override guard | 360 |  | sources-a.md:L287 |
| src/core/sources/trust-score.ts | P1-05 | trust.ts 14-187, 1129-1264 | components, tier prior, prior blend, trustMetricsFromRow, planTrustScores with stored components that add up to the stored overall | 140 |  | sources-a.md:L286 |
| src/core/statutory/{types.ts, fueleu-annex-iv.ts, contractable-barrier.check.ts} | P1-19 | lib/statutory/* | FuelEU computation and its compile-time barrier; offered to P1-10 if the coordinator places it there | 95 |  | regulations.md:L340 |
| src/core/tags/adopt.ts | P1-09 | apply-tags.mjs 29-32, 66-100, 108-247, 401-443 | `decideTagProposal` (high adopts; medium adopts with vocabulary and evidence re-confirmed), `buildMergePatch` (merge-only, removed tags from item_corrections respected), `adoptTags(deps, item, proposals)` writing the tag columns and the decision flag resolved | 150 |  | flywheel-a.md:L234 |
| src/core/tags/derive.ts | P1-09 | derive-tags.mjs 13-32, 437-551 (FIELD_CAPS, confidence, keyword map, deriveTags); tag-aliases.mjs 79-165 (the alias loop folded into the same scorer); tag-input.mjs 40-129 | `deriveTags(item, vocabulary)` with evidence in the item's own text, per-field caps, high and medium confidence; `assembleTagInput` | 230 |  | flywheel-a.md:L233 |
| src/core/tags/vocabulary.ts | P1-09 | tag-labels.mjs 3-98; tag-aliases.mjs 13-78 (ALIAS_MAP as synonym rows); derive-tags.mjs 261-371 (CURATED_SYNONYMS and SUPPRESS_OWN_NAME as synonym rows and suppressions) | one vocabulary read: closed field values from the brief contract module (P1-03 `core/brief/vocab.ts`), adopted terms from `vocabulary_terms`, labels, acronyms, synonyms, suppressions | 120 |  | flywheel-a.md:L232 |
| src/core/telemetry/error-sink.ts | P1-07 | capture-error.ts 1-135; stack-hash.mjs 1-64; seed-fallback-flag.ts 43-61 (the null_orgId rule) and 81-128 (collapsed to one captureError call) | captureError (insert, 23505 increment), withErrorCapture, stackHash and its normalisers, `captureSeedFallback(trigger, route)`; imports getServiceSupabase from core/db | 120 |  | capture.md:L170 |
| src/core/telemetry/surface-health.ts | P1-07 | surface-health.mjs 1-67 | evaluateSurface, overallOk, seedLeak; the surface list exported once and read by the probe route (P1-08) so the twin goes | 35 |  | capture.md:L173 |
| src/core/text/html-to-text.ts | P1-18 | text/html-to-text.mjs 15-25 | strip markup | 11 |  | shell-list.md:L284 |
| src/core/text/slugify.ts | P1-15 | slugify 1-9 |  | 7 |  | producers.md:L304 |
| src/core/themes/theme-view.ts | P1-21 | theme-brief.mjs 1-303; theme-brief-text.mjs 1-47 | theme for item, analysis view, chips, derived label, brief text cleaner with a bounded score pattern | 190 |  | research-ops.md:L283 |
| src/core/time/iso-week.ts (core, shared with P1-01) | P1-17 | Masthead.tsx 44-50; auth/AuthFrame.tsx 35-41 (P1-01's row names this import) | the one isoWeekNumber, UTC getters | 10 |  | ui-kit.md:L285 |
| src/core/turn/run-turn.ts (+ scripts/turn.mjs, 20) | P1-13 | the `main()` of all seven runtimes (e.g. run-source-sweep.mjs:1009-1423 frame, run-population-flywheel.mjs:1466-1607); run-population-flywheel.mjs:522-661 (the plan shape) | stage plan, build-mode gate read once, mode, one client, one loop run id, each stage run through P1-08's `runFamily`, downstream trigger | 180 |  | runtimes-b.md:L204 |
| src/core/turn/stages/capture.ts | P1-13 | run-fetch-drain.mjs:92-207, :268-391 | stuck reset (re-matched at write), queue select, batched capture with a timeout, read-back | 170 |  | runtimes-b.md:L208 |
| src/core/turn/stages/change.ts | P1-13 | run-change-detection.mjs:57-85 (gate), :177-339 (shaper), :389-448 (steps), :629-645 (cross-check) | gate, in-process check, one reconcile, one drain; a failed read is an error | 220 |  | runtimes-b.md:L207 |
| src/core/turn/stages/connect.ts | P1-13 | run-population-flywheel.mjs:63-68, :214-226 (modern ids), :522-710, :728-952 (gate and backlog over harness_runs), :966-1294 (handlers, in process), :1316-1459 | the flywheel plan and handlers in process, outcomes written to the slice's run record, the gate and backlog over harness_runs, the unscoped entry | 520 |  | runtimes-b.md:L211 |
| src/core/turn/stages/intake.ts | P1-13 | run-ledger-consume.mjs:406-826 (verdicts), :835-1005 (shaping), :1117-1134 (arming), :1176-1394 (export), :1416-1441 (export cursor from harness_runs), :1494-1897 (frame) | verdict load against schema.json, version partition and index, supersede, check-verdicts, classify gate, promote cap, export with text, record-only | 600 |  | runtimes-b.md:L209 |
| src/core/turn/stages/propagate.ts | P1-13 | run-propagation-drain.mjs:122-358, :393-421 | replay from harness_runs, drain, questions-on-change, signposts, metrics | 230 |  | runtimes-b.md:L212 |
| src/core/turn/stages/sweep-research.ts | P1-13 | research-sweep.mjs:66-344 | the research walker: selection query, discovery, seen-state in the database, congruence skip, payload build and validation, hand-off to P1-14 | 200 |  | runtimes-b.md:L206 |
| src/core/turn/stages/sweep.ts | P1-13 | run-source-sweep.mjs:156-1004 (parse, portal, targets, selection, ordering, cursor, coverage patch, coverage report, shaping, budget), :1113-1209 (persist, snapshot, change signal), :1219-1360 (walk loop) | the four walkers, `--all-hosts` slice with a cursor read from harness_runs, coverage columns, snapshot store, change signal, wall-clock budget | 520 |  | runtimes-b.md:L205 |
| src/core/types/item.ts (shared) | P1-02 | types/resource.ts 1-311 | Resource and the detail types; TabId, FocusView, NavEntry and `Cluster` dropped | 180 |  | workspace.md:L274 |
| src/core/urgency/bands.ts | P1-24 | lib/urgency/bands.ts 1-124 | the four bands, `bandFromPriority`, `classifyByDays`; hex read from the tokens, not duplicated | 75 |  | dash-search.md:L227 |
| src/core/urgency/scoring.ts | P1-24 | lib/scoring.ts 6-80 | `getJurisdiction` and `scoreResource` with anchored, word-bounded patterns and an explicit LOW weight; `scoreResource({ type, priority, tags, modes })` | 90 |  | dash-search.md:L228 |
| src/core/url/canonical.ts | P1-05 | url-canonicalize.ts 1-68; institution.ts 10-12 and the other hostOf copies | canonicalizeUrl, hostOf (one each; merge with agent/url-canon.mjs once its owner reads it) | 45 |  | sources-a.md:L291 |
| src/core/values/label.ts | P1-15 | label 1-50 | labelled, missing, spec09Label | 22 |  | producers.md:L305 |
| src/core/vocabulary/adopted-entities.ts | P1-20 | vocabulary/adopted-entities.mjs 1-60 | plan and mint adopted entities (owner P1-09) | 40 |  | market.md:L248 |
| src/core/vocabulary/adopted-terms.ts | P1-20 | vocabulary/adopted-terms.mjs 1-102 minus 72-88 | adopted-terms loader and helpers (owner P1-09) | 50 |  | market.md:L247 |
| src/core/vocabulary/terms.ts | P1-09 | lib term-recurrence.mjs 1-354; term-needs.mjs 1-149 | term kinds, detectors, mention builders, `buildTermPlan`, `applyTermPlan`, `recordBriefTerms`, `planTermNeeds`, `planLineageNeeds`, `celexOf`; the threshold imported from the trust module | 320 |  | flywheel-a.md:L235 |
| src/core/workspace/item-id.ts | P1-02 | overrides/route.ts 12-27; personal-state/route.ts 28-43; item-assignments.mjs 15-23 | `resolveItemUuid(client, key)` surfacing the error, `isIsoDate`; `isUuid` imported from core/db | 25 |  | workspace.md:L241 |
| src/core/workspace/profile.ts | P1-02 | lib/workspace/profile.ts 1-127 (minus the five dead fields); lib/profile/profile-contract.mjs 1-162 | WorkspaceProfile (roles, transportModes, verticals, jurisdictions, orgRoles, orgSize), `getWorkspaceProfile` failing open to the default, ORG_ROLES, ORG_SIZE_DIMENSIONS, findBand, parseOrgProfile, validateProfileInput, the compliance-tag to role map | 170 |  | workspace.md:L237 |
| src/core/workspace/relevance.ts | P1-02 | lib/workspace/relevance.mjs 1-280 | the pure lens and the obligation-grain gate, `fetchObligationObjectsForItem` with the injected client | 190 |  | workspace.md:L238 |
| src/core/workspace/roster.ts | P1-02 | lib/workspace/item-collab-shared.mjs 1-77; lib/workspace/item-collab-route.ts 1-93; bootstrap/logic.ts 72-114; archive-impact/route.ts 93-124; overrides/route.ts 195-211 | `runCollab` (org, role, verified item, handler), `loadRoster` bounded, `displayNameOf`, `nameIndex`, `canWrite`, `isOrgAdmin`, `orgWatchersOf(orgId, itemKeys)` including the team watchlist bit, `itemIdFromDetailPath` | 110 |  | workspace.md:L240 |
| src/core/workspace/store.ts | P1-02 | stores/workspaceStore.ts 1-49 (minus the two weight fields) | orgId, orgName, userRole, sectorProfile, set by AuthProvider | 25 |  | workspace.md:L242 |
| src/core/workspace/viewer-relevance.ts | P1-02 | lib/workspace/viewer-relevance.ts 1-33 | the per-viewer wrapper on the P1-01 service client factory | 20 |  | workspace.md:L239 |
| src/features/account/lib/initial-tab.ts | P1-02 | lib/account/initial-tab.ts 1-17 | tab key resolution | 12 |  | workspace.md:L260 |
| src/features/account/page.tsx | P1-02 | app/profile/page.tsx 16-25 | server gate | 12 |  | workspace.md:L261 |
| src/features/account/ui/AccountPage.tsx | P1-02 | components/profile/UserProfilePage.tsx 113-457 | tab row, rail, one `useAccount` loader | 220 |  | workspace.md:L255 |
| src/features/account/ui/MembersPanel.tsx | P1-02 | components/profile/MembersPanel.tsx 95-544 | the members table, invite, role, remove, ban; BanDialog on the ui-kit Dialog | 380 |  | workspace.md:L257 |
| src/features/account/ui/MembersPanel.tsx (P1-02) gains | P1-25 | InvitationsPanel.tsx 61-77, 104-115, 260-323 | pending invitations list with revoke, beside the invite form it already has | 90 |  | admin-a.md:L301 |
| src/features/account/ui/NotificationPreferences.tsx | P1-02 | components/profile/NotificationPreferences.tsx 29-262 | toggles with rollback on a failed save; DEFAULT_NOTIFICATION_PREFS exported once | 170 |  | workspace.md:L259 |
| src/features/account/ui/OrganizationPanel.tsx | P1-02 | components/profile/OrganizationPanel.tsx 42-293 | name and slug form, workspace record | 170 |  | workspace.md:L258 |
| src/features/account/ui/PersonalTab.tsx, SectorProfileTab.tsx, JurisdictionsTab.tsx, VerifierTab.tsx, ActivityTab.tsx | P1-02 | UserProfilePage.tsx 461-731 | the tab bodies as files | 160 |  | workspace.md:L256 |
| src/features/admin/api/attention.ts | P1-26 | attention/logic.ts 1-52; attention/route.ts 17-45 | the cached counts read and the GET | 45 |  | admin-b.md:L338 |
| src/features/admin/api/bulk-import.ts | P1-26 | bulk-import/route.ts 83-205 (parse and validate), 256-375 (gate, dedup), 379-483 (preview), 485-612 (apply, audit); logic.ts 10-19 | CSV or JSON import with a free HEAD check and the deterministic tier; type, language and jurisdiction written | 330 |  | admin-b.md:L351 |
| src/features/admin/api/candidates-pending.ts | P1-26 | canonical-sources/pending 63-176 | the review queue read, paged, with the deterministic classification attached per row | 90 |  | admin-b.md:L346 |
| src/features/admin/api/corpus-turns.ts | P1-26 | corpus-turn-requests/route.ts 61-271; integrity-flags/[id]/regenerate 17-43 (the flagged-item checks); regenerate-brief 20-28 (the source lookup) | GET open requests; POST {itemId} or {sourceId} or {all}, reason manual, one open row per item (the regeneration request) | 140 |  | admin-b.md:L339 |
| src/features/admin/api/corrections.ts | P1-26 | items/[id]/corrections/route.ts 8-19; revoke/route.ts 8-13 | the three wrappers | 25 |  | admin-b.md:L356 |
| src/features/admin/api/coverage.ts | P1-26 | coverage/route.ts 62-299 | the matrix | 150 |  | admin-b.md:L340 |
| src/features/admin/api/forward-events.ts | P1-26 | forward-events/route.ts 13-101 | upcoming events | 60 |  | admin-b.md:L341 |
| src/features/admin/api/integrity-flags.ts | P1-26 | integrity-flags/route.ts 14-99, 146-359; [id]/resolve 17-115 | both surfaces, paged; PATCH; resolve with a canonical URL and an audit row; the seven-category constant | 200 |  | admin-b.md:L344 |
| src/features/admin/api/intersections.ts | P1-26 | intersections/route.ts 8-77 | pairs | 45 |  | admin-b.md:L343 |
| src/features/admin/api/load-all-corrections.ts | P1-25 | corrections/load-all.mjs 12-60 | moves behind `/api/admin/corrections` (route owed to P1-26) on the service client | 50 |  | admin-a.md:L297 |
| src/features/admin/api/load-item-targets.ts | P1-25 | corrections/load-item-targets.mjs 5-62 | as is (server) | 55 |  | admin-a.md:L296 |
| src/features/admin/api/pause-global.ts | P1-26 | pause-global/route.ts 10-128 | the hold switch | 90 |  | admin-b.md:L350 |
| src/features/admin/api/progress.ts | P1-26 | b2-progress/route.ts 26-98 | regeneration progress via one rpc | 40 |  | admin-b.md:L355 |
| src/features/admin/api/run-intake.ts | P1-26 | run-intake/route.ts 13-50 | one cycle, plan or apply, on the shared client | 40 |  | admin-b.md:L352 |
| src/features/admin/api/source-controls.ts | P1-26 | sources/[id]/pause 7-43; visibility 7-43; tier-override 33-255; commit-tier-change/logic.ts 50-66 and route.ts 9-52; bias-tags/logic.ts 23-86 and route.ts 12-124; fetch-now 48-144 (without the Browserless branch, 43-46) | pause, hide, override set and revert, base-tier commit, bias-tag confirm and reject, fetch now; one audit writer | 300 |  | admin-b.md:L349 |
| src/features/admin/api/source-decisions.ts | P1-26 | canonical-sources/decide 61-317; bulk-approve 52-288; sources/promote 64-293 | `decideSourceCandidate` for canonical and provisional kinds, the bulk map | 320 |  | admin-b.md:L345 |
| src/features/admin/api/statutory-rows.ts | P1-26 | statutory-rows/route.ts 8-37; logic.mjs 14-57 | rows-file preview and write | 60 |  | admin-b.md:L353 |
| src/features/admin/api/themes.ts | P1-26 | themes/route.ts 7-85 | themes with briefs | 45 |  | admin-b.md:L342 |
| src/features/admin/api/tier-opinions.ts | P1-26 | tier-opinions/route.ts 29-169 | disagreements and dismiss | 90 |  | admin-b.md:L347 |
| src/features/admin/api/triage.ts | P1-26 | triage/ingest-rejections 8-112; triage/pending-jurisdiction-review 9-197 | both queues; the PJR resolution through one rpc | 180 |  | admin-b.md:L348 |
| src/features/admin/api/users.ts | P1-26 | users/route.ts 79-101 | bounded member list | 40 |  | admin-b.md:L354 |
| src/features/admin/corrections/CorrectionForm.tsx | P1-25 | corrections/CorrectionForm.tsx 50-172 | as is, fields from P1-17 | 130 |  | admin-a.md:L290 |
| src/features/admin/corrections/CorrectionRow.tsx | P1-25 | corrections/CorrectionRow.tsx 67-212 | as is | 170 |  | admin-a.md:L291 |
| src/features/admin/corrections/CorrectionsTab.tsx | P1-25 | corrections/CorrectionsTab.tsx 43-152 | as is, reading through the all-corrections route | 120 |  | admin-a.md:L292 |
| src/features/admin/corrections/ItemCorrectionsPanel.tsx | P1-25 | corrections/ItemCorrectionsPanel.tsx 63-285 | as is | 230 |  | admin-a.md:L289 |
| src/features/admin/corrections/ItemSearchPicker.tsx | P1-25 | corrections/ItemSearchPicker.tsx 26-118 | as is | 100 |  | admin-a.md:L293 |
| src/features/admin/corrections/model.ts | P1-25 | corrections/model.mjs 1-196 | as is (typed) | 140 |  | admin-a.md:L294 |
| src/features/admin/corrections/types.ts | P1-25 | corrections/types.ts 1-55 | as is, minus the two unread fields | 45 |  | admin-a.md:L295 |
| src/features/admin/read/dashboard.ts | P1-26 | app/admin/page.tsx 20-186 | the dashboard's reads on one service client with a logging fallback | 110 |  | admin-b.md:L358 |
| src/features/admin/read/sources.ts | P1-26 | supabase-server.ts 271-575 | SourceQueryRow, SOURCE_COLUMNS, fetchSources, fetchProvisionalSources, fetchSourceData; mapSourceRow without fabricated defaults (null stays null; the dashboard renders "not scored") | 180 |  | admin-b.md:L357 |
| src/features/admin/ui/AdminConsole.tsx | P1-25 | AdminDashboard.tsx 136-194 (section model), 196-311 (state, store hydration, refresh), 348-426 (counts, sub-nav), 432-597 (frame, tiles, rail), 626-726 (router) | the console: six sections, tiles with live counts, sub-nav with inline counts, body router, rail; the refresh reads through `/api/admin/users` and two new admin reads (organizations, staged) instead of the browser client; no scan, no spend | 220 |  | admin-a.md:L267 |
| src/features/admin/ui/AdminPage.tsx | P1-26 | app/admin/page.tsx 188-238 | the page | 40 |  | admin-b.md:L359 |
| src/features/admin/ui/BriefFlagsView.tsx | P1-25 | IntegrityFlagsView.tsx 65-99, 101-151 (minus the regenerate branch), 153-389 | stats, table with wrapping URL cell, view brief, mark resolved, replace URL, re-capture (P1-07) | 230 |  | admin-a.md:L279 |
| src/features/admin/ui/BulkImportView.tsx | P1-25 | BulkImportView.tsx 89-471 (minus 94, 393-402), 513-640 (table), 708-792 (pills) | CSV or JSON input, one options row (default jurisdiction), preview and commit over the kit | 420 |  | admin-a.md:L275 |
| src/features/admin/ui/CoverageCatalogueView.tsx | P1-25 | CoverageCatalogueView.tsx 40-153 | filters, sort, 200-row cap stated | 120 |  | admin-a.md:L286 |
| src/features/admin/ui/CoverageMatrixView.tsx | P1-25 | CoverageMatrixView.tsx 170-615, 719-762 | palette from tokens, rollup from the route, row selection as a button, bulk-add action | 480 |  | admin-a.md:L285 |
| src/features/admin/ui/DispatchPanel.tsx | P1-25 | CorpusTurnPanel.tsx 72-359 | corpus-turn queue and request; run one intake cycle, plan or apply (record-only); a topic-and-jurisdiction sweep dispatch replacing the scan form; results rendered in words, not raw JSON; authedFetch | 220 |  | admin-a.md:L282 |
| src/features/admin/ui/FactorsPage.tsx | P1-26 | factors/page.tsx 61-239 | the factors table on the ui-kit table | 120 |  | admin-b.md:L360 |
| src/features/admin/ui/FlagsQueue.tsx | P1-25 | redesign/FlagsRejectionsQueue.tsx 39-162 | three kinds, three counts (the rejections scalar added to the attention RPC by P1-26), no promise copy | 80 |  | admin-a.md:L278 |
| src/features/admin/ui/InferencesPage.tsx | P1-26 | inferences/page.tsx 10-71 | the inferences list, paged | 50 |  | admin-b.md:L361 |
| src/features/admin/ui/IngestRejectionsLog.tsx | P1-25 | IngestRejectionsView.tsx 54-337 | the triage stamp with a note; table scrolls horizontally | 180 |  | admin-a.md:L281 |
| src/features/admin/ui/IssueFilterCaption.tsx | P1-25 | IssueFilterCaption.tsx 11-68 | filter banner with a 44 px Clear | 45 |  | admin-a.md:L274 |
| src/features/admin/ui/IssuesRail.tsx | P1-25 | redesign/AdminIssuesRail.tsx 43-252 | eight rows, total is the sum, 44 px rows, rationale copy gone | 130 |  | admin-a.md:L273 |
| src/features/admin/ui/ItemCorrectionsPage.tsx | P1-26 | items/[id]/page.tsx 16-32 | the single-pane corrections screen | 25 |  | admin-b.md:L362 |
| src/features/admin/ui/JurisdictionReviewView.tsx | P1-25 | PendingJurisdictionReviewView.tsx 59-346 | residue after the deterministic classifier; confirm, classify with 44 px sibling picks, dismiss | 220 |  | admin-a.md:L284 |
| src/features/admin/ui/panel-kit.tsx | P1-25 | AdminTableView.tsx 44-120, 135-267, 292-367; AdminDashboard.tsx 896-1023; the per-view copies in section 5 | one family: SectionHeader with Refresh, ErrorBanner, StatusBanner, Toast, StatCell, FilterChip (44 px), Th, Td, EmptyState, HonestFrame; PanelFrame is P1-17's SectionCard with a head slot | 120 |  | admin-a.md:L269 |
| src/features/admin/ui/PartsIndexPage.tsx | P1-26 | parts/page.tsx 6-23 | the gallery index | 20 |  | admin-b.md:L363 |
| src/features/admin/ui/PlatformFlagsView.tsx | P1-25 | PlatformIntegrityFlagsView.tsx 44-119, 121-468 (row header as a button), 513-604 | categories from the vocabulary, status and note, keyboard-operable rows | 330 |  | admin-a.md:L280 |
| src/features/admin/ui/ResearchPipelineView.tsx | P1-25 | ResearchPipelineQueueView.tsx 66-101 (through a new `/api/admin/pipeline/drafts` read, P1-26), 108-283 | drafts with machine status; no retired domain labels; one column at 375 | 150 |  | admin-a.md:L287 |
| src/features/admin/ui/RuntimeViews.tsx | P1-25 | ErrorGroupsView.tsx 48-134; AssumptionRegisterPanel.tsx 56-210; InferenceReview.tsx 24-66 | three read-only tables over the kit; relative time through P1-17's RelativeTime | 260 |  | admin-a.md:L288 |
| src/features/admin/ui/StagedTransitView.tsx | P1-25 | AdminDashboard.tsx 728-806; ProvenanceFailures.tsx 24-183 | pending staged rows with grouped provenance failures; copy says machine-gated only | 150 |  | admin-a.md:L268 |
| src/features/admin/ui/StatutoryRowsUpload.tsx | P1-25 | StatutoryRowsUpload.tsx 83-275 | as is, over authedFetch and the kit | 200 |  | admin-a.md:L283 |
| src/features/admin/ui/TierDisagreementsView.tsx | P1-25 | TierOpinionDisagreementsView.tsx 66-181, 191-390 (as cards) | accept through the tier-override route then dismiss; reject dismisses; no defer | 260 |  | admin-a.md:L276 |
| src/features/admin/ui/UpcomingObligationsPanel.tsx | P1-25 | UpcomingObligationsPanel.tsx 71-185, 211-233 | kind and precision filters over the kit's FilterChip; formatEventDate from P1-16 | 170 |  | admin-a.md:L277 |
| src/features/admin/ui/useAdminFetch.ts | P1-25 | the ten loaders in section 3 rank 1 | `useAdminFetch(url, deps)` with one error contract | 40 |  | admin-a.md:L270 |
| src/features/admin/ui/useFlash.ts | P1-25 | the seven flash and toast timers in section 5 | one timed status | 15 |  | admin-a.md:L271 |
| src/features/admin/ui/WorkspacesOverview.tsx | P1-25 | OrganizationsTable.tsx 43-250; WorkspacesUsageRow.tsx 86-176 (rail form) | organisations RowTable with member count and roles; four StatBlocks with the Absence token for the pending figure; one `tallyRoles` | 190 |  | admin-a.md:L272 |
| src/features/assistant/api/route.ts | P1-24 | api/ask/route.ts 153-184 (guard, body), 260-304 (retrieval, now `runSearch` with the citation select), 306-317 (suppressed-claim redaction), 232-237 and 472-476 (source list, narrowed to the hit rows' sources), 247-259 and 346-432 (Operations facts, narrowed to the regions and states the hits name), 591-626 (citation stats), 40-44 (disclaimer); NOT 508-519 (the model call), NOT 53-94 and 481-493 (the prompts), NOT 537-580 (validation of generated prose), NOT 18, 36, 159-168 (key and enablement gates) | `POST /api/ask`: retrieve on the caller's client (the same hit set Standard Search returns), redact suppressed claims, assemble `{ question, hits: [{ item, summary, excerpt, source, tier, url, citationCount, recency }], skillPassages, operationsFacts, considerations, disclaimer }` where `skillPassages` are the sections of the embedded skill core whose headings match the question's terms, and `considerations` are the hit rows' own `intersection_summary` and `related_items` counts; no hits answers "the platform holds nothing on this; refine or search"; no model, no spend, no env gate | 150 |  | dash-search.md:L257 |
| src/features/assistant/ui/AskAssistant.tsx | P1-24 | components/AskAssistant.tsx 235-528 (panel, event, positioning), 63-227 (citation panel, as ListRow with the tier chip) | the panel: opened by the command bar's event, the question, the hit list with tier, count and recency, the skill passages, the Operations facts, the disclaimer; failure and empty as StateNote; close button at the law-2 floor | 320 |  | dash-search.md:L258 |
| src/features/auth/api/callback.ts | P1-01 | app/auth/callback/route.ts 21-60 | code exchange, ensureProfile, redirect | 35 |  | auth-db.md:L241 |
| src/features/auth/api/identity.ts | P1-01 | api/auth/identity/route.ts 41-69 | GET identity | 25 |  | auth-db.md:L240 |
| src/features/auth/api/invitation-revoke.ts | P1-01 | invitations/[id]/route.ts 11-61 | URL-scope read then rpc | 40 |  | auth-db.md:L246 |
| src/features/auth/api/invitation-token.ts | P1-01 | invitations/[token]/route.ts 11-50, accept 11-45, decline 11-44 | lookup, accept, decline sharing one regex and one rpc-error mapper | 80 |  | auth-db.md:L247 |
| src/features/auth/api/invitations-mine.ts | P1-01 | invitations/mine/route.ts 7-63 | my pending invitations | 45 |  | auth-db.md:L248 |
| src/features/auth/api/invitations.ts | P1-01 | invitations/route.ts 14-154 | invite with email result, list with lazy expiry | 90 |  | auth-db.md:L245 |
| src/features/auth/api/members.ts | P1-01 | members/route.ts 50-619 | list (bounded), role change, ban, remove, add by email | 240 |  | auth-db.md:L244 |
| src/features/auth/api/org.ts | P1-01 | api/orgs/[org_id]/route.ts 24-223 | GET org, PATCH name and slug, errors surfaced | 110 |  | auth-db.md:L243 |
| src/features/auth/api/orgs-create.ts | P1-01 | api/orgs/route.ts 8-62; orgs/create-org.mjs 13-112 | parse, `create_org_for_self`, settings and profile patches | 145 |  | auth-db.md:L242 |
| src/features/auth/ui/AuthFrame.tsx | P1-01 | components/auth/AuthFrame.tsx 43-250 | the frame; isoWeekNumber imported from P1-17 | 170 |  | auth-db.md:L249 |
| src/features/auth/ui/AuthPanel.tsx | P1-01 | components/auth/AuthPanel.tsx 11-184 | fields (44 px), tabs as Links, banners, check-email | 110 |  | auth-db.md:L250 |
| src/features/auth/ui/AuthProvider.tsx | P1-01 | components/auth/AuthProvider.tsx 130-260 | client context; header reduced to one paragraph | 110 |  | auth-db.md:L255 |
| src/features/auth/ui/identity-loader.ts | P1-01 | components/auth/identity-loader.ts 11-110 | bounded retry loader | 85 |  | auth-db.md:L256 |
| src/features/auth/ui/InvitationPage.tsx | P1-01 | app/invitations/[token]/page.tsx 17-27 | server gate | 15 |  | auth-db.md:L257 |
| src/features/auth/ui/LoginPage.tsx | P1-01 | app/login/page.tsx 37-180 | password and magic-link sign-in | 100 |  | auth-db.md:L251 |
| src/features/auth/ui/ResetPasswordPage.tsx | P1-01 | app/auth/reset-password/page.tsx 23-112 | request reset | 65 |  | auth-db.md:L253 |
| src/features/auth/ui/SignupPage.tsx | P1-01 | app/signup/page.tsx 43-210 | sign-up with already-registered notice | 120 |  | auth-db.md:L252 |
| src/features/auth/ui/UpdatePasswordPage.tsx | P1-01 | app/auth/update-password/page.tsx 18-122 | set new password | 70 |  | auth-db.md:L254 |
| src/features/community/api/_http.ts | P1-23 | 17 UUID_RE copies; 12 JSON blocks; 9 role pre-reads; member-pref-route.mjs 16-60 | `withCommunity`, `uuidParam`, `readJson`, `groupRole` (surfaces errors) | 40 |  | community-b.md:L254 |
| src/features/community/api/entity-threads.ts | P1-23 | entities/[entityId]/threads/route.ts 11-123 | threads by spine entity | 50 |  | community-b.md:L266 |
| src/features/community/api/group-invitations.ts | P1-23 | groups/[id]/invitations 17-94, invite-candidates 12-92, invite 9-128 | list, candidates, invite with notification | 120 |  | community-b.md:L261 |
| src/features/community/api/group-join.ts | P1-23 | join/route.ts 7-97 | public self-join; refuses a banned user; clears pending invitations with the error read | 40 |  | community-b.md:L258 |
| src/features/community/api/group-members.ts | P1-23 | members/route.ts 15-150 | roster, leave with the last-admin guard | 70 |  | community-b.md:L259 |
| src/features/community/api/group-prefs.ts | P1-23 | member-pref-route.mjs; group-member-prefs.mjs; star, mute routes | star and mute | 30 |  | community-b.md:L260 |
| src/features/community/api/group-settings.ts | P1-23 | settings/route.ts 8-132 | rename, describe, privacy; RLS-refused update is a 403, not `ok` | 55 |  | community-b.md:L257 |
| src/features/community/api/groups.ts | P1-23 | groups/route.ts 7-130 | create vertical group through a `create_group_for_self` rpc (owner admin row in the same transaction) | 70 |  | community-b.md:L256 |
| src/features/community/api/invitation-respond.ts | P1-23 | invitations/[id]/accept 10-90, decline 8-58, revoke 10-86 | accept through `accept_group_invitation` rpc, decline, revoke | 90 |  | community-b.md:L262 |
| src/features/community/api/moderation.ts | P1-23 | moderation/reports/route.ts 9-278; [id]/route.ts 12-415 | file, list (group filter in the query), act through `moderate_report` rpc (body, action, notes columns; ban record) | 200 |  | community-b.md:L268 |
| src/features/community/api/notifications.ts | P1-23 | notifications/route.ts, [id]/route.ts 42-96, counts/route.ts | list, mark one, mark all, grouped counts in SQL | 100 |  | community-b.md:L269 |
| src/features/community/api/post.ts | P1-23 | posts/[id]/route.ts 118-261 | author edit, delete | 60 |  | community-b.md:L264 |
| src/features/community/api/posts.ts | P1-23 | posts/route.ts 148-408 | list threads, create thread (guard, binding, anonymity, insert and links in one `create_thread` rpc) | 130 |  | community-b.md:L263 |
| src/features/community/api/profile.ts | P1-23 | profile/route.ts 1-67; profile/verify/route.ts 12-99 | own profile, corporate-email verification | 90 |  | community-b.md:L270 |
| src/features/community/api/replies.ts | P1-23 | replies/route.ts 71-266 | list (an honest `after` cursor), reply, notify parent author | 80 |  | community-b.md:L265 |
| src/features/community/api/search.ts | P1-23 | search/route.ts 29-177 | posts, groups, people | 90 |  | community-b.md:L271 |
| src/features/community/api/signoff.ts | P1-23 | posts/[id]/signoff 23-81; signoff/[id]/decide 31-201; withdraw 23-69 | request, decide (decision and stamp in one rpc), withdraw | 120 |  | community-b.md:L267 |
| src/features/community/lib/antitrust.ts | P1-23 | antitrust.mjs 13-23, 36-53, 131-145 | SENSITIVE_FIELDS, `refuseSensitivePost(field)`, `kAnonymity` (used by the directory floor) | 30 |  | community-b.md:L247 |
| src/features/community/lib/api.ts | P1-22 | api-client.ts 1-235 plus the 29 inline fetch sites | one typed client, one error shape | 180 |  | community-a.md:L231 |
| src/features/community/lib/entity-binding.ts | P1-23 | entity-binding.mjs 1-35 | validateEntityIds, shared by client and server | 20 |  | community-b.md:L248 |
| src/features/community/lib/identity-format.ts | P1-22 | identity-format.ts 1-58 | label and binding refusal | 25 |  | community-a.md:L232 |
| src/features/community/lib/identity.ts | P1-23 | identity.mjs 1-281; viewer.ts 1-24 | ORG_TYPES; the one author projection (name, company, role, sector, region, verified, anonymous) fed by the community_identity rpc and the member-profile fields; per-post and per-user anonymity; `authorIdForRow`; `communityViewer`; the identity and my_profile loaders | 90 |  | community-b.md:L246 |
| src/features/community/lib/labels.ts | P1-22 | ProfileForm.tsx 27-48; ReportPostMenu.tsx 21-28; ModerationQueue.tsx 74-81 | org-type, report-reason labels (regions from P1-23's module) | 40 |  | community-a.md:L234 |
| src/features/community/lib/org-key.ts | P1-23 | organisation-key.mjs 1-95; organisation-salt.ts 1-20 | free-mail list, corporate-domain check, HMAC key, salt resolution | 50 |  | community-b.md:L250 |
| src/features/community/lib/post-shape.ts | P1-23 | posts/route.ts 32-112; posts/[id]/route.ts 19-83; replies/route.ts 21-69 | one select, one PostRow, one `shapePost` | 50 |  | community-b.md:L255 |
| src/features/community/lib/profile-policy.ts | P1-23 | profile-policy.mjs 1-109; shell-context.ts 5-14 | `{code,label}` regions, sanitizeMemberWrite, projectOwnProfile | 60 |  | community-b.md:L249 |
| src/features/community/lib/rooms-view.ts | P1-23 | community/page.tsx 44-120, 246-451 | room view models: sign-off selection, author naming, ledger items per room, themes, roster presence | 150 |  | community-b.md:L252 |
| src/features/community/lib/rooms.ts | P1-23 | rooms.ts 1-140 | rooms, slugs, jurisdiction classifier (exact token, then ISO subdivision) | 70 |  | community-b.md:L251 |
| src/features/community/lib/shell-context.ts | P1-23 | shell-context.ts 16-172 | shell context; employer through P1-01 resolveMembership | 100 |  | community-b.md:L253 |
| src/features/community/lib/types.ts | P1-22 | types.ts 1-96; api-client.ts 89-154; PostComposer.tsx 32-61; CommunityRooms.tsx 62-139 | one type per concept | 80 |  | community-a.md:L233 |
| src/features/community/pages/BrowsePage.tsx | P1-23 | browse/page.tsx 59-239 | public directory by region | 80 |  | community-b.md:L275 |
| src/features/community/pages/DirectoryPage.tsx | P1-23 | directory/page.tsx 32-134 | peer-org counts from a SQL aggregate with the k floor | 60 |  | community-b.md:L276 |
| src/features/community/pages/DiscoverPage.tsx | P1-23 | discover/page.tsx 19-75 | entity discovery | 35 |  | community-b.md:L277 |
| src/features/community/pages/frame.ts | P1-23 | the seven page preambles | claims, redirect with return path, shell context, timing to the sink | 30 |  | community-b.md:L272 |
| src/features/community/pages/GroupPage.tsx | P1-23 | [slug]/page.tsx 38-273 | group page; errors are errors, not 404 | 100 |  | community-b.md:L274 |
| src/features/community/pages/ModerationPage.tsx | P1-23 | moderation/page.tsx 28-73 | moderation queue | 25 |  | community-b.md:L278 |
| src/features/community/pages/ProfilePage.tsx | P1-23 | profile/page.tsx 18-54 | profile; linked from the shell | 25 |  | community-b.md:L279 |
| src/features/community/pages/RoomsPage.tsx | P1-23 | community/page.tsx 134-508 | rooms home | 110 |  | community-b.md:L273 |
| src/features/community/ui/CommunityHome.tsx | P1-22 | CommunityShell.tsx 205-627 | pending group invitations with Accept/Decline, empty state, memberships (tiles are links), mounted on /community above or beside the rooms index (the page decides with P1-23) | 180 |  | community-a.md:L201 |
| src/features/community/ui/CommunityLayout.tsx | P1-22 | CommunityShell.tsx 64-203 | layout through the P1-18 shell's surface-nav slot (no global style hack); one Toast context; narrow-width drawer for the sidebar | 220 |  | community-a.md:L200 |
| src/features/community/ui/CommunitySidebar.tsx | P1-22 | CommunitySidebar.tsx 51-692 | sections, current-group highlight, per-group pills from the shared notifications store; no dead filter input (built as a working filter or not at all); topics either editable or not shown | 260 |  | community-a.md:L202 |
| src/features/community/ui/entities/EntityDiscovery.tsx | P1-22 | EntityDiscoveryPanel.tsx 66-261 | follows on this device, digest with an error state | 140 |  | community-a.md:L222 |
| src/features/community/ui/entities/EntityPicker.tsx | P1-22 | EntityPicker.tsx 45-250 | entity selection; copy within ADR-041 | 150 |  | community-a.md:L221 |
| src/features/community/ui/groups/GroupCard.tsx | P1-22 | GroupCard.tsx 42-408 | tile and join state machine | 150 |  | community-a.md:L210 |
| src/features/community/ui/groups/GroupGrid.tsx | P1-22 | BrowseGroupsGrid.tsx 35-113 | grid and empty state | 50 |  | community-a.md:L211 |
| src/features/community/ui/groups/GroupHeader.tsx | P1-22 | GroupHeader.tsx 54-470 | header, star and mute through one toggle | 180 |  | community-a.md:L212 |
| src/features/community/ui/groups/InviteDialog.tsx | P1-22 | GroupModals.tsx 685-1032 | candidate search, invite, pending, revoke | 200 |  | community-a.md:L215 |
| src/features/community/ui/groups/MembersDialog.tsx | P1-22 | GroupModals.tsx 159-452 | roster, leave | 150 |  | community-a.md:L213 |
| src/features/community/ui/groups/SettingsDialog.tsx | P1-22 | GroupModals.tsx 454-683 | name, description, privacy with downgrade warning | 130 |  | community-a.md:L214 |
| src/features/community/ui/MembersRail.tsx | P1-22 | CouncilMembersRail.tsx 22-201 | server rail with an honest error state | 110 |  | community-a.md:L223 |
| src/features/community/ui/moderation/ModerationActions.tsx | P1-22 | ModerationActions.tsx 46-402 | actions with ConfirmDialog | 150 |  | community-a.md:L225 |
| src/features/community/ui/moderation/ModerationQueue.tsx | P1-22 | ModerationQueue.tsx 83-614 | queue, filters, paging | 300 |  | community-a.md:L224 |
| src/features/community/ui/parts/{AuthorIdentity, RoleChip, Avatar, PrivacyPill, NoDirectMessaging}.tsx | P1-22 | AuthorIdentityChip 9-54, VerifierBadge 12-38, RoleBadge 6-38, GroupHeader 355-431, GroupModals 416-452, 1038-1091, Post 505-591, CouncilMembersRail 203-259, CommunitySidebar 694-745, GroupCard 343-408, NoDirectMessagingNotice 3-23 | shared Community parts | 190 |  | community-a.md:L230 |
| src/features/community/ui/PeerOrgDirectory.tsx | P1-22 | PeerOrgDirectoryTable.tsx 1-142 | aggregate tables | 90 |  | community-a.md:L229 |
| src/features/community/ui/posts/Post.tsx | P1-22 | Post.tsx 50-503 | card; replies with the identity projection and paging | 260 |  | community-a.md:L217 |
| src/features/community/ui/posts/PostComposer.tsx | P1-22 | PostComposer.tsx 84-388 | composer; sensitivity field as a choice, not a key | 200 |  | community-a.md:L218 |
| src/features/community/ui/posts/PostList.tsx | P1-22 | PostList.tsx 42-338 | feed with cursor paging | 160 |  | community-a.md:L216 |
| src/features/community/ui/posts/ReplyComposer.tsx | P1-22 | ReplyComposer.tsx 26-184 | reply form | 80 |  | community-a.md:L219 |
| src/features/community/ui/posts/ReportPostDialog.tsx | P1-22 | ReportPostMenu.tsx 42-355 | report button and dialog | 130 |  | community-a.md:L220 |
| src/features/community/ui/ProfileForm.tsx | P1-22 | ProfileForm.tsx 21-347 | identity declare and verify; sector from the taxonomy | 220 |  | community-a.md:L228 |
| src/features/community/ui/RegionTabs.tsx | P1-22 | CommunityRegionTabs.tsx 30-118 | region strip | 70 |  | community-a.md:L203 |
| src/features/community/ui/rooms/RoomsIndex.tsx | P1-22 | CommunityRooms.tsx 196-1185 | tiles (wrapping grid), thread table, composer with EntityPicker, join and leave by route | 360 |  | community-a.md:L206 |
| src/features/community/ui/rooms/SignoffRail.tsx | P1-22 | CommunityRooms.tsx 1198-1359 | request, withdraw, decide; copy without "citable" | 120 |  | community-a.md:L208 |
| src/features/community/ui/rooms/ThreadDisclosure.tsx | P1-22 | CommunityRooms.tsx 638-763 | body, cited system items, reply, cite a live item | 120 |  | community-a.md:L207 |
| src/features/community/ui/rooms/VerticalGroups.tsx | P1-22 | CommunityRooms.tsx 1391-1695, 1697-1758 | vertical groups list, create dialog, not-seeded state in customer words | 150 |  | community-a.md:L209 |
| src/features/community/ui/SearchBar.tsx | P1-22 | CommunitySearchBar.tsx 39-188 | search form, scopes, Cmd/Ctrl+K | 90 |  | community-a.md:L204 |
| src/features/community/ui/SearchResults.tsx | P1-22 | CommunitySearchResults.tsx 60-429 | grouped hits; a post hit links to the post anchor | 200 |  | community-a.md:L205 |
| src/features/corrections/api.ts | P1-10 | admin-api/logic.mjs 1-109; admin-api/handlers.ts 1-55 | list, create, revoke, error mapping, cache flush | 110 |  | flywheel-b.md:L261 |
| src/features/corrections/model.ts | P1-10 | item-corrections.mjs 1-231 | latest-wins planning, tombstones, removed tags, suppression matcher, orphans, validation, readers | 130 |  | flywheel-b.md:L259 |
| src/features/corrections/redact.ts | P1-10 | suppressed-render.mjs 1-118 | redaction of suppressed claims | 65 |  | flywheel-b.md:L260 |
| src/features/coverage/api/entries.ts | P1-06 | api/coverage/entries/route.ts 1-28 | admin entry list through requireAdmin | 20 |  | sources-b.md:L228 |
| src/features/coverage/client.ts | P1-06 | client.ts 1-85 | the three browser calls | 60 |  | sources-b.md:L224 |
| src/features/coverage/server/census.ts | P1-06 | index-data.ts 1-255 | one census read per build, entries and counts, only the columns mapped | 160 |  | sources-b.md:L222 |
| src/features/coverage/server/matrix-data.ts | P1-06 | matrix-data.ts 1-54; load-matrix.mjs 1-47 | cached matrix and denominators; outage never cached; the cause logged | 60 |  | sources-b.md:L223 |
| src/features/coverage/ui/CoveragePage.tsx | P1-06 | CoveragePageView.tsx 1-294 | typed page | 220 |  | sources-b.md:L225 |
| src/features/coverage/ui/DenominatorLine.tsx | P1-06 | CoverageDenominatorLine.tsx 1-8; CoverageDenominatorLineView.tsx 1-66 | the per-surface line | 55 |  | sources-b.md:L226 |
| src/features/coverage/ui/ExportButton.tsx | P1-06 | CoverageExportButton.tsx 1-53 | CSV download | 35 |  | sources-b.md:L227 |
| src/features/coverage/ui/useCoverageRequest.ts (coverage feature, id owed) | P1-17 | CoverageState.tsx 86-122 | the request action's fetch and phase | 20 |  | ui-kit.md:L271 |
| src/features/dashboard/api/coverage-matrix.ts and coverage-request.ts | P1-24 | api/dashboard/coverage/matrix/logic.ts 10-51, request/logic.ts 10-32; app/dashboard/coverage/page.tsx 14-22 | the two coverage routes and the page, on the coverage lib (the lane owning lib/coverage owes the id; moves there when it exists) | 60 |  | dash-search.md:L237 |
| src/features/dashboard/page.tsx | P1-24 | app/page.tsx 17-142 | the route: one instant, the read, enrichment over the selected rows, masthead and body | 70 |  | dash-search.md:L233 |
| src/features/dashboard/read.ts | P1-24 | lib/supabase-server.ts 877-893 (due next), 1213-1358 (backfill, override merge, id split), 2399-2498 (override rows, roster), 2516-2565 (feed row), 2830-2843 (window and feed), 2910-2947 (surface-routing enrichment), 2964-2985 (backfill of missing changed ids, audit date), 1383-1467 (aggregates), 1500-1533 (surface counts), lib/dashboard/surface-coverage.ts 65-111 (rpc counts) | `readDashboard(orgId, now)`: due-next rpc, recent-changes rpc with the rule-16 window, item_changelog for the changed ids, by-id backfill with the override merge, aggregates, regulations band counts, all-surface counts; three reads for the rows, two for the counts; every failure is a typed `{ error, trigger }`, never an empty that looks like data | 330 |  | dash-search.md:L231 |
| src/features/dashboard/rows.ts | P1-24 | lib/dashboard/brief-rows.ts 41-256; lib/dashboard/row-fields.ts 10-86 (if the lists lane does not take it) | corpus merge, Due-next and What-changed selection, prefix, window label, card state, audit date, `dueInfo`, `jurisdictionCode`, `metaLine` | 170 |  | dash-search.md:L232 |
| src/features/dashboard/ui/DashboardBrief.tsx | P1-24 | components/dashboard/DashboardBrief.tsx 98-461 | band tiles with the `?band=` contract, Due next, What changed (failed, empty, rows), rail with the surface counts, themes, the watchlist card, the Portfolios entry, `LegendRailCard`; `RowActionsMenu` from the ui-kit | 240 |  | dash-search.md:L234 |
| src/features/dashboard/ui/DashboardMasthead.tsx | P1-24 | components/dashboard/DashboardMasthead.tsx 51-90; brief-title.ts 1-15 | the personalised masthead with the Absence reasons "pending" and "not in primary source" only | 55 |  | dash-search.md:L235 |
| src/features/dashboard/ui/WatchlistRailCard.tsx | P1-24 | components/home/DashboardWatchlist.tsx 65-127; components/home/DashboardRailCard.tsx 19-48 (as StateNote) | three watched rows on ui-kit parts; the empty state is StateNote | 70 |  | dash-search.md:L236 |
| src/features/drain/kinds.ts | P1-15 | kinds 1-221 | the six kinds (plus `theme-classification`), batch shape, exporter function per kind, `applyStep` naming the P1-08 dispatcher step | 150 |  | producers.md:L312 |
| src/features/drain/plan.ts | P1-15 | plan-drain 1-311; artifact 1-72 | plan (switch first, export, stale selection, lease, batch), finish (release, artifact), CLI parse; exporters called in-process | 230 |  | producers.md:L313 |
| src/features/flywheel/corpus-pass.ts | P1-09 | analyze-corpus.mjs 20-385 | `corpusPass(deps, { dry })`: intersections, cluster, theme run row with delta, gaps and anticipated flags, shared-entity adoption, flag resolutions; guarded client only; records its outcome in the run artifact (rule 17) | 220 |  | flywheel-a.md:L237 |
| src/features/flywheel/run-discovery.ts | P1-09 | run-discovery.mjs 22-52; discover-for-items.mjs 54-66, 133-163 | `runConnectionDiscovery(sb, itemId)` (the mint and update entry, rule 17) and `discoverForItems(sb, { ids, since })` | 90 |  | flywheel-a.md:L236 |
| src/features/flywheel/tag-pass.ts | P1-09 | propose-tags.mjs 187-420; apply-tags.mjs 444-575 (the CLI half, through runCli) | `tagPass(deps, { ids, since })`: derive, decide, adopt, flag; then `runConnectionDiscovery` for every touched item | 180 |  | flywheel-a.md:L238 |
| src/features/flywheel/term-pass.ts | P1-09 | scripts/term-recurrence.mjs 20-186; raise-term-needs.mjs 8-147 | `termPass(deps)`: count, adopt, record, then raise and close term-need flags by rule | 180 |  | flywheel-a.md:L239 |
| src/features/flywheel/theme-brief-seam.ts | P1-09 | generate-theme-brief.mjs 53-101 | `parseBriefPayload`, `validateAgainstLiveMembers` (member hash), the `session-executor` stamp; writes through scripts/turns/apply-theme-briefs (the one writer) | 60 |  | flywheel-a.md:L240 |
| src/features/harness/live-smoke-record.mjs (P1-08) | P1-12 | emit-live-smoke-artifact 17-124 | report to artifact, landed in process | 70 |  | runtimes-a.md:L278 |
| src/features/health/api/spend.ts | P1-06 | api/health/spend/route.ts 1-137; logic.ts 1-39 | worker-secret spend probe and its body | 70 |  | sources-b.md:L234 |
| src/features/health/api/surfaces.ts | P1-06 | api/health/surfaces/route.ts 1-212 | worker-secret probe counting through surface_of | 110 |  | sources-b.md:L233 |
| src/features/intake/api/run.ts | P1-03 | api/agent/run/route.ts 1-140 | POST start with the admin gate, verified short-circuit, one-hour cooldown, both fail-closed; accepts the injected payload reference | 70 |  | intake-a.md:L334 |
| src/features/intake/change-sweep-drain.ts | P1-04 | run-intake-cycle.ts 187-319 | drain marked change-sweep update_item rows; $0 re-verify; re-validate; checked stamps | 80 |  | intake-b.md:L216 |
| src/features/intake/cli/ground-injected.ts | P1-04 | executor-ground.mjs 13-31 | the FREE injected-ledger grounding entry with checked reads | 20 |  | intake-b.md:L227 |
| src/features/intake/cycle.ts | P1-04 | run-intake-cycle.ts 11-60, 321-490; pool-row-contract.mjs 1-25 | plan mode (dry), apply mode: stage, mint, record-only pool row by default; brief grade only through the injected-brief seam | 130 |  | intake-b.md:L215 |
| src/features/intake/flywheel-participation.ts | P1-04 | flywheel-steps.mjs 1-107; mint-enrichment.ts 33-64; flywheel-defect.ts 8-67; apply-staged-update.ts 114-192; mint-item.ts 269-445 | one step list (lineage, discovery, forward events with 307-key dedupe and stale report, compliance sync, entities, title timeline, seek-study and low-relevance flags) run for `context: mint` or `context: update` with the changed fields; every write checked; defect flags deduped on (item, step) | 170 |  | intake-b.md:L214 |
| src/features/intake/mint.ts | P1-04 | mint-item.ts 20-266 | pure gates (idempotency, congruence, dedup over the FULL non-archived corpus via paginate, relevance, domain, format_type, source link), dry boundary, the single INSERT, then one call to participation | 200 |  | intake-b.md:L213 |
| src/features/intake/pipeline.ts | P1-03 | canonical-pipeline.ts 898-940 (injected synthesis), 1062-1177 (writeSynthesizedBrief), 1370-1402 (generateBriefFromInjected), 1484-1599 (harvestItemTimeline, sectionBrief), 2295-2335 (registerBriefSources, growSources), 338-388 (flag surfacing) | `injectBrief`, `writeBrief` (the one write site), `sectionBrief`, `harvestTimeline`, `registerBriefSources`, `growSources`, `surfaceCaptureExclusions`, `surfaceNullTierHosts` | 250 |  | intake-a.md:L332 |
| src/features/intake/portal-ledger.ts | P1-04 | portal-harvest.ts 8-533; promote-cap.mjs 12-18 | batched persist, RPC-only keyset page, consume with a verdict source (session file or rule), dry pre-pass, capped promote, checked stamps | 210 |  | intake-b.md:L217 |
| src/features/intake/quarantine/erase.ts | P1-04 | tombstone-delete.mjs 21-106 | tombstone then delete, bucket allowlist, content-emptiness gate (deterministic, replacing the Haiku census gate) | 70 |  | intake-b.md:L226 |
| src/features/intake/quarantine/id-stamp.ts | P1-04 | id-stamp.mjs 19-66 | id-confirm-and-stamp step with a keyed lookup | 35 |  | intake-b.md:L225 |
| src/features/intake/quarantine/planner.ts | P1-04 | plan-quarantine-disposition.mjs 31-139, 144-158 | dwell classification, reason classes, deferral candidates; run recording handed to P1-08 | 110 |  | intake-b.md:L223 |
| src/features/intake/quarantine/rehome.ts | P1-04 | free-pass-run.mjs 19-106 | $0 floor-first re-attribution step | 60 |  | intake-b.md:L224 |
| src/features/intake/quarantine/resolver.ts | P1-04 | regen-quarantined.mjs 13-62 | cheap re-verify per quarantined item, checked re-validate, returns ids | 40 |  | intake-b.md:L222 |
| src/features/intake/record-facts/extract.ts | P1-04 | record-facts.mjs 14-25, 205-321, 346-394, 431-737, 746-837 | prose guard, one walker, one claim constructor, specialised extractors, `buildRecordFacts` with one claim per slot | 120 |  | intake-b.md:L219 |
| src/features/intake/record-facts/payload.ts | P1-04 | record-facts.mjs 845-1010; record-facts-research.mjs 193-277 | stub full_brief (markers refused), record payload, research profile without the duplicate pair; the `item.*` lift is kept only for fields a writer persists (section 8, Rulings to settle) | 120 |  | intake-b.md:L220 |
| src/features/intake/record-facts/triggers.ts | P1-04 | record-facts.mjs 55-190, 408-424, 490-503, 577-579, 685-686, 772-788; record-facts-research.mjs 14-31, 39-104 | every trigger table as data, the slot families, EU-act slot list, URL-bearing slots | 140 |  | intake-b.md:L218 |
| src/features/intake/staged-transit.ts | P1-04 | apply-staged-update.ts 24-44, 95-99, 194-344; run-intake-cycle.ts 371-412 (stage and stamp) | `applyStagedUpdate` with an explicit update_item column allowlist; entity gate; `stageCandidate`; `stampDisposition` that checks `error` and reports a failed stamp | 150 |  | intake-b.md:L212 |
| src/features/intake/workflow.ts | P1-03 | generate-brief.ts 1-59 (step scaffolding), 60-88 (recordRun, cost 0), 90-143 (preflight: pause and data-audit block only), 178-204 (register, section), 205-264 (ground with the ladder), 268-336 (grow, link, audit baseline and gate), 371-431 (erase), 479-521 (revalidate), 522-616 (the workflow) | the durable free workflow: inject, register, section, ground, grow, link, audit gate, erase on the dwell bound, revalidate; every step writes its agent_runs row | 220 |  | intake-a.md:L333 |
| src/features/intake/write-item.ts | P1-04 | write-item.ts 1-329 | the ordered write sequence and row builders | 200 |  | intake-b.md:L221 |
| src/features/learning/questions-on-change.ts + emitting-tables/*.json | P1-15 | questions-on-change 1-216 | entry-file registry, event type and change text, entity-to-items reader, raise questions with the 25-item cap, outbox replay reader | 130 |  | producers.md:L311 |
| src/features/learning/signpost-scoring-deps.ts | P1-15 | prediction-scoring 345-488 | the reads and guarded writes over the service client, without the migration-tolerance branches | 80 |  | producers.md:L309 |
| src/features/learning/signpost-scoring.ts | P1-15 | prediction-scoring 1-343 | rules (outcome by direction, deadline, ledger rows, event matching), the step (fires, repair, lifecycle repair, deadline, scoring ledger-first), metrics | 230 |  | producers.md:L308 |
| src/features/learning/trigger-questions.ts | P1-15 | trigger-questions 1-198; constants 1-67 | surfaces for a domain, four builders, flag row, dedup-before-insert writer, mint-time main; constants kept: PRODUCT_QUESTIONS, TRIGGER_EVENT_TYPES, QUESTION_ACQUISITION | 140 |  | producers.md:L310 |
| src/features/lists/api/remainder.ts (list surfaces; id owed) | P1-23 | listings/rest/route.ts 77-147; logic.ts 1-47 | remainder for Operations and Regulations with the paged walk | 70 |  | community-b.md:L280 |
| src/features/lists/category.ts | P1-18 | supabase-server.ts 2178-2270 | category routed reads, paged, failure surfaced | 30 |  | shell-list.md:L281 |
| src/features/lists/counts.ts | P1-18 | supabase-server.ts 1383-1533 | aggregates and surface counts, null on failure | 55 |  | shell-list.md:L280 |
| src/features/lists/map-rows.ts | P1-18 | supabase-server.ts 985-1180 | row type, mapper, chunked timelines with a per-chunk failure count | 95 |  | shell-list.md:L279 |
| src/features/lists/read.ts | P1-18 | supabase-server.ts 706-983, 3008-3143, 3210-3251 | `readListing({ orgId?, rpc, page })` returning rows, archived, overrides when org-scoped, and `failed` | 95 |  | shell-list.md:L278 |
| src/features/map/region-coverage.ts | P1-06 | coverage-gaps.ts 1-81; coverage-gaps-rollup.ts 1-88 | renamed getRegionCoverage over jurisdiction_iso; a failed read is an error state, not a cached all-gap | 95 |  | sources-b.md:L229 |
| src/features/map/ui/RegisterRow.tsx (P1-19..24, map surface, id owed) | P1-17 | ListRow.tsx 139-142, 225-260, 556-668 | the jurisdiction register row and its header, map only | 80 |  | ui-kit.md:L283 |
| src/features/market/calc/indexation.ts, oem-payload.ts, reroute.ts | P1-15 | indexation 1-44; oem-payload 1-70; reroute 1-32 | computeIndexedValue, computePayloadPenalty, tcoCrossoverBand (refusal), applyFuelBurnMultiplier, compoundingChain | 90 |  | producers.md:L323 |
| src/features/market/lib/carbon.ts | P1-20 | carbon-intensity.mjs 1-60; carbon-cost-per-feu.mjs 1-164; select-modal-factor.mjs 23-104; resolve-item-corridor.mjs 24-135; carbon-overlay-view.mjs 1-195; app/market/page.tsx 72-114 | carbonIntensity, carbonCostPerFeu with named gaps, one `selectFactor`, resolveItemCorridor over corridor-scope's parser, buildCarbonOverlayView, buildCarbonCostPerFeuView, buildCarbonCostOverlays; gap copy without internal producer names | 250 |  | market.md:L257 |
| src/features/market/lib/deltas.ts | P1-20 | series-deltas.mjs 1-126 | computeSeriesDeltas with the four states, DELTA_WINDOWS | 75 |  | market.md:L251 |
| src/features/market/lib/freshness.ts | P1-20 | series-freshness.mjs 1-81 | cadenceNameForDays (fallback corrected to the longest period not longer than the cadence), deriveSeriesFreshness, summarizeBoardFreshness | 35 |  | market.md:L252 |
| src/features/market/lib/headline.ts | P1-20 | series-family.mjs 1-180; headline-series-select.mjs 1-156 | families, resolveSeriesFamily, selectHeadlineSeries (cap 5, fold, order) | 140 |  | market.md:L253 |
| src/features/market/lib/lead-time.ts | P1-20 | lead-time-position.mjs 1-96 | buildLeadTimePosition, DEFAULT_MIN_SAMPLE | 45 |  | market.md:L255 |
| src/features/market/lib/rail-select.ts | P1-20 | market-rail-select.mjs 1-90 | summariseCarbonCorridors, selectNextDataDrops | 35 |  | market.md:L256 |
| src/features/market/lib/registry.ts | P1-20 | series-registry.mjs 1-252 | six producers as data: keyPrefix, familyClass, implemented, cadenceDays, sourceKey, producer and parser paths; `producerFor`, `prefixOf`, `isImplementedSeriesKey`; name, URL, licence and attribution from data_sources | 70 |  | market.md:L249 |
| src/features/market/lib/ribbon-model.ts | P1-20 | MarketComparativeRibbon.tsx 108-244 | deltaCellModel, absentCell, sparklineModel, the absence-state labels and SDMX codes | 70 |  | market.md:L254 |
| src/features/market/lib/series-board.ts | P1-20 | series-board-view-model.mjs 13-199; refresh-published-price-statistics.mjs 54-73 (addDaysIso, latestPerSeries) | latestPerSeries, buildSeriesBoard (groups, states, unregistered bucket, deltas), display row type | 95 |  | market.md:L250 |
| src/features/market/lib/signal-promotion.ts | P1-20 | signal-promotion.mjs 1-78 | derivePromotionState | 45 |  | market.md:L258 |
| src/features/market/producers/carrier-ets-surcharge.ts | P1-15 | carrier-ets 19-134 | ground, rate per carrier host, build rows, cross-carrier band (never blended without a range), spec with `enabled: false` and the ruling | 75 |  | producers.md:L318 |
| src/features/market/producers/ecb-fx.ts | P1-15 | ecb-fx 24-194 | quote- and order-agnostic Cube parser, envelope checks, four-currency vocabulary, spec | 110 |  | producers.md:L314 |
| src/features/market/producers/eea-hdv-roadmaps.ts + classification.json | P1-15 | eea-hdv-map 1-181; eea-hdv-co2 19-47, 59-180 | fetch with Range, aggregate, classify, stage from latest year, residue, plan, spec with `enabled: false` | 250 |  | producers.md:L320 |
| src/features/market/producers/eia-petroleum-spot.ts | P1-15 | eia 33-141 | product vocabulary, period and unit checks, series key, spec with the key gate | 85 |  | producers.md:L315 |
| src/features/market/producers/eu-oil-bulletin.ts | P1-15 | fetch-oil-bulletin 17-159, 161-231; eu-weekly-oil-bulletin 38-41 | page link scrape with fallback, xlsx download, sheet resolution through oil-bulletin-workbook (P1-19/20), `--since`, CSV to rows, spec | 140 |  | producers.md:L316 |
| src/features/market/producers/market-series-delta.ts | P1-15 | author-market-series-delta 1-157 | 1-week delta edge authorship, trace, fail-closed assert, summary | 110 |  | producers.md:L319 |
| src/features/market/producers/published-price-statistics.ts | P1-15 | refresh 28-32, 67-150; ratify 15-90 | ratified map to display rows, keyed upsert on (item_id, label), ratify from a mint artifact | 150 |  | producers.md:L322 |
| src/features/market/producers/rows-file-producers.ts | P1-15 | oem-roadmap 15-112; grid-queue 15-83; reroute 23-109; grid-queue 89-154 (the one main) | three row validators and one rows-file driver (grid-queue is written to an Operations table through the same driver) | 230 |  | producers.md:L321 |
| src/features/market/producers/sbti-targets.ts | P1-15 | sbti 28-312 | licence block, name-resolved header, Excel serial dates, aggregation contract (Other status, survivorship first, months), spec with `licenceBlock` | 190 |  | producers.md:L317 |
| src/features/market/read.ts | P1-20 | supabase-server.ts 2260-2262, 2272-2376, 3596-3758; data.ts 969-1032; [slug]/page.tsx 128-315; IndexationPanel.tsx 7-26, ReroutingPanel.tsx 6-24, OemRoadmapPanel.tsx 6-24 | listMarketSignals (cached public RPC plus price statistic), readSeriesBoard (per-series window, not a whole-table cap), readSbtiRows, loadMarketDetailBundle (convergence with its error surfaced, price board, factors with licences, corridors, series figure with source rating), readPanelRows (failure distinct from empty) | 260 |  | market.md:L259 |
| src/features/market/ui/CarbonCostOverlay.tsx | P1-20 | CarbonCostOverlay.tsx 1-265 | corridor cards, badge from tokens, range or named gaps | 150 |  | market.md:L265 |
| src/features/market/ui/HeadlineSeries.tsx | P1-20 | MarketComparativeRibbon.tsx 1-107, 252-606 | headline card, tiles, cells, sparkline svg, freshness, one drawer | 210 |  | market.md:L261 |
| src/features/market/ui/LeadTimeChart.tsx | P1-20 | LeadTimeChart.tsx 1-89 | bars, median, not forecastable | 60 |  | market.md:L266 |
| src/features/market/ui/MarketLedger.tsx | P1-20 | MarketIntelLedger.tsx 29-355 | list surface, kind facet and sort in the URL contract, rail cards | 190 |  | market.md:L260 |
| src/features/market/ui/PolicyTimeline.tsx | P1-20 | MarketPolicyTimeline.tsx 21-37 | scope from URL facets to the obligations strip | 17 |  | market.md:L268 |
| src/features/market/ui/Provenance.tsx | P1-20 | SeriesProvenance.tsx 1-170 | FigureEnvelope with sourceTier for every adapter (series rows read the rating of their data_sources / sources row), drawer, fields | 120 |  | market.md:L264 |
| src/features/market/ui/SeriesBoard.tsx | P1-20 | MarketSeriesBoard.tsx 1-257 | producer cards, series rows, watch, badge, drawer, unregistered bucket; 44 px drawer summary | 150 |  | market.md:L262 |
| src/features/market/ui/SeriesFreshness.tsx | P1-20 | SeriesFreshness.tsx 1-130 | tones from tokens, panel, badge | 90 |  | market.md:L263 |
| src/features/market/ui/Spec09Panels.tsx | P1-20 | OemRoadmapPanelView.tsx 1-59; ReroutingPanelView.tsx 1-62; IndexationPanelView.tsx 1-66 | three panel bodies on the ui-kit SpecPanel shell; corridor names, not ids; no repo paths or codes in copy | 150 |  | market.md:L269 |
| src/features/market/ui/TrajectoryBars.tsx | P1-20 | TrajectoryBars.tsx 1-75 | trajectory bars from tokens, title from the actual point count | 50 |  | market.md:L267 |
| src/features/mint/apply.ts | P1-14 | apply-mint-batch.mjs 98-120, 204-241, 298-494; reopen-validation-holds.mjs 27-97 | M4 at insert, source via P1-05 `registerAndRate`, item insert, intake `writeGroundingSequence`, compensating delete, verdict read-back, census disposition (`reconciled` only on `minted_verified`; hold with reason otherwise), reopen by stated reason | 300 |  | mint.md:L208 |
| src/features/mint/build-payload.ts | P1-14 | run-mint-batch.mjs 122-172 | one record payload per exported row via intake's `buildRecordPayload`, `census_id` carried on the row | 60 |  | mint.md:L206 |
| src/features/mint/heal/brief-honest.ts | P1-14 | heal-provenance.mjs 2029-2225 | plan and apply the sentence or middle-clause strip of an unprovable figure, accepted only when Gate A then finds no orphan | 150 |  | mint.md:L213 |
| src/features/mint/heal/ground.ts | P1-14 | heal-provenance.mjs 613-993, 1585-1614, 1787-1858, 2239-2266 | one position-preserving normaliser with a value-preserving numeric fold; GROUND, RESOURCE across own-canonical, tier-qualifying and corpus-pool buckets; orphan grounding | 180 |  | mint.md:L210 |
| src/features/mint/heal/label.ts | P1-14 | heal-provenance.mjs 2276-2404, 2622-2641, 3094-3173, 3558-3599 | relabel paragraphs, re-kind an unverifiable FACT to ANALYSIS without rewriting its text (ruling below), required-slot FACT to GAP | 150 |  | mint.md:L212 |
| src/features/mint/heal/run.ts | P1-14 | heal-provenance.mjs 2845-2907, 2946-3006, 3601-3634 | per-item orchestration: capture, ground, slots, own-body institution, resource, source, orphans, brief-honest, relabel, Gate A with Gate B from the DB lookup, re-derive touch, unarchive | 120 |  | mint.md:L214 |
| src/features/mint/heal/source.ts | P1-14 | heal-provenance.mjs 1884-2014, 3232-3482 | orphan figure: candidate cited URLs, classify (already registered, registerable through the class table, worklist), capture through P1-07, register-and-rate through P1-05, ground verbatim, one-hop same institution | 220 |  | mint.md:L211 |
| src/features/mint/preflight.ts | P1-14 | validate-mint-payload.mjs 24-292, 373-492 | kit checks the DB lacks: capture completeness, unicode integrity, record purity, record_hollow with the series exemption, screen verdict present and on_vertical; tag-presence warning | 220 |  | mint.md:L207 |
| src/features/mint/run.ts | P1-14 | run-mint-batch.mjs 477-647; apply-mint-batch.mjs 517-709 | one runtime: select, screen, identity (P1-03/04), capture (P1-07), build, preflight, apply, then hand off to the flywheel (P1-09/10) with exactly the minted ids in the same run; the run opens and closes one ledger row (P1-08) with inputs, outputs and outcome; cache flush including community | 110 |  | mint.md:L209 |
| src/features/mint/screen-rules.data.ts | P1-14 | screen-rules.mjs 64-821 | the 4 CELEX roots and 114 rules as data, each with an explicit `verdict` and its ruling citation | 600 |  | mint.md:L205 |
| src/features/mint/screen.ts | P1-14 | screen-rules.mjs 1-62, 823-909; lib/screen-verdict.mjs 1-24; screen-reconcile-records.mjs 20-77 | `classifyRelevance`, `screenVerdictFor` reading the screen-verdict table, `isMintable`, reconcile live record items | 140 |  | mint.md:L204 |
| src/features/mint/select.ts | P1-14 | export-census-rows.mjs 674-797, 1416-1456; lib/instrument-identity.mjs 1-19; apply-mint-batch.mjs 70-120 | select would_mint rows, one held index and one `isHeld(row)` predicate (key, then URL with identity), limit with the ceiling | 90 |  | mint.md:L203 |
| src/features/mint/types.ts | P1-14 | payload-schema.json; item-type-required-slots.json (read from the table) | `MintPayload`, `CensusRow`, `Hold`, outcome vocabulary | 20 |  | mint.md:L215 |
| src/features/notices/api.ts (consumer of P1-10's superseded-notices) | P1-23 | notices/route.ts 48-96; logic.ts 1-34; resolve-watched-entities.ts 28-84 | org-watchlist notices; errors logged, not swallowed | 90 |  | community-b.md:L281 |
| src/features/obligations/api/register.ts | P1-16 | register/route.ts 51-137 | GET register, both variants, meta on first load, resolveItemId from core/db | 60 |  | obligations.md:L204 |
| src/features/obligations/api/upcoming.ts | P1-16 | upcoming/route.ts 56-140 | GET upcoming, scope once, 503 on failure instead of an empty 200 (ruling to settle, below) | 65 |  | obligations.md:L205 |
| src/features/obligations/derive/classify-binding-position.ts | P1-16 | classify-binding-position.mjs 1-165; derive-obligations.mjs 48-94 | the rule table as data, matchRules, classifyInstrumentIdentity, classifyBindingPosition, contextFromClaims, classifyItemBindingPosition (the order) | 150 |  | obligations.md:L196 |
| src/features/obligations/derive/compliance-deadline.ts | P1-16 | compliance-deadline-sync.mjs 1-56; dispatch-extraction.mjs 84-103 | pickComplianceDeadline, syncComplianceDeadline taking the writer (service client or guarded) | 40 |  | obligations.md:L199 |
| src/features/obligations/derive/derive-objects.ts | P1-16 | derive-obligation-objects.mjs 1-211 | buildObjectRow, planObligationObjects, deriveObligationObjects; vocabularies imported, not mirrored; a derivation_version on the row | 150 |  | obligations.md:L198 |
| src/features/obligations/derive/derive-register.ts | P1-16 | derive-obligations.mjs 96-302 | deriveObligationRow, deriveObligationRows, filterNewRows, buildContextByItem, deriveRegister with the optional reads surfaced, not swallowed | 140 |  | obligations.md:L197 |
| src/features/obligations/extract/date-grammar.ts | P1-16 | extract-forward-events.mjs 7-145 | months EN and PT, separators, parseDateFragment, tryParseDateAt, tryParseDateOrBareYearAt, `locateCalendarDate(span)` for the context predicate | 100 |  | obligations.md:L187 |
| src/features/obligations/extract/dedupe.ts | P1-16 | extract-forward-events.mjs 1172-1279 | compareNormalize, sameObligationContent, dedupeEvents | 50 |  | obligations.md:L191 |
| src/features/obligations/extract/extract-forward-events.ts | P1-16 | extract-forward-events.mjs 1-1, 1294-1456 | EXTRACTOR_VERSION, extractForwardEvents with one `toEvent`; a spanless claim and an empty section land in `skipped` | 50 |  | obligations.md:L192 |
| src/features/obligations/extract/read-extraction-input.ts | P1-16 | read-and-extract.mjs 25-83, 89-146, 274-318 | reference dates, row mappers, conditional pool read, attachDueDateContext, readExtractionInput | 80 |  | obligations.md:L193 |
| src/features/obligations/extract/rules.ts | P1-16 | extract-forward-events.mjs 637-844 | DEONTIC, AIM_WORDS, RULES, CANDIDATE_ONLY_RULES, COMMENCEMENT_CLAUSE_RE, STATUS_ONLY_RE, the two refusal predicates and their reasons | 130 |  | obligations.md:L189 |
| src/features/obligations/extract/scan.ts | P1-16 | extract-forward-events.mjs 850-1166 | scanText with one `emitOrSkip`, the slot-claim helpers, rescueSlotDateWithContext | 150 |  | obligations.md:L190 |
| src/features/obligations/extract/verbatim-in-source.ts | P1-16 | read-and-extract.mjs 168-193, 233-268, 333-338 | claimNeedsDueDateContext (via locateCalendarDate), itemIdsNeedingContext, enforceSectionVerbatimInSource, readAndExtractForwardEvents | 40 |  | obligations.md:L194 |
| src/features/obligations/extract/window.ts | P1-16 | extract-forward-events.mjs 151-605 | assertVerbatim, one boundary scanner (replaces clauseStart, sentenceStart and the trailing cut), selectDateCell, normalizeObligationText, the record-facts unwrap, clauseAround | 220 |  | obligations.md:L188 |
| src/features/obligations/extract/write-forward-events.ts | P1-16 | flywheel-steps.mjs 14-17, 54-105 (P1-14 owns the file; the insert moves here); dispatch-extraction.mjs 69-81; mint-enrichment.ts 51-56 | `insertForwardEvents(client, itemId, events)`: the migration-307 key, stale-row report, 23505 as zero-new; the one writer every caller uses | 60 |  | obligations.md:L195 |
| src/features/obligations/jobs/derive-obligations.ts | P1-16 | derive-obligations.mjs 203-213, 304-322; scripts/maintenance/derive-obligations.mjs 1-80 (the wrapper merges in) | the job entry: candidates file, dry or apply, summary with read-back | 60 |  | obligations.md:L206 |
| src/features/obligations/jobs/extract-backfill.ts | P1-16 | dispatch-extraction.mjs 1-113 | items with zero events, chunked, insert through write-forward-events, compliance_deadline through derive/compliance-deadline, resumable | 80 |  | obligations.md:L207 |
| src/features/obligations/jobs/run-extraction.ts | P1-16 | run-extraction.mjs 41-130, 203-301 | loadCorpus, itemId, runExtraction with metrics, the CLI; the artifact through P1-08's shared envelope | 150 |  | obligations.md:L208 |
| src/features/obligations/kinds.ts | P1-16 | forward-events/kind-labels.mjs 1-8; read-upcoming.mjs 1-10; ObligationRegisterFilterBar.tsx 116-123 and UpcomingObligationsPanel.tsx 38 (their copies retire) | EVENT_KINDS, DEFAULT_KINDS, KIND_LABELS, PRECISIONS | 15 |  | obligations.md:L186 |
| src/features/obligations/read/rail-select.ts | P1-16 | obligation-rail-select.mjs 1-54 | utcDayStart, daysFrom, selectObligationRailRows | 25 |  | obligations.md:L203 |
| src/features/obligations/read/register-facets.ts | P1-16 | read-register.mjs 173-186, 491-611 | matchesDueWindow, emptyRegisterFacets, fetchRegisterFacetOptions, tallyRegisterFacets, fetchForwardEventCount | 70 |  | obligations.md:L201 |
| src/features/obligations/read/register-read.ts | P1-16 | read-register.mjs 6-37, 56-135, 147-171, 320-489 | spec builder, next-due segments, page planner, trim and flatten, applyRegisterFilters, one paged read (list and detail) with errors surfaced | 190 |  | obligations.md:L200 |
| src/features/obligations/read/upcoming-read.ts | P1-16 | read-upcoming.mjs 12-231 | defaultJurisdictionFilter, jurisdictionMatches, modeMatches, resolveScope, scopeLabel, buildUpcomingEventsQuerySpec, selectUpcoming, readUpcoming with the scope filter in the query where PostgREST allows (jurisdiction_iso overlaps on the item join) and errors surfaced | 120 |  | obligations.md:L202 |
| src/features/onboarding/pages (onboarding, workspace-new) | P1-02 | app/onboarding/page.tsx 16-34; app/workspace/new/page.tsx 15-30 | the two server gates | 30 |  | workspace.md:L266 |
| src/features/onboarding/ui/InvitationLandingPage.tsx | P1-02 | components/onboarding/InvitationLandingPage.tsx 30-238 | the per-token page with try on accept and decline | 170 |  | workspace.md:L265 |
| src/features/onboarding/ui/NoWorkspaceLanding.tsx | P1-02 | components/onboarding/NoWorkspaceLanding.tsx 54-389 | job title, invitations, token, create organisation; pending states and try on every fetch | 300 |  | workspace.md:L262 |
| src/features/onboarding/ui/OnboardingStepper.tsx | P1-02 | components/onboarding/OnboardingStepper.tsx 13-61 | the four pills, tokens only | 45 |  | workspace.md:L264 |
| src/features/onboarding/ui/OnboardingWizard.tsx | P1-02 | components/onboarding/OnboardingWizard.tsx 82-304, 308-422, 464-516, 582-633 | steps 2 to 4 and done with ui-kit chips, `maxWidth`, the server `nowIso` | 420 |  | workspace.md:L263 |
| src/features/operations/ask-context.ts (to the assistant route owner when its id exists) | P1-21 | operations-ask-context.mjs 1-142 | Operations data block | 70 |  | research-ops.md:L280 |
| src/features/operations/calc/auxiliary-energy.ts, grid-queue.ts | P1-15 | auxiliary-energy 1-52; grid-queue 1-36 | kWh, gCO2e, ratio; the p90 gate | 55 |  | producers.md:L329 |
| src/features/operations/ingest/bls-oews.ts | P1-21 | bls-oews-parser.mjs 1-115 | OEWS series ids and parser, occupation list extensible to spec 04's nine SOC codes | 60 |  | research-ops.md:L272 |
| src/features/operations/ingest/envelope.ts | P1-21 | regional-facts-envelope.mjs 1-125; state-cost-facts-envelope.mjs 1-109 | envelope row, state cost row, origin class from tier, one planUpsert | 60 |  | research-ops.md:L273 |
| src/features/operations/ingest/eurostat-lc-lci-lev.ts | P1-21 | eurostat-lc-lci-lev-parser.mjs 1-108 | labour cost levels, member geos passed in | 50 |  | research-ops.md:L271 |
| src/features/operations/ingest/eurostat-nrg-pc-205.ts | P1-21 | eurostat-nrg-pc-205-parser.mjs 49-104 | electricity price parser reading the payload's tax dimension and status flags | 50 |  | research-ops.md:L270 |
| src/features/operations/ingest/json-stat.ts | P1-21 | eurostat-nrg-pc-205-parser.mjs 1-47 | JSON-stat 2.0 decoder | 40 |  | research-ops.md:L269 |
| src/features/operations/model/dimensions.ts | P1-21 | operations-matrix.ts 5-33; OperationsLedger.tsx 77-123 | the seven dimensions: db key, name, D number, count word | 40 |  | research-ops.md:L262 |
| src/features/operations/model/labour-chain.ts | P1-21 | labour-chain.ts 1-236 | chain with per-hour and one-currency checks | 120 |  | research-ops.md:L266 |
| src/features/operations/model/matrix-eligibility.ts | P1-21 | operations-matrix.ts 128-284; OperationsDetailSurface.tsx 146-170 | S3/S4 gate over the item's full jurisdiction list, one rendered omit note | 90 |  | research-ops.md:L267 |
| src/features/operations/model/region-grid.ts | P1-21 | region-grid.mjs 1-184, 198-263 | grid, gate, index, implied base, headline split, labels | 120 |  | research-ops.md:L264 |
| src/features/operations/model/region-resolve.ts | P1-21 | region-crosswalk.mjs 13-27; operations-matrix.ts 96-126 | regionsForItem | 25 |  | research-ops.md:L263 |
| src/features/operations/model/statements.ts | P1-21 | statements.mjs 1-205 | statements with a dropped-verdict count | 110 |  | research-ops.md:L265 |
| src/features/operations/producers/neso-carbon-intensity.ts | P1-15 | neso 12-88, 101-176 | 14-day stats URL, midnight-aligned blocks, envelope observations, data_sources and regions checks, spec with `enabled: false` | 120 |  | producers.md:L325 |
| src/features/operations/producers/operator-rows.ts | P1-15 | auxiliary-energy 9-66; indexation-producer 10-79 | one CSV producer for the two kept tables, org-stamped by the caller, indexation worked example | 70 |  | producers.md:L328 |
| src/features/operations/producers/regional-envelope.ts | P1-15 | run-envelope 1-100; bls 13-51; eurostat-lc 12-63; eurostat-nrg 12-35 | observations to envelope rows, latest per natural key, region resolution, three dataset specs (BLS, Eurostat labour cost, Eurostat electricity) | 160 |  | producers.md:L326 |
| src/features/operations/producers/state-cost-facts.ts | P1-15 | state-cost 17-233 | ground, rate, region resolution, plan, write, jurisdiction entity authorship, spec with `enabled: false` | 150 |  | producers.md:L327 |
| src/features/operations/producers/ukpn-heatmap.ts | P1-15 | ukpn 12-198, 213-242 | catalogue licence gate, attachment selection, release-file mapping with envelopes, source by registry identity, `--register-source`, spec | 220 |  | producers.md:L324 |
| src/features/operations/read/operations-reads.ts | P1-21 | supabase-server.ts 3315-3594, 2268-2270; data.ts 1010-1014, 1043-1050; operations/page.tsx 19-32; operations/[slug]/page.tsx 108-226 | public items, roster, coverage with notes, facts with freshness, state cost facts with labels, detail bundle (related via the shared helper, matrix gate, claim tiers) | 170 |  | research-ops.md:L268 |
| src/features/operations/routes (page, [slug]/page) | P1-21 | app/operations/page.tsx, [slug]/page.tsx | thin route files | 70 |  | research-ops.md:L281 |
| src/features/operations/ui/LabourChain.tsx | P1-21 | LabourChain.tsx 42-175 | chain render with a cause per gap | 90 |  | research-ops.md:L277 |
| src/features/operations/ui/OperationsDetail.tsx | P1-21 | OperationsDetailSurface.tsx 49-461 | profile body, spec-09 sections in the index | 260 |  | research-ops.md:L278 |
| src/features/operations/ui/OperationsList.tsx | P1-21 | OperationsLedger.tsx 42-566 minus dead code | list on the shared shell, dimension in the URL, remainder failure stated | 260 |  | research-ops.md:L274 |
| src/features/operations/ui/RegionMatrix.tsx | P1-21 | RegionDimensionMatrix.tsx 122-1075 | matrix card, default selection, roving grid, constant panel, compare mode, labour drill-down, freshness shown on each fact | 450 |  | research-ops.md:L275 |
| src/features/operations/ui/Spec09Panels.tsx | P1-21 | AuxiliaryEnergyPanel*.tsx, GridQueuePanel*.tsx | two server panels, ui-kit tokens, carbon figure joined from grid intensity when present | 140 |  | research-ops.md:L279 |
| src/features/operations/ui/StatementsBlock.tsx | P1-21 | StatementsBlock.tsx 29-195 | statements card | 120 |  | research-ops.md:L276 |
| src/features/portfolio/api/support.ts | P1-24 | lib/portfolio/route-support.ts 13-46 | caller resolution and response mapping, `refuse(status, message)` shared with the watchlist route | 35 |  | dash-search.md:L246 |
| src/features/portfolio/client.ts | P1-24 | lib/portfolio/client.ts 16-56 | the five browser calls; a parse failure is a stated error | 40 |  | dash-search.md:L248 |
| src/features/portfolio/core.ts | P1-24 | lib/portfolio/portfolio-core.mjs 1-386 | rules and service, as TypeScript; `ilike` escaped or replaced by `name_key` equality (migration 362 stores `name_key`); `Rollup` typed once | 240 |  | dash-search.md:L244 |
| src/features/portfolio/pages | P1-24 | app/dashboard/portfolio/page.tsx 15-33, [id]/page.tsx 17-37 | the two pages | 50 |  | dash-search.md:L252 |
| src/features/portfolio/read.ts | P1-24 | lib/portfolio/read.ts 37-172 | index and detail view models; the override read's failure surfaced as the detail's error state; the cap imported from the dashboard read | 120 |  | dash-search.md:L245 |
| src/features/portfolio/types.ts | P1-24 | lib/portfolio/types.ts 3-50 | view-model types, `PortfolioRollupView = ReturnType<typeof computeRollup>` | 30 |  | dash-search.md:L247 |
| src/features/portfolio/ui/PortfolioAddSearch.tsx | P1-24 | components/portfolio/PortfolioAddSearch.tsx 55-223 | add by search through `useItemSearch`, coverage line per result | 180 |  | dash-search.md:L251 |
| src/features/portfolio/ui/PortfolioDetailView.tsx | P1-24 | components/portfolio/PortfolioDetailView.tsx 88-366 | roll-ups, groups, entity rows, manage card, viewer read-only; `RowActionsMenu`; one surface vocabulary | 300 |  | dash-search.md:L250 |
| src/features/portfolio/ui/PortfolioIndexView.tsx | P1-24 | components/portfolio/PortfolioIndexView.tsx 52-213 | the list and the create form on ui-kit `TextInput`; a missing id after create is a stated error | 160 |  | dash-search.md:L249 |
| src/features/regulations/BindingBanner.tsx | P1-19 | BindingBanner.tsx 30-228 | binding banner | 170 |  | regulations.md:L324 |
| src/features/regulations/CorridorsApplied.tsx | P1-19 | CorridorsAppliedStrip.tsx 1-29; CorridorsAppliedStripView.tsx 1-95 | corridors this applies on | 80 |  | regulations.md:L329 |
| src/features/regulations/DismissedStash.tsx | P1-19 | DismissedStash.tsx 21-120 | dismissed regulations, wrapped titles | 70 |  | regulations.md:L330 |
| src/features/regulations/map/centroids.ts | P1-19 | jurisdictionCentroids.ts 1-37 | centroids keyed by ISO code | 70 |  | regulations.md:L333 |
| src/features/regulations/map/MapPage.tsx (with P1-17's planned RegisterRow, ui-kit.md section 8) | P1-19 | MapPageView.tsx 40-517 | ISO-keyed register, region chips from ISO groups, coverage layer, working region filter | 300 |  | regulations.md:L331 |
| src/features/regulations/map/MapView.tsx | P1-19 | MapView.tsx 19-280 | Leaflet with visible attribution | 150 |  | regulations.md:L332 |
| src/features/regulations/map/read.ts | P1-19 | supabase-server.ts 3146-3262; data.ts 592-631 | one cached public read of regulation rows for the map | 40 |  | regulations.md:L335 |
| src/features/regulations/map/rollup.ts | P1-19 | jurisdiction-rollup.ts 1-46 | counts by ISO code | 20 |  | regulations.md:L334 |
| src/features/regulations/map/route.tsx | P1-19 | app/map/page.tsx 1-94 | map route | 40 |  | regulations.md:L336 |
| src/features/regulations/ObligationRegister.tsx | P1-19 | ObligationRegister.tsx 72-183; ObligationRegisterFilterBar.tsx 71-487 | register with list and item variants, three coverage states, an error state for a failed seed | 300 |  | regulations.md:L326 |
| src/features/regulations/ObligationRegisterPage.tsx | P1-19 | ObligationRegisterPageView.tsx 28-210 | register page with the shared facet rail | 120 |  | regulations.md:L327 |
| src/features/regulations/OwnerCard.tsx | P1-19 | OwnerTeamCard.tsx 29-174 | owner select at 44 px; org-less is not a failure | 90 |  | regulations.md:L328 |
| src/features/regulations/pages (index, [slug], register, two loading files) | P1-19 | app/regulations/** | routes; one segment array for the detail meta | 148 |  | regulations.md:L321 |
| src/features/regulations/RegulationDetail.tsx | P1-19 | RegulationDetailSurface.tsx 103-674 | detail body; obligation events fetched with an error state; Full depth renders the fact document's sections by key, never the raw full_brief | 380 |  | regulations.md:L323 |
| src/features/regulations/RegulationsLedger.tsx | P1-19 | RegulationsLedger.tsx 52-355 | list surface with an error state for the remainder (P1-17's remainder hook surfaces failure) | 190 |  | regulations.md:L322 |
| src/features/regulations/useItemRelevance.ts | P1-19 | BindingBanner.tsx 109-124; shell/RelevanceBadgeClient.tsx (P1-18) fetch | one relevance fetch per item shared by the banner and the badge | 25 |  | regulations.md:L325 |
| src/features/research/assessment-producer.ts | P1-15 | research-assessment 26-288, 311-409 | input narrowing, hasChanged, row shape, OpenAlex DOI resolution, run with signposts and re-pointing, live candidate selection, spec | 300 |  | producers.md:L331 |
| src/features/research/authority-score.ts | P1-15 | authority-score 1-340 | role class, standings, funding independence, reception, integrity, bucket, aggregate (src no longer imports scripts) | 180 |  | producers.md:L330 |
| src/features/research/model/assess.ts | P1-21 | assess.mjs 1-404; scripts/research/authority-score.mjs (imported, ported by its own owner) | corridors, horizon cascade with the R1 fix, refusal, evidence score, authority distribution, signposts, status token | 180 |  | research-ops.md:L249 |
| src/features/research/model/assessment-view.ts | P1-21 | read-assessments.mjs 1-107; read-signposts.mjs 1-57, 79-107 | ASSESSMENT_COLUMNS, view model, by-item map, corridorLabel, horizon label, refusal text, predicate summary including `basis` | 110 |  | research-ops.md:L250 |
| src/features/research/model/taxonomy.ts | P1-21 | taxonomy.mjs 1-177 | themes, severities, fixed pattern order, `now` passed in | 80 |  | research-ops.md:L251 |
| src/features/research/read/research-reads.ts | P1-21 | data.ts 927-942, 1004-1008, 1034-1041; supabase-server.ts 1749-1793, 2264-2266; research/page.tsx 34-61; research/[slug]/page.tsx 114-263; read-signposts.mjs 68-77, 120-144 | public items (cached), source coverage, assessments batch, detail bundle (related via the shared helper, claim tiers, assessment, signposts, history), errors surfaced to a fallback state, never dropped | 200 |  | research-ops.md:L252 |
| src/features/research/routes (page, [slug]/page) | P1-21 | app/research/page.tsx, [slug]/page.tsx | thin route files | 70 |  | research-ops.md:L261 |
| src/features/research/ui/AssessmentCard.tsx | P1-21 | ResearchFindingDetailSurface.tsx 465-542 | horizon assessment rail card, customer wording | 70 |  | research-ops.md:L256 |
| src/features/research/ui/AssessmentHistory.tsx | P1-21 | AssessmentHistoryLedger.tsx 25-106 | append-only chain | 50 |  | research-ops.md:L259 |
| src/features/research/ui/CredibilityChips.tsx | P1-21 | CredibilityChipAuthority.tsx, CredibilityChipEvidence.tsx, CredibilityChipShared.tsx, credibility-grade-modifiers.mjs | two chips per assessment (stored evidence score, stored authority distribution), one GRADE ledger | 150 |  | research-ops.md:L260 |
| src/features/research/ui/DissentPanel.tsx | P1-21 | DissentPanel.tsx 31-124 | always-open dissent | 50 |  | research-ops.md:L257 |
| src/features/research/ui/ResearchDetail.tsx | P1-21 | ResearchFindingDetailSurface.tsx 34-437 | detail body on the shared detail shell | 300 |  | research-ops.md:L255 |
| src/features/research/ui/ResearchList.tsx | P1-21 | ResearchLedger.tsx 30-480 | list on the shared list shell; theme and window in the URL | 260 |  | research-ops.md:L253 |
| src/features/research/ui/SignpostList.tsx | P1-21 | SignpostList.tsx 30-76 | signposts with the watched entity's label | 35 |  | research-ops.md:L258 |
| src/features/research/ui/ThemeFacetRow.tsx | P1-21 | ResearchThemeCards.tsx 42-151 | theme pills, +N new, Unclassified | 70 |  | research-ops.md:L254 |
| src/features/research/walker.ts | P1-15 | research-walker 28-205, 264-299, 303-436 | normalise works, search topic and open needs, grey-lit and publisher rating by class and host verdicts, mint through the chokepoint (dry or apply by the gates), run kind, spec | 250 |  | producers.md:L332 |
| src/features/search/api/route.ts | P1-24 | api/search/route.ts 29-58 | GET on the caller's client | 20 |  | dash-search.md:L254 |
| src/features/search/page.tsx and ui/SearchResultsView.tsx | P1-24 | app/search/page.tsx 16-42; components/search/SearchResultsView.tsx 40-105 | the page and the results view | 95 |  | dash-search.md:L256 |
| src/features/search/run-search.ts | P1-24 | api/search/logic.ts 1-98; api/ask/route.ts 260-283 (the same two steps) | `runSearch(client, q, { maxRows, select })` typed from `SupabaseClient`, the one retrieval for the command bar, the page, the portfolio add card, the admin item picker and the Assistant | 45 |  | dash-search.md:L253 |
| src/features/search/use-item-search.ts | P1-24 | components/portfolio/PortfolioAddSearch.tsx 80-107; components/ui/CommandBar.tsx 251 (P1-17 keeps its bar; the hook moves here) | `useItemSearch(q)`: debounce, abort, hits, searching, error | 40 |  | dash-search.md:L255 |
| src/features/settings/lib/patch-workspace-settings.ts | P1-02 | BriefingScheduleSection.tsx 136-154; OrganisationProfileSection.tsx 139-154; settingsStore.ts 65-100 | `patchWorkspaceSettings(client, orgId, column, patch)`: read, merge key-wise, write, return the error | counted in the store | handoff | workspace.md:L272 |
| src/features/settings/page.tsx | P1-02 | app/settings/page.tsx 14-40 | server gate | 30 |  | workspace.md:L271 |
| src/features/settings/state/settings-store.ts | P1-02 | stores/settingsStore.ts 14-60, 138-189, 206-261 | region toggles, sort, export, alert priorities; loaded once per org from the workspace store; key-wise jsonb merge; the legacy key readers become a one-shot data step | 120 |  | workspace.md:L270 |
| src/features/settings/ui/BriefingScheduleSection.tsx | P1-02 | components/settings/BriefingScheduleSection.tsx 67-289 | cadence, day, time, weights; orgId from the workspace store; write result checked | 170 |  | workspace.md:L267 |
| src/features/settings/ui/OrganisationProfileSection.tsx | P1-02 | components/settings/OrganisationProfileSection.tsx 75-236 | roles and size through `patchWorkspaceSettings` | 170 |  | workspace.md:L268 |
| src/features/settings/ui/SupersessionHistory.tsx | P1-02 | components/settings/SupersessionHistory.tsx 17-79 | the list with token colours and item links | 60 |  | workspace.md:L269 |
| src/features/shell/ui/CommandBar.tsx (P1-18) | P1-17 | CommandBar.tsx 118-776; commandBarKeyboard.ts 1-87 | search, dropdown, Enter, Ask; a failed search says so (StateNote error variant); the listbox and option chrome come from the kit (ListRow, Skeleton, StateNote) | 280 |  | ui-kit.md:L306 |
| src/features/shell/ui/CommandBar.tsx (from P1-17) | P1-18 | ui/CommandBar.tsx 118-776; commandBarKeyboard.ts 1-87 | the one search and ask bar composed into the Masthead slot; a failed search says so | counted by P1-17 (280, ui-kit.md section 8) | handoff | shell-list.md:L252 |
| src/features/sources-admin/ui/CanonicalQueue.tsx | P1-06 | CanonicalSourceReview.tsx 94-607 | stats, filters, bulk approve with an accessible modal and honest copy, groups through ui ItemGroup, the editor per candidate | 260 |  | sources-b.md:L214 |
| src/features/sources-admin/ui/ConnectionPairsView.tsx | P1-06 | IntersectionDetectionView.tsx 15-317 | pairs by band from the route, basis chips, summaries | 170 |  | sources-b.md:L215 |
| src/features/sources-admin/ui/ConnectionThemesView.tsx | P1-06 | ThemesView.tsx 16-296 | themes by band from the route, member links to item detail, brief | 170 |  | sources-b.md:L216 |
| src/features/sources-admin/ui/ProvisionalCard.tsx | P1-06 | ProvisionalReviewCard.tsx 62-178 | the editor bound to /api/admin/sources/promote | 90 |  | sources-b.md:L213 |
| src/features/sources-admin/ui/ProvisionalQueue.tsx | P1-06 | ProvisionalReviewTable.tsx 38-385 | artboard-13 queue; pipeline note without the empty placeholder | 200 |  | sources-b.md:L211 |
| src/features/sources-admin/ui/RegenerationNote.tsx | P1-06 | B2RegenerationNote.tsx 22-81 | the strip; a failed read says it failed | 40 |  | sources-b.md:L218 |
| src/features/sources-admin/ui/ScrapeScheduleStrip.tsx | P1-06 | SourceAdminControls.tsx 14-217 | cadence off, weekly, monthly with start date; emergency stop; an error state when the GET fails | 110 |  | sources-b.md:L209 |
| src/features/sources-admin/ui/SourceClassificationEditor.tsx | P1-06 | ProvisionalReviewCard.tsx 180-446; CanonicalSourceReview.tsx 609-944 | one editor: tier (seeded by classTierForHost), domains, jurisdictions, modes, topics, notes, approve/reject/defer, bias-tag preview from stored tags | 180 |  | sources-b.md:L212 |
| src/features/sources-admin/ui/SourceRegistryCard.tsx | P1-06 | SourceHealthDashboard.tsx 256-529 | card shell, view tabs (no fake counts), facet row, filter, view switch, strips | 180 |  | sources-b.md:L205 |
| src/features/sources-admin/ui/SourceRow.tsx | P1-06 | SourceHealthDashboard.tsx 40-254 | expandable row: tier, name, trust score, domains, metrics, monitoring info, the action pane | 110 |  | sources-b.md:L206 |
| src/features/sources-admin/ui/SourceRowActions.tsx | P1-06 | SourceAdminControls.tsx 219-400 | pause, fetch now, regenerate, visibility; 44 px; one useFlash | 110 |  | sources-b.md:L207 |
| src/features/sources-admin/ui/TierLegend.tsx | P1-06 | SourceTierLegend.tsx 28-262 | legend, facet, definitions overlay with focus trap and return, 44 px targets | 150 |  | sources-b.md:L210 |
| src/features/sources-admin/ui/TierOverrideControl.tsx | P1-06 | SourceAdminControls.tsx 402-861 | base, effective and override tiers, set or revert with reason, audit list; an "ambiguous" action that raises an integrity flag | 170 |  | sources-b.md:L208 |
| src/features/sources-admin/ui/useAdminFetch.ts (+ stat grid from P1-17) | P1-06 | IntersectionDetectionView.tsx 74-140; ThemesView.tsx 83-139; CanonicalSourceReview.tsx 122-139 | one loader with loading, error, empty | 30 |  | sources-b.md:L217 |
| src/features/sources/api/check-sources.ts | P1-07 | route.ts 36-81 (guard, limiter, limit parse, OFF gate, window gate) | POST handler: workerAuthGuard, limiter, `validateCheckLimit` inline, isGloballyPaused, scrapeWindowOpen, then runChangeDetection | 30 |  | capture.md:L169 |
| src/features/sources/axes.ts (home P1-05; ported by this lane's register) | P1-04 | classify-source.mjs 9-82; jurisdiction.mjs 16-65; scope.mjs 4-156; expected-output.mjs 11-61; vocab.mjs 17-74; routing.mjs 64-100 | Axis 3/4/5 classifiers, defaults, observed distribution, drift | 260 |  | intake-b.md:L233 |
| src/features/sources/change.ts | P1-05 | amendment-diff.mjs 1-125; reconcile.ts 1-213; change-sweep.mjs 68-176 | provision diff, intelligence_changes writer, reconcile pass, staged_updates bridge with every read error checked | 210 |  | sources-a.md:L303 |
| src/features/sources/classify-sources.ts (home P1-05) | P1-04 | propose-classifications.mjs 39-302; apply-classifications.mjs 104-133, 180-371, 413-480, 579-623 | one deterministic job: compute, decide, write sources, adopt observed on drift, record a born-resolved audit row | 150 |  | intake-b.md:L234 |
| src/features/sources/growth.ts | P1-05 | source-growth.ts 1-584; tier-opinion-writer.ts 1-92; cited-host-gate.mjs 1-19 | registration (existing, class tier, worklist), unique citation edges, convergence, reputation recompute, opinions only from an explicit estimate or the class table, pool-host registration over fetchAllRows, entry citations, the cited-host gate | 290 |  | sources-a.md:L304 |
| src/features/sources/holdings-audit.ts | P1-05 | holdings-audit.mjs 1-134, 157-176 | publisher shape, structural truncation, completeness, sufficiency | 90 |  | sources-a.md:L302 |
| src/features/sources/null-tier.ts | P1-05 | null-tier-host-worklist.mjs 20-68 | the null-tier host flag write and resolve plans | 40 |  | sources-a.md:L307 |
| src/features/sources/provisional.ts | P1-05 | promote-provisional.ts 1-104 | promoted row builder, canonical-URL dedup | 50 |  | sources-a.md:L306 |
| src/features/sources/review-queue.ts (P1-05 home) | P1-26 | lib/admin/provisional-review-queue.ts 1-8 | the queue population constant | 5 |  | admin-b.md:L367 |
| src/features/sources/snapshot-verify.ts | P1-05 | verify-item.mjs 1-151; cheap-verify.mjs 1-64; holdings-gate.mjs 1-34 | verify against the stored snapshot, stale flag, holdings present; needs_acquire becomes a capture request | 120 |  | sources-a.md:L301 |
| src/features/sources/snapshots.ts | P1-05 | snapshot-store.mjs 1-106; content-change.mjs 1-30; freshness-probe.mjs 1-56 | raw_fetches read and write (the writer gets a caller: P1-07 capture), fingerprint, freshness through the hold gate | 120 |  | sources-a.md:L300 |
| src/features/sources/verify-candidate.ts | P1-05 | verification.ts 1-98, 333-464, 566-978 | canonicalise, reachability, class placement, exact-host duplicate check with its error checked, language, vertical fit, insert at class tier or provisional, audit row | 190 |  | sources-a.md:L305 |
| src/features/sources/vertical-fit-gate.ts | P1-05 | vertical-fit-gate.ts 1-54 | off-vertical negative list, paginated, fail closed for unattended callers | 35 |  | sources-a.md:L308 |
| src/features/sources/walkers/feed.ts | P1-05 | feed-discovery.mjs 1-61; feed-walk.mjs 20-70 | feed discovery and walk | 65 |  | sources-a.md:L310 |
| src/features/sources/walkers/portal-links.ts | P1-05 | portal-links.mjs 1-47 | portal deep links | 40 |  | sources-a.md:L312 |
| src/features/sources/walkers/register.ts | P1-05 | register-walk.mjs 1-172 | EUR-Lex OJ and Federal Register walks | 100 |  | sources-a.md:L311 |
| src/features/sources/walkers/sitemap.ts | P1-05 | sitemap-walk.mjs 1-623 | robots, fallback, bounded fan-out, scope, diff, coverage-complete snapshot | 290 |  | sources-a.md:L309 |
| src/features/sources/walkers/xml.ts | P1-05 | feed-walk.mjs 7-18; sitemap-walk.mjs 23-29, 167-171 | strip, inner | 25 |  | sources-a.md:L313 |
| src/features/statutory/cli.ts | P1-10 | write-statutory.mjs 62-224; validate-statutory-rows-file.mjs 16-39 | `write` and `validate` subcommands; harness record through P1-08 | 70 |  | flywheel-b.md:L247 |
| src/features/statutory/data/fueleu-annex-i-iv-constants.json | P1-10 | fixtures/fueleu-annex-i-iv-statutory-constants-2026-09-06.json | reference data with verbatim quotes | 111 |  | flywheel-b.md:L248 |
| src/features/statutory/rows.ts | P1-10 | statutory-rows.ts 10-344 | rows-file validation, parse, per-input filing gate, compute, entity mint, idempotent insert | 200 |  | flywheel-b.md:L246 |
| src/features/telemetry/api/error.ts | P1-07 | api/telemetry/error/route.ts 11-44 | POST ingest | 30 |  | capture.md:L172 |
| src/features/telemetry/api/revalidate.ts (or core/cache/api) | P1-07 | api/revalidate/route.ts 34-65; api/cache/revalidate-item/route.ts 21-48 (its caller, generate-brief.ts 472-500, posts `tags: [itemTag(id), INTEL_ITEMS_TAG]`) | one POST `{ tags }`, worker secret, limiter, 1 to 50 tags, wrapped in withErrorCapture | 35 |  | capture.md:L181 |
| src/features/telemetry/api/version.ts | P1-07 | api/version/route.ts 13-22 | GET build identity, public by documented exception | 10 |  | capture.md:L176 |
| src/features/turns/brief-queue.mjs | P1-12 | brief-export/queue 1-181, read-brief-export-queue 1-105 | queue row writer (ids and part paths, not pool text), pending list, one-row resolve | 70 |  | runtimes-a.md:L277 |
| src/features/turns/kinds/*/AUTHORING.md | P1-12 | record-briefs/README, question-answers/README, needs-search/README, ledger-verdicts/README | the authoring rules a session lane reads, history removed | 250 |  | runtimes-a.md:L279 |
| src/features/turns/kinds/forward-events/{export,apply,tickets}.mjs | P1-12 | export-corpus 1-87, 254-380, 421-541 (default mode); apply-extraction-output 12-191; consume-turn-requests 1-385 | corpus export, event loader on the 307 key, ticket selection and consumption | 320 |  | runtimes-a.md:L275 |
| src/features/turns/kinds/needs-search/{validate,needs,apply}.mjs | P1-12 | needs-search/schema 1-151, needs-search/data 1-165, apply-need-urls 37-185 | need-URL validator, need assembly, apply | 390 |  | runtimes-a.md:L274 |
| src/features/turns/kinds/question-answers/{validate,material,apply}.mjs | P1-12 | question-answers/schema 1-222, question-answers/data 9-399, apply-question-answers 39-224, export-questions 45-109 | answers validator, material and bundle, apply | 550 |  | runtimes-a.md:L272 |
| src/features/turns/kinds/record-briefs/apply.mjs | P1-12 | apply-record-briefs 98-1230 | plan, item grade and pool hash gate, the 11 steps as data, unscoped flywheel, revalidate | 380 |  | runtimes-a.md:L269 |
| src/features/turns/kinds/record-briefs/export.mjs | P1-12 | export-corpus-for-extraction 88-130, 180-292, 392-533 (pool-text mode) | brief-authoring parts with pool, pool hash, slots, events, timelines, char budget, not_exported | 150 |  | runtimes-a.md:L270 |
| src/features/turns/kinds/record-briefs/validate.mjs | P1-12 | record-briefs/schema 101-1051 minus 319-375 and 454-547 | the eight pre-write mirrors, claim and entry validation, criterion 5 | 420 |  | runtimes-a.md:L268 |
| src/features/turns/kinds/theme-briefs/apply.mjs | P1-12 | apply-theme-briefs 31-118 | theme_briefs writer and read-back (probe removed) | 110 |  | runtimes-a.md:L276 |
| src/features/turns/kit/budget.mjs | P1-12 | io-preflight 7-34, 78-133, 215-256; apply-record-briefs 812-955 (budget parts) | cooldown from harness_runs, in-flight guard, byte budget and stop reason | 80 |  | runtimes-a.md:L267 |
| src/features/turns/kit/fixture-db.mjs | P1-12 | needs-search/fixture-deps 1-52, question-answers/fixture-deps 1-49 (plus P1-13 theme-briefs/fixture-deps) | one in-memory database: eq, in, like, limit, guarded writes, rpc hook | 120 |  | runtimes-a.md:L266 |
| src/features/turns/kit/session-batch.mjs | P1-12 | export-needs 14-118, export-questions 19-166, apply-need-urls 26-36, 186-294, apply-question-answers 27-38, 225-326, apply-theme-briefs 19-29, 120-195, needs-search/artifact 1-22, question-answers/artifact 1-28 | runExport, runApply, CLI parse, credential gate, recordRun, crash-versus-no-op rule | 220 |  | runtimes-a.md:L265 |
| src/features/watchlist/api/route.ts | P1-24 | api/watchlist/route.ts 39-109 (params, builders), 122-151 (list), 163-217 (single), 222-306 (add), 310-360 (remove); api/watchlist/logic.ts 6-25; lib/watchlist-scope.ts 1-18 | GET list and single, POST, DELETE; team-only and viewer gates; the six-value vocabulary; `revalidateTag` scoped to the caller's org entries | 150 |  | dash-search.md:L239 |
| src/features/watchlist/links.ts | P1-24 | lib/watchlist-links.ts 3-57 | labels and hrefs, null for types with no surface | 35 |  | dash-search.md:L241 |
| src/features/watchlist/membership.ts | P1-24 | lib/watchlist/membership.ts 59-64, 94-148 | `lookupWatchMembership`, `getClientWatchMembership` caching successes only, `authedFetch` passed directly | 40 |  | dash-search.md:L240 |
| src/features/watchlist/page.tsx | P1-24 | app/watchlist/page.tsx 29-46 | the page | 20 |  | dash-search.md:L243 |
| src/features/watchlist/read.ts | P1-24 | lib/supabase-server.ts 4452-4551 (types, caps), 4570-4618 (type fields), 4631-4702 (two reads), 4720-4985 (merge, lookups, mapping); lib/data.ts 682-789 (cookie resolution and the two caches) | `readWatchlist(userId, orgId, limit)`: the two reads, one dedup, parallel lookups (items by id shape, sources tier and name, market_series, adder names), `toListRowFields` for item-backed rows, one cache keyed by limit; rejects on failure | 250 |  | dash-search.md:L238 |
| src/features/watchlist/ui/useWatchMembership.ts (watchlist surface, P1-19..24, id owed) | P1-17 | WatchButton.tsx 77-163, 363-394 (the team-only branching) | the membership read, optimistic toggle, scope rules | 100 |  | ui-kit.md:L304 |
| src/features/watchlist/ui/WatchlistSurface.tsx | P1-24 | components/watchlist/WatchlistSurface.tsx 152-474 | masthead with the scope line, Watched card of ListRows (unlinked rows are ListRow without href), `FiltersRailCard` groups, the notices card with a distinct failed state | 260 |  | dash-search.md:L242 |
| src/features/workspace/api/archive-impact.ts | P1-02 | archive-impact/route.ts 30-204 | the pre-archive warning with errors surfaced | 90 |  | workspace.md:L245 |
| src/features/workspace/api/assignments.ts | P1-02 | lib/workspace/item-assignments.mjs 25-223; items/[id]/assignments/route.ts 19-41 | list, assign with notify, set state, remove | 180 |  | workspace.md:L248 |
| src/features/workspace/api/bootstrap.ts | P1-02 | bootstrap/route.ts 42-96; bootstrap/logic.ts 116-199 | the one per-user bundle; loaders degrade independently and log | 120 |  | workspace.md:L246 |
| src/features/workspace/api/notes.ts | P1-02 | lib/workspace/item-notes.mjs 1-132; items/[id]/notes/route.ts 15-37 | list, add, edit, soft-delete | 110 |  | workspace.md:L247 |
| src/features/workspace/api/overrides.ts | P1-02 | overrides/route.ts 36-304 | POST and DELETE; role gate, required reason, attribution, fan-out through `orgWatchersOf`, one membership read | 150 |  | workspace.md:L243 |
| src/features/workspace/api/personal-state.ts | P1-02 | personal-state/route.ts 48-217; bootstrap/logic.ts 38-70 | GET through the shared `loadPersonalState`, POST, DELETE | 90 |  | workspace.md:L244 |
| src/features/workspace/api/portfolios.ts | P1-02 | portfolios/route.ts 18-37; portfolios/[id]/route.ts 22-56; portfolios/[id]/members/route.ts 24-63 | the seven handlers over src/lib/portfolio (owner owed, see Interface) | 90 |  | workspace.md:L250 |
| src/features/workspace/api/tags.ts | P1-02 | tags/route.ts 30-236; tags/[id]/items/route.ts 24-124 | tags with counts and attribution, create, delete, apply (first applier kept), remove; `readJsonBody` shared | 190 |  | workspace.md:L249 |
| src/features/workspace/state/item-state-store.ts | P1-02 | stores/resourceStore.ts 1-570 | resources, archived, overrides, personalState, expandedId; one `optimistic` helper; persistence through `authedFetch` | 220 |  | workspace.md:L251 |
| src/features/workspace/state/merge.ts | P1-02 | stores/resourceStore.ts 572-645 | `mergeWithOverrides` with the stored `archived_at` | 60 |  | workspace.md:L252 |
| src/features/workspace/ui/ArchiveDialog.tsx | P1-02 | components/workspace/ArchiveDialog.tsx 29-423 | the two-scope dialog over the ui-kit Dialog | 260 |  | workspace.md:L253 |
| src/features/workspace/ui/ArchiveViewer.tsx | P1-02 | components/settings/ArchiveViewer.tsx 27-224 | both scopes, restore results surfaced for both, item links | 150 |  | workspace.md:L254 |
| src/features/workspace/ui/TagPopover.tsx and DetailTagRow.tsx (P1-02) | P1-17 | TagPopover.tsx 44-392; tagPopoverKeyboard.ts 1-87; DetailTagRow.tsx 20-90 | workspace-tags UI over P1-02's tags API; every false and null result shown; raw hex to tokens; the Dialog or a kit `Popover` for the panel | 330 |  | ui-kit.md:L305 |
| src/ui/Absence.tsx | P1-17 | Absence.tsx 9, 36-48, 59-65, 166-207 | AbsenceReason, pickAbsenceReason, ABSENCE_TEXT_STYLE, NEEDS_PHRASE, Absence with `reason` and `dash` variants (`narrow` folded into `dash`) | 45 |  | ui-kit.md:L260 |
| src/ui/ActionCard.tsx | P1-17 | ActionCard.tsx 42-308 | the one detail action card; the two 1px rules on `--line-2`; ExposureCell re-measures on resize | 170 |  | ui-kit.md:L261 |
| src/ui/ActionRow.tsx | P1-17 | ActionRow.tsx 35-223 | ActionRow, ActionButton (hover in base.css), `shareResource` and `downloadMarkdownBrief` returning a result the caller shows ("Link copied", "Copy failed") | 120 |  | ui-kit.md:L262 |
| src/ui/BandGradientRule.tsx | P1-17 | BandGradientRule.tsx 17-48 | the brand rule | 25 |  | ui-kit.md:L263 |
| src/ui/BandGroupHeader.tsx | P1-17 | BandGroupHeader.tsx 17-82 | the band group header | 55 |  | ui-kit.md:L264 |
| src/ui/BandTile.tsx | P1-17 | BandTile.tsx 23-201; BandTileRow.tsx 27-45 | BandTile (link or button) and BandTileRow in one file | 130 |  | ui-kit.md:L265 |
| src/ui/base.css | P1-17 | globals.css 144-150 (body), 152-156 (scrollbar), 192-211 (selection on the token, focus ring, reduced motion), 392-505 (row system), 533-558 (scroll shadow), 569-590 (table-cards), 593-618 (facet rows), 620-626 (detail head tint); plus every `<style>` template hoisted: ListRow.tsx 306-444 and 446-553, Chips.tsx 60-70 and 240-266, BandTile.tsx 69-84, FactCard.tsx 580-598, Skeleton.tsx 29-43, BiasChips.tsx 96-105, SectionHeader.tsx 52-75, SectionHeading.tsx 80-88, ActionRow.tsx 72-85, ActionCard.tsx 275-278, CardFoot.tsx 103-108, CommandBar.tsx 484-493, Masthead.tsx 136-195, RowTable.tsx 195-200, Timeline.tsx 172-178, SectionIndex.tsx 86-91 | one stylesheet, one `767px` and one `1279px` literal, the `489px` container query, the `1440px` masthead grid; `:hover` states for ActionButton and the icon watch box; the shared inline-link box | 320 |  | ui-kit.md:L259 |
| src/ui/BiasChips.tsx | P1-17 | BiasChips.tsx 36-255 | BiasChips (row, detail) and BiasLegend; a `confidence` mode for the admin queue (replaces ProvisionalReviewCard.tsx 273-298) | 150 |  | ui-kit.md:L266 |
| src/ui/Button.tsx | P1-17 | Button.tsx 6-55 rewritten on base.css classes | primary, secondary, ghost, danger; sizes with the 44 px floor as the smallest (the `sm` size becomes 44 tall with smaller type) | 50 |  | ui-kit.md:L267 |
| src/ui/CardFoot.tsx | P1-17 | CardFoot.tsx 40-113 | foot strip with FootLink on the shared inline-link box | 50 |  | ui-kit.md:L268 |
| src/ui/Chips.tsx | P1-17 | Chips.tsx 23-55, 72-108, 134-159, 171-229, 268-381; FactCard.tsx 205-225 (TierSquare, as the `size="square"` TierChip); detail/SourcesGrid.tsx 112-114 (replaced by TierChip) | BandChip, TierChip (one ceiling: SOURCE_TIER_MAX, no `max` prop), TagChip, WorkspaceTagPill (remove button 24 px with 8 px clearance), FilterChipGroup, FilterChip, GradeChip | 200 |  | ui-kit.md:L269 |
| src/ui/cn.ts | P1-17 | lib/cn.ts | kept only while a Tailwind className remains outside the kit (BackToTop, sources/SourceHealthDashboard, and the admin and community files other lanes list) | 5 |  | ui-kit.md:L307 |
| src/ui/CoverageState.tsx | P1-17 | CoverageState.tsx 31-85, 124-236 | the six states, three variants; `onRequest` callback and `requestState` props replace the inline fetch | 150 |  | ui-kit.md:L270 |
| src/ui/detail/action-card-props.tsx | P1-19 | lib/detail/action-card-common-props.tsx 17-57 | shared ActionCard props | 40 |  | regulations.md:L318 |
| src/ui/detail/collab/ItemNotesBlock.tsx, ItemAssignBlock.tsx, collab-client.ts | P1-19 | ItemNotesBlock.tsx 1-297; ItemAssignBlock.tsx 1-315; item-collab-client.ts 1-63 | workspace notes and assignments (routes stay P1-02) | 515 |  | regulations.md:L320 |
| src/ui/detail/CrossPageSection.tsx | P1-19 | components/detail/CrossPageSection.tsx 1-306 | Connected intelligence with links through next/link; view computed once by the caller | 230 |  | regulations.md:L312 |
| src/ui/detail/DetailShell.tsx | P1-19 | components/detail/DetailShell.tsx 69-628 | masthead, section, layout, rail slots, At a glance (callers pass only drawable rows), Impact, In this list, page wrapper with collab slot | 300 |  | regulations.md:L310 |
| src/ui/detail/FactBlocks.tsx | P1-19 | FactBlocks.tsx 1-56 | fact groups | 40 |  | regulations.md:L314 |
| src/ui/detail/InferenceSection.tsx | P1-19 | InferenceSection.tsx 1-69 | Inferences section | 55 |  | regulations.md:L313 |
| src/ui/detail/RecordFacts.tsx | P1-19 | primitives.tsx 30-126; RegulationDetailSurface.tsx 537-604 | record-grade body with optional gaps line, TagChip | 75 |  | regulations.md:L316 |
| src/ui/detail/RequirementTrajectory.tsx | P1-19 | RequirementTrajectory.tsx 1-37 | trajectory with nowIso | 25 |  | regulations.md:L317 |
| src/ui/detail/shared-props.ts | P1-19 | components/detail/shared-props.ts 1-17 | props type | 10 |  | regulations.md:L319 |
| src/ui/detail/SourcesGrid.tsx | P1-19 | SourcesGrid.tsx 1-161 | rows with registry tier and bias tags | 100 |  | regulations.md:L315 |
| src/ui/detail/useListPosition.ts | P1-19 | DetailShell.tsx 69-92, 499-531 | one reader of `list`, `pos`, `of`, `prev`, `next` | 25 |  | regulations.md:L311 |
| src/ui/DetailSubSection.tsx | P1-17 | DetailSubSection.tsx 1-25 | as is, rule on `--line-2` | 20 |  | ui-kit.md:L272 |
| src/ui/Dialog.tsx (new) | P1-17 | none; replaces the 11 hand-rolled overlays listed in section 5, starting with sources/SourceTierLegend.tsx 150-262, workspace/ArchiveDialog.tsx, profile/MembersPanel.tsx | scrim, Esc, focus move and return, 44 px close, `aria-modal`, title slot; the one overlay primitive P1-02 (workspace.md:339), P1-06 and P1-22/23 build on | 90 |  | ui-kit.md:L273 |
| src/ui/Dialog.tsx (P1-17) | P1-25 | redesign/MembersPanel.tsx 440-580 | typed-confirm dialog: Esc, initial focus, focus return, typed phrase; P1-02's BanDialog mounts it | 80 |  | admin-a.md:L300 |
| src/ui/ErrorState.tsx | P1-17 | ErrorState.tsx 12-44 on base.css | full-page error with retry (Button) | 35 |  | ui-kit.md:L274 |
| src/ui/FactCard.tsx | P1-17 | FactCard.tsx 31-204, 227-348, 365-660 | the one fact card, brief and record grade, matrix density, ClaimTierProvider; TierChip from Chips; typed matrix fact | 330 |  | ui-kit.md:L275 |
| src/ui/figures/Figures.tsx | P1-20 | EstimatedFigure.tsx 29-158; StatutoryFigure.tsx 20-100 | StatutoryFigure, EstimatedFigure, DerivedFigure: separate exports and badges, one shared gate call and meta line, `now` required (injected render instant) | 110 |  | market.md:L245 |
| src/ui/figures/Notices.tsx | P1-20 | RecalculationNotice.tsx 20-131; NoticesRail.tsx 28-133 | useRecalculationNotices with a distinct error state, NoticesRail, RecalculationNotice; customer copy without table names or primary keys (method version stays in the drawer) | 120 |  | market.md:L246 |
| src/ui/FilePickRow.tsx | P1-17 | FilePickRow.tsx 13-57 | as is, on tokens | 40 |  | ui-kit.md:L276 |
| src/ui/form-primitives.tsx (P1-17) | P1-25 | account/AccountPrimitives.tsx 122-237, 264-452 | SegmentedControl (44 px segments), HonestFrame, Chip, ToggleSwitch (44 px hit area), FieldLabel, TextInput, TextArea (class-based focus), InkButton; AccountCard folds into SectionCard with a head slot and foot strip (20-113) | 250 |  | admin-a.md:L299 |
| src/ui/gallery/* (P1-17 ui-kit owns the home) | P1-26 | parts/{action-card, command-bar, fact-card, item-group, list-row, masthead, nav-card, rail-card, section-header, section-index, stat-block, state-note}/page.tsx; CommandBarPartsDemo.tsx 36-125; NavCardPartsDemo.tsx 19-71; the 12 part.json as one static list | the sign-off galleries over P1-17's fixtures; one `installFixtureFetch` | 640 |  | admin-b.md:L364 |
| src/ui/gallery/parts-registry.ts | P1-26 | lib/admin/parts-registry.ts 28-32, 40-68 (the validation, over a static list) | the parts list | 60 |  | admin-b.md:L366 |
| src/ui/GlobalErrorReporter.tsx | P1-07 | GlobalErrorReporter.tsx 17-114 | the reporter and reportClientError, caps unchanged | 70 |  | capture.md:L171 |
| src/ui/ImpactMeter.tsx | P1-17 | ImpactMeter.tsx 36-53, 65-93, 96-111, 114-301 | row and full meters, one unscored branch, ramp stops declared as the one exception; dead exports dropped | 180 |  | ui-kit.md:L277 |
| src/ui/InlineErrorBanner.tsx | P1-17 | InlineErrorBanner.tsx 14-33 | as is, on tokens | 20 |  | ui-kit.md:L278 |
| src/ui/ItemGroup.tsx | P1-17 | ItemGroup.tsx 53-160 | fact-card group with BandGroupHeader, cap and disclosure, action strip | 60 |  | ui-kit.md:L279 |
| src/ui/list-surface/facets.ts | P1-18 | list-surface-helpers.ts 6-127, 347-411 | facet options and liveFacetCounts (corpus at rest, selection tallies excluding the group's own selection) | 110 |  | shell-list.md:L270 |
| src/ui/list-surface/filter-sort.ts | P1-18 | list-surface-helpers.ts 129-144, 186-312 | filter state, filterRows, sortResourceRows (NaN-safe), window filter, withListPosition | 70 |  | shell-list.md:L271 |
| src/ui/list-surface/ListSurface.tsx | P1-18 | ListSurfaceShell.tsx 64-633 | masthead, band tiles, mobile facet strip, Filters sheet, rows grouped or flat with virtualization, band foot, slots (aboveRows, sortRow, sectionFoot, belowRows, rail), inside PageFrame, CSS once | 250 |  | shell-list.md:L267 |
| src/ui/list-surface/rail.tsx | P1-18 | ListSurfaceRailCards.tsx 45-252, 551-578 | FiltersRailCard (checkbox facets, live counts, +N more, Clear N), LegendRailCard | 130 |  | shell-list.md:L268 |
| src/ui/list-surface/SortRow.tsx | P1-18 | ListSurfaceSortRow.tsx 22-169 | count, link, segmented Sort or Window | 80 |  | shell-list.md:L269 |
| src/ui/list-surface/ThemeStrip.tsx | P1-18 | shell/ThemeStrip.tsx 1-9; shell/ThemeStripView.tsx 1-135; supabase-server.ts 4395-4423 | theme chips strip and its bounded reader | 110 |  | shell-list.md:L274 |
| src/ui/list-surface/url-state.ts | P1-18 | list-surface-helpers.ts 146-184, 413-464; useListSurfaceFilter.ts 23-86; regulations-region-link.ts 1-32 | one param vocabulary for every list facet, sort, window and surface extras; replace not push; the map's region link resolves to the list's own jurisdiction tokens | 95 |  | shell-list.md:L272 |
| src/ui/list-surface/use-list-rows.ts | P1-18 | ListSurfaceShell.tsx 642-677 | first page plus remainder with an explicit failed state and Retry | 35 |  | shell-list.md:L273 |
| src/ui/ListRow.tsx | P1-17 | ListRow.tsx 52-137 (props minus `endStat`, `variant`), 555, 713-985 | the one list row, class names only; the phone, tablet, mid and wide rows in base.css | 300 |  | ui-kit.md:L281 |
| src/ui/ListRowHeader.tsx | P1-17 | ListRow.tsx 151-293 (list branch only) | the column header on the one GRID constant | 80 |  | ui-kit.md:L282 |
| src/ui/Masthead.tsx | P1-17 | Masthead.tsx 52-290 minus 44-50 | the masthead; `commandBar` becomes a ReactNode slot the shell fills; `nowIso` required; `volume` a prop | 110 |  | ui-kit.md:L284 |
| src/ui/Menu.tsx (new, from the overflow) | P1-17 | RowTable.tsx 250-371 (behaviour), regulations/PriorityDropdown (P1-19..24) as a second caller | the one overflow menu: outside-click, Esc, roles | counted in RowTable's 220 | handoff | ui-kit.md:L290 |
| moved: row overflow menu (P1-17 src/ui/Menu.tsx) | P1-19 | PriorityDropdown.tsx 51-471 | priority retag, dismiss and archive items on the one Menu, 44 px items, arrow keys, focus return | 200 (P1-17) | handoff | regulations.md:L342 |
| src/ui/MilestoneTimeline.tsx | P1-17 | MilestoneTimeline.tsx 28-38, 47-93; milestone-timeline-classify.ts 1-28 (hasNext parameter dropped); timeline-dot-styles.ts 1-36 | the row dot strip, the classifier, the dot and track styles | 110 |  | ui-kit.md:L286 |
| src/ui/MoreBelowDisclosure.tsx | P1-17 | components/shared/MoreBelowDisclosure.tsx (outside scope; read by ItemGroup.tsx:58) | the one closed-by-default overflow disclosure, moved into the kit so the kit has no upward import | 40 |  | ui-kit.md:L280 |
| src/ui/notifications/NotificationsBell.tsx (P1-18) | P1-22 | NotificationsBell.tsx 27-143 | platform inbox bell, 44 px | 70 |  | community-a.md:L226 |
| src/ui/notifications/NotificationsList.tsx (P1-18) | P1-22 | NotificationsList.tsx 23-481 | inbox list with consistent rollback and an error on load-older | 260 |  | community-a.md:L227 |
| src/ui/RailCard.tsx | P1-17 | RailCard.tsx 28-132 | the rail-card shell; `headLink` renders next/link | 70 |  | ui-kit.md:L287 |
| src/ui/RelativeTime.tsx | P1-17 | RelativeTime.tsx 25-35; relative-time-format.ts 1-27 | hydration-safe relative time; one shared 60 s ticker (a module-level interval with subscribers) instead of one per instance | 35 |  | ui-kit.md:L288 |
| src/ui/RowTable.tsx | P1-17 | RowTable.tsx 31-371 | table anatomy, action button, overflow on the Menu primitive | 220 |  | ui-kit.md:L289 |
| src/ui/SectionCard.tsx | P1-17 | SectionCard.tsx 73-167; SectionRule.tsx 27-38 | the card shell with the rule on `--brand` | 70 |  | ui-kit.md:L291 |
| src/ui/SectionHead.tsx | P1-17 | SectionHeader.tsx 36-116; SectionHeading.tsx 33-113; section-title-style.ts 1-12 | one head: `index`, `title`, `aside` (meta), `rule`, `padding`; the S-section and the card head are the two prop sets A2 P-1 asked about | 110 |  | ui-kit.md:L292 |
| src/ui/SectionIndex.tsx | P1-17 | SectionIndex.tsx 28-136; SectionIndexLink.tsx 12-39; section-index-styles.ts 1-54; detail/DetailShell.tsx `SummaryDepthSwitch` (outside scope, imported at SectionIndex.tsx:41) | the index bar with the depth switch inside the kit; the active tab text on `--color-invert-text`'s canonical successor | 150 |  | ui-kit.md:L293 |
| src/ui/SectionLabel.tsx | P1-17 | SectionLabel.tsx 1-17 | as is | 15 |  | ui-kit.md:L294 |
| src/ui/shell/AppShell.tsx | P1-18 | AppShell.tsx 31-266; app-shell-banner.ts 1-46 | frame grid inside PageFrame's tokens, drawer state, bootstrap hydration mount, banner on resolved null, onboarding redirect, identity error note with Retry, assistant and back-to-top mounts; setup routes matched by segment; /privacy and the auth routes without the signed-in chrome | 90 |  | shell-list.md:L247 |
| src/ui/shell/BackToTop.tsx | P1-18 | BackToTop.tsx 1-33 | appears after 400 px of `<main>` scroll, 44 px target | 30 |  | shell-list.md:L254 |
| src/ui/shell/identity-seed.ts | P1-18 | shell/bootstrap-seed.ts 1-129 | AuthSeed, IdentityStatus, error seed, apply guard, workspace label, admin-nav gate, retry schedule (consumed by P1-01 AuthProvider) | 55 |  | shell-list.md:L256 |
| src/ui/shell/member-display-name.ts (P1-18) | P1-26 | lib/admin/member-display-name.ts 1-25 | the display chain | 20 |  | admin-b.md:L365 |
| src/ui/shell/nav-counts.server.ts | P1-18 | lib/nav/nav-counts.ts 1-44 | nav counts for the bootstrap route; null on failure, never zeros | 30 |  | shell-list.md:L260 |
| src/ui/shell/nav-model.ts | P1-18 | Sidebar.tsx 48-104, 135-151; TopBar.tsx 70-75 | SECTIONS, flat route-to-label table, navTitleForPath, isActivePath (segment), gradientCountsFrom | 40 |  | shell-list.md:L248 |
| src/ui/shell/NavCard.tsx | P1-18 | Sidebar.tsx 114-529 | one Wordmark, one NavRows renderer with card and drawer sizes, Account row (opens P1-01's UserMenu), Admin row with attention count and role badge; drawer through Sheet | 190 |  | shell-list.md:L249 |
| src/ui/shell/PageFrame.tsx | P1-18 | layout/PageFrame.tsx 1-49 | content plus rail grid, padding variants, collapse at 1280, phone padding | 30 |  | shell-list.md:L255 |
| src/ui/shell/QueryProvider.tsx | P1-18 | providers/QueryProvider.tsx 18-43 | one QueryClient | 18 |  | shell-list.md:L261 |
| src/ui/shell/scroll-container.tsx | P1-18 | useNearestScrollParent.ts 54-94; AppShell.tsx 254 | context exposing `<main>` to VirtualizedRowList and BackToTop | 20 |  | shell-list.md:L253 |
| src/ui/shell/Sheet.tsx | P1-18 | Sidebar.tsx 471-525; ListSurfaceShell.tsx 240-317 | side (nav drawer, dvh height, safe area) and bottom (filters) placement over P1-17's Dialog, which supplies scrim, Esc, focus move and return | 30 |  | shell-list.md:L251 |
| src/ui/shell/TopBar.tsx | P1-18 | layout/TopBar.tsx 42-202 | mobile bar: band rule, 44 px hamburger, title, search glyph to the command bar, avatar with unread dot | 95 |  | shell-list.md:L250 |
| src/ui/shell/use-admin-attention.ts | P1-18 | useAdminAttention.ts 1-278 | attention from the bootstrap; one visible-tab 60 s refresh for platform admins; one type | 55 |  | shell-list.md:L258 |
| src/ui/shell/use-bootstrap.ts | P1-18 | useWorkspaceBootstrap.ts 26-233; useWorkspaceOverridesHydration.ts 41-74; usePersonalState.ts 34-62 | one per-session bootstrap store, reset on auth change, one hydration of overrides and personal state, types from the P1-02 bootstrap contract | 120 |  | shell-list.md:L257 |
| src/ui/shell/use-unread-count.ts | P1-18 | useUnreadNotificationsCount.ts 19-79 | one gated singleton (signed-in only), shared by NotificationsBell and TopBar | 40 |  | shell-list.md:L259 |
| src/ui/shell/UserMenu.tsx (from P1-01) | P1-18 | auth/UserMenuDropdown.tsx 43-134 | account dropdown with Esc and focus return | counted by P1-01 (70) | handoff | shell-list.md:L289 |
| src/ui/Skeleton.tsx | P1-17 | Skeleton.tsx 14-17, 45-122; skeleton-page.tsx 1-15 | the five skeletons; list row on the one GRID; page frame without `animate-pulse` | 90 |  | ui-kit.md:L295 |
| src/ui/SourceLink.tsx | P1-17 | SourceLink.tsx 9-29 | as is | 20 |  | ui-kit.md:L296 |
| src/ui/spec-panel.css (P1-17 owns) | P1-20 | spec09.css 22-71 | SpecPanel header and stacking | 25 |  | market.md:L270 |
| src/ui/StatBlock.tsx | P1-17 | StatBlock.tsx 30-185 | stack, row, tile | 110 |  | ui-kit.md:L297 |
| src/ui/StateNote.tsx | P1-17 | StateNote.tsx 11-113; band-context.tsx 22-38 | the note with band context; `action.href` renders next/link | 80 |  | ui-kit.md:L298 |
| src/ui/SystemErrorBanner.tsx | P1-17 | SystemErrorBanner.tsx 1-36 | on `--action-tint` and `--action-border` (the warning tokens that exist) | 25 |  | ui-kit.md:L299 |
| src/ui/TabRow.tsx | P1-17 | TabRow.tsx 28-130 | tab row, 44 px tabs, arrow-key roving for `tablist` | 75 |  | ui-kit.md:L300 |
| src/ui/theme.css | P1-17 | app/theme.css 20-96 (canonical block); globals.css 7-10 (font family names), 518-521 (`--cl-detail-pad-x`, `--cl-impact-track`, renamed into the scale); theme.css 80 (`--selection`) | the one token set: surfaces, ink, bands with tint and border, lines, elevation, radius, spacing, type, interaction states, breakpoints as documented constants; no alias layer | 90 |  | ui-kit.md:L258 |
| src/ui/Timeline.tsx | P1-17 | Timeline.tsx 40-170, 180-376 | one markup, grid reflow in base.css; one focusable per marker | 240 |  | ui-kit.md:L301 |
| src/ui/tint.ts | P1-17 | lib/tint.ts | kept for its five admin callers | 3 |  | ui-kit.md:L308 |
| src/ui/Toast.tsx | P1-17 | Toast.tsx 7-62 on base.css | toast with max-width, timer keyed on `visible` only, inner timeout cleared | 50 |  | ui-kit.md:L302 |
| src/ui/UserMenu.tsx (P1-18 shell owns it) | P1-01 | components/auth/UserMenuDropdown.tsx 43-134 | account dropdown with Esc and focus return | 70 |  | auth-db.md:L258 |
| src/ui/VirtualizedRowList.tsx (P1-17) | P1-25 | ledger/VirtualizedRowList.tsx 40-206 | as is; header reduced to one paragraph | 120 |  | admin-a.md:L298 |
| src/ui/WatchToggle.tsx | P1-17 | WatchButton.tsx 165-217, 228-280, 331-361, 412-529 (chrome only) | three variants over one copy table; `watched`, `teamWatched`, `teamAvailable`, `loaded`, `failed`, `onToggle(scope)` as props; a visible failure line | 150 |  | ui-kit.md:L303 |
| (coverage module, id owed) | P1-05 | tier1-priority-jurisdictions.ts 1-229 | priority regions, merged with lib/jurisdictions/tiers.ts | 120 elsewhere | handoff | sources-a.md:L314 |
| (intake, P1-03/04) | P1-05 | fetch-quality.ts 1-35 | brief failure-phrase check | 25 elsewhere | handoff | sources-a.md:L315 |
| (none) | P1-16 | scripts/forward-events/DRY-RUN-REPORT.md | TRASH | 0 | non-src | obligations.md:L209 |
| a data migration for sources.source_type | P1-06 | backfill-source-type.mjs 16-100 | classify NULL rows once, never overwrite (two-track policy: data migration with consumer code) | 60 | non-src | sources-b.md:L236 |
| a guarded source_role fix (P1-05 owns role-at-birth) | P1-06 | source-role-cleanup.mjs 22-59 | re-classify role through the guarded write path | 45 | non-src | sources-b.md:L237 |
| assistant route owner (id owed) | P1-03 | operations-ask-context.mjs 1-142 | the Operations data block | 70 | non-src | intake-a.md:L336 |
| classify-signup-result | P1-01 | auth/classify-signup-result.mjs 6-13 | folded into SignupPage or features/auth/lib | 8 | non-src | auth-db.md:L259 |
| core/cache/tags.ts (P1-07) | P1-18 | cache/revalidate-item.ts 1-33 | tag vocabulary and item flush | counted by P1-07 | handoff | shell-list.md:L288 |
| detail components (P1-19..24 shared detail) | P1-18 | shell/ItemConnectionsCard.tsx 1-284; shell/RelevanceBadge.tsx and Client; shared/InferenceClaim.tsx | connections strip and rail card, relevance badge, inference card with the status vocabulary rendered in words | 270 | non-src | shell-list.md:L290 |
| fixtures (P1-25 admin parts gallery) | P1-17 | `__fixtures__` 5 files | move with app/admin/parts or become test fixtures | 0 in the kit | handoff | ui-kit.md:L309 |
| market surface | P1-18 | pages/MarketSignalDetailSurface.tsx 1-873; ListSurfaceRailCards.tsx 377-549 | market detail body; carbon cost and next data drops rail cards | 510 | non-src | shell-list.md:L292 |
| moved: date presets, depth switch, scroll spy (P1-17) | P1-19 | format-fixed-date.ts 15-27; DetailShell.tsx 152-197; use-section-scroll-spy.ts |  | 68 (P1-17) | handoff | regulations.md:L344 |
| moved: sectors, adjacency, verticals (P1-02); jurisdiction weights (scoring owner); APP_NAME (P1-18) | P1-19 | constants.ts 1-2, 143-256, 287-318 |  | 125 | non-src | regulations.md:L346 |
| moved: ThemeBriefCard (Research surface) | P1-19 | ThemeBriefCard.tsx |  | 30 | non-src | regulations.md:L345 |
| moved: upcoming-obligations strip (Market surface) | P1-19 | UpcomingObligationsStrip.tsx 35-143; UpcomingObligationsStripView.tsx 1-82, 144-313 | list variant only | 200 (Market) | handoff | regulations.md:L343 |
| not ported | P1-07 | d3/hooks.mjs 1-75; api/worker/reconcile/route.ts 1-55; scripts/d3-runs.ddl.sql | see the features table for where each capability lives | 0 | non-src | capture.md:L182 |
| Operations surface read module (id owed) | P1-03 | formats/operations-matrix.ts 1-284 | S3/S4 eligibility | 180 | non-src | intake-a.md:L335 |
| ops/backfill-derivation-edges | P1-10 | backfill-derivation-edges.mjs 9-110 | one-time DAG bridge | 45 | non-src | flywheel-b.md:L264 |
| ops/backfill-entities | P1-10 | backfill-entities.mjs 71-224 | historical spine backfill | 110 | non-src | flywheel-b.md:L263 |
| ops/backfill-lineage-edges | P1-10 | backfill-lineage-edges.mjs 32-190 | corpus lineage backfill with prior-state snapshot | 110 | non-src | flywheel-b.md:L265 |
| ops/seed-corridors | P1-10 | seed-corridors.mjs 8-314; write-entity-scope.mjs 34-150 | corridor seeds, display names, jurisdiction scope | 170 | non-src | flywheel-b.md:L266 |
| ops/seed-derived-values (P1-08 ops runner) | P1-10 | seed-derived-values.mjs 13-123 | first carbon_intensity_tkm values, licence-gated | 55 | non-src | flywheel-b.md:L262 |
| P1-02 workspace | P1-18 | pages/SettingsPage.tsx 1-639 | settings body | 300 | non-src | shell-list.md:L294 |
| P1-03/04 intake | P1-08 | canonical-key.mjs 3-24; eurlex-cellar.mjs 1-33; free-pass.mjs 23-48; changelog.mjs 51-99; gate-a-state-writer.mjs 9-29 | key derivation, Cellar URLs, free re-attribution, changelog writer, Gate A state writer | 125 | non-src | harness.md:L299 |
| P1-03/04 intake: document identity | P1-14 | export-census-rows.mjs 25-292 | CELEX sector-letter map, UK series identifier, FR document number and type, registered-institution fallback | 150 | non-src | mint.md:L216 |
| P1-05 sources-a: register and rate | P1-14 | heal-provenance.mjs 1871-1912, 2988-3006, 3341-3361 | `registerAndRate(url)` with the class-table tier and the institution link | 100 | non-src | mint.md:L218 |
| P1-05 trust module | P1-26 | recompute-trust/logic.ts 21-33 | tierMovementWriters | 46 (counted there) | handoff | admin-b.md:L368 |
| P1-05/06 sources | P1-08 | institution-key.mjs 1-54; rate-source-by-class.mjs 29-72; load-host-verdicts.mjs 1-94; resolve-provisional-sources.mjs 89-645; enumerate-unclassified-hosts.mjs 30-224; canonical-autoverify.mjs 39-727 | one hostOf and institution key; rate by class; verdict loader; resolve provisional with its unplaced export; canonical autoverify | 625 | non-src | harness.md:L300 |
| P1-07 capture | P1-14 | export-census-rows.mjs 299-632, 826-906, 1040-1186; heal-provenance.mjs 1057-1568 | Cellar with redirect upgrade, EUR-Lex clean text with robot-gate detection, UK `data.htm`, FR API, OJ issue resolution, Wayback fallback, PDF bytes, garbled-metadata and in-force detectors, title extraction | 350 | non-src | mint.md:L217 |
| P1-07 core/notifications/dispatch.ts and the error sink | P1-23 | dispatch.ts; seed-fallback-flag.ts | as capture.md section 8 plans; plus the preference and mute check (interface below) | (P1-07) | handoff | community-b.md:L282 |
| P1-09/10 flywheel | P1-08 | tag-proposals.mjs 24-111; tag-ratification.mjs 35-156; trigger-question-deps.mjs 9-17; absent-tolerant.mjs 1-16; emission-factors-common.mjs 28-68; backfill-item-timelines.mjs 67-152; derive-obligations.mjs 24-61 (folded) | tag propose and ratify, question deps, carbon-intensity edge authorship, timeline resolver | 351 | non-src | harness.md:L301 |
| P1-11 schema | P1-08 | migration-compare.mjs 1-167; build-applied-map.mjs 21-215; migration-history-diff.mjs 16-79; sync-applied-migrations.mjs 12-47; generate-migrations-inventory.mjs 30-188 | migration history map and diff (no cycle), applied inventory, migrations inventory | 405 | non-src | harness.md:L303 |
| P1-12..15 runtimes | P1-08 | apply-deferrals.mjs 23-156; deferral.mjs 30-115; quarantine-dwell.mjs 17-71; mutation-lease.mjs 4-41; fetch-desnz-factors.mjs 34-711 | deferral apply with a per-item existence check; dwell; leases; DESNZ producer writing emission_factors | 504 | non-src | harness.md:L302 |
| P1-15 producers: xlsx reader, oil bulletin CSV parser, carrier ETS envelope, upsert planner, display rows | P1-20 | oil-bulletin-workbook.mjs 1-488; parsers/eu-weekly-oil-bulletin.mjs 1-110; carrier-ets-surcharge-envelope.mjs 3-97; write-market-series.mjs 1-67; refresh-published-price-statistics.mjs 1-29, 75-138 | producer-side code moved out of src; the planner back-fills entity_id only when the caller selects it (or always stamps); display rows write source_tier from the source's rating | 415 | non-src | market.md:L274 |
| P1-17 ui-kit | P1-18 | shared/GfmSection.tsx 1-198; shared/MoreBelowDisclosure.tsx 1-38 | the one markdown renderer, the disclosure (ui-kit.md section 8 already takes MoreBelowDisclosure as src/ui/MoreBelowDisclosure.tsx; GfmSection is this lane's proposal, gap 9) | 150 | non-src | shell-list.md:L291 |
| P1-19 regulations | P1-18 | ListSurfaceRailCards.tsx 280-352 | obligations rail card with an error state | 60 | non-src | shell-list.md:L293 |
| P1-22/23 community antitrust | P1-10 | aggregate-safeguards.mjs 69-77 | computeDominanceShare | 12 (moved) | handoff | flywheel-b.md:L267 |
| pause gates (P1-05/06 sources) | P1-01 | api/pause.ts 18-96, 136-144 | readScrapeState, getScrapeState, isGloballyPaused, evaluateGenerationPause, pausedResponse; the judgement-drain trio and the source pause are not ported | 50 | non-src | auth-db.md:L260 |
| scripts/run.ts | P1-08 | is-main.mjs; env-file.mjs; every per-file CLI | the one CLI: `run <family> [--mode] [--input]` | 40 | non-src | harness.md:L294 |
| scripts/sources/inaccessible-triage.mjs (new tree scripts dir) | P1-06 | inaccessible-triage.mjs 1-472 | the ladder over suspended sources | 300 | non-src | sources-b.md:L235 |
| skeletons (P1-17 shared skeleton) | P1-21 | the four loading.tsx files | list and detail skeletons matching the real layouts | 40 | non-src | research-ops.md:L282 |
| sources types and store (P1-05/06) | P1-02 | types/source.ts 1, 57-97, 238-406, 411, 448-456, 464, 484-588; stores/sourceStore.ts 1-119 | SourceTier, TrustMetrics, TrustScore, promotion and demotion tables, SourceStatus, IntelligenceType, IntelligenceDomain, Source, TierHistoryEntry, ProvisionalSource; the admin registry filter store | 330 | non-src | workspace.md:L273 |
| stays: extract-recommended-actions, timeline-parse, section 14 extraction (P1-03) | P1-19 | lib/agent | writer side | 165 (P1-03) | handoff | regulations.md:L347 |
| supabase migration (schema DDL first, rule 3) plus a data migration | P1-20 | series-item-map.mjs 1-58 | `market_series_items (series_key text primary key, item_id uuid references intelligence_items, status text)` seeded with the six ratified rows; ratify-series-items writes rows, not a source file [HYPOTHESIS: table shape is this register's proposal, ADR owed] | 25 | non-src | market.md:L275 |
| supabase/functions/capture-worker/index.ts (stays an Edge Function; the only file outside src, by runtime) | P1-07 | index.ts 222-256 (Deno.serve, queue select, replay rule), 259-581 (processRow, rewritten over fetchDocument), 589-614 (recordRetry, recordFailure, json) | queue claim (atomic, error read), fetch through the shared policy, PDF text extraction (unpdf stays Deno-side: it is the one dependency the shared file cannot carry), idempotency read with its error read, ADR-016 ceiling bind LOUD, agent_runs and agent_run_searches writes, coverage_gap flag, requeue up to MAX_ATTEMPTS; header reduced to the five contract clauses | 230 | non-src | capture.md:L167 |
| surface read modules (ids owed, see Interface) | P1-01 | supabase-server.ts 99-5048 | dashboard, lists and aggregates, detail and themes, watchlist, operations, market, research, sources admin read | 1900 | non-src | auth-db.md:L261 |
| tests/fakes/db.ts | P1-13 | theme-briefs/fixture-deps.mjs:1-78 | the in-memory db every stage test runs over | 50 | non-src | runtimes-b.md:L215 |
| theme rules and the seventh drain kind | P1-15 | backfill-themes (feature only) | see the call-site table | counted in kinds and a 60-line rules file (in the 180 of authority-score's sibling budget, not separately) | handoff | producers.md:L333 |
| tools/measure-bundles.ts | P1-08 | measure-bundles.mjs 1-99 | bundle inventory with routes from the app directory | 60 | non-src | harness.md:L304 |
| TOTAL code | P1-12 |  |  | 0 | total-row | runtimes-a.md:L280 |

### A.1 Subtotals per top-level dir

| dir | rows | est LOC |
|---|---|---|
| other (non-src path or handoff row) | 57 | 8,348 |
| src/app | 9 | 681 |
| src/core | 168 | 20,512 |
| src/features/account | 8 | 1,214 |
| src/features/admin | 57 | 8,105 |
| src/features/assistant | 2 | 470 |
| src/features/auth | 18 | 1,655 |
| src/features/community | 67 | 7,655 |
| src/features/corrections | 3 | 305 |
| src/features/coverage | 8 | 630 |
| src/features/dashboard | 7 | 995 |
| src/features/drain | 2 | 380 |
| src/features/flywheel | 5 | 730 |
| src/features/harness | 1 | 70 |
| src/features/health | 2 | 180 |
| src/features/intake | 19 | 2,395 |
| src/features/learning | 4 | 580 |
| src/features/lists | 5 | 345 |
| src/features/map | 2 | 175 |
| src/features/market | 31 | 3,737 |
| src/features/mint | 13 | 2,360 |
| src/features/notices | 1 | 90 |
| src/features/obligations | 23 | 2,195 |
| src/features/onboarding | 5 | 965 |
| src/features/operations | 26 | 3,170 |
| src/features/portfolio | 9 | 1,155 |
| src/features/regulations | 16 | 2,193 |
| src/features/research | 16 | 2,355 |
| src/features/search | 4 | 200 |
| src/features/settings | 5 | 550 |
| src/features/shell | 1 | 280 |
| src/features/sources | 18 | 2,110 |
| src/features/sources-admin | 14 | 1,970 |
| src/features/statutory | 3 | 381 |
| src/features/telemetry | 3 | 75 |
| src/features/turns | 12 | 3,060 |
| src/features/watchlist | 7 | 855 |
| src/features/workspace | 13 | 2,040 |
| src/ui | 90 | 9,521 |

src/core total: 20,512. src/ui total: 9,521. src/features total: 55,625. src/app total: 681. Rows with a src/ path: 86,339. Non-src and handoff rows: 8,348.

### A.2 Subtotals per lane

| lane | module | rows | est LOC (all rows) | est LOC (src/ rows only) |
|---|---|---|---|---|
| P1-01 | auth-db | 32 | 4,408 | 2,450 |
| P1-02 | workspace | 38 | 5,399 | 5,069 |
| P1-03 | intake-a | 19 | 4,120 | 3,870 |
| P1-04 | intake-b | 23 | 3,340 | 3,340 |
| P1-05 | sources-a | 35 | 3,995 | 3,995 |
| P1-06 | sources-b | 33 | 3,830 | 3,425 |
| P1-07 | capture | 17 | 1,003 | 773 |
| P1-08 | harness | 16 | 2,830 | 720 |
| P1-09 | flywheel-a | 19 | 2,810 | 2,810 |
| P1-10 | flywheel-b | 31 | 2,751 | 2,261 |
| P1-12 | runtimes-a | 16 | 3,190 | 3,190 |
| P1-13 | runtimes-b | 12 | 3,060 | 3,010 |
| P1-14 | mint | 16 | 2,960 | 2,360 |
| P1-15 | producers | 36 | 4,934 | 4,934 |
| P1-16 | obligations | 24 | 2,195 | 2,195 |
| P1-17 | ui-kit | 52 | 5,308 | 5,308 |
| P1-18 | shell-list | 48 | 4,024 | 2,734 |
| P1-19 | regulations | 50 | 5,588 | 5,433 |
| P1-20 | market | 32 | 3,337 | 2,897 |
| P1-21 | research-ops | 35 | 4,250 | 4,210 |
| P1-22 | community-a | 35 | 5,465 | 5,465 |
| P1-23 | community-b | 37 | 2,680 | 2,680 |
| P1-24 | dash-search | 32 | 3,840 | 3,840 |
| P1-25 | admin-a | 35 | 5,810 | 5,810 |
| P1-26 | admin-b | 31 | 3,560 | 3,560 |

**Grand total, section 8 tables as written: 94,687 est LOC over 754 rows; 86,339 on rows with a src/ path.** P1-11 schema has no register on master (see header), so no rows.

### A.3 New paths claimed by two lanes (6)

| new path | claims (lane, est LOC, cite) |
|---|---|
| src/core/cache/fallback-guard.ts | P1-07 37 (capture.md:L180); P1-18 30 (shell-list.md:L286) |
| src/core/cache/tags.ts | P1-07 13 (capture.md:L179); P1-24 10 (dash-search.md:L230) |
| src/features/account/ui/MembersPanel.tsx | P1-25 90 (admin-a.md:L301); P1-02 380 (workspace.md:L257) |
| src/features/shell/ui/CommandBar.tsx | P1-18 counted by P1-17 (280, ui-kit.md section 8) (shell-list.md:L252); P1-17 280 (ui-kit.md:L306) |
| src/ui/Dialog.tsx | P1-25 80 (admin-a.md:L300); P1-17 90 (ui-kit.md:L273) |
| src/ui/Menu.tsx | P1-19 200 (P1-17) (regulations.md:L342); P1-17 counted in RowTable's 220 (ui-kit.md:L290) |

### A.4 Old files claimed as a source by two or more lanes (27)

Matched on the old-path token as each register writes it, after stripping `fsi-app/`, `src/`, `lib/` prefixes; bare `route.ts`, `page.tsx`, `index.ts`, `layout.tsx` skipped. A token can name two different files (for example `[slug]/page.tsx` under different routes, `members/route.ts` under different parents, `logic.ts`, `identity.mjs`, `dispatch.ts`); a shared token is a claim to check, not a proven double claim. A row claiming different line ranges of one file is also listed.

| old path token | claiming lanes | cites |
|---|---|---|
| ObligationRegisterFilterBar.tsx | P1-16, P1-19 | obligations.md:L186; regulations.md:L326 |
| UpcomingObligationsPanel.tsx | P1-16, P1-25 | admin-a.md:L277; obligations.md:L186 |
| [slug]/page.tsx | P1-20, P1-21, P1-23 | community-b.md:L274; market.md:L259; research-ops.md:L261; research-ops.md:L281 |
| api/cache/revalidate-item/route.ts | P1-07, P1-18 | capture.md:L181; shell-list.md:L287 |
| api/pause.ts | P1-01, P1-05 | auth-db.md:L260; sources-a.md:L292 |
| api/revalidate/route.ts | P1-07, P1-18 | capture.md:L181; shell-list.md:L287 |
| cache/fallback-guard.ts | P1-07, P1-18, P1-24 | capture.md:L180; dash-search.md:L229; shell-list.md:L286 |
| cache/revalidate-item.ts | P1-07, P1-18 | capture.md:L179; shell-list.md:L288 |
| canonical-pipeline.ts | P1-03, P1-12 | intake-a.md:L318; intake-a.md:L324; intake-a.md:L328; intake-a.md:L332; runtimes-a.md:L271 |
| commandBarKeyboard.ts | P1-17, P1-18 | shell-list.md:L252; ui-kit.md:L306 |
| data.ts | P1-19, P1-20, P1-21, P1-24 | dash-search.md:L229; dash-search.md:L230; dash-search.md:L238; market.md:L259; regulations.md:L335; research-ops.md:L252; research-ops.md:L268 |
| derive-obligations.mjs | P1-08, P1-16 | harness.md:L301; obligations.md:L196; obligations.md:L197; obligations.md:L206 |
| dispatch.ts | P1-07, P1-23 | capture.md:L178; community-b.md:L282 |
| extract-regulation-sections.ts | P1-03, P1-19 | intake-a.md:L322; regulations.md:L307 |
| flywheel-steps.mjs | P1-04, P1-16 | intake-b.md:L214; obligations.md:L195 |
| generate-brief.ts | P1-03, P1-07 | capture.md:L181; intake-a.md:L333 |
| identity.mjs | P1-06, P1-23 | community-b.md:L246; sources-b.md:L230 |
| logic.ts | P1-06, P1-23, P1-26 | admin-b.md:L351; community-b.md:L280; community-b.md:L281; sources-b.md:L234 |
| members/route.ts | P1-01, P1-23 | auth-db.md:L235; auth-db.md:L244; community-b.md:L259 |
| mint-enrichment.ts | P1-04, P1-16 | intake-b.md:L214; obligations.md:L195 |
| operations-ask-context.mjs | P1-03, P1-21 | intake-a.md:L336; research-ops.md:L280 |
| parse-record-sections.ts | P1-03, P1-19 | intake-a.md:L322; regulations.md:L308 |
| reachability.mjs | P1-05, P1-07 | capture.md:L168; sources-a.md:L297 |
| seed-fallback-flag.ts | P1-07, P1-23 | capture.md:L170; community-b.md:L282 |
| source-entry-filter.mjs | P1-03, P1-19 | intake-a.md:L322; regulations.md:L307 |
| supabase-server.ts | P1-01, P1-18, P1-19, P1-20, P1-21, P1-24, P1-26 | admin-b.md:L357; auth-db.md:L230; auth-db.md:L261; dash-search.md:L229; dash-search.md:L231; dash-search.md:L238; market.md:L259; regulations.md:L299; regulations.md:L300; regulations.md:L335; research-ops.md:L252; research-ops.md:L268; shell-list.md:L274; shell-list.md:L278; shell-list.md:L279; shell-list.md:L280; shell-list.md:L281 |
| tier1-priority-jurisdictions.ts | P1-05, P1-19 | regulations.md:L338; sources-a.md:L314 |

## B. FEATURES

Source: every row of every register's section 8 "Every feature the old code delivers" table, parsed by script (1061 rows), in lane order. "lane" is the register that names the feature.

| feature | old home | new home | lane | cite |
|---|---|---|---|---|
| Email and password sign-in | login/page.tsx | features/auth/ui/LoginPage | P1-01 | auth-db.md:L326 |
| Magic-link sign-in | login/page.tsx:71-92 | LoginPage | P1-01 | auth-db.md:L327 |
| Sign-up with confirmation email and safe `next` | signup/page.tsx | SignupPage | P1-01 | auth-db.md:L328 |
| Already-registered detection on sign-up | classify-signup-result.mjs, AuthPanel AuthAlreadyRegisteredNotice | SignupPage | P1-01 | auth-db.md:L329 |
| Signed-in user bounced away from /login and /signup | route-policy.ts:72, signup/page.tsx:59-73 | route-policy | P1-01 | auth-db.md:L330 |
| Forgot password, reset link | reset-password/page.tsx | ResetPasswordPage | P1-01 | auth-db.md:L331 |
| Set a new password on the recovery session | update-password/page.tsx | UpdatePasswordPage | P1-01 | auth-db.md:L332 |
| Auth callback with code exchange, profile heal, same-origin return | auth/callback/route.ts | features/auth/api/callback | P1-01 | auth-db.md:L333 |
| Protected-route redirect to /login with the return path | proxy.ts, route-policy.ts | core/auth/route-policy | P1-01 | auth-db.md:L334 |
| Scanner-probe 404 before any auth work | route-policy.ts:12-16, proxy.ts:32 | route-policy | P1-01 | auth-db.md:L335 |
| Client identity seed: user, org, role, sectors, admin bit, with bounded retry and rearm | identity/route.ts, server-bootstrap.ts, AuthProvider.tsx, identity-loader.ts | features/auth/api/identity, core/auth/identity, ui/AuthProvider | P1-01 | auth-db.md:L336 |
| Three-valued orgId so "No workspace yet" never shows while loading | AuthProvider.tsx:15-46 | ui/AuthProvider | P1-01 | auth-db.md:L337 |
| Cross-tab sign-in and sign-out sync; sign-out | AuthProvider.tsx:212-245 | ui/AuthProvider | P1-01 | auth-db.md:L338 |
| Platform-admin gate for pages, routes and the nav flag | admin.ts, platform-admin-gate.ts, route-guard.ts | core/auth/platform-admin, guards | P1-01 | auth-db.md:L339 |
| Worker-secret guard | worker-auth.ts | guards | P1-01 | auth-db.md:L340 |
| Per-user and per-IP rate limit, 60 per minute, 429 with Retry-After | rate-limit.ts | guards | P1-01 | auth-db.md:L341 |
| Bearer fetch helper for browser modules | authed-fetch.ts | kept as is | P1-01 | auth-db.md:L342 |
| Create an organisation for self with sectors, size band, regions, job title | orgs/route.ts, create-org.mjs | api/orgs-create | P1-01 | auth-db.md:L343 |
| Org read: name, slug, plan, owner since, member count | [org_id]/route.ts GET | api/org | P1-01 | auth-db.md:L344 |
| Org rename and slug change (owner) | [org_id]/route.ts PATCH | api/org | P1-01 | auth-db.md:L345 |
| Member list with display names | members GET | api/members | P1-01 | auth-db.md:L346 |
| Role change with the last-owner guard | members PATCH | api/members | P1-01 | auth-db.md:L347 |
| Org-scoped ban with typed reason, ban-then-delete order | members POST | api/members | P1-01 | auth-db.md:L348 |
| Member removal, owner cannot remove self or the last owner | members DELETE | api/members | P1-01 | auth-db.md:L349 |
| Add an existing account by email with the ban check | members PUT | api/members | P1-01 | auth-db.md:L350 |
| Invite by email with a role; invite URL returned; email delivery state shown honestly | invitations/route.ts POST | api/invitations | P1-01 | auth-db.md:L351 |
| List invitations with lazy expiry | invitations/route.ts GET | api/invitations | P1-01 | auth-db.md:L352 |
| Revoke an invitation, scoped to the URL's org | invitations/[id]/route.ts | api/invitation-revoke | P1-01 | auth-db.md:L353 |
| Invitation lookup, accept, decline by token | invitations/[token]/* | api/invitation-token | P1-01 | auth-db.md:L354 |
| My pending invitations by email | invitations/mine | api/invitations-mine | P1-01 | auth-db.md:L355 |
| Invitation landing page gate | invitations/[token]/page.tsx | ui/InvitationPage | P1-01 | auth-db.md:L356 |
| Profile row provisioning and heal | provision-personal-workspace.ts | core/auth/ensure-profile | P1-01 | auth-db.md:L357 |
| Account menu: profile, settings, sign out, Admin tag | UserMenuDropdown.tsx | P1-18 UserMenu | P1-01 | auth-db.md:L358 |
| Auth frame: identity panel, band legend, legal disclaimer, one-column mobile | AuthFrame.tsx | ui/AuthFrame | P1-01 | auth-db.md:L359 |
| Lossless paginated reads and exact counts | paginate.mjs | core/db/paginate | P1-01 | auth-db.md:L360 |
| Scrape and generation pause gates, fetch-entry 503 | pause.ts | P1-05/06 sources | P1-01 | auth-db.md:L361 |
| The five surfaces' server reads (dashboard, lists, detail, watchlist, operations, market, research, sources admin) | supabase-server.ts | surface read modules (ids owed) | P1-01 | auth-db.md:L362 |
| LinkedIn identity verification import (writes `verification_tier`, `linkedin_verified`) | api/auth/linkedin/* | NOT PORTED as code (unwired, no UI, three env vars). The requirement, a verification tier on a community profile, is P1-22/23's; recorded here so it is not lost | P1-01 | auth-db.md:L363 |
| Workspace profile read with a conservative default (modes, lanes, verticals, jurisdictions, roles, sizes) | lib/workspace/profile.ts | core/workspace/profile | P1-02 | workspace.md:L349 |
| ADR-034 role and size vocabulary, validator, parser, compliance-tag to role map | lib/profile/profile-contract.mjs | core/workspace/profile | P1-02 | workspace.md:L350 |
| Relevance lens per item: band, matched modes, verticals, jurisdictions, role signals, summary line | lib/workspace/relevance.mjs:201-280 | core/workspace/relevance | P1-02 | workspace.md:L351 |
| Obligation-grain applicability and binding lines with the three cost slots | relevance.mjs:123-158 | core/workspace/relevance | P1-02 | workspace.md:L352 |
| Current obligation objects for an item (supersession-aware), read with the injected client | relevance.mjs:161-195 | core/workspace/relevance | P1-02 | workspace.md:L353 |
| Per-viewer relevance for a detail page, fail soft | lib/workspace/viewer-relevance.ts | core/workspace/viewer-relevance | P1-02 | workspace.md:L354 |
| Priority override per item, with dismissal cleared | overrides POST; resourceStore updatePriority | api/overrides; item-state-store | P1-02 | workspace.md:L355 |
| Dismiss to the stash and restore | overrides POST (`dismissed_at`); resourceStore dismissResource, restoreDismissed | api/overrides; item-state-store | P1-02 | workspace.md:L356 |
| Org-scoped owner on an item, member-checked, attributed | overrides POST (`ownerUserId`); resourceStore setOwner | api/overrides; item-state-store | P1-02 | workspace.md:L357 |
| Team archive: owner or admin, required reason, attribution, watcher and owner notification, ungated restore | overrides POST; resourceStore archiveResource, restoreResource | api/overrides; item-state-store | P1-02 | workspace.md:L358 |
| Personal archive and restore with an optional note, ungated | personal-state POST, DELETE; resourceStore archivePersonal, restorePersonal | api/personal-state; item-state-store | P1-02 | workspace.md:L359 |
| My personally archived items | personal-state GET; bootstrap loadPersonalState | api/personal-state (shared loader) | P1-02 | workspace.md:L360 |
| Truthful pre-archive warning: CRITICAL, owner, watchers by name (capped), team watchlist, already archived | archive-impact/route.ts | api/archive-impact | P1-02 | workspace.md:L361 |
| The archive dialog with the two-scope choice, "just me" default, impact preview, server message on refusal | components/workspace/ArchiveDialog.tsx | features/workspace/ui/ArchiveDialog | P1-02 | workspace.md:L362 |
| The archive list with team and personal rows labelled, search, reason filter, restore per scope, replacement link | components/settings/ArchiveViewer.tsx | features/workspace/ui/ArchiveViewer | P1-02 | workspace.md:L363 |
| The merge layer: platform then org override then personal, dismissed to the stash | resourceStore mergeWithOverrides | features/workspace/state/merge | P1-02 | workspace.md:L364 |
| Per-user bootstrap bundle after paint: personal state, members, admin attention, overrides, nav counts, assistant flag, Server-Timing | bootstrap/route.ts, logic.ts | api/bootstrap | P1-02 | workspace.md:L365 |
| Workspace notes on an item: list, add, edit own, soft-delete (author, owner, admin) | item-notes.mjs, notes/route.ts | api/notes | P1-02 | workspace.md:L366 |
| Multi-person assignment with due date, notification, open or done, remove; viewers cannot be assigned | item-assignments.mjs, assignments/route.ts | api/assignments | P1-02 | workspace.md:L367 |
| The one collab preamble: org, role, verified item by uuid or legacy id | item-collab-route.ts, item-collab-shared.mjs | core/workspace/roster | P1-02 | workspace.md:L368 |
| Workspace tags: list with counts, applied tags and "applied by <name> on <date>" per item, item-to-tags map, create (duplicate returns existing), delete with cascade | tags/route.ts | api/tags | P1-02 | workspace.md:L369 |
| Apply a tag to an item keeping the first applier; remove | tags/[id]/items/route.ts | api/tags | P1-02 | workspace.md:L370 |
| Portfolios: list, create (duplicate returns existing), detail with roll-ups, rename, delete, add and remove members (items or entities), viewer read-only | portfolios/* | api/portfolios (logic owner owed) | P1-02 | workspace.md:L371 |
| Account page: tab row with live counts, personal form (name, headshot URL, bio), work email read-only | UserProfilePage.tsx PersonalTab | features/account | P1-02 | workspace.md:L372 |
| Organisation name and slug (owner), workspace record disclosure | OrganizationPanel.tsx | features/account | P1-02 | workspace.md:L373 |
| Members and roles: list with joined dates, role change, remove, org-scoped ban with typed confirmation, invite by email with copyable link and honest delivery state, pending count, seat strip as Absence | MembersPanel.tsx | features/account | P1-02 | workspace.md:L374 |
| Read-only sector profile summary (from the workspace) and home jurisdictions summary (from the profile) with links to Settings | UserProfilePage.tsx SectorProfileTab, JurisdictionsTab | features/account | P1-02 | workspace.md:L375 |
| Verifier badge request through the `request_verification` rpc, status headline | UserProfilePage.tsx VerifierTab | features/account (P1-22/23 renders the badge) | P1-02 | workspace.md:L376 |
| Activity tab: honest "not yet recorded" placeholder | UserProfilePage.tsx ActivityTab | features/account (the feature itself is not built; the placeholder stays until per-account activity events exist) | P1-02 | workspace.md:L377 |
| Stat rail: sectors followed with highlighted niches, home jurisdictions, member since, plan | UserProfilePage.tsx:419-446 | features/account | P1-02 | workspace.md:L378 |
| Quick links card | UserProfilePage.tsx QuickLinksRail | features/account | P1-02 | workspace.md:L379 |
| `?tab=` deep link into the account page | lib/account/initial-tab.ts | features/account/lib | P1-02 | workspace.md:L380 |
| Notification preferences: four toggles, invitations locked on, defaults seeded at onboarding | NotificationPreferences.tsx; OnboardingWizard seedNotificationDefaults | features/account/ui/NotificationPreferences | P1-02 | workspace.md:L381 |
| No-workspace landing: job title, pending invitations with accept and decline, paste a link or token, create an organisation with sectors, headcount band, regions; owner on create | NoWorkspaceLanding.tsx | features/onboarding | P1-02 | workspace.md:L382 |
| Onboarding step 2: modes and home jurisdictions to the profile, with real band counts as the preview | OnboardingWizard.tsx StepModesJurisdictions | features/onboarding | P1-02 | workspace.md:L383 |
| Onboarding step 3: sectors with highlighted niches to `workspace_settings.sector_profile` and the workspace store | OnboardingWizard.tsx StepSectors | features/onboarding | P1-02 | workspace.md:L384 |
| Onboarding step 4: the briefing schedule card | OnboardingWizard.tsx StepBriefing | features/onboarding (mounts features/settings BriefingScheduleSection) | P1-02 | workspace.md:L385 |
| Onboarding done step, Skip for now, Back | OnboardingWizard.tsx StepDone, :220-225 | features/onboarding | P1-02 | workspace.md:L386 |
| The four-pill stepper shared by both routes | OnboardingStepper.tsx | features/onboarding | P1-02 | workspace.md:L387 |
| Invitation landing: details, email mismatch warning, accept to "/", decline | InvitationLandingPage.tsx | features/onboarding | P1-02 | workspace.md:L388 |
| The two onboarding gates (no org to /workspace/new; has org to "/") | app/onboarding/page.tsx, app/workspace/new/page.tsx | features/onboarding pages | P1-02 | workspace.md:L389 |
| Organisation profile: roles and size bands, key-wise save, validation | OrganisationProfileSection.tsx | features/settings | P1-02 | workspace.md:L390 |
| Briefing schedule: cadence, day, time in the reader's zone, jurisdiction weighting, "Saved to <workspace>" | BriefingScheduleSection.tsx | features/settings (made to load and save: section 3 rank 1) | P1-02 | workspace.md:L391 |
| Dashboard defaults: six region toggles, default sort, export format, briefing day, alert priorities, persisted per workspace | settingsStore.ts | features/settings/state (made to load: section 3 rank 1) | P1-02 | workspace.md:L392 |
| Supersession history list | SupersessionHistory.tsx | features/settings | P1-02 | workspace.md:L393 |
| Named saved searches (query plus workspace tags) with Open and delete | SavedSearchesSection.tsx | NOT PORTED as code (browser-only storage, recall params unread). The feature, a workspace-scoped saved view, needs a ruling and a table; recorded here so it is not lost | P1-02 | workspace.md:L394 |
| Data summary: active, archived, jurisdictions, topics with a coverage bar | DataSummary.tsx | NOT PORTED as code. The Coverage page (/dashboard/coverage, COV-1) answers the question with the six-state vocabulary; a ruling confirms the settings card is not wanted beside it [HYPOTHESIS] | P1-02 | workspace.md:L395 |
| Client tenant identity: orgId, orgName, userRole, sectorProfile | workspaceStore.ts | core/workspace/store | P1-02 | workspace.md:L396 |
| Jurisdiction and sector weights in the client store | workspaceStore.ts:16-20 | NOT PORTED (never set; the two readers always see null). If per-workspace weights are wanted, `workspace_settings.jurisdiction_weights` already exists and profile.ts reads it | P1-02 | workspace.md:L397 |
| Sector synopses, intelligence changes and sector display names in the store | resourceStore.ts:106-129, 222-245 | NOT PORTED (shelved feature, unmounted reader, no writer); the shelf ruling stands | P1-02 | workspace.md:L398 |
| List filters, sort and sector-session state in the store | resourceStore.ts:59-70, 137-143, 526-567 | NOT PORTED (0 readers; the list surfaces carry their own URL state) | P1-02 | workspace.md:L399 |
| Tab navigation store with focus views | navigationStore.ts | NOT PORTED (one live action; the two consumers link to item pages) | P1-02 | workspace.md:L400 |
| Admin source registry filters and view | sourceStore.ts | P1-05/06 (or P1-25/26) | P1-02 | workspace.md:L401 |
| Source trust types and promotion and demotion tables | types/source.ts | P1-05/06, minus the dead tables and event types | P1-02 | workspace.md:L402 |
| The shared item type | types/resource.ts | core/types/item | P1-02 | workspace.md:L403 |
| LinkedIn profile import into onboarding (identity and headline prefill; `linkedin_*` and `verification_tier` on profiles) | OnboardingWizard.tsx:42-56 (the prior wizard's path, removed 2026-09-06); api/auth/linkedin/* (P1-01 TRASH as code) | IN FLIGHT, NOT DROPPED: the operator deferred it ("we will do the linkedin sign up later", DEVIATION-LOG 2026-09-07). The destination columns exist (migration 007). The feature belongs to onboarding (this module) with P1-01's auth chain and P1-22/23's verification tier; it is recorded here and in P1-01 section 8 so no port lane loses it | P1-02 | workspace.md:L404 |
| Start a brief run for one item by id or source_url, admin only, verified short-circuit, one-hour cooldown, fail-closed guards | api/agent/run/route.ts | features/intake/api/run | P1-03 | intake-a.md:L410 |
| Durable chained workflow with per-step run records and the ground ladder (re-ground, structural hold, erase) | workflows/generate-brief.ts | features/intake/workflow | P1-03 | intake-a.md:L411 |
| Generation pause and Layer C data-audit block halt with dated waivers | generate-brief.ts preflightStep 90-143; audit-gate.ts 139-159 | workflow preflight; gates.ts | P1-03 | intake-a.md:L412 |
| Daily estimated-spend cap | generate-brief.ts 46-51, 137-142 | NOT PORTED: no spend | P1-03 | intake-a.md:L413 |
| Fresh-fetch synthesis: primary fetch through the transport ladder, corroborator discovery, Sonnet synthesis | canonical-pipeline.ts generateBrief 1221-1316, fetchPrimaryDeep 622-690 | NOT PORTED as a model call; the fetch primitive is P1-07's; the author reads the pool | P1-03 | intake-a.md:L414 |
| Synthesis from the stored pool | generateBriefFromStored 1323-1352 | NOT PORTED as a model call; replaced by injectBrief over the stored pool | P1-03 | intake-a.md:L415 |
| Refresh the primary and re-synthesise | generateBriefRefreshPrimary 1412-1466 (0 callers), reresearchStep | NOT PORTED; a hold for the session with the failure classes named | P1-03 | intake-a.md:L416 |
| Session-authored brief with pool-hash staleness gate, record-grade gate, slot-coverage refusal | generateBriefFromInjected 1370-1402, synthesiseAndWriteBrief injected branch 925-940, buildInjectedFrontmatter 810-862 | features/intake/pipeline injectBrief (object validated directly, no YAML round trip) | P1-03 | intake-a.md:L417 |
| The one brief write site: body plus 25 fields, related_items edges, planning-assumption context, marker refusal | writeSynthesizedBrief 1062-1177, buildPlanningAssumptionContext 864-896 | pipeline writeBrief | P1-03 | intake-a.md:L418 |
| The 26-field contract, five formats, sixteen rules, slot directive, New Sources table, mentioned_terms | system-prompt.ts, slot-prompt.mjs | core/brief/contract (author instruction and validator from one table) | P1-03 | intake-a.md:L419 |
| YAML and ledger parsing tolerant of model drift (fences, block lists, stray lines, lenient ledger) | parse-output.ts 254-378, 921-959, 1030-1035 | NOT PORTED: the input is an object | P1-03 | intake-a.md:L420 |
| Field validation: enums, locked severity-to-priority, closed vocabularies with adopted terms, format gates, candidate banking | parse-output.ts 380-827; metadata-vocab.ts | core/brief/validate, vocab | P1-03 | intake-a.md:L421 |
| Claim record validation and content-first cross-link to pool rows | parse-output.ts 837-899, 969-1003 | core/brief/validate | P1-03 | intake-a.md:L422 |
| Ledger-preserving sectioning into intelligence_item_sections per format | sectionBrief 1541-1599; formats/*; prose-extractor; extract-sections | pipeline sectionBrief; core/brief/sections | P1-03 | intake-a.md:L423 |
| Timeline harvest from the format's timeline section | harvestItemTimeline 1484-1539; timeline-section.mjs; timeline-parse; timeline-harvest | pipeline harvestTimeline; core/brief/timeline | P1-03 | intake-a.md:L424 |
| Undated-item date derivation (title, Federal Register, legislation.gov.uk, forward event, dateline, captured, recorded) | timeline-backfill-derive.mjs | core/brief/timeline (needs its caller restored: ADR-030) | P1-03 | intake-a.md:L425 |
| Grounding: acquire lock, cited-host gate, error-body gate, target match, model ledger extraction, verbatim kept filter, slot forcing with a judge, floor-first re-attribution, resolver tier stamp, dominance guard, Gate A and B, non-destructive apply, mint gates, citation edges, provenance validation | groundBriefImpl 1624-2287 and its helpers | core/grounding/ground over pool, ledger, gates, slots (the model extraction and the judge replaced by the author) | P1-03 | intake-a.md:L426 |
| Register cited sources and grow credibility from the brief | registerBriefSources, growSources 2295-2335 | pipeline registerBriefSources, growSources | P1-03 | intake-a.md:L427 |
| Surface capture exclusions and null-tier hosts as integrity flags | surfaceCaptureExclusions 338-355, surfaceNullTierHosts 356-388; null-tier-flag.mjs | pipeline; gates.ts | P1-03 | intake-a.md:L428 |
| Truncation guard: a bound capture or section is surfaced, never silent | recordTruncation 311-337; section-grounding.mjs; source-blocks.mjs ceiling walls | pool.ts; config.ts | P1-03 | intake-a.md:L429 |
| Cross-item audit gate per write and the pre-write baseline | audit-gate.ts, audit-gate-core.mjs | gates.ts | P1-03 | intake-a.md:L430 |
| Link step: candidate connections and edges after a ground | generate-brief.ts linkStep 277-290 (P1-09 code) | workflow (calls P1-09) | P1-03 | intake-a.md:L431 |
| Cache flush of the item after a run | revalidateItemStep 479-521 | workflow (through the P1-01 route guard, not a raw fetch) | P1-03 | intake-a.md:L432 |
| Live URL re-check of a claim span | span-check.ts, spanCheckClaim | NOT PORTED (0 callers); P1-07's capture refresh and the kept filter cover it | P1-03 | intake-a.md:L433 |
| Research-or-erase: null the brief, hold the item, remove derived rows | eraseStep 371-431 | workflow erase | P1-03 | intake-a.md:L434 |
| Erase a claim only with archived proof | eraseClaimWithProof (0 callers) | ledger.ts with a caller in the erase step | P1-03 | intake-a.md:L435 |
| Structured regulation sections for the detail surface (actions with severity chips, prose with source, obligations table, timeline, sources table) | extract-regulation-sections.ts | core/brief/regulation-sections (surface id owed) | P1-03 | intake-a.md:L436 |
| Record-grade fact rows with tier chips, key-date split | parse-record-sections.ts | core/brief/regulation-sections | P1-03 | intake-a.md:L437 |
| Recommended actions with verb, timeframe, explicit due date | extract-recommended-actions.mjs | core/brief/regulation-sections | P1-03 | intake-a.md:L438 |
| Sources-tail strip and placeholder-name filter for rendering | brief-section-strip.mjs, source-entry-filter.mjs | core/brief/sections | P1-03 | intake-a.md:L439 |
| Operations S3/S4 eligibility with honest omit notes | formats/operations-matrix.ts | Operations surface read module (id owed) | P1-03 | intake-a.md:L440 |
| Operations data block for the assistant | operations-ask-context.mjs | assistant route owner (id owed) | P1-03 | intake-a.md:L441 |
| First-fetch page classification (portal or document, item_type, domain, surfaces, relevance) | first-fetch-classify.ts | core/intake/classify-verdict: session-authored verdict, code-validated (the metered call NOT PORTED) | P1-03 | intake-a.md:L442 |
| Candidate source verification scores and trust tier | haiku-classify.ts | NOT PORTED as a model call; tier from the institution class table (P1-05), relevance session-authored | P1-03 | intake-a.md:L443 |
| Assistant skill subset | skill-loader.ts | NOT PORTED here; the assistant route's owner decides | P1-03 | intake-a.md:L444 |
| Spend chokepoint, ticket, necessity gate, priced line, regime, unlogged-call invariant, metered wall, gauge | src/lib/llm/* | NOT PORTED: no spend. The agent_runs history stays; P1-25 decides whether the health tile shows it | P1-03 | intake-a.md:L445 |
| Model ids, price tables, cache-savings telemetry, two-pass truncation recovery, SSE transport with watchdog | model-ids.mjs, generation-config.ts rates, prompt-cache.mjs, two-pass-generate.mjs, anthropic-stream.mjs, anthropic-error.mjs | NOT PORTED | P1-03 | intake-a.md:L446 |
| Size doctrine knobs (storage sanity ceiling, synthesis window, floor hard ceiling, fetch concurrency) | generation-config.ts 15-49 | core/grounding/config | P1-03 | intake-a.md:L447 |
| JS mirror of the SQL citation-URL canonicaliser | url-canon.mjs | core/grounding/url-canon | P1-03 | intake-a.md:L448 |
| Contract version stamp on every written brief | contract-version.mjs | core/brief/contract | P1-03 | intake-a.md:L449 |
| Materialise a staged new_item through the chokepoint | apply-staged-update.ts 201-267 | staged-transit | P1-04 | intake-b.md:L327 |
| Entity gate: a portal root URL is a source, not an item | apply-staged-update.ts 226-234 | staged-transit | P1-04 | intake-b.md:L328 |
| update_item with flywheel participation on substantive change | apply-staged-update.ts 46-99, 268-288 | staged-transit + participation | P1-04 | intake-b.md:L329 |
| status_change and archive_item | apply-staged-update.ts 289-299, 323-337 | staged-transit | P1-04 | intake-b.md:L330 |
| new_source with source_role at birth | apply-staged-update.ts 300-322 | staged-transit (role classifier from P1-05) | P1-04 | intake-b.md:L331 |
| Idempotent mint by source_url and legacy_id | mint-item.ts 139-153 | mint | P1-04 | intake-b.md:L332 |
| Congruence retype (1a) and seek-study flag (1b) | mint-item.ts 155-165, 410-423 | mint + participation | P1-04 | intake-b.md:L333 |
| Subject-existence dedup with news-to-primary linking | mint-item.ts 167-196, 270-284 | mint + participation | P1-04 | intake-b.md:L334 |
| Relevance floor flag (surface-only) | mint-item.ts 198-200, 424-445 | mint + participation | P1-04 | intake-b.md:L335 |
| Domain canonicalisation and format_type stamp | mint-item.ts 202-225 | mint | P1-04 | intake-b.md:L336 |
| Source-link invariant with registry lookup | mint-item.ts 227-246 | mint | P1-04 | intake-b.md:L337 |
| Dry mint verdict identical to apply | mint-item.ts 248-256 | mint | P1-04 | intake-b.md:L338 |
| Typed lineage links at birth | mint-item.ts 285-310 | participation | P1-04 | intake-b.md:L339 |
| Connection discovery after mint and update | mint-enrichment.ts 41-47; flywheel-steps.mjs 27-36 | participation | P1-04 | intake-b.md:L340 |
| Forward-event extraction with dedupe and stale report | flywheel-steps.mjs 53-107; mint-enrichment.ts 49-61 | participation | P1-04 | intake-b.md:L341 |
| compliance_deadline sync | mint-item.ts 341-347; apply-staged-update.ts 159-165 | participation | P1-04 | intake-b.md:L342 |
| Entity spine linking | mint-item.ts 355-365; apply-staged-update.ts 173-191 | participation | P1-04 | intake-b.md:L343 |
| Title-derived timeline row at birth | mint-item.ts 377-408 | participation | P1-04 | intake-b.md:L344 |
| Rule-16(d) defect flags | flywheel-defect.ts | participation | P1-04 | intake-b.md:L345 |
| One-invocation intake cycle with plan mode | run-intake-cycle.ts 321-504 | cycle | P1-04 | intake-b.md:L346 |
| Record-only mint with the candidate's own text as the pool row | run-intake-cycle.ts 362-451; pool-row-contract.mjs | cycle | P1-04 | intake-b.md:L347 |
| Brief-grade grounding after a mint | run-intake-cycle.ts 453-489 | cycle, through the injected-brief seam only (no metered call) | P1-04 | intake-b.md:L348 |
| Change-sweep update_item drain with $0 re-verify and re-validate | run-intake-cycle.ts 187-319 | change-sweep-drain | P1-04 | intake-b.md:L349 |
| Portal deep-link ledger persistence | portal-harvest.ts 24-43 | portal-ledger | P1-04 | intake-b.md:L350 |
| Keyset page with census anti-join | portal-harvest.ts 238-324 | portal-ledger | P1-04 | intake-b.md:L351 |
| Pre-fetch verdict gate (no fetch without a classification source) | portal-harvest.ts 168-188, 354-378 | portal-ledger | P1-04 | intake-b.md:L352 |
| Access-wall and 200-character floor on fetched text | portal-harvest.ts 393-405 | portal-ledger | P1-04 | intake-b.md:L353 |
| Classification of a candidate (entity verdict, type, surface tags) | portal-harvest.ts 409-436 | portal-ledger, from the session verdict file (not metered) | P1-04 | intake-b.md:L354 |
| Dry pre-pass, exists-promote, reject stamp | portal-harvest.ts 449-472 | portal-ledger | P1-04 | intake-b.md:L355 |
| Max-promote cap | portal-harvest.ts 483-497; promote-cap.mjs | portal-ledger | P1-04 | intake-b.md:L356 |
| Ledger disposition stamps from the cycle trail | portal-harvest.ts 498-521 | portal-ledger | P1-04 | intake-b.md:L357 |
| Record-grade verbatim slot extraction with prose and bare-domain guards | record-facts.mjs 55-394 | record-facts | P1-04 | intake-b.md:L358 |
| Binding position from applicability language | record-facts.mjs 408-479 | record-facts | P1-04 | intake-b.md:L359 |
| Due date with precision | record-facts.mjs 490-563 | record-facts | P1-04 | intake-b.md:L360 |
| Corridor identity from a UN/LOCODE pair and mode | record-facts.mjs 577-649 | record-facts | P1-04 | intake-b.md:L361 |
| EUR-Lex in-force status from the indicator widget | record-facts.mjs 685-737 | record-facts | P1-04 | intake-b.md:L362 |
| EU-act self-description slots (operative provision, addressee, confirmed measure) | record-facts.mjs 171-189, 788, 829-834 | record-facts | P1-04 | intake-b.md:L363 |
| Stub full_brief from claim text with the stub marker | record-facts.mjs 845-863 | record-facts | P1-04 | intake-b.md:L364 |
| Record mint payload | record-facts.mjs 904-1010 | record-facts | P1-04 | intake-b.md:L365 |
| Research profile slots (finding, limits, relevance, does-not-resolve, key figure, evidence and authority signals) | record-facts-research.mjs | record-facts (one claim per slot) | P1-04 | intake-b.md:L366 |
| Ordered item write sequence (searches, sections, Gate A, claims, citations) | write-item.ts | write-item | P1-04 | intake-b.md:L367 |
| Number envelope with derivation, as-of triple, precision, delta units | envelope.mjs | core/contracts/envelope | P1-04 | intake-b.md:L368 |
| Freshness derivation including frozen | envelope.mjs 194-243 | core/contracts/envelope | P1-04 | intake-b.md:L369 |
| Aggregate propagation (weakest origin, least contractable, worst freshness) | envelope.mjs 296-330 | core/contracts/envelope | P1-04 | intake-b.md:L370 |
| obs_status, origin_class, binding_position, duty_holder_class, freshness, coverage_state, suppression reasons, transport modes | vocabularies.mjs | core/contracts/vocabularies | P1-04 | intake-b.md:L371 |
| Admiralty, pedigree band, likelihood ladder, impact x applicability, typed relations (spec-defined, no reader yet) | vocabularies.mjs 134-261, 263-283, 371-404 | core/contracts/vocabularies, ported with their first reader (recorded here so they are not lost) | P1-04 | intake-b.md:L372 |
| Emission-factor tiers, scopes, validation | factor-tier.mjs 12-210 | core/contracts/factor-tier | P1-04 | intake-b.md:L373 |
| Active-factor selection and primary-data share (no caller yet) | factor-tier.mjs 212-303 | core/contracts/factor-tier, wired to the first factor reader | P1-04 | intake-b.md:L374 |
| SQL generators for migration 258 | factor-tier.mjs 305-403; source-licence.mjs 380-434 | core/contracts, with the byte-compare proof | P1-04 | intake-b.md:L375 |
| Licence register, embed gate, attribution strings | source-licence.mjs | core/contracts/source-licence | P1-04 | intake-b.md:L376 |
| Verbatim grounding for producer candidates | verbatim-grounding.mjs | core/contracts/verbatim | P1-04 | intake-b.md:L377 |
| Source Axis 3/4/5 classification with auto-adoption | src/lib/classification/*; scripts/classification/* | features/sources/axes + classify-sources (P1-05 home) | P1-04 | intake-b.md:L378 |
| Drift auto-resolution to the observed distribution | apply-classifications.mjs 579-659 | classify-sources | P1-04 | intake-b.md:L379 |
| Zero-proposal re-derivation from the class table | apply-classifications.mjs 413-568 | classify-sources | P1-04 | intake-b.md:L380 |
| Human-ratified classification apply (`--flag`, `--all-ratified`) | apply-classifications.mjs 18-170 | NOT PORTED: superseded by the 2026-09-03 auto-adopt ruling and the ADR-030 rider; recorded here | P1-04 | intake-b.md:L381 |
| Axis-5 tie-break routing of an item and the item-anomaly check | routing.mjs 13-54 | NOT PORTED: never wired; the anomaly detector was retired (D17 family 5); recorded here | P1-04 | intake-b.md:L382 |
| $0 cheap re-verify of quarantined items | regen-quarantined.mjs | quarantine/resolver | P1-04 | intake-b.md:L383 |
| Disposition planning with reason classes and deferral candidates | plan-quarantine-disposition.mjs | quarantine/planner | P1-04 | intake-b.md:L384 |
| $0 floor-first re-attribution | free-pass-run.mjs | quarantine/rehome | P1-04 | intake-b.md:L385 |
| Instrument-id confirm and stamp | id-stamp.mjs | quarantine/id-stamp | P1-04 | intake-b.md:L386 |
| Tombstone-then-delete (erase leg) | tombstone-delete.mjs | quarantine/erase (deterministic gate) | P1-04 | intake-b.md:L387 |
| Injected-ledger grounding entry | executor-ground.mjs | cli/ground-injected | P1-04 | intake-b.md:L388 |
| Per-item mutation lease CLI | lease.mjs | P1-08 harness (lease library); the CLI is not ported | P1-04 | intake-b.md:L389 |
| Target-match report over non-verified items | target-match-probe.mjs | NOT PORTED as a script; the same verdict is computed inside quarantine/id-stamp and is a query for the admin quarantine view (P1-25/26) | P1-04 | intake-b.md:L390 |
| Intake gate golden cases | intake-url-corpus.mjs | test fixtures (Proof 1) | P1-04 | intake-b.md:L391 |
| Source-less live tripwire | source-link-invariant.mjs | INV-093 proof query | P1-04 | intake-b.md:L392 |
| One institution, one tier; grounding stamp from base_tier only | institution.ts | core/sources/institution | P1-05 | sources-a.md:L395 |
| Exact-host admin override honoured at grounding | institution.ts:69, 76 | core/sources/institution | P1-05 | sources-a.md:L396 |
| Suspended sources never selected at grounding | institution.ts:61-65 | core/sources/institution | P1-05 | sources-a.md:L397 |
| Deterministic class tier for a new host (legal, gov, verifier, academic, association, standards body, analysis, law firm, news, company) | host-authority.ts | core/sources/host-class | P1-05 | sources-a.md:L398 |
| Ruled host instances and committed host verdict batches | host-authority.ts:193-214, 537-634 | core/sources/host-class, host-class-data | P1-05 | sources-a.md:L399 |
| Never-register classes with a re-attribution message | host-authority.ts:174-228; null-tier-host-worklist.mjs | host-class, features/sources/null-tier | P1-05 | sources-a.md:L400 |
| D14 residue rules over registry names, order-independent across names | host-authority.ts:230-535 | core/sources/host-class | P1-05 | sources-a.md:L401 |
| Register-at-grounding decision (inherit, register, worklist) | host-authority.ts:636-659; source-growth.ts:349-390 | host-class, features/sources/growth | P1-05 | sources-a.md:L402 |
| source_role, institutional type and source_type classifiers | classify-source-role.ts, vertical-fit.ts, source-type-taxonomy.mjs | core/sources/classify | P1-05 | sources-a.md:L403 |
| Trust score: accuracy 40, timeliness 20, reliability 20, citation 20, blended with a tier prior | trust.ts:14-187 | core/sources/trust-score | P1-05 | sources-a.md:L404 |
| Trust-score plan with distribution and per-tier averages | trust.ts:1211-1264 | core/sources/trust-score | P1-05 | sources-a.md:L405 |
| Citation network: tier-weighted, 20-month half-life decay, promotion at weighted sum 2.5 and 3 citations | trust.ts:189-279, 689-838 | core/sources/tier-movement | P1-05 | sources-a.md:L406 |
| Promotion and demotion evaluators, cadence-held trigger | trust.ts:332-503, 1266-1299 | core/sources/tier-movement | P1-05 | sources-a.md:L407 |
| Tier opinions move a tier (3 opinions, 2 opiners, 90 days), class-table opinions excluded | trust.ts:863-934 | core/sources/tier-movement | P1-05 | sources-a.md:L408 |
| Scored prediction outcomes move a tier (5 outcomes, 365 days) | trust.ts:936-1007 | core/sources/tier-movement | P1-05 | sources-a.md:L409 |
| One clamped effective-tier calculator, plan, apply with audit events and override skip | trust.ts:1039-1127, 1418-1606; tier-override-guard.mjs | core/sources/tier-movement | P1-05 | sources-a.md:L410 |
| Per-source reputation recompute after new citations | trust.ts:1301-1416; source-growth.ts:392-442 | tier-movement, growth | P1-05 | sources-a.md:L411 |
| Cited-source registration (existing, new at class tier, provisional worklist with reason) | source-growth.ts:101-251 | features/sources/growth | P1-05 | sources-a.md:L412 |
| Citation edges, syndication-collapsed convergence, compounded credibility columns | source-growth.ts:10-57, 253-334 | features/sources/growth | P1-05 | sources-a.md:L413 |
| "New Sources Identified" table parsing | source-growth.ts:274-298 | features/sources/growth (no default tier) | P1-05 | sources-a.md:L414 |
| Free-brief entry citations: claim URLs and cited source ids | source-growth.ts:444-584 | features/sources/growth | P1-05 | sources-a.md:L415 |
| Tier-opinion recording (agent estimate and class table) | tier-opinion-writer.ts; source-growth.ts:166-202 | features/sources/growth | P1-05 | sources-a.md:L416 |
| Cited-host gate against cross-run self-licensing | cited-host-gate.mjs; source-growth.ts:371-375 | features/sources/growth | P1-05 | sources-a.md:L417 |
| Customer tier (override, effective, base) and tier labels and legend span | customer-source-tier.ts, tier-labels.ts | core/sources/tier-contract | P1-05 | sources-a.md:L418 |
| Bias-tag vocabulary, adoption band, writer, labels, chips, legend, lower-confidence mark | bias-tag-pipeline.mjs, credibility/* | core/sources/bias-tags | P1-05 | sources-a.md:L419 |
| Candidate source verification with audit log (W2.F) | verification.ts | features/sources/verify-candidate (no model call) | P1-05 | sources-a.md:L420 |
| Haiku relevance and freight scoring of a candidate | verification.ts:195-231, 466-564 | NOT PORTED as a model call; deterministic vertical fit plus a session-authored verdict batch | P1-05 | sources-a.md:L421 |
| Haiku tier recommendation for the tier-audit panel | recommend-source-tier.ts | NOT PORTED as a model call; the panel shows the class placement and the verdict seam | P1-05 | sources-a.md:L422 |
| Provisional to active promotion with canonical-URL dedup | promote-provisional.ts | features/sources/provisional | P1-05 | sources-a.md:L423 |
| Off-vertical re-add refusal | vertical-fit-gate.ts, vertical-fit.ts | features/sources/vertical-fit-gate | P1-05 | sources-a.md:L424 |
| Scrape hold with two signed callers | fetch-hold.mjs | core/fetch/hold | P1-05 | sources-a.md:L425 |
| Global cadence window and next scrape date | scrape-schedule.ts | core/fetch/hold | P1-05 | sources-a.md:L426 |
| Fetch cache with host TTLs | fetch-hold.mjs:56-99 | core/fetch/cache | P1-05 | sources-a.md:L427 |
| Browserless render with stealth and unblock | canonical-fetch.mjs, browserless.ts | NOT PORTED (metered); direct transport and official APIs, NO_REACHABLE_SOURCE hold otherwise | P1-05 | sources-a.md:L428 |
| Charset-aware decode and control-character clean | charset-decode.mjs | core/fetch/direct | P1-05 | sources-a.md:L429 |
| PDF to text | pdf-extract.mjs | core/fetch/direct | P1-05 | sources-a.md:L430 |
| Federal Register and eCFR official APIs | api-transport.mjs | core/fetch/api | P1-05 | sources-a.md:L431 |
| SEC fair-access User-Agent | sec-fair-access.ts | core/fetch/direct | P1-05 | sources-a.md:L432 |
| Failure classes, wall and error-body detection | transport-escalation.mjs, primary-fallback.mjs, access-wall.mjs, entity-gate.mjs, holdings-audit.mjs | core/fetch/classify-body | P1-05 | sources-a.md:L433 |
| Root-URL portal test | entity-gate.mjs:5-15 | core/fetch/classify-body | P1-05 | sources-a.md:L434 |
| Transport escalation ladder with per-attempt exhaustion record | transport-escalation.mjs, transport-runtime.mjs | core/fetch/ladder | P1-05 | sources-a.md:L435 |
| Write-side capture verdict | transport-escalation.mjs:232-256 | core/fetch/ladder | P1-05 | sources-a.md:L436 |
| Three-way reachability and its caller mappings | reachability.mjs, *-decision.mjs | core/fetch/reachability | P1-05 | sources-a.md:L437 |
| Identity-derived candidate URLs (CELEX, ELI, UK SI, FR doc number, lovdata, Irish SI, API hosts, source search surfaces) | identifier-variants.mjs, seek-more.mjs | core/fetch/candidates | P1-05 | sources-a.md:L438 |
| EUR-Lex /TXT to /TXT/HTML rewrite; bounded roadblock fallback | primary-fallback.mjs | core/fetch/candidates | P1-05 | sources-a.md:L439 |
| Exhaustion record persisted as an integrity flag | seek-more.mjs:122-157 | core/fetch/candidates (write checked) | P1-05 | sources-a.md:L440 |
| Held-pool retrieval and pool hash for question answering | seek-more.mjs:199-247 | core/fetch/candidates | P1-05 | sources-a.md:L441 |
| Target-instrument match (EU pair keys, year-like serials, raw ids, own URL, subject overlap) | target-match.mjs | core/sources/target-match | P1-05 | sources-a.md:L442 |
| Officialness gate (path a or b) | officialness.mjs | core/sources/officialness | P1-05 | sources-a.md:L443 |
| Holdings completeness, structural truncation, sufficiency | holdings-audit.mjs | features/sources/holdings-audit | P1-05 | sources-a.md:L444 |
| Holdings-present fetch refusal | holdings-gate.mjs | features/sources/snapshot-verify | P1-05 | sources-a.md:L445 |
| Snapshot store read and write | snapshot-store.mjs | features/sources/snapshots (writer called by P1-07) | P1-05 | sources-a.md:L446 |
| Content fingerprint and change decision | content-change.mjs | features/sources/snapshots | P1-05 | sources-a.md:L447 |
| HEAD freshness probe | freshness-probe.mjs | features/sources/snapshots | P1-05 | sources-a.md:L448 |
| Cheap span verify against the stored snapshot; snapshot-first verification routing; stale flag | cheap-verify.mjs, verify-item.mjs | features/sources/snapshot-verify | P1-05 | sources-a.md:L449 |
| Paid acquire lock and pre-logged justification | acquire-lock.mjs, verify-item.mjs:53-72 | NOT PORTED (the paid path is gone); needs_acquire becomes a P1-07 capture request | P1-05 | sources-a.md:L450 |
| Provision-level amendment diff | amendment-diff.mjs | features/sources/change | P1-05 | sources-a.md:L451 |
| Diff to timeline-event candidates | amendment-diff.mjs:127-143 (dead) | features/sources/change, wired to item_timelines by P1-09 or recorded as dropped by its owner | P1-05 | sources-a.md:L452 |
| intelligence_changes writer and reconcile pass over monitoring_queue | reconcile.ts | features/sources/change | P1-05 | sources-a.md:L453 |
| staged_updates bridge with amendment-diff summary | change-sweep.mjs:68-176 | features/sources/change | P1-05 | sources-a.md:L454 |
| Snapshot-first sweep of changed sources | change-sweep.mjs:16-66 (dead) | NOT PORTED as code; the reconcile pass plus snapshot-verify cover it | P1-05 | sources-a.md:L455 |
| Sitemap walk with feed-first discovery, bot-wall naming, coverage-complete diff | sitemap-walk.mjs, feed-discovery.mjs | features/sources/walkers/sitemap, feed | P1-05 | sources-a.md:L456 |
| RSS and Atom feed walk | feed-walk.mjs | features/sources/walkers/feed | P1-05 | sources-a.md:L457 |
| EUR-Lex OJ daily-view and Federal Register register walks | register-walk.mjs | features/sources/walkers/register | P1-05 | sources-a.md:L458 |
| Portal deep-link extraction | portal-links.mjs | features/sources/walkers/portal-links | P1-05 | sources-a.md:L459 |
| Answer-seeking for trigger questions with a priced acquisition request | seek-more.mjs:159-288 (dead) | NOT PORTED as code (no caller; the request asks for an operator price, which the free plan retires) | P1-05 | sources-a.md:L460 |
| Priority jurisdiction regions | tier1-priority-jurisdictions.ts | coverage module (id owed) | P1-05 | sources-a.md:L461 |
| Brief failure-phrase check | fetch-quality.ts | intake (P1-03/04) | P1-05 | sources-a.md:L462 |
| Source registry list with tier facet counts that match the filter, name filter | SourceHealthDashboard.tsx, SourceTierLegend.tsx | sources-admin SourceRegistryCard, TierLegend | P1-06 | sources-b.md:L303 |
| Expandable source row: description, URL, accuracy, accessibility, citations, conflicts, frequency, method, last checked, paywalled, paused | SourceHealthDashboard.tsx:40-235 | SourceRow | P1-06 | sources-b.md:L304 |
| Health view: sources overdue for checking | SourceHealthDashboard.tsx:296-299, 479-500 | SourceRegistryCard (reads the cadence; "scraping is off" while off) | P1-06 | sources-b.md:L305 |
| Tier legend with authority labels, tier definitions overlay | SourceTierLegend.tsx | TierLegend | P1-06 | sources-b.md:L306 |
| Scrape cadence off / weekly / monthly with start date; next run shown; emergency stop that preserves the schedule | SourceAdminControls.tsx GlobalPauseToggle | ScrapeScheduleStrip | P1-06 | sources-b.md:L307 |
| Per-source pause, fetch now (with the fetched size, method, time and hash), regenerate brief (queued run id), workspace visibility | SourceAdminControls.tsx SourceRowControls | SourceRowActions | P1-06 | sources-b.md:L308 |
| Tier override with mandatory reason, revert to base, audit list of past overrides | SourceAdminControls.tsx SourceTierOverrideControl | TierOverrideControl | P1-06 | sources-b.md:L309 |
| Flag a source's tier as ambiguous for an operator decision | SourceTierAuditPanel.tsx:145-158 (local only, never written) | TierOverrideControl, raising an integrity_flags row (category source_issue) | P1-06 | sources-b.md:L310 |
| Haiku tier recommendation and base_tier commit | SourceTierAuditPanel.tsx | NOT PORTED as code (metered route; second tier path); ruling owed (1), (2) | P1-06 | sources-b.md:L311 |
| Provisional queue: approve at the row's tier, reject, re-tier (held as a defer note), classify disclosure, queue total vs rows shown | ProvisionalReviewTable.tsx | ProvisionalQueue | P1-06 | sources-b.md:L312 |
| Provisional classification editor with bias-tag preview | ProvisionalReviewCard.tsx | SourceClassificationEditor + ProvisionalCard (preview from stored tags, no Haiku call) | P1-06 | sources-b.md:L313 |
| Canonical candidate queue: stats, confidence / verified / issue filters, per-item groups, candidate edit (URL, title, publisher), approve with classification, reject, defer, reviewer notes | CanonicalSourceReview.tsx | CanonicalQueue + SourceClassificationEditor | P1-06 | sources-b.md:L314 |
| Bulk approve of high-confidence candidates with a result summary | CanonicalSourceReview.tsx:244-482 | CanonicalQueue (copy names the real eligible set) | P1-06 | sources-b.md:L315 |
| Pre-cache AI classifications in server batches | CanonicalSourceReview.tsx:204-242 | NOT PORTED (metered); ruling owed (1) | P1-06 | sources-b.md:L316 |
| Regeneration progress strip with "Open queue" | B2RegenerationNote.tsx | RegenerationNote | P1-06 | sources-b.md:L317 |
| Upcoming obligations tab in the Sources card | SourceHealthDashboard.tsx:519 (mounts components/admin/UpcomingObligationsPanel) | stays a tab of SourceRegistryCard; the panel itself is admin's (P1-25/26) | P1-06 | sources-b.md:L318 |
| Connection pairs by band with basis chips and min-score control | IntersectionDetectionView.tsx | ConnectionPairsView | P1-06 | sources-b.md:L319 |
| Connection themes by convergence with pivots, signals, last run, stale brief | ThemesView.tsx | ConnectionThemesView (members link to item detail) | P1-06 | sources-b.md:L320 |
| Coverage matrix page: axes, scoped totals, linked cells, selected cell, definitions | CoveragePageView.tsx, coverage-matrix.mjs, index-data.ts, matrix-data.ts | features/coverage + core/coverage | P1-06 | sources-b.md:L321 |
| CSV export carrying version, generation time and data as-of | CoverageExportButton.tsx, client.ts, coverage-matrix.mjs | ExportButton, client, matrix | P1-06 | sources-b.md:L322 |
| Request coverage from a gap (one open flag per path) | request-coverage.mjs, client.ts | core/coverage/request + client | P1-06 | sources-b.md:L323 |
| Coverage denominator line on Regulations, Operations, Market, Research | CoverageDenominatorLine*.tsx | DenominatorLine | P1-06 | sources-b.md:L324 |
| Portfolio-add coverage line | coverage-matrix.mjs formatPortfolioCoverageLine, client.ts fetchCoverageSummary | core/coverage/matrix + client (consumer is portfolio) | P1-06 | sources-b.md:L325 |
| Admin Coverage catalogue entries | api/coverage/entries, index-data.ts getCoverageEntries | features/coverage/api/entries | P1-06 | sources-b.md:L326 |
| Map coverage gaps per Tier-1 region | coverage-gaps.ts, coverage-gaps-rollup.ts | features/map/region-coverage | P1-06 | sources-b.md:L327 |
| Surface health probe with Gate A gauges and forward-events visibility | api/health/surfaces, gate-a-gauges.mjs | features/health/api/surfaces + core/health/gate-a | P1-06 | sources-b.md:L328 |
| Spend traceability probe with spend gauge | api/health/spend, spend-health.mjs | features/health/api/spend + core/health/spend | P1-06 | sources-b.md:L329 |
| Suspended-source acquisition ladder with dossiers and fetch_status | scripts/sources/inaccessible-triage.mjs | scripts/sources/inaccessible-triage (invoker owed) | P1-06 | sources-b.md:L330 |
| sources.source_type backfill | scripts/sources/backfill-source-type.mjs | data migration | P1-06 | sources-b.md:L331 |
| sources.source_role re-classification | scripts/source-role-cleanup.mjs | guarded fix with P1-05's role-at-birth | P1-06 | sources-b.md:L332 |
| Fetch a source document with real-browser headers and a 45 s deadline | index.ts:128-141, 306-308 | core/capture/fetch-policy fetchDocument | P1-07 | capture.md:L260 |
| One same-invocation 403 retry with a second browser fingerprint | index.ts:311-329 | fetch-policy | P1-07 | capture.md:L261 |
| Transient statuses (202, 408, 425, 429, 5xx, network throw) requeue up to 5 attempts; permanent statuses terminalise | index.ts:119-123, 335-344, 433-442, 583-608 | capture-worker over fetch-policy | P1-07 | capture.md:L262 |
| Content-type allowlist (text, html, xml, json, pdf); binaries refused honestly | index.ts:143-154, 346-350 | fetch-policy | P1-07 | capture.md:L263 |
| Pre-buffer size caps, 25 MB PDF and 50 MB text, enforced on bytes read | index.ts:79-91, 173-220, 352-385, 401-429 | fetch-policy readBodyCapped | P1-07 | capture.md:L264 |
| PDF text extraction with page and byte counts declared; scanned PDFs refused | index.ts:386-400, 452-458, 510-516 | capture-worker (unpdf stays Deno-side) | P1-07 | capture.md:L265 |
| Charset-aware decode | index.ts:156-171, 431 | fetch-policy | P1-07 | capture.md:L266 |
| U+0000 removal, count declared on the run | index.ts:444-449, 500-502 | fetch-policy and the run's errors ledger | P1-07 | capture.md:L267 |
| Error-page markers refused (Cloudflare, Incapsula, Access Denied) | index.ts:71-78, 459-464 | fetch-policy | P1-07 | capture.md:L268 |
| Minimum 1,000 chars or a recorded failure | index.ts:79, 452-458 | fetch-policy | P1-07 | capture.md:L269 |
| Atomic queue claim (queued or error to fetching), explicit replay of error rows | index.ts:233-253, 289-299 | capture-worker, with the claim error read | P1-07 | capture.md:L270 |
| Idempotent per final URL | index.ts:466-475 | capture-worker, with the read error read | P1-07 | capture.md:L271 |
| Item scoping: exactly one live item on the source links the capture, else pool-scoped | index.ts:276-287 | capture-worker | P1-07 | capture.md:L272 |
| Full text stored in result_content; ADR-016 ceiling LOUD with a coverage_gap flag and a declared transform | index.ts:99-117, 484-497, 503-509, 554-571 | capture-worker | P1-07 | capture.md:L273 |
| Every capture outcome recorded in agent_runs (success or error) | index.ts:517-528, 597-608 | capture-worker | P1-07 | capture.md:L274 |
| Title from PDF metadata or the html title, else the source name | index.ts:391-395, 477-482 | capture-worker | P1-07 | capture.md:L275 |
| Scrape OFF gate and scrape-day window on the change-detection worker | route.ts:70-80 | features/sources/api/check-sources (gate) and the P1-08 dispatcher (gate plus kill switch) | P1-07 | capture.md:L276 |
| Bounded batch per tick, 1 to 50, default 10, 400 on a bad value | logic.ts:31-65, route.ts:45-66 | check-sources route | P1-07 | capture.md:L277 |
| Due-source selection by UTC day window, active, unpaused, auto-run, ordered by base_tier | route.ts:83-101 | core/capture/change-detection | P1-07 | capture.md:L278 |
| Reachability through the SSOT classifier and the pure decision; a non-answer never evicts; reactivation on recovery | logic.ts:83-107, 128-139 | change-detection over fetchDocument (direct, free) | P1-07 | capture.md:L279 |
| Content fingerprint and real change_detected; first observation seeds the hash | logic.ts:109-127 | change-detection | P1-07 | capture.md:L280 |
| Trust event per check | logic.ts:142-147 | change-detection, error read | P1-07 | capture.md:L281 |
| Monitoring-queue row per check | logic.ts:148-156 | change-detection, vocabulary from the CHECK, error read | P1-07 | capture.md:L282 |
| Portal deep-link discovery on root portals, one ledger write site | logic.ts:157-176 | change-detection calling P1-03's persistPortalCandidates | P1-07 | capture.md:L283 |
| In-process reconcile after the batch, never fatal to the scan | route.ts:134-147 | change-detection | P1-07 | capture.md:L284 |
| Manual reconcile re-drive | reconcile/route.ts | NOT PORTED as a route; a P1-08 harness dispatch of runReconcilePass (P1-05) | P1-07 | capture.md:L285 |
| Server error capture grouped by stack hash with dedupe count; route wrapper that rethrows | capture-error.ts | core/telemetry/error-sink | P1-07 | capture.md:L286 |
| Client error reporter with session caps and the error-boundary pipe | GlobalErrorReporter.tsx, error/route.ts | ui/GlobalErrorReporter, features/telemetry/api/error | P1-07 | capture.md:L287 |
| Seed-fallback activation recorded once per route per hour; anonymous renders not flagged; env-missing loud in logs | seed-fallback-flag.ts | error-sink captureSeedFallback (admin reads it in Errors; DESIGN CHANGES OWED) | P1-07 | capture.md:L288 |
| D3 heartbeat per ingest event | hooks.mjs:9-19 | NOT PORTED; the harness run ledger (P1-08) records every dispatch outcome, which the heartbeat never did | P1-07 | capture.md:L289 |
| D3 unreliable-method bias to provisional or quarantine | hooks.mjs:30-59 | NOT PORTED as code: no caller passes an unreliable method; the quarantine-not-evict rule lives in decideSourceAssessment (P1-05) | P1-07 | capture.md:L290 |
| D3 audit-event checks | hooks.mjs:61-75 | NOT PORTED: every caller passes no checks; the data-audit lane (P1-08) is the audit | P1-07 | capture.md:L291 |
| Surface health: must-have surfaces with zero rows fail; seed-leak signal | surface-health.mjs | core/telemetry/surface-health, consumed by the P1-08 probe | P1-07 | capture.md:L292 |
| Server-Timing header and per-phase timing on the bootstrap route; JSON byte measure | server-timing-core.ts, server-timing.ts | core/perf/server-timing | P1-07 | capture.md:L293 |
| Build-time slug read with a timeout and an honest warning | static-params-fallback.mjs | core/perf/slugs-or-empty | P1-07 | capture.md:L294 |
| Public build identity | version/route.ts | features/telemetry/api/version | P1-07 | capture.md:L295 |
| Invitation email seam with an honest undelivered result | send-invitation-email.ts | core/email/send-invitation-email | P1-07 | capture.md:L296 |
| Notifications inbox write for reply, invite, moderation, mention, archive, assignment | dispatch.ts | core/notifications/dispatch | P1-07 | capture.md:L297 |
| Cache tag vocabulary and per-item flush | cache/revalidate-item.ts | core/cache/tags | P1-07 | capture.md:L298 |
| A failed read is never cached | cache/fallback-guard.ts | core/cache/fallback-guard | P1-07 | capture.md:L299 |
| Worker-secret tag revalidation for the drains and the generation workflow | api/revalidate, api/cache/revalidate-item | one revalidate route | P1-07 | capture.md:L300 |
| A run record per firing, dry and no-op included | run-artifact.mjs, record-harness-run.mjs, upstream-artifact.mjs noop | core/harness/record | P1-08 | harness.md:L412 |
| Trigger and forced-dry stamping | run-artifact.mjs 380-403 | run frame | P1-08 | harness.md:L413 |
| Build-mode forced dry for machine-fired runs, fail closed | chained-dry-guard.mjs | run frame | P1-08 | harness.md:L414 |
| Upstream hand-off with apply evidence and the no-op contract | upstream-artifact.mjs, run-artifact.mjs | run frame, families | P1-08 | harness.md:L415 |
| Loop id carried along a chain | loop-run-id.mjs, upstream-artifact.mjs loop-id | `root_run_id` | P1-08 | harness.md:L416 |
| Which code version a run used | governing hash | `code_sha` | P1-08 | harness.md:L417 |
| Unique, collision-free run ids | claimRunId, harness-run-number | uuid | P1-08 | harness.md:L418 |
| Workflow outcome from job results | emit-workflow-run-artifact.mjs | `outcomeOf` | P1-08 | harness.md:L419 |
| Held producers record their refusals | r14-held-producer-cli.mjs | outcome `refused` | P1-08 | harness.md:L420 |
| Family list and their governing files | family-registry, family.json x37 | families.ts | P1-08 | harness.md:L421 |
| List and show a family's runs | run-artifact.mjs CLI | a SQL query in proofs.ts | P1-08 | harness.md:L422 |
| CI fails when it cannot record; local self-skip | record-harness-run.mjs runCli | run frame | P1-08 | harness.md:L423 |
| Step frame: mode, arg, summary | maintenance/lib/cli.mjs | run frame | P1-08 | harness.md:L424 |
| Guarded script writes with cite and reversal record | db.mjs | core/db script-writes | P1-08 | harness.md:L425 |
| Read client that refuses writes | db.mjs readClient | core/db | P1-08 | harness.md:L426 |
| Lossless PK-ordered pagination | db.mjs readAll, table-primary-keys | core/db with P1-11 keys | P1-08 | harness.md:L427 |
| Statement-timeout halving on large updates | db.mjs guardedUpdateByIds | core/db | P1-08 | harness.md:L428 |
| Delete-protected append-only tables | db.mjs DELETE_PROTECTED_TABLES | core/db | P1-08 | harness.md:L429 |
| Source registration and reclassify-then-archive | db.mjs registerSource, reclassifyToSource | core/db, P1-05/06 | P1-08 | harness.md:L430 |
| Direct Postgres for schema tools | pg-conn.mjs | core/db/pg | P1-08 | harness.md:L431 |
| Env load and credential list | env-file.mjs | core/env | P1-08 | harness.md:L432 |
| Revalidate cache tags after writes | revalidate.mjs | core/cache | P1-08 | harness.md:L433 |
| Mutation leases | mutation-lease.mjs | P1-12..15 | P1-08 | harness.md:L434 |
| Deferral validity and renewal rule | deferral.mjs | P1-12..15 | P1-08 | harness.md:L435 |
| Quarantine dwell classification | quarantine-dwell.mjs | P1-12..15 | P1-08 | harness.md:L436 |
| Deferral apply (with dedupe added) | apply-deferrals.mjs | P1-12..15 | P1-08 | harness.md:L437 |
| Canonical key derivation | canonical-key.mjs | P1-03/04 | P1-08 | harness.md:L438 |
| Cellar URLs and robot gate | eurlex-cellar.mjs | P1-03/04 | P1-08 | harness.md:L439 |
| Free re-attribution | free-pass.mjs | P1-03/04 | P1-08 | harness.md:L440 |
| Item changelog writer | changelog.mjs | P1-03/04 | P1-08 | harness.md:L441 |
| Gate A state writer | gate-a-state-writer.mjs | P1-03/04 | P1-08 | harness.md:L442 |
| Institution key and shared portals | institution-key.mjs | P1-05/06 | P1-08 | harness.md:L443 |
| Rate a source by class and verdict | rate-source-by-class.mjs, load-host-verdicts.mjs, host-verdicts-*.json | P1-05/06 | P1-08 | harness.md:L444 |
| Provisional source resolution and the unplaced export | resolve-provisional-sources.mjs, enumerate-unclassified-hosts.mjs | P1-05/06 | P1-08 | harness.md:L445 |
| Canonical candidate autoverify | canonical-autoverify.mjs | P1-05/06 | P1-08 | harness.md:L446 |
| Tag proposal and rule ratification | tag-proposals.mjs, tag-ratification.mjs | P1-09/10 | P1-08 | harness.md:L447 |
| Obligation derivation step | derive-obligations.mjs | P1-09/10 (direct call) | P1-08 | harness.md:L448 |
| Trigger-question deps | trigger-question-deps.mjs | P1-09/10 | P1-08 | harness.md:L449 |
| Migration-tolerant reads | absent-tolerant.mjs | P1-09/10 | P1-08 | harness.md:L450 |
| Carbon-intensity edge authorship | emission-factors-common.mjs 28-68 | P1-09/10 | P1-08 | harness.md:L451 |
| Timeline backfill from stored briefs | backfill-item-timelines.mjs | P1-09/10 resolver | P1-08 | harness.md:L452 |
| DESNZ factor fetch and parse | fetch-desnz-factors.mjs | P1-12..15 producer, writing the table | P1-08 | harness.md:L453 |
| Migration compare, applied map, diff, applied inventory | migration-compare, build-applied-map, migration-history-diff, sync-applied-migrations | P1-11 | P1-08 | harness.md:L454 |
| Migrations inventory page | generate-migrations-inventory.mjs | P1-11 | P1-08 | harness.md:L455 |
| Bundle measurement | measure-bundles.mjs | tools | P1-08 | harness.md:L456 |
| Gate A honesty probe | gate-a-probe.mjs | uptime-probes family calling src gate-a-gauges | P1-08 | harness.md:L457 |
| Emission-factor seeding from fixtures | emission-factors-common seedFactors (seeders deleted) | NOT PORTED as code: factors enter through the producer | P1-08 | harness.md:L458 |
| Holdings classification run | holdings-audit.mjs | NOT PORTED: one-off; classification lives in src/lib/sources/holdings-audit.mjs | P1-08 | harness.md:L459 |
| Brief conformance flags | audit-skill-conformance.mjs | NOT PORTED: the write-time contract (system-prompt and record-briefs schema) is the check | P1-08 | harness.md:L460 |
| Fabricated-item flags of 2026-05-29 | flag-fabricated-items.sql | NOT PORTED: data, in the database if it ran | P1-08 | harness.md:L461 |
| d3 heartbeat ledger | d3-runs.ddl.sql | NOT PORTED: the one ledger; `src/lib/d3/hooks.mjs` should call `recordRun` (owner outside this module) | P1-08 | harness.md:L462 |
| market_series entity stamp backfill | backfill-market-series-entity.mjs | NOT PORTED: the write path stamps it | P1-08 | harness.md:L463 |
| Batch retry, rate limit, idempotency, pg pool | batch-primitives.mjs | NOT PORTED: no caller | P1-08 | harness.md:L464 |
| Human-gate phrase lint, bug-class probes, open-flag dwell report | admin-phrase-scan, probe chain, flag-age.mjs | NOT PORTED as code: recorded as properties above | P1-08 | harness.md:L465 |
| Per-mint and per-update connection discovery with weighted bases, idf, caps, threshold and limit | run-discovery.mjs, discover.mjs | features/flywheel/run-discovery.ts, core/flywheel/discover.ts | P1-09 | flywheel-a.md:L317 |
| Discovery for a set of ids or since a date | discover-for-items.mjs | features/flywheel/run-discovery.ts (`discoverForItems`) | P1-09 | flywheel-a.md:L318 |
| Edge writing with origin ownership, MANUAL respected, tombstones respected, foreign pairs skipped and counted, refresh snapshots | write-edges.mjs | core/flywheel/edges.ts | P1-09 | flywheel-a.md:L319 |
| Cross-surface intersections with tiers, written as appended basis entries | intersections.mjs, write-edges.mjs | core/flywheel/intersections.ts, edges.ts | P1-09 | flywheel-a.md:L320 |
| Themes by label propagation, wholesale per run, with delta and lineage | cluster.mjs, theme-delta.mjs, analyze-corpus.mjs | core/flywheel/cluster.ts, themes.ts, features/corpus-pass.ts | P1-09 | flywheel-a.md:L321 |
| Theme stats and convergence bands | theme-stats.mjs | core/flywheel/themes.ts | P1-09 | flywheel-a.md:L322 |
| Theme gaps against the org profile and anticipated targets from forward events, as flags | gaps.mjs, anticipate.mjs | core/flywheel/gaps.ts | P1-09 | flywheel-a.md:L323 |
| Coverage reflection rows born resolved | coverage-reflection.mjs | core/flywheel/gaps.ts | P1-09 | flywheel-a.md:L324 |
| Shared-regulation-identifier adoption at weight 0.85 and the resolution of stale signal flags | signal-candidates.mjs, signal-confidence.mjs | core/flywheel/discover.ts (shared_entity basis), flags.ts | P1-09 | flywheel-a.md:L325 |
| Title-entity adoption at weight 0.7 | signal-confidence.mjs 45-53 | NOT PORTED: the vocabulary is empty and has no writer; a shared named entity becomes a shared_entity basis once P1-10 extracts entities | P1-09 | flywheel-a.md:L326 |
| Theme brief staleness by member hash and brief resolution for a theme | brief-staleness.mjs | core/flywheel/themes.ts | P1-09 | flywheel-a.md:L327 |
| Free theme-brief seam: bundle, validate against live members, session-executor stamp | generate-theme-brief.mjs | features/flywheel/theme-brief-seam.ts plus the theme-briefs export and apply (scripts/turns) | P1-09 | flywheel-a.md:L328 |
| Brief candidates for the author with theme context | brief-candidates.mjs | core/flywheel/view-model.ts | P1-09 | flywheel-a.md:L329 |
| Connection rows, supersession rows, intersection view for detail surfaces | connection-view-model.mjs | core/flywheel/view-model.ts | P1-09 | flywheel-a.md:L330 |
| Pair collapse, bands, assembled pairs for the Map and admin | pair-view.mjs | core/flywheel/edges.ts | P1-09 | flywheel-a.md:L331 |
| Verified-only resource lookup | resource-lookup.ts | core/flywheel/view-model.ts (lookup); identity helper elsewhere | P1-09 | flywheel-a.md:L332 |
| Tag derivation from closed vocabularies and adopted terms with keyword evidence and caps | derive-tags.mjs, tag-aliases.mjs, tag-input.mjs | core/tags/vocabulary.ts, derive.ts | P1-09 | flywheel-a.md:L333 |
| Tag labels and acronyms | tag-labels.mjs | core/tags/vocabulary.ts | P1-09 | flywheel-a.md:L334 |
| Tag proposals as flags, no-derivable rows born resolved | propose-tags.mjs | features/flywheel/tag-pass.ts, core/flywheel/flags.ts | P1-09 | flywheel-a.md:L335 |
| Rule-based adoption: high adopts, medium with vocabulary and evidence; merge-only patch; removed tags respected | apply-tags.mjs | core/tags/adopt.ts | P1-09 | flywheel-a.md:L336 |
| Two-step queue (open proposal flag, later ratification step) | propose-tags.mjs, apply-tags.mjs, maintenance/tag-ratification.mjs | NOT PORTED as a queue: the decision is made in the same pass and the flag records it resolved (ADR-025, ADR-044); the maintenance wrappers call the pass | P1-09 | flywheel-a.md:L337 |
| Term recurrence across five detectors, adoption at threshold and two sources, mention recording | lib and scripts term-recurrence.mjs | core/vocabulary/terms.ts, features/term-pass.ts | P1-09 | flywheel-a.md:L338 |
| Term-need and lineage-need flags, closed by rule when no longer reproduced | term-needs.mjs, raise-term-needs.mjs | core/vocabulary/terms.ts, features/term-pass.ts | P1-09 | flywheel-a.md:L339 |
| Flag namespace grammar | flag-namespaces.mjs | core/flywheel/flags.ts | P1-09 | flywheel-a.md:L340 |
| Decision note text | decision-note.mjs | core/flywheel/flags.ts | P1-09 | flywheel-a.md:L341 |
| Operator ratification of a flag into a census row | ratify-flag-to-census.mjs | NOT PORTED (human gate); the census writer `ensureCensusRow` moves to intake | P1-09 | flywheel-a.md:L342 |
| Event date formatting by precision | forward-event-format.mjs | P1-16 obligations | P1-09 | flywheel-a.md:L343 |
| Item-to-surface routing, SQL mirror, domain integers and labels | surface-of.mjs, domains.ts | core/routing/surface.ts | P1-09 | flywheel-a.md:L344 |
| Four domain sets, DEFAULT_SURFACE, scopeFilterForSurface | domains.ts 26-41, surface-of.mjs 4, 68 | NOT PORTED (no caller) | P1-09 | flywheel-a.md:L345 |
| Customer workspace tags: create, apply, remove, list, facet, attribution | src/lib/tags | P1-02 workspace, pending the ruling in section 2 | P1-09 | flywheel-a.md:L346 |
| Deterministic entity ids for 12 kinds, shape check browser-safe | entity-id.mjs, entity-id-shape.mjs | core/entities/id | P1-10 | flywheel-b.md:L341 |
| Corridor identity by UN/LOCODE port-pair plus mode, mode normalised | entity-id.mjs corridorSeed, decisions.mjs | core/entities/id | P1-10 | flywheel-b.md:L342 |
| Crosswalk to 17 published identifier schemes with check digits | crosswalk.mjs | core/entities/crosswalk | P1-10 | flywheel-b.md:L343 |
| Jurisdiction and instrument entities, refs and FK at birth (rule 16(e)) | link-item-entities.mjs, entity-plan.mjs | core/entities/link-entities | P1-10 | flywheel-b.md:L344 |
| Historical spine backfill, including organisations by host | backfill-entities.mjs | ops/backfill-entities | P1-10 | flywheel-b.md:L345 |
| Corridor seeds with display names and jurisdiction scope | seed-corridors.mjs, write-entity-scope.mjs | ops/seed-corridors | P1-10 | flywheel-b.md:L346 |
| Corridor scope for the Market overlay selector and the Regulations "Corridors this applies on" strip | corridor-scope.ts, corridor-scope-cache.ts | core/entities/corridor-scope | P1-10 | flywheel-b.md:L347 |
| Human corridor labels, full and compact | unlocode-names.mjs | core/entities/unlocode-names | P1-10 | flywheel-b.md:L348 |
| Instruments and obligation count in force on a corridor ("one corridor, five answers") | corridor-scope.ts 148-247 (dead readers) | NOT PORTED as code; the requirement is P1-16's and the surfaces', recorded here | P1-10 | flywheel-b.md:L349 |
| Entity alias resolution and the group, legal entity, operating identity hierarchy (migration 377) | resolve.mjs | NOT PORTED except merge following (core/entities/id); the alias writer and hierarchy return when a producer writes aliases (0 rows today) | P1-10 | flywheel-b.md:L350 |
| Mention detection, resolution and wire-or-surface bucketing with the adopted-standard dictionary | canonical-entities.mjs, entity-resolve.mjs | core/entities/mentions | P1-10 | flywheel-b.md:L351 |
| Typed lineage edges (implements, amends, supplements, derogation) and absent-parent gap flags | entity-resolve.mjs, lineage-backfill.mjs, link-items.ts | core/entities/mentions, lineage, link-items | P1-10 | flywheel-b.md:L352 |
| Corpus-wide lineage backfill with a prior-state snapshot | backfill-lineage-edges.mjs | ops/backfill-lineage-edges | P1-10 | flywheel-b.md:L353 |
| Subject-identity dedup at mint (instrument identifier, canonical URL, own reg number) | entity-resolve.mjs matchExistingSubject | core/entities/mentions | P1-10 | flywheel-b.md:L354 |
| Source congruence at mint (primary artifact on news becomes market signal; study on press keeps type and seeks the study) | source-role.mjs | core/entities/source-role | P1-10 | flywheel-b.md:L355 |
| Derived value plus edges in one atomic write | register-derivation.ts | core/propagation/register | P1-10 | flywheel-b.md:L356 |
| Edge authorship for a landed figure, idempotent | author-edges.mjs | core/propagation/author-edges | P1-10 | flywheel-b.md:L357 |
| First carbon-intensity values, licence-gated | seed-derived-values.mjs | ops/seed-derived-values | P1-10 | flywheel-b.md:L358 |
| One-time historical DAG bridge | backfill-derivation-edges.mjs | ops/backfill-derivation-edges | P1-10 | flywheel-b.md:L359 |
| The governed drain: invalidate, recompute, supersede, re-open questions | drain.ts | core/propagation/drain | P1-10 | flywheel-b.md:L360 |
| Registered methods carbon_intensity_tkm and market_series_delta | methods/*.ts | core/propagation/methods | P1-10 | flywheel-b.md:L361 |
| Inference recompute and first-inference write from an answered question | infer-from-question.ts | core/propagation/inference, methods | P1-10 | flywheel-b.md:L362 |
| Signpost predicates, firing and assessment lifecycle transition | signpost-watch.ts | core/propagation/signpost | P1-10 | flywheel-b.md:L363 |
| The pollution barrier and computed decay | admissible-for.ts, effective-confidence.mjs | core/propagation/admissible | P1-10 | flywheel-b.md:L364 |
| Recalculation notices for watched entities | superseded-notices.ts | core/propagation/notices | P1-10 | flywheel-b.md:L365 |
| FuelEU Annex IV penalty computation from a reviewed rows file, with filing gate and rated source | statutory-rows.ts, write-statutory.mjs, validate-statutory-rows-file.mjs | features/statutory | P1-10 | flywheel-b.md:L366 |
| FuelEU Article 4(2) targets for 2030-2050 (transcribed, not implemented) | fixtures/fueleu-annex-i-iv-...json | features/statutory/data; implementing them is a ruling (gap 8) | P1-10 | flywheel-b.md:L367 |
| Dominance share for the community post guard | aggregate-safeguards.mjs computeDominanceShare | P1-22/23 | P1-10 | flywheel-b.md:L368 |
| Bucket, complement, freeze and forward-looking mirrors of publish_aggregate | aggregate-safeguards.mjs | NOT PORTED as JS; the SQL in migration 287 stays and is the enforcement | P1-10 | flywheel-b.md:L369 |
| Admin corrections: suppress or replace a fact, add or remove a tag or connection, replace section text or the full brief; list with machine evidence, superseded and orphan marks; revoke | item-corrections.mjs, admin-api/* | features/corrections | P1-10 | flywheel-b.md:L370 |
| Machine writers respect corrections (tombstones, removed tags) | item-corrections.mjs (read by flywheel-a writers) | features/corrections/model | P1-10 | flywheel-b.md:L371 |
| Suppressed claims never render on detail or in Ask | suppressed-render.mjs | features/corrections/redact | P1-10 | flywheel-b.md:L372 |
| Statutory rows-file path override for a dry workflow test | resolve-statutory-rows-file.mjs, test-statutory-rows.dry.json | NOT PORTED (the workflow is gone) | P1-10 | flywheel-b.md:L373 |
| Session-authored full briefs applied to record-grade stubs, no model call | apply-record-briefs, record-briefs/schema | kinds/record-briefs | P1-12 | runtimes-a.md:L345 |
| Quarantined items reachable by an explicit ticket for re-grounding | export-corpus-for-extraction.mjs:254-292 | kinds/record-briefs/export | P1-12 | runtimes-a.md:L346 |
| Overwrite of an existing brief only by explicit flag, with replace-ledger archiving to claim_versions | apply-record-briefs.mjs:629 | kinds/record-briefs/apply | P1-12 | runtimes-a.md:L347 |
| Stale-pool refusal by pool hash | apply-record-briefs, export-corpus:243 | kit + record-briefs | P1-12 | runtimes-a.md:L348 |
| Eight pre-write mirrors (Gate A, criterion 4, per-format timeline, claim section, depth accounting, qualification accounting, numeric figure, criterion 5) | record-briefs/schema | kinds/record-briefs/validate | P1-12 | runtimes-a.md:L349 |
| Flat-YAML representability refusals (comma, newline, quote pair) | record-briefs/schema 454-496 | core/briefs/frontmatter | P1-12 | runtimes-a.md:L350 |
| mentioned_terms carried into vocabulary_mentions | apply-record-briefs (terms step), schema 530-531 | kinds/record-briefs/apply | P1-12 | runtimes-a.md:L351 |
| Changelog row when an applied item verifies | apply-record-briefs.mjs:562-580 | kinds/record-briefs/apply (guarded) | P1-12 | runtimes-a.md:L352 |
| Cited-source growth from a lane brief | apply-record-briefs:682 | kinds/record-briefs/apply | P1-12 | runtimes-a.md:L353 |
| Lineage, discovery, forward events, compliance deadline, entities per applied item | apply-record-briefs 549-807 | kinds/record-briefs/apply | P1-12 | runtimes-a.md:L354 |
| Unscoped flywheel pass and public cache revalidation after apply | apply-record-briefs 1158-1170 | kinds/record-briefs/apply | P1-12 | runtimes-a.md:L355 |
| IO budget stop and cooldown between applies | apply-record-briefs 837-955, io-preflight | kit/budget | P1-12 | runtimes-a.md:L356 |
| Structured-action extraction preview | apply-record-briefs 711-727, dry-run-structured-actions | decision-ready (data model, migration 334) | P1-12 | runtimes-a.md:L357 |
| Answers from holdings as labelled inferences, re-answer on pool change, supersedes chain | apply-question-answers, question-answers/* | kinds/question-answers | P1-12 | runtimes-a.md:L358 |
| Unanswerable questions become holdings-need search targets | question-answers/data 82-113, apply-question-answers 164-185 | kinds/question-answers + core/flags/need-targets | P1-12 | runtimes-a.md:L359 |
| Question bundles within a char budget with honest truncation counts | question-answers/data 278-399 | kinds/question-answers/material | P1-12 | runtimes-a.md:L360 |
| Source needs of four kinds found by a session lane and turned into census rows or portal candidates | apply-need-urls, needs-search/* | kinds/needs-search | P1-12 | runtimes-a.md:L361 |
| Need re-raised under a new flag id is not searched twice (applied-key marker) | needs-search/data 37-49, 147-159 | kinds/needs-search | P1-12 | runtimes-a.md:L362 |
| Theme brief write with snapshot on update and member-hash read-back | apply-theme-briefs | kinds/theme-briefs/apply | P1-12 | runtimes-a.md:L363 |
| Forward-event corpus export excluding items already extracted | export-corpus default mode | kinds/forward-events/export | P1-12 | runtimes-a.md:L364 |
| Forward-event load idempotent on the 307 identity | apply-extraction-output | kinds/forward-events/apply | P1-12 | runtimes-a.md:L365 |
| Corpus-turn ticket selection by item state, archived tickets closed under their own label | consume-turn-requests | kinds/forward-events/tickets | P1-12 | runtimes-a.md:L366 |
| Brief-export auto-queue from mint and its pending list | brief-export/queue, read-brief-export-queue | turns/brief-queue | P1-12 | runtimes-a.md:L367 |
| Run record for every firing, including zero-work and crashed runs | emit-*, artifact.mjs files | kit, through P1-08 recordRun | P1-12 | runtimes-a.md:L368 |
| Live-smoke report recorded per invariant with holds | emit-live-smoke-artifact | harness/live-smoke-record (P1-08) | P1-12 | runtimes-a.md:L369 |
| Artifact landing into harness_runs with failure on a missed landing | deliver-artifact-branch.sh | P1-08 recordRun (in process) | P1-12 | runtimes-a.md:L370 |
| Ledger-verdict authoring guide (export with text, prompt version, stale re-authoring, access walls) | ledger-verdicts/README | kinds/ledger-verdicts/AUTHORING.md | P1-12 | runtimes-a.md:L371 |
| Research-sweep record profile and screen contract (P1-13's runtime) | RESEARCH-SWEEP.md | P1-13 register | P1-12 | runtimes-a.md:L372 |
| Corpus-turn since-date marker | last-turn-date, LAST-TURN.json | retired; tickets are the selector | P1-12 | runtimes-a.md:L373 |
| EUR-Lex Official Journal walk by date range and series, duplicate-edition detection | run-source-sweep.mjs:1225-1226, :683-702 | sweep stage | P1-13 | runtimes-b.md:L287 |
| Explicit EUR-Lex CELEX targets from a lineage-gap file or one CELEX id, non-CELEX identifiers skipped with a reason | run-source-sweep.mjs:336-368, :1222-1224 | sweep stage | P1-13 | runtimes-b.md:L288 |
| Federal Register walk by date range, document types, term, pages | run-source-sweep.mjs:1227-1228, :703-718 | sweep stage | P1-13 | runtimes-b.md:L289 |
| Any RSS/Atom feed walk into the portal-link ledger | run-source-sweep.mjs:1358-1360, :869-883 | sweep stage | P1-13 | runtimes-b.md:L290 |
| Portal parent source resolved by exact URL, registered with a portal-only institution key on first apply | run-source-sweep.mjs:924-935 | sweep stage (registerSource from P1-05) | P1-13 | runtimes-b.md:L291 |
| Sitemap walk per source, by source id, by host, or across all active hosts with a slice and a cursor, never-walked hosts first | run-source-sweep.mjs:416-570, :1229-1357 | sweep stage (cursor from harness_runs) | P1-13 | runtimes-b.md:L292 |
| Feed discovery on the sitemap path with the discovered feed URL recorded on the source | run-source-sweep.mjs:1288-1308 | sweep stage | P1-13 | runtimes-b.md:L293 |
| Sitemap URL-set snapshot and diff (new, changed, removed, partial coverage, baseline deferral) | run-source-sweep.mjs:1129-1163, :737-867 | sweep stage + P1-07 storage | P1-13 | runtimes-b.md:L294 |
| Sitemap coverage columns on every walked row and the read-only coverage report | run-source-sweep.mjs:572-648, :1315-1328 | sweep stage | P1-13 | runtimes-b.md:L295 |
| Change signal into monitoring_queue only for a changed loc matching a live item, deduplicated against a pending signal | run-source-sweep.mjs:1177-1209 | sweep stage (shared recordChangeSignal) | P1-13 | runtimes-b.md:L296 |
| Wall-clock time budget and per-fetch timeout | run-source-sweep.mjs:937-1004 | sweep stage + fetch ladder | P1-13 | runtimes-b.md:L297 |
| Research sources swept by registry category, new documents only, press pages skipped by congruence, payloads validated for the mint | research-sweep.mjs | sweep-research walker + P1-14 | P1-13 | runtimes-b.md:L298 |
| Scrape gate read both modes the route's way, reported with its reason; route-side gate exit and local/route disagreement reported | run-change-detection.mjs:57-85, :181-238 | change stage | P1-13 | runtimes-b.md:L299 |
| Due-source count with a sample, check of due sources, route-reported totals with a read-only cross-check | run-change-detection.mjs:409-425, :516-537, :600-645 | change stage (in process) | P1-13 | runtimes-b.md:L300 |
| Monitoring-queue reconcile with the pending backlog depth shown | run-change-detection.mjs:427-432, :539-562 | change stage | P1-13 | runtimes-b.md:L301 |
| Change-sweep staged-update drain with an exact overflow count | run-change-detection.mjs:434-443, :564-598 | change stage | P1-13 | runtimes-b.md:L302 |
| Stuck first-fetch claims reset after one hour | run-fetch-drain.mjs:271-294 | capture stage | P1-13 | runtimes-b.md:L303 |
| First-fetch queue drained through the capture worker in batches, each row read back and shaped from worker result or read-back | run-fetch-drain.mjs:296-386 | capture stage + P1-07 | P1-13 | runtimes-b.md:L304 |
| Ledger consume by session verdict, all committed batches merged, later batch wins | run-ledger-consume.mjs:1662-1721 | intake stage | P1-13 | runtimes-b.md:L305 |
| Stale-version verdicts excluded and counted, superseded set derived and recorded | run-ledger-consume.mjs:500-520, :636-670, :1703-1711 | intake stage | P1-13 | runtimes-b.md:L306 |
| Pre-fetch classify gate (no fetch for a verdict-covered or no-source candidate) | run-ledger-consume.mjs:749-770, :1767-1771 | intake stage | P1-13 | runtimes-b.md:L307 |
| Promote cap per run, oldest eligible first | run-ledger-consume.mjs:123-132, :1842 | intake stage + P1-03/04 applyPromoteCap | P1-13 | runtimes-b.md:L308 |
| Per-candidate ledger before/after status, verdict candidate-id mismatch flag | run-ledger-consume.mjs:838-925 | intake stage | P1-13 | runtimes-b.md:L309 |
| Candidate export for session classification, with fetched text, access-wall and below-floor marking, keyset cursor, stale-only mode | run-ledger-consume.mjs:1136-1394, :1575-1660 | intake stage export (cursor from harness_runs) | P1-13 | runtimes-b.md:L310 |
| Dry pre-landing check of a verdict batch | run-ledger-consume.mjs:672-707, :1503-1545 | intake stage `check-verdicts` | P1-13 | runtimes-b.md:L311 |
| Charset-aware, PDF-or-HTML, official-API, EUR-Lex-rendering, access-wall-aware polite fetch | run-ledger-consume.mjs:246-337 | P1-07 fetch ladder | P1-13 | runtimes-b.md:L312 |
| Classify through Haiku with token telemetry (`--allow-api`) | run-ledger-consume.mjs:361-388, :1726-1760 | NOT PORTED (metered); ruling owed (1) | P1-13 | runtimes-b.md:L313 |
| The flywheel over a minted slice: tags, discovery, corpus export, forward events, analyze-corpus, obligations, trigger questions | run-population-flywheel.mjs:522-661, :966-1156 | connect stage + P1-09/10 | P1-13 | runtimes-b.md:L314 |
| Slice outcomes (edges discovered, forward events extracted, isolated items, obligations derived, trigger context) written onto the slice | run-population-flywheel.mjs:663-710, :1180-1236 | connect stage onto the slice's run record | P1-13 | runtimes-b.md:L315 |
| THE GATE: no new slice while a minted slice is unconnected | run-population-flywheel.mjs:712-855 | connect stage over harness_runs | P1-13 | runtimes-b.md:L316 |
| Backlog mode: connect stale slices oldest first under a cap, checkpointed | run-population-flywheel.mjs:857-952, :1488-1557 | connect stage | P1-13 | runtimes-b.md:L317 |
| Brief-export queue landed as its own run row | run-population-flywheel.mjs:1243-1278 | connect stage + P1-12's brief-export kind | P1-13 | runtimes-b.md:L318 |
| The unscoped four steps for a brief-apply batch | run-population-flywheel.mjs:1296-1359 | `runUnscopedConnect` | P1-13 | runtimes-b.md:L319 |
| Legacy minted-id recovery for pre-item_id slices | run-population-flywheel.mjs:263-510 | NOT PORTED (no artifact survives); ruling owed (2) | P1-13 | runtimes-b.md:L320 |
| Last-turn marker file | run-population-flywheel.mjs:641-648, :1238-1241 | NOT PORTED (no reader; the run ledger's last connect row is the marker) | P1-13 | runtimes-b.md:L321 |
| Propagation outbox drain with invalidate and recompute counts | run-propagation-drain.mjs:320-358, :403 | propagate stage + P1-09/10 | P1-13 | runtimes-b.md:L322 |
| Replay of unfinished events, manual replay of an outbox id range | run-propagation-drain.mjs:122-133, :205-318 | propagate stage (from harness_runs) | P1-13 | runtimes-b.md:L323 |
| Questions on change over drained and replayed events | run-propagation-drain.mjs:166-203 | propagate stage | P1-13 | runtimes-b.md:L324 |
| Signposts fired and scored over the same events, with the state sweep | run-propagation-drain.mjs:177-184, :303-313 | propagate stage | P1-13 | runtimes-b.md:L325 |
| Theme-brief bundle with honest truncation counts | theme-briefs/data.mjs:129-243 | theme-brief material | P1-13 | runtimes-b.md:L326 |
| Themes needing a brief (none, stale, superseded by an id drift) in convergence order | theme-briefs/data.mjs:109-127 | theme-brief material | P1-13 | runtimes-b.md:L327 |
| Theme-brief validator: ten refusals, uncited-figure check, refused entries never block valid ones | theme-briefs/schema.mjs:90-296 | theme-brief contract | P1-13 | runtimes-b.md:L328 |
| brief_md rendering under fixed headings | theme-briefs/schema.mjs:298-307 | theme-brief contract | P1-13 | runtimes-b.md:L329 |
| `--fixture` runs of the batch CLIs over an in-memory corpus | theme-briefs/fixture-deps.mjs | the test fake only | P1-13 | runtimes-b.md:L330 |
| Run records with loop run id, trigger and trigger context for every family | all seven runtimes, theme-briefs/artifact.mjs | P1-08 `runFamily` / `recordRun` | P1-13 | runtimes-b.md:L331 |
| Select would_mint census rows, narrowed by source or CELEX prefix, capped | export-census-rows.mjs | features/mint/select | P1-14 | mint.md:L304 |
| Exclude rows already held, by key or by URL with the same identity; siblings mint | export-census-rows.mjs, lib/instrument-identity.mjs, apply-mint-batch.mjs | select (`isHeld`) | P1-14 | mint.md:L305 |
| Relevance screen with rulings as rules and reviewed overrides of ambiguous | screen-rules.mjs, lib/screen-verdict.mjs, reviewed-verdicts.json | screen, screen-rules.data, screen_verdicts table | P1-14 | mint.md:L306 |
| Off-vertical reconciliation of live record items (reversible archive) | screen-reconcile-records.mjs | screen | P1-14 | mint.md:L307 |
| Screen report (counts by verdict and rule, ambiguous list) | screen-worklist.mjs, SCREEN-REPORT-FORMAT.md | a query over screen_verdicts (P1-25/26 admin) | P1-14 | mint.md:L308 |
| Per-family identity: CELEX, UK series, FR type, registered institution | export-census-rows.mjs | P1-03/04 | P1-14 | mint.md:L309 |
| Free capture: Cellar, EUR-Lex, UK data.htm, FR API, OJ issues, Wayback, PDF | export-census-rows.mjs, heal-provenance.mjs | P1-07 | P1-14 | mint.md:L310 |
| Capture holds with evidence: too short, garbled Cellar metadata, not in force, blocked, no capture path | export-census-rows.mjs | P1-07 returns the reason; select records it on the census row | P1-14 | mint.md:L311 |
| Title resolution chain without OJ file names | export-census-rows.mjs | P1-07 | P1-14 | mint.md:L312 |
| Record payload from captured text with verbatim spans | run-mint-batch.mjs (+ record-facts.mjs) | build-payload | P1-14 | mint.md:L313 |
| Preflight kit checks (completeness, unicode, purity, hollow, screen) | validate-mint-payload.mjs | preflight | P1-14 | mint.md:L314 |
| Empty-signature-tag warning | lib/tag-presence-check.mjs | preflight, recorded on the ledger row | P1-14 | mint.md:L315 |
| Guarded apply with compensating delete and verdict read-back | apply-mint-batch.mjs | apply | P1-14 | mint.md:L316 |
| Inline source registration with a class-table tier | apply-mint-batch.mjs, heal-provenance.mjs | P1-05 `registerAndRate` | P1-14 | mint.md:L317 |
| Validation-failed hold and reasoned reopen | apply-mint-batch.mjs, reopen-validation-holds.mjs | apply | P1-14 | mint.md:L318 |
| Re-derive stale provenance stamps | rederive-record-provenance.mjs | heal/run re-derive | P1-14 | mint.md:L319 |
| Rule-16 enrichment and the post-apply flywheel with outcomes | apply-mint-batch.mjs, run-mint-batch.mjs --outcomes | run.ts hand-off to P1-09/10, outcomes on the P1-08 row | P1-14 | mint.md:L320 |
| Cache flush after a mint | apply-mint-batch.mjs | run.ts (all five surfaces) | P1-14 | mint.md:L321 |
| Heal: capture, ground, resource buckets, slots, own-body institution | heal-provenance.mjs | heal/ground, heal/run | P1-14 | mint.md:L322 |
| Heal: source-and-rate orphan figures, one-hop same institution | heal-provenance.mjs | heal/source, P1-05 | P1-14 | mint.md:L323 |
| Heal: relabel and re-kind unverifiable FACTs | heal-provenance.mjs | heal/label | P1-14 | mint.md:L324 |
| Heal: brief-honest strip, opt-in | heal-provenance.mjs | heal/brief-honest | P1-14 | mint.md:L325 |
| Heal: un-archive an archived-unreasoned item that re-derives verified | heal-provenance.mjs | heal/run | P1-14 | mint.md:L326 |
| Session browser worklist of found sources (attach-found-sources) | heal-provenance.mjs | NOT PORTED (provider deleted; a session worklist is not a runtime input); orphan sources come from citations and capture | P1-14 | mint.md:L327 |
| Migration-299 guard | migration-299-precheck.mjs | NOT PORTED (P1-11 ruling 3) | P1-14 | mint.md:L328 |
| WO-26 archive-reason stamp | stamp-wo26-archive-reason.mjs | NOT PORTED (one-shot, done) [HYPOTHESIS: live count not re-measured] | P1-14 | mint.md:L329 |
| Run artifacts mint-run and screen-run | run-mint-batch.mjs, screen-worklist.mjs | P1-08 ledger rows | P1-14 | mint.md:L330 |
| ECB daily EUR reference rates (USD, GBP, CNY, JPY) into market_series | ecb-fx-producer.mjs | features/market/producers/ecb-fx | P1-15 | producers.md:L416 |
| EIA weekly petroleum spot prices, six products, series per area | eia-v2-petroleum-spot-producer.mjs | eia-petroleum-spot | P1-15 | producers.md:L417 |
| EU Weekly Oil Bulletin: find the history workbook, download, extract the pre-tax EU series, `--since`, weekly upsert | fetch-oil-bulletin.mjs, eu-weekly-oil-bulletin.mjs | eu-oil-bulletin | P1-15 | producers.md:L418 |
| SBTi per-sector near-term and net-zero lead time (months) and commitments removed, dry only while licence-blocked | sbti-target-dashboard-producer.mjs | sbti-targets (with `licenceBlock`) | P1-15 | producers.md:L419 |
| Carrier ETS surcharge proxy: grounded per-carrier rows, cross-carrier band never blended without a range | carrier-ets-surcharge-producer.mjs | carrier-ets-surcharge (`enabled: false`, ETS-PROXY ruling) | P1-15 | producers.md:L420 |
| Derivation edges for every market series write, fail closed, traceable | author-market-series-delta.mjs | market-series-delta | P1-15 | producers.md:L421 |
| Producer summaries and the producers family artifact | lib/producer-summary.mjs, emit-producers-artifact.mjs | core/producers/summary | P1-15 | producers.md:L422 |
| Registry of producers: licence, kill switch, in_all set, pre stage, entity id; run selected | registry/*.json, load-registry.mjs, run-registered.mjs | core/producers/registry | P1-15 | producers.md:L423 |
| Published price statistics display rows from ratified series | refresh-published-price-statistics.mjs | published-price-statistics | P1-15 | producers.md:L424 |
| Ratify a series to its minted item from a mint artifact | ratify-series-items.mjs | published-price-statistics (ratify step) | P1-15 | producers.md:L425 |
| Draft the six R-D payloads and census rows | propose-series-items.mjs, build-oil-bulletin-rows.mjs | NOT PORTED (finished one-shot; the six are ratified); the capture defect goes to P1-07 and P1-14 | P1-15 | producers.md:L426 |
| US freight occupation wages, annual and hourly median (BLS OEWS) | bls-oews-producer.mjs | regional-envelope (BLS spec) | P1-15 | producers.md:L427 |
| EU labour cost level averaged over six member states (Eurostat lc_lci_lev) | eurostat-lc-lci-lev-producer.mjs | regional-envelope (Eurostat labour spec) | P1-15 | producers.md:L428 |
| EU27 non-household electricity price (Eurostat nrg_pc_205) | eurostat-nrg-pc-205-producer.mjs | regional-envelope (Eurostat electricity spec) | P1-15 | producers.md:L429 |
| GB daily grid carbon intensity, 14 complete days (NESO) | neso-carbon-intensity-producer.mjs | neso-carbon-intensity (`enabled: false`, ruling A) | P1-15 | producers.md:L430 |
| Current-state regional facts: envelope rows, latest per natural key, region resolution, keyed upsert | run-envelope-producer.mjs | regional-envelope | P1-15 | producers.md:L431 |
| US state cost facts (minimum wage, industrial electricity) grounded verbatim, sources rated, jurisdiction entities authored | state-cost-facts-producer.mjs | state-cost-facts (`enabled: false`, R14 hold) | P1-15 | producers.md:L432 |
| UKPN LTDS capacity heatmap: per-substation demand headroom and constraint into grid_connection_queues, licence and rights gates, publisher registration | ukpn-capacity-heatmap-producer.mjs | ukpn-heatmap | P1-15 | producers.md:L433 |
| EEA heavy-duty CO2 extract streamed and aggregated into OEM roadmap evidence (stage from registrations) | eea-hdv-csv.mjs, eea-hdv-map.mjs, eea-hdv-co2-producer.mjs, eea-hdv-classification.json | eea-hdv-roadmaps | P1-15 | producers.md:L434 |
| Reviewed rows files with citations into oem_tech_roadmaps, grid_connection_queues, reroute_events | oem-roadmap-producer.mjs, grid-queue-producer.mjs, reroute-producer.mjs, lib/rows-file.mjs | rows-file-producers, core/producers/rows-file | P1-15 | producers.md:L435 |
| Operator-supplied external CSV rows into auxiliary_energy_profiles and indexation_clauses, org-stamped, capped, entity refs validated | auxiliary-energy-producer.mjs, indexation-producer.mjs, lib/operator-rows-contract.mjs, lib/cli-csv-args.mjs | operator-rows, core/producers/rows-file | P1-15 | producers.md:L436 |
| Fixture proof of the operator-rows pipeline | run-fixture-import.mjs, fixtures/*.csv | NOT PORTED as runtime; it is the contract's test | P1-15 | producers.md:L437 |
| Per-table sourcing record (which free source exists) | SOURCES.md | docs (section 6) | P1-15 | producers.md:L438 |
| Statutory or estimate or M labelling with a stated reason | src/lib/spec09/label.mjs | core/values/label | P1-15 | producers.md:L439 |
| Auxiliary energy: kWh, gCO2e against a grid intensity, ratio to the leg | auxiliary-energy.mjs | features/operations/calc | P1-15 | producers.md:L440 |
| Grid queue gate on p90 against the decision horizon | grid-queue.mjs | features/operations/calc | P1-15 | producers.md:L441 |
| Clamped indexation arithmetic with a worked example | indexation.mjs, indexation-producer.mjs | features/market/calc | P1-15 | producers.md:L442 |
| Refusal to draft clause text | indexation.mjs draftClauseText | NOT PORTED as code; the ruling stays in the calc module's one-line doc | P1-15 | producers.md:L443 |
| Payload penalty from pack density; TCO crossover refusal | oem-payload.mjs | features/market/calc (panel wiring owed, gap 5) | P1-15 | producers.md:L444 |
| Reroute fuel-burn multiplier and the five-surface compounding chain | reroute.mjs | features/market/calc | P1-15 | producers.md:L445 |
| Deterministic research assessment: maturity, horizon, credibility, refusal, supersede, signposts with re-pointing, idempotent re-run, bounded first live pass | research-assessment-producer.mjs | features/research/assessment-producer | P1-15 | producers.md:L446 |
| OpenAlex DOI resolution into the authority record (percentile value extracted once) | research-assessment-producer.mjs 152-179 | assessment-producer | P1-15 | producers.md:L447 |
| Source authority: role class with named overrides, standings, funding independence three-state, reception with the under-24-month velocity rule, integrity, buckets never a mean | authority-score.mjs | features/research/authority-score | P1-15 | producers.md:L448 |
| OpenAlex client: polite pool, 429 backoff, 404 as absence, works search | openalex-client.mjs, research-walker.mjs 76-79 | core/http/openalex | P1-15 | producers.md:L449 |
| Research walker: grey-lit sources rated by class, topic and open-needs search, publisher placement by rule or host verdict with residue list, mint through the chokepoint, run kind in the artifact | research-walker.mjs | features/research/walker | P1-15 | producers.md:L450 |
| Theme classification of null-theme research findings | backfill-themes.mjs | rule-based theme-rules plus the `theme-classification` drain kind (FREE) | P1-15 | producers.md:L451 |
| Trigger questions at mint time: four product questions per routed surface, dedup, flag rows | trigger-questions.mjs, constants.mjs | features/learning/trigger-questions | P1-15 | producers.md:L452 |
| Questions on change from the outbox: emitting-table registry, change text, verified linked items, 25 cap, replay | questions-on-change.mjs, emitting-tables/*.json | features/learning/questions-on-change | P1-15 | producers.md:L453 |
| Signposts fire on events, repair, deadline, lifecycle repair; scoring writes the reliability ledger first | prediction-scoring.mjs | features/learning/signpost-scoring | P1-15 | producers.md:L454 |
| Judgement drain: switches first, six kinds exported and leased into batches, stale re-authoring mode, finish with releases and artifact | switch.mjs, kinds.mjs, plan-drain.mjs, artifact.mjs | core/drain/switch, features/drain | P1-15 | producers.md:L455 |
| One batch per merge for a kind that names its file | resolve-push-batch.mjs | NOT PORTED as code; INV-248 and a P1-08 dispatcher check | P1-15 | producers.md:L456 |
| Extract dated obligation events from grounded claims and sections, EN and PT dates, ISO, month-year, bare years after `by`/`from`/`as of`/`since` | extract-forward-events.mjs 7-145, 641-803 | extract/date-grammar, extract/rules | P1-16 | obligations.md:L293 |
| Six event kinds with trigger rules, phase-step reclassification, window-end emission | extract-forward-events.mjs 641-792, 850-871, 956-1007 | extract/rules, extract/scan | P1-16 | obligations.md:L294 |
| Deontic and aim checks both sides of the date; bare-year ambiguity recorded as a skip | extract-forward-events.mjs 637-639, 918-953 | extract/scan | P1-16 | obligations.md:L295 |
| `as of` / `since` candidates promoted only with a following deontic clause; data-unavailability notes skipped | extract-forward-events.mjs 794-803, 1011-1075 | extract/scan | P1-16 | obligations.md:L296 |
| Reference-date refusal (run date, document date) and status-only refusal | extract-forward-events.mjs 810-844; read-and-extract.mjs 25-49 | extract/rules, extract/read-extraction-input | P1-16 | obligations.md:L297 |
| Verbatim source_span guard | extract-forward-events.mjs 151-160, 1328, 1381, 1426 | extract/window | P1-16 | obligations.md:L298 |
| Display window: genuine sentence, paragraph, list and slot-marker boundaries; fragment ellipsis; table-cell selection; label, citation-key and URL stripping; idempotent cleanup | extract-forward-events.mjs 162-471 | extract/window | P1-16 | obligations.md:L299 |
| Record-facts FACT wrapper unwrap (guillemets, nested, legacy straight quotes); GAP wrapper skipped | extract-forward-events.mjs 474-562 | extract/window | P1-16 | obligations.md:L300 |
| Due-date slot claim: finer precision from the slot, context rescue with three named outcomes | extract-forward-events.mjs 1084-1166, 1344-1407; read-and-extract.mjs 89-146 | extract/scan, extract/read-extraction-input | P1-16 | obligations.md:L301 |
| Within-extraction dedupe, claim-backed over section-backed, every drop recorded | extract-forward-events.mjs 1172-1279, 1447-1452 | extract/dedupe | P1-16 | obligations.md:L302 |
| Section-backed event must be verbatim in a FACT claim span (D10 class fix), logged, counted | read-and-extract.mjs 196-268 | extract/verbatim-in-source | P1-16 | obligations.md:L303 |
| Fetch only what might be consumed: the capture pool read only when a slot claim needs it | read-and-extract.mjs 148-193, 306-312 | extract/read-extraction-input | P1-16 | obligations.md:L304 |
| One item's extraction input in the extractor's shape, claims and sections returned for the stale-row check | read-and-extract.mjs 292-338 | extract/read-extraction-input, verbatim-in-source | P1-16 | obligations.md:L305 |
| compliance_deadline from the earliest future compliance_deadline event, confidence then id tiebreak, never nulled | compliance-deadline-sync.mjs 1-56 | derive/compliance-deadline | P1-16 | obligations.md:L306 |
| Register derivation: one row per event, jurisdiction, leg modes, kind and date copied, status from the item | derive-obligations.mjs 96-150, 219-266 | derive/derive-register | P1-16 | obligations.md:L307 |
| binding_position in the order identity, record-facts claim, title, duty holders; generic phrases gated by jurisdiction | classify-binding-position.mjs; derive-obligations.mjs 48-94, 163-192 | derive/classify-binding-position | P1-16 | obligations.md:L308 |
| Idempotent derivation on forward_event_id; dry by default; apply through the guarded insert with a read-back and a mismatch exit | derive-obligations.mjs 152-161, 268-301; scripts/maintenance/derive-obligations.mjs | derive/derive-register, jobs/derive-obligations | P1-16 | obligations.md:L309 |
| Optional-read disclosure (`optional_reads_unavailable`) | derive-obligations.mjs 241-263 | derive/derive-register, surfaced as a failure of the run, not a note (ruling: B-0322) | P1-16 | obligations.md:L310 |
| Obligation objects from candidates: refusal reasons, verbatim-in-capture, versioned supersede, binding position from candidate or classifier, dry by default | derive-obligation-objects.mjs | derive/derive-objects | P1-16 | obligations.md:L311 |
| Register read: filters in the query, three next-due segments, exact counts, page planner, item join, obligation_text trimmed to 160 | read-register.mjs 6-37, 56-135, 147-171, 320-489 | read/register-read | P1-16 | obligations.md:L312 |
| Register facets with live counts, one pass, four maps; honest-empty forward-event count | read-register.mjs 491-611 | read/register-facets | P1-16 | obligations.md:L313 |
| Detail-variant register for one item, legacy_id resolved | read-register.mjs 272-306; register/route.ts 82-98 | read/register-read (itemId), api/register | P1-16 | obligations.md:L314 |
| GET register with meta on the true first load; 60 per minute | register/route.ts | api/register | P1-16 | obligations.md:L315 |
| Upcoming read: kinds except other, from today, verified live items, jurisdiction default from the workspace profile, mode and region scope from facets or profile, hidden-by-scope count, scope label | read-upcoming.mjs; upcoming/route.ts | read/upcoming-read, api/upcoming | P1-16 | obligations.md:L316 |
| Detail-variant upcoming for one item (20), list variant (8), `?limit` override | upcoming/route.ts 62-64, 117-123 | api/upcoming | P1-16 | obligations.md:L317 |
| Rail card rows: inside 30 days, soonest first, four rows, UTC day math, server clock | obligation-rail-select.mjs | read/rail-select | P1-16 | obligations.md:L318 |
| Kind labels for every surface | kind-labels.mjs (+ two component copies) | kinds.ts | P1-16 | obligations.md:L319 |
| Corpus-file extraction runner: dry preview, `--execute` writes events and skips files and a harness artifact in `finally`, metrics by kind, confidence, precision, skip reason and dedupe drops | run-extraction.mjs | jobs/run-extraction | P1-16 | obligations.md:L320 |
| Backfill of items with zero events, resumable by id, compliance_deadline synced through the guarded path, 23505 as zero-new | dispatch-extraction.mjs | jobs/extract-backfill | P1-16 | obligations.md:L321 |
| The forward-events and date-chain harness families (registration, governing files) | scripts/harness-runs/forward-events/family.json, date-chain/family.json | P1-08 (governing paths updated to the new tree) | P1-16 | obligations.md:L322 |
| FE-1 dry-run report | DRY-RUN-REPORT.md | NOT PORTED; its hand-check method becomes the reviewed golden file in the proof | P1-16 | obligations.md:L323 |
| The design tokens: surfaces, ink, four bands with tint and border, lines, elevation, radius, spacing, type scale, interaction states | theme.css 20-96 | src/ui/theme.css | P1-17 | ui-kit.md:L368 |
| Legacy alias names for pages not yet migrated | theme.css 121-329 | NOT PORTED as aliases; each call site moves to the canonical name in its own lane (the kit's 12 names in this lane) | P1-17 | ui-kit.md:L369 |
| Self-hosted font family names and the Tailwind @theme mapping | globals.css 1-35 | theme.css (fonts); the @theme block goes with Tailwind | P1-17 | ui-kit.md:L370 |
| Body, scrollbar, selection, focus ring, reduced motion | globals.css 144-211 | base.css | P1-17 | ui-kit.md:L371 |
| The responsive row system (.cl-row, .cl-row-grid, .cl-section-head) | globals.css 392-505 | base.css | P1-17 | ui-kit.md:L372 |
| Stacked-card tables on the phone (.cl-table-cards) | globals.css 569-590 | base.css | P1-17 | ui-kit.md:L373 |
| Scroll-shadow affordance for sideways strips | globals.css 533-558 | base.css | P1-17 | ui-kit.md:L374 |
| Rail facet rows: 24 px desktop, 44 px touch | globals.css 593-618 | base.css | P1-17 | ui-kit.md:L375 |
| Detail section head band tint and 24 px title | globals.css 620-626 | base.css (on SectionHead's `rule` and `size` props, no `!important`) | P1-17 | ui-kit.md:L376 |
| Legacy card, badge, typography, AI bar, stagger, gradient bars, sidebar widgets, stat grids, coverage rails, two-col, page pad, map frame, ops grids | globals.css 37-140, 158-190, 213-390 | NOT PORTED (49 of 71 selectors have no reader; `.cl-card` 15, `.cl-badge*` 5, `.cl-card-*` and `.cl-stat-*` under 6 are page classes their owning lanes replace with SectionCard, TagChip and StatBlock) | P1-17 | ui-kit.md:L377 |
| The absence convention: NEEDS_PHRASE, precedence, dash in narrow cells | Absence.tsx | src/ui/Absence | P1-17 | ui-kit.md:L378 |
| The one detail action card with exposure cells and Show more | ActionCard.tsx | src/ui/ActionCard | P1-17 | ui-kit.md:L379 |
| Export brief as markdown, native share with clipboard fallback, + Tag trigger, viewer gating | ActionRow.tsx | src/ui/ActionRow (viewer gating by a prop the feature passes; copy and share confirmed to the reader) | P1-17 | ui-kit.md:L380 |
| Band-proportion brand rule | BandGradientRule.tsx | src/ui/BandGradientRule | P1-17 | ui-kit.md:L381 |
| White band group header | BandGroupHeader.tsx | src/ui/BandGroupHeader | P1-17 | ui-kit.md:L382 |
| Band tiles with skeleton count, link or in-place filter, 2x2 on the phone | BandTile.tsx, BandTileRow.tsx | src/ui/BandTile | P1-17 | ui-kit.md:L383 |
| Customer bias chips (row: two plus a count; detail: three plus a disclosure), lower-confidence wording, the legend | BiasChips.tsx | src/ui/BiasChips | P1-17 | ui-kit.md:L384 |
| Button with four variants and three sizes | Button.tsx | src/ui/Button (sizes meet the floor) | P1-17 | ui-kit.md:L385 |
| Card foot strip with linked sides | CardFoot.tsx | src/ui/CardFoot | P1-17 | ui-kit.md:L386 |
| Band chip with optional window, tier square, neutral tag in two sizes, workspace tag pill with remove, labelled filter chip groups with the mobile shell, catalogue-record grade chip | Chips.tsx | src/ui/Chips | P1-17 | ui-kit.md:L387 |
| Command bar: Cmd-K focus, debounced search dropdown as ListRows, combobox ARIA, Escape and outside-click dismissal that keeps the query, visible clear and close controls, Enter to results, Cmd-Enter and Ask to the assistant gated on the bootstrap flag | CommandBar.tsx, commandBarKeyboard.ts | P1-18 shell CommandBar over kit parts | P1-17 | ui-kit.md:L388 |
| The six coverage states with request, widen, retry and status actions, in block, inline and cell forms | CoverageState.tsx | src/ui/CoverageState plus the coverage feature's request hook | P1-17 | ui-kit.md:L389 |
| Detail sub-section heading | DetailSubSection.tsx | src/ui/DetailSubSection | P1-17 | ui-kit.md:L390 |
| Applied workspace tags with attribution tooltips and remove, viewer gating, the popover anchor | DetailTagRow.tsx | P1-02 workspace tags UI | P1-17 | ui-kit.md:L391 |
| Full-page error state with retry | ErrorState.tsx | src/ui/ErrorState | P1-17 | ui-kit.md:L392 |
| Fact card: kind band, figure lead, claim with bold figures and embedded links, four-line provenance column with tier square, merged additional claims; record-grade cards; the operations matrix card with six-word headline, index vs base, period and provenance line; per-claim tier from the surface's claim-tier map | FactCard.tsx | src/ui/FactCard | P1-17 | ui-kit.md:L393 |
| Choose-file row | FilePickRow.tsx | src/ui/FilePickRow | P1-17 | ui-kit.md:L394 |
| Impact meter: twelve segments in the ramp colour, unscored dashed outlines with the dash, legend at a known N, the per-dimension full meter | ImpactMeter.tsx | src/ui/ImpactMeter | P1-17 | ui-kit.md:L395 |
| Compact inline error banner | InlineErrorBanner.tsx | src/ui/InlineErrorBanner | P1-17 | ui-kit.md:L396 |
| Fact-card group with 4-card cap, "N more facts" disclosure, band tint and ACTION strip from the page's band context, band pill only when passed explicitly | ItemGroup.tsx, shared/MoreBelowDisclosure.tsx | src/ui/ItemGroup, src/ui/MoreBelowDisclosure | P1-17 | ui-kit.md:L397 |
| The list row: spine, jurisdiction, title with meta line (kind, grade, meta text, one absence reason, bias chips, tags), impact, due with days, timeline, tier, 44x44 overflow; the whole row one link; phone, tablet, mid and wide layouts; the container-query reflow for narrow boxes | ListRow.tsx | src/ui/ListRow and base.css | P1-17 | ui-kit.md:L398 |
| The list column header | ListRow.tsx 151-293 | src/ui/ListRowHeader | P1-17 | ui-kit.md:L399 |
| The jurisdiction register row and header (map) | ListRow.tsx 556-668, 225-260 | map surface RegisterRow (id owed) | P1-17 | ui-kit.md:L400 |
| Masthead: VOL and ISO week line, Anton title in two sizes, dek with balanced wrapping, command bar, notice, action and connections slots, 1440 grid and phone stack | Masthead.tsx | src/ui/Masthead (command bar as a slot), core/time/iso-week | P1-17 | ui-kit.md:L401 |
| Row dot strip: passed, next with ring, ahead; green track to next | MilestoneTimeline.tsx, milestone-timeline-classify.ts, timeline-dot-styles.ts | src/ui/MilestoneTimeline | P1-17 | ui-kit.md:L402 |
| Rail card shell with head link, head node, linked title with count | RailCard.tsx | src/ui/RailCard | P1-17 | ui-kit.md:L403 |
| Hydration-safe relative time | RelativeTime.tsx, relative-time-format.ts | src/ui/RelativeTime | P1-17 | ui-kit.md:L404 |
| Admin and community table: header strip, activatable rows, below-row slot, action button, overflow menu with Esc and outside click, sideways scroll on the phone | RowTable.tsx | src/ui/RowTable, src/ui/Menu | P1-17 | ui-kit.md:L405 |
| The card shell with the rule, padded and flow layouts, polymorphic tag, band-grouping exemption | SectionCard.tsx, SectionRule.tsx | src/ui/SectionCard | P1-17 | ui-kit.md:L406 |
| S-section head with ordinal and meta; card head with aside | SectionHeader.tsx, SectionHeading.tsx, section-title-style.ts | src/ui/SectionHead | P1-17 | ui-kit.md:L407 |
| Section index bar: short names, scroll spy, never truncates, the Summary and Full switch inside the bar | SectionIndex.tsx, SectionIndexLink.tsx, section-index-styles.ts, DetailShell's SummaryDepthSwitch | src/ui/SectionIndex | P1-17 | ui-kit.md:L408 |
| In-card section label | SectionLabel.tsx | src/ui/SectionLabel | P1-17 | ui-kit.md:L409 |
| Skeletons in final geometry: list row, band tile, stat block, rail date row, page frame and box | Skeleton.tsx, skeleton-page.tsx | src/ui/Skeleton | P1-17 | ui-kit.md:L410 |
| Underlined source link | SourceLink.tsx | src/ui/SourceLink | P1-17 | ui-kit.md:L411 |
| Stat block: stack, row, tile; critical tone; loading | StatBlock.tsx | src/ui/StatBlock | P1-17 | ui-kit.md:L412 |
| State note with band tint from context and one action | StateNote.tsx, band-context.tsx | src/ui/StateNote | P1-17 | ui-kit.md:L413 |
| Seed-fallback banner with reason | SystemErrorBanner.tsx | src/ui/SystemErrorBanner | P1-17 | ui-kit.md:L414 |
| Tab row as links or in-page tabs, page or card-head placement, tablist semantics | TabRow.tsx | src/ui/TabRow | P1-17 | ui-kit.md:L415 |
| Tag popover: search, apply and remove, create, attribution line, keyboard model, viewport fit | TagPopover.tsx, tagPopoverKeyboard.ts | P1-02 workspace tags UI | P1-17 | ui-kit.md:L416 |
| Detail timeline: header counts, labelled dot track with keyboard-reachable labels, collapse to four plus "+N more" with a jump link, next-obligation callout with Full schedule, the all-passed line, the vertical phone form | Timeline.tsx | src/ui/Timeline | P1-17 | ui-kit.md:L417 |
| Toast, success and error | Toast.tsx | src/ui/Toast | P1-17 | ui-kit.md:L418 |
| Watch toggle: personal and team pills, team-only types, viewer gating, the ActionRow star, the 44 px icon; optimistic toggle with revert; shared membership cache; server-seeded initial state | WatchButton.tsx | src/ui/WatchToggle (chrome) and the watchlist feature's useWatchMembership | P1-17 | ui-kit.md:L419 |
| clsx plus tailwind-merge; color-mix tint | cn.ts, tint.ts | src/ui (kept, see section 7) | P1-17 | ui-kit.md:L420 |
| Frozen real fixtures for the parts gallery | __fixtures__ | P1-25 gallery or test fixtures | P1-17 | ui-kit.md:L421 |
| The research credibility chips, GRADE modifier ledger, dissent panel, admin tier legend and facet, the provisional review bias chips (read for the rating and bias display, not in scope) | research/CredibilityChip*.tsx, DissentPanel.tsx, sources/SourceTierLegend.tsx, ProvisionalReviewCard.tsx | their lanes (P1-21, P1-05/06), on the kit's TierChip, BiasChips, FilterChip, Dialog and Absence | P1-17 | ui-kit.md:L422 |
| 1440 frame, 252 px nav track, one-track collapse under 768, `<main>` scroller | AppShell.tsx | ui/shell/AppShell | P1-18 | shell-list.md:L378 |
| Nav sections with live counts and active row | Sidebar.tsx | ui/shell/NavCard, nav-model | P1-18 | shell-list.md:L379 |
| Band-gradient nav cap from live counts | Sidebar.tsx, BandGradientRule (P1-17) | NavCard, TopBar | P1-18 | shell-list.md:L380 |
| Account row opening the account menu; signed-out Account link | Sidebar.tsx | NavCard + P1-01 UserMenu | P1-18 | shell-list.md:L381 |
| Admin row with attention count and workspace role badge | Sidebar.tsx, useAdminAttention.ts | NavCard, use-admin-attention | P1-18 | shell-list.md:L382 |
| Mobile drawer (288 px, dvh, safe-area) closing on navigation | Sidebar.tsx, AppShell.tsx | NavCard via Sheet | P1-18 | shell-list.md:L383 |
| Mobile top bar: hamburger, page title, search glyph to the command bar, avatar with unread dot | TopBar.tsx, useUnreadNotificationsCount.ts | ui/shell/TopBar, use-unread-count | P1-18 | shell-list.md:L384 |
| No-workspace banner and onboarding redirect on a resolved null | AppShell.tsx, app-shell-banner.ts | AppShell | P1-18 | shell-list.md:L385 |
| Identity error note with Retry | AppShell.tsx | AppShell | P1-18 | shell-list.md:L386 |
| Overrides and personal-state hydration from one bootstrap | useWorkspaceOverridesHydration.ts, usePersonalState.ts, useWorkspaceBootstrap.ts | use-bootstrap | P1-18 | shell-list.md:L387 |
| Assistant flag and nav counts through the bootstrap | useWorkspaceBootstrap.ts, nav-counts.ts | use-bootstrap, nav-counts.server | P1-18 | shell-list.md:L388 |
| Back to top | BackToTop.tsx | ui/shell/BackToTop (working) | P1-18 | shell-list.md:L389 |
| Content frame with rail | PageFrame.tsx | ui/shell/PageFrame | P1-18 | shell-list.md:L390 |
| Self-hosted fonts, metadata, one QueryClient | layout.tsx, QueryProvider.tsx | app/layout, QueryProvider | P1-18 | shell-list.md:L391 |
| Loading, error (with report) and not-found states | loading.tsx, error.tsx, not-found.tsx | app/* | P1-18 | shell-list.md:L392 |
| Privacy policy | privacy/page.tsx | app/privacy (copy pending ruling) | P1-18 | shell-list.md:L393 |
| Masthead with page-scoped command bar on every list | ListSurfaceShell.tsx | ListSurface (Masthead from P1-17) | P1-18 | shell-list.md:L394 |
| Band tiles as a facet, skeleton tiles while loading | ListSurfaceShell.tsx | ListSurface | P1-18 | shell-list.md:L395 |
| Rows grouped by band, per-band cap, "All N" expand, "then <band> · N" transition, end of list | ListSurfaceShell.tsx | ListSurface | P1-18 | shell-list.md:L396 |
| Show as one list (flat) | ListSurfaceShell.tsx, SortRow | ListSurface, SortRow | P1-18 | shell-list.md:L397 |
| Virtualized rows past 30 | ListSurfaceShell.tsx, VirtualizedRowList | ListSurface (VirtualizedRowList via the coordinator's gap 2) | P1-18 | shell-list.md:L398 |
| Per-band transition strip (sectionFoot), aboveRows, belowRows, stateNote, emptyState slots | ListSurfaceShell.tsx | ListSurface | P1-18 | shell-list.md:L399 |
| Mobile facet chip strip and Filters sheet | ListSurfaceShell.tsx | ListSurface + Sheet | P1-18 | shell-list.md:L400 |
| Filters rail card with checkbox facets, live counts, +N more, Clear N | ListSurfaceRailCards.tsx | ui/list-surface/rail | P1-18 | shell-list.md:L401 |
| Legend rail card with the impact meter and tier scale | ListSurfaceRailCards.tsx | rail | P1-18 | shell-list.md:L402 |
| Obligations next 30 days rail card | ListSurfaceRailCards.tsx | P1-19 regulations (with an error state) | P1-18 | shell-list.md:L403 |
| Carbon cost per FEU and Next data drops rail cards | ListSurfaceRailCards.tsx | market surface | P1-18 | shell-list.md:L404 |
| Sort row (Next date, Newest, A-Z, My order) and Window row (7d, 30d, 90d, All) | ListSurfaceSortRow.tsx, list-surface-helpers.ts | SortRow, filter-sort | P1-18 | shell-list.md:L405 |
| Facet options (mode display labels, topic, tier, region, band) with live counts | list-surface-helpers.ts | facets | P1-18 | shell-list.md:L406 |
| Free-text search over title, jurisdiction, topic, tags, what and why | list-surface-helpers.ts | filter-sort | P1-18 | shell-list.md:L407 |
| URL-held filter state; band and sort deep links from the dashboard | list-surface-helpers.ts, useListSurfaceFilter.ts | url-state | P1-18 | shell-list.md:L408 |
| Detail-return position (In this list N of M, prev, next) | list-surface-helpers.ts withListPosition | filter-sort | P1-18 | shell-list.md:L409 |
| Map to regulations region link | regulations-region-link.ts | url-state | P1-18 | shell-list.md:L410 |
| First page 60 server-side, remainder after paint, cursor pages of 30 | list-pagination.ts, useRemainderFetch | core/lists/pagination, use-list-rows | P1-18 | shell-list.md:L411 |
| Row fields, watch type, canonical detail link | list-row-fields.ts, item-links.ts | core/lists | P1-18 | shell-list.md:L412 |
| Org and public listing reads, chunked timelines, aggregates, surface counts, category reads | supabase-server.ts slices | features/lists | P1-18 | shell-list.md:L413 |
| Themes across pages strip on the four lists | ThemeStrip.tsx, ThemeStripView.tsx, fetchThemeChips | ui/list-surface/ThemeStrip | P1-18 | shell-list.md:L414 |
| Connections strip and rail card on detail pages | ItemConnectionsCard.tsx | detail (P1-19..24) | P1-18 | shell-list.md:L415 |
| Viewer relevance badge on detail pages | RelevanceBadge.tsx, RelevanceBadgeClient.tsx | detail | P1-18 | shell-list.md:L416 |
| Inference card with admissibility gate | InferenceClaim.tsx | detail | P1-18 | shell-list.md:L417 |
| Markdown sections with GFM tables reflowed to cards on phones | GfmSection.tsx | P1-17 ui-kit | P1-18 | shell-list.md:L418 |
| "N more below" disclosure | MoreBelowDisclosure.tsx | P1-17 ui-kit | P1-18 | shell-list.md:L419 |
| Market signal detail page | MarketSignalDetailSurface.tsx | market surface | P1-18 | shell-list.md:L420 |
| Settings page sections and section index | SettingsPage.tsx | P1-02 workspace | P1-18 | shell-list.md:L421 |
| Pinned-locale numbers and dates, plural agreement, relative time, one render instant | format.ts, relative-time.ts, render-now.ts | core | P1-18 | shell-list.md:L422 |
| HTML to text, CSV split | text/html-to-text.mjs, csv/split.mjs | core | P1-18 | shell-list.md:L423 |
| Detail cache tags and flush; fallback never cached; worker flush routes | cache/*, api/cache/revalidate-item, api/revalidate | P1-07 core/cache/tags, core/cache/fallback-guard, one route | P1-18 | shell-list.md:L424 |
| Per-sector synopsis view with ten-section parser, cross-sector headline and other-sector accordions | SectorSynopsis.tsx, IntelligenceBrief.tsx, IntelligenceMetadataStrip.tsx, metadata route | NOT PORTED as code (never mounted; SHELVED feature per fsi-app CLAUDE.md "Sector Activation"). The requirement, per-sector reporting with an opt-in notice, stays recorded there; when activated it is built fresh on GfmSection | P1-18 | shell-list.md:L425 |
| Legacy editorial masthead | PageMasthead.tsx | NOT PORTED (superseded by P1-17 Masthead on every customer route; parts pages switch) | P1-18 | shell-list.md:L426 |
| Regulations list, first 60 rows server-rendered, the rest after paint | regulations/page.tsx, RegulationsLedger.tsx | features/regulations/RegulationsLedger | P1-19 | regulations.md:L440 |
| Band tiles that filter, grouped or flat list, per-band cap with expand | RegulationsLedger.tsx 184-353 | RegulationsLedger (P1-17 shell parts) | P1-19 | regulations.md:L441 |
| URL-backed facets: band, mode, jurisdiction, topic, source tier, workspace tags, search | RegulationsLedger.tsx 138, 184-215 | RegulationsLedger | P1-19 | regulations.md:L442 |
| Sort: next date, newest, A-Z, my order, with the `?sort=` deep link | regulations/page.tsx 27-31, RegulationsLedger.tsx 92-97 | RegulationsLedger | P1-19 | regulations.md:L443 |
| Scope line: active count, jurisdictions, last sync, next obligation | RegulationsLedger.tsx 270-293 | RegulationsLedger | P1-19 | regulations.md:L444 |
| "Updated <date>" chip within 30 days of a regenerated brief | RegulationsLedger.tsx 226-243 | RegulationsLedger | P1-19 | regulations.md:L445 |
| Workspace priority retag and dismiss, restore stash | RegulationsLedger.tsx 143-153, 247-255; DismissedStash.tsx; PriorityDropdown.tsx | RegulationsLedger, DismissedStash, P1-17 RowOverflowMenu | P1-19 | regulations.md:L446 |
| Watch toggle inside the row menu | RegulationsLedger.tsx 253 | RegulationsLedger | P1-19 | regulations.md:L447 |
| List position carried into the detail page (N of M, prev, next) | list-surface-helpers withListPosition; DetailShell.tsx 499-628 | useListPosition, DetailShell | P1-19 | regulations.md:L448 |
| Theme strip and coverage denominator under the list | regulations/page.tsx 62-67 | pages (P1-18 ThemeStrip, coverage owner) | P1-19 | regulations.md:L449 |
| Detail masthead with breadcrumb, scoped ask box, ActionCard (band, grade, tier, bias, meta, export, share, tag, watch, where, who pays, timeline) | RegulationDetailSurface.tsx 285-339; action-card-common-props.tsx | RegulationDetail, action-card-props | P1-19 | regulations.md:L450 |
| Markdown export of the brief | RegulationDetailSurface.tsx 294-304 | RegulationDetail | P1-19 | regulations.md:L451 |
| Obligation events merged into the timeline with "+N more" to the register | RegulationDetailSurface.tsx 193-211, 307-308; timeline-math.ts | RegulationDetail, core/detail/timeline | P1-19 | regulations.md:L452 |
| Section index with Summary or Full-brief depth and scroll spy | RegulationDetailSurface.tsx 182, 251-262, 343; section-index-data.ts | RegulationDetail, P1-17 SectionIndex | P1-19 | regulations.md:L453 |
| Summary: short text, trajectory, what changed (impact lines only), dispute note | RegulationDetailSurface.tsx 474-533 | RegulationDetail | P1-19 | regulations.md:L454 |
| Record-grade summary: verbatim facts with tier chips, key dates, gaps count, tags | RegulationDetailSurface.tsx 537-604; parse-record-sections.ts; load-detail-core fetchClaimTierMap | RecordFacts, record-sections, claim-tiers | P1-19 | regulations.md:L455 |
| Fact sections 3, 4, 8, 10, 11 as fact cards | RegulationDetailSurface.tsx 126-145, 414-424; FactBlocks; fact-card-model; fact-paragraphs | RegulationDetail, FactBlocks, fact-model | P1-19 | regulations.md:L456 |
| Sections 1, 2, 5, 6, 7, 9, 12, 13 (today only inside the raw full brief) | RegulationDetailSurface.tsx 403-407 | RegulationDetail as structured sections (design change owed) | P1-19 | regulations.md:L457 |
| Penalties block from the cost columns | RegulationDetailSurface.tsx 451-472 | RegulationDetail | P1-19 | regulations.md:L458 |
| Sources grid with registry tier, cited-source match, bias tags | SourcesGrid.tsx; extract-regulation-sections.ts 358-492 | SourcesGrid, sources-parse | P1-19 | regulations.md:L459 |
| Connected intelligence: intersections by surface, possible connections, theme analysis, stale note, members by page | CrossPageSection.tsx; supabase-server.ts 4236-4363 | CrossPageSection, cross-page-read | P1-19 | regulations.md:L460 |
| Inferences section, per request | InferenceSection.tsx; inference-view.mjs; supabase-server.ts 4372-4393 | InferenceSection, inference-view, cross-page-read | P1-19 | regulations.md:L461 |
| Connections and supersessions in the masthead card | RegulationDetailSurface.tsx 336-338 | RegulationDetail (P1-18 ItemConnectionsCard) | P1-19 | regulations.md:L462 |
| Rail: At a glance, Impact meter, Relevance badge, Owner and team, In this list, Legend | RegulationDetailSurface.tsx 345-382; DetailShell; OwnerTeamCard | DetailShell, OwnerCard | P1-19 | regulations.md:L463 |
| Admin-only agent integrity banner | RegulationDetailSurface.tsx 165-167, 608-638 | RegulationDetail | P1-19 | regulations.md:L464 |
| Detail priority menu with archive dialog | RegulationDetailSurface.tsx 653-674 | RegulationDetail with P1-17 RowOverflowMenu and P1-02 ArchiveDialog | P1-19 | regulations.md:L465 |
| Binding banner: positions, duty holders, triggers, applicability, cost slots, not-decomposed, retry, profile link | BindingBanner.tsx; api/detail/relevance | BindingBanner, useItemRelevance, relevance-route | P1-19 | regulations.md:L466 |
| Item obligation register on the detail page | [slug]/page.tsx 215; ObligationRegister | ObligationRegister (item variant) | P1-19 | regulations.md:L467 |
| Corridors this applies on | CorridorsAppliedStrip*.tsx | CorridorsApplied | P1-19 | regulations.md:L468 |
| Recalculation notices rail | [slug]/page.tsx 221-223 | page (NoticesRail owner) | P1-19 | regulations.md:L469 |
| Workspace notes and multi-assignment with notification at the foot of every detail page | DetailShell ItemCollabSlot; ItemNotesBlock; ItemAssignBlock | ui/detail/collab | P1-19 | regulations.md:L470 |
| Static generation of every slug with on-demand fallback and a 10 s build guard | [slug]/page.tsx 68-71; data.ts 545-590 | pages, P1-01 list read | P1-19 | regulations.md:L471 |
| Cached item read with tag revalidation; suppressed claims redacted per request | load-detail.ts; supabase-server.ts 3844-3852, 4226-4234 | core/detail/load, item-read | P1-19 | regulations.md:L472 |
| Obligation register page with corpus-wide facet counts, paging, three coverage states | register/page.tsx; ObligationRegisterPageView; ObligationRegister; FilterBar | ObligationRegisterPage, ObligationRegister | P1-19 | regulations.md:L473 |
| Map: band-coloured count markers, fly-to, key, mode, band and region filters, jurisdiction register linking to the ledger, immediate rail, coverage-gap rail, `?region=` prefilter | app/map/page.tsx; MapPageView; MapView; centroids; rollup | features/regulations/map | P1-19 | regulations.md:L474 |
| Jurisdiction labels, tiers, subnational check, region groups | lib/jurisdictions; constants.ts | core/jurisdictions | P1-19 | regulations.md:L475 |
| Profile applicability gate | compute-applicability.mjs | core/applicability | P1-19 | regulations.md:L476 |
| FuelEU Annex IV penalty with a compile-time contractable barrier and a named RFNBO gap | lib/statutory | core/statutory | P1-19 | regulations.md:L477 |
| Upcoming-obligations strip with scope and widen (Market policy timeline) | UpcomingObligationsStrip*.tsx | Market surface | P1-19 | regulations.md:L478 |
| Cluster synthesis rail card (Research) | ThemeBriefCard.tsx | Research surface | P1-19 | regulations.md:L479 |
| "Affected lanes" rail card (modes and jurisdictions, shipment-data promise) | AffectedLanesCard.tsx | NOT PORTED: modes and jurisdiction are in the masthead dek; the lanes question is answered by CorridorsApplied from external data; the shipment-data promise contradicts ADR-042 | P1-19 | regulations.md:L480 |
| Design-gallery fixtures | lib/detail/*fixtures* | NOT PORTED as lib code; P1-17 gallery | P1-19 | regulations.md:L481 |
| Market list with band groups, per-band cap 5 and expand | MarketIntelLedger.tsx | ui/MarketLedger | P1-20 | market.md:L336 |
| Signal-kind facet from the classified severity column | MarketIntelLedger.tsx:77-88, 179-195 | ui/MarketLedger (URL-backed) | P1-20 | market.md:L337 |
| Mode, region and workspace-tag facets with live counts | MarketIntelLedger.tsx:163-208 | ui/MarketLedger | P1-20 | market.md:L338 |
| Sorts Next date, Newest, A-Z and flat vs grouped view | MarketIntelLedger.tsx:66-70, 305-320 | ui/MarketLedger | P1-20 | market.md:L339 |
| Scope line with active signals and observed series counts | MarketIntelLedger.tsx:278-289 | ui/MarketLedger (copy reconciled with the verified gate) | P1-20 | market.md:L340 |
| Row overflow menu with Watch (signal) and a list position for prev / next | MarketIntelLedger.tsx:224-246 | ui/MarketLedger | P1-20 | market.md:L341 |
| Rail: carbon cost per FEU (two corridors, pending count) | market-rail-select.mjs:31-42; ListSurfaceRailCards | lib/rail-select, rail card | P1-20 | market.md:L342 |
| Rail: next data drops | market-rail-select.mjs:65-90 | lib/rail-select | P1-20 | market.md:L343 |
| Rail: legend, sources tracked | MarketIntelLedger.tsx:336-350 | ui/MarketLedger | P1-20 | market.md:L344 |
| Headline series card: five families, scrolling remainder, fold "+N rates" | MarketComparativeRibbon.tsx, headline-series-select.mjs, series-family.mjs | ui/HeadlineSeries, lib/headline | P1-20 | market.md:L345 |
| Delta 1w / 1m / YoY with arrow and unsigned magnitude | series-deltas.mjs, MarketComparativeRibbon.tsx:149-184 | lib/deltas, lib/ribbon-model | P1-20 | market.md:L346 |
| Absence states per window (no data yet, not covered, suppressed, not applicable) with SDMX codes | MarketComparativeRibbon.tsx:108-136, 570-606 | lib/ribbon-model | P1-20 | market.md:L347 |
| One-year sparkline sampled to 60 points | MarketComparativeRibbon.tsx:186-244 | lib/ribbon-model | P1-20 | market.md:L348 |
| Freshness badge and board freshness panel | series-freshness.mjs, SeriesFreshness.tsx | lib/freshness, ui/SeriesFreshness | P1-20 | market.md:L349 |
| Methodology and provenance drawer (series, factor, price statistic) | SeriesProvenance.tsx | ui/Provenance (with source rating) | P1-20 | market.md:L350 |
| Series board with producer states and unregistered bucket | MarketSeriesBoard.tsx, series-board-view-model.mjs | ui/SeriesBoard, lib/series-board | P1-20 | market.md:L351 |
| Watch a single market_series observation | MarketSeriesBoard.tsx:208-222 | ui/SeriesBoard | P1-20 | market.md:L352 |
| Carbon cost per FEU overlay per corridor with badge, range or gaps, jurisdiction chips, anchor ids for "Corridors this applies on" links | CarbonCostOverlay.tsx, carbon-cost-per-feu.mjs, page.tsx:89-114 | ui/CarbonCostOverlay, lib/carbon | P1-20 | market.md:L353 |
| Detail carbon intensity block (modal default, ambiguous, no factor) | carbon-overlay-view.mjs:46-108 | lib/carbon (rendered by the detail body) | P1-20 | market.md:L354 |
| Detail per-FEU block from the seeded corridor | carbon-overlay-view.mjs:163-195, resolve-item-corridor.mjs | lib/carbon | P1-20 | market.md:L355 |
| ETS proxy band from carrier notices | carrier-ets-surcharge-envelope.mjs:68-97 | P1-15, feeding lib/carbon's carbonPrice once a live write path exists | P1-20 | market.md:L356 |
| Lead-time position chart | lead-time-position.mjs, LeadTimeChart.tsx | lib/lead-time, ui/LeadTimeChart | P1-20 | market.md:L357 |
| Signal promotion state | signal-promotion.mjs | lib/signal-promotion | P1-20 | market.md:L358 |
| Trajectory bars on the detail page | TrajectoryBars.tsx | ui/TrajectoryBars | P1-20 | market.md:L359 |
| Published price board on the detail page and the list key figure | [slug]/page.tsx:159-186; supabase-server.ts:2310-2376; data.ts:969-1032 | read.ts | P1-20 | market.md:L360 |
| Series figure envelope and cadence on the detail page | [slug]/page.tsx:248-284 | read.ts | P1-20 | market.md:L361 |
| Convergence (independent citers, confirmations) on the detail page | [slug]/page.tsx:131-153 | read.ts (error surfaced) | P1-20 | market.md:L362 |
| Licence and attribution per factor source | [slug]/page.tsx:230-246 | read.ts | P1-20 | market.md:L363 |
| Policy timeline scoped by facets, with the widen control | MarketPolicyTimeline.tsx | ui/PolicyTimeline | P1-20 | market.md:L364 |
| Recalculation notices rail and feed hook | NoticesRail.tsx, RecalculationNotice.tsx | ui/figures/Notices | P1-20 | market.md:L365 |
| OEM equipment roadmap panel with TCO crossover notice | OemRoadmapPanel*.tsx | ui/Spec09Panels | P1-20 | market.md:L366 |
| Rerouting multipliers panel with compounding chain | ReroutingPanel*.tsx | ui/Spec09Panels | P1-20 | market.md:L367 |
| Contract indexation terms panel, org-scoped | IndexationPanel*.tsx | ui/Spec09Panels | P1-20 | market.md:L368 |
| Statutory, estimated and derived figure components behind one admissibility gate | components/figures | ui/figures/Figures | P1-20 | market.md:L369 |
| Range formatting and the 10 percent sensitivity convention | lib/figures | core/figures/format | P1-20 | market.md:L370 |
| Static params for every verified market slug, uuid redirect, skeletons | [slug]/page.tsx:100-116, loading files | app/market | P1-20 | market.md:L371 |
| Adopted vocabulary loader and adopted-entity mint | lib/vocabulary | core/vocabulary (P1-09) | P1-20 | market.md:L372 |
| EU Weekly Oil Bulletin xlsx and CSV parsing, upsert plan, display-row derivation, ratified series map | oil-bulletin-workbook.mjs, parsers/, write-market-series.mjs, refresh-published-price-statistics.mjs, series-item-map.mjs | P1-15 producers; the map becomes a table | P1-20 | market.md:L373 |
| Research list in urgency bands with mode and region facets and a live count | ResearchLedger.tsx | ui/ResearchList | P1-21 | research-ops.md:L351 |
| Theme facet row with counts, +N new in seven days, Unclassified pill | ResearchLedger.tsx 178-203, ResearchThemeCards.tsx | ui/ThemeFacetRow | P1-21 | research-ops.md:L352 |
| Theme classification from the theme column, else keywords | taxonomy.mjs | model/taxonomy | P1-21 | research-ops.md:L353 |
| Severity chip from the 13-value column, else text and recency, absence when null | taxonomy.mjs, ResearchLedger.tsx 246-250 | model/taxonomy, ResearchList | P1-21 | research-ops.md:L354 |
| Horizon band in the list row meta | ResearchLedger.tsx 254, read-assessments.mjs 90-93 | ResearchList, assessment-view | P1-21 | research-ops.md:L355 |
| Window sort with widen-to and clear-theme recovery | ResearchLedger.tsx 339-447 | ResearchList | P1-21 | research-ops.md:L356 |
| Awareness band unscored note | ResearchLedger.tsx 306-382 | ResearchList (link to the legend, no assistant call) | P1-21 | research-ops.md:L357 |
| Research source coverage rail card | ResearchLedger.tsx 451-474, supabase-server.ts 1768-1793 | ResearchList, research-reads | P1-21 | research-ops.md:L358 |
| Credibility legend and split credibility chips with the GRADE ledger | research/page.tsx 108-128, CredibilityChip* | ui/CredibilityChips (per assessment) | P1-21 | research-ops.md:L359 |
| Bias legend | research/page.tsx 132 (BiasLegend, P1-17) | P1-17 | P1-21 | research-ops.md:L360 |
| Theme strip and coverage denominator on both lists | research/page.tsx 106-107, operations/page.tsx 55-56 | P1-18 ThemeStrip, coverage line owner | P1-21 | research-ops.md:L361 |
| Research detail: grade, type, theme, modes chips; Summary; six findings sections; record-grade verbatim facts; Sources; Related by theme then source; cross-page section; export | ResearchFindingDetailSurface.tsx, research/[slug]/page.tsx | ui/ResearchDetail, research-reads | P1-21 | research-ops.md:L362 |
| Horizon assessment card: TRL and CRI corridors with method, band, kind, rule, confidence, basis, refusal state, status token | ResearchFindingDetailSurface.tsx 465-542 | ui/AssessmentCard | P1-21 | research-ops.md:L363 |
| Dissent panel, never collapsed: explicit dissent, else authority mix, else absence | DissentPanel.tsx | ui/DissentPanel | P1-21 | research-ops.md:L364 |
| Signposts: watched entity, predicate, direction, fired or watching | SignpostList.tsx, read-signposts.mjs | ui/SignpostList, assessment-view | P1-21 | research-ops.md:L365 |
| Assessment history: append-only supersedes chain | AssessmentHistoryLedger.tsx, read-signposts.mjs 120-144 | ui/AssessmentHistory, research-reads | P1-21 | research-ops.md:L366 |
| Research assessment model (corridors, horizon cascade, refusal, evidence, authority distribution, signposts) for the producer | assess.mjs | model/assess (imported by P1-15) | P1-21 | research-ops.md:L367 |
| Research admission candidate filter | surface-candidate.mjs | surface-of rule table | P1-21 | research-ops.md:L368 |
| Cluster synthesis card from the item's theme brief | research/[slug]/page.tsx 276, ThemeBriefCard (P1-18) | theme-view, detail shell | P1-21 | research-ops.md:L369 |
| Cross-page theme analysis, theme chips, derived chip label, brief text clean-up | theme-brief.mjs, theme-brief-text.mjs | core/themes/theme-view | P1-21 | research-ops.md:L370 |
| Operations list in urgency bands with Region, Dimension, Mode facets | OperationsLedger.tsx | ui/OperationsList | P1-21 | research-ops.md:L371 |
| Region by dimension matrix: seven dimensions, sticky column, horizontal scroll past five regions, fill-rate head, per-column coverage and linked-regulation counts, counting state while loading | RegionDimensionMatrix.tsx, OperationsLedger.tsx 204-252 | ui/RegionMatrix, OperationsList | P1-21 | research-ops.md:L372 |
| Default selection, arrow selection, Esc close, Home and End, constant-height panel | RegionDimensionMatrix.tsx 213-402 | ui/RegionMatrix | P1-21 | research-ops.md:L373 |
| Single-cell panel (three fact cards, more on the profile) and compare mode across regions with implied-base index | RegionDimensionMatrix.tsx 818-947 | ui/RegionMatrix | P1-21 | research-ops.md:L374 |
| Empty-region and coverage-table reconciliation disclosures | RegionDimensionMatrix.tsx 768-786, region-grid.mjs 155-183 | ui/RegionMatrix, region-grid | P1-21 | research-ops.md:L375 |
| Fully-loaded labour chain drill-down | LabourChain.tsx, labour-chain.ts | ui/LabourChain, model/labour-chain | P1-21 | research-ops.md:L376 |
| Industry statements with components and provenance | StatementsBlock.tsx, statements.mjs | ui/StatementsBlock, model/statements | P1-21 | research-ops.md:L377 |
| Coverage gaps rail: US sub-national tally and regions short of full coverage | OperationsLedger.tsx 465-560 | ui/OperationsList | P1-21 | research-ops.md:L378 |
| Open profile link per region from the matrix panel | OperationsLedger.tsx 449-463 | ui/OperationsList | P1-21 | research-ops.md:L379 |
| Per-fact freshness (current, ageing, stale, frozen) | supabase-server.ts 3485-3493 (computed, never shown) | operations-reads + RegionMatrix (shown; spec 04 section 3 item 2 "stale") | P1-21 | research-ops.md:L380 |
| Coverage row notes | supabase-server.ts 3427 (read, never shown) | operations-reads + RegionMatrix disclosure | P1-21 | research-ops.md:L381 |
| Operations profile: region-group chip, Summary, eight sections with the S3/S4 gate and omit notes, Sources, cross-page section, Related in region or by source | OperationsDetailSurface.tsx, operations-matrix.ts, operations/[slug]/page.tsx | ui/OperationsDetail, matrix-eligibility, operations-reads | P1-21 | research-ops.md:L382 |
| Auxiliary energy load section (kWh over typical hours, setpoints, carbon needs grid intensity) | AuxiliaryEnergyPanel*.tsx | ui/Spec09Panels | P1-21 | research-ops.md:L383 |
| Grid connection queue section (gate at 24 months, queue months, substation headroom) | GridQueuePanel*.tsx | ui/Spec09Panels | P1-21 | research-ops.md:L384 |
| Regional producers' parsing: Eurostat electricity prices, Eurostat labour cost levels, BLS OEWS wages, JSON-stat decoding | lib/regional/*-parser.mjs | features/operations/ingest (P1-15 imports) | P1-21 | research-ops.md:L385 |
| Envelope rows and idempotent upsert plans for regional and state cost facts | regional-facts-envelope.mjs, state-cost-facts-envelope.mjs | ingest/envelope | P1-21 | research-ops.md:L386 |
| Assistant Operations data block | operations-ask-context.mjs | ask-context (assistant route owner) | P1-21 | research-ops.md:L387 |
| Recalculation notices under both detail pages | research/[slug]/page.tsx 307-311, operations/[slug]/page.tsx 268-272 (NoticesRail) | detail shell owner | P1-21 | research-ops.md:L388 |
| Research pipeline fields `pipelineStage`, `whatItChanges`, `doesNotResolve`, per-row citation stats | supabase-server.ts 1544-1747 (dead reader) | NOT PORTED as code (no caller). The callout fields `what_it_changes` and `does_not_resolve` (migration 110) remain columns; if the research detail should show them, P1-19..21's detail lane reads them there. `pipeline_stage` stays unrendered by ruling (spec 03: no editorial queue). Recorded so nothing is lost | P1-21 | research-ops.md:L389 |
| Source fetch-status on the operations profile | operations/[slug]/page.tsx 148-156 | NOT PORTED (never rendered) | P1-21 | research-ops.md:L390 |
| Community layout with its own sidebar replacing the global nav | CommunityShell, CommunitySidebar | CommunityLayout, CommunitySidebar | P1-22 | community-a.md:L310 |
| Back to the platform link, account footer with settings link | CommunitySidebar 140-156, 330-381 | CommunitySidebar | P1-22 | community-a.md:L311 |
| Starred, private, public group lists with unread and mention pills | CommunitySidebar 236-282, 604-677 | CommunitySidebar | P1-22 | community-a.md:L312 |
| My topics list (read only) | CommunitySidebar 284-306 | CommunitySidebar (editable or removed, ruling owed: no write path exists) | P1-22 | community-a.md:L313 |
| Masthead with date | CommunityShell 124-130 | CommunityLayout (server date) | P1-22 | community-a.md:L314 |
| Scoped search (all, posts, groups, people), Cmd/Ctrl+K, 2-character minimum | CommunitySearchBar, CommunityShell 132-147, CommunitySearchResults | SearchBar, SearchResults | P1-22 | community-a.md:L315 |
| Region filter tabs with counts | CommunityRegionTabs | RegionTabs | P1-22 | community-a.md:L316 |
| Pending group invitations, accept and decline | CommunityShell 239-416 (unreachable today) | CommunityHome | P1-22 | community-a.md:L317 |
| Empty state and memberships preview with "jump back in" | CommunityShell 418-627 (unreachable today) | CommunityHome | P1-22 | community-a.md:L318 |
| Seven regional rooms with item counts, themes, activity | CommunityRooms 809-904 | RoomsIndex | P1-22 | community-a.md:L319 |
| Room thread index with reply counts and last activity | CommunityRooms 540-636, 930-960 | RoomsIndex | P1-22 | community-a.md:L320 |
| Start a discussion in a room, starter prompts | CommunityRooms 962-1034, 1189-1194 | RoomsIndex (with entity binding) | P1-22 | community-a.md:L321 |
| Join and leave a room | CommunityRooms 375-402, 1042-1062 | RoomsIndex | P1-22 | community-a.md:L322 |
| Reply inline, delete own discussion | CommunityRooms 328-373, 685-720 | ThreadDisclosure | P1-22 | community-a.md:L323 |
| Cite a live system item into a thread (system to Community) | CommunityRooms 404-432, 721-760 | ThreadDisclosure | P1-22 | community-a.md:L324 |
| Verifier sign-off: request, withdraw, decide queue, signed-off chip | CommunityRooms 443-523, 1198-1359 | SignoffRail | P1-22 | community-a.md:L325 |
| Who's here roster by home region | CommunityRooms 1077-1146 | RoomsIndex rail | P1-22 | community-a.md:L326 |
| Vertical groups list and creation | CommunityRooms 245-282, 1391-1682 | VerticalGroups | P1-22 | community-a.md:L327 |
| Not-yet-seeded rooms state | CommunityRooms 1697-1758 | VerticalGroups (customer words) | P1-22 | community-a.md:L328 |
| Links to browse and moderation from the rooms rail | CommunityRooms 1494-1517 | VerticalGroups | P1-22 | community-a.md:L329 |
| Browse groups grid, join a public group, toast | BrowseGroupsGrid, GroupCard | GroupGrid, GroupCard | P1-22 | community-a.md:L330 |
| Group page header: privacy, members, weekly posts, activity, role | GroupHeader | GroupHeader | P1-22 | community-a.md:L331 |
| Star and mute a group | GroupHeader 94-147 | GroupHeader | P1-22 | community-a.md:L332 |
| Members roster and leave group | GroupModals 159-452 | MembersDialog | P1-22 | community-a.md:L333 |
| Group settings: rename, describe, change privacy with a downgrade warning | GroupModals 454-683 | SettingsDialog | P1-22 | community-a.md:L334 |
| Invite members by name search, pending list, revoke | GroupModals 685-1032 | InviteDialog | P1-22 | community-a.md:L335 |
| Group feed with cursor paging | PostList | PostList | P1-22 | community-a.md:L336 |
| Post with title, body, entity binding, anonymity, sensitivity field | PostComposer | PostComposer | P1-22 | community-a.md:L337 |
| Antitrust refusal explained in place | PostComposer 128-136, 364-385 | PostComposer | P1-22 | community-a.md:L338 |
| Post card with identity, delete by author or group admin | Post | Post | P1-22 | community-a.md:L339 |
| Replies: view, write | Post 74-112, 387-503; ReplyComposer | Post, ReplyComposer | P1-22 | community-a.md:L340 |
| Report a post with reason and details | ReportPostMenu | ReportPostDialog | P1-22 | community-a.md:L341 |
| Moderation queue with status and reason filters | ModerationQueue | ModerationQueue | P1-22 | community-a.md:L342 |
| Dismiss, warn, remove, ban with notes and confirmation | ModerationActions | ModerationActions | P1-22 | community-a.md:L343 |
| Group members rail with roles | CouncilMembersRail | MembersRail | P1-22 | community-a.md:L344 |
| No direct messaging statement | NoDirectMessagingNotice | parts/NoDirectMessaging | P1-22 | community-a.md:L345 |
| Community identity declare: org type, role, sector, region, default anonymity | ProfileForm 85-305 | ProfileForm | P1-22 | community-a.md:L346 |
| Corporate-email verification | ProfileForm 307-344, api-client 213-225 | ProfileForm | P1-22 | community-a.md:L347 |
| LinkedIn verification (auth-db.md section 8 hand-off) | none in scope; old chain TRASH in P1-01 | ProfileForm second method | P1-22 | community-a.md:L348 |
| Author identity line, anonymous label, verified mark | AuthorIdentityChip, identity-format | parts/AuthorIdentity | P1-22 | community-a.md:L349 |
| Follow entities and see their threads across groups | EntityDiscoveryPanel, api-client 120-138 | EntityDiscovery | P1-22 | community-a.md:L350 |
| Entity picker | EntityPicker | EntityPicker | P1-22 | community-a.md:L351 |
| Peer-org directory aggregates | PeerOrgDirectoryTable | PeerOrgDirectory | P1-22 | community-a.md:L352 |
| Notifications bell, inbox, mark read, mark all read, older | NotificationsBell, NotificationsList | P1-18 shell | P1-22 | community-a.md:L353 |
| Mobile stacking of rows with a fixed aside | community.css | P1-17 responsive row | P1-22 | community-a.md:L354 |
| How publishing works (promote to public) | HowPublishingWorks | NOT PORTED: the feature was removed (ADR-041) | P1-22 | community-a.md:L355 |
| Regional rooms (7) with live verified ledger items, themes and threads per room | community/page.tsx, rooms.ts | RoomsPage, rooms-view | P1-23 | community-b.md:L382 |
| Join or leave a room, "you're here" hint by home jurisdiction | join, members DELETE, rooms.ts:113-140 | group-join, group-members | P1-23 | community-b.md:L383 |
| Presence roster of same-organisation members by home jurisdiction | community/page.tsx:384-434 | rooms-view | P1-23 | community-b.md:L384 |
| Member-created vertical groups, cross-regional | groups/route.ts, community/page.tsx:180-207 | groups.ts | P1-23 | community-b.md:L385 |
| Group settings: rename, description, public or private | settings | group-settings | P1-23 | community-b.md:L386 |
| Star and mute a group | star, mute | group-prefs (mute takes effect in dispatch) | P1-23 | community-b.md:L387 |
| Group roster with roles; leave with last-admin guard | members | group-members | P1-23 | community-b.md:L388 |
| Invite by name search; list, revoke, accept, decline invitations | invitations, invite-candidates, invite, invitations/[id]/* | group-invitations, invitation-respond | P1-23 | community-b.md:L389 |
| Public group directory by region with member and invite state | browse/page.tsx | BrowsePage | P1-23 | community-b.md:L390 |
| Threads bound to 1-10 spine entities; replies one level deep | posts, replies, entity-binding | posts, replies | P1-23 | community-b.md:L391 |
| Threads by entity across every group; follow entities | entities/[entityId]/threads, discover | entity-threads, DiscoverPage | P1-23 | community-b.md:L392 |
| Edit own post (API only, no UI today) | posts/[id] PATCH | post.ts; UI owed by P1-22 | P1-23 | community-b.md:L393 |
| Delete own post or moderate a post | posts/[id] DELETE | post.ts | P1-23 | community-b.md:L394 |
| Identity shown by default; per-post and per-user anonymity; verified marker kept | identity.mjs, posts routes | identity.ts | P1-23 | community-b.md:L395 |
| Member profile: org type, role, sector, region, default anonymity | profile route, ProfilePage | profile.ts | P1-23 | community-b.md:L396 |
| Corporate-email verification with a pseudonymous organisation key | profile/verify, organisation-key, organisation-salt | profile.ts, org-key.ts | P1-23 | community-b.md:L397 |
| LinkedIn verification (requirement only; code trashed by P1-01) | api/auth/linkedin/* | Community verification method, operator-scheduled | P1-23 | community-b.md:L398 |
| Antitrust refusal of commercially sensitive fields | antitrust.mjs, posts POST | antitrust.ts | P1-23 | community-b.md:L399 |
| Aggregated benchmark disclosure (k >= 5, 25 percent cap, 3-month lag) | antitrust.mjs aggregate branch; tables dropped by 349 | NOT PORTED as code: the instruments were removed (migration 349); the rule is kept as INV-237's wording so a future aggregate path inherits it | P1-23 | community-b.md:L400 |
| Verifier sign-off: request, decide, withdraw, citable stamp | posts/[id]/signoff, signoff/[id]/* | signoff.ts | P1-23 | community-b.md:L401 |
| Report a post with a reason and details | moderation/reports POST | moderation.ts | P1-23 | community-b.md:L402 |
| Moderation queue scoped by role; dismiss, remove, warn, mute (stub), ban | moderation/reports GET, [id] POST | moderation.ts (mute and ban real, with the schema items) | P1-23 | community-b.md:L403 |
| Notifications: list, unread count, mark one, mark all, per-group counts | notifications/* | notifications.ts | P1-23 | community-b.md:L404 |
| Notifications on reply, invite, moderation | dispatch.ts call sites | P1-07 dispatch | P1-23 | community-b.md:L405 |
| @mentions (kind allowed, never written) | counts route mention branch | NOT BUILT; recorded so it is not mistaken for a feature | P1-23 | community-b.md:L406 |
| Community search: posts, groups, people | search, search-merge | search.ts | P1-23 | community-b.md:L407 |
| Peer-org directory, counts only | directory/page.tsx | DirectoryPage on a SQL aggregate with the k floor | P1-23 | community-b.md:L408 |
| Owned topics in the sidebar (no writer) | shell-context topics read | dropped from the shell unless a writer is ruled (gap 4) | P1-23 | community-b.md:L409 |
| Shell context: memberships, invitations, region counts, footer identity, admin bit | shell-context.ts | shell-context.ts | P1-23 | community-b.md:L410 |
| Regulations and Operations list remainder after first paint | listings/rest | features/lists (list surfaces) | P1-23 | community-b.md:L411 |
| Keyset regulations cursor | listings/cursor | NOT PORTED (dead; the remainder walk replaced it) | P1-23 | community-b.md:L412 |
| Recalculation notices for the team watchlist | notices/* | features/notices | P1-23 | community-b.md:L413 |
| Seed-fallback integrity flag | seed-fallback-flag.ts | P1-07 error sink | P1-23 | community-b.md:L414 |
| Four band tiles with the regulations surface's own counts, each navigating to the banded list | DashboardBrief.tsx:166-186; page.tsx:26 | features/dashboard/ui/DashboardBrief | P1-24 | dash-search.md:L327 |
| Due next: the five items with the nearest future binding date corpus-wide, with the week label that says how far it reaches | brief-rows.ts:53-60, 187-196; supabase-server.ts:879-893 | features/dashboard/read, rows | P1-24 | dash-search.md:L328 |
| What changed: new and updated items of the last pass, labelled NEW or UPDATED with the field that changed, resolved to the shared row shape | brief-rows.ts:79-143; supabase-server.ts:2830-2843, 2918-2980 | features/dashboard/read, rows | P1-24 | dash-search.md:L329 |
| The detection-pass date from the rows themselves, "No detection pass on record" when none | brief-rows.ts:242-256 | features/dashboard/rows | P1-24 | dash-search.md:L330 |
| The 90-day build-mode window, 7 days with a cadence | recent-changes-window.mjs | features/dashboard/read | P1-24 | dash-search.md:L331 |
| Failed read and empty corpus as distinct card states with a real Retry | brief-rows.ts:209-214; DashboardBrief.tsx:116-128 | features/dashboard | P1-24 | dash-search.md:L332 |
| Card feet linking to the immediate band and the newest-first ordering | DashboardBrief.tsx:242-254, 335-347 | DashboardBrief | P1-24 | dash-search.md:L333 |
| Row overflow menu with the Watch toggle on both cards | DashboardBrief.tsx:222-239, 314-331 | ui-kit RowActionsMenu (P1-17) mounted by DashboardBrief | P1-24 | dash-search.md:L334 |
| Source tier and bias chips on the digest rows through the one enrichment | page.tsx:88 | features/dashboard/page | P1-24 | dash-search.md:L335 |
| Across the platform: verified counts per surface, linking to each surface | DashboardBrief.tsx:356-376; surface-coverage.ts:77-111 | features/dashboard/read, DashboardBrief | P1-24 | dash-search.md:L336 |
| Connected across pages: up to three cross-page themes | DashboardBrief.tsx:377-399; supabase-server.ts:4399-4423 | DashboardBrief (data from the research lane) | P1-24 | dash-search.md:L337 |
| Watchlist rail card: three watched rows, team badge, note, adder, relative time, honest empty state | DashboardWatchlist.tsx; DashboardRailCard.tsx | features/dashboard/ui/WatchlistRailCard | P1-24 | dash-search.md:L338 |
| Portfolios entry on the rail | DashboardBrief.tsx:411-417 | DashboardBrief | P1-24 | dash-search.md:L339 |
| Legend: impact meter, timeline, source tier scale | DashboardBrief.tsx:419-448 | ui-kit LegendRailCard | P1-24 | dash-search.md:L340 |
| Personalised masthead title, item and jurisdiction counts, workspace, verticals, command bar | DashboardMasthead.tsx; brief-title.ts | features/dashboard/ui/DashboardMasthead | P1-24 | dash-search.md:L341 |
| Loading skeletons for tiles, rows and stats | DashboardBrief.tsx:168, 362-367, 405 | DashboardBrief (ui-kit Skeleton) | P1-24 | dash-search.md:L342 |
| Workspace aggregates for the masthead (total items, jurisdictions) | supabase-server.ts:1441-1467 | features/dashboard/read | P1-24 | dash-search.md:L343 |
| The dashboard payload cached per org, refused when it is a fallback, shape-keyed | data.ts:158-182; supabase-server.ts:2590 | core/cache cachedRead | P1-24 | dash-search.md:L344 |
| Urgency vocabulary: four bands, priority to band, days to band | bands.ts | core/urgency/bands | P1-24 | dash-search.md:L345 |
| Impact meter per row (cost, compliance, client, operational) | scoring.ts:40-80 | core/urgency/scoring (anchored) | P1-24 | dash-search.md:L346 |
| Keyword jurisdiction detection for the map and settings | scoring.ts:6-37 | core/urgency/scoring (anchored) | P1-24 | dash-search.md:L347 |
| Sector-weighted urgency composite (1.0 direct, 0.9 mode, 0.6 pass-through, 0.3 adjacent, 0.1 none) | scoring.ts:104-175 | NOT PORTED as code (0 callers today); recorded for the operator's ruling (gap 4) | P1-24 | dash-search.md:L348 |
| Personal and team watchlist reads merged, newest first, personal wins a duplicate, titles by legacy id or uuid, tier, impact, deadline, adder names | supabase-server.ts:4720-4985 | features/watchlist/read | P1-24 | dash-search.md:L349 |
| Rail bound 14 and page bound 250 per scope, the cap stated on the page | supabase-server.ts:4521-4527; WatchlistSurface.tsx:280-286 | features/watchlist | P1-24 | dash-search.md:L350 |
| Watch and unwatch an item in either scope with a bounded team note; list and single membership reads | api/watchlist/route.ts | features/watchlist/api/route | P1-24 | dash-search.md:L351 |
| market_series watchable at team scope only, with a 400 naming the reason | logic.ts; watchlist-scope.ts; route.ts:245-247 | features/watchlist/api/route | P1-24 | dash-search.md:L352 |
| Viewer cannot write the team scope | route.ts:263-266, 325-328 | features/watchlist/api/route | P1-24 | dash-search.md:L353 |
| One membership fetch per item_type per page for every WatchButton | membership.ts:94-148 | features/watchlist/membership | P1-24 | dash-search.md:L354 |
| Watched rows link to their surface; source and series rows render unlinked | watchlist-links.ts | features/watchlist/links | P1-24 | dash-search.md:L355 |
| /watchlist: scope line, Watched card of ListRows sorted by next date, scope, type and tag facets in the rail, clear-filters state, "changed since" strip, recalculation notices card, share prose, legend | WatchlistSurface.tsx | features/watchlist/ui/WatchlistSurface | P1-24 | dash-search.md:L356 |
| Watch cache invalidated on every write so rail and page agree | route.ts:285, 301, 340, 355; data.ts:698-718 | features/watchlist (tag scoped to the org) | P1-24 | dash-search.md:L357 |
| Create, rename, delete a portfolio; case-insensitive duplicate returns the existing one; caps 100 and 500 | portfolio-core.mjs:142-195 | features/portfolio/core | P1-24 | dash-search.md:L358 |
| Add a held item or an entity (merge chain followed, retired refused), idempotent; remove a member | portfolio-core.mjs:214-337 | features/portfolio/core | P1-24 | dash-search.md:L359 |
| Roll-ups at read time: by surface, by band, next date, weakest origin class, held over total, not-held named | portfolio-core.mjs:348-386; read.ts:140-149 | features/portfolio/core, read | P1-24 | dash-search.md:L360 |
| Portfolio index with member counts (lower bound stated), create form, signed-out and unavailable states, viewer read-only | PortfolioIndexView.tsx; app/dashboard/portfolio/page.tsx | features/portfolio/ui, pages | P1-24 | dash-search.md:L361 |
| Portfolio detail: groups by surface on ListRow, entity rows, manage card with confirmed delete, remove from a row's menu, bulk remove of not-held members | PortfolioDetailView.tsx; [id]/page.tsx | features/portfolio/ui, pages | P1-24 | dash-search.md:L362 |
| Add by search with "In portfolio" state and a coverage line per result linking to the coverage cell | PortfolioAddSearch.tsx | features/portfolio/ui/PortfolioAddSearch | P1-24 | dash-search.md:L363 |
| Standard Search: ranked FTS over verified items, bounded, on the caller's client, from the command bar, the page and the admin picker | search/logic.ts, route.ts, page.tsx; SearchResultsView.tsx | features/search | P1-24 | dash-search.md:L364 |
| Search results page with the cap note and the legend | SearchResultsView.tsx | features/search/ui | P1-24 | dash-search.md:L365 |
| The Assistant panel opened from the command bar with the question, cited items with tier, citation count and recency, expandable provenance, flagged references, disclaimer | AskAssistant.tsx | features/assistant/ui (flagged references disappear with generated prose) | P1-24 | dash-search.md:L366 |
| Assistant retrieval: FTS hits with the citation-grade select, suppressed claims redacted, Operations facts, top sources, citation stats | api/ask/route.ts:171-304, 306-317, 346-432, 591-626 | features/assistant/api/route (retrieval only) | P1-24 | dash-search.md:L367 |
| The generated answer by a metered model, its prompt cache, the enablement gate | api/ask/route.ts:46-94, 481-529 | NOT PORTED (coordinator ruling: free retrieval); the behaviour "no spend during build" is kept by construction | P1-24 | dash-search.md:L368 |
| Coverage matrix as JSON, summary and CSV; request coverage writing one flag; the Coverage page | api/dashboard/coverage/*; app/dashboard/coverage/page.tsx | features/dashboard/api (until the coverage lane claims them) | P1-24 | dash-search.md:L369 |
| Cached public list, slug, map, settings, research-coverage and obligation-register getters | data.ts:287-669, 927-1148 | the list, map, settings and obligations lanes (P1-19..23, P1-02, P1-16) | P1-24 | dash-search.md:L370 |
| Curated coverage gaps widget read | supabase-server.ts:4996-5048; data.ts:802 | NOT PORTED (0 callers; the Coverage surface replaced it) | P1-24 | dash-search.md:L371 |
| Six admin sections with live tile counts, sub-nav counts, body routing | AdminDashboard.tsx 136-194, 348-426, 626-726 | AdminConsole | P1-25 | admin-a.md:L378 |
| Refresh re-runs the server reads | AdminDashboard.tsx 280-306, 963-997 | AdminConsole (through admin routes) | P1-25 | admin-a.md:L379 |
| Masthead with the operator view, agent runs, errors, month-to-date spend | AdminDashboard.tsx 507-523 | AdminConsole: harness run count and open attention total; spend NOT PORTED | P1-25 | admin-a.md:L380 |
| Toast | AdminDashboard.tsx 308-311, 599-621 | panel-kit Toast | P1-25 | admin-a.md:L381 |
| Staged updates visibility with provenance failures grouped into five modes | AdminDashboard.tsx 728-806; ProvenanceFailures.tsx | StagedTransitView | P1-25 | admin-a.md:L382 |
| Regulatory scan by topic and jurisdiction | AdminDashboard.tsx 323-346, 808-883 | NOT PORTED as code; DispatchPanel dispatches the free sweep and walker with a topic filter (P1-12/13) | P1-25 | admin-a.md:L383 |
| Organisations table with member count, roles, last join | OrganizationsTable.tsx | WorkspacesOverview | P1-25 | admin-a.md:L384 |
| Companies, individuals, newest join, active this month | WorkspacesUsageRow.tsx 86-176 | WorkspacesOverview | P1-25 | admin-a.md:L385 |
| Members: add by email, role, remove, org-scoped ban with typed confirmation, last-owner guard | redesign/MembersPanel.tsx | P1-02's MembersPanel; the dialog in P1-17's Dialog | P1-25 | admin-a.md:L386 |
| Invitations: create with copyable link and honest delivery state | InvitationsPanel.tsx 79-102, 157-258 | P1-02's MembersPanel (exists there) | P1-25 | admin-a.md:L387 |
| Invitations: pending and recent list with revoke | InvitationsPanel.tsx 61-77, 104-115, 260-323 | P1-02's MembersPanel (moved) | P1-25 | admin-a.md:L388 |
| Issues rail: eight counts, total is the sum, navigation to the queue | redesign/AdminIssuesRail.tsx | IssuesRail | P1-25 | admin-a.md:L389 |
| Filter caption with Clear after a rail tap-through | IssueFilterCaption.tsx | IssueFilterCaption | P1-25 | admin-a.md:L390 |
| Shared admin primitives (header, banners, toast, stat cards, empty states, th and td, panel frame) | AdminTableView.tsx | panel-kit | P1-25 | admin-a.md:L391 |
| Bulk source import: CSV upload or JSON paste, templates, default jurisdiction, dry-run preview with HEAD status, duplicates, errors and proposed action, commit with counters | BulkImportView.tsx | BulkImportView | P1-25 | admin-a.md:L392 |
| Bulk import verification toggle (Browserless plus Haiku) | BulkImportView.tsx 94, 393-402 | NOT PORTED; direct HEAD and the deterministic classifiers (P1-05, P1-04) | P1-25 | admin-a.md:L393 |
| Tier disagreements: accept the modal analyst tier (override plus dismiss), reject (dismiss), with a reason | TierOpinionDisagreementsView.tsx | TierDisagreementsView | P1-25 | admin-a.md:L394 |
| Tier disagreements: defer | TierOpinionDisagreementsView.tsx 183-189 | NOT PORTED (writes nothing) | P1-25 | admin-a.md:L395 |
| Spot-check sub-tab and count | AdminDashboard.tsx 171, 247, 350, 369 | AdminConsole (observe; the count from the attention RPC) | P1-25 | admin-a.md:L396 |
| Upcoming obligations with kind and precision filters and precision-honest dates | UpcomingObligationsPanel.tsx | UpcomingObligationsPanel | P1-25 | admin-a.md:L397 |
| Merged flags and rejections queue with chip counts | redesign/FlagsRejectionsQueue.tsx | FlagsQueue | P1-25 | admin-a.md:L398 |
| Brief integrity flags: stats, list, view brief, mark resolved, replace URL | IntegrityFlagsView.tsx | BriefFlagsView | P1-25 | admin-a.md:L399 |
| Brief integrity flags: regenerate | IntegrityFlagsView.tsx 108-139, 312-320 | NOT PORTED; re-capture and free re-ground (P1-07, P1-03) | P1-25 | admin-a.md:L400 |
| Platform integrity flags: category and status filters, counts, expand, recommended actions, in review, resolve, archive with a note | PlatformIntegrityFlagsView.tsx | PlatformFlagsView | P1-25 | admin-a.md:L401 |
| Ingest rejections: untriaged list, reclassify, retry, archive, note | IngestRejectionsView.tsx | IngestRejectionsLog | P1-25 | admin-a.md:L402 |
| Corpus-turn queue: open count, last consumed, request one, backfill all | CorpusTurnPanel.tsx 72-127, 166-255 | DispatchPanel | P1-25 | admin-a.md:L403 |
| Run one intake cycle, plan or apply | CorpusTurnPanel.tsx 130-158, 258-356 | DispatchPanel (apply is record-only) | P1-25 | admin-a.md:L404 |
| Statutory rows upload: dry run, per-row outcomes, apply gated on the same text | StatutoryRowsUpload.tsx | StatutoryRowsUpload | P1-25 | admin-a.md:L405 |
| Per-item corrections: hide or replace a fact, add or remove a tag, add or remove a connection, replace a section, replace the brief, with reasons; history; revoke | corrections/ItemCorrectionsPanel.tsx, CorrectionForm.tsx, CorrectionRow.tsx, model.mjs, load-item-targets.mjs, types.ts, styles.ts | features/admin/corrections | P1-25 | admin-a.md:L406 |
| All-corrections tab with state and kind filters, item search, paging, orphan count | corrections/CorrectionsTab.tsx, load-all.mjs | CorrectionsTab over the all-corrections route | P1-25 | admin-a.md:L407 |
| Item search picker over the command bar's search | corrections/ItemSearchPicker.tsx | ItemSearchPicker | P1-25 | admin-a.md:L408 |
| The screen gate: the platform-admin check runs before any read | corrections/model.mjs 193-196 | model.ts `loadItemScreen` | P1-25 | admin-a.md:L409 |
| Jurisdiction review: confirm, manually classify with sibling-token picks, dismiss | PendingJurisdictionReviewView.tsx | JurisdictionReviewView | P1-25 | admin-a.md:L410 |
| Coverage matrix with tier filter, group by country, legend, bulk-add action | CoverageMatrixView.tsx | CoverageMatrixView | P1-25 | admin-a.md:L411 |
| Coverage catalogue with surface, jurisdiction, type, relevance, identity filters and sort | CoverageCatalogueView.tsx | CoverageCatalogueView | P1-25 | admin-a.md:L412 |
| Research pipeline drafts with machine status and view as customer | ResearchPipelineQueueView.tsx | ResearchPipelineView | P1-25 | admin-a.md:L413 |
| Runtime error groups | ErrorGroupsView.tsx | RuntimeViews | P1-25 | admin-a.md:L414 |
| Assumption register grouped by subsystem with "no ruling on record" | AssumptionRegisterPanel.tsx | RuntimeViews | P1-25 | admin-a.md:L415 |
| Inference records with status token, confidence, citations | InferenceReview.tsx | RuntimeViews | P1-25 | admin-a.md:L416 |
| Parts sign-off pages: every part in every state, from fixtures | FactCardGallery.tsx, SectionIndexGallery.tsx, PartsList.tsx, PartsPageHeading.tsx | NOT PORTED as product routes; P1-17 proves parts with the rendering guard's fixture smoke and may keep a fixture viewer outside src/app | P1-25 | admin-a.md:L417 |
| Windowed row list with element or window scroll parent and an end-reached signal | ledger/VirtualizedRowList.tsx | P1-17 VirtualizedRowList | P1-25 | admin-a.md:L418 |
| Account and settings form primitives | account/AccountPrimitives.tsx | P1-17 form primitives; AccountCard into SectionCard | P1-25 | admin-a.md:L419 |
| Attention counts for the red dot and the issues rail, cached once for the route and the bootstrap | attention/logic.ts, attention/route.ts | api/attention | P1-26 | admin-b.md:L446 |
| Regeneration progress against the current contract version, by format and priority, tag coverage, last ten | b2-progress/route.ts | api/progress (one rpc) | P1-26 | admin-b.md:L447 |
| The canonical-source review queue grouped by item with severity and confidence order, registry hits and stats | canonical-sources/pending | api/candidates-pending | P1-26 | admin-b.md:L448 |
| Approve, reject or defer one canonical candidate with edited URL, title or publisher | canonical-sources/decide | api/source-decisions | P1-26 | admin-b.md:L449 |
| Batch approve canonical candidates with ambiguous hosts and gated hosts routed to individual review | canonical-sources/bulk-approve | api/source-decisions (bulk) | P1-26 | admin-b.md:L450 |
| A classification (tier, domains, jurisdictions, modes, topics, bias tags) for a candidate or a provisional source, cached | bulk-classify, the two recommend-classification routes | NOT PORTED as model calls; the deterministic classifier computes the same fields at read time (P1-05) | P1-26 | admin-b.md:L451 |
| A tier recommendation for the tier audit panel | sources/recommend-tier | NOT PORTED as a model call; the panel shows classTierForHost beside base_tier | P1-26 | admin-b.md:L452 |
| Approve, reject or defer a provisional source with the shared row builder, audit and bias tags | sources/promote | api/source-decisions | P1-26 | admin-b.md:L453 |
| CSV or JSON bulk import with validation, dedup, reachability, a dry-run preview, apply and an audit row | sources/bulk-import | api/bulk-import (free reachability and tier) | P1-26 | admin-b.md:L454 |
| Pause and unpause one source; hide and show one source to customers | sources/[id]/pause, visibility | api/source-controls | P1-26 | admin-b.md:L455 |
| Set or revert a tier override with a mandatory reason and an audit trail; read the last 20 override events | sources/[id]/tier-override | api/source-controls | P1-26 | admin-b.md:L456 |
| Commit an operator base_tier on a seeded source, refused under an override | sources/commit-tier-change | api/source-controls (with an audit row) | P1-26 | admin-b.md:L457 |
| Confirm or reject a machine-adopted bias tag | sources/[id]/bias-tags | api/source-controls (UI mount owed to P1-25) | P1-26 | admin-b.md:L458 |
| Fetch one source now through its API endpoint or a page fetch, stamp reachability honestly, preview the content | sources/[id]/fetch-now | api/source-controls (free fetch) | P1-26 | admin-b.md:L459 |
| Tier-opinion disagreements with the modal analyst tier; dismiss a source's opinions | sources/tier-opinions | api/tier-opinions | P1-26 | admin-b.md:L460 |
| The global hold: pause, cadence, start date, judgement drain, next scrape date | sources/pause-global | api/pause-global | P1-26 | admin-b.md:L461 |
| Per-brief integrity flags: list, resolve with replace_url or mark_resolved | integrity-flags (per-brief), [id]/resolve | api/integrity-flags | P1-26 | admin-b.md:L462 |
| Platform integrity flags: list by category and status with counts, set status with a resolution note | integrity-flags (?platform=1), PATCH | api/integrity-flags (seven categories) | P1-26 | admin-b.md:L463 |
| Request a brief regeneration for a flagged item or for every item of a source, outcome visible later | integrity-flags/[id]/regenerate, sources/[id]/regenerate-brief | api/corpus-turns (a queue row; the runtime re-grounds for free and records the run) | P1-26 | admin-b.md:L464 |
| The turn queue: see open requests and the last consumption; request a turn for one item or every live item | corpus-turn-requests | api/corpus-turns | P1-26 | admin-b.md:L465 |
| Run one intake cycle over up to five candidates, plan by default, apply on request, with the disposition trail | run-intake | api/run-intake (apply on the free record-only path) | P1-26 | admin-b.md:L466 |
| Discover new regulations and portals for a topic and jurisdiction, staged for the machine gates | scan | NOT PORTED as a model search; the button dispatches a source sweep and sitemap walk turn (P1-13) and the portal harvest (P1-04) | P1-26 | admin-b.md:L467 |
| Monthly calibration spot-check of the H-tier classifier with a false-positive rate | spot-check/recurring | NOT PORTED: the classifier it calibrated is replaced by a deterministic one; reachability stamping lives in the source sweep (INV-199) | P1-26 | admin-b.md:L468 |
| Trust score and tier movement recompute | recompute-trust | the maintenance step (P1-05); the route is not ported | P1-26 | admin-b.md:L469 |
| Statutory rows-file preview and write | statutory-rows | api/statutory-rows | P1-26 | admin-b.md:L470 |
| Ingest-rejection triage: list with a capped flag, discard, reclassify or escalate with notes | triage/ingest-rejections | api/triage | P1-26 | admin-b.md:L471 |
| Pending jurisdiction review: confirm, manually classify or dismiss, with the item's column edited | triage/pending-jurisdiction-review | api/triage (one rpc) | P1-26 | admin-b.md:L472 |
| Coverage matrix with cell states, tier and country filters, tier-listed gaps synthesised | coverage | api/coverage | P1-26 | admin-b.md:L473 |
| Upcoming forward events with kind and precision filters, archived items dropped | forward-events | api/forward-events | P1-26 | admin-b.md:L474 |
| Themes by convergence with their briefs and staleness, and the last run | themes | api/themes | P1-26 | admin-b.md:L475 |
| Intersections as ranked canonical pairs with stats | intersections | api/intersections | P1-26 | admin-b.md:L476 |
| List, create and revoke a correction on one item | items/[id]/corrections, revoke | api/corrections (over the handlers, owner owed) | P1-26 | admin-b.md:L477 |
| The platform member list with names and emails for the admin | users GET | api/users (bounded) | P1-26 | admin-b.md:L478 |
| Create a user by password and attach a membership | users POST | NOT PORTED: no caller; the invitation flow (auth-db) is the sanctioned path | P1-26 | admin-b.md:L479 |
| The admin dashboard page: sources, provisional sources, orgs, members, staged updates, MTD spend, error groups, assumption register, three counts | app/admin/page.tsx, supabase-server.ts 264-575 | ui/AdminPage over read/dashboard and read/sources | P1-26 | admin-b.md:L480 |
| Emission factors table with licence badges and honest empty and error states | factors/page.tsx | ui/FactorsPage | P1-26 | admin-b.md:L481 |
| Current inference records with citation titles | inferences/page.tsx | ui/InferencesPage (with a nav row) | P1-26 | admin-b.md:L482 |
| The single-pane corrections screen for one item | items/[id]/page.tsx | ui/ItemCorrectionsPage | P1-26 | admin-b.md:L483 |
| The parts index and twelve sign-off galleries over frozen real fixtures | parts/*, lib/admin/parts-registry.ts | src/ui/gallery (P1-17) | P1-26 | admin-b.md:L484 |
| Member display name chain | lib/admin/member-display-name.ts | P1-18 shell | P1-26 | admin-b.md:L485 |
| The review-queue population named once | lib/admin/provisional-review-queue.ts | P1-05 review-queue | P1-26 | admin-b.md:L486 |
| An in-memory Supabase fake for tests | test-support/fake-supabase.mjs | NOT PORTED: 0 importers; the test tree brings its own | P1-26 | admin-b.md:L487 |

### B.1 Lost-feature candidates (13 of 179 cross-lane feature claims checked)

Method (mechanical): for each feature row whose new home names another lane (the extraction's K rows), the feature's content words (over three letters, stopwords dropped) are compared with every feature row of the named lane's register (best overlap share) and with that register's whole text (share of words present anywhere). A candidate is a claim where, for EVERY lane the home names (a range such as P1-12..15 names each lane in it), best feature-row overlap is under 0.50 AND whole-register word presence is under 0.60. A candidate is a name-match miss to check by hand, not a proven lost feature. P1-11 schema has no register, so claims on P1-11 are not checked and are listed in B.2.

| feature | new home as written | named by | claimed lane | feature-row overlap | register word presence | cite |
|---|---|---|---|---|---|---|
| Fresh-fetch synthesis: primary fetch through transport ladder, corroborator discovery, Sonnet synthesis | NOT PORTED as a model call; the fetch primitive is P1-07's; the author reads the pool | P1-03 | P1-07 | 0.10 | 0.40 | intake-a.md:L414 |
| Spend chokepoint, ticket, ... gauge | NOT PORTED: no spend. The agent_runs history stays; P1-25 decides whether the health tile shows it | P1-03 | P1-25 | 0.25 | 0.50 | intake-a.md:L445 |
| Zero-proposal re-derivation from the class table | classify-sources | P1-04 | P1-05 | 0.40 | 0.40 | intake-b.md:L380 |
| Deferral validity and renewal rule | P1-12..15 | P1-08 | P1-12, P1-13, P1-14, P1-15 | 0.00, 0.25, 0.25, 0.25 | 0.25, 0.50, 0.25, 0.25 | harness.md:L435 |
| Cellar URLs and robot gate | P1-03/04 | P1-08 | P1-03, P1-04 | 0.25, 0.25 | 0.50, 0.50 | harness.md:L439 |
| Historical spine backfill, including organisations by host | ops/backfill-entities | P1-10 | P1-08 | 0.17 | 0.33 | flywheel-b.md:L345 |
| Corridor seeds with display names and jurisdiction scope | ops/seed-corridors | P1-10 | P1-08 | 0.00 | 0.33 | flywheel-b.md:L346 |
| One-time historical DAG bridge | ops/backfill-derivation-edges | P1-10 | P1-08 | 0.33 | 0.33 | flywheel-b.md:L359 |
| Free capture: Cellar, EUR-Lex, UK data.htm, FR API, OJ issues, Wayback, PDF | P1-07 | P1-14 | P1-07 | 0.17 | 0.50 | mint.md:L310 |
| Payload penalty from pack density; TCO crossover refusal | features/market/calc (panel wiring owed, gap 5) | P1-15 | P1-19, P1-20 | 0.17, 0.17 | 0.50, 0.50 | producers.md:L444 |
| Workspace priority retag and dismiss, restore stash | RegulationsLedger, DismissedStash, P1-17 RowOverflowMenu | P1-19 | P1-17 | 0.17 | 0.50 | regulations.md:L446 |
| Recalculation notices rail | page (NoticesRail owner) | P1-19 | P1-18 | 0.33 | 0.33 | regulations.md:L469 |
| Regulatory scan by topic and jurisdiction | NOT PORTED as code; DispatchPanel dispatches the free sweep and walker with a topic filter (P1-12/13) | P1-25 | P1-12, P1-13 | 0.00, 0.00 | 0.25, 0.50 | admin-a.md:L383 |

### B.2 Cross-lane feature claims on P1-11 schema (no register on master) or on no lane id (28)

| feature | new home as written | named by | cite |
|---|---|---|---|
| Lossless PK-ordered pagination | core/db with P1-11 keys | P1-08 | harness.md:L427 |
| Migration compare, applied map, diff, applied inventory | P1-11 | P1-08 | harness.md:L454 |
| Migrations inventory page | P1-11 | P1-08 | harness.md:L455 |
| Migration-299 guard | NOT PORTED (P1-11 ruling 3) | P1-14 | mint.md:L328 |
| The five surfaces' server reads | surface read modules (ids owed) | P1-01 | auth-db.md:L362 |
| Portfolios: list, create, detail, rename, delete, members | api/portfolios (logic owner owed) | P1-02 | workspace.md:L371 |
| Structured regulation sections for the detail surface | core/brief/regulation-sections (surface id owed) | P1-03 | intake-a.md:L436 |
| Operations S3/S4 eligibility with honest omit notes | Operations surface read module (id owed) | P1-03 | intake-a.md:L440 |
| Operations data block for the assistant | assistant route owner (id owed) | P1-03 | intake-a.md:L441 |
| Assistant skill subset | NOT PORTED here; the assistant route's owner decides | P1-03 | intake-a.md:L444 |
| Admiralty, pedigree band, likelihood ladder, impact x applicability, typed relations | core/contracts/vocabularies, ported with their first reader | P1-04 | intake-b.md:L372 |
| Priority jurisdiction regions | coverage module (id owed) | P1-05 | sources-a.md:L461 |
| Portfolio-add coverage line | core/coverage/matrix + client (consumer is portfolio) | P1-06 | sources-b.md:L325 |
| Bundle measurement | tools | P1-08 | harness.md:L456 |
| d3 heartbeat ledger | NOT PORTED: src/lib/d3/hooks.mjs should call recordRun (owner outside this module) | P1-08 | harness.md:L462 |
| Free theme-brief seam | features/flywheel/theme-brief-seam.ts plus the theme-briefs export and apply (scripts/turns) | P1-09 | flywheel-a.md:L328 |
| Verified-only resource lookup | core/flywheel/view-model.ts (lookup); identity helper elsewhere | P1-09 | flywheel-a.md:L332 |
| The six coverage states with request, widen, retry and status actions | src/ui/CoverageState plus the coverage feature's request hook | P1-17 | ui-kit.md:L389 |
| Legacy alias names for pages not yet migrated | NOT PORTED as aliases; each call site moves to the canonical name in its own lane | P1-17 | ui-kit.md:L369 |
| Legacy card, badge, typography ... ops grids | NOT PORTED; page classes their owning lanes replace with SectionCard, TagChip and StatBlock | P1-17 | ui-kit.md:L377 |
| Virtualized rows past 30 | ListSurface (VirtualizedRowList via the coordinator's gap 2) | P1-18 | shell-list.md:L398 |
| Detail carbon intensity block | lib/carbon (rendered by the detail body) | P1-20 | market.md:L354 |
| Research admission candidate filter | surface-of rule table | P1-21 | research-ops.md:L368 |
| Assistant Operations data block | ask-context (assistant route owner) | P1-21 | research-ops.md:L387 |
| Regulations and Operations list remainder after first paint | features/lists (list surfaces) | P1-23 | community-b.md:L411 |
| Connected across pages: up to three cross-page themes | DashboardBrief (data from the research lane) | P1-24 | dash-search.md:L337 |
| Coverage matrix as JSON, summary and CSV; request coverage; Coverage page | features/dashboard/api (until the coverage lane claims them) | P1-24 | dash-search.md:L369 |
| List, create and revoke a correction on one item | api/corrections (over the handlers, owner owed) | P1-26 | admin-b.md:L477 |
## C. DATA MODEL

Source: the data-model part of each register's section 8 and its section 2 dependency list, extracted row by row (each register read whole by an extraction pass), then grouped here by object name (backticks and `public.` stripped, first identifier, lower-cased). Readers and writers are the lanes whose register states that access. A lane that lists an object "for its owner" (inventoried, not used by its own code) is shown as "reports, for <lane>". Unused columns are quoted as each register names them. "Shape owner" is any lane a register names as owning the object's shape (P1-11 schema owns every migration per the Part 1 brief; its register is not on master, see header).


### C.1 Tables (123)

| object | readers by lane | writers by lane | other access stated | unused columns named | shape owner named |
|---|---|---|---|---|---|
| admin_action_cooldowns | P1-26 (admin-b.md:L381) | P1-26 (admin-b.md:L381) | - | P1-26: unused after the port unless run-intake keeps a cooldown (admin-b.md:L381) | - |
| agent_run_searches | P1-03 (intake-a.md:L341); P1-04 (intake-b.md:L242); P1-05 (sources-a.md:L333); P1-07 (capture.md:L190); P1-08 (harness.md:L113); P1-09 (flywheel-a.md:L260); P1-10 (flywheel-b.md:L282); P1-12 reports, for P1-07 (pool rows) (runtimes-a.md:L89); P1-14 (mint.md:L225); P1-16 (obligations.md:L217) | P1-04 (intake-b.md:L242); P1-07 (capture.md:L190); P1-12 reports, for P1-07 (pool rows) (runtimes-a.md:L89); P1-14 (mint.md:L225); P1-26 (admin-b.md:L320) | - | - | P1-07 (writer) per P1-03 (intake-a.md:L341); P1-07 (pool writer) per P1-05 (sources-a.md:L333); P1-04 per P1-26 (admin-b.md:L320) |
| agent_runs | P1-03 (intake-a.md:L351); P1-04 (intake-b.md:L242); P1-06 (sources-b.md:L245); P1-25 (admin-a.md:L319); P1-26 (admin-b.md:L387) | P1-03 (intake-a.md:L351); P1-05 (sources-a.md:L333); P1-07 (capture.md:L189) | - | P1-07: cost_usd_estimated, fetch_text_bytes, fetch_render_ms, raw_fetch_id, intelligence_item_version_id (capture.md:L189) | - |
| assumption_register | P1-25 (admin-a.md:L319); P1-26 (admin-b.md:L387) | - | - | - | - |
| auth | - | P1-26 (admin-b.md:L330) | - | - | - |
| auxiliary_energy_profiles | P1-15 (producers.md:L343); P1-21 (research-ops.md:L297) | P1-15 (producers.md:L343) | - | - | written by P1-15 (spec-09 producers) per P1-21 (research-ops.md:L297) |
| brief_apply_runs | P1-12 (runtimes-a.md:L289) | P1-12 (runtimes-a.md:L289) | P1-08 none (harness.md:L356) | P1-08: collapses into the one ledger [HYPOTHESIS] (harness.md:L356) | ruling owed by P1-11 and P1-03/04 per P1-08 (harness.md:L356) |
| bulk_imports | - | P1-26 (admin-b.md:L386) | - | - | - |
| canonical_source_candidates | P1-08 (harness.md:L113); P1-26 (admin-b.md:L373) | P1-08 (harness.md:L113); P1-26 (admin-b.md:L373) | P1-06 none (through P1-05 routes) (sources-b.md:L248) | P1-26: recommended_classification (unused after the port) (admin-b.md:L373) | - |
| census_worklist | P1-04 (intake-b.md:L80); P1-06 (sources-b.md:L241); P1-12 (runtimes-a.md:L89); P1-14 (mint.md:L222) | P1-09 reports, for intake (P1-03/P1-04) (flywheel-a.md:L258); P1-12 (runtimes-a.md:L89); P1-14 (mint.md:L222) | - | P1-06: identity_http_status, title_source (selected, never read); relevance band parsed from free-text `notes` (sources-b.md:L241); P1-14: lane, shape_class, enumeration_status (selected and unused, export-census-rows.mjs:1418) (mint.md:L222) | P1-07 (census, identity probe fills identity_*) per P1-06 (sources-b.md:L241) |
| claim_versions | P1-03 (intake-a.md:L343) | P1-03 (intake-a.md:L343); P1-12 (runtimes-a.md:L89) | - | - | - |
| community_group_bans | - | - | P1-23 none (owed) (community-b.md:L299) | - | P1-11 per P1-23 (community-b.md:L299) |
| community_group_invitations | P1-23 (community-b.md:L288) | P1-23 (community-b.md:L288) | - | - | - |
| community_group_members | P1-22 (community-a.md:L239); P1-23 (community-b.md:L287) | P1-22 (community-a.md:L239); P1-23 (community-b.md:L287) | - | P1-23: (muted written and never read by any writer of notifications) (community-b.md:L287) | P1-23 (routes) per P1-22 (community-a.md:L239) |
| community_groups | P1-22 (community-a.md:L238); P1-23 (community-b.md:L286) | P1-22 (community-a.md:L238); P1-23 (community-b.md:L286) | - | P1-23: none found [HYPOTHESIS: full column list of 028 not diffed] (community-b.md:L286) | P1-23 (routes) per P1-22 (community-a.md:L238) |
| community_invitations | P1-22 (community-a.md:L243) | P1-22 (community-a.md:L243) | - | - | P1-23 (routes) per P1-22 (community-a.md:L243) |
| community_member_profiles | P1-22 (community-a.md:L242); P1-23 (community-b.md:L291) | P1-22 (community-a.md:L242); P1-23 (community-b.md:L291) | - | P1-23: organisation_key (written and never read) (community-b.md:L291) | P1-23 (routes) per P1-22 (community-a.md:L242) |
| community_post_signoff_requests | P1-22 (community-a.md:L241); P1-23 (community-b.md:L292) | P1-22 (community-a.md:L241); P1-23 (community-b.md:L292) | - | - | P1-23 (routes) per P1-22 (community-a.md:L241) |
| community_posts | P1-06 (sources-b.md:L246); P1-22 (community-a.md:L240); P1-23 (community-b.md:L289) | P1-22 (community-a.md:L240); P1-23 (community-b.md:L289) | - | P1-22: attribution, promoted_from_post_id (carried in the type and unused) (community-a.md:L240); P1-23: attribution, promoted_from_post_id (selected and returned, never written; promotion-era columns) (community-b.md:L289) | P1-23 (routes) per P1-22 (community-a.md:L240) |
| community_reports | P1-22 (community-a.md:L244) | P1-22 (community-a.md:L244) | - | - | P1-23 (routes) per P1-22 (community-a.md:L244) |
| community_thread_entities | P1-23 (community-b.md:L290) | P1-23 (community-b.md:L290) | - | - | - |
| community_topic_groups | P1-23 (community-b.md:L296) | - | - | P1-23: no writer (community-b.md:L296) | - |
| community_topics | P1-22 (community-a.md:L246); P1-23 (community-b.md:L296) | P1-22 (community-a.md:L246) | - | P1-23: no writer (community-b.md:L296) | P1-23 (lib/community) per P1-22 (community-a.md:L246) |
| connection_theme_runs | P1-01 reports, for surface read modules (ids owed) (auth-db.md:L273); P1-09 (flywheel-a.md:L252); P1-13 (runtimes-b.md:L230); P1-18 (shell-list.md:L300); P1-19 (regulations.md:L378); P1-26 (admin-b.md:L387) | P1-09 (flywheel-a.md:L252) | P1-06 none (through P1-05 routes) (sources-b.md:L248) | - | - |
| connection_themes | P1-01 reports, for surface read modules (ids owed) (auth-db.md:L273); P1-03 (intake-a.md:L353); P1-09 (flywheel-a.md:L251); P1-12 (runtimes-a.md:L89); P1-13 (runtimes-b.md:L230); P1-18 (shell-list.md:L300); P1-19 (regulations.md:L378); P1-24 reports, for the research lane (dash-search.md:L266); P1-26 (admin-b.md:L387) | P1-09 (flywheel-a.md:L251) | P1-06 none (through P1-05 routes) (sources-b.md:L248) | P1-13: density (unused) (runtimes-b.md:L230) | - |
| corpus_census | P1-04 (intake-b.md:L242) | P1-04 (intake-b.md:L242) | - | - | - |
| corpus_turn_requests | P1-12 (runtimes-a.md:L285); P1-25 (admin-a.md:L316); P1-26 (admin-b.md:L380) | P1-12 (runtimes-a.md:L285); P1-25 (admin-a.md:L316); P1-26 (admin-b.md:L380) | - | - | - |
| coverage | - | - | P1-17 none directly (ui-kit.md:L314) | - | - |
| coverage_gaps | P1-01 reports, for surface read modules (ids owed) (auth-db.md:L273); P1-24 (dash-search.md:L268) | - | - | - | the DB lane decides the table per P1-24 (dash-search.md:L268) |
| d3_runs | - | P1-07 (capture.md:L197) | P1-08 none (created by no migration) (harness.md:L170) | - | owned outside this module (src/lib/d3/hooks.mjs) per P1-08 (harness.md:L170) |
| data_sources | P1-15 (producers.md:L348); P1-20 (market.md:L249); P1-26 (admin-b.md:L387) | - | - | - | P1-05 (source rating) per P1-20 (market.md:L249) |
| derivation | - | - | P1-13 through imports (runtimes-b.md:L232) | - | - |
| derivation_edges | P1-10 (flywheel-b.md:L275) | P1-10 (flywheel-b.md:L275); P1-15 (producers.md:L121) | P1-09 none (not authored today) (flywheel-a.md:L263) | P1-10: edge_kind (flywheel-b.md:L275) | - |
| derived_values | P1-10 (flywheel-b.md:L274) | P1-10 (flywheel-b.md:L274) | P1-09 none (flywheel-a.md:L263) | P1-10: invalidated_at; derivation, origin_class, lifecycle, base_confidence, asserted_at, half_life_days, computed_by written but read only through the unread view (flywheel-b.md:L274) | - |
| disposition_ledger | - | P1-04 (intake-b.md:L242) | - | - | - |
| emission_factors | P1-08 (harness.md:L113); P1-10 (flywheel-b.md:L287); P1-20 (market.md:L281); P1-25 reports, for P1-26 (P1-26's page) (admin-a.md:L319); P1-26 (admin-b.md:L387) | P1-08 (harness.md:L113) | - | P1-20: scope_kind selected and read by nothing in scope [HYPOTHESIS: MarketSignalDetailSurface not read] (market.md:L281) | - |
| entities | P1-10 (flywheel-b.md:L277); P1-15 (producers.md:L345); P1-20 (market.md:L283); P1-22 (community-a.md:L247); P1-23 (community-b.md:L298); P1-24 (dash-search.md:L267) | P1-10 (flywheel-b.md:L277); P1-15 (producers.md:L345); P1-20 (market.md:L283) | P1-09 none (flywheel-a.md:L263) | P1-10: created_at; merged_into, entity_level read only by dead resolve.mjs (flywheel-b.md:L277) | P1-23 (pages) per P1-22 (community-a.md:L247) |
| entity_aliases | P1-10 (flywheel-b.md:L281) | P1-10 (flywheel-b.md:L281) | - | - | - |
| entity_identifiers | P1-10 (flywheel-b.md:L278) | P1-10 (flywheel-b.md:L278); P1-15 (producers.md:L348) | - | P1-10: scheme_version (always null) (flywheel-b.md:L278) | - |
| entity_refs | P1-10 (flywheel-b.md:L279); P1-15 (producers.md:L348); P1-23 (community-b.md:L298) | P1-10 (flywheel-b.md:L279); P1-15 (producers.md:L348) | P1-09 none (consumed as shared_entity basis in port) (flywheel-a.md:L263) | P1-10: asserted_at (flywheel-b.md:L279) | - |
| entity_relations | P1-10 (flywheel-b.md:L281) | P1-10 (flywheel-b.md:L281) | - | - | - |
| entity_scope | P1-10 (flywheel-b.md:L280); P1-19 reports, for unassigned (corridor reader) (regulations.md:L379) | P1-10 (flywheel-b.md:L280) | - | P1-10: confidence, attributed_to never read (flywheel-b.md:L280) | - |
| error_events | P1-07 reports, (read by ErrorGroupsView.tsx, for P1-25/26) (capture.md:L195); P1-25 (admin-a.md:L319); P1-26 (admin-b.md:L387) | P1-01 (auth-db.md:L186); P1-07 reports, (read by ErrorGroupsView.tsx, for P1-25/26) (capture.md:L195) | - | - | - |
| gate_a_health_cache | - | - | P1-06 none directly (caches gate_a_health) (sources-b.md:L247) | - | - |
| grid_connection_queues | P1-15 (producers.md:L342); P1-21 (research-ops.md:L298) | P1-15 (producers.md:L342) | - | - | written by P1-15 (spec-09 producers) per P1-21 (research-ops.md:L298) |
| harness_runs | P1-08 (harness.md:L354); P1-08 (harness.md:L356); P1-12 reports, for P1-08 (recordRun) (runtimes-a.md:L291); P1-13 reports, for P1-08 (runtimes-b.md:L232) | P1-04 (intake-b.md:L242); P1-08 (harness.md:L354); P1-08 (harness.md:L356); P1-12 reports, for P1-08 (recordRun) (runtimes-a.md:L291); P1-13 reports, for P1-08 (runtimes-b.md:L232) | - | P1-08: finished_at (never written), source_branch, source_artifact_path (never written); proposed drop: harness_version, per_item, defects_found, full_trace_refs, source_branch, source_artifact_path (harness.md:L354) | P1-11 (owns the migration) per P1-08 (harness.md:L354); P1-11 per P1-08 (harness.md:L356) |
| holdings_quality | - | P1-08 (harness.md:L113) | - | - | - |
| indexation_clauses | P1-15 (producers.md:L343); P1-20 (market.md:L285) | P1-15 (producers.md:L343) | - | P1-20: columns beyond listed not inventoried [HYPOTHESIS] (market.md:L285) | - |
| inference_records | P1-10 (flywheel-b.md:L276); P1-12 (runtimes-a.md:L287); P1-19 (regulations.md:L378); P1-25 (admin-a.md:L319); P1-26 (admin-b.md:L387) | P1-10 (flywheel-b.md:L276); P1-12 (runtimes-a.md:L287) | P1-09 none (flywheel-a.md:L263) | - | - |
| ingest_rejections | P1-25 (admin-a.md:L313); P1-26 (admin-b.md:L382) | P1-25 (admin-a.md:L313); P1-26 (admin-b.md:L382) | - | - | - |
| institutions | P1-14 (mint.md:L227) | P1-14 (mint.md:L227) | - | - | - |
| integrity_flags | P1-01 reports, for P1-05/06 (auth-db.md:L273); P1-03 (intake-a.md:L350); P1-04 (intake-b.md:L242); P1-06 (sources-b.md:L243); P1-08 (harness.md:L113); P1-09 (flywheel-a.md:L255); P1-10 (flywheel-b.md:L284); P1-12 (runtimes-a.md:L288); P1-13 (runtimes-b.md:L225); P1-15 (producers.md:L347); P1-25 (admin-a.md:L312); P1-26 (admin-b.md:L379) | P1-03 (intake-a.md:L350); P1-04 (intake-b.md:L242); P1-05 (sources-a.md:L333); P1-06 (sources-b.md:L243); P1-07 (capture.md:L191); P1-08 (harness.md:L113); P1-09 (flywheel-a.md:L255); P1-10 (flywheel-b.md:L284); P1-12 (runtimes-a.md:L288); P1-13 (runtimes-b.md:L225); P1-15 (producers.md:L347); P1-23 reports, for P1-07 (seed-fallback) (community-b.md:L298); P1-24 (dash-search.md:L186); P1-25 (admin-a.md:L312); P1-26 (admin-b.md:L379) | - | - | - |
| intelligence_changes | P1-01 reports, for surface read modules (ids owed) (auth-db.md:L273); P1-24 (dash-search.md:L263) | P1-05 (sources-a.md:L333) | - | P1-24: read and dropped (dash-search.md:L263) | P1-11 (RLS fix B-0479) per P1-05 (sources-a.md:L333) |
| intelligence_item_citations | P1-01 reports, for surface read modules (ids owed) (auth-db.md:L273) | P1-03 (intake-a.md:L349); P1-04 (intake-b.md:L80); P1-14 (mint.md:L227) | - | - | P1-04 (write-item.ts) per P1-14 (mint.md:L227) |
| intelligence_item_sections | P1-01 reports, for surface read modules (ids owed) (auth-db.md:L273); P1-03 (intake-a.md:L344); P1-09 (flywheel-a.md:L260); P1-10 (flywheel-b.md:L282); P1-13 (runtimes-b.md:L227); P1-16 (obligations.md:L217); P1-19 (regulations.md:L376); P1-25 (admin-a.md:L310) | P1-03 (intake-a.md:L344); P1-04 (intake-b.md:L80); P1-12 (runtimes-a.md:L89); P1-14 (mint.md:L227) | - | P1-19: source_ids (unused by any renderer) (regulations.md:L376) | P1-04 (write-item.ts) per P1-14 (mint.md:L227) |
| intelligence_items | P1-01 reports, for surface read modules (ids owed) (auth-db.md:L273); P1-02 (workspace.md:L291); P1-03 (intake-a.md:L340); P1-04 (intake-b.md:L239); P1-05 (sources-a.md:L333); P1-06 (sources-b.md:L242); P1-07 (capture.md:L188); P1-08 (harness.md:L113); P1-09 (flywheel-a.md:L254); P1-10 (flywheel-b.md:L282); P1-12 (runtimes-a.md:L290); P1-13 (runtimes-b.md:L224); P1-14 (mint.md:L223); P1-15 (producers.md:L348); P1-16 (obligations.md:L216); P1-17 reports, for search feature (id owed) (ui-kit.md:L314); P1-18 (shell-list.md:L300); P1-18 (shell-list.md:L303); P1-19 (regulations.md:L375); P1-20 (market.md:L287); P1-21 (research-ops.md:L291); P1-23 (community-b.md:L298); P1-24 (dash-search.md:L262); P1-25 (admin-a.md:L309); P1-26 (admin-b.md:L378) | P1-03 (intake-a.md:L340); P1-04 (intake-b.md:L239); P1-09 (flywheel-a.md:L254); P1-10 (flywheel-b.md:L282); P1-12 (runtimes-a.md:L290); P1-13 (runtimes-b.md:L224); P1-14 (mint.md:L223); P1-15 (producers.md:L348); P1-16 (obligations.md:L216); P1-25 (admin-a.md:L309); P1-26 (admin-b.md:L378) | - | P1-03: the surface and workspace columns (domain, severity display forms, watchlist, overrides) [HYPOTHESIS: the full column inventory was not derived] (intake-a.md:L340); P1-04: computed but not columns: binding_position, due_date, date_precision, corridor_identity, research_credibility (record payload only) (intake-b.md:L239); P1-12: recommended_actions (no writer in scope) (runtimes-a.md:L290); P1-13: added_date (theme members, unused) (runtimes-b.md:L224); P1-16: no legal_instrument column exists (obligations.md:L216); P1-19: read by * and never mapped: recommended_actions (migration 334); a legal-instrument column and a last-verified column [HYPOTHESIS]; mapped for other surfaces and not read by Regulations: severity, signal_band, theme, trajectory_points, what_it_changes, does_not_resolve, origin_class (regulations.md:L375); P1-24: reasoning, what_is_it, why_matters, key_data, operational_impact, open_questions and the rest of the brief fields (the detail lane's) (dash-search.md:L262); P1-25: pipeline_stage is the vestigial column RD-20 retired (admin-a.md:L309) | - |
| item_assignments | P1-02 (workspace.md:L284) | P1-02 (workspace.md:L284) | - | P1-02: (none) (workspace.md:L284) | - |
| item_changelog | P1-01 reports, for surface read modules (ids owed) (auth-db.md:L273); P1-19 (regulations.md:L377); P1-24 (dash-search.md:L263) | P1-08 (harness.md:L113); P1-12 (runtimes-a.md:L89) | - | P1-19: only impact renders (change_date, change_type, field, previous_value, new_value read) (regulations.md:L377) | - |
| item_correction_evidence | P1-10 (flywheel-b.md:L288) | - | - | - | - |
| item_corrections | P1-09 (flywheel-a.md:L257); P1-10 (flywheel-b.md:L288); P1-19 reports, for unassigned (corrections) (regulations.md:L379); P1-24 (dash-search.md:L266); P1-25 (admin-a.md:L311) | P1-25 (admin-a.md:L311) | - | P1-25: machine_observed_count, machine_observed_at (types.ts fields read by nothing) (admin-a.md:L311) | - |
| item_cross_references | P1-01 reports, for surface read modules (ids owed) (auth-db.md:L273); P1-09 (flywheel-a.md:L250); P1-10 (flywheel-b.md:L283); P1-12 (runtimes-a.md:L89); P1-13 (runtimes-b.md:L228); P1-19 (regulations.md:L377); P1-25 (admin-a.md:L310); P1-26 (admin-b.md:L387) | P1-03 (intake-a.md:L348); P1-04 (intake-b.md:L242); P1-09 (flywheel-a.md:L250); P1-10 (flywheel-b.md:L283); P1-12 (runtimes-a.md:L89); P1-14 (mint.md:L70) | P1-06 none (through P1-05 routes) (sources-b.md:L248) | - | - |
| item_disputes | P1-01 reports, for surface read modules (ids owed) (auth-db.md:L273); P1-19 (regulations.md:L377); P1-24 reports, for map and settings lanes (dash-search.md:L263) | - | - | - | - |
| item_forward_events | P1-04 (intake-b.md:L242); P1-06 (sources-b.md:L246); P1-12 (runtimes-a.md:L284); P1-13 (runtimes-b.md:L229); P1-15 (producers.md:L348); P1-16 (obligations.md:L213); P1-19 reports, for P1-16 (readers) (regulations.md:L379); P1-25 (admin-a.md:L317); P1-26 (admin-b.md:L387) | P1-04 (intake-b.md:L242); P1-12 (runtimes-a.md:L284); P1-14 (mint.md:L70); P1-16 (obligations.md:L213) | - | P1-16: created_at unused here; source_span and extractor_version written and read only by the admin route (obligations.md:L213) | identity per migration 307:86-91 per P1-12 (runtimes-a.md:L284) |
| item_gate_a_state | P1-08 (harness.md:L113) | P1-03 (intake-a.md:L345); P1-04 (intake-b.md:L80); P1-08 (harness.md:L113); P1-14 (mint.md:L227) | - | - | P1-04 (one writer, INV-057) per P1-03 (intake-a.md:L345); P1-04 (write-item.ts) per P1-14 (mint.md:L227) |
| item_notes | P1-02 (workspace.md:L283) | P1-02 (workspace.md:L283) | - | P1-02: legacy_override_id (workspace.md:L283) | - |
| item_supersessions | P1-01 reports, for surface read modules (ids owed) (auth-db.md:L273); P1-19 (regulations.md:L377); P1-24 reports, for map and settings lanes (dash-search.md:L263) | - | - | - | - |
| item_timelines | P1-01 reports, for surface read modules (ids owed) (auth-db.md:L273); P1-04 (intake-b.md:L242); P1-12 (runtimes-a.md:L89); P1-16 reports, for P1-24 (obligations.md:L218); P1-18 (shell-list.md:L299); P1-19 (regulations.md:L377); P1-24 (dash-search.md:L263) | P1-03 (intake-a.md:L346); P1-04 (intake-b.md:L242); P1-08 (harness.md:L113) | - | - | - |
| item_type_required_slots | P1-03 (intake-a.md:L347); P1-12 (runtimes-a.md:L89); P1-14 (mint.md:L228) | - | - | - | P1-11 per P1-14 (mint.md:L228) |
| item_workspace_tags | P1-02 (workspace.md:L286); P1-09 reports, for P1-02 (flywheel-a.md:L261) | P1-02 (workspace.md:L286); P1-09 reports, for P1-02 (flywheel-a.md:L261) | - | P1-02: (none) (workspace.md:L286) | - |
| market_series | P1-01 reports, for surface read modules (ids owed) (auth-db.md:L273); P1-08 (harness.md:L113); P1-10 (flywheel-b.md:L287); P1-15 (producers.md:L337); P1-20 (market.md:L279); P1-24 (dash-search.md:L266) | P1-08 (harness.md:L113); P1-15 (producers.md:L337); P1-20 (market.md:L279) | - | P1-15: none ("No unused columns") (producers.md:L337); P1-20: created_at, updated_at, entity_id (market.md:L279) | entity_id stamped by write-market-series.mjs (P1-19/P1-20 lib) per P1-15 (producers.md:L337); P1-15 (writer) per P1-20 (market.md:L279) |
| market_series_items | P1-20 (market.md:L275) | P1-20 (market.md:L275) | - | - | - |
| moderation_reports | P1-23 (community-b.md:L293) | P1-23 (community-b.md:L293) | P1-23 none (owed) (community-b.md:L114) | P1-23: (reason carries body, action and notes; group target_kind branch has no writer) (community-b.md:L293) | P1-11 per P1-23 (community-b.md:L114) |
| monitoring_queue | P1-05 (sources-a.md:L332); P1-13 (runtimes-b.md:L221) | P1-05 (sources-a.md:L332); P1-07 (capture.md:L192); P1-13 (runtimes-b.md:L221) | - | P1-05: item_id, scheduled_check, priority, last_result, error_message, created_at (sources-a.md:L332); P1-07: item_id, reconciled_at (the reconcile pass's) (capture.md:L192) | P1-11 per P1-05 (sources-a.md:L332) |
| notification_preferences | P1-02 (workspace.md:L287) | P1-02 (workspace.md:L287) | P1-23 none (community-b.md:L295) | P1-02: on_promote (owed a DROP COLUMN, ADR-041) (workspace.md:L287); P1-23: never read by any writer (community-b.md:L295) | P1-22/23 (a community table this module edits) per P1-02 (workspace.md:L287) |
| notifications | P1-22 (community-a.md:L245); P1-23 (community-b.md:L294) | P1-07 (capture.md:L196); P1-22 (community-a.md:L245); P1-23 (community-b.md:L294) | - | P1-07: read_at (capture.md:L196); P1-23: (kinds mention and promote allowed and never written) (community-b.md:L294) | P1-23 (routes) per P1-22 (community-a.md:L245) |
| obligation_objects | P1-02 (workspace.md:L291); P1-16 (obligations.md:L215); P1-19 reports, for P1-02 (regulations.md:L379) | P1-16 (obligations.md:L215) | P1-10 none (outbox-emitting) (flywheel-b.md:L296); P1-16 none (re-proves verbatim span, registers entity) (obligations.md:L215) | P1-16: nullable pass-throughs no producer fills: vertical, frequency, evidence_required, retention_period, sanction_class, severity_score, statutory_maximum, cost_formula, direct_compliance_cost, effort, date_reviewed, next_review_due, source_id; spec fields with no column: owner, control_action, provenance (obligations.md:L215) | P1-16 (published-data read) per P1-02 (workspace.md:L291) |
| obligations | P1-08 (harness.md:L113); P1-10 reports, for P1-16 (flywheel-b.md:L285); P1-16 (obligations.md:L214); P1-19 reports, for P1-16 (readers) (regulations.md:L379) | P1-08 (harness.md:L113); P1-16 (obligations.md:L214) | P1-04 none (has binding_position, due_date, date_precision, migration 290) (intake-b.md:L239) | P1-16: derived_at, created_at, updated_at (never read), obligation_id (never written, never read) (obligations.md:L214) | - |
| oem_tech_roadmaps | P1-15 (producers.md:L341); P1-20 (market.md:L285) | P1-15 (producers.md:L341) | - | P1-20: columns beyond listed not inventoried [HYPOTHESIS] (market.md:L285) | - |
| org_invitations | P1-01 (auth-db.md:L268); P1-25 (admin-a.md:L307) | P1-01 (auth-db.md:L268) | - | P1-01: accepted_by_user_id, revoked_by_user_id (written only by the rpcs, never read) (auth-db.md:L268); P1-25: token, accepted_by_user_id, revoked_by_user_id (admin-a.md:L307) | P1-01 per P1-25 (admin-a.md:L307) |
| org_member_bans | P1-01 (auth-db.md:L269) | P1-01 (auth-db.md:L269); P1-25 (admin-a.md:L229) | - | P1-01: banned_at (default) (auth-db.md:L269) | - |
| org_memberships | P1-01 (auth-db.md:L267); P1-01 reports, for surface read modules (ids owed) (auth-db.md:L273); P1-02 (workspace.md:L290); P1-23 (community-b.md:L298); P1-24 reports, for P1-19..23 (the lists') (dash-search.md:L264); P1-25 (admin-a.md:L306); P1-26 (admin-b.md:L387) | P1-01 (auth-db.md:L267) | - | P1-01: (no unused columns) (auth-db.md:L267) | P1-01 (written only by P1-01 routes and rpcs) per P1-02 (workspace.md:L290); P1-01 per P1-25 (admin-a.md:L306) |
| org_watchlist | P1-01 reports, for surface read modules (ids owed) (auth-db.md:L273); P1-02 (workspace.md:L291); P1-23 (community-b.md:L298); P1-24 (dash-search.md:L265) | P1-24 (dash-search.md:L265) | P1-17 none directly (ui-kit.md:L314) | - | - |
| organizations | P1-01 (auth-db.md:L266); P1-02 (workspace.md:L289); P1-06 (sources-b.md:L246); P1-25 (admin-a.md:L305); P1-26 (admin-b.md:L387) | P1-01 (auth-db.md:L266) | - | P1-01: settings (auth-db.md:L266); P1-02: settings (workspace.md:L289); P1-25: settings, updated_at (admin-a.md:L305) | P1-01 (/api/orgs/[org_id]) per P1-02 (workspace.md:L289) |
| pending_first_fetch | P1-07 (capture.md:L186); P1-13 (runtimes-b.md:L223) | P1-07 (capture.md:L186); P1-13 (runtimes-b.md:L223) | - | P1-07: queued_at (ordered by, not read back) (capture.md:L186) | - |
| pending_jurisdiction_review | P1-25 (admin-a.md:L314); P1-26 (admin-b.md:L383) | P1-25 (admin-a.md:L314); P1-26 (admin-b.md:L383) | - | - | - |
| portal_link_candidates | P1-04 (intake-b.md:L241); P1-13 (runtimes-b.md:L220) | P1-04 (intake-b.md:L241); P1-07 (capture.md:L194); P1-12 (runtimes-a.md:L89); P1-13 (runtimes-b.md:L220) | - | - | P1-03 per P1-07 (capture.md:L194); status and dispositions written by P1-03/P1-04 consumePortalCandidates per P1-13 (runtimes-b.md:L220) |
| portfolio_members | P1-24 (dash-search.md:L267) | P1-24 (dash-search.md:L267) | - | P1-24: added_by (written, never read) (dash-search.md:L267) | - |
| portfolios | P1-24 (dash-search.md:L267) | P1-24 (dash-search.md:L267) | P1-02 none directly (through src/lib/portfolio) (workspace.md:L292) | P1-24: created_by (written, never read); name_key re-derived with ilike (dash-search.md:L267) | unassigned (owner owed) per P1-02 (workspace.md:L292) |
| profiles | P1-01 (auth-db.md:L265); P1-02 (workspace.md:L288); P1-09 reports, for P1-02 (flywheel-a.md:L261); P1-23 (community-b.md:L297); P1-24 (dash-search.md:L266); P1-26 (admin-b.md:L387) | P1-01 (auth-db.md:L265); P1-02 (workspace.md:L288) | P1-22 none (community-a.md:L248) | P1-01: bio, sector, timezone, workspace_role, org_id, jurisdiction_overrides (full inventory not derived [HYPOTHESIS]); LinkedIn chain wrote linkedin_verified, verification_tier, full_name, headline, linkedin_url (TRASH) (auth-db.md:L265); P1-02: sector_overrides never written; not touched: headline, organization, linkedin_* columns, affiliation_type, region, topic_interests, membership_tier, contribution_score, notification_preferences, last_active_at, timezone, org_id, workspace_role, sector, role, settings (workspace.md:L288); P1-22: verifier_status (not read anywhere in scope); community role per author (community-a.md:L248) | P1-01 (linkedin_* in-flight import destination) per P1-02 (workspace.md:L288) |
| propagation | P1-13 reports, for P1-09/P1-10 (runtimes-b.md:L232) | P1-13 reports, for P1-09/P1-10 (runtimes-b.md:L232) | - | - | - |
| propagation_events | P1-10 (flywheel-b.md:L273); P1-15 (producers.md:L348) | P1-10 (flywheel-b.md:L273) | P1-09 none (flywheel-a.md:L263) | P1-10: txid; old_row written, never read (flywheel-b.md:L273) | - |
| provisional_sources | P1-01 reports, for surface read modules (ids owed) (auth-db.md:L273); P1-05 (sources-a.md:L324); P1-08 (harness.md:L113); P1-26 (admin-b.md:L374) | P1-05 (sources-a.md:L324); P1-08 (harness.md:L113); P1-25 (admin-a.md:L232); P1-26 (admin-b.md:L374) | P1-06 none (reached through P1-05 admin routes) (sources-b.md:L248) | P1-05: domain, cited_by_source_id, cited_by_source_tier, citation_count, independent_citers, citing_source_ids, highest_citing_tier, accessibility_verified, publishes_structured_content, entity_identified, promoted_to_source_id, created_at, reviewed_at, recommended_classification, discovered_for_jurisdiction (sources-a.md:L324); P1-26: recommended_classification (unused after the port) (admin-b.md:L374) | P1-11 per P1-05 (sources-a.md:L324) |
| published_price_statistics | P1-01 reports, for surface read modules (ids owed) (auth-db.md:L273); P1-15 (producers.md:L338); P1-20 (market.md:L280) | P1-15 (producers.md:L338) | - | P1-20: id (market.md:L280) | written by deriveDisplayRows (P1-19/P1-20 lib); refresher owns (item_id, label) per P1-15 (producers.md:L338); P1-15 (writer) per P1-20 (market.md:L280) |
| raw_fetches | P1-03 (intake-a.md:L353); P1-05 (sources-a.md:L331); P1-05 (sources-a.md:L331); P1-08 (harness.md:L113); P1-13 (runtimes-b.md:L233) | P1-05 (sources-a.md:L331); P1-05 (sources-a.md:L331); P1-13 (runtimes-b.md:L233) | - | - | P1-11 per P1-05 (sources-a.md:L331) |
| region_dimension_coverage | P1-01 reports, for surface read modules (ids owed) (auth-db.md:L273); P1-03 (intake-a.md:L353); P1-21 (research-ops.md:L294) | - | - | P1-21: notes (never rendered) (research-ops.md:L294) | - |
| regional_data_facts | P1-01 reports, for surface read modules (ids owed) (auth-db.md:L273); P1-10 (flywheel-b.md:L287); P1-15 (producers.md:L339); P1-21 (research-ops.md:L295); P1-24 (dash-search.md:L266) | P1-15 (producers.md:L339) | - | P1-15: status, trend, source_note, last_updated (producers.md:L339); P1-21: trend and status mapped and rendered nowhere in the matrix or FactCard (trend reaches only the assistant block) (research-ops.md:L295) | written by P1-15 (regional producers) per P1-21 (research-ops.md:L295) |
| regions | P1-01 reports, for surface read modules (ids owed) (auth-db.md:L273); P1-03 (intake-a.md:L353); P1-10 (flywheel-b.md:L282); P1-15 (producers.md:L348); P1-19 reports, for unassigned (corridor reader) (regulations.md:L120); P1-21 (research-ops.md:L293); P1-24 (dash-search.md:L266) | - | - | P1-21: severity (feeds a dead field) (research-ops.md:L293) | - |
| reroute_events | P1-15 (producers.md:L343); P1-20 (market.md:L285) | P1-15 (producers.md:L343) | - | P1-20: columns beyond listed not inventoried [HYPOTHESIS] (market.md:L285) | - |
| research_assessments | P1-15 (producers.md:L344); P1-21 (research-ops.md:L289) | P1-10 (flywheel-b.md:L285); P1-15 (producers.md:L344) | - | P1-15: entity_id, computed_at (default) (producers.md:L344); P1-21: read but never rendered: credibility_evidence_score; not read: entity_id, the evidence-id arrays and the remaining columns of the 26 [HYPOTHESIS] (research-ops.md:L289) | written by P1-15 (research-assessment producer) per P1-21 (research-ops.md:L289) |
| screen_verdicts | P1-14 (mint.md:L229) | P1-14 (mint.md:L229) | - | - | P1-11 per P1-14 (mint.md:L229) |
| section_claim_provenance | P1-03 (intake-a.md:L342); P1-04 (intake-b.md:L242); P1-08 (harness.md:L113); P1-09 (flywheel-a.md:L260); P1-10 (flywheel-b.md:L282); P1-12 (runtimes-a.md:L89); P1-13 (runtimes-b.md:L226); P1-14 (mint.md:L226); P1-15 (producers.md:L348); P1-16 (obligations.md:L217); P1-19 (regulations.md:L378); P1-25 (admin-a.md:L310) | P1-03 (intake-a.md:L342); P1-04 (intake-b.md:L242); P1-12 (runtimes-a.md:L89); P1-14 (mint.md:L226) | - | - | - |
| sector_contexts | P1-01 reports, for surface read modules (ids owed) (auth-db.md:L273); P1-24 (dash-search.md:L263) | - | - | P1-24: read and dropped (dash-search.md:L263) | - |
| signposts | P1-21 (research-ops.md:L290) | P1-10 (flywheel-b.md:L285); P1-15 (producers.md:L345) | - | P1-15: inference_record_id (producers.md:L345); P1-21: not read: the score columns 353 added (research-ops.md:L290) | written by P1-15; lifecycle_state written by P1-10 signpost watcher per P1-21 (research-ops.md:L290) |
| source_bias_tags | P1-01 reports, for surface read modules (ids owed) (auth-db.md:L273); P1-05 (sources-a.md:L329); P1-17 reports, for P1-01 (four `.from("source_bias_tags")` sites) (ui-kit.md:L315); P1-19 (regulations.md:L377); P1-21 (research-ops.md:L299); P1-26 (admin-b.md:L376) | P1-05 (sources-a.md:L329); P1-08 (harness.md:L258); P1-26 (admin-b.md:L376) | P1-06 none (through P1-05 routes) (sources-b.md:L248) | P1-05: assigned_at (sources-a.md:L329); P1-17: assignment_source (ui-kit.md:L315) | P1-11 per P1-05 (sources-a.md:L329) |
| source_citations | P1-05 (sources-a.md:L325); P1-26 (admin-b.md:L388) | P1-05 (sources-a.md:L325) | - | - | P1-11 (pair UNIQUE, 004_source_trust_framework.sql:384) per P1-05 (sources-a.md:L325) |
| source_reliability_ledger | P1-05 (sources-a.md:L330); P1-15 (producers.md:L346) | P1-15 (producers.md:L346) | - | P1-05: signpost_entity_id, assessment_id, scored_by (sources-a.md:L330) | P1-11 per P1-05 (sources-a.md:L330) |
| source_tier_opinions | P1-05 (sources-a.md:L326); P1-25 (admin-a.md:L315); P1-26 (admin-b.md:L377) | P1-05 (sources-a.md:L326); P1-25 (admin-a.md:L315); P1-26 (admin-b.md:L377) | - | P1-05: dismissed_by, dismissed_reason (sources-a.md:L326) | P1-11 per P1-05 (sources-a.md:L326) |
| source_trust_events | P1-26 (admin-b.md:L375) | P1-05 (sources-a.md:L327); P1-07 (capture.md:L193); P1-25 (admin-a.md:L233); P1-26 (admin-b.md:L375) | P1-06 none (through P1-05 routes) (sources-b.md:L248) | P1-05: reviewer_id (sources-a.md:L327) | P1-11 per P1-05 (sources-a.md:L327); P1-05 per P1-25 (admin-a.md:L233) |
| source_verifications | P1-26 (admin-b.md:L388) | P1-05 (sources-a.md:L328) | - | P1-05: (never read in scope) (sources-a.md:L328) | P1-11 per P1-05 (sources-a.md:L328) |
| sources | P1-01 reports, for P1-05/06 and surface read modules (auth-db.md:L273); P1-03 (intake-a.md:L352); P1-04 (intake-b.md:L240); P1-05 (sources-a.md:L323); P1-06 (sources-b.md:L244); P1-06 (sources-b.md:L78); P1-07 (capture.md:L187); P1-08 (harness.md:L113); P1-09 (flywheel-a.md:L260); P1-10 (flywheel-b.md:L282); P1-12 (runtimes-a.md:L89); P1-13 (runtimes-b.md:L219); P1-14 (mint.md:L224); P1-15 (producers.md:L348); P1-17 (ui-kit.md:L315); P1-19 (regulations.md:L377); P1-20 (market.md:L284); P1-21 reports, for P1-05 (source registry rows the facts embed) (research-ops.md:L292); P1-23 (community-b.md:L298); P1-24 (dash-search.md:L266); P1-26 (admin-b.md:L372) | P1-04 (intake-b.md:L240); P1-05 (sources-a.md:L323); P1-06 (sources-b.md:L244); P1-06 (sources-b.md:L78); P1-07 (capture.md:L187); P1-08 (harness.md:L113); P1-12 (runtimes-a.md:L89); P1-13 (runtimes-b.md:L219); P1-14 (mint.md:L224); P1-15 (producers.md:L348); P1-25 (admin-a.md:L315); P1-26 (admin-b.md:L372) | - | P1-04: jurisdictions read never written by design (intake-b.md:L240); P1-05: tier, next_scheduled_check, paywalled, api_endpoint, rss_feed_url, consecutive_accessible, successful_checks, last_inaccessible, tier_history, cited_by, updated_at, jurisdiction_iso, spotchecked, last_content_hash, last_intelligence_item_at, api_endpoint_url, api_auth_method, api_response_format, secondary_roles, scope_topics, scope_modes, scope_verticals, expected_output, classification_assigned_at, observed_correctness_count, classification_confidence, classification_rationale, category, override_reason, override_date, institution_id, fetch_status, fetch_status_at, last_content_changed_at, organisation_entity_id, source_type, sitemap_url, sitemap_last_walked_at, sitemap_url_count, sitemap_walk_outcome, feed_last_probed_at (sources-a.md:L323); P1-07: access_method (selected and never read) (capture.md:L187); P1-13: sweep: access_method, sitemap_url, sitemap_url_count, feed_last_probed_at (selected and not read); research: name, institution_id (unused) (runtimes-b.md:L219); P1-21: fetch_status (wasted read) (research-ops.md:L292); P1-26: the rest of the 85 columns sources-a.md:323 lists; `notes` Key:/Accept: convention no migration declares (admin-b.md:L372) | P1-05 (writer via source-growth) per P1-03 (intake-a.md:L352); P1-11 (authority); several written by P1-06; override_reason, override_date belong to P1-25/26 commit-tier-change per P1-05 (sources-a.md:L323); P1-05 per P1-06 (sources-b.md:L244); P1-05 (registerAndRate) per P1-14 (mint.md:L224); P1-05 per P1-25 (admin-a.md:L315); P1-05 (Source type, L434) per P1-26 (admin-b.md:L372) |
| staged_updates | P1-04 (intake-b.md:L238); P1-13 (runtimes-b.md:L222); P1-25 (admin-a.md:L308); P1-26 (admin-b.md:L385) | P1-04 (intake-b.md:L238); P1-05 (sources-a.md:L333); P1-26 (admin-b.md:L385) | P1-14 none [REFUTED for the brief's list] (mint.md:L71) | P1-04: item_id written (read only), source_id, batch_id (intake-b.md:L238) | - |
| state_cost_facts | P1-01 reports, for surface read modules (ids owed) (auth-db.md:L273); P1-15 (producers.md:L340); P1-21 (research-ops.md:L296); P1-24 (dash-search.md:L266) | P1-15 (producers.md:L340) | - | P1-15: currency, derivation, source_key, source_ref, n_observations, method_version, as_at_date, reference_period, last_updated (producers.md:L340); P1-21: state_label, dimension, value_numeric, origin_class, region_id (research-ops.md:L296) | written by P1-15 (regional producers) per P1-21 (research-ops.md:L296) |
| statutory_computations | P1-10 (flywheel-b.md:L286); P1-26 (admin-b.md:L324) | P1-10 (flywheel-b.md:L286); P1-25 (admin-a.md:L318); P1-26 (admin-b.md:L324) | - | P1-10: computed_at (flywheel-b.md:L286) | P1-26 route, P1-09/10 writer per P1-25 (admin-a.md:L318) |
| system_state | P1-01 reports, for P1-05/06 (auth-db.md:L273); P1-05 (sources-a.md:L333); P1-07 (capture.md:L198); P1-08 (harness.md:L113); P1-13 (runtimes-b.md:L232); P1-15 (producers.md:L348); P1-24 reports, for P1-05/06 (dash-search.md:L269); P1-26 (admin-b.md:L384) | - | P1-06 none (through P1-05 routes) (sources-b.md:L248) | P1-07: judgement_drain (not read) (capture.md:L198) | P1-05/06 owns the pause readers per P1-01 per P1-08 (harness.md:L113) |
| tag | - | - | P1-02 none directly (workspace.md:L91) | - | unassigned (owner owed) per P1-02 (workspace.md:L91) |
| theme_briefs | P1-01 reports, for surface read modules (ids owed) (auth-db.md:L273); P1-03 (intake-a.md:L353); P1-09 (flywheel-a.md:L253); P1-12 (runtimes-a.md:L286); P1-13 (runtimes-b.md:L230); P1-18 (shell-list.md:L300); P1-19 (regulations.md:L378); P1-26 (admin-b.md:L387) | P1-09 (flywheel-a.md:L253); P1-12 (runtimes-a.md:L286) | P1-06 none (through P1-05 routes) (sources-b.md:L248) | - | unassigned (theme-briefs apply, no lane) per P1-09 (flywheel-a.md:L253) |
| user_item_state | P1-02 (workspace.md:L282) | P1-02 (workspace.md:L282) | - | P1-02: (none) (workspace.md:L282) | - |
| user_watchlist | P1-01 reports, for surface read modules (ids owed) (auth-db.md:L273); P1-02 (workspace.md:L291); P1-24 (dash-search.md:L265) | P1-24 (dash-search.md:L265) | P1-17 none directly (written by watchlist feature) (ui-kit.md:L314) | P1-24: org_id (written and never read) (dash-search.md:L265) | - |
| vocabulary_mentions | P1-09 (flywheel-a.md:L256) | P1-09 (flywheel-a.md:L256); P1-12 (runtimes-a.md:L89) | - | - | - |
| vocabulary_terms | P1-09 (flywheel-a.md:L256); P1-20 (market.md:L286) | P1-09 (flywheel-a.md:L256); P1-12 (runtimes-a.md:L89) | - | - | - |
| workspace_item_overrides | P1-01 reports, for surface read modules (ids owed) (auth-db.md:L273); P1-02 (workspace.md:L281); P1-24 reports, for P1-19..23 (the rest) (dash-search.md:L264) | P1-02 (workspace.md:L281) | - | P1-02: notes (refused with 400), workspace_tags (superseded by migration 313) (workspace.md:L281); P1-24: archive_reason, archive_note, dismissed_at, owner_user_id (the rest are the lists') (dash-search.md:L264) | - |
| workspace_settings | P1-01 (auth-db.md:L270); P1-02 (workspace.md:L280); P1-06 (sources-b.md:L246); P1-09 (flywheel-a.md:L259); P1-12 reports, for P1-13 (runtimes-a.md:L89); P1-13 (runtimes-b.md:L231) | P1-01 (auth-db.md:L270); P1-02 (workspace.md:L280) | - | P1-01: jurisdiction_weights, default_filters, alert_config, home_sections, default_export_format, notify_on_sector_activation, sectors_activation_signup_at (auth-db.md:L270); P1-02: notify_on_sector_activation, sectors_activation_signup_at; jurisdiction_weights read, never written in scope; profile keys roles, transport_modes, trade_lanes, products, operational_baseline, office_footprint, regulation_scope written by nothing in scope (workspace.md:L280) | - |
| workspace_tags | P1-02 (workspace.md:L285); P1-09 reports, for P1-02 (flywheel-a.md:L261) | P1-02 (workspace.md:L285); P1-09 reports, for P1-02 (flywheel-a.md:L261) | P1-17 none directly (tags client) (ui-kit.md:L314) | P1-02: name_key (database key, never read by code) (workspace.md:L285) | - |

### C.2 RPCs and functions (73)

| object | readers by lane | writers by lane | other access stated | unused columns named | shape owner named |
|---|---|---|---|---|---|
| _workspace_active_items | - | - | P1-16 none (used by migration 315) (obligations.md:L218) | - | - |
| accept_group_invitation | - | - | P1-23 none (owed) (community-b.md:L299) | - | P1-11 per P1-23 (community-b.md:L299) |
| accept_invitation | - | P1-01 (auth-db.md:L271) | - | - | - |
| acquire_mutation_lease | - | P1-08 (harness.md:L113) | - | - | - |
| admin_attention_counts | P1-25 (admin-a.md:L320); P1-26 (admin-b.md:L389) | - | - | - | P1-26 adds ingest_rejections_untriaged per P1-25 (admin-a.md:L320) |
| admin_set_judgement_drain | - | P1-26 (admin-b.md:L389) | - | - | - |
| admin_set_pause_state | - | P1-26 (admin-b.md:L389) | - | - | - |
| agent_run_searches_set_result_chars | - | - | P1-03 none (relied on, 322) (intake-a.md:L354) | - | - |
| aggregates | P1-18 (shell-list.md:L301) | - | - | P1-18: by_status (shell-list.md:L301) | - |
| assert_acyclic | - | - | P1-10 none (database-internal triggers) (flywheel-b.md:L92) | - | - |
| auth.admin.createuser | - | P1-26 (admin-b.md:L389) | - | - | - |
| auth.admin.getuserbyid | P1-01 (auth-db.md:L271) | - | - | - | - |
| backfill_market_series_entity | - | P1-08 (harness.md:L113) | - | - | - |
| capture | - | P1-13 reports, for P1-07 (runtimes-b.md:L64) | - | - | - |
| capture_worker_fetch | - | - | P1-07 none (DB-side invoker of the worker, not a dependency) (capture.md:L199) | - | - |
| citation | P1-20 (market.md:L288) | - | - | - | - |
| community_directory_counts | - | - | P1-23 none (owed) (community-b.md:L299) | - | P1-11 per P1-23 (community-b.md:L299) |
| community_identity | P1-22 (community-a.md:L247); P1-23 (community-b.md:L299) | - | - | - | P1-23 (identity.mjs) per P1-22 (community-a.md:L247) |
| community_notification_counts | - | - | P1-23 none (owed) (community-b.md:L299) | - | P1-11 per P1-23 (community-b.md:L299) |
| community_region_counts | P1-23 (community-b.md:L299) | - | - | - | - |
| correction | - | P1-25 (admin-a.md:L320) | - | - | - |
| coverage_matrix | P1-25 (admin-a.md:L320); P1-26 (admin-b.md:L389) | - | - | - | - |
| create_group_for_self | - | - | P1-23 none (owed) (community-b.md:L299) | - | P1-11 per P1-23 (community-b.md:L299) |
| create_item_correction | - | P1-10 (flywheel-b.md:L92) | - | - | - |
| create_org_for_self | - | P1-01 (auth-db.md:L271) | - | - | - |
| create_thread | - | - | P1-23 none (owed) (community-b.md:L299) | - | P1-11 per P1-23 (community-b.md:L299) |
| decide_signoff | - | - | P1-23 none (owed) (community-b.md:L299) | - | P1-11 per P1-23 (community-b.md:L299) |
| decline_invitation | - | P1-01 (auth-db.md:L271) | - | - | - |
| effective_confidence | - | - | P1-10 none (the view derived_values_admissible) (flywheel-b.md:L92) | - | - |
| gate_a_health | P1-06 (sources-b.md:L247) | - | - | - | - |
| get_all_surface_counts | P1-06 (sources-b.md:L247); P1-24 (dash-search.md:L269) | - | - | - | - |
| get_market_intel_items | P1-06 (sources-b.md:L247) | - | - | - | - |
| get_market_intel_items_public | P1-18 (shell-list.md:L103); P1-20 (market.md:L288) | - | - | - | - |
| get_operations_items_public | P1-18 (shell-list.md:L103); P1-21 (research-ops.md:L300) | - | - | - | - |
| get_research_items_public | P1-18 (shell-list.md:L103); P1-21 (research-ops.md:L300) | - | - | - | - |
| get_research_source_coverage | P1-01 reports, for surface read modules (ids owed) (auth-db.md:L273); P1-21 (research-ops.md:L300) | - | - | - | - |
| get_source_citation_stats | P1-01 reports, for surface read modules (ids owed) (auth-db.md:L273); P1-21 (research-ops.md:L300); P1-24 (dash-search.md:L269) | - | - | - | - |
| get_surface_counts | P1-01 reports, for surface read modules (ids owed) (auth-db.md:L273); P1-18 (shell-list.md:L103); P1-20 (market.md:L288); P1-24 (dash-search.md:L269) | - | - | - | - |
| get_tier_opinion_disagreements | P1-25 (admin-a.md:L320); P1-26 (admin-b.md:L389) | - | - | - | - |
| get_workspace_due_next | P1-01 reports, for surface read modules (ids owed) (auth-db.md:L273); P1-16 reports, for P1-24 (obligations.md:L218); P1-18 (shell-list.md:L103); P1-24 (dash-search.md:L269) | - | - | - | dashboard read inside the range (879) per P1-18 (shell-list.md:L103) |
| get_workspace_intelligence | P1-18 (shell-list.md:L103) | - | - | - | - |
| get_workspace_intelligence_aggregates | P1-01 reports, for surface read modules (ids owed) (auth-db.md:L273); P1-18 (shell-list.md:L103); P1-24 (dash-search.md:L270) | - | - | P1-18: by_status (aggregates jsonb: unused by this scope) (shell-list.md:L103); P1-24: WorkspaceAggregates.byStatus, byJurisdiction, lastUpdatedAt unused (bySeverity, byBand market lane's) (dash-search.md:L270) | - |
| get_workspace_intelligence_dashboard | P1-18 (shell-list.md:L103); P1-24 (dash-search.md:L269) | - | - | - | - |
| get_workspace_intelligence_listings | P1-18 (shell-list.md:L103) | - | - | - | - |
| get_workspace_intelligence_listings_public | P1-23 (community-b.md:L105) | - | P1-19 none directly (list and map payloads go through supabase-server.ts) (regulations.md:L120) | - | - |
| get_workspace_intelligence_slim | P1-18 (shell-list.md:L103) | - | - | - | slim RPC missing `id` tiebreak "flagged, not fixed" (:750-756) per P1-18 (shell-list.md:L103) |
| get_workspace_recent_changes | P1-01 reports, for surface read modules (ids owed) (auth-db.md:L273); P1-24 (dash-search.md:L269) | - | - | - | - |
| heartbeat_mutation_lease | - | P1-08 (harness.md:L113) | - | - | - |
| intelligence_items_theme_guard | - | - | P1-03 none (relied on, 357) (intake-a.md:L354) | - | - |
| invalidate_dependents | P1-10 (flywheel-b.md:L92) | P1-10 (flywheel-b.md:L92) | - | - | - |
| is_platform_admin | P1-01 (auth-db.md:L271); P1-23 (community-b.md:L299) | - | - | - | - |
| item_corrections_latest | - | - | P1-10 none (database-internal, migration 356 triggers) (flywheel-b.md:L92) | - | - |
| listing | P1-18 (shell-list.md:L298) | - | - | P1-18: recommended_actions (never filled on any Resource, migration 334); trimmed from list rows by toLedgerRowPayload: key_data, reasoning, full_brief, regulatory conflict, trajectory points, operational impact, risk register, recommended actions, open questions, source urls, cost mechanism, penalty range, enforcement body, requirement trajectory (shell-list.md:L298) | - |
| lookup_invitation | P1-01 (auth-db.md:L271) | - | - | - | - |
| moderate_report | - | - | P1-23 none (owed) (community-b.md:L299) | - | P1-11 per P1-23 (community-b.md:L299) |
| mutation | P1-04 (intake-b.md:L243) | P1-04 (intake-b.md:L243) | - | - | P1-08 (lease library) per P1-04 (intake-b.md:L243) |
| my_profile | P1-23 (community-b.md:L299) | - | - | - | - |
| next_uncensused_portal_candidates | P1-04 (intake-b.md:L243) | - | - | - | - |
| propagation_outbox_trg | - | - | P1-10 none (trigger on 11 tables) (flywheel-b.md:L226) | - | - |
| publish_aggregate | - | - | P1-10 none (DEAD per C4) (flywheel-b.md:L92) | - | - |
| register_derived_value | - | P1-10 (flywheel-b.md:L92) | - | - | - |
| register_inference_record | - | P1-10 (flywheel-b.md:L92); P1-12 (runtimes-a.md:L287) | - | - | - |
| release_mutation_lease | - | P1-08 (harness.md:L113) | - | - | - |
| request_verification | P1-02 (workspace.md:L292) | P1-02 (workspace.md:L292) | - | - | - |
| revoke_invitation | - | P1-01 (auth-db.md:L271); P1-25 (admin-a.md:L320) | - | - | - |
| revoke_item_correction | - | P1-10 (flywheel-b.md:L92); P1-25 (admin-a.md:L320) | - | - | - |
| rpcs | - | - | P1-05 none (sources-a.md:L109); P1-17 none (ui-kit.md:L316) | - | none in scope per P1-05 (sources-a.md:L109) |
| search_intelligence_items | P1-24 (dash-search.md:L269) | - | - | - | - |
| set_provenance_status | - | - | P1-03 none (relied on, INV-125) (intake-a.md:L354); P1-14 none (relied on) (mint.md:L70) | - | - |
| uq_item_forward_events_text_identity | - | - | P1-16 none (dedupe key relied on) (obligations.md:L213) | - | - |
| user_is_group_admin | P1-23 (community-b.md:L299) | - | - | - | - |
| validate_item_provenance | P1-03 (intake-a.md:L354); P1-04 (intake-b.md:L243); P1-14 (mint.md:L70) | - | - | - | - |
| workspace | P1-01 reports, for surface read modules (ids owed) (auth-db.md:L273); P1-19 reports, for P1-02 (regulations.md:L379) | - | - | - | - |

### C.3 Views (6)

| object | readers by lane | writers by lane | other access stated | unused columns named | shape owner named |
|---|---|---|---|---|---|
| derived_values_admissible | P1-10 (flywheel-b.md:L289) | - | - | - | - |
| emission_factor_candidates | - | - | P1-04 none (generated into migration 258 by factor-tier.mjs) (intake-b.md:L244) | - | - |
| licence_clear_sources | P1-20 (market.md:L282) | - | - | - | - |
| propagation_queue_depth | P1-10 (flywheel-b.md:L289) | - | - | - | - |
| research_assessments_current | P1-03 (intake-a.md:L353); P1-15 (producers.md:L344); P1-21 (research-ops.md:L289) | - | - | - | - |
| views | - | - | P1-01 none (auth-db.md:L272); P1-02 none (workspace.md:L292); P1-05 none (sources-a.md:L109); P1-06 none (sources-b.md:L78); P1-07 none (capture.md:L200); P1-18 none (shell-list.md:L304); P1-25 none ("Views: none") (admin-a.md:L320); P1-26 none ("Views: none") (admin-b.md:L389) | - | none in scope per P1-05 (sources-a.md:L109); none in scope per P1-18 (shell-list.md:L304) |

### C.4 Other objects (buckets, auth calls, unspecified) (2)

| object | readers by lane | writers by lane | other access stated | unused columns named | shape owner named |
|---|---|---|---|---|---|
| bootstrap (other) | P1-18 (shell-list.md:L302) | - | - | P1-18: adminAttention (shell-list.md:L302) | P1-02 per P1-18 (shell-list.md:L302) |
| dashboarddata (other) | - | - | P1-24 none (dash-search.md:L270) | P1-24: archived, disputes, supersessions, synopses, intelligenceChanges, sectorDisplayNames, overrides (dropped) (dash-search.md:L270) | - |

### C.5 Tables with a reader and no writer in any register (12)

Mechanical: a table some register reads and no register writes. A writer outside the 25 scopes (migrations, triggers, RPC bodies, the Edge Function) is not visible here; P1-11 schema would show it.

assumption_register, community_topic_groups, coverage_gaps, data_sources, item_correction_evidence, item_disputes, item_supersessions, item_type_required_slots, region_dimension_coverage, regions, sector_contexts, system_state


## D. INTERFACES

Source: each register's section 8 "Interface to other modules", extracted as offers / needs / consumer / gap rows. Lane ranges as written (P1-05/06, P1-12..15) expand to each lane in them.

### D.1 The import graph

| lane | module | offers | needs from lane X |
|---|---|---|---|
| P1-01 | auth-db | requireUser, requireAdmin, isRefusal, workerAuthGuard, checkRateLimit, clientKey, rateLimitHeaders, getServiceSupabase, createSupabaseServerClient, createSupabaseBrowserClient, isSupabaseConfigured, describeSupabaseError, isUuid, fetchAllRows, exactCount, fetchAllByIdChunks, assertBound, resolveMembership, requireOrgWriter, resolveOrgIdFromCookies, resolveViewerIdentityFromCookies, resolveServerBootstrap, ensureProfile, isPlatformAdmin, requirePlatformAdmin, readOwnPlatformAdmin, authedFetch, authHeaders, useAuth, AuthProvider, AuthFrame, AuthPanel parts, sanitizeReturnPath, decideRoute (auth-db.md:L277) | from P1-17: Button, Masthead, SectionHeader, the ISO week helper, tokens (auth-db.md:L278) / from P1-18: bootstrap-seed types AuthSeed, IdentityStatus, shouldShowAdminNav; AppShell consumes identityStatus, orgId, retryIdentity; Sidebar consumes isPlatformAdmin and mounts UserMenu (auth-db.md:L278) / from P1-02: workspaceStore setWorkspace, setUserRole, setSectorProfile; profile-contract.mjs, REGIONS, ALL_SECTORS (auth-db.md:L278) / from unassigned: telemetry captureError, withErrorCapture; email sendInvitationEmail (today a stub) (auth-db.md:L278) |
| P1-02 | workspace | getWorkspaceProfile, DEFAULT_WORKSPACE_PROFILE, relevanceForItem, getViewerRelevanceForItem, computeItemRelevance, summariseObligationBinding, currentObligationObjects, dutyHoldersExcludeForwarder, fetchObligationObjectsForItem, ORG_ROLES, ORG_SIZE_DIMENSIONS, findBand, parseOrgProfile, validateProfileInput, PROFILE_JSON_KEYS, DEFAULT_ORG_PROFILE, runCollab, loadRoster, displayNameOf, canWrite, isOrgAdmin, itemIdFromDetailPath, resolveItemUuid, isIsoDate, NOTE_MAX_LENGTH, MAX_ASSIGNEES_PER_REQUEST, useWorkspaceStore, useItemStateStore, mergeWithOverrides, WorkspaceOverride, PersonalItemState, useSettingsStore, DashboardRegionKey, DEFAULT_NOTIFICATION_PREFS, routes /api/workspace/{overrides, personal-state, archive-impact, bootstrap, items/[id]/notes, items/[id]/assignments, tags, tags/[id]/items, portfolios, portfolios/[id], portfolios/[id]/members}, components ArchiveDialog, ArchiveViewer, AccountPage, MembersPanel, OrganizationPanel, NotificationPreferences, NoWorkspaceLanding, OnboardingWizard, OnboardingStepper, InvitationLandingPage, BriefingScheduleSection, OrganisationProfileSection, SupersessionHistory (workspace.md:L296) | from P1-01: requireUser/requireUserRoute, isRefusal, rateLimitHeaders, getServiceSupabase, createSupabaseBrowserClient, createSupabaseServerClient, resolveMembership/resolveOrgIdFromUserId, requireOrgWriter returning the role, resolveServerBootstrap, isPlatformAdmin, authedFetch, useAuth, AuthFrame, isUuid, invitation routes, /api/orgs POST (workspace.md:L297) / from P1-17: Button, Chip, FieldLabel, SectionHeading, SectionCard, StatBlock, TabRow, Masthead, RowTable, StateNote, Absence, Toast, Dialog, ErrorBanner, SaveControl, BandTile, BandTileRow, date label from a server instant (workspace.md:L297) / from P1-18: AppShell redirect to /workspace/new, noWorkspaceLabel, bootstrap-seed, useWorkspaceBootstrap and usePersonalState hooks, Sidebar links to /profile and /settings, nav-counts (workspace.md:L297) / from P1-24: getWorkspaceAggregates, WorkspaceAggregates for onboarding preview (workspace.md:L297) / from unassigned: fetchWorkspaceOverrideRowsRaw and mapOverrideRows (surface read layer P1-01 left id-less); APP_DATA_TAG and getSettingsData from lib/data.ts (id-less) (workspace.md:L297) / from P1-22/23: REGIONS from profile-policy.mjs, dispatchNotification, request_verification consumer VerifierBadge, notification_preferences (workspace.md:L297) / from unassigned: @/lib/tags/* and @/lib/portfolio/* (owners owed); telemetry withErrorCapture; perf server-timing; @/lib/constants; @/lib/detail/id-redirect, @/lib/item-links (workspace.md:L297) / from P1-05/06: nothing imported (this module hands them sourceStore and types/source) (workspace.md:L297) / from P1-03/04: nothing (workspace.md:L297) |
| P1-03 | intake-a | injectBrief, groundInjectedLedger, sectionBrief, harvestTimeline, registerBriefSources, growSources, startBriefWorkflow, BRIEF_FIELDS, COMPLIANCE_OBJECTS, TOPIC_TAGS, renderAuthorInstruction, CONTRACT_VERSION, validateMetadata, validateClaimLedger, validateClassifyVerdict, extractSections, extractRegulationSections, parseRegulationSection, parseRecordSections, splitKeyDateFacts, extractRecommendedActions, findTimelineSection, stripSourcesSection, parseTimeline, buildTimelineRows, toIsoDate, scanBrief, derivedCoveredTokens, perFactGates, identityCongruenceHolds, authorityFloorFor, authorityFloorForFact, hashSourcePool, canonicalizeCitationUrl, assertNoInternalMarkers, summarizeNullTierAggregate, mergeNullTierAggregate, crossItemAuditGate, readOpenDataAuditBlock, hasValidWaiver (intake-a.md:L358) | from P1-01: getServiceSupabase, requireAdmin, isRefusal, isUuid, fetchAllRows (intake-a.md:L359) / from P1-04: write-item.ts builders and writeGroundingSequence, the item_gate_a_state writer, mintIntelligenceItem, run-intake-cycle as a caller (intake-a.md:L359) / from P1-05: institution resolver buildResolver, hostOf, hostInstitution, isErrorBody, cited-host gate, target match, officialness, holdings gate, seek-more's deterministic resolvers, source-growth (intake-a.md:L359) / from P1-07: the fetch primitive: transport ladder, charset decode, PDF extract, fetch quality, acquire lock, fetch-hold; the pool writer (intake-a.md:L359) / from P1-08: agent_runs step records, the run artifact the workflow outcome lands in (CLAUDE.md rule 17) (intake-a.md:L359) / from P1-09: brief-candidates for the candidate-connections block, forward-event extraction after a ground, term-recurrence and adopted-terms for vocabulary gates, the link step's edges (intake-a.md:L359) / from unassigned: workflow package; @/lib/domains, @/lib/text/html-to-text, telemetry captureError (intake-a.md:L359) / from P1-01: src/lib/db/paginate, src/lib/api/route-guard, src/lib/supabase-service (old imports) (intake-a.md:L117) / from P1-05/P1-07: src/lib/sources (acquire-lock, api-transport, canonical-fetch, charset-decode, cited-host-gate, entity-gate, fetch-hold, fetch-quality, holdings-gate, host-authority, institution, officialness, pdf-extract, primary-fallback, seek-more, source-growth, target-match, transport-escalation, transport-runtime) (intake-a.md:L117) / from P1-04: src/lib/intake/write-item (the shared writer) (intake-a.md:L117) / from P1-09: src/lib/connections (brief-candidates, forward-event-format, term-recurrence) (intake-a.md:L117) / from P1-08: features/intake/pipeline.ts and workflow.ts need P1-08's run records (intake-a.md:L402) / from P1-05, P1-04: core/grounding/ground.ts needs P1-05's resolver and gates and P1-04's shared writer (intake-a.md:L401) |
| P1-04 | intake-b | applyStagedUpdate, isSubstantiveUpdate, mintIntelligenceItem, runParticipation, runIntakeCycle, drainChangeSweepUpdates, persistPortalCandidates, selectCandidateLedgerPage, consumePortalCandidates, buildRecordPayload, buildResearchRecordPayload, buildRecordSlotClaim, the slot extractors, buildRecordFullBrief, writeGroundingSequence and builders, buildGateARow, classifyMintOutcome, makeEnvelope, stalenessOf, propagate, formatDelta, significantFigures, roundToSampleSupport, DERIVATION, isContractable, isStatutory, vocabularies and normaliseMode, validateFactor, render*Sql generators, mayEmbedAsSeed, attributionsFor, groundCandidate, proposeSourceAxisClassification, detectDrift, observedDistributionFromItems, quarantine resolver, planner, re-home, id-stamp, erase (intake-b.md:L248) | from P1-01: getServiceSupabase, fetchAllRows for the full dedup corpus, isRefusal/requireAdmin for the admin run-intake route (intake-b.md:L249) / from P1-03: groundBrief with injectedLedger, the claim-ledger gates, validateClassifyVerdict (free half of first-fetch classify) (intake-b.md:L249) / from P1-05: urlIsRoot, classifySourceRole, canonicalizeUrl, verifyItem, getSnapshot, probeFreshness, cheapVerifyClaims, CHANGE_SWEEP_STAGED_MARKER, host-authority tiers, target-match; home of features/sources/axes.ts and classify-sources.ts (intake-b.md:L249) / from P1-08: run recording, harness_runs, mutation leases, the injected-brief seam's executor contract (intake-b.md:L249) / from P1-09: runConnectionDiscovery, readAndExtractForwardEvents, syncComplianceDeadlineForItem, linkItemEntities, linkItems, flag-namespaces (intake-b.md:L249) / from P1-03: agent: specForItemType, gate-a-scan, section-markers, timeline-backfill-derive, groundBrief with injectedLedger (intake-b.md:L249) / from unassigned: domainForItemType (src/lib/domains.ts) (intake-b.md:L249) / from unassigned: @/lib/surface-of.mjs; scripts/lib/{db, env-file, free-pass, mutation-lease, quarantine-dwell, deferral, run-artifact, harness-run-number, record-harness-run}.mjs; scripts/maintenance/lib/cli.mjs; apply-deferrals.mjs; propose-tags.mjs; governing-files.mjs (intake-b.md:L79) / from P1-09: flywheel-participation needs P1-09 flywheel-a exports (intake-b.md:L317) / from P1-05: cycle, change-sweep-drain, portal-ledger need P1-05 sources exports (intake-b.md:L319) / from P1-08: quarantine/* and cli/ground-injected need P1-08 leases and run recording (intake-b.md:L320) |
| P1-05 | sources-a | tierOfSource, buildResolver, hostInstitution, hostOf, canonicalizeUrl, classTierForHost, classTierForHostAcrossNames, placeHostWithVerdicts, decidePoolHostRegistration, permanentlyUnregisteredClass, HOST_CLASS_TIER, isKnownHostClass, classifySourceRole, classifySourceType, classifyInstitutionalType, planTrustScores, planTierMovements, applyTierMovements, recomputeEffectiveTier, outcomeReaderFor, writeEffectiveTierUnlessOverridden, registerCitedSources, registerPoolHostsForGrounding, registerEntryCitations, growSourcesFromBrief, partitionCitedByHost, customerSourceTier, tierLabelOf, tierScaleSpan, buildBiasDisplay, writeBiasTags, verifyCandidate, buildPromotedSourceRow, checkVerticalFitGate, null-tier plans, fetchAllowed, signed callers, escalateFetch, captureForStorage, classifyBody, fetchDocumentApi, generateCandidates, fetchPrimaryWithFallback, verifyPoolTargetMatch, officialnessOf, classifyCompleteness, classifySufficiency, holdingsPresent, getSnapshot, writeSnapshot, contentFingerprint, isContentChange, probeFreshness, verifyItem, runReconcilePass, bridgeChangedSourceToStagedUpdates, walkSource, walkFeed, walkEurlexOj, walkFederalRegister, extractPortalLinks (sources-a.md:L337) | from P1-01: getServiceSupabase, fetchAllRows, describeSupabaseError, the pause readers it hands over (sources-a.md:L338) / from P1-07: pool writer for agent_run_searches and raw_fetches capture writer (calls escalateFetch, captureForStorage, writeSnapshot) (sources-a.md:L338) / from P1-11: the tables, migration 092 bias CHECK, migration 288 source_type CHECK, intelligence_changes RLS fix of B-0479 (sources-a.md:L338) / from P1-03: authorityFloorFor (agent/source-blocks.mjs), null-tier-flag.mjs merge, url-canon.mjs, source-pool-hash.mjs (sources-a.md:L338) / from unassigned: coverage/identity.mjs classifyIdentifier (owner id owed) (sources-a.md:L338) / from P1-09: entities hostFromUrl (if it owns entities) [HYPOTHESIS] (sources-a.md:L338) / from P1-01: api/pause.ts readScrapeState, getScrapeState, isGloballyPaused handoff (sources-a.md:L292) |
| P1-06 | sources-b | buildCoverageMatrix, buildCoverageView, parseCoverageQuery, coverageHref, matrixToCsv, csvFilename, surfaceDenominator, formatDenominatorLine, formatPortfolioCoverageLine, ALL, UNTAGGED, describeCoverageState, COVERAGE_ACTION, validateCoverageRequest, recordCoverageRequest, getCoverageMatrix, getSurfaceDenominator, getCoverageEntries, getCoverageIndex, COVERAGE_SURFACES, CoverageSurface, CoverageEntry, requestCoverageRequest, fetchCoverageSummary, downloadCoverageCsv, getRegionCoverage, classifyIdentifier, UK_TYPES, readGateAHealth, decideGateAProbe, computeSpendHealth, SourceRegistryCard (headTabs, onOpenQueue, stagedUpdatesCount, pendingTotal props) (sources-b.md:L252) | from P1-05: the 18 admin routes, useSourceStore and filterSources, Source and ProvisionalSource types, classTierForHost, classifySourceType, classifySourceRole, fetchPrimaryWithFallback, generateCandidates, officialnessOf, the acquire-lock flag (sources-b.md:L253) / from P1-17: StateNote, Absence, ActionButton, SectionCard, SectionHeading, TabRow, RowTable, TierChip, FilterChip, RelativeTime, Masthead, RailCard, CoverageState, Button, StatBlock, ItemGroup, `tint`, tokens (sources-b.md:L253) / from P1-18: list-surface mobile CSS (sources-b.md:L253) / from P1-01: authedFetch, requireUser, requireAdmin, workerAuthGuard, checkRateLimit, getServiceSupabase, fetchAllRows (sources-b.md:L253) / from P1-07: census_worklist, identity probe that fills identity_* (sources-b.md:L253) / from unassigned: @/lib/tier-labels (TIER_LABELS), @/lib/domains, @/lib/contracts/vocabularies.mjs, @/lib/jurisdictions/iso, @/lib/telemetry/surface-health.mjs, @/lib/llm/spend-gauge.mjs (sources-b.md:L253) / from P1-05: admin routes /api/admin/canonical-sources/*, /api/admin/sources/*, /api/admin/{intersections,themes,b2-progress}; /api/dashboard/coverage/{matrix,request} route files outside scope (sources-b.md:L79) |
| P1-07 | capture | fetchDocument and fetch policy constants, runChangeDetection, captureError, withErrorCapture, captureSeedFallback, stackHash, reportClientError, GlobalErrorReporter, timePhase, recordSerializedBytes, withServerTiming, PERF_PHASES, slugsOrEmpty, evaluateSurface, overallOk, seedLeak, ALL_SURFACES, sendInvitationEmail, dispatchNotification, NotificationKind, itemTag, INTEL_ITEMS_TAG, surfaceDetailTag, revalidateItem, refuseToCacheFallback, readThroughFallbackGuard, /api/revalidate contract { tags } (capture.md:L204) | from P1-01: getServiceSupabase from core/db/clients, workerAuthGuard, checkRateLimit, requireUser/requireUserRoute, isRefusal, authHeaders (capture.md:L205) / from P1-05: isGloballyPaused, getScrapeState, scrapeWindowOpen, classifyReachability, decideSourceAssessment, contentFingerprint, isContentChange, extractPortalLinks, urlIsRoot, runReconcilePass (capture.md:L205) / from P1-03: persistPortalCandidates; the capture-to-mint consumer of result_content (capture.md:L205) / from P1-08: dispatcher that invokes the worker and check-sources route, run ledger replacing D3 heartbeat, health probe consuming surface-health, kill switch read before any invocation (capture.md:L205) / from unassigned: item-links DetailSurface type (surface modules) (capture.md:L205) |
| P1-08 | harness | runFamily, recordRun, FAMILIES, outcomeOf, the proof queries, readClient, readAll, readAllByIds, guardedUpdate, guardedUpdateByIds, guardedInsert, guardedInsertMany, guardedUpsert, guardedDelete, registerSource, reclassifyToSource, connectPg, loadEnv, revalidateTags (harness.md:L360) | from P1-01: core/db service client factory (harness.md:L361) / from P1-11: generated schema (primary keys, the new ledger table) (harness.md:L361) / from P1-05/06: system_state reads (P1-05/06 owns the pause readers per P1-01) (harness.md:L361) |
| P1-09 | flywheel-a | runConnectionDiscovery, discoverForItems, selectBriefCandidates, formatCandidateBlock, recordBriefTerms, buildAllConnectionRows, buildIntersectionView, assemblePairs, bandOf, computeThemeStats, CONVERGENCE_BANDS, resolveBriefForTheme, lineageFromThemeDelta, surfaceOf, surface tables, labelForScenario, labelForComplianceObject, corpusPass, tagPass, termPass (flywheel-a.md:L269) | from P1-03: closed field values from the brief contract module core/brief/vocab.ts (flywheel-a.md:L232) / from P1-10: entity spine as a discovery basis (shared_entity from entity_refs) (flywheel-a.md:L270) / from P1-16: shared_obligation as a discovery basis; computeAnticipatedTargets reads forward events (flywheel-a.md:L271) / from P1-08: the run artifact and the kill switch are the harness's (flywheel-a.md:L273) |
| P1-10 | flywheel-b | admissibleFor, effectiveConfidence, FLOOR, propagation types, registerDerivedValue, registerInferenceRecord, registerFirstInference, authorEdges, runPropagationDrain, fetchSupersededNotices, fireSignpost, evaluateSignpostPredicate, nextLifecycleState, getMethod, entityId, corridorSeed, parseCorridorName, assertEntityId, entityKindOf, KINDS, hostFromUrl, identifierRow, VALIDATORS, entity planners, linkItemEntities, linkItems, matchExistingSubject, congruence, sourceRole, planLinkWrites, partitionLineageWrites, planLineageGapTargets, LINEAGE_GAP_CREATED_BY, pairKey, getCachedCorridorScopes, getCachedCorridorsTouchingJurisdictions, formatCorridorLabel, formatCorridorLabelCompact, corrections model, loadSuppressedClaims, redactSuppressedClaims, corrections API, validateRowsFile, parseRow, writeOneRow (flywheel-b.md:L293) | from P1-09: link-items and mentions read flywheel-a's adopted-terms and adopted-entities (flywheel-b.md:L295) / from P1-08: run-propagation-drain.mjs, statutory harness family and record, harness-run-number.mjs, the ops runner the backfills move into; drain invoker is P1-08's to rule (flywheel-b.md:L298) / from P1-01: Supabase client type from core/db; core/db isUuid (flywheel-b.md:L104) |
| P1-12 | runtimes-a | runExport, runApply, fixture-db, budget (the kit), forwardEventKey, src/core/briefs/frontmatter, the record-briefs validator, src/core/flags/need-targets, the brief queue (runtimes-a.md:L296) | from P1-01: service client, guarded writes, readAll, readAllByIds (runtimes-a.md:L297) / from P1-05: rateSourceByInstitutionClass, hostOf, the class table, permanentlyUnregisteredClass, verdictPlacementForHost, registerSource (runtimes-a.md:L297) / from P1-07: pool rows of agent_run_searches, usableCapturesOrdered (runtimes-a.md:L297) / from P1-08: run ids, envelope, governing files, live-smoke landing (recordRun) (runtimes-a.md:L297) / from P1-09, P1-10: runUnscopedFlywheelSteps, discovery, forward-event extraction, lineage, entities, term recurrence (runtimes-a.md:L297) / from P1-03, P1-04: record-facts assertVerbatim, flywheel-defect (runtimes-a.md:L297) / from P1-14: groundBrief injected path, generateBriefFromInjected, sectionBrief, growSources, Gate A scanner, timeline parser (runtimes-a.md:L297) / from P1-15: none directly (runtimes-a.md:L297) / from P1-13: the ONE turn runtime src/features/turns/ (if P1-13 names the entry file differently, P1-13's name wins) (runtimes-a.md:L252) |
| P1-13 | runtimes-b | runTurn(stage, mode), planX, shapeX per stage, runUnscopedConnect(mode, ids), validateThemeBriefsFile, renderBriefMd, figureTokens, parseRamifications, SURFACE_HEADING, loadThemes, loadThemeMaterial, computeThemeGaps, buildThemeBundle, themesNeedingBrief, CLAIM_COLUMNS, EVENT_COLUMNS (runtimes-b.md:L237) | from P1-03, P1-04: consumePortalCandidates, selectCandidateLedgerPage, runIntakeCycle record-only, applyPromoteCap, drainChangeSweepUpdates, UPDATE_DRAIN_LIMIT, FIRST_FETCH_CLASSIFY_PROMPT_VERSION, CONTENT_MAX_CHARS, the verdict-to-classification shape (runtimes-b.md:L238) / from P1-05: walkEurlexOj, walkFederalRegister, walkFeed, walkSource, EUR_LEX_PORTAL_URL, celexTxtHtmlUrl, FEDERAL_REGISTER_PORTAL_URL, registerSource, institutionKey, runReconcilePass, the check-sources assessment, readScrapeState, scrapeWindowOpen, CHANGE_SWEEP_STAGED_MARKER, extractPortalLinks, parseFeedEntries, isErrorBody, sourceRole, congruence (runtimes-b.md:L238) / from P1-07: the fetch ladder, the capture worker, pending_first_fetch, snapshot storage (runtimes-b.md:L238) / from P1-08: runFamily, recordRun, FAMILIES with owner and downstream names, run ids, governing-file hashes, loop_run_id, history reads from harness_runs, INV-058 to INV-060 (runtimes-b.md:L238) / from P1-09, P1-10: discover-for-items, run-extraction and its apply, analyze-corpus, derive-obligations, tag-proposals, tag-ratification, trigger-questions, questions-on-change, prediction-scoring, the propagation drain, gaps, brief-staleness, theme-delta (runtimes-b.md:L238) / from P1-14: validate-mint-payload, record-facts-research, outcomes onto the slice's record, the mint chokepoint (runtimes-b.md:L238) / from P1-15: the "Data producers" upstream of the propagate stage (run-propagation-drain.mjs:506-510) (runtimes-b.md:L238) / from P1-01: fetchAllRows, exactCount, the guarded db writer (runtimes-b.md:L238) / from P1-12: the batch kinds and the export-corpus helpers (runtimes-b.md:L238) / from P1-05: change stage route logic P1-05 (runtimes-b.md:L174) |
| P1-14 | mint | runMint({limit, sourceId, celexPrefix, mode}), screenVerdictFor, isMintable, classifyRelevance, isHeld, healItem(id), healQuarantined(), reopenHolds(reasonContains) (mint.md:L233) | from P1-03/P1-04: resolveDocumentIdentity(row, source), buildRecordPayload, writeGroundingSequence, classifyMintOutcome, runMintEnrichment; mint-item.ts and the batch path become one mint function (mint.md:L234) / from P1-05: registerAndRate(url) (class-table tier, institution link), readSourceByUrl (mint.md:L235) / from P1-07: capture(url, {family, key}) returning text, title, transport and a hold reason; the one polite free transport (mint.md:L236) / from P1-08: one ledger row per mint run and per heal run, inputs, outputs, outcome (mint.md:L237) / from P1-09: connect(mintedIds) (tags, discovery, forward events, obligations, recluster) called by runMint in the same run; outcome counts on the mint's ledger row (mint.md:L238) / from P1-12/P1-13: dispatch of runMint and healQuarantined (manual while build mode holds the cadence off) (mint.md:L239) / from P1-01: fetchAllByIdChunks replaces fetchRowsIn; the service client (mint.md:L241) / from P1-04, P1-03: src/lib/intake/record-facts.mjs, record-facts-research.mjs, write-item.ts, mint-enrichment.ts; src/lib/agent/gate-a-scan.mjs, gate-a-match.mjs, section-markers.mjs (mint.md:L69) / from P1-20: src/lib/market/series-registry.mjs (mint.md:L69) / from P1-05/P1-07: src/lib/sources/identifier-variants.mjs, transport-escalation.mjs, pdf-extract.mjs, host-authority.ts (mint.md:L69) / from unassigned: src/lib/domains.ts; src/lib/coverage/identity.mjs (UK_TYPES); scripts/lib/* (db, run-artifact, loop-run-id, env-file, is-main, canonical-key, institution-key, eurlex-cellar, revalidate); scripts/harness-runs/governing-files.mjs (mint.md:L69) / from P1-09/P1-10: run.ts hands off to the flywheel (P1-09/10) with exactly the minted ids in the same run (mint.md:L209) |
| P1-15 | producers | runProducer, decideApply, planKeyedUpsert, writeProducerSummary, loadProducerRegistry, selectRuns, runRegistered, loadRowsFile, requireCitation, registerCitedSource, resolveEntityByName, parseOperatorRows, validateEntityRefs, csvRecords, aggregateHdvCsv, slugify, labelled, missing, spec09Label, openAlexGet, fetchWorkByDoi, searchOpenAlexWorks, readDrainSwitch, decideDrainSwitch, runSignpostStep, buildSignpostStepDeps, hydrateEventRows, signpostMetrics, generateTriggerQuestions, mainForQuestions, triggerQuestionsMain, runQuestionsOnChange, buildEntityItemsReader, readOutboxEvents, eventTypeForOutboxRow, KINDS, planDrain, finishDrain, authorMarketSeriesDeltaEdges, assertEdgesAuthoredAndRecordSummary, scoreSource, aggregateAuthorityDistribution, every calculator the panels import today, each producer's parser and spec (producers.md:L353) | from P1-01: service client factory, paginate (producers.md:L354) / from P1-12, P1-13: db.mjs guarded writers and registerSource, run-artifact, env-file, mutation-lease, institution-key, rate-source-by-class, host-verdict loader, RESIDUE_REASON, the six drain exporters as functions, question-answers data readers (producers.md:L354) / from P1-19, P1-20, P1-21: write-market-series plan and entity env, series-registry, series-deltas, oil-bulletin-workbook, refresh-published-price-statistics derivation, series-item-map, carrier-ets-surcharge-envelope, the four regional parsers and envelope builders, state-cost-facts-envelope, assess.mjs and surface-candidate (producers.md:L354) / from P1-09, P1-10: author-edges, market-series-delta method, signpost-watch's evaluate, fire and lifecycle, flag-namespaces, the outbox (producers.md:L354) / from P1-03, P1-04: mint-item chokepoint, record-facts, contracts/envelope, csv split retirement, domains (producers.md:L354) / from P1-14: item-type-required-slots, screen-rules shape for the theme rules (producers.md:L354) / from P1-05, P1-06: host-authority, institution, source-licence register for the licence block (producers.md:L354) / from P1-08: dispatcher steps for 17 producers, the drain plan and finish, the apply step per drain kind, the propagation drain and population flywheel that call the learning loop; kill switches and the fleet budget halt (producers.md:L354) / from P1-03, P1-04: a direct import of mint-item in the TypeScript tree (P1-03/04 owns mint-item) (producers.md:L290) / from P1-01: the P1-01 service client factory (replaces raw createClient in research-assessment-producer) (producers.md:L291) / from P1-08: kinds carry a dispatcher step id (P1-08) instead of a workflow filename (producers.md:L132) |
| P1-16 | obligations | extractForwardEvents, EXTRACTOR_VERSION, isDueDateSlotClaim, locateCalendarDate, readExtractionInput, readAndExtractForwardEvents, mapClaimRow, mapSectionRow, attachDueDateContext, itemIdsNeedingContext, usableCapturesOrdered, CLAIM_KIND_FILTER, insertForwardEvents, pickComplianceDeadline, syncComplianceDeadline, classifyItemBindingPosition, BINDING_POSITION_RULES (as data), deriveRegister, deriveObligationObjects, fetchObligationRegisterPage, fetchRegisterFacetOptions, fetchForwardEventCount, emptyRegisterFacets, UNCLASSIFIED, DUE_WINDOWS, readUpcoming, resolveScope, scopeLabel, defaultJurisdictionFilter, selectObligationRailRows, daysFrom, OBLIGATION_RAIL_ROW_CAP, EVENT_KINDS, DEFAULT_KINDS, KIND_LABELS, the two GET handlers, the three jobs (obligations.md:L242) | from P1-01: createSupabaseServerClient, checkRateLimit, clientKey, fetchAllRows, exactCount, fetchAllByIdChunks, isUuid, resolveItemId, getServiceSupabase for the SSR seed (obligations.md:L243) / from P1-02: getWorkspaceProfile, resolveOrgIdFromCookies (obligations.md:L243) / from P1-03: [due_date], [binding_position], [jurisdictional_scope] slot templates as shared constants (obligations.md:L243) / from P1-04: vocabularies: BINDING_POSITION, DUTY_HOLDER_CLASSES, LEG_MODE_CODES, normaliseMode, GENERIC_JURISDICTIONS; relevance.mjs currentObligationObjects, dutyHoldersExcludeForwarder; entity-id (obligations.md:L243) / from P1-08: run-artifact envelope, claimRunId, governing files; the forward-events and date-chain families (obligations.md:L243) / from unassigned: scripts db layer (readAll, readAllByIds, guardedInsertMany, guardedUpdate, readClient); telemetry withErrorCapture (obligations.md:L243) / from P1-08: jobs run-extraction after P1-08's envelope exists (obligations.md:L287) |
| P1-17 | ui-kit | Absence, pickAbsenceReason, NEEDS_PHRASE, ABSENCE_TEXT_STYLE, ActionCard, ActionRow, ActionButton, shareResource, downloadMarkdownBrief, BandGradientRule, BandGroupHeader, BandTile, BandTileRow, BandProvider, useBandContext, BiasChips, BiasLegend, Button, CardFoot, BandChip, TierChip, TagChip, WorkspaceTagPill, FilterChipGroup, FilterChip, GradeChip, CoverageState, DetailSubSection, Dialog, ErrorState, FactCard, ClaimTierProvider, FilePickRow, ImpactMeter, isImpactScored, InlineErrorBanner, ItemGroup, MoreBelowDisclosure, ListRow, ListRowHeader, Masthead, Menu, MilestoneTimeline, classifyTimelineEntries, RailCard, RelativeTime, RowTable, RowTableAction, RowTableOverflow, SectionCard, SectionHead, SectionIndex, SummaryDepthSwitch, SectionLabel, SkeletonListRow, SkeletonBandTile, SkeletonStatBlock, SkeletonRailDateRow, SkeletonPage, skeletonBox, SourceLink, StatBlock, StateNote, SystemErrorBanner, TabRow, Timeline, Toast, WatchToggle, cn, tint, tokens (theme.css), base.css (ui-kit.md:L320) | from unassigned: lib/urgency/bands (BAND_ORDER, bandFromPriority; owner P1-19..24 or core, id owed) (ui-kit.md:L321) / from P1-05: lib/customer-source-tier and lib/tier-labels (SOURCE_TIER_MAX, TIER_LABELS: P1-05 sources-a or core) (ui-kit.md:L321) / from P1-05/06: bias-display.mjs, chip-selection.mjs, bias-tag-pipeline.mjs BIAS_TAG_VOCAB and HIGH_CONFIDENCE_THRESHOLD (ui-kit.md:L321) / from P1-19..24: lib/detail/timeline-math, fact-card-model, section-index-data, use-section-scroll-spy (ui-kit.md:L321) / from unassigned: types/resource, lib/format, lib/agent/parse-record-sections, lib/operations/region-grid.mjs, lib/entities/host-from-url.mjs, lib/coverage/coverage-state.mjs, core/time/iso-week, lib/render-now (ui-kit.md:L321) |
| P1-18 | shell-list | AppShell, PageFrame, Sheet, ScrollContainer context, BackToTop, identity-seed, useBootstrap, useAdminAttention, useUnreadCount, getNavCounts, navTitleForPath, ListSurface and its slots, FiltersRailCard, LegendRailCard, SortRow, facets, filter-sort, url-state, useListRows, ThemeStrip, readListing, mapRows, counts, category reads, pagination and cursor, toListRowFields, itemDetailHref, format, render-now, htmlToText, splitCsv, fallback guard, the revalidate route (shell-list.md:L326) | from P1-17: Masthead with command-bar slot, Dialog, BandTile, BandTileRow, BandGroupHeader, ListRow, SectionCard, StateNote, FilterChip and FilterChipGroup, Skeletons, RailCard, ImpactMeter, BandGradientRule, Absence, ErrorState, a dialog primitive if any, tokens (shell-list.md:L327) / from P1-01: useAuth (user, identityStatus, isPlatformAdmin, retryIdentity, signOut), UserMenu, authedFetch, core/db clients (shell-list.md:L327) / from P1-02: workspaceStore orgName and userRole, resourceStore setOverrides, setPersonalState and mergeWithOverrides, the bootstrap route and its types (shell-list.md:L327) / from P1-07: GlobalErrorReporter, reportClientError, core/cache/tags.ts (shell-list.md:L327) / from P1-22/23: notifications route (shell-list.md:L327) / from P1-25/26: attention route (shell-list.md:L327) / from P1-01: getServiceSupabase, route-guard, rate-limit, worker-auth, authHeaders (shell-list.md:L102) / from unassigned: components/ledger: VirtualizedRowList (shell-list.md:L102) / from P1-02: /api/workspace/bootstrap (shell-list.md:L105) / from P1-25/26: /api/admin/attention (shell-list.md:L105) / from P1-22/23: /api/community/notifications (shell-list.md:L105) |
| P1-19 | regulations | loadDetail, applyIdRedirect, readDetailItem, readCrossPage, readFreshInferences, readThemeChips, fetchClaimTierMap, isItemUuid, itemIdColumn, deriveFactCardModels, mergeAdjacentSameKind, deriveRecordFactCardModel, withClaimTiers, parseFactParagraphs, parseRecordSections, splitKeyDateFacts, parseSourcesSection, classifyMilestones, collapseTimeline, nextMilestoneClause, mergeObligationEvents, formatTrajectoryStep, section index tables, readCustomerInferences, currentInferenceRows, pickVisibleInferences, the detail shell parts, SourcesGrid, RecordFacts, CrossPageSection, FactBlocks, the collab blocks, isoToDisplayLabel, jurisLabelOf, jurisdiction tiers, computeApplicability, computeStatutory (regulations.md:L384) | from P1-17: ActionCard, Timeline, SectionIndex with depth switch and scroll spy, Masthead with actionSlot and connectionsSlot, FactCard, ItemGroup, StateNote, Absence, CoverageState, ListRow, FilterChip, RailCard, LegendRailCard, list-surface shell, sort row, facet hook, remainder fetch with an error state, RowOverflowMenu, WatchButton, BiasChips, GfmSection (regulations.md:L385) / from P1-18: ItemConnectionsCard, RelevanceBadgeClient using useItemRelevance, ThemeStrip, NoticesRail (regulations.md:L385) / from P1-16: register read, upcoming read, kind labels, event date format, the obligations routes (regulations.md:L385) / from P1-09: connection view model, theme-brief view, resolveItemUuid as the one identity helper (regulations.md:L385) / from P1-02: overrides store, owner, personal state, roster bootstrap, tags facet, viewer relevance, notes and assignment routes (regulations.md:L385) / from P1-01: service and cookie clients, cookie org resolution, rate limit, authed fetch (regulations.md:L385) / from P1-05: customer tier, bias display, url canonicaliser (regulations.md:L385) / from unassigned: corrections (suppressed claims) (regulations.md:L385) / from P1-15: none read directly; cost-slot entries in the binding banner come from producer-filled obligation objects [HYPOTHESIS on the producer id] (regulations.md:L385) / from P1-04: one typed TRANSPORT_MODES accessor in contracts/vocabularies (P1-04 owns it) (regulations.md:L192) / from P1-01: isUuid from core/db (regulations.md:L189) / from P1-09: surfaceOf(item) from the routing module P1-09 plans (core/routing/surface.ts) (regulations.md:L188) |
| P1-20 | market | buildSeriesBoard, computeSeriesDeltas, deriveSeriesFreshness, producerFor, isImplementedSeriesKey, carbonIntensity, formatFigure, formatRange, figure components, NoticesRail, useRecalculationNotices, adopted-vocabulary loader (market.md:L292) | from P1-18: Masthead, ThemeStrip, CoverageDenominatorLine, page frame (market.md:L293) / from P1-17: SectionCard, SectionHeading, Absence and ABSENCE_TEXT_STYLE, CoverageState, RailCard, WatchButton, a Tile primitive, the SpecPanel shell, skeleton-page, tokens for every hex (market.md:L293) / from unassigned: list-surface (ListSurfaceShell, rail cards, sort row, facet helpers, useListSurfaceFilter) whose owner the coordinator names (market.md:L293) / from P1-15: everything that writes market_series and published_price_statistics; the moved parsers and planners (market.md:L293) / from P1-09: derivation edges INV-045, propagation admissibleFor, fetchSupersededNotices, the /api/notices route (market.md:L293) / from P1-05: the source rating every market figure must show (rule 18); data_sources and the institution class table for carrier hosts (market.md:L293) / from P1-01: isUuid, clients, resolveOrgIdFromCookies for the indexation panel (market.md:L293) / from unassigned: entities (corridor-scope parser and cache, unlocode names) (market.md:L293) / from P1-19: the regulations module (UpcomingObligationsStrip) (market.md:L293) / from unassigned: the detail lane (loadDetail, applyIdRedirect, fetchClaimTierMap, buildResourceLookup) (market.md:L293) / from P1-04: @/lib/contracts/envelope.mjs, vocabularies.mjs, verbatim-grounding.mjs (market.md:L98) / from P1-05: features/market/read.ts after the source-rating read from P1-05 exists (market.md:L328) |
| P1-21 | research-ops | assessItem and the authority helpers, the ingest parsers, buildEnvelopeRow, buildStateCostFactRow, planUpsert, originClassForTier, the dimension keys, buildRegionGrid, isEnvelopedFact, indexAgainstBase, factHeadline, originClassLabel, derivationLabel, sourceUrlFromNote, sourceNameFromNote, SEVERITY_COLUMN_TO_KEY, theme-view, buildOperationsAskContext, relatedItems (proposed) (research-ops.md:L304) | from P1-17: ListSurfaceShell parts, ListRow, RailCard, LegendRailCard, SectionCard, SectionHeading, FactCard matrix density, Absence and CoverageState vocabulary, TierChip, TagChip, GradeChip, SourceLink, StateNote, skeleton (research-ops.md:L305) / from P1-18: ThemeStrip mount, the detail shell DetailMasthead, DetailRail, SectionIndex, ActionCard, ItemConnectionsCard, CrossPageSection, NoticesRail (research-ops.md:L305) / from P1-09: connection-view-model SURFACE_LABELS/SURFACE_ORDER, brief-staleness resolveBriefForTheme, tag-labels, theme-briefs schema's parseRamifications and SURFACE_HEADING (must move out of scripts/) (research-ops.md:L305) / from P1-10: propagation outbox and entity spine signposts watch, lifecycle_state written by the signpost watcher, prediction scoring; every regulation-to-operations comparison spec 04 section 8 assigns to the flywheel (research-ops.md:L305) / from P1-15: research-assessment producer writes research_assessments and signposts; regional producers write regional_data_facts and state_cost_facts; spec-09 producers write auxiliary_energy_profiles and grid_connection_queues (research-ops.md:L305) / from P1-05: customer source tier, the source registry rows the facts embed (research-ops.md:L305) / from P1-01: service client, resolveOrgIdFromCookies for the auxiliary panel (research-ops.md:L305) / from P1-02: workspace tags facet, watch, priority actions (research-ops.md:L305) / from unassigned: the surface-of rule table (surfaceOf, migration 269) for admission (research-ops.md:L305) / from P1-10: regulation-to-operations joins produced by P1-10 for every regulation, landing as derived values this module only reads (research-ops.md:L306) |
| P1-22 | community-a | the Community UI pages' components, communityApi, AuthorIdentity, Avatar, RoleChip, formatAuthorIdentity/authorIdentityLabel, validateEntityBinding (community-a.md:L257) | from P1-23: every route this module calls; fix the three page wiring defects ([slug]:206 and moderation:69 pass no toast; no page renders the invitation panel) (community-a.md:L252) / from P1-23: replace the two browser-client writes with routes (leave has DELETE /groups/[id]/members; cite needs a route); author_identity on replies; an entity search endpoint for EntityPicker; paging on moderation reports; one regions module (MEA vs MEAF) (community-a.md:L252) / from P1-17: Dialog, ConfirmDialog, Toast, Button, Input, Select, responsive row, Masthead, SectionCard, SectionHeading, CardFoot, RowTable, Absence, tokens (community-a.md:L253) / from P1-18: a surface-nav slot so Community's sidebar replaces the global one without CSS injection; notifications bell and list as platform chrome with one poller (community-a.md:L254) / from P1-01: createSupabaseServerClient, createSupabaseBrowserClient, requireCommunityRoute; the LinkedIn verification feature recorded in auth-db.md section 8 lands here (community-a.md:L255) / from P1-02: workspace role ("Owner" chip reads workspace owner), /profile links (community-a.md:L256) |
| P1-23 | community-b | communityViewer, authorIdForRow, identity loaders, validateEntityIds, ORG_TYPES, REGIONS with labels, isRoomMember, RoomKey, route contracts every P1-22 component calls (community-b.md:L336) | from P1-01: requireUser replacing requireCommunityRoute, isUuid, rateLimitHeaders, getServiceSupabase, createSupabaseServerClient, readOwnPlatformAdmin, isPlatformAdmin, resolveMembership, fetchAllRows, assertBound (community-b.md:L337) / from P1-02: getListingsOnly through the surface read module, org_watchlist for notices (community-b.md:L337) / from P1-07: dispatchNotification, the error sink for page timings and the seed fallback (sendInvitationEmail not used) (community-b.md:L337) / from P1-10: fetchSupersededNotices, entityKindOf; computeDominanceShare NOT needed (community-b.md:L337) / from P1-11: the rpcs, table and columns listed under Data model (community-b.md:L337) / from P1-17: Masthead, SectionHeader, SystemErrorBanner (community-b.md:L337) / from P1-22: every component the pages mount (community-b.md:L337) |
| P1-24 | dash-search | readDashboard, buildDueNextRows, buildChangedRows, selectBriefResources, computeAuditDate, briefCardState, dueInfo, jurisdictionCode, metaLine, getSurfaceCounts, readWatchlist, WatchlistItem, WatchlistItemType, WatchlistScope, WATCHLIST_PAGE_LIMIT, watchlistHref, WATCHLIST_TYPE_LABEL, isTeamOnlyWatchType, isTeamOnlyScopeViolation, lookupWatchMembership, getClientWatchMembership, runSearch, SearchResultRow, useItemSearch, createPortfolioRequest and four other calls, computeRollup, readPortfolioIndex, readPortfolioDetail, bandFromPriority, BAND_ORDER, classifyByDays, scoreResource, getJurisdiction, cachedRead, APP_DATA_TAG, PUBLIC_ITEMS_TAG, describeFallbackTrigger (dash-search.md:L274) | from P1-01: requireUserRoute, isRefusal, rateLimitHeaders, resolveOrgIdFromCookies, resolveOrgIdFromUserId, requireOrgWriter, getServiceSupabase, createSupabaseServerClient, authedFetch, authHeaders, fetchAllRows, isUuid (dash-search.md:L275) / from P1-17: ListRow, ListRowColumnHeader, BandTile, BandTileRow, SectionCard, SectionHeading, CardFoot, StateNote, StatBlock, RailCard, Skeleton, Absence, Masthead with CommandBar, Button, TextInput, InlineErrorBanner, RowTable, RelativeTime, WatchButton, PriorityDropdown or RowActionsMenu, CoverageState, formatLocaleDate, formatNumber, countNoun, tokens (dash-search.md:L275) / from P1-18: PageFrame, LIST_SURFACE_MOBILE_CSS, the surface vocabulary, renderNowIso/nowFrom, AppShell mounting the Assistant panel, useAuth, nav counts consuming getSurfaceCounts (dash-search.md:L275) / from P1-19..23: toListRowFields, watchTypeForItem, itemDetailHref, canonicalSurfaceForItem, surfaceOf, BAND_FACET_PARAM, SORT_FACET_PARAM, withListPosition, FiltersRailCard, LegendRailCard, ListSurfaceFacetGroup, enrichRowSourceChips, fetchChangelog or item_changelog read, mapWorkspaceItemRows, fetchThemeChips, buildThemeChips, customerSourceTier, tierScaleSpan, tierLabelOf, useRecalculationNotices, RecalculationNotice, coverage lib (getCoverageMatrix ... CoveragePageView), parseCorridorCanonicalName, formatCorridorLabel, ORIGIN_CLASS, weakestOriginClass, loadSuppressedClaims, redactSuppressedClaims, buildOperationsAskContext, ENVIRONMENTAL_POLICY_SKILL_CORE as passages (dash-search.md:L275) / from P1-02: workspaceStore (orgName, sectorProfile, jurisdictionWeights, userRole), useWorkspaceBootstrap, useWorkspaceTagsFacet, /api/workspace/portfolios routes, /api/workspace/bootstrap (dash-search.md:L275) / from P1-05: readScrapeState for the rule-16 window (P1-05/06) (dash-search.md:L275) / from P1-06: readScrapeState for the rule-16 window (P1-05/06) (dash-search.md:L275) / from P1-16: getPublicObligationRegisterFirstPage leaves data.ts for that module (dash-search.md:L275) / from unassigned: telemetry (captureError, withErrorCapture, recordSeedFallbackFlag) (dash-search.md:L275) / from P1-01: lib/cache/fallback-guard.ts (P1-01 owns the file) (dash-search.md:L229) |
| P1-25 | admin-a | AdminConsole, ItemCorrectionsPanel, loadItemTargets, InferenceReview (inside RuntimeViews), UpcomingObligationsPanel, panel kit, useAdminFetch, IssueNavTarget (admin-a.md:L324) | from P1-17: Button, SectionCard with a head slot, StatBlock, RowTable, TabRow, Masthead, RailCard, Absence, FilePickRow, InlineErrorBanner, RelativeTime, Dialog, TextInput, TextArea, FilterChip, VirtualizedRowList, InferenceClaim (admin-a.md:L325) / from P1-18: the admin nav flag and the attention poller useAdminAttention (admin-a.md:L325) / from P1-01: authedFetch, authHeaders, org and member row types, fetchAllRows, fetchAllByIdChunks (admin-a.md:L325) / from P1-02: workspaceStore.orgId; the one MembersPanel for the Workspaces section; memberDisplayName belongs with the membership types (admin-a.md:L325) / from P1-05/P1-06: sourceStore and SourceHealthDashboard, tier-override route, classTierForHost, core/fetch/direct, coverage route and CoverageEntry types (admin-a.md:L325) / from P1-04: record-only cycle behind run-intake, deterministic classifier for jurisdiction review, TAG_COLUMNS, EDGE_RELATIONSHIPS, validateCorrectionInput (admin-a.md:L325) / from P1-07: re-capture action behind brief flags (admin-a.md:L325) / from P1-16: formatEventDate (admin-a.md:L325) / from P1-26: every /api/admin/* route named, the /admin pages, the thirteen /admin/parts/* pages (admin-a.md:L325) / from P1-12/P1-13: free sweep and research walker apply path dispatched from DispatchPanel with a topic filter (admin-a.md:L257) / from P1-03: free grounding over stored snapshot (cheap-verify, record-only) for re-ground (admin-a.md:L258) / from P1-08: harness_runs for masthead run count (admin-a.md:L261) / from P1-01: one OrgMemberRow and one OrgRow from P1-01's membership module (admin-a.md:L144) |
| P1-26 | admin-b | every /api/admin route in the register (HTTP); useAdminAttention and bootstrap read the attention entry; live smoke probes /api/admin/coverage and /api/admin/integrity-flags (admin-b.md:L393) / fetchAttentionCounts, EMPTY_COUNTS, AttentionCounts, fetchSourceData, memberDisplayName, PROVISIONAL_REVIEW_STATUSES, loadPartEntries (admin-b.md:L394) | from P1-01: requireAdmin, isRefusal, workerAuthGuard, checkRateLimit, rateLimitHeaders, getServiceSupabase, createSupabaseServerClient, requirePlatformAdmin, fetchAllRows, fetchAllByIdChunks, isUuid (admin-b.md:L395) / from P1-05: classTierForHost and name rules, classifySourceRole, checkVerticalFitGate, buildPromotedSourceRow, findExistingSourceByCanonicalUrl, canonicalizeUrl, notUnderTierOverride, bias-tag vocabulary and writeBiasTags, classifyReachability, decideFetchOutcome, nextScrapeDate, pausedResponse, isGloballyPaused, getScrapeState, deterministic source classifier (admin-b.md:L395) / from P1-04: runIntakeCycle with free record-only apply; Axis 3/4/5 classifiers for domains and jurisdictions (admin-b.md:L395) / from P1-07: free fetch primitive and assertFetchAllowed for fetch-now (admin-b.md:L395) / from P1-13/P1-14: turn runtime that consumes corpus_turn_requests, including the regeneration request (admin-b.md:L395) / from P1-08: statutory family's artifact convention; retirement of the spot-check-monthly family (admin-b.md:L395) / from unassigned: lib/corrections/admin-api/handlers (owner lane unknown) (admin-b.md:L395) / from P1-09: lib/connections (pair-view, theme-stats, brief-staleness) (admin-b.md:L395) / from P1-09 or P1-13: lib/propagation/statutory-rows (admin-b.md:L395) / from unassigned: lib/jurisdictions (iso, tiers), lib/detail/inference-view.mjs, lib/telemetry/capture-error, lib/d3/hooks.mjs (admin-b.md:L395) / from P1-17: Masthead, PageMasthead, SectionCard, the table, the parts and every fixture the galleries render (admin-b.md:L395) / from P1-18: Sidebar for the nav-card gallery; nav row for /admin/inferences (admin-b.md:L395) / from P1-05: P1-05's Source type for read/sources.ts (admin-b.md:L434) |

### D.2 Consumers each register names for itself

| lane | consumer lane | what it consumes | cite |
|---|---|---|---|
| P1-01 | P1-25/P1-26 | requireAdminRoute 40 routes, isPlatformAdmin 19, requirePlatformAdmin 26 pages | auth-db.md:L279 |
| P1-01 | P1-22/P1-23 | requireCommunityRoute 37 routes, resolveOrgIdFromUserId | auth-db.md:L279 |
| P1-01 | P1-02 | requireOrgWriter 7 routes, resolveOrgIdFromCookies 17, fetchDashboardData and list fetchers via data.ts | auth-db.md:L279 |
| P1-01 | P1-05/P1-06 | pausedResponse 4, getScrapeState, isGloballyPaused, workerAuthGuard 8 | auth-db.md:L279 |
| P1-02 | P1-18 | useWorkspaceBootstrap, usePersonalState, Sidebar, AppShell, DashboardMasthead read the stores and bootstrap bundle | workspace.md:L298 |
| P1-02 | P1-24 / P1-19..23 surfaces | mergeWithOverrides (RegulationsLedger, api/listings/cursor); ArchiveDialog and item-state store (RegulationDetailSurface); collab routes and itemIdFromDetailPath (DetailShell, ItemNotesBlock, ItemAssignBlock); lens (RelevanceBadge, load-detail, api/detail/relevance); bootstrap.members (OwnerTeamCard) | workspace.md:L298 |
| P1-02 | P1-22/23 | community reads profiles.jurisdiction_overrides, sector_overrides; AskAssistant reads jurisdictionWeights | workspace.md:L298 |
| P1-02 | P1-25/26 | AdminDashboard and SourceHealthDashboard read sourceStore and types/source; admin/redesign/MembersPanel second members panel | workspace.md:L298 |
| P1-02 | unassigned | scripts/obligations (the two pure helpers) | workspace.md:L298 |
| P1-02 | P1-05/06 | sourceStore and types/source handed over | workspace.md:L273 |
| P1-03 | P1-04 | write-item.ts, mint-item.ts, portal-harvest.ts, record-facts.mjs; run-intake-cycle.ts starts the workflow | intake-a.md:L360 |
| P1-03 | P1-05 | fetch-hold, holdings-audit, null-tier-host-worklist, recommend-source-tier, seek-more, verification, source-growth, target-match, officialness, host-authority | intake-a.md:L360 |
| P1-03 | P1-09 | term-needs.mjs | intake-a.md:L360 |
| P1-03 | unassigned | the five surfaces' read layer (SourcesGrid, primitives, GfmSection, FactCard, IntelligenceBrief, IntelligenceMetadataStrip, the four detail surfaces and pages, fact-card-model, fact-paragraphs, load-detail-core): the parsers and sectionBrief | intake-a.md:L360 |
| P1-03 | P1-25/P1-26 | health/spend, scan, the three classification routes, spot-check/recurring, b2-progress, CanonicalSourceReview, ProvisionalReviewCard: metered helpers and readSpendGauge | intake-a.md:L360 |
| P1-03 | unassigned | the assistant route (api/ask: skill-loader, operations-ask-context) | intake-a.md:L360 |
| P1-03 | unassigned | scripts in the reading set (turns/record-briefs, turns/apply-record-briefs, mint/*, backfill-item-timelines, research/backfill-themes) | intake-a.md:L360 |
| P1-03 | unassigned | 41 out-of-scope importers of scope modules [CONFIRMED: import-path grep] | intake-a.md:L90 |
| P1-03 | P1-04 | generate-brief workflow: src/lib/intake/run-intake-cycle.ts (plus api/agent/run/route.ts, supabase/seed/b2-runner.mjs) | intake-a.md:L227 |
| P1-03 | unassigned | api/agent/run route: admin UI start sites (not isolated this session) [HYPOTHESIS] | intake-a.md:L228 |
| P1-03 | P1-04 | metadata-vocab toDbSeverity: src/lib/intake/portal-harvest.ts | intake-a.md:L231 |
| P1-03 | P1-05, P1-09 | authorityFloorFor 6 outside (term-needs, officialness, holdings-audit, free-pass), authorityFloorForFact 2 | intake-a.md:L257 |
| P1-03 | P1-25 | spend-gauge readSpendGauge: api/health/spend/route.ts, logic.ts | intake-a.md:L286 |
| P1-03 | P1-04 | first-fetch-classify: portal-harvest.ts (P1-04), inconclusive-probe.mjs, run-ledger-consume.mjs | intake-a.md:L290 |
| P1-03 | P1-05 | haiku-classify: src/lib/sources/verification.ts | intake-a.md:L291 |
| P1-03 | unassigned | skill-loader: src/app/api/ask/route.ts | intake-a.md:L292 |
| P1-03 | P1-04 | core/intake/classify-verdict.ts consumed by P1-04 intake-b and the verdict-file driver | intake-a.md:L331 |
| P1-03 | unassigned | operations-matrix: src/app/operations/[slug]/page.tsx | intake-a.md:L242 |
| P1-04 | P1-19, P1-20, P1-21 | vocabularies in 21 files, envelope in 9: Market ribbon, obligation register, portfolio, list surfaces, series freshness, operations region grid, supabase-server | intake-b.md:L250 |
| P1-04 | P1-03 | write-item, mint, the cycle as a caller of the workflow | intake-b.md:L250 |
| P1-04 | unassigned | scripts/mint, scripts/turns, scripts/research runtimes (record-facts, write-item, mint-enrichment, research-walker dry mint); their Part 1 owner is not named in the brief | intake-b.md:L250 |
| P1-04 | P1-05 | portal persist from check-sources, change-sweep drain from run-change-detection | intake-b.md:L250 |
| P1-04 | P1-25/P1-26 | admin run-intake route | intake-b.md:L250 |
| P1-04 | P1-03 | write-item.ts: canonical-pipeline.ts, heal-provenance.mjs, apply-mint-batch.mjs | intake-b.md:L182 |
| P1-04 | P1-15 | verbatim-grounding re-export shims: regional/state-cost-facts-envelope.mjs, market/carrier-ets-surcharge-envelope.mjs | intake-b.md:L186 |
| P1-05 | P1-03/04 | resolver, class table, registration and growth, cited-host gate, target match, officialness, holdings gate, ladder, candidates, exhaustion row, hold, error-body partition, snapshot-first verify | sources-a.md:L339 |
| P1-05 | P1-06 | check-sources, fetch-now, bulk-import, promote, recommend-tier, recompute-trust, commit-tier-change, canonical-sources routes; source-sweep, change-detection, ledger-consume scripts [HYPOTHESIS] | sources-a.md:L339 |
| P1-05 | P1-07 | fetch primitive and capture verdict | sources-a.md:L339 |
| P1-05 | P1-09 | term-recurrence.mjs imports trust.ts; statutory-rows.ts imports host-authority | sources-a.md:L339 |
| P1-05 | P1-17 | BiasChips, Chips, DetailShell, ListSurfaceRailCards, DashboardBrief, SourceTierLegend, AskAssistant, SourcesGrid read tier and bias display | sources-a.md:L339 |
| P1-05 | P1-25/26 | the admin source routes | sources-a.md:L339 |
| P1-06 | P1-17 | describeCoverageState, COVERAGE_ACTION (CoverageState); requestCoverageRequest, fetchCoverageSummary, downloadCoverageCsv | sources-b.md:L252 |
| P1-06 | P1-24 | getCoverageMatrix, getSurfaceDenominator, getCoverageEntries, getCoverageIndex | sources-b.md:L252 |
| P1-06 | P1-19 | getSurfaceDenominator etc. (regulations page) | sources-b.md:L252 |
| P1-06 | P1-20 / P1-21 | denominator line on market, operations, research pages | sources-b.md:L252 |
| P1-06 | P1-07 | classifyIdentifier, UK_TYPES (capture and mint) | sources-b.md:L252 |
| P1-06 | P1-14 | classifyIdentifier, UK_TYPES (mint) | sources-b.md:L252 |
| P1-06 | P1-25/26 | admin source surfaces mount through SourceRegistryCard; admin CoverageCatalogueView | sources-b.md:L252 |
| P1-07 | P1-05 | fetchDocument for fetch-now and verification | capture.md:L204 |
| P1-07 | P1-03 | fetchDocument for capture-to-mint path; cache tags and fallback guard for the apply step | capture.md:L204 |
| P1-07 | P1-08 | fetchDocument for the triage script; runChangeDetection; evaluateSurface, overallOk, seedLeak, ALL_SURFACES | capture.md:L204 |
| P1-07 | P1-18 | reportClientError, GlobalErrorReporter for layout.tsx and error.tsx | capture.md:L204 |
| P1-07 | P1-02 | timePhase, recordSerializedBytes, withServerTiming, PERF_PHASES (bootstrap route); dispatchNotification, NotificationKind | capture.md:L204 |
| P1-07 | P1-01 | sendInvitationEmail (invitations route) | capture.md:L204 |
| P1-07 | P1-22/P1-23 | dispatchNotification, NotificationKind | capture.md:L204 |
| P1-07 | unassigned | slugsOrEmpty (four detail pages, surface modules); cache tags and fallback guard (surface read layer); captureError (every route, surface read layer) | capture.md:L204 |
| P1-08 | P1-03/04 | mint, ledger-consume, source-sweep, brief-apply, brief-export, gate-a-rescan, structured-actions run as families; own canonical-key, eurlex-cellar, free-pass, changelog, Gate A writer | harness.md:L362 |
| P1-08 | P1-09/10 | downstream-chain, propagation, question-answers, theme-briefs, corpus-turn, forward-events, date-chain, statutory; tag propose and ratify, edge authorship, timeline resolver | harness.md:L362 |
| P1-08 | P1-12..15 | fetch-drain, change-detection, judgement-drain, quarantine-disposition, producers, research-assessment; leases, deferrals, DESNZ producer | harness.md:L362 |
| P1-08 | P1-05/06 | research-walker, source-resolution, source-monitoring, inaccessible-triage, needs-search, spot-check; resolve-provisional, autoverify, verdicts, rate-by-class | harness.md:L362 |
| P1-08 | P1-11 | the ledger migration, generated keys, migration-history tools | harness.md:L362 |
| P1-09 | P1-03 | runConnectionDiscovery after every mint and update; selectBriefCandidates, formatCandidateBlock; recordBriefTerms; shared vocabulary module (P1-03/04 intake) | flywheel-a.md:L269 |
| P1-09 | P1-04 | as P1-03 (P1-03/04 intake) | flywheel-a.md:L269 |
| P1-09 | P1-16 | forward-event-format moves there | flywheel-a.md:L271 |
| P1-09 | P1-19 | buildAllConnectionRows, buildIntersectionView, assemblePairs, bandOf, computeThemeStats, CONVERGENCE_BANDS, resolveBriefForTheme, lineageFromThemeDelta, surfaceOf and surface tables, labelForScenario, labelForComplianceObject (P1-19 to P1-24 surfaces) | flywheel-a.md:L272 |
| P1-09 | P1-20 | as P1-19 (P1-19 to P1-24 surfaces) | flywheel-a.md:L272 |
| P1-09 | P1-21 | as P1-19 (P1-19 to P1-24 surfaces) | flywheel-a.md:L272 |
| P1-09 | P1-22 | Community reads nothing from this module and writes nothing into it (only memberDisplayName, which moves to the admin helper) | flywheel-a.md:L272 |
| P1-09 | P1-23 | as P1-19 (P1-19 to P1-24 surfaces) | flywheel-a.md:L272 |
| P1-09 | P1-24 | as P1-19 (P1-19 to P1-24 surfaces) | flywheel-a.md:L272 |
| P1-09 | P1-08 | every pass is a deps-injected function with a dry flag returning counts and writing outcome into the run artifact | flywheel-a.md:L273 |
| P1-09 | P1-02 | src/lib/tags (five files) MOVED to the workspace module | flywheel-a.md:L87 |
| P1-10 | P1-03 | mint-item.ts calls linkItems, linkItemEntities, matchExistingSubject, congruence, sourceRole; apply-staged-update.ts linkItemEntities; record-facts.mjs CORRIDOR_ID_SCHEME; intake-url-corpus.mjs matchExistingSubject (P1-03/04) | flywheel-b.md:L294 |
| P1-10 | P1-04 | as P1-03 (P1-03/04 intake) | flywheel-b.md:L294 |
| P1-10 | P1-09 | write-edges and tag writers read corrections model (isPairTombstoned, removedTagsFor, filterTagProposals); term-needs and raise-term-needs read VALIDATORS and planLineageGapTargets | flywheel-b.md:L295 |
| P1-10 | P1-16 | derive-obligation-objects.mjs mints obligation entities with entityId; statutory rows mint FuelEU obligation entity; "one corridor, five answers" obligation count belongs to P1-16 | flywheel-b.md:L296 |
| P1-10 | P1-21 | Operations detail mounts NoticesRail; state-cost-facts-producer.mjs imports entity planners and prior-state sets | flywheel-b.md:L297 |
| P1-10 | P1-15 | emission-factors-common.mjs and author-market-series-delta.mjs call authorEdges; ukpn and research-assessment producers and market-series entity backfill call entityId or runBackfill | flywheel-b.md:L299 |
| P1-10 | P1-22 | computeDominanceShare, entityKindOf in threads route, entity-binding (P1-22/23) | flywheel-b.md:L300 |
| P1-10 | P1-23 | computeDominanceShare, entityKindOf in threads route, entity-binding (P1-22/23) | flywheel-b.md:L300 |
| P1-10 | P1-25 | corrections routes and panels, statutory upload (P1-25/26) | flywheel-b.md:L300 |
| P1-10 | P1-26 | corrections routes and panels, statutory upload (P1-25/26) | flywheel-b.md:L300 |
| P1-10 | unassigned | detail read (load-detail, ask: suppressed claims) | flywheel-b.md:L300 |
| P1-10 | unassigned (market surface; id owed per register) | market surface (MarketSignalDetailSurface carbon-intensity helpers, market-rail-select, carbon-overlay-view, resolve-item-corridor); register says owning id not in its list | flywheel-b.md:L300 |
| P1-10 | unassigned | learning module (prediction-scoring, apply-question-answers, questions-on-change) | flywheel-b.md:L300 |
| P1-10 | P1-22 | computeDominanceShare (12 lines) moves to P1-22/23's antitrust module | flywheel-b.md:L105 |
| P1-12 | P1-13 | the kit (runExport, runApply, fixture-db, budget) and every adapter; run-population-flywheel imports export-corpus and the queue today | runtimes-a.md:L296 |
| P1-12 | P1-09, P1-10 | forwardEventKey to flywheel-steps; need targets (raise-term-needs) | runtimes-a.md:L296 |
| P1-12 | P1-14 | src/core/briefs/frontmatter and the record-briefs validator (mint and the brief write site) | runtimes-a.md:L296 |
| P1-12 | P1-15 | src/core/flags/need-targets (producers and research-walker) | runtimes-a.md:L296 |
| P1-12 | P1-15 | the brief queue to the drain (scripts/drain) | runtimes-a.md:L296 |
| P1-12 | P1-09 | its theme-brief seam writes through this module's theme-briefs apply (flywheel-a.md:274 names that apply as having no lane, this register is its lane) | runtimes-a.md:L298 |
| P1-12 | P1-15 | drain (scripts/drain) replaced by the kit's kind table | runtimes-a.md:L298 |
| P1-13 | P1-12 | runUnscopedConnect for brief-apply (today runUnscopedFlywheelSteps); theme-brief contract (apply-theme-briefs, question-answers); theme material (export-themes, question-answers, connections/generate-theme-brief) | runtimes-b.md:L237 |
| P1-13 | P1-21 | validateThemeBriefsFile, parseRamifications, SURFACE_HEADING etc. to the Research reader src/lib/research/theme-brief.mjs | runtimes-b.md:L237 |
| P1-13 | P1-03, P1-04 | persistPortalCandidates callers move to P1-03/04's one writer (today apply-need-urls imports run-source-sweep's mirror) | runtimes-b.md:L237 |
| P1-13 | P1-15 | judgement drain export argv (scripts/drain/kinds.mjs:40, :51) repointed to the intake stage's export | runtimes-b.md:L281 |
| P1-14 | P1-16 | reads the binding position, due date and forward events the mint and flywheel write; no direct call | mint.md:L240 |
| P1-14 | unassigned | scripts/turns/research-sweep.mjs:12 (validateMintPayload); scripts/maintenance/canonical-autoverify.mjs:7,9 (locateSpanInText, captureDocument, followUpgradingRedirects, makePoliteFetch); scripts/connections/propose-tags.mjs:354 (fetchRowsIn); scripts/turns/run-population-flywheel.mjs:1227 (run-mint-batch.mjs --outcomes) | mint.md:L75 |
| P1-14 | P1-15 | item-type-required-slots.json read by scripts/producers/market/propose-series-items.mjs:8 (and research-sweep.mjs:21) | mint.md:L75 |
| P1-15 | P1-19, P1-20, P1-21 | read every produced table (section 1 reader census) | producers.md:L355 |
| P1-15 | P1-09, P1-10 | runSignpostStep, runQuestionsOnChange, triggerQuestionsMain (run-propagation-drain.mjs:174,183; run-population-flywheel.mjs:1151) and authorMarketSeriesDeltaEdges (backfill-derivation-edges.mjs:5) | producers.md:L355 |
| P1-15 | P1-12, P1-13 | writeProducerSummary (scripts/gen) | producers.md:L355 |
| P1-15 | P1-05, P1-06 | read source_reliability_ledger through trust.ts (:1001, :1379) | producers.md:L355 |
| P1-15 | unassigned | the operator's drain command calls the drain plan and finish | producers.md:L355 |
| P1-16 | P1-14 | mint-enrichment.ts, mint-item.ts | obligations.md:L244 |
| P1-16 | P1-03/P1-04 | flywheel-steps.mjs, apply-staged-update.ts; usableCapturesOrdered consumed by canonical-pipeline.ts:92 | obligations.md:L244 |
| P1-16 | P1-09/P1-10 | run-population-flywheel.mjs steps forward-event-extraction, forward-event-apply, derive-obligations; apply-record-briefs.mjs; export-corpus-for-extraction.mjs; question-answers/data.mjs; theme-briefs/data.mjs reads item_forward_events directly | obligations.md:L244 |
| P1-16 | P1-19 | register page and filter bar, Upcoming strip, detail rail, list-surface rail card, kind labels | obligations.md:L222 |
| P1-16 | P1-20 | MarketPolicyTimeline.tsx:36 mounts UpcomingObligationsStrip with scope (MKT-1) | obligations.md:L223 |
| P1-16 | P1-24 | Due next through get_workspace_due_next; this module writes compliance_deadline | obligations.md:L224 |
| P1-16 | P1-25/P1-26 | /api/admin/forward-events, UpcomingObligationsPanel.tsx, /api/health/surfaces | obligations.md:L225 |
| P1-16 | unassigned | entities corridor-scope.ts:218 counts active obligations; /api/detail/relevance reads obligation_objects through relevance.mjs:189 | obligations.md:L226 |
| P1-16 | P1-08 | family registrations | obligations.md:L244 |
| P1-17 | P1-25/26 | admin 38 importers | ui-kit.md:L322 |
| P1-17 | P1-19..24 | four intelligence surfaces and detail layer 45 importers | ui-kit.md:L322 |
| P1-17 | P1-22/23 | community 9 | ui-kit.md:L322 |
| P1-17 | P1-18 | shell 3 (Sidebar, AppShell, layout); composes CommandBar into Masthead slot | ui-kit.md:L322 |
| P1-17 | P1-01 | auth 4 (auth, login, signup pages) | ui-kit.md:L322 |
| P1-17 | P1-02 | workspace 10 (onboarding, settings, profile, account); TagPopover caller owns tags client | ui-kit.md:L322 |
| P1-17 | P1-05/06 | sources 5 | ui-kit.md:L322 |
| P1-17 | unassigned | coverage, portfolio, figures 7 | ui-kit.md:L322 |
| P1-17 | P1-02 / P1-06 / P1-22/23 | Dialog: the one overlay primitive they build on | ui-kit.md:L273 |
| P1-18 | P1-01 | identity-seed (AuthProvider and identity-loader) | shell-list.md:L326 |
| P1-18 | P1-25/26 | useAdminAttention (AdminDashboard and rails); parts pages render NavCard and stop using PageMasthead | shell-list.md:L326 |
| P1-18 | P1-22/23 | useUnreadCount (NotificationsBell); community through getListingsOnly | shell-list.md:L326 |
| P1-18 | P1-02 | getNavCounts into bootstrap route; SettingsPage lands there | shell-list.md:L328 |
| P1-18 | P1-24 | url-state BAND and SORT params for "All N" links; DashboardBrief takes PageFrame, ListRow, url-state, theme chips; readListing | shell-list.md:L326 |
| P1-18 | P1-19..24 | four ledgers mount ListSurface; detail pages take ItemConnections, Relevance, Inference, GfmSection | shell-list.md:L328 |
| P1-18 | P1-07 / P1-03 / P1-04 | htmlToText (to capture and intake) | shell-list.md:L326 |
| P1-18 | P1-05/06 | splitCsv (to sources admin) | shell-list.md:L326 |
| P1-19 | P1-20, P1-21 | Market, Research and Operations detail surfaces: the whole detail architecture (loadDetail, the shell, SourcesGrid, FactBlocks, CrossPageSection, RequirementTrajectory, action-card props, section index) | regulations.md:L386 |
| P1-19 | P1-21 | Operations: itemIdColumn, isRegulationItem replacement, regionGroupForLabel | regulations.md:L386 |
| P1-19 | P1-25, P1-26 | inference view on /admin/inferences, the parts gallery | regulations.md:L386 |
| P1-19 | P1-09, P1-10 | computeStatutory in propagation/statutory-rows.ts | regulations.md:L386 |
| P1-19 | P1-02 | computeApplicability in relevance.mjs | regulations.md:L386 |
| P1-19 | P1-24 | theme chips read | regulations.md:L386 |
| P1-20 | P1-09 | carbonIntensity (propagation methods); adopted-vocabulary loader (flywheel-a, canonical pipeline, scripts/connections) | market.md:L292 |
| P1-20 | unassigned | figure components, NoticesRail, useRecalculationNotices (watchlist, the four detail surfaces) | market.md:L292 |
| P1-20 | P1-03 | adoptedTermsFromSupabase (canonical-pipeline.ts), adoptedThemeTokens (parse-output.ts, metadata-vocab.ts) | market.md:L143 |
| P1-20 | unassigned | operations AuxiliaryEnergyPanelView, GridQueuePanelView import spec09.css by relative path | market.md:L214 |
| P1-20 | unassigned | MarketSignalDetailSurface (DerivedFigure, envelopeFromFactorRow, envelopeFromPriceStat, carbonIntensity, signal-promotion, carbon-overlay-view) | market.md:L229 |
| P1-21 | P1-15 | assessItem and the authority helpers (research-assessment runtime); ingest parsers, envelope builders, planUpsert, originClassForTier, dimension keys (regional runtimes and NESO producer) | research-ops.md:L304 |
| P1-21 | P1-17 | buildRegionGrid, isEnvelopedFact, indexAgainstBase, factHeadline, originClassLabel, derivationLabel, sourceUrlFromNote, sourceNameFromNote (FactCard matrix density) | research-ops.md:L304 |
| P1-21 | P1-19, P1-20 | SEVERITY_COLUMN_TO_KEY (market detail surface) | research-ops.md:L304 |
| P1-21 | P1-18, P1-24 | theme-view (shell ThemeStrip, dashboard, shared detail CrossPageSection) | research-ops.md:L304 |
| P1-21 | unassigned | buildOperationsAskContext (assistant route owner; api/ask/route.ts:8, :432) | research-ops.md:L304 |
| P1-21 | P1-19, P1-20 | relatedItems proposed for the shared detail read, offered to the regulation and market detail lanes | research-ops.md:L304 |
| P1-22 | P1-23 | 21 import lines, all from src/app/community/** and src/lib/community/shell-context.ts | community-a.md:L52 |
| P1-23 | P1-22 | all 27 routes; communityViewer, authorIdForRow, identity loaders (CouncilMembersRail); validateEntityIds, ORG_TYPES, REGIONS (PostComposer, ProfileForm); isRoomMember, RoomKey (CommunityRooms) | community-b.md:L336 |
| P1-23 | P1-02 | REGIONS with labels (NoWorkspaceLanding) | community-b.md:L336 |
| P1-23 | P1-01 | REGIONS (create-org) | community-b.md:L336 |
| P1-23 | P1-18 | TopBar polls /api/community/notifications on every route | community-b.md:L338 |
| P1-23 | unassigned | the list surfaces (/api/listings/rest) | community-b.md:L338 |
| P1-23 | unassigned | the watchlist and detail surfaces (/api/notices via NoticesRail) | community-b.md:L338 |
| P1-24 | P1-18 | nav counts, Sidebar links to /watchlist and /dashboard/portfolio, AppShell mounts the Assistant, command bar fires open-ask-assistant and reads /api/search | dash-search.md:L276 |
| P1-24 | P1-17 | WatchButton reads /api/watchlist and the membership cache; runSearch, useItemSearch for the command bar | dash-search.md:L276 |
| P1-24 | P1-19..23 | every ledger imports dueInfo, jurisdictionCode, metaLine, bandFromPriority, scoreResource; detail surfaces scoreResource; MarketSeriesBoard lookupWatchMembership | dash-search.md:L276 |
| P1-24 | P1-02 | bootstrap imports getWatchlist, getSurfaceCoverageSnapshot, fetchWorkspaceOverrideRowsRaw, mapOverrideRows; portfolio routes import core and readPortfolioDetail | dash-search.md:L276 |
| P1-24 | P1-25/26 | ItemSearchPicker reads /api/search; admin/scan and notices import ITEM_TYPES | dash-search.md:L276 |
| P1-24 | unassigned | map and settings pages import getListingsMapData and getSettingsData (leave with those lanes) | dash-search.md:L276 |
| P1-25 | P1-26 | three page mounts | admin-a.md:L326 |
| P1-25 | P1-06 | UpcomingObligationsPanel, the kit | admin-a.md:L326 |
| P1-25 | P1-02 | form primitives (now P1-17's) via seven account files | admin-a.md:L326 |
| P1-25 | unassigned | seven list surfaces through ListSurfaceShell (VirtualizedRowList, now P1-17's) | admin-a.md:L326 |
| P1-26 | P1-25 | every route except the sources-surface ones | admin-b.md:L396 |
| P1-26 | unassigned | sources surface (nine routes, owner id owed) | admin-b.md:L396 |
| P1-26 | P1-18 | attention counts via the bootstrap; memberDisplayName | admin-b.md:L396 |
| P1-26 | P1-02 | nothing: admin routes are platform-scoped | admin-b.md:L396 |
| P1-26 | P1-18 or P1-02 | fetchAttentionCounts, EMPTY_COUNTS, AttentionCounts (bootstrap) | admin-b.md:L394 |
| P1-26 | P1-22/P1-23 | memberDisplayName | admin-b.md:L394 |
| P1-26 | P1-05 | PROVISIONAL_REVIEW_STATUSES | admin-b.md:L394 |

### D.3 Mismatch: gaps a register states (an export, home or lane id missing or owed) (156)

| stated by | owed by | what | cite |
|---|---|---|---|
| P1-01 | unassigned | no module id for the five customer-surface read layers supabase-server.ts carries; "surface read modules" ids owed | auth-db.md:L280 |
| P1-01 | unassigned | src/lib/data.ts (1,148 lines) in no Part 1 scope this lane can see [HYPOTHESIS] | auth-db.md:L280 |
| P1-01 | unassigned | surface read modules (ids owed, see Interface) for supabase-server.ts 99-5048 | auth-db.md:L261 |
| P1-01 | P1-05/P1-06 | pause.ts live exports handed to P1-05/06 | auth-db.md:L260 |
| P1-01 | P1-18 | UserMenu (P1-18 shell owns it) | auth-db.md:L258 |
| P1-02 | unassigned | components/pages/SettingsPage.tsx (639 lines) in no Part 1 scope | workspace.md:L299 |
| P1-02 | unassigned | src/lib/tags/* (452 lines) and src/lib/portfolio/* (710 lines) in no listed scope | workspace.md:L299 |
| P1-02 | P1-18 | src/lib/hooks/useWorkspaceBootstrap.ts and usePersonalState.ts unlisted | workspace.md:L299 |
| P1-02 | P1-01 | profiles.sector_overrides read by P1-01 identity seed, written by nobody | workspace.md:L299 |
| P1-02 | unassigned | portfolios logic owner owed (lib/portfolio/portfolio-core.mjs, 386 lines) | workspace.md:L200 |
| P1-03 | unassigned | operations-matrix.ts to the Operations surface read module, id owed | intake-a.md:L242 |
| P1-03 | unassigned | operations-ask-context.mjs to the assistant route's owner, id owed | intake-a.md:L243 |
| P1-03 | unassigned | Operations surface read module (id owed); assistant route owner (id owed) as new-file homes | intake-a.md:L335 |
| P1-03 | unassigned | detail-surface parsers (regulation sections, record sections, recommended actions) have no Part 1 id; ported under core/brief, id owed | intake-a.md:L361 |
| P1-03 | unassigned | operations-matrix.ts belongs to the Operations surface read module, the same owed id P1-01 named | intake-a.md:L361 |
| P1-03 | unassigned | assistant route /api/ask is a metered Claude call outside every id; skill-loader.ts and operations-ask-context.mjs wait on its ruling | intake-a.md:L361 |
| P1-03 | P1-25/P1-26 | admin classification routes and spot-check/recurring are metered callers of spend-client; P1-25/26 decides | intake-a.md:L361 |
| P1-03 | unassigned | eraseClaimWithProof has 0 callers; needs a caller (the erase step) | intake-a.md:L155 |
| P1-03 | unassigned | timeline-backfill-derive orchestrator gone; ADR-030 "no item without a date" needs a caller in the new tree | intake-a.md:L250 |
| P1-03 | unassigned | structured regulation sections new home core/brief/regulation-sections (surface id owed) | intake-a.md:L436 |
| P1-03 | unassigned | operations-matrix and operations-ask-context to their owners once their ids exist | intake-a.md:L404 |
| P1-04 | unassigned | item-taxonomy rule set (domains.ts, extract-registry, surface-of.mjs) owner not named in the brief's id list | intake-b.md:L251 |
| P1-04 | unassigned | four-surface contract assessment (surface tags) has no home when the metered call is not ported | intake-b.md:L251 |
| P1-04 | unassigned | scripts/verify/source-link-audit.mjs absent at this tree (INV-093 cites it) | intake-b.md:L107 |
| P1-04 | P1-05 | hand the source-axis library and the classify-sources job to P1-05's tree | intake-b.md:L321 |
| P1-05 | unassigned | coverage module id owed for tier1-priority-jurisdictions.ts | sources-a.md:L243 |
| P1-05 | unassigned | (coverage module, id owed) new home for priority regions | sources-a.md:L314 |
| P1-05 | P1-09 | owner of src/lib/entities not stated in the brief | sources-a.md:L338 |
| P1-05 | P1-03 | URL canonicaliser merge needs both owners' reads (P1-03 owns url-canon) | sources-a.md:L186 |
| P1-06 | P1-05 / P1-17 | customer-facing source rating and bias display not in this scope; Gap for the coordinator if neither lists it | sources-b.md:L254 |
| P1-06 | unassigned | health endpoints, inaccessible-triage and two registry scripts lost their invokers; port must name a new invoker for each or operator rules them off | sources-b.md:L255 |
| P1-06 | P1-07 | identity.mjs belongs with census or capture module (P1-07) more than coverage | sources-b.md:L184 |
| P1-06 | unassigned | one Tier-1 list owner (P1-19 regulations or the jurisdictions module) | sources-b.md:L144 |
| P1-06 | unassigned | features/map/region-coverage waits on jurisdictions owner settling the one Tier-1 list | sources-b.md:L294 |
| P1-06 | unassigned | scripts/sources/inaccessible-triage new home (invoker owed) | sources-b.md:L330 |
| P1-07 | unassigned | bootstrap route (Server-Timing's one consumer; P1-02 or P1-18) has no id in the brief's list | capture.md:L206 |
| P1-07 | P1-25/P1-26 | admin Errors tab that reads error_events has no id in the brief's list | capture.md:L206 |
| P1-07 | unassigned | src/lib/data.ts (cache wrappers and five seed-fallback call sites) in no Part 1 scope | capture.md:L206 |
| P1-07 | P1-05 | P1-05 verifies the monitoring_queue.last_result CHECK hypothesis first | capture.md:L139 |
| P1-08 | P1-12..15 | brief names P1-12..15 as one range; producers, drains and quarantine assigned without a finer id | harness.md:L363 |
| P1-08 | unassigned | scripts/turns/*, scripts/mint/*, scripts/drain/*, scripts/producers/* outside this scope; emitters mapped but not read | harness.md:L363 |
| P1-08 | unassigned | src/lib/d3/hooks.mjs should call recordRun (owner outside this module) | harness.md:L462 |
| P1-08 | unassigned | tools/measure-bundles.ts (tools, no lane id) | harness.md:L304 |
| P1-09 | P1-10 | Interface owed: corpus pass authors derivation edges for theme membership and tag adoption; a propagation event on an item's entity_refs should re-run runConnectionDiscovery | flywheel-a.md:L270 |
| P1-09 | unassigned | item-identity helper (resolveItemUuid, four homes) has no lane | flywheel-a.md:L274 |
| P1-09 | unassigned | theme-briefs apply (scripts/turns/apply-theme-briefs.mjs, the one theme_briefs writer) has no lane | flywheel-a.md:L274 |
| P1-09 | unassigned | one item-identity helper outside this module (id owed by the coordinator) | flywheel-a.md:L145 |
| P1-09 | P1-16 | forward-event-format.mjs MOVED to obligations (P1-16) [HYPOTHESIS on the id] | flywheel-a.md:L192 |
| P1-09 | unassigned | ensureCensusRow MOVED to the census writer of intake | flywheel-a.md:L100 |
| P1-10 | P1-09 | flywheel-a's ask for theme and tag-adoption edges and discovery re-run on entity_refs change need migrations (derivation_edges from_table allowlist, migration 339; entity_refs no outbox trigger) | flywheel-b.md:L295 |
| P1-10 | unassigned | Module ids owed for the detail read, the market surface and the learning module | flywheel-b.md:L382 |
| P1-10 | P1-08 | No invoker of the drain on this tree; P1-08 decides the invoker | flywheel-b.md:L380 |
| P1-12 | P1-09, P1-10 | flywheel-steps forward-event key disagrees with migration 307; P1-09/10 to take the shared key | runtimes-a.md:L380 |
| P1-12 | P1-15 | scripts/drain/kinds.mjs names five deleted workflows as apply paths; the drain's apply leg cannot run as written | runtimes-a.md:L381 |
| P1-12 | P1-13 | the new tree drops --allow-api (P1-13 to confirm) | runtimes-a.md:L248 |
| P1-12 | P1-08 | emit-live-smoke-artifact moves to the live-smoke runner (P1-08 harness, landing through recordRun) | runtimes-a.md:L257 |
| P1-12 | P1-13 | RESEARCH-SWEEP.md live content belongs to P1-13's register | runtimes-a.md:L161 |
| P1-12 | unassigned | host-verdicts (scripts/maintenance), named so the kit covers it | runtimes-a.md:L255 |
| P1-12 | P1-15 | kinds.mjs per-kind registry replaced by the kit's kind table; its five deleted applyWorkflow names become runApply | runtimes-a.md:L259 |
| P1-13 | P1-08 | P1-08 assigns ledger-consume to P1-03/04, propagation and downstream-chain to P1-09/10, change-detection and fetch-drain to P1-12..15; ruling owed on code location | runtimes-b.md:L181 |
| P1-13 | P1-12 | runtimes folding into the one runtime pending P1-12's register (not on origin at writing time); the coordinator reconciles | runtimes-b.md:L183 |
| P1-13 | P1-03, P1-04 | one guarded persistPortalCandidates in P1-03/04 intake | runtimes-b.md:L127 |
| P1-13 | unassigned | theme-briefs/schema.mjs: a product module under src imports this scripts file; the contract belongs in src/core | runtimes-b.md:L163 |
| P1-14 | P1-03/P1-04 | two mint paths (batch and mint-item.ts); features/mint owns one mint function intake calls; ownership shared | mint.md:L279 |
| P1-14 | P1-08 | harness version hashes MINT_GOVERNING_FILES from a P1-08 TRASH module | mint.md:L154 |
| P1-14 | P1-25/P1-26 | screen report becomes a query over screen_verdicts (admin) | mint.md:L308 |
| P1-14 | unassigned | chain hand-off today: none inside the module; flywheel ran as a later step of a deleted workflow | mint.md:L197 |
| P1-15 | P1-08 | Nothing dispatches this module on this tree; P1-08 owns their dispatch and the per-kind apply step the six applyWorkflow fields point at | producers.md:L356 |
| P1-15 | P1-12, P1-13 | the judgement drain's six exporters and apply scripts live under scripts/turns and scripts/maintenance; their port order must precede the drain's | producers.md:L356 |
| P1-15 | P1-07, P1-14 | six Weekly Oil Bulletin items grounded on a summary: live data defect for P1-07 capture and P1-14 mint | producers.md:L356 |
| P1-15 | P1-19, P1-20 | computePayloadPenalty has no panel caller: a lost feature on the Market surface until P1-19/20 wires OemRoadmapPanelView to it | producers.md:L356 |
| P1-15 | P1-19, P1-20 | computePayloadPenalty has no caller; the panel does not render the delta: a lost feature until P1-19/20 wires it | producers.md:L277 |
| P1-15 | P1-19, P1-20 | ratify source-file rewrite becomes a data write once the map is a table or a JSON data file (P1-19/20 ruling) | producers.md:L224 |
| P1-15 | P1-05, P1-06 | switch.mjs merges with P1-05/06's pause gates, whose judgementDrainHaltReason is dead | producers.md:L249 |
| P1-15 | P1-05, P1-06 | P1-05/06's judgement-drain pause read folds into core/drain/switch.ts | producers.md:L307 |
| P1-15 | P1-04 | P1-04's split.mjs retires; splitCsvText becomes a wrapper over core/csv/stream | producers.md:L303 |
| P1-15 | unassigned | SOURCES.md moves to docs/plans/rebuild (coordinator's call on the exact home) | producers.md:L202 |
| P1-16 | unassigned | obligation_objects has no producer of candidates; ruling owed on which lane produces them and whether obligation_id link is populated | obligations.md:L245 |
| P1-16 | unassigned | spec 01 four-date timeline not built (dates only as nullable columns on unpopulated objects table) | obligations.md:L245 |
| P1-16 | P1-04 | uk versus GB has no alias table; P1-04's jurisdiction vocabulary is the home | obligations.md:L245 |
| P1-16 | P1-20 | the brief's id list has no Market id; the Market policy timeline consumes this module's scoped read | obligations.md:L245 |
| P1-16 | P1-14 | write-forward-events.ts insert moves here from flywheel-steps.mjs (P1-14 owns the file); counted under P1-14 if the coordinator prefers | obligations.md:L195 |
| P1-16 | P1-14, P1-09/P1-10 | P1-14 and P1-09/10 switch their call sites to the one writer | obligations.md:L283 |
| P1-16 | P1-08 | scripts/harness-runs/date-chain/family.json still names dispatch-extraction.mjs as a governing file of a deleted workflow | obligations.md:L136 |
| P1-17 | unassigned | customer surfaces P1-19..24 and the coverage, watchlist, search and map features have no lane ids; RegisterRow, useWatchMembership, useCoverageRequest and search fetch cite "id owed" | ui-kit.md:L324 |
| P1-17 | unassigned | lib/urgency/bands.ts, lib/tier-labels.ts, lib/customer-source-tier.ts treated as core, not registered; customer-source-tier.ts in no Part 1 scope | ui-kit.md:L324 |
| P1-17 | P1-19..24 | MoreBelowDisclosure and DetailShell's SummaryDepthSwitch move INTO the kit; current owners P1-19..24 (ids owed) | ui-kit.md:L324 |
| P1-17 | unassigned | coverage feature id owed for useCoverageRequest | ui-kit.md:L271 |
| P1-17 | unassigned | map surface id owed for RegisterRow | ui-kit.md:L283 |
| P1-17 | unassigned | watchlist surface id owed for useWatchMembership | ui-kit.md:L304 |
| P1-18 | unassigned | market and research surface ids not stated in registers read | shell-list.md:L329 |
| P1-18 | unassigned | components/ledger/VirtualizedRowList.tsx belongs with the list surface, in no scope | shell-list.md:L329 |
| P1-18 | unassigned | components/AskAssistant.tsx in no Part 1 scope | shell-list.md:L329 |
| P1-18 | unassigned | lib/data.ts in no scope (P1-01's gap) | shell-list.md:L329 |
| P1-18 | unassigned | per-route loading.tsx files under market, operations, regulations, research in no scope | shell-list.md:L329 |
| P1-18 | P1-17 | GfmSection proposed for P1-17; ui-kit.md does not name it, coordinator confirms owner | shell-list.md:L329 |
| P1-18 | P1-01 | lib/data.ts is in no Part 1 scope (P1-01 gap) for fallback-guard consumer | shell-list.md:L231 |
| P1-19 | P1-03 | intake-a places the same parsers in src/core/brief/regulation-sections.ts; this register takes the reader half, leaves the writer half with intake; one of the two rows needs striking | regulations.md:L387 |
| P1-19 | P1-20, P1-21 | the detail architecture serves four surfaces; Market, Research and Operations lanes consume it | regulations.md:L387 |
| P1-19 | unassigned | /api/detail/relevance answers anonymous callers with IP limiting only; operator ruling | regulations.md:L387 |
| P1-19 | unassigned | surface ids for Market and Research not named in this brief [HYPOTHESIS that they are P1-20 and P1-22] | regulations.md:L387 |
| P1-19 | P1-17 | yourLanes: "connect data" repeats the AffectedLanes promise (P1-17 ActionCard decides the cell) | regulations.md:L260 |
| P1-19 | P1-10 | statutory offered to P1-10 if the coordinator places it there | regulations.md:L340 |
| P1-19 | P1-06 | one Tier-1 list: merge with tier1-priority-jurisdictions (sources-b scope; sources-b.md:144 named P1-19) | regulations.md:L187 |
| P1-19 | P1-02, unassigned, P1-18 | constants split: sectors and adjacency to P1-02; weights to the scoring owner; APP_NAME to P1-18 | regulations.md:L277 |
| P1-19 | P1-03 | section 14 extraction to P1-03; extract-recommended-actions and timeline-parse stay with P1-03 | regulations.md:L283 |
| P1-19 | P1-03, P1-04 | extract-recommended-actions output never read by the detail page and shape differs from what the page reads | regulations.md:L287 |
| P1-19 | P1-17 | parts gallery (P1-17) rebuilds its own fixtures beside its tests | regulations.md:L129 |
| P1-20 | unassigned | src/components/pages/MarketSignalDetailSurface.tsx (873 lines) is in no Part 1 SCOPE; needs an owner and a whole read | market.md:L294 |
| P1-20 | unassigned | src/lib/spec09/oem-payload.mjs and reroute.mjs feed the spec 09 panels and are not in this scope | market.md:L295 |
| P1-20 | unassigned | market_series_items table shape is a proposal, ADR owed | market.md:L275 |
| P1-20 | P1-15 | P1-15 receives the producer-side files | market.md:L327 |
| P1-20 | P1-09 | core/vocabulary to P1-09 | market.md:L330 |
| P1-21 | unassigned | cross-page theme view has no Part 1 id; this register ports it to src/core/themes and owns it until one is named | research-ops.md:L307 |
| P1-21 | unassigned | the assistant route /api/ask still has no owner id; operations-ask-context waits on it | research-ops.md:L307 |
| P1-21 | P1-15 | scripts/research/authority-score.mjs and scripts/turns/theme-briefs/schema.mjs are src-imports-scripts edges; authority scorer's owner is P1-15 [HYPOTHESIS on the id] | research-ops.md:L307 |
| P1-21 | unassigned | shared relatedItems detail read and enrichCategoryRows sit in no lane this register can see | research-ops.md:L307 |
| P1-21 | unassigned | operations-ask-context held here until the assistant route has an owner id | research-ops.md:L209 |
| P1-21 | P1-19, P1-20, P1-21 | callout fields what_it_changes and does_not_resolve: if research detail should show them, P1-19..21's detail lane reads them | research-ops.md:L389 |
| P1-21 | P1-09 | core/themes/theme-view with its two scripts imports resolved by P1-09 | research-ops.md:L341 |
| P1-22 | P1-23 | cite needs a route | community-a.md:L252 |
| P1-22 | P1-23 | the replies route returns no author_identity | community-a.md:L165 |
| P1-22 | P1-23 | no entity search API exists [HYPOTHESIS] | community-a.md:L144 |
| P1-22 | P1-18 | layout slot to replace CommunityShell's global-style sidebar hide | community-a.md:L144 |
| P1-22 | P1-23 | one regions module (P1-23 owns lib/community) | community-a.md:L95 |
| P1-22 | P1-23/P1-01 | LinkedIn verification route and column choice [HYPOTHESIS] | community-a.md:L282 |
| P1-22 | unassigned | no request-to-join route exists | community-a.md:L169 |
| P1-22 | unassigned | no admin member management (role change, remove) in any Community UI | community-a.md:L161 |
| P1-23 | unassigned | src/features/lists/api/remainder.ts (list surfaces; id owed) | community-b.md:L280 |
| P1-23 | unassigned | list remainder and notices routes owners have no lane id in the brief's list | community-b.md:L423 |
| P1-23 | P1-11 | Owed to P1-11: create_group_for_self, accept_group_invitation, create_thread, decide_signoff, moderate_report, community_directory_counts, community_notification_counts, community_group_bans table plus three moderation_reports columns | community-b.md:L299 |
| P1-23 | P1-11 | length limits: the database CHECK decides (owed to P1-11 if absent) | community-b.md:L169 |
| P1-23 | P1-22 | Edit own post: UI owed by P1-22 | community-b.md:L393 |
| P1-23 | P1-07 | dispatch ignores notification_preferences and muted: HALF-SLICE for P1-07 to close in the port | community-b.md:L237 |
| P1-23 | unassigned | client half community-a file list not named by dispatch [HYPOTHESIS] | community-b.md:L9 |
| P1-24 | P1-19..23 | row-fields.ts and list-row-fields.ts one derivation; kept here until the lists lane claims it (P1-19..23 owes the id) | dash-search.md:L277 |
| P1-24 | unassigned | coverage routes and page call lib/coverage/*, in no scope this lane can see; the id is owed | dash-search.md:L277 |
| P1-24 | unassigned | fetchThemeChips and theme-brief.mjs belong to research or connections lane; id owed | dash-search.md:L277 |
| P1-24 | P1-25/26 | skill owner (P1-25/26 or skills lane) owes a sectioned form of ENVIRONMENTAL_POLICY_SKILL_CORE | dash-search.md:L277 |
| P1-24 | unassigned | the lane owning lib/coverage owes the id for coverage-matrix.ts and coverage-request.ts | dash-search.md:L237 |
| P1-24 | unassigned | app/dashboard/coverage/page.tsx belongs with lib/coverage (its lane owes the id) | dash-search.md:L181 |
| P1-25 | P1-26 | three routes the tree lacks: an all-corrections list, a drafts read for the pipeline view, ingest_rejections_untriaged on the attention RPC | admin-a.md:L325 |
| P1-25 | P1-26 | an all-items corrections list route is owed | admin-a.md:L196 |
| P1-25 | P1-26 | Rejections chip has no count because no RPC scalar exists; port adds ingest_rejections_untriaged to attention RPC | admin-a.md:L205 |
| P1-25 | P1-26 | /api/admin/corrections route owed to P1-26 | admin-a.md:L297 |
| P1-25 | P1-26 | new /api/admin/pipeline/drafts read | admin-a.md:L287 |
| P1-25 | P1-26 | register assumes P1-26 owns src/app/admin/**, src/app/api/admin/**, useAdminAttention.ts, member-display-name.ts | admin-a.md:L327 |
| P1-25 | P1-17 | VirtualizedRowList and AccountPrimitives in scope by directory only; handed to P1-17 | admin-a.md:L327 |
| P1-26 | unassigned | lib/corrections/admin-api/handlers.ts and logic.mjs in no Part 1 register | admin-b.md:L397 |
| P1-26 | unassigned | src/components/sources/* call nine routes; lane id not in the brief's interface list | admin-b.md:L397 |
| P1-26 | P1-08 | spot-check-monthly family.json names a trashed route; P1-08 retires the family | admin-b.md:L397 |
| P1-26 | P1-04/P1-05 | home of the deterministic classifier (P1-04 named by ruling, P1-05 by intake-b.md) | admin-b.md:L397 |
| P1-26 | P1-25 | bias-tags UI mount owed to P1-25 | admin-b.md:L228 |
| P1-26 | unassigned | corrections handlers module in no Part 1 scope; gap for the coordinator | admin-b.md:L221 |
| P1-26 | unassigned | which lane owns src/components/sources not visible [HYPOTHESIS] | admin-b.md:L393 |
| P1-26 | unassigned | corrections API over the handlers, owner owed | admin-b.md:L477 |

### D.4 Mismatch: a need with no matching consumer row in the supplier's register (100)

Mechanical: lane A states it needs something from lane B, and B's register names no consumer row for A. This says the two registers do not both record the edge; it does not say the export is absent (offers are free text, see D.1).

| needing lane | supplier lane | what is needed | cite |
|---|---|---|---|
| P1-01 | P1-02 | workspaceStore setWorkspace, setUserRole, setSectorProfile; profile-contract.mjs, REGIONS, ALL_SECTORS | auth-db.md:L278 |
| P1-02 | P1-22 | REGIONS from profile-policy.mjs, dispatchNotification, request_verification consumer VerifierBadge, notification_preferences | workspace.md:L297 |
| P1-02 | P1-05 | nothing imported (this module hands them sourceStore and types/source) | workspace.md:L297 |
| P1-02 | P1-06 | nothing imported (this module hands them sourceStore and types/source) | workspace.md:L297 |
| P1-02 | P1-03 | nothing | workspace.md:L297 |
| P1-02 | P1-04 | nothing | workspace.md:L297 |
| P1-03 | P1-01 | getServiceSupabase, requireAdmin, isRefusal, isUuid, fetchAllRows | intake-a.md:L359 |
| P1-03 | P1-01 | src/lib/db/paginate, src/lib/api/route-guard, src/lib/supabase-service (old imports) | intake-a.md:L117 |
| P1-04 | P1-01 | getServiceSupabase, fetchAllRows for the full dedup corpus, isRefusal/requireAdmin for the admin run-intake route | intake-b.md:L249 |
| P1-05 | P1-09 | entities hostFromUrl (if it owns entities) [HYPOTHESIS] | sources-a.md:L338 |
| P1-06 | P1-07 | census_worklist, identity probe that fills identity_* | sources-b.md:L253 |
| P1-07 | P1-01 | getServiceSupabase from core/db/clients, workerAuthGuard, checkRateLimit, requireUser/requireUserRoute, isRefusal, authHeaders | capture.md:L205 |
| P1-07 | P1-03 | persistPortalCandidates; the capture-to-mint consumer of result_content | capture.md:L205 |
| P1-07 | P1-08 | dispatcher that invokes the worker and check-sources route, run ledger replacing D3 heartbeat, health probe consuming surface-health, kill switch read before any invocation | capture.md:L205 |
| P1-08 | P1-01 | core/db service client factory | harness.md:L361 |
| P1-08 | P1-05 | system_state reads (P1-05/06 owns the pause readers per P1-01) | harness.md:L361 |
| P1-08 | P1-06 | system_state reads (P1-05/06 owns the pause readers per P1-01) | harness.md:L361 |
| P1-10 | P1-09 | link-items and mentions read flywheel-a's adopted-terms and adopted-entities | flywheel-b.md:L295 |
| P1-10 | P1-01 | Supabase client type from core/db; core/db isUuid | flywheel-b.md:L104 |
| P1-12 | P1-01 | service client, guarded writes, readAll, readAllByIds | runtimes-a.md:L297 |
| P1-12 | P1-05 | rateSourceByInstitutionClass, hostOf, the class table, permanentlyUnregisteredClass, verdictPlacementForHost, registerSource | runtimes-a.md:L297 |
| P1-12 | P1-07 | pool rows of agent_run_searches, usableCapturesOrdered | runtimes-a.md:L297 |
| P1-12 | P1-09 | runUnscopedFlywheelSteps, discovery, forward-event extraction, lineage, entities, term recurrence | runtimes-a.md:L297 |
| P1-12 | P1-10 | runUnscopedFlywheelSteps, discovery, forward-event extraction, lineage, entities, term recurrence | runtimes-a.md:L297 |
| P1-12 | P1-03 | record-facts assertVerbatim, flywheel-defect | runtimes-a.md:L297 |
| P1-12 | P1-04 | record-facts assertVerbatim, flywheel-defect | runtimes-a.md:L297 |
| P1-12 | P1-14 | groundBrief injected path, generateBriefFromInjected, sectionBrief, growSources, Gate A scanner, timeline parser | runtimes-a.md:L297 |
| P1-13 | P1-03 | consumePortalCandidates, selectCandidateLedgerPage, runIntakeCycle record-only, applyPromoteCap, drainChangeSweepUpdates, UPDATE_DRAIN_LIMIT, FIRST_FETCH_CLASSIFY_PROMPT_VERSION, CONTENT_MAX_CHARS, the verdict-to-classification shape | runtimes-b.md:L238 |
| P1-13 | P1-04 | consumePortalCandidates, selectCandidateLedgerPage, runIntakeCycle record-only, applyPromoteCap, drainChangeSweepUpdates, UPDATE_DRAIN_LIMIT, FIRST_FETCH_CLASSIFY_PROMPT_VERSION, CONTENT_MAX_CHARS, the verdict-to-classification shape | runtimes-b.md:L238 |
| P1-13 | P1-05 | walkEurlexOj, walkFederalRegister, walkFeed, walkSource, EUR_LEX_PORTAL_URL, celexTxtHtmlUrl, FEDERAL_REGISTER_PORTAL_URL, registerSource, institutionKey, runReconcilePass, the check-sources assessment, readScrapeState, scrapeWindowOpen, CHANGE_SWEEP_STAGED_MARKER, extractPortalLinks, parseFeedEntries, isErrorBody, sourceRole, congruence | runtimes-b.md:L238 |
| P1-13 | P1-07 | the fetch ladder, the capture worker, pending_first_fetch, snapshot storage | runtimes-b.md:L238 |
| P1-13 | P1-09 | discover-for-items, run-extraction and its apply, analyze-corpus, derive-obligations, tag-proposals, tag-ratification, trigger-questions, questions-on-change, prediction-scoring, the propagation drain, gaps, brief-staleness, theme-delta | runtimes-b.md:L238 |
| P1-13 | P1-10 | discover-for-items, run-extraction and its apply, analyze-corpus, derive-obligations, tag-proposals, tag-ratification, trigger-questions, questions-on-change, prediction-scoring, the propagation drain, gaps, brief-staleness, theme-delta | runtimes-b.md:L238 |
| P1-13 | P1-14 | validate-mint-payload, record-facts-research, outcomes onto the slice's record, the mint chokepoint | runtimes-b.md:L238 |
| P1-13 | P1-01 | fetchAllRows, exactCount, the guarded db writer | runtimes-b.md:L238 |
| P1-13 | P1-05 | change stage route logic P1-05 | runtimes-b.md:L174 |
| P1-14 | P1-03 | resolveDocumentIdentity(row, source), buildRecordPayload, writeGroundingSequence, classifyMintOutcome, runMintEnrichment; mint-item.ts and the batch path become one mint function | mint.md:L234 |
| P1-14 | P1-04 | resolveDocumentIdentity(row, source), buildRecordPayload, writeGroundingSequence, classifyMintOutcome, runMintEnrichment; mint-item.ts and the batch path become one mint function | mint.md:L234 |
| P1-14 | P1-05 | registerAndRate(url) (class-table tier, institution link), readSourceByUrl | mint.md:L235 |
| P1-14 | P1-07 | capture(url, {family, key}) returning text, title, transport and a hold reason; the one polite free transport | mint.md:L236 |
| P1-14 | P1-09 | connect(mintedIds) (tags, discovery, forward events, obligations, recluster) called by runMint in the same run; outcome counts on the mint's ledger row | mint.md:L238 |
| P1-14 | P1-13 | dispatch of runMint and healQuarantined (manual while build mode holds the cadence off) | mint.md:L239 |
| P1-14 | P1-01 | fetchAllByIdChunks replaces fetchRowsIn; the service client | mint.md:L241 |
| P1-14 | P1-03 | src/lib/intake/record-facts.mjs, record-facts-research.mjs, write-item.ts, mint-enrichment.ts; src/lib/agent/gate-a-scan.mjs, gate-a-match.mjs, section-markers.mjs | mint.md:L69 |
| P1-14 | P1-04 | src/lib/intake/record-facts.mjs, record-facts-research.mjs, write-item.ts, mint-enrichment.ts; src/lib/agent/gate-a-scan.mjs, gate-a-match.mjs, section-markers.mjs | mint.md:L69 |
| P1-14 | P1-20 | src/lib/market/series-registry.mjs | mint.md:L69 |
| P1-14 | P1-05 | src/lib/sources/identifier-variants.mjs, transport-escalation.mjs, pdf-extract.mjs, host-authority.ts | mint.md:L69 |
| P1-14 | P1-07 | src/lib/sources/identifier-variants.mjs, transport-escalation.mjs, pdf-extract.mjs, host-authority.ts | mint.md:L69 |
| P1-14 | P1-09 | run.ts hands off to the flywheel (P1-09/10) with exactly the minted ids in the same run | mint.md:L209 |
| P1-14 | P1-10 | run.ts hands off to the flywheel (P1-09/10) with exactly the minted ids in the same run | mint.md:L209 |
| P1-15 | P1-01 | service client factory, paginate | producers.md:L354 |
| P1-15 | P1-19 | write-market-series plan and entity env, series-registry, series-deltas, oil-bulletin-workbook, refresh-published-price-statistics derivation, series-item-map, carrier-ets-surcharge-envelope, the four regional parsers and envelope builders, state-cost-facts-envelope, assess.mjs and surface-candidate | producers.md:L354 |
| P1-15 | P1-20 | write-market-series plan and entity env, series-registry, series-deltas, oil-bulletin-workbook, refresh-published-price-statistics derivation, series-item-map, carrier-ets-surcharge-envelope, the four regional parsers and envelope builders, state-cost-facts-envelope, assess.mjs and surface-candidate | producers.md:L354 |
| P1-15 | P1-09 | author-edges, market-series-delta method, signpost-watch's evaluate, fire and lifecycle, flag-namespaces, the outbox | producers.md:L354 |
| P1-15 | P1-03 | mint-item chokepoint, record-facts, contracts/envelope, csv split retirement, domains | producers.md:L354 |
| P1-15 | P1-05 | host-authority, institution, source-licence register for the licence block | producers.md:L354 |
| P1-15 | P1-06 | host-authority, institution, source-licence register for the licence block | producers.md:L354 |
| P1-15 | P1-03 | a direct import of mint-item in the TypeScript tree (P1-03/04 owns mint-item) | producers.md:L290 |
| P1-15 | P1-01 | the P1-01 service client factory (replaces raw createClient in research-assessment-producer) | producers.md:L291 |
| P1-16 | P1-01 | createSupabaseServerClient, checkRateLimit, clientKey, fetchAllRows, exactCount, fetchAllByIdChunks, isUuid, resolveItemId, getServiceSupabase for the SSR seed | obligations.md:L243 |
| P1-16 | P1-02 | getWorkspaceProfile, resolveOrgIdFromCookies | obligations.md:L243 |
| P1-16 | P1-03 | [due_date], [binding_position], [jurisdictional_scope] slot templates as shared constants | obligations.md:L243 |
| P1-16 | P1-04 | vocabularies: BINDING_POSITION, DUTY_HOLDER_CLASSES, LEG_MODE_CODES, normaliseMode, GENERIC_JURISDICTIONS; relevance.mjs currentObligationObjects, dutyHoldersExcludeForwarder; entity-id | obligations.md:L243 |
| P1-16 | P1-08 | run-artifact envelope, claimRunId, governing files; the forward-events and date-chain families | obligations.md:L243 |
| P1-16 | P1-08 | jobs run-extraction after P1-08's envelope exists | obligations.md:L287 |
| P1-17 | P1-19 | lib/detail/timeline-math, fact-card-model, section-index-data, use-section-scroll-spy | ui-kit.md:L321 |
| P1-17 | P1-20 | lib/detail/timeline-math, fact-card-model, section-index-data, use-section-scroll-spy | ui-kit.md:L321 |
| P1-17 | P1-22 | lib/detail/timeline-math, fact-card-model, section-index-data, use-section-scroll-spy | ui-kit.md:L321 |
| P1-17 | P1-23 | lib/detail/timeline-math, fact-card-model, section-index-data, use-section-scroll-spy | ui-kit.md:L321 |
| P1-18 | P1-01 | useAuth (user, identityStatus, isPlatformAdmin, retryIdentity, signOut), UserMenu, authedFetch, core/db clients | shell-list.md:L327 |
| P1-18 | P1-22 | notifications route | shell-list.md:L327 |
| P1-18 | P1-25 | attention route | shell-list.md:L327 |
| P1-18 | P1-01 | getServiceSupabase, route-guard, rate-limit, worker-auth, authHeaders | shell-list.md:L102 |
| P1-18 | P1-25 | /api/admin/attention | shell-list.md:L105 |
| P1-18 | P1-22 | /api/community/notifications | shell-list.md:L105 |
| P1-19 | P1-01 | service and cookie clients, cookie org resolution, rate limit, authed fetch | regulations.md:L385 |
| P1-19 | P1-05 | customer tier, bias display, url canonicaliser | regulations.md:L385 |
| P1-19 | P1-01 | isUuid from core/db | regulations.md:L189 |
| P1-20 | P1-05 | the source rating every market figure must show (rule 18); data_sources and the institution class table for carrier hosts | market.md:L293 |
| P1-20 | P1-01 | isUuid, clients, resolveOrgIdFromCookies for the indexation panel | market.md:L293 |
| P1-20 | P1-05 | features/market/read.ts after the source-rating read from P1-05 exists | market.md:L328 |
| P1-21 | P1-05 | customer source tier, the source registry rows the facts embed | research-ops.md:L305 |
| P1-21 | P1-01 | service client, resolveOrgIdFromCookies for the auxiliary panel | research-ops.md:L305 |
| P1-24 | P1-01 | requireUserRoute, isRefusal, rateLimitHeaders, resolveOrgIdFromCookies, resolveOrgIdFromUserId, requireOrgWriter, getServiceSupabase, createSupabaseServerClient, authedFetch, authHeaders, fetchAllRows, isUuid | dash-search.md:L275 |
| P1-24 | P1-20 | toListRowFields, watchTypeForItem, itemDetailHref, canonicalSurfaceForItem, surfaceOf, BAND_FACET_PARAM, SORT_FACET_PARAM, withListPosition, FiltersRailCard, LegendRailCard, ListSurfaceFacetGroup, enrichRowSourceChips, fetchChangelog or item_changelog read, mapWorkspaceItemRows, fetchThemeChips, buildThemeChips, customerSourceTier, tierScaleSpan, tierLabelOf, useRecalculationNotices, RecalculationNotice, coverage lib (getCoverageMatrix ... CoveragePageView), parseCorridorCanonicalName, formatCorridorLabel, ORIGIN_CLASS, weakestOriginClass, loadSuppressedClaims, redactSuppressedClaims, buildOperationsAskContext, ENVIRONMENTAL_POLICY_SKILL_CORE as passages | dash-search.md:L275 |
| P1-24 | P1-22 | toListRowFields, watchTypeForItem, itemDetailHref, canonicalSurfaceForItem, surfaceOf, BAND_FACET_PARAM, SORT_FACET_PARAM, withListPosition, FiltersRailCard, LegendRailCard, ListSurfaceFacetGroup, enrichRowSourceChips, fetchChangelog or item_changelog read, mapWorkspaceItemRows, fetchThemeChips, buildThemeChips, customerSourceTier, tierScaleSpan, tierLabelOf, useRecalculationNotices, RecalculationNotice, coverage lib (getCoverageMatrix ... CoveragePageView), parseCorridorCanonicalName, formatCorridorLabel, ORIGIN_CLASS, weakestOriginClass, loadSuppressedClaims, redactSuppressedClaims, buildOperationsAskContext, ENVIRONMENTAL_POLICY_SKILL_CORE as passages | dash-search.md:L275 |
| P1-24 | P1-23 | toListRowFields, watchTypeForItem, itemDetailHref, canonicalSurfaceForItem, surfaceOf, BAND_FACET_PARAM, SORT_FACET_PARAM, withListPosition, FiltersRailCard, LegendRailCard, ListSurfaceFacetGroup, enrichRowSourceChips, fetchChangelog or item_changelog read, mapWorkspaceItemRows, fetchThemeChips, buildThemeChips, customerSourceTier, tierScaleSpan, tierLabelOf, useRecalculationNotices, RecalculationNotice, coverage lib (getCoverageMatrix ... CoveragePageView), parseCorridorCanonicalName, formatCorridorLabel, ORIGIN_CLASS, weakestOriginClass, loadSuppressedClaims, redactSuppressedClaims, buildOperationsAskContext, ENVIRONMENTAL_POLICY_SKILL_CORE as passages | dash-search.md:L275 |
| P1-24 | P1-05 | readScrapeState for the rule-16 window (P1-05/06) | dash-search.md:L275 |
| P1-24 | P1-01 | lib/cache/fallback-guard.ts (P1-01 owns the file) | dash-search.md:L229 |
| P1-25 | P1-07 | re-capture action behind brief flags | admin-a.md:L325 |
| P1-25 | P1-12 | free sweep and research walker apply path dispatched from DispatchPanel with a topic filter | admin-a.md:L257 |
| P1-25 | P1-13 | free sweep and research walker apply path dispatched from DispatchPanel with a topic filter | admin-a.md:L257 |
| P1-25 | P1-08 | harness_runs for masthead run count | admin-a.md:L261 |
| P1-26 | P1-07 | free fetch primitive and assertFetchAllowed for fetch-now | admin-b.md:L395 |
| P1-26 | P1-13 | turn runtime that consumes corpus_turn_requests, including the regeneration request | admin-b.md:L395 |
| P1-26 | P1-14 | turn runtime that consumes corpus_turn_requests, including the regeneration request | admin-b.md:L395 |
| P1-26 | P1-08 | statutory family's artifact convention; retirement of the spot-check-monthly family | admin-b.md:L395 |
| P1-26 | P1-09 | lib/connections (pair-view, theme-stats, brief-staleness) | admin-b.md:L395 |
| P1-26 | P1-09 | lib/propagation/statutory-rows | admin-b.md:L395 |
| P1-26 | P1-13 | lib/propagation/statutory-rows | admin-b.md:L395 |

### D.5 Mismatch: needs addressed to no lane id (unassigned, a surface name, or an id owed) (22)

| needing lane | addressed to | what is needed | cite |
|---|---|---|---|
| P1-01 | unassigned | telemetry captureError, withErrorCapture; email sendInvitationEmail (today a stub) | auth-db.md:L278 |
| P1-02 | unassigned | fetchWorkspaceOverrideRowsRaw and mapOverrideRows (surface read layer P1-01 left id-less); APP_DATA_TAG and getSettingsData from lib/data.ts (id-less) | workspace.md:L297 |
| P1-02 | unassigned | @/lib/tags/* and @/lib/portfolio/* (owners owed); telemetry withErrorCapture; perf server-timing; @/lib/constants; @/lib/detail/id-redirect, @/lib/item-links | workspace.md:L297 |
| P1-03 | unassigned | workflow package; @/lib/domains, @/lib/text/html-to-text, telemetry captureError | intake-a.md:L359 |
| P1-04 | unassigned | domainForItemType (src/lib/domains.ts) | intake-b.md:L249 |
| P1-04 | unassigned | @/lib/surface-of.mjs; scripts/lib/{db, env-file, free-pass, mutation-lease, quarantine-dwell, deferral, run-artifact, harness-run-number, record-harness-run}.mjs; scripts/maintenance/lib/cli.mjs; apply-deferrals.mjs; propose-tags.mjs; governing-files.mjs | intake-b.md:L79 |
| P1-05 | unassigned | coverage/identity.mjs classifyIdentifier (owner id owed) | sources-a.md:L338 |
| P1-06 | unassigned | @/lib/tier-labels (TIER_LABELS), @/lib/domains, @/lib/contracts/vocabularies.mjs, @/lib/jurisdictions/iso, @/lib/telemetry/surface-health.mjs, @/lib/llm/spend-gauge.mjs | sources-b.md:L253 |
| P1-07 | unassigned | item-links DetailSurface type (surface modules) | capture.md:L205 |
| P1-14 | unassigned | src/lib/domains.ts; src/lib/coverage/identity.mjs (UK_TYPES); scripts/lib/* (db, run-artifact, loop-run-id, env-file, is-main, canonical-key, institution-key, eurlex-cellar, revalidate); scripts/harness-runs/governing-files.mjs | mint.md:L69 |
| P1-16 | unassigned | scripts db layer (readAll, readAllByIds, guardedInsertMany, guardedUpdate, readClient); telemetry withErrorCapture | obligations.md:L243 |
| P1-17 | unassigned | lib/urgency/bands (BAND_ORDER, bandFromPriority; owner P1-19..24 or core, id owed) | ui-kit.md:L321 |
| P1-17 | unassigned | types/resource, lib/format, lib/agent/parse-record-sections, lib/operations/region-grid.mjs, lib/entities/host-from-url.mjs, lib/coverage/coverage-state.mjs, core/time/iso-week, lib/render-now | ui-kit.md:L321 |
| P1-18 | unassigned | components/ledger: VirtualizedRowList | shell-list.md:L102 |
| P1-19 | unassigned | corrections (suppressed claims) | regulations.md:L385 |
| P1-20 | unassigned | list-surface (ListSurfaceShell, rail cards, sort row, facet helpers, useListSurfaceFilter) whose owner the coordinator names | market.md:L293 |
| P1-20 | unassigned | entities (corridor-scope parser and cache, unlocode names) | market.md:L293 |
| P1-20 | unassigned | the detail lane (loadDetail, applyIdRedirect, fetchClaimTierMap, buildResourceLookup) | market.md:L293 |
| P1-21 | unassigned | the surface-of rule table (surfaceOf, migration 269) for admission | research-ops.md:L305 |
| P1-24 | unassigned | telemetry (captureError, withErrorCapture, recordSeedFallbackFlag) | dash-search.md:L275 |
| P1-26 | unassigned | lib/corrections/admin-api/handlers (owner lane unknown) | admin-b.md:L395 |
| P1-26 | unassigned | lib/jurisdictions (iso, tiers), lib/detail/inference-view.mjs, lib/telemetry/capture-error, lib/d3/hooks.mjs | admin-b.md:L395 |

### D.6 Mismatch: the same symbol offered by two or more lanes (3)

Mechanical: identifiers (backticked names and camelCase or PascalCase words of five characters or more) found in two lanes' offers rows. Some are a re-export or a pass-through the register names as such; the cites carry the context.

| symbol | offering lanes | cites |
|---|---|---|
| parseRecordSections | P1-03, P1-19 | P1-03 (intake-a.md:L358); P1-19 (regulations.md:L384) |
| splitKeyDateFacts | P1-03, P1-19 | P1-03 (intake-a.md:L358); P1-19 (regulations.md:L384) |
| useAdminAttention | P1-18, P1-26 | P1-18 (shell-list.md:L326); P1-26 (admin-b.md:L393) |

## E. CROSS-MODULE DUPLICATES

Source: every row of each register's section 5 plus every place a register says a mechanism mirrors or copies one outside its scope (620 rows extracted). E.1 groups the named mechanism classes across all registers (in-module and cross-module copies both shown, so a class carried by two or more registers is visible as one row group). E.2 lists every row whose register itself names another lane or an out-of-scope copy. Class tags were assigned at extraction; "other:<word>" rows not crossing a module are counted, not listed.

### E.1 Named mechanism classes across registers

| mechanism class | registers carrying it | copies (lane:path [mechanism] cite) | one home proposed by the registers |
|---|---|---|---|
| guard | 19 lanes: P1-01, P1-02, P1-03, P1-04, P1-05, P1-06, P1-08, P1-09, P1-10, P1-12, P1-14, P1-15, P1-18, P1-19, P1-21, P1-23, P1-24, P1-25, P1-26 | P1-01:api/auth.ts:40-47; api/community-auth.ts:14-21 [ClaimsVerifier interface] (auth-db.md:L143) // P1-01:api/auth.ts:60-67; api/community-auth.ts:34-41 [getClaims to userId resolver] (auth-db.md:L144) // P1-01:members/route.ts:208-227, 329-346, 449-468 [last-owner count] (auth-db.md:L147) // P1-01:members/route.ts:32-48 and :74-79 [owner-or-platform-admin gate + 403 copy] (auth-db.md:L148) // P1-01:api/auth.ts (132) + api/community-auth.ts (98) + api/route-guard.ts (101) [two guard families] (auth-db.md:L104) // P1-01:route-guard.ts 83-101; platform-admin-gate.ts 22-28 [admin gate builds service client while own-row rpc already answers] (auth-db.md:L109) // P1-02:archive-impact:74; overrides:116; item-collab-shared.mjs:15; BriefingScheduleSection.tsx:73; OrganisationProfileSection.tsx:79 [owner-or-admin test] (workspace.md:L154) // P1-02:overrides/route.ts:106-121 after :42; archive-impact:66-72 after :61 [the caller's role re-read] (workspace.md:L155) // P1-03:first-fetch-classify.ts 190 (isErrorBody from entity-gate); canonical-pipeline.ts 1771 [error-body gate] (intake-a.md:L206) // P1-03:canonical-pipeline.ts 787-808 [injected-metadata flat-YAML guards] (intake-a.md:L208) // P1-04:apply-staged-update.ts:236-254; mint-item.ts:207-211 [NON_REG_TYPES leakage warning (warn only) duplicating chokepoint domain canonicalisation] (intake-b.md:L148) // P1-05:fetch-hold.mjs:35-54 env SCRAPE_HOLD (fails open); system_state.scrape_cadence read by api/pause.ts and trust.ts:1362-1370 (fails closed) [scrape hold] (sources-a.md:L187) // P1-06:api/coverage/entries/route.ts:10 [entries route builds a service client to answer "is this an admin"] (sources-b.md:L188) // P1-08:chained-dry-guard.mjs readScrapeCadence; maintenance/lib/cli.mjs exit 2; record-harness-run.mjs and upstream-artifact.mjs isGitHubActions (:237-252, :259-266) [run-mode and kill-switch reads] (harness.md:L181) // P1-09:resource-lookup.ts 5, 11; tags/server.ts 34, 58; plus overrides and personal-state routes (B-0287, B-0863) [UUID_RE and resolveItemUuid] (flywheel-a.md:L145) // P1-10:item-corrections.mjs:17, admin-api/logic.mjs:4 [UUID regex] (flywheel-b.md:L152) // P1-12:apply-extraction-output:10, consume-turn-requests:9, dry-run-structured-actions:155, emit-brief-export:14, emit-downstream-chain:61, emit-source-resolution:17, export-corpus:27, last-turn-date:32 [main-module guard hand-compares process.argv[1]] (runtimes-a.md:L142) // P1-14:export-census-rows.mjs:714-797; apply-mint-batch.mjs:70-120 [held index vs M4 index] (mint.md:L126) // P1-15:ecb-fx 202-220; eia 148-166; sbti 321-330 (licence first); ukpn 205-211; neso 91-99; eurostat-lc 70-87; eea-hdv 50-57 (plus truncated); research-assessment 292-307; research-walker 287-299 [three-gate decideApply] (producers.md:L177) // P1-15:scripts/drain/switch.mjs [switch.mjs fail-closed drain switch read merges with pause gates] (producers.md:L249) // P1-18:AppShell.tsx:40, app-shell-banner.ts:16, :32; Sidebar.tsx:102, :137 [prefix route matching] (shell-list.md:L158) // P1-19:id-redirect.ts:4; supabase-server.ts:3801; plus P1-01's and P1-02's copies [uuid regex] (regulations.md:L189) // P1-21:region-grid.mjs:17-25 isEnvelopedFact; operations-ask-context.mjs:18-25 isEnveloped; statements.mjs:50-52 envelopeOf [envelope gate] (research-ops.md:L168) // P1-23:17 files under app/api/community and lib/community (member-pref-route.mjs:6 and 16 routes) [UUID regex] (community-b.md:L157) // P1-23:invitations:34, invite-candidates:28, invite:44, members DELETE:103, settings:84-99, revoke:49, moderation reports POST:245, member-pref-route:37 [caller's role in a group] (community-b.md:L158) // P1-23:27 handlers: 17 UUID_RE, 12 JSON parse, 9 role pre-reads, 50 rateLimitHeaders, 36 guard calls [per-route boilerplate (guard, limiter, UUID, JSON, role pre-read)] (community-b.md:L113) // P1-24:supabase-server.ts:1268-1279; :4779-4780; :4541-4542 and portfolio-core.mjs:30 (auth-db.md lists three more) [uuid-or-legacy id split, UUID regex] (dash-search.md:L147) // P1-25:MembersPanel.tsx 68-73; WorkspacesUsageRow.tsx 103-106; OrganizationsTable.tsx 113-119 [owner count and last-owner guard] (admin-a.md:L146) // P1-26:corpus-turn-requests:22-28, FilterableQuery :39-43 [requireAdmin local wrapper] (admin-b.md:L184) | P1-01: one interface in core/auth/claims.ts with the optional jwt // P1-01: one userIdFromClaims(client, jwt?) // P1-01: assertNotLastOwner(service, orgId) // P1-01: one helper, one message // P1-01: one requireUser(request) cookie or bearer; requireAdmin composes it with the own-row rpc // P1-01: requireAdmin reads the own-row rpc on the caller's client; service client only to routes that write // P1-02: `isOrgAdmin(role)` from core/auth/membership (P1-01) or this module's roster file // P1-02: `requireOrgWriter` returns `{orgId, role}` (P1-01's `resolveMembership`) // P1-03: already one body; keep // P1-03: none, once the object is validated directly // P1-04: delete // P1-05: one `core/fetch/hold.ts` exposing `fetchAllowed(caller)`, failing closed on a read error // P1-06: use requireAdmin // P1-08: one resolveRun() in the run frame // P1-09: one item-identity helper outside this module (id owed by the coordinator) // P1-10: core/db isUuid (P1-01) // P1-12: the kit's CLI entry // P1-14: one index and one predicate, used before capture and again at insert // P1-15: one decideApply({ apply, licenceBlock, enabled, killSwitchOn, hasCreds, truncated }) in the core runner, gate order fixed: licence, ENABLED, kill switch, credentials, partial read // P1-15: core/drain/switch.ts (P1-05/06's judgement-drain pause read folds in) // P1-18: segment match: `path === r / path.startsWith(r + "/")`, the same fix P1-01 owes route-policy (B-1980) // P1-19: isUuid from core/db (P1-01) // P1-21: one gate over one fact shape; the reader maps snake_case once // P1-23: P1-01's isUuid() in core/db // P1-23: groupRole(client, groupId, userId) returning {role} / null or throwing on error // P1-23: features/community/api/_http.ts: withCommunity, uuidParam, readJson, groupRole // P1-24: one isUuid in core/db and one splitIdsByShape(ids) beside it // P1-25: one tallyRoles(members) // P1-26: call requireAdminRoute directly like the other 35 sites |
| reader | 19 lanes: P1-01, P1-02, P1-03, P1-04, P1-06, P1-07, P1-10, P1-13, P1-14, P1-15, P1-16, P1-18, P1-19, P1-20, P1-21, P1-23, P1-24, P1-25, P1-26 | P1-01:api/org.ts:25-37, 66-79, 105-118, 151-164, 251-264; api/orgs/[org_id]/members/route.ts:17-22; api/orgs/[org_id]/route.ts:15-21; api/auth/linkedin/callback/route.ts:235-240; api/server-bootstrap.ts:158-164 [oldest-membership query] (auth-db.md:L145) // P1-01:members/route.ts:12-27; [org_id]/route.ts:10-22 [getMembership per route] (auth-db.md:L146) // P1-01:api/org.ts 25-37, 66-79, 105-118, 151-164, 251-264 [five copies of oldest-membership query with four error contracts] (auth-db.md:L103) // P1-02:overrides/route.ts:16-27; personal-state/route.ts:32-43; lib/tags/server.ts [resolveItemUuid (error dropped)] (workspace.md:L149) // P1-02:archive-impact:44-50; item-collab-route.ts:64-69; portfolios/[id]/members/route.ts:24-30 [item lookup by shape (uuid or legacy_id)] (workspace.md:L150) // P1-02:item-collab-shared.mjs:37-51 (limit 1000); bootstrap/logic.ts:80-110 (no limit) [org roster read] (workspace.md:L152) // P1-02:archive-impact/route.ts:93-111, 117-124; overrides/route.ts:195-211 [org-scoped watcher read] (workspace.md:L153) // P1-02:personal-state/route.ts:54-92; bootstrap/logic.ts:38-70 [user_item_state personal-archive read and row mapping] (workspace.md:L156) // P1-03:canonical-pipeline.ts 1764, 1386-1391, holdingsForItem 1186, readAllSourcesForResolver 390; generate-brief.ts loadClaims 215-218; gate-a-derived.mjs 32; audit-gate.ts 89-97 [per-item agent_run_searches pool read] (intake-a.md:L201) // P1-04:id-stamp.mjs:19-20, lease.mjs:15-16, tombstone-delete.mjs:67 [readAll item lookups by prefix] (intake-b.md:L143) // P1-06:lib/coverage-gaps.ts:68 vs lib/data.ts:802 (table coverage_gaps) [two `getCoverageGaps`] (sources-b.md:L143) // P1-06:load-matrix.mjs:17 runs getEntries and getIndex, both loadCoverage [coverage census read twice] (sources-b.md:L148) // P1-07:route.ts:93-101; scripts/turns/run-change-detection.mjs:518-530 [check-sources due-sources SELECT] (capture.md:L120) // P1-10:link-item-entities.mjs:27, :30, :46, :50, :53, :58; corridor-scope.ts:81, :94, :168, :178, :194, :217; link-items.ts:73, :74, :157, :160 [{data} reads without the error] (flywheel-b.md:L149) // P1-10:link-items.ts:157 and backfill-lineage-edges.mjs:87-92 [open-flag dedup read] (flywheel-b.md:L150) // P1-13:run-change-detection.mjs :520-598 [four read helpers mirror the route's, reconcile's and the drain's SELECTs by hand] (runtimes-b.md:L76) // P1-13:run-change-detection.mjs:520-537 mirrors check-sources/route.ts [due-sources SELECT] (runtimes-b.md:L125) // P1-14:export-census-rows.mjs [fetchRowsIn chunked-read helper] (mint.md:L84) // P1-15:ecb 335-337; eia 270-272; eu-weekly 77-79; sbti 399-401 [whole-table readAll("market_series") then prefix filter in JavaScript] (producers.md:L181) // P1-16:read-register.mjs 294 to 303 and 471 to 480; read-upcoming.mjs 214 to 223 [chunked verified-item lookup] (obligations.md:L114) // P1-16:read-register.mjs 272 to 306 and 424 to 489 [two read paths for one register] (obligations.md:L67) // P1-18:supabase-server.ts 784-847 (org) and 929-983 (public); payload wrappers 3030-3114 [listing readers] (shell-list.md:L167) // P1-18:loadResourcesWithOverridesPayload, loadPublicResourcesPayload, loadMapDataPayload, fetchSettingsData [four payload wrappers plus two listing readers differ only in org scope] (shell-list.md:L120) // P1-19:BindingBanner.tsx:111 and RelevanceBadgeClient.tsx:33 both GET /api/detail/relevance [relevance fetch] (regulations.md:L193) // P1-19:supabase-server.ts:3895-3900; :3801-3815; [slug]/page.tsx:120; :4325-4330; load-detail.ts:70; :4377-4382 [six reads of one item id per detail render] (regulations.md:L132) // P1-20:IndexationPanel.tsx:7-26; ReroutingPanel.tsx:6-24; OemRoadmapPanel.tsx:6-24 [three panel fetchers] (market.md:L164) // P1-21:research/[slug]/page.tsx 18-44, 128-196; operations/[slug]/page.tsx 27-53, 127-206 [detail-page related-items queries (RelatedRow, pickRelated, two-query cascade)] (research-ops.md:L110) // P1-21:research/[slug]/page.tsx:18-44, 133-196; operations/[slug]/page.tsx:27-53, 131-206 [related items on a detail page] (research-ops.md:L164) // P1-23:community_identity rpc (all read routes) and direct community_member_profiles read in posts/route.ts:133-137 [identity reads] (community-b.md:L165) // P1-23:[slug]/page.tsx:143-154 and discover/page.tsx:35-46, byte-equivalent [entity candidate read] (community-b.md:L167) // P1-24:api/search/logic.ts:62-97; api/ask/route.ts:260-283 [two-step retrieval over search_intelligence_items] (dash-search.md:L150) // P1-24:route.ts:122-151 and :163-217 [watchlist GET single-item and list modes] (dash-search.md:L157) // P1-24:supabase-server.ts:2830 [readScrapeState called for the window] (dash-search.md:L160) // P1-25:corrections/ItemSearchPicker.tsx 4-7 [ItemSearchPicker reuses the command bar's search] (admin-a.md:L198) // P1-26:integrity-flags:174-188, intersections:31-42, corpus-turn-requests:45-59, b2-progress:35-42, recompute-trust:46-53, :92-116, inferences/page.tsx:28-31 [paged "read everything" helper] (admin-b.md:L180) // P1-26:forward-events:55-71, intersections:56-68, corpus-turn-requests:81-95 [chunked .in("id", ...) item join] (admin-b.md:L181) // P1-26:canonical-sources/pending:68-71, integrity-flags:18-37, users:85-88, inferences/page.tsx:14-17, scan:91 [1,000-row PostgREST cap acknowledged in prose not code] (admin-b.md:L182) // P1-26:integrity-flags/route.ts:174-188 [local fetchAll pager beside shared fetchAllRows] (admin-b.md:L140) | P1-01: resolveMembership(client, userId, orgId?) in core/auth/membership.ts // P1-01: the same resolveMembership // P1-01: one resolveMembership(client, userId, orgId?) // P1-02: one `resolveItemUuid(client, key)` in core/workspace/item-id.ts that surfaces the read error // P1-02: the same `resolveItemUuid` // P1-02: `loadRoster(client, orgId)` once, bounded // P1-02: `orgWatchersOf(client, orgId, itemKeys)` once // P1-02: `loadPersonalState(client, userId)` once; error surfaced // P1-03: one readItemPool(sb, itemId) returning rows with url, text, tier, searched_at // P1-04: one resolveItemKey(key) // P1-06: rename the map one `getRegionCoverage` // P1-06: one call; B-0245 // P1-07: the harness script calls the route and reads sourcesChecked // P1-10: destructure and surface the error // P1-10: one hasOpenFlag(sb, subjectRef, createdBy) that fails closed // P1-13: the change-detection stage calls the check in process // P1-13: the check itself is in process; one query // P1-14: core/db fetchAllByIdChunks (P1-01) // P1-15: readAll with match: q => q.like("series_key", prefix + ":%"), one call in the runner // P1-16: one fetchVisibleItemsById(client, ids, columns) in core/db, built on fetchAllByIdChunks // P1-16: one paged read; the detail variant passes itemId and limit // P1-18: readListing with an optional orgId // P1-18: one `readListing({ orgId?, rpc, page })` returning `{ rows, archived, overrides?, failed }`; one mapper; one counts module // P1-19: one useItemRelevance(itemId) shared by the banner and the badge // P1-19: the item read returns {uuid, legacyId} once; every later read takes the uuid // P1-20: one read helper (readPanelRows in read.ts) // P1-21: one relatedItems(client, self, {match, itemType}) in the surface read module, shared with the market and regulations detail lanes // P1-21: relatedItems(client, self, {match, itemType}) // P1-23: one projection fed by the rpc plus member-profile fields (section 3 rank 9) // P1-23: one loadEntityCandidates(client, query); escape the ilike wildcards // P1-24: runSearch(client, q, { maxRows, select }); the Assistant calls it // P1-24: one read watchRowsFor(user, org, itemType, itemId?) // P1-24: window read once per request from the same system_state row the shell already reads (P1-18 / P1-05) // P1-25: GET /api/search (reused) // P1-26: fetchAllRows and fetchAllByIdChunks from core/db (P1-01) // P1-26: fetchAllByIdChunks // P1-26: the same two helpers (INV-291) // P1-26: one paged read through fetchAllRows |
| list-variant | 4 lanes: P1-06, P1-18, P1-21, P1-22 | P1-06:CoveragePageView.tsx 61, 84, 79-83 [LIST_SURFACE_MOBILE_CSS injected twice plus third inline style] (sources-b.md:L93) // P1-18:ListSurfaceShell.tsx 393-411 restates PageFrame.tsx 21-40; :384, :411; WatchlistSurface.tsx:249, CoveragePageView.tsx:61,84, ObligationRegisterPageView.tsx:139,173 [list frame written four times; LIST_SURFACE_MOBILE_CSS injected twice and copied] (shell-list.md:L117) // P1-18:WatchlistSurface; ObligationRegisterPageView; CoveragePageView [list variants that copy frame (Watchlist, Obligation register, Coverage)] (shell-list.md:L314) // P1-21:ResearchLedger, OperationsLedger [ResearchLedger and OperationsLedger compose ListSurfaceShell identically] (research-ops.md:L173) // P1-22:PostList 88-113; NotificationsList 169-188 (two hasMore rules :152-155 and :182) [cursor pagination] (community-a.md:L142) | P1-06: one style injection through the list shell // P1-18: ListSurface renders inside PageFrame; the variants mount ListSurface with slots // P1-18: ListSurface with slots / PageFrame (owner: sources lane P1-05/06 for Coverage) // P1-21: the P1-17/P1-18 list shell takes a row mapper; each ledger becomes its facets plus its above-rows slot // P1-22: one useCursorList |
| hostOf-url-canonicaliser | 8 lanes: P1-03, P1-04, P1-05, P1-08, P1-10, P1-13, P1-14, P1-26 | P1-03:url-canon.mjs 1-37; mint/lib/canonicalize-citation-url.mjs [JS mirror of SQL canonicalize_citation_url (migration 150); second JS mirror in scripts/mint/lib differs on null] (intake-a.md:L255) // P1-04:free-pass-run.mjs:16; scripts/lib/institution-key.mjs [hostOf] (intake-b.md:L145) // P1-05:institution.ts:10-12; vertical-fit-gate.ts:11-17; identifier-variants.mjs:255; classify-source-role.ts:16; verification.ts:344, 373, 610; entities/entity-id.mjs hostFromUrl (sitemap-walk.mjs:13); B2-part1:52 counts 11 definitions [host normaliser hostOf] (sources-a.md:L185) // P1-05:url-canonicalize.ts canonicalizeUrl; agent/url-canon.mjs canonicalizeCitationUrl used by fetch-hold.mjs:59 (mirrors migration 150) [URL canonicaliser] (sources-a.md:L186) // P1-08:scripts/lib/institution-key.mjs:1, scripts/lib/pg-conn.mjs:20, scripts/_reground/free-pass-run.mjs:16, src/lib/sources/institution.ts:10, src/lib/sources/vertical-fit-gate.ts:11, src/lib/sources/identifier-variants.mjs:255 [hostOf, 6 definitions] (harness.md:L184) // P1-10:entity-id.mjs:24; sources/api-transport.mjs:9 [entity-id re-exports host-from-url and shape check; api-transport imports hostFromUrl through crypto module] (flywheel-b.md:L155) // P1-13:research-sweep.mjs:150-158; run-source-sweep.mjs:894-902 (identical bodies) [URL key (lowercase host, no trailing slash, no hash)] (runtimes-b.md:L120) // P1-14:lib/canonicalize-citation-url.mjs:1-7 (null becomes ""); src/lib/agent/url-canon.mjs (null stays null) [canonicalize_citation_url port] (mint.md:L120) // P1-14:validate 322-328, heal 1695-1705, SQL; validate 318, heal 1446; lib/canonicalize-citation-url.mjs and src/lib/agent/url-canon.mjs [duplicated URL, floor and canonicalisation rules across three or four homes] (mint.md:L89) // P1-26:decide:157-166, promote:99-105, bulk-approve:74-91, bulk-import:347-375, scan:331-341, bulk-classify:177-183, pending:96-105 [canonical-URL dedup before a sources insert] (admin-b.md:L173) | P1-03: core/grounding/url-canon // P1-04: import the institution-key helper (B-2195) // P1-05: one `hostOf` in core/url, institution.ts imports it // P1-05: one canonicaliser in core/url; P1-03 owns url-canon today, the merge needs both owners' reads // P1-08: one hostOf in the sources module (P1-05/06); pg-conn's renamed connHost // P1-10: one browser-safe core/entities/id.ts with the hash isolated, or import host-from-url directly (B-1025) // P1-13: one urlKey in core // P1-14: keep the src one; delete the mint copy // P1-14: one module each in core (P1-11 owns the SQL; one JS mirror with a parity test) // P1-26: one findSourceByCanonicalUrl(client, url) in P1-05's registry module, fail closed |
| tier-table | 11 lanes: P1-02, P1-03, P1-04, P1-05, P1-06, P1-08, P1-14, P1-17, P1-19, P1-24, P1-26 | P1-02:types/source.ts 3-51; lib/tier-labels.ts [types/source.ts tier labels for 6 and 7 contradict lib/tier-labels.ts] (workspace.md:L107) // P1-02:sourceStore.ts:107 [sourceStore filterSources ignores tier_override; customer-source-tier.ts applies it] (workspace.md:L227) // P1-03:source-blocks.mjs 1-93 [authority floor per item type, mirror of migration 141 and 202] (intake-a.md:L257) // P1-04:factor-tier.mjs 231-276 [factor-tier is the JS half of the SQL eligibility view] (intake-b.md:L97) // P1-05:skill SKILL.md Section 3; host-authority.ts:53; verification.ts:225-227; recommend-source-tier.ts:20-26; host-authority.ts:168; tier-labels.ts:1-9; trust.ts:610-618 [tier contract (six versions)] (sources-a.md:L183) // P1-05:verification.ts 114-185 [third host-authority table KNOWN_AUTHORITATIVE_PATTERNS beside class table] (sources-a.md:L132) // P1-05:host-authority.ts 549-560; tier-labels.ts 1-9; trust.ts 609-618; verification.ts 224-229; recommend-source-tier.ts 20-26; types/source.ts [six tier vocabularies incl. types/source.ts SOURCE_TIER_DEFINITIONS (outside scope)] (sources-a.md:L137) // P1-05:tier1-priority-jurisdictions.ts; lib/jurisdictions/tiers.ts [jurisdiction priority list contradicts lib/jurisdictions/tiers.ts by 16 + 6 codes] (sources-a.md:L243) // P1-06:CanonicalSourceReview.tsx:876; ProvisionalReviewCard.tsx:319; SourceAdminControls.tsx:729; SourceTierAuditPanel.tsx:133; ProvisionalReviewTable.tsx:303; SourceTierLegend.tsx:35 [tier select 1-7] (sources-b.md:L138) // P1-08:scripts/maintenance/host-verdicts/schema.json [host-verdicts schema.json class enum second copy of HOST_CLASS_TIER keys] (harness.md:L171) // P1-14:validate-mint-payload.mjs:322-328; heal-provenance.mjs:1695-1705; validate_item_provenance SQL (migrations 145, 158, 171, 202) [authority-floor table and REG_FAMILY] (mint.md:L118) // P1-17:customer-source-tier.ts:9; FactCard.tsx:222, SourcesGrid.tsx:16, CredibilityChipAuthority.tsx:90 (literal 7); SourceTierLegend.tsx:95,248 [tier ceiling] (ui-kit.md:L156) // P1-19:lib/jurisdictions/tiers.ts TIER_1_JURISDICTIONS vs lib/tier1-priority-jurisdictions.ts TIER1_PRIORITY_ISOS (A4d:L190, A4d:L339; B-0269) [two Tier-1 jurisdiction lists] (regulations.md:L187) // P1-24:bands.ts [hex colours duplicate the CSS tokens] (dash-search.md:L191) // P1-26:canonical recommend-classification:19-69, sources recommend-classification:18-75; lib/sources/bias-tag-pipeline.mjs; components/ui/BiasChips.tsx [BIAS_TAG_VOCAB and validateBiasTags] (admin-b.md:L176) // P1-26:sources/[id]/bias-tags/logic.ts [bias-tags logic constants duplicate bias-tag-pipeline.mjs ASSIGNMENT_SOURCE vocabulary [HYPOTHESIS]] (admin-b.md:L227) // P1-26:coverage/route.ts reads lib/jurisdictions/tiers [lib/jurisdictions/tiers TIER_1 list disagrees with tier1-priority-jurisdictions.ts] (admin-b.md:L215) | P1-02: the one tier table comes from the TIER-1 lane // P1-02: not stated // P1-03: core/grounding/pool.ts // P1-04: keep the doctrine, wire to the first factor reader // P1-05: one `tier-contract.ts` holding the skill's table as data; HOST_CLASS_TIER, customer labels and any prompt read it // P1-05: verify-candidate.ts // P1-05: one tier-contract.ts // P1-05: coverage module, merged with lib/jurisdictions/tiers.ts // P1-06: one TierSelect over SOURCE_TIERS // P1-08: TRASH // P1-14: one exported floorMaxFor in core next to the SQL mirror, pinned by a parity test (P1-11) // P1-17: `SOURCE_TIER_MAX` everywhere; the `max` prop on TierChip goes // P1-19: one list; this register takes ownership of the merge with sources-b // P1-24: hex read from the tokens, not duplicated // P1-26: one vocabulary in P1-05's bias-tags module // P1-26: not stated |
| region-resolver | 7 lanes: P1-02, P1-06, P1-09, P1-19, P1-21, P1-22, P1-23 | P1-02:NoWorkspaceLanding.tsx:397-406 (REGION_LABELS) beside REGIONS in lib/community/profile-policy.mjs [region labels] (workspace.md:L166) // P1-06:lib/tier1-priority-jurisdictions.ts vs lib/jurisdictions/tiers.ts [two Tier-1 jurisdiction lists that disagree on 22 codes] (sources-b.md:L144) // P1-09:gaps.mjs 1, 3-10 and forward-events/read-upcoming.mjs (B-2150, B-2151) [GENERIC_JURISDICTIONS and jurisdiction-alias limitation text] (flywheel-a.md:L153) // P1-19:constants.ts JURISDICTIONS 84 rows; supabase-server.ts:4027; lib/jurisdictions/iso.ts; jurisdiction-rollup.ts:12; MapPageView.tsx:118-123; MapPageView.tsx:407; regulations-region-link.ts [two jurisdiction vocabularies on one page set (legacy slugs vs ISO)] (regulations.md:L186) // P1-21:operations-matrix.ts 96-126; region-crosswalk.mjs 1-27; OperationsLedger.tsx 132-138; eurostat-lc-lci-lev-parser.mjs:11 (B-2177) [three jurisdiction-to-region resolvers and two roster copies] (research-ops.md:L109) // P1-21:operations-matrix.ts:96-126; region-crosswalk.mjs:13-27 [jurisdiction to region] (research-ops.md:L161) // P1-22:ProfileForm 39-48; types 1-9; profile-policy REGIONS; rooms RoomKey [region labels] (community-a.md:L139) // P1-22:types.ts 1-9; ProfileForm.tsx 39-48; lib/community/profile-policy.mjs REGIONS; lib/community/rooms.ts RoomKey [region vocabulary in four places (MEA vs MEAF)] (community-a.md:L95) // P1-23:profile-policy.mjs:4 REGIONS; shell-context.ts:5-14 COMMUNITY_REGIONS; rooms.ts:23-72; NoWorkspaceLanding.tsx:397-406 labels (workspace.md:166) [region vocabulary] (community-b.md:L162) | P1-02: the label travels with the vocabulary (P1-22/23 owns profile-policy) // P1-06: one list (owner P1-19 regulations or the jurisdictions module) // P1-09: the entity spine's jurisdiction entities (P1-10) replace string equality in both // P1-19: ISO is the one model; the legacy table becomes a legacy-to-ISO map used only where an old row has no jurisdiction_iso // P1-21: one regionsForItem(roster, item) returning all matches in roster order // P1-21: regionsForItem(roster, {jurisdictionIso, jurisdiction}) returning every matching region code in roster order // P1-22: one regions module (P1-23) // P1-22: one regions module (P1-23 owns lib/community) // P1-23: one {code, label} table in profile-policy; rooms keep their fold as a mapping over it |
| cli-skeleton | 9 lanes: P1-04, P1-06, P1-08, P1-09, P1-10, P1-12, P1-13, P1-15, P1-16 | P1-04:apply-classifications.mjs:736, propose-classifications.mjs:204, plan-quarantine-disposition.mjs:295, regen-quarantined.mjs:65 [IS_MAIN guard hand-rolled] (intake-b.md:L144) // P1-06:source-role-cleanup.mjs:62 vs scripts/lib/is-main.mjs [ad hoc IS_MAIN] (sources-b.md:L147) // P1-08:is-main.mjs; IS_MAIN apply-deferrals.mjs:158, canonical-autoverify.mjs:729, derive-obligations.mjs:63, tag-proposals.mjs:113, tag-ratification.mjs:158; argv regex fetch-negative-probe.mjs:101, inconclusive-probe.mjs:191; fetch-desnz-factors.mjs:778; generate-migrations-inventory.mjs:191 [main guards in five forms] (harness.md:L192) // P1-09:propose-tags.mjs 28-78; discover-for-items.mjs 23-54 [argv parsing and target selection] (flywheel-a.md:L156) // P1-09:apply-tags.mjs 444-502, 250, 497-502 [apply-tags CLI half duplicates cli.mjs; discovery half duplicates run-discovery.mjs] (flywheel-a.md:L94) // P1-09:generate-theme-brief.mjs [generate-theme-brief CLI duplicates runCli; second entry to theme-briefs apply] (flywheel-a.md:L101) // P1-10:seed-derived-values.mjs:108, write-statutory.mjs:195, backfill-entities.mjs:193, backfill-derivation-edges.mjs:74, backfill-lineage-edges.mjs:195, seed-corridors.mjs:323, write-entity-scope.mjs:159 [hard-coded no-credential prologue] (flywheel-b.md:L158) // P1-12:export-needs, export-questions, export-themes; apply-need-urls, apply-question-answers, apply-theme-briefs; needs-search/artifact, question-answers/artifact (plus P1-13's) [triplicated export/apply scaffold, three artifact.mjs, three fixture-deps] (runtimes-a.md:L101) // P1-12:export-needs:14-118, export-questions:19-166, export-themes (P1-13 sibling 16-138) [export scaffold] (runtimes-a.md:L145) // P1-12:apply-need-urls:51-294, apply-question-answers:54-326, apply-theme-briefs:85-195 [apply scaffold] (runtimes-a.md:L146) // P1-13:all seven runtimes (e.g. run-fetch-drain.mjs:220-241) [IS_MAIN guard, env-file load, credentials check, createClient] (runtimes-b.md:L124) // P1-15:ecb-fx 196-391, eia 143-326, eu-weekly-oil 22-132, sbti 314-462, ukpn 204-380, neso 90-219, eurostat-lc 65-134, eurostat-nrg 30-75, bls 27-87, eea-hdv 49-57 and 182-256, research-assessment 292-309 and 420-562, research-walker 285-299 and 438-558, grid 89-167, oem 118-196, reroute 116-195, auxiliary 20-79, indexation 32-92 [thirteen copies of one CLI skeleton (parseArgs, three-gate decideApply, read, plan, dry print, guarded write, DAG line, summary, process.exit)] (producers.md:L130) // P1-15:ecb 226-236; eia 172-182; eu-weekly 26-36; sbti 332-336; ukpn 248-257; neso 186-190; eea-hdv 184-190 [parseArgs reading --apply, --input, --trace] (producers.md:L178) // P1-15:ecb 345-350; eia 280-285; eu-weekly 87-92; sbti 409-414; ukpn 352-356; neso 213-214; eea-hdv 250 [the "DRY RUN, nothing written" print loop] (producers.md:L183) // P1-15:grid-queue 89-154, oem-roadmap 118-183, reroute 116-182 (B-0357, B-2215 to B-2217) [the three spec09 rows-file main()s] (producers.md:L184) // P1-15:auxiliary-energy 24-66, indexation 36-79 [the two operator-rows main()s] (producers.md:L185) // P1-15:carrier-ets 198-244 and state-cost 262-307; wrappers carrier 138-157, state-cost 237-255 [fixture harness runner shared by two held producers (runR14HeldFixtureCli with buildRunArtifact wrapper)] (producers.md:L191) // P1-16:run-extraction.mjs 138 to 296 [run-extraction harness plumbing mirrors run-mint-batch and screen-worklist] (obligations.md:L72) | P1-04: the shared scripts/lib/is-main.mjs isMainModule (B-2196, B-2197, B-2209, B-2213) // P1-06: isMainModule; B-2214 // P1-08: one CLI entry that dispatches a family by name // P1-09: runCli plus one selectTargets // P1-09: adoption rules to core/tags/adopt.ts; discovery via runConnectionDiscovery // P1-09: validator joins theme-briefs schema; CLI shell goes // P1-10: one ops runner that checks once // P1-12: the kit (section 8) with a per-kind adapter of export, validate and apply functions // P1-12: kit runExport(kind) // P1-12: kit runApply(kind) // P1-13: one turn entry point (scripts/turn.mjs) // P1-15: one runProducer(spec) in core (section 8) taking a pure parser, a plan function and a write function // P1-15: one argv contract in the runner // P1-15: the runner prints the plan // P1-15: one runRowsFileProducer({ table, entityKind, parseRow, gap }); the three validators stay // P1-15: one runOperatorRowsProducer({ table }) // P1-15: a held producer is the runner with enabled: false; the fixture run is its test // P1-16: the shared envelope in run-artifact.mjs (buildRunArtifactEnvelope) under P1-08 |
| loader | 13 lanes: P1-01, P1-06, P1-08, P1-09, P1-10, P1-12, P1-15, P1-16, P1-18, P1-23, P1-24, P1-25, P1-26 | P1-01:supabase-server.ts:558-575, 2707-2741, 3030-3079, 3086-3114, 3161-3208, 3273-3313 [six empty-fallback read wrappers] (auth-db.md:L159) // P1-01:fetchSourceData 558-575, fetchDashboardData, loadResourcesWithOverridesPayload 3030-3079, loadPublicResourcesPayload 3086-3114, loadMapDataPayload 3161-3208, fetchSettingsData 3273-3313 [six near-identical empty-fallback wrappers and one cache key in one file] (auth-db.md:L101) // P1-06:IntersectionDetectionView.tsx:74-140; ThemesView.tsx:83-139; CanonicalSourceReview.tsx:122-139 [fetch-on-mount loader with loading, error, empty states] (sources-b.md:L142) // P1-08:tag-ratification.mjs:169-184 [page loop beside readAll] (harness.md:L187) // P1-09:run-discovery.mjs 5, 24-35; apply-tags.mjs 497-502; discover-for-items.mjs 99-106 (F45-1, B-2199, B-2200) [connection signature column string and paged corpus loader] (flywheel-a.md:L143) // P1-10:link-items.ts:85-92 and backfill-lineage-edges.mjs:35-45 ("mirrors EXACTLY") [corpus read (id, title, instrument_identifier, non-archived)] (flywheel-b.md:L151) // P1-12:apply-record-briefs.mjs 56-75, 433-458; 254-266 vs 549-807 [four copies of the same jiti lazy loader; APPLY_STEP_ORDER log-only while real order hard-coded] (runtimes-a.md:L97) // P1-15:ecb 34, eia 48, eu-weekly 20, sbti 68, bls 29, eurostat-lc 27, eurostat-nrg 28, research-walker 26, research-assessment 24; inside main in neso 185, eea-hdv 198, plan-drain 268, ukpn 378 [loadLocalEnvFile() at module top / inside main] (producers.md:L190) // P1-16:dispatch-extraction.mjs 3, 11 to 15 [jiti for two relative-import modules] (obligations.md:L76) // P1-18:usePersonalState.ts:34-62; useWorkspaceOverridesHydration.ts:41-74 [hydration hooks (its own line 5 says it mirrors the other)] (shell-list.md:L153) // P1-23:[slug]:28-37, browse:49-58 [loadGroupPageData, loadBrowsePageData exist only for perf logs] (community-b.md:L172) // P1-24:data.ts:698-704 and :712-718 [watchlist read cached twice] (dash-search.md:L156) // P1-24:data.ts [data.ts repeated timeout-and-fallback block, 16 unstable_cache wrappers, 8 getters] (dash-search.md:L98) // P1-25:CoverageMatrixView 171-202, PlatformIntegrityFlagsView 122-163, IntegrityFlagsView 66-99, TierOpinionDisagreementsView 67-100, PendingJurisdictionReviewView 60-93, IngestRejectionsView 55-88, UpcomingObligationsPanel 72-102, CoverageCatalogueView 41-65, CorpusTurnPanel 74-99, ResearchPipelineQueueView 68-101 [fetch-on-mount loader hand-written in ten views] (admin-a.md:L97) // P1-25:the ten sites in section 3 rank 1 [fetch-on-mount loader] (admin-a.md:L135) // P1-26:app/admin/page.tsx :40, :48, :63, :84, :104, :137 [readWithFallback soft-fail readers] (admin-b.md:L143) | P1-01: one readWithFallback(label, fn, empty) // P1-01: per-surface read modules; one readWithFallback(label, fn); clients and describeSupabaseError in core/db // P1-06: one `useAdminFetch(url)` // P1-08: readAll // P1-09: core/flywheel/signature.ts // P1-10: the fetchAllRows form, one function // P1-12: one jiti loader; the 11 steps as a data table executed in order by the kit // P1-15: the runner loads it once // P1-16: plain imports // P1-18: one `hydrateFromBootstrap()` effect in use-bootstrap // P1-24: one cache keyed by (userId, orgId, limit) // P1-24: one cachedRead(key, tag, fetch, { timeoutMs, empty }) in core/cache // P1-25: useAdminFetch(url, deps) // P1-25: useAdminFetch(url, deps) // P1-26: one readWithFallback(label, fn, empty) that logs (the same helper auth-db section 5 proposes) |
| modal | 4 lanes: P1-02, P1-17, P1-18, P1-22 | P1-02:MembersPanel.tsx 558-654; ArchiveDialog.tsx [BanDialog hand-drawn modal; ArchiveDialog hand-drawn Tailwind modal] (workspace.md:L102) // P1-17:11 hand-rolled overlays: community/ReportPostMenu, CommunityRooms, NotificationsBell, GroupModals, ModerationActions; admin/redesign/MembersPanel; profile/MembersPanel; workspace/ArchiveDialog; sources/SourceTierLegend; Sidebar; list-surface/ListSurfaceShell [dialogs] (ui-kit.md:L162) // P1-18:Sidebar.tsx:471-525 (drawer); ListSurfaceShell.tsx:240-317 (FilterSheet) [dialog overlay] (shell-list.md:L156) // P1-18:Sidebar.tsx 441-455 vs 501-518, 156-206, 471-525 vs ListSurfaceShell.tsx 240-317 [two hand-rolled overlays, nav card written twice] (shell-list.md:L118) // P1-22:GroupModals 41-153; ReportPostMenu 137-352; ModerationActions 195-320; CommunityRooms 1523-1682 [modal shell] (community-a.md:L127) // P1-22:Post 116-121; GroupModals 229, 819 [native confirm] (community-a.md:L128) // P1-22:GroupModals.tsx ModalShell 41-153; ReportPostMenu.tsx 137-352; ModerationActions.tsx 195-320; CommunityRooms.tsx CreateGroupModal 1523-1682; NotificationsBell.tsx dropdown 115-140 [five modal implementations] (community-a.md:L88) | P1-02: ui-kit Dialog // P1-17: one `Dialog` primitive in the kit // P1-18: one Sheet (side, bottom) // P1-18: P1-17's Dialog (src/ui/Dialog.tsx) under a side or bottom Sheet placement here; one Wordmark // P1-22: P1-17 Dialog with focus trap, Escape, focus return // P1-22: P1-17 ConfirmDialog // P1-22: one Dialog and one ConfirmDialog from the ui-kit (P1-17) |
| toast | 4 lanes: P1-02, P1-06, P1-22, P1-25 | P1-02:MembersPanel.tsx:111-114, 390-405; OrganizationPanel.tsx:51-54, 190-205 [status flash with 6 s timeout and banner] (workspace.md:L163) // P1-06:SourceAdminControls.tsx:53, 236, 469 [`flash()` timed status] (sources-b.md:L137) // P1-22:PostList 312-335; ui/Toast used by BrowseGroupsGrid and CommunityShell; GroupHeader and ModerationQueue onToast [toast] (community-a.md:L135) // P1-25:TierOpinionDisagreementsView.tsx:74-77; PendingJurisdictionReviewView.tsx:67-70; IngestRejectionsView.tsx:62-65; AdminDashboard.tsx:308-311, BulkImportView.tsx:101-104, IntegrityFlagsView.tsx:73-76, PlatformIntegrityFlagsView.tsx:134-137 [timed status flash] (admin-a.md:L136) | P1-02: `useStatusFlash()` and one `StatusBanner` // P1-06: one `useFlash(ms)` // P1-22: one Toast owned by the Community layout, exposed by context // P1-25: one useFlash(ms); P1-06 names the same helper for SourceAdminControls |
| date-format | 12 lanes: P1-01, P1-02, P1-03, P1-09, P1-16, P1-17, P1-18, P1-20, P1-22, P1-24, P1-25, P1-26 | P1-01:components/auth/AuthFrame.tsx:35-41 [ISO week number (mirrors Masthead.tsx)] (auth-db.md:L157) // P1-01:login/page.tsx:104; signup/page.tsx:137; AuthFrame.tsx:46-51 [masthead date label] (auth-db.md:L158) // P1-02:OnboardingWizard.tsx:28-30; AuthFrame.tsx:44-51 (P1-01 B-0123) [masthead date label from new Date() in render] (workspace.md:L165) // P1-03:timeline-harvest.mjs 1-5; timeline-parse.mjs 1-2; timeline-backfill-derive.mjs 83-85, 151-153, 274-277; derived-consistency.mjs 1-2; gate-a-scan.mjs 18; defect-signatures.mjs 56 [month-name tables and date regexes] (intake-a.md:L198) // P1-09:tags/attribution.ts 44 vs src/lib/format.ts (B-DUP-7) [MONTHS table] (flywheel-a.md:L151) // P1-16:read-register.mjs:169, 537; read-upcoming.mjs:140; read-and-extract.mjs:30; compliance-deadline-sync.mjs:34; dispatch-extraction.mjs:23; rail-select default now (46) [today's ISO date] (obligations.md:L120) // P1-16:read-register.mjs 182 to 185 and 365 to 368 [due-window end date arithmetic] (obligations.md:L121) // P1-17:Masthead.tsx 44-50; auth/AuthFrame.tsx:35 [isoWeekNumber duplicated] (ui-kit.md:L123) // P1-18:format.ts:3, :38; lib/figures/format-range.mjs FIXED_LOCALE (A4:L373, B-0259) [locale constant and month table] (shell-list.md:L162) // P1-20:refresh-published-price-statistics.mjs:54; series-deltas.mjs:48; MarketComparativeRibbon.tsx:209 [UTC day arithmetic] (market.md:L156) // P1-20:market-rail-select.mjs [market-rail-select imports addDaysIso from the producer-side refresher (utility coupling)] (market.md:L194) // P1-22:GroupCard 58-59; GroupHeader 78-80 [7-day activity dot] (community-a.md:L136) // P1-24:row-fields.ts:27-44; WatchlistSurface.tsx:113-127; migration 315's SQL [nearest-future-date maths] (dash-search.md:L145) // P1-24:row-fields.ts:42, :73; WatchlistSurface.tsx:125 [Intl.DateTimeFormat("en-US") inline bypasses formatLocaleDate] (dash-search.md:L176) // P1-25:CorpusTurnPanel.tsx:160-161; PendingJurisdictionReviewView.tsx:187, 277; IngestRejectionsView.tsx:196, 271; ResearchPipelineQueueView.tsx:146-147, 239-240; ErrorGroupsView.tsx:125 [formatRelative(toDate(x)) in render] (admin-a.md:L147) // P1-26:app/admin/page.tsx:211-216, factors:88, inferences:41, parts/masthead:17-23 [formatLocaleDate masthead label] (admin-b.md:L187) | P1-01: import from the ui-kit (P1-17) // P1-01: one formatted label passed down, or Masthead computes it // P1-02: the server-chosen `nowIso` threaded // P1-03: one core/brief/dates.ts with the month table, toIsoDate, and the shared date-token alternation // P1-09: format.ts // P1-16: one todayIsoUtc(); callers pass the render date down // P1-16: one windowEnd(todayIso, days) // P1-17: one `isoWeekNumber` in core (src/core/time/iso-week.ts) // P1-18: format.ts only // P1-20: one addDaysIso // P1-20: one addDaysIso in core // P1-22: one isRecentlyActive(lastActiveAt, now) with a server now // P1-24: dueInfo in features/dashboard/rows, used by the watchlist surface through toListRowFields; the SQL stays the one definition for the due-next read // P1-24: formatLocaleDate // P1-25: P1-17's RelativeTime component // P1-26: the Masthead computes its own label from nowIso (auth-db section 5 proposes the same) |
| client-factory | 13 lanes: P1-01, P1-02, P1-03, P1-05, P1-07, P1-08, P1-09, P1-10, P1-22, P1-23, P1-24, P1-25, P1-26 | P1-01:supabase-service.ts:33-35; provision-personal-workspace.ts:52-56 [service-role client construction] (auth-db.md:L150) // P1-01:supabase-server-client.ts:7-26; proxy.ts:38-57; auth/callback/route.ts:33-48 [cookie-adapter server client] (auth-db.md:L151) // P1-01:supabase-server.ts:50-55 getSupabase() [anon client without cookies] (auth-db.md:L152) // P1-01:supabase-service.ts 25-37, provision-personal-workspace.ts 44-57, supabase-server.ts 50-55, proxy.ts 38-57, auth/callback 33-48 [three client constructions] (auth-db.md:L105) // P1-01:provision-personal-workspace.ts :52-56 [ensureProfile builds its own service client (A4d B-DUP-1)] (auth-db.md:L186) // P1-01:(9 modules) [9 modules still call authHeaders() and fetch themselves (B-0232)] (auth-db.md:L197) // P1-02:resourceStore.ts:14-47 [persistJson over authHeaders plus raw fetch] (workspace.md:L159) // P1-02:viewer-relevance.ts:22-26 [viewer-relevance builds own service client beside P1-01 factory] (workspace.md:L186) // P1-03:canonical-pipeline.ts 154, generate-brief.ts 53, spend-client.ts 150 [three private svc() service-role client builders (the F19 class)] (intake-a.md:L131) // P1-03:canonical-pipeline.ts 154; generate-brief.ts 53; spend-client.ts 150 [service-role client builder svc()] (intake-a.md:L189) // P1-05:recommend-source-tier.ts:29-32 builds its own `createClient` [service client] (sources-a.md:L195) // P1-07:dispatch.ts:26-37; src/lib/supabase-service.ts [service-role client construction] (capture.md:L116) // P1-07:seed-fallback-flag.ts:63-66; supabase-service.ts [env-configured predicate] (capture.md:L117) // P1-07:dispatch.ts:22-37 [dispatch.ts's own Supabase client (A4d B-DUP-1)] (capture.md:L84) // P1-07:capture-error.ts:1; supabase-server.ts:95-97 [capture-error imports getServiceSupabase through supabase-server re-export] (capture.md:L142) // P1-08:db.mjs realWriteClient (:105-113), harness-run-number.mjs buildHarnessRunsClient (:52-60), record-harness-run.mjs runCli (:257-260) [service client construction] (harness.md:L193) // P1-09:analyze-corpus.mjs 40; discover-for-items.mjs 94 (B-2198) [two raw createClient constructions] (flywheel-a.md:L148) // P1-10:seed-derived-values.mjs:113-114; backfill-lineage-edges.mjs:199 [CLIs construct a service client with createClient instead of db.mjs readClient] (flywheel-b.md:L109) // P1-22:GroupCard 414, GroupHeader 472, ModerationActions 404, ModerationQueue 621, Post 594, PostList 340, ReplyComposer 186, ReportPostMenu 357, api-client 229; bare res.json() CommunitySearchResults 83, NotificationsList 142 and 178, GroupModals 198, 732, 763 [33 raw fetch sites and nine safeJson copies] (community-a.md:L90) // P1-23:dispatch.ts:26-37 beside supabase-service.ts (A4d:L56 B-DUP-1) [service-role client construction] (community-b.md:L166) // P1-24:api/ask/route.ts:181-184 [api/ask builds its own service client] (dash-search.md:L213) // P1-25:CorpusTurnPanel.tsx 82-83, 110-111, 142-143 [raw fetch plus authHeaders where siblings use authedFetch (B-0232's class)] (admin-a.md:L173) // P1-26:run-intake/route.ts:39 [run-intake builds its own service client (B-DUP-1 class)] (admin-b.md:L225) | P1-01: ensureProfile takes the shared client // P1-01: callback imports createSupabaseServerClient; proxy keeps its request-bound variant // P1-01: one factory in core/db/clients.ts, or the service client // P1-01: core/db/clients.ts with exactly three factories // P1-01: shared service client // P1-01: PROP-028 lint rule // P1-02: `authedFetch` (P1-01 keeps it) // P1-02: per-viewer wrapper on the P1-01 service client factory // P1-03: import getServiceSupabase from core/db // P1-03: getServiceSupabase() from core/db (P1-01) // P1-05: TRASH with the file // P1-07: getServiceSupabase() // P1-07: drop the hand check; let the sink's client throw // P1-07: getServiceSupabase() // P1-07: should import supabase-service // P1-08: the P1-01 core/db service factory // P1-09: the guarded client from db.mjs, injected // P1-10: one ops entry with one client from core/db // P1-22: api-client grows into the one typed client (communityApi.*) // P1-23: P1-07 capture.md section 8 folds it into the shared client; agreed // P1-24: the caller's client // P1-25: authedFetch (DispatchPanel) // P1-26: shared client |
| rate-limit | 2 lanes: P1-01, P1-26 | P1-01:members/route.ts (26 sites), [org_id]/route.ts (12), invitations (6) [rateLimitHeaders on every response] (auth-db.md:L149) // P1-26:scan:65-84 and :449-454, spot-check:229-248, :263-271 and :402-415 [4-hour cooldown read and stamp] (admin-b.md:L179) | P1-01: a response helper json(body, init, userId) or drop headers from error responses // P1-26: none needed after TRASH; if one survives, one takeCooldown(key, ms) |
| error-mapper | 5 lanes: P1-01, P1-05, P1-15, P1-22, P1-24 | P1-01:accept/route.ts:24-39; decline/route.ts:24-38; [id]/route.ts:41-55 [rpc error-code mapping (42501 to 403, P0002 to 404, 22023 to 409)] (auth-db.md:L155) // P1-05:tier-opinion-writer.ts:47-54 copies supabase-server.ts describeSupabaseError [Supabase error describer] (sources-a.md:L196) // P1-15:fetch-oil-bulletin 121; ecb 238; eia 184; sbti 66; eea-hdv 30; ukpn 44 [class NetworkError extends Error {}] (producers.md:L180) // P1-22:nine copies, section 3 rank 5 [safeJson and the fetch-error pattern] (community-a.md:L130) // P1-24:route.ts:94-109, logic.ts:19-25 [teamOnlyError, paramError, noOrgError builders] (dash-search.md:L158) // P1-24:route-support.ts [403 literal duplicates org.ts] (dash-search.md:L203) | P1-01: one invitationRpcError(error) // P1-05: P1-01's core/db describeSupabaseError // P1-15: one error class in core; exit 3 on it in the runner // P1-22: communityApi.request() // P1-24: one refuse(status, message) // P1-24: refuse(status, message) shared with the watchlist route |

### E.2 Rows whose register names a copy in another lane or outside its scope (215)

| class | mechanism | copies (lane:path) | other lanes named | one home proposed | cite |
|---|---|---|---|---|---|
| date-format | ISO week number (mirrors Masthead.tsx) | P1-01:components/auth/AuthFrame.tsx:35-41 | P1-17 | import from the ui-kit (P1-17) | auth-db.md:L157 |
| other:row-type | bulk-approve declares its own interface ReviewItem | P1-01:src/app/api/admin/canonical-sources/bulk-approve/route.ts:26; supabase-server.ts:4508 | P1-26 | none | auth-db.md:L124 |
| other:uuid | UUID regex | P1-02:archive-impact/route.ts:27; overrides/route.ts:12; personal-state/route.ts:28; relevance.mjs:171; item-collab-shared.mjs:4 | P1-01 | `isUuid()` from core/db (P1-01 plans it); P1-01's five copies and these five become one | workspace.md:L148 |
| guard | owner-or-admin test | P1-02:archive-impact:74; overrides:116; item-collab-shared.mjs:15; BriefingScheduleSection.tsx:73; OrganisationProfileSection.tsx:79 | P1-01 | `isOrgAdmin(role)` from core/auth/membership (P1-01) or this module's roster file | workspace.md:L154 |
| guard | the caller's role re-read | P1-02:overrides/route.ts:106-121 after :42; archive-impact:66-72 after :61 | P1-01 | `requireOrgWriter` returns `{orgId, role}` (P1-01's `resolveMembership`) | workspace.md:L155 |
| client-factory | persistJson over authHeaders plus raw fetch | P1-02:resourceStore.ts:14-47 | P1-01 | `authedFetch` (P1-01 keeps it) | workspace.md:L159 |
| other:chip | ChoiceChip | P1-02:NoWorkspaceLanding.tsx:412-429; OnboardingWizard.tsx:424-460, 518-570; AccountPrimitives Chip | P1-17 | one `Chip` in P1-17 ui-kit | workspace.md:L160 |
| other:heading | section header, 10 px uppercase | P1-02:OnboardingWizard.tsx:637-653, 391-402; NoWorkspaceLanding.tsx:431-458; BriefingScheduleSection.tsx:291-306 | P1-17 | ui-kit `FieldLabel` and `SectionHeading` | workspace.md:L161 |
| other:error-banner | error banner | P1-02:OnboardingWizard.tsx:655-674; NoWorkspaceLanding.tsx:202-214; InvitationLandingPage.tsx:121-133; UserProfilePage.tsx:374-389 | P1-17 | ui-kit `ErrorBanner` | workspace.md:L162 |
| other:save-control | save control "Saved to {workspace}" | P1-02:OrganisationProfileSection.tsx:241-286; BriefingScheduleSection.tsx:260-286 | P1-17 | one `SaveControl` in the ui-kit | workspace.md:L164 |
| date-format | masthead date label from new Date() in render | P1-02:OnboardingWizard.tsx:28-30; AuthFrame.tsx:44-51 (P1-01 B-0123) | P1-01 | the server-chosen `nowIso` threaded | workspace.md:L165 |
| region-resolver | region labels | P1-02:NoWorkspaceLanding.tsx:397-406 (REGION_LABELS) beside REGIONS in lib/community/profile-policy.mjs | P1-22, P1-23 | the label travels with the vocabulary (P1-22/23 owns profile-policy) | workspace.md:L166 |
| other:members-panel | members panel | P1-02:components/profile/MembersPanel.tsx; components/admin/redesign/MembersPanel.tsx | P1-25, P1-26 | one panel, two mounts | workspace.md:L168 |
| modal | BanDialog hand-drawn modal; ArchiveDialog hand-drawn Tailwind modal | P1-02:MembersPanel.tsx 558-654; ArchiveDialog.tsx | P1-17 | ui-kit Dialog | workspace.md:L102 |
| tier-table | types/source.ts tier labels for 6 and 7 contradict lib/tier-labels.ts | P1-02:types/source.ts 3-51; lib/tier-labels.ts | P1-05, P1-06 | the one tier table comes from the TIER-1 lane | workspace.md:L107 |
| other:hook-twin | useWorkspaceBootstrap.ts declares its own PersonalStateItem shape | P1-02:bootstrap/logic.ts:11-18; lib/hooks/useWorkspaceBootstrap.ts | P1-18 | not stated | workspace.md:L127 |
| client-factory | viewer-relevance builds own service client beside P1-01 factory | P1-02:viewer-relevance.ts:22-26 | P1-01 | per-viewer wrapper on the P1-01 service client factory | workspace.md:L186 |
| other:sector-source | two sector sources (profiles.sector_overrides vs workspace_settings.sector_profile) | P1-02:server-bootstrap.ts:167,184,190,195, bootstrap-seed.ts:71; OnboardingWizard.tsx:174-188 | P1-01 | one of the two must go (operator ruling) | workspace.md:L140 |
| tier-table | sourceStore filterSources ignores tier_override; customer-source-tier.ts applies it | P1-02:sourceStore.ts:107 | P1-05, P1-06 | not stated | workspace.md:L227 |
| client-factory | three private svc() service-role client builders (the F19 class) | P1-03:canonical-pipeline.ts 154, generate-brief.ts 53, spend-client.ts 150 | P1-01 | import getServiceSupabase from core/db | intake-a.md:L131 |
| client-factory | service-role client builder svc() | P1-03:canonical-pipeline.ts 154; generate-brief.ts 53; spend-client.ts 150 | P1-01 | getServiceSupabase() from core/db (P1-01) | intake-a.md:L189 |
| other:uuid-regex | UUID regex, three identical literals in one file | P1-03:parse-output.ts 570, 612, 835 | P1-01 | isUuid from core/db (P1-01 ships it) | intake-a.md:L196 |
| guard | error-body gate | P1-03:first-fetch-classify.ts 190 (isErrorBody from entity-gate); canonical-pipeline.ts 1771 | P1-05 | already one body; keep | intake-a.md:L206 |
| hostOf-url-canonicaliser | URL canonicaliser | P1-05:url-canonicalize.ts canonicalizeUrl; agent/url-canon.mjs canonicalizeCitationUrl used by fetch-hold.mjs:59 (mirrors migration 150) | P1-03 | one canonicaliser in core/url; P1-03 owns url-canon today, the merge needs both owners' reads | sources-a.md:L186 |
| guard | scrape hold | P1-05:fetch-hold.mjs:35-54 env SCRAPE_HOLD (fails open); system_state.scrape_cadence read by api/pause.ts and trust.ts:1362-1370 (fails closed) | P1-01 | one `core/fetch/hold.ts` exposing `fetchAllowed(caller)`, failing closed on a read error | sources-a.md:L187 |
| error-mapper | Supabase error describer | P1-05:tier-opinion-writer.ts:47-54 copies supabase-server.ts describeSupabaseError | P1-01 | P1-01's core/db describeSupabaseError | sources-a.md:L196 |
| other:pagination | registerPoolHostsForGrounding hand-paginates beside fetchAllRows | P1-05:source-growth.ts 358-364 | P1-01 | growth.ts | sources-a.md:L136 |
| other:vocab | BIAS_TAG_LABELS twins migration 092's CHECK list | P1-05:credibility/bias-display.mjs | P1-11 | none | sources-a.md:L239 |
| other:pill | pill toggle buttons | P1-06:CanonicalSourceReview.tsx:946-975 (PillPicker); ProvisionalReviewCard.tsx:324-397 (four inline copies) | P1-17 | ui-kit FilterChip (P1-17) | sources-b.md:L132 |
| other:stat-tile | StatBox | P1-06:CanonicalSourceReview.tsx:500-514; IntersectionDetectionView.tsx:202-214; ThemesView.tsx:183-191 | P1-17 | ui-kit StatBlock (P1-17) | sources-b.md:L133 |
| other:heading | Section header block | P1-06:IntersectionDetectionView.tsx:216-226; ThemesView.tsx:193-203 | P1-17 | ui-kit SectionHeading | sources-b.md:L134 |
| other:itemgroup | local ItemGroup | P1-06:CanonicalSourceReview.tsx:545 vs components/ui/ItemGroup.tsx | P1-17 | rename or use the ui part; B-2143 | sources-b.md:L135 |
| other:bands | CONVERGENCE_BANDS | P1-06:ThemesView.tsx:69 vs lib/connections/theme-stats.mjs | P1-09, P1-10 | band from the route payload | sources-b.md:L140 |
| other:bands | score-band labels and engine weights in copy | P1-06:IntersectionDetectionView.tsx:147-149, 171 vs lib/connections/pair-view.mjs:32 | P1-09, P1-10 | band thresholds from the route | sources-b.md:L141 |
| region-resolver | two Tier-1 jurisdiction lists that disagree on 22 codes | P1-06:lib/tier1-priority-jurisdictions.ts vs lib/jurisdictions/tiers.ts | P1-19 | one list (owner P1-19 regulations or the jurisdictions module) | sources-b.md:L144 |
| other:headers | capture-worker header pair | P1-06:inaccessible-triage.mjs:54-67 vs supabase/functions/capture-worker/index.ts | P1-07 | one shared constant module if both survive [HYPOTHESIS] | sources-b.md:L146 |
| other:bias-thresholds | bias-tag preview mirrors bias-tag-pipeline.mjs thresholds 0.80 / 0.65 by hand | P1-06:ProvisionalReviewCard.tsx:41-42 | P1-05 | preview from stored tags | sources-b.md:L168 |
| guard | entries route builds a service client to answer "is this an admin" | P1-06:api/coverage/entries/route.ts:10 | P1-01 | use requireAdmin | sources-b.md:L188 |
| list-variant | LIST_SURFACE_MOBILE_CSS injected twice plus third inline style | P1-06:CoveragePageView.tsx 61, 84, 79-83 | P1-18 | one style injection through the list shell | sources-b.md:L93 |
| other:header-pair | real-browser header pair | P1-07:index.ts:128-141; fsi-app/scripts/sources/inaccessible-triage.mjs:53-60 | P1-08 | one fetch-policy.ts in core/capture imported by the worker, change-detection pass and triage script | capture.md:L115 |
| client-factory | service-role client construction | P1-07:dispatch.ts:26-37; src/lib/supabase-service.ts | P1-01 | getServiceSupabase() | capture.md:L116 |
| client-factory | env-configured predicate | P1-07:seed-fallback-flag.ts:63-66; supabase-service.ts | P1-01 | drop the hand check; let the sink's client throw | capture.md:L117 |
| reader | check-sources due-sources SELECT | P1-07:route.ts:93-101; scripts/turns/run-change-detection.mjs:518-530 | P1-08 | the harness script calls the route and reads sourcesChecked | capture.md:L120 |
| other:uuid-regex | UUID regex | P1-07:stack-hash.mjs:7; P1-01 lists 5 more copies | P1-01 | normaliser keeps its own (g flag), or imports isUuid's pattern from core/db | capture.md:L123 |
| client-factory | dispatch.ts's own Supabase client (A4d B-DUP-1) | P1-07:dispatch.ts:22-37 | P1-01 | getServiceSupabase() | capture.md:L84 |
| other:surface-list | surface list hard-coded twin of the route's probe table (A4d) | P1-07:surface-health.mjs; src/app/api/health/surfaces/route.ts | P1-08 | surface list exported once and read by the probe route (P1-08) | capture.md:L144 |
| client-factory | capture-error imports getServiceSupabase through supabase-server re-export | P1-07:capture-error.ts:1; supabase-server.ts:95-97 | P1-01 | should import supabase-service | capture.md:L142 |
| hostOf-url-canonicaliser | hostOf, 6 definitions | P1-08:scripts/lib/institution-key.mjs:1, scripts/lib/pg-conn.mjs:20, scripts/_reground/free-pass-run.mjs:16, src/lib/sources/institution.ts:10, src/lib/sources/vertical-fit-gate.ts:11, src/lib/sources/identifier-variants.mjs:255 | P1-05, P1-06 | one hostOf in the sources module (P1-05/06); pg-conn's renamed connHost | harness.md:L184 |
| other:constant | dwell bounds under one name | P1-08:quarantine-dwell.mjs:3 (14); flag-age.mjs:3 (30) | P1-12, P1-13, P1-14, P1-15 | two named constants in the runtimes module | harness.md:L186 |
| other:columns | tag signature columns kept in lockstep by hand | P1-08:tag-proposals.mjs:126-127 SIG | P1-09 | export the column list from the proposer | harness.md:L188 |
| other:host-loop | unplaced-host loop | P1-08:enumerate-unclassified-hosts.mjs collectUnresolvedRows; resolve-provisional-sources.mjs export-unplaced (:284-302) | P1-05, P1-06 | one export mode in resolve-provisional-sources | harness.md:L189 |
| other:import | cross-step import for one pure function | P1-08:enumerate-unclassified-hosts.mjs:5, resolve-provisional-sources.mjs:19 import existingTierForHost from canonical-autoverify.mjs | P1-05, P1-06 | existingTierForHost lives in the sources lib | harness.md:L190 |
| other:cache-tags | cache tag names mirrored by hand | P1-08:revalidate.mjs:3-21 vs src/lib/data.ts PUBLIC_ITEMS_TAG, src/lib/cache/revalidate-item.ts | P1-24 | import the tag functions from the one cache module | harness.md:L191 |
| client-factory | service client construction | P1-08:db.mjs realWriteClient (:105-113), harness-run-number.mjs buildHarnessRunsClient (:52-60), record-harness-run.mjs runCli (:257-260) | P1-01 | the P1-01 core/db service factory | harness.md:L193 |
| other:summary | producer summary vs run row | P1-08:writeProducerSummary (emission-factors-common.mjs:211, fetch-desnz-factors.mjs:768,775) | P1-12, P1-13, P1-14, P1-15 | the producer returns outputs to the run frame | harness.md:L194 |
| other:cycle | migration map and diff circular import | P1-08:build-applied-map.mjs / verify/migration-history-diff.mjs | P1-11 | one P1-11 module | harness.md:L195 |
| tier-table | host-verdicts schema.json class enum second copy of HOST_CLASS_TIER keys | P1-08:scripts/maintenance/host-verdicts/schema.json | P1-05, P1-06 | TRASH | harness.md:L171 |
| other:mirror | canonical-key.mjs JS mirror of migration 255 key derivation | P1-08:scripts/lib/canonical-key.mjs | P1-03, P1-04 | KEEP AS-IS (P1-03/04) | harness.md:L237 |
| other:institution | institution-key merge with src institution.ts | P1-08:scripts/lib/institution-key.mjs; src/lib/sources/institution.ts | P1-05, P1-06 | merge with src institution.ts | harness.md:L242 |
| other:ledger | parallel ledgers brief_apply_runs and d3_runs | P1-08:migration 322; d3-runs.ddl.sql | P1-03, P1-04, P1-11 | collapse into the one harness_runs ledger | harness.md:L356 |
| other:pk-snapshot | table-primary-keys hand snapshot | P1-08:scripts/lib/table-primary-keys.mjs | P1-11 | keys read from the P1-11 generated schema | harness.md:L130 |
| region-resolver | GENERIC_JURISDICTIONS and jurisdiction-alias limitation text | P1-09:gaps.mjs 1, 3-10 and forward-events/read-upcoming.mjs (B-2150, B-2151) | P1-10 | the entity spine's jurisdiction entities (P1-10) replace string equality in both | flywheel-a.md:L153 |
| other:vocabulary | CURATED_SYNONYMS and SUPPRESS_OWN_NAME tables; vocabulary lives in P1-03 core/brief/vocab.ts | P1-09:derive-tags.mjs 261-371, 206-215 | P1-03 | the deriver reads vocabulary and synonyms from the one vocabulary module | flywheel-a.md:L93 |
| other:side-channel | signal side channel duplicates a discovery basis (shared regulation identifier = shared entity) | P1-09:signal-candidates.mjs, signal-confidence.mjs | P1-10 | shared-entity basis in discover | flywheel-a.md:L95 |
| other:corridor-parser | corridor canonical_name parser | P1-10:write-entity-scope.mjs:22-32, corridor-scope.ts:12-27, seed-corridors.mjs:208 (inline), market/resolve-item-corridor.mjs:17 (out of scope); lowercase-tolerant variant seed-corridors.mjs:83 | P1-20 | one parseCorridorName in core/entities/id.ts beside corridorSeed | flywheel-b.md:L144 |
| guard | UUID regex | P1-10:item-corrections.mjs:17, admin-api/logic.mjs:4 | P1-01 | core/db isUuid (P1-01) | flywheel-b.md:L152 |
| hostOf-url-canonicaliser | entity-id re-exports host-from-url and shape check; api-transport imports hostFromUrl through crypto module | P1-10:entity-id.mjs:24; sources/api-transport.mjs:9 | P1-05 | one browser-safe core/entities/id.ts with the hash isolated, or import host-from-url directly (B-1025) | flywheel-b.md:L155 |
| other:preview-value | inline Value construction for a preview figure | P1-10:statutory-rows.ts:157-181 toValueShape; MarketSignalDetailSurface.tsx:380-402 (out of scope) | P1-20 | one previewValue(input) builder in core/propagation | flywheel-b.md:L156 |
| cli-skeleton | hard-coded no-credential prologue | P1-10:seed-derived-values.mjs:108, write-statutory.mjs:195, backfill-entities.mjs:193, backfill-derivation-edges.mjs:74, backfill-lineage-edges.mjs:195, seed-corridors.mjs:323, write-entity-scope.mjs:159 | P1-08 | one ops runner that checks once | flywheel-b.md:L158 |
| other:client-interface | seven hand-rolled client interfaces for deleted tests | P1-10:drain.ts 12-30; register-derivation.ts 5-7; infer-from-question.ts 85-87, 236-246; superseded-notices.ts 1-12; signpost-watch.ts 166-174; author-edges.mjs 14-19 | P1-01 | Supabase client type from core/db (P1-01); one injection seam where the new tree's test uses it | flywheel-b.md:L104 |
| other:antitrust-mirror | JS mirror of migration 287's antitrust helpers | P1-10:aggregate-safeguards.mjs | P1-22, P1-23 | computeDominanceShare to P1-22/23; mirrors go | flywheel-b.md:L105 |
| client-factory | CLIs construct a service client with createClient instead of db.mjs readClient | P1-10:seed-derived-values.mjs:113-114; backfill-lineage-edges.mjs:199 | P1-01 | one ops entry with one client from core/db | flywheel-b.md:L109 |
| other:constant | MAX_MERGE_HOPS declared again | P1-10:portfolio-core.mjs:34 vs resolve.mjs | P1-24 | merge follower in core/entities/id.ts | flywheel-b.md:L117 |
| other:statutory | write-statutory re-exports or wraps nine names of statutory-rows.ts and harness-run-number.mjs | P1-10:write-statutory.mjs | P1-08 | features/statutory/rows.ts and one CLI with validate subcommand | flywheel-b.md:L101 |
| cli-skeleton | triplicated export/apply scaffold, three artifact.mjs, three fixture-deps | P1-12:export-needs, export-questions, export-themes; apply-need-urls, apply-question-answers, apply-theme-briefs; needs-search/artifact, question-answers/artifact (plus P1-13's) | P1-13 | the kit (section 8) with a per-kind adapter of export, validate and apply functions | runtimes-a.md:L101 |
| other:identity-key | forward-event identity key, two versions that disagree | P1-12:apply-extraction-output.mjs:57-59 (307 shape); src/lib/intake/flywheel-steps.mjs:13-16 | P1-09, P1-10 | one forwardEventKey in src/core/forward-events, the 307 shape; flywheel-steps (P1-09/10) imports it | runtimes-a.md:L138 |
| other:artifact-emitter | family artifact emitter, same function with drift | P1-12:needs-search/artifact.mjs:14-22; question-answers/artifact.mjs:14-28 | P1-08 | P1-08's recordRun, called once by the kit | runtimes-a.md:L143 |
| other:fixture-db | in-memory fixture database, three files chained | P1-12:theme-briefs, question-answers, needs-search fixture-deps; question-answers/fixture-deps.mjs:20-40 | P1-13 | one fake db in src/features/turns/kit/fixture-db | runtimes-a.md:L144 |
| cli-skeleton | export scaffold | P1-12:export-needs:14-118, export-questions:19-166, export-themes (P1-13 sibling 16-138) | P1-13 | kit runExport(kind) | runtimes-a.md:L145 |
| other:shared-lib | need-target readers in the wrong home | P1-12:question-answers/data.mjs:12-24, 120-142; imported by needs-search/data.mjs:5, raise-term-needs.mjs:10, research-walker.mjs:20 | P1-09, P1-15 | src/core/flags/need-targets | runtimes-a.md:L150 |
| other:contract | duplicate verdict contract | P1-12:ledger-verdicts/schema.json; run-ledger-consume.mjs validateVerdictsFile (P1-13) (B-2192) | P1-13 | none (schema.json TRASH) | runtimes-a.md:L128 |
| other:kind-registry | scripts/drain/kinds.mjs per-kind registry (export argv, batch dir, authoring guide, apply workflow) | P1-12:scripts/drain/kinds.mjs | P1-15 | the kit's kind table replaces it | runtimes-a.md:L259 |
| other:deps-builder | two deps builders mirror maintenance scripts' IS_MAIN wiring; chunkArray beside imported chunk | P1-13:run-population-flywheel.mjs :1052-1136, :504-510 | P1-09, P1-10 | in-process calls into P1-09/10's step functions, no mirrored deps | runtimes-b.md:L73 |
| other:artifact-builder | six hand-assembled run-artifact blocks plus the theme-briefs emitter | P1-13:run-change-detection.mjs:452-485, run-propagation-drain.mjs:424-525, research-sweep.mjs:473-509, run-fetch-drain.mjs:394-443, run-source-sweep.mjs:1369-1416, run-ledger-consume.mjs:1027-1086 | P1-08 | one call into P1-08's run frame (runFamily, src/core/harness/run.ts, recordRun) | runtimes-b.md:L75 |
| other:fixture-db | in-memory PostgREST imitation imported by four production CLIs for --fixture | P1-13:theme-briefs/fixture-deps.mjs; apply-theme-briefs.mjs:12, export-themes-for-briefs.mjs:9, question-answers/fixture-deps.mjs:1, apply-need-urls via question-answers | P1-12 | one test-only fake db in the new test tree | runtimes-b.md:L80 |
| other:polite-fetch | polite fetch (gap, headers, timeout) | P1-13:run-source-sweep.mjs:1075-1111; research-sweep.mjs:386-395; run-ledger-consume.mjs:246-337; export-census-rows.mjs makePoliteFetch (B-2187) | P1-07 | one fetch ladder in P1-07 capture (the run-ledger-consume shape is the most complete), used by every walker | runtimes-b.md:L118 |
| other:html-to-text | HTML to text | P1-13:research-sweep.mjs:172-183; export-census-rows.mjs:299 (P1-14); src/lib/text/html-to-text.mjs | P1-14 | html-to-text.mjs only | runtimes-b.md:L119 |
| other:loop-run-id | loop run id from the sweep row | P1-13:run-fetch-drain.mjs:82-90; run-ledger-consume.mjs:1017-1025 | P1-08 | one P1-08 helper taking the stage name | runtimes-b.md:L121 |
| other:artifact-builder | hand-built run artifact | P1-13:seven files (section 3 rank 4) | P1-08 | P1-08 runFamily / recordRun | runtimes-b.md:L123 |
| other:portal-upsert | portal-link upsert | P1-13:run-source-sweep.mjs:398-414 mirrors persistPortalCandidates (portal-harvest.ts), imported again by apply-need-urls.mjs:240 | P1-03, P1-04 | one guarded persistPortalCandidates in P1-03/04 intake | runtimes-b.md:L127 |
| other:deps-builder | tag step deps | P1-13:run-population-flywheel.mjs:1052-1085, :1097-1136 mirror tag-proposals.mjs and tag-ratification.mjs | P1-09, P1-10 | the P1-09/10 step functions export their own deps builders | runtimes-b.md:L128 |
| other:schema-probe | migration-351 column sniff | P1-13:theme-briefs/data.mjs:27-34; apply-theme-briefs probeStructuredColumns (P1-12) | P1-12 | read the schema once, or require 351 | runtimes-b.md:L132 |
| other:fixture-db | fixture database | P1-13:theme-briefs/fixture-deps.mjs wrapped by question-answers/fixture-deps.mjs | P1-12 | one test fake | runtimes-b.md:L134 |
| tier-table | authority-floor table and REG_FAMILY | P1-14:validate-mint-payload.mjs:322-328; heal-provenance.mjs:1695-1705; validate_item_provenance SQL (migrations 145, 158, 171, 202) | P1-11 | one exported floorMaxFor in core next to the SQL mirror, pinned by a parity test (P1-11) | mint.md:L118 |
| hostOf-url-canonicaliser | canonicalize_citation_url port | P1-14:lib/canonicalize-citation-url.mjs:1-7 (null becomes ""); src/lib/agent/url-canon.mjs (null stays null) | P1-03 | keep the src one; delete the mint copy | mint.md:L120 |
| other:vocabulary | C4 label regexes | P1-14:validate-mint-payload.mjs:296-303; heal-provenance.mjs:2276-2280 | P1-03 | one module (src/lib/agent/analysis-labels.mjs) | mint.md:L121 |
| other:gate-b | Gate B derived coverage | P1-14:heal-provenance.mjs:2664-2679 in memory; src/lib/agent/gate-a-derived.mjs (DB lookup) | P1-03 | the DB lookup, called before the Gate A write | mint.md:L123 |
| other:run-id | run-id allocation | P1-14:screen-worklist.mjs:297-310; run-mint-batch.mjs:590 (claimRunId) | P1-08 | the ledger id (P1-08) | mint.md:L125 |
| other:html-to-text | HTML-to-text | P1-14:export-census-rows.mjs:299-321; src/lib/sources/canonical-fetch.mjs (inline); scripts/turns/research-sweep.mjs | P1-07 | P1-07 capture's one stripper | mint.md:L127 |
| other:fetch-transport | politeness gap and user agent | P1-14:export-census-rows.mjs:1046, 1067-1075; heal-provenance.mjs:1294, 1499; run-source-sweep.mjs | P1-07 | P1-07's one fetch transport | mint.md:L128 |
| other:slot-table | required-slot table | P1-14:item-type-required-slots.json; migration-299-precheck.mjs:13-18; live item_type_required_slots table | P1-11 | the table only | mint.md:L129 |
| other:artifact-enrich | enrich artifact twice | P1-14:run-mint-batch.mjs:412-459; apply-mint-batch.mjs:247-286 | P1-08 | one ledger update (P1-08) | mint.md:L131 |
| other:sql-replica | JS replica of validate_item_provenance C1-C7; regexes mirror migrations 171, 289, 300; floor table a third copy | P1-14:validate-mint-payload.mjs 494-684 | P1-11 | the DB function stays the one gate | mint.md:L85 |
| hostOf-url-canonicaliser | duplicated URL, floor and canonicalisation rules across three or four homes | P1-14:validate 322-328, heal 1695-1705, SQL; validate 318, heal 1446; lib/canonicalize-citation-url.mjs and src/lib/agent/url-canon.mjs | P1-11 | one module each in core (P1-11 owns the SQL; one JS mirror with a parity test) | mint.md:L89 |
| reader | fetchRowsIn chunked-read helper | P1-14:export-census-rows.mjs | P1-01 | core/db fetchAllByIdChunks (P1-01) | mint.md:L84 |
| other:upsert-planner | four create-or-patch planners | P1-15:planMarketSeriesUpsert (src/lib/market), planUpsert in regional-facts-envelope.mjs, planUpsert in ukpn 184-198, planOemUpsert in eea-hdv-co2 59-80; A4c:97 names a fifth in state-cost-facts-envelope.mjs | P1-19, P1-20 | one planKeyedUpsert(existing, incoming, { key, patchable }) in core | producers.md:L136 |
| other:csv-parser | two RFC 4180 CSV parsers | P1-15:eea-hdv-csv.mjs 18-117 (streaming) and src/lib/csv/split.mjs (whole-text, used by operator-rows-contract.mjs:1) | P1-04 | the streaming reader is the one CSV home in core; splitCsvText becomes a wrapper over it | producers.md:L138 |
| other:held-cli | runR14HeldFixtureCli, buildR14HeldRunArtifact, r14ApplyRefusalMessage give two producers a CLI that cannot write | P1-15:scripts/lib | P1-12, P1-13 | a producer spec with enabled: false needs none of them | producers.md:L194 |
| guard | switch.mjs fail-closed drain switch read merges with pause gates | P1-15:scripts/drain/switch.mjs | P1-05, P1-06 | core/drain/switch.ts (P1-05/06's judgement-drain pause read folds in) | producers.md:L249 |
| other:constant | GENERIC_JURISDICTIONS = new Set(["global", "worldwide", "all"]) | P1-16:read-register.mjs:17; read-upcoming.mjs:15; src/lib/connections/gaps.mjs:1 | P1-04 | one constant in core/contracts (P1-04) | obligations.md:L113 |
| reader | chunked verified-item lookup | P1-16:read-register.mjs 294 to 303 and 471 to 480; read-upcoming.mjs 214 to 223 | P1-01 | one fetchVisibleItemsById(client, ids, columns) in core/db, built on fetchAllByIdChunks | obligations.md:L114 |
| other:id-resolver | legacy_id to uuid resolution (both drop error); 14 route files carry const UUID_RE | P1-16:register/route.ts 89 to 92; upcoming/route.ts 74 to 81; relevance.mjs 180 to 183 | P1-01 | one resolveItemId(client, idOrLegacy) beside isUuid() in core/db (P1-01) | obligations.md:L115 |
| other:vocabulary | binding_position vocabulary | P1-16:read-register.mjs:6 to 8; vocabularies.mjs BINDING_POSITION; migrations 290 and 376 CHECKs | P1-04 | read-register imports vocabularies.mjs | obligations.md:L118 |
| other:vocabulary | mode alias and frequency lists mirroring DB CHECKs | P1-16:derive-obligation-objects.mjs:23 to 25; derive-obligations.mjs:20 | P1-04 | one vocabulary (vocabularies.mjs; add the frequencies) | obligations.md:L119 |
| other:constant | 200-character usable-capture floor | P1-16:read-and-extract.mjs:97; canonical-pipeline.ts 1206, 1336 and six more > 200 literals; portal-harvest.ts (named by B-2158, does not exist on this tree) | P1-03 | one constant in the capture module (P1-03) | obligations.md:L126 |
| other:slot-template | [due_date] slot template parsed here and written elsewhere | P1-16:extract-forward-events.mjs 1088 to 1092, 482 to 490, 199 to 202; src/lib/intake/record-facts.mjs 542 to 561 | P1-03 | template strings become one shared constant owned by P1-03 | obligations.md:L128 |
| other:writer | item_forward_events dedupe postures, four writers | P1-16:flywheel-steps.mjs 14 to 17; mint-enrichment.ts 51 to 56; dispatch-extraction.mjs 69 to 81; scripts/turns/apply-extraction-output.mjs | P1-09, P1-10, P1-14 | one insertForwardEvents(client, itemId, events) in this module that every writer calls | obligations.md:L129 |
| cli-skeleton | run-extraction harness plumbing mirrors run-mint-batch and screen-worklist | P1-16:run-extraction.mjs 138 to 296 | P1-08 | the shared envelope in run-artifact.mjs (buildRunArtifactEnvelope) under P1-08 | obligations.md:L72 |
| other:tier-square | tier square | P1-17:Chips.tsx:81-108 (TierChip); FactCard.tsx:205-225 (TierSquare); detail/SourcesGrid.tsx:112-114; admin/TierOpinionDisagreementsView.tsx:392-427 | P1-25, P1-26 | one `TierChip` with a `size` prop; every tier on every surface | ui-kit.md:L155 |
| tier-table | tier ceiling | P1-17:customer-source-tier.ts:9; FactCard.tsx:222, SourcesGrid.tsx:16, CredibilityChipAuthority.tsx:90 (literal 7); SourceTierLegend.tsx:95,248 | P1-05, P1-06, P1-21 | `SOURCE_TIER_MAX` everywhere; the `max` prop on TierChip goes | ui-kit.md:L156 |
| other:bias-labels | bias dimension labels and thresholds | P1-17:bias-display.mjs:35-39; sources/ProvisionalReviewCard.tsx:43-47, :41-42 (thresholds retyped from bias-tag-pipeline.mjs:39-40) | P1-06 | the admin card imports the two constants (P1-06's port) | ui-kit.md:L157 |
| other:bias-chip | bias tag chip | P1-17:BiasChips.tsx:75-86; ProvisionalReviewCard.tsx:273-298 | P1-06 | `BiasChips` with a `confidence` display mode for the admin queue | ui-kit.md:L158 |
| modal | dialogs | P1-17:11 hand-rolled overlays: community/ReportPostMenu, CommunityRooms, NotificationsBell, GroupModals, ModerationActions; admin/redesign/MembersPanel; profile/MembersPanel; workspace/ArchiveDialog; sources/SourceTierLegend; Sidebar; list-surface/ListSurfaceShell | P1-02, P1-06, P1-18, P1-22, P1-23, P1-25, P1-26 | one `Dialog` primitive in the kit | ui-kit.md:L162 |
| other:menu | overflow menu | P1-17:RowTable.tsx:250-371; regulations PriorityDropdown; commandBarKeyboard.ts:18-20 | P1-18, P1-19 | one `Menu` primitive | ui-kit.md:L163 |
| date-format | isoWeekNumber duplicated | P1-17:Masthead.tsx 44-50; auth/AuthFrame.tsx:35 | P1-01 | one `isoWeekNumber` in core (src/core/time/iso-week.ts) | ui-kit.md:L123 |
| other:layering | SectionIndex imports SummaryDepthSwitch from consumer DetailShell (layering inversion) | P1-17:SectionIndex.tsx:41 | P1-19, P1-20, P1-21, P1-22, P1-23, P1-24 | SummaryDepthSwitch moves into the kit | ui-kit.md:L103 |
| other:type | admin attention counts type | P1-18:useAdminAttention.ts:8-19; useWorkspaceBootstrap.ts:46-56 | P1-02 | one type in the bootstrap contract (P1-02) | shell-list.md:L151 |
| modal | dialog overlay | P1-18:Sidebar.tsx:471-525 (drawer); ListSurfaceShell.tsx:240-317 (FilterSheet) | P1-17 | one Sheet (side, bottom) | shell-list.md:L156 |
| other:frame | content frame grid | P1-18:PageFrame.tsx:21-40; ListSurfaceShell.tsx:393-411; SettingsPage.tsx:216-227; WatchlistSurface, CoveragePageView, ObligationRegisterPageView (out of scope) | out of scope, lane not named | PageFrame | shell-list.md:L157 |
| guard | prefix route matching | P1-18:AppShell.tsx:40, app-shell-banner.ts:16, :32; Sidebar.tsx:102, :137 | P1-01 | segment match: `path === r / path.startsWith(r + "/")`, the same fix P1-01 owes route-policy (B-1980) | shell-list.md:L158 |
| other:legend | legend copy | P1-18:ListSurfaceRailCards.tsx:551-578; DashboardBrief legend (A2-part5:L60) | P1-24 | LegendRailCard everywhere | shell-list.md:L166 |
| other:wrapper | BandSectionHeader wraps BandGroupHeader only for a deleted smoke spec | P1-18: | P1-17 | none | shell-list.md:L169 |
| modal | two hand-rolled overlays, nav card written twice | P1-18:Sidebar.tsx 441-455 vs 501-518, 156-206, 471-525 vs ListSurfaceShell.tsx 240-317 | P1-17 | P1-17's Dialog (src/ui/Dialog.tsx) under a side or bottom Sheet placement here; one Wordmark | shell-list.md:L118 |
| other:type | BootstrapOverrideRow, hand-copied shape of WorkspaceOverrideRow | P1-18:src/lib/hooks/useWorkspaceBootstrap.ts:66 | P1-02 | none | shell-list.md:L136 |
| other:token | legacy tokens and per-instance style tags fork theme.css | P1-18:AppShell, Sidebar, PageFrame, PageMasthead, ItemConnectionsCard, ListSurfaceShell, SortRow, SettingsPage | P1-17 | tokens only; responsive rules in one stylesheet per part | shell-list.md:L121 |
| list-variant | list variants that copy frame (Watchlist, Obligation register, Coverage) | P1-18:WatchlistSurface; ObligationRegisterPageView; CoveragePageView | P1-05, P1-06 | ListSurface with slots / PageFrame (owner: sources lane P1-05/06 for Coverage) | shell-list.md:L314 |
| tier-table | two Tier-1 jurisdiction lists | P1-19:lib/jurisdictions/tiers.ts TIER_1_JURISDICTIONS vs lib/tier1-priority-jurisdictions.ts TIER1_PRIORITY_ISOS (A4d:L190, A4d:L339; B-0269) | P1-06 | one list; this register takes ownership of the merge with sources-b | regulations.md:L187 |
| other:surface-classifier | item type to surface classification | P1-19:regulation-item-types.ts:8-19 (third copy); surface-of.mjs SURFACE_RULES; domains.ts domainForItemType | P1-09 | surfaceOf(item) === "regulations" from the routing module P1-09 plans (core/routing/surface.ts) | regulations.md:L188 |
| guard | uuid regex | P1-19:id-redirect.ts:4; supabase-server.ts:3801; plus P1-01's and P1-02's copies | P1-01, P1-02 | isUuid from core/db (P1-01) | regulations.md:L189 |
| other:labels | event kind labels | P1-19:ObligationRegisterFilterBar.tsx:116-123; forward-events/kind-labels.mjs; UpcomingObligationsStripView.tsx:12 re-export | P1-16 | kind-labels.mjs only (P1-16) | regulations.md:L190 |
| other:vocab | TRANSPORT_MODES cast | P1-19:ObligationRegisterFilterBar.tsx:114; ObligationRegisterPageView.tsx:45 | P1-04 | one typed accessor in contracts/vocabularies (P1-04 owns it) | regulations.md:L192 |
| reader | relevance fetch | P1-19:BindingBanner.tsx:111 and RelevanceBadgeClient.tsx:33 both GET /api/detail/relevance | P1-18 | one useItemRelevance(itemId) shared by the banner and the badge | regulations.md:L193 |
| other:component | Legend cards | P1-19:DetailShell.tsx:461 RailLegend vs list-surface LegendRailCard | P1-17 | LegendRailCard (P1-17) | regulations.md:L197 |
| other:menu | PriorityDropdown is the shared row overflow menu living under one surface | P1-19:PriorityDropdown.tsx (8 importers) | P1-17 | P1-17 ui-kit's one overflow menu (src/ui/Menu.tsx) | regulations.md:L136 |
| other:parser | full-brief section parsers placed in two registers (this and intake-a src/core/brief/regulation-sections.ts) | P1-19:extract-regulation-sections 1-350 and 373-446, timeline-parse, source-entry-filter, extract-recommended-actions, parse-record-sections | P1-03 | reader half to core/detail, writer half with intake; one row needs striking | regulations.md:L387 |
| other:parser | SourcesGrid parses all seven sections of the full brief to read one | P1-19:SourcesGrid.tsx:27 | P1-03 | a sources-table parser in core/detail; section 14 extraction stays with intake (P1-03) | regulations.md:L131 |
| other:factor-select | emission factor selection | P1-20:select-modal-factor.mjs:46; carbon-overlay-view.mjs:127; page.tsx:75; factor-tier.mjs resolveActiveFactor (no caller) | P1-04 | one selector over the table | market.md:L155 |
| other:uuid-regex | UUID regex | P1-20:supabase-server.ts:2308 MARKET_ITEM_UUID_RE (and four other copies auth-db.md section 5 lists) | P1-01 | isUuid() in core/db (auth-db.md) | market.md:L160 |
| other:panel-shell | panel header markup | P1-20:IndexationPanelView.tsx:40-47, ReroutingPanelView.tsx:33-40, OemRoadmapPanelView.tsx:33-40, plus operations' AuxiliaryEnergyPanelView and GridQueuePanelView through spec09.css | P1-17 | one SpecPanel shell in the ui-kit (P1-17) | market.md:L165 |
| other:section-heading | page-section header markup (Anton 26 title, 10.5 caption, 2 px rule) | P1-20:MarketSeriesBoard.tsx:59-95; CarbonCostOverlay.tsx:115-150; spec09.css:22-56 | P1-17 | the ui-kit SectionHeading | market.md:L166 |
| other:tile | card tile chrome | P1-20:MarketComparativeRibbon.tsx:458-476 (and BandTile.tsx) | P1-17 | a ui-kit Tile primitive (P1-17) | market.md:L167 |
| other:upsert-key | rowKey declared separately | P1-20:carrier-ets-surcharge-envelope.mjs:52; ukpn-capacity-heatmap-producer.mjs:178 | P1-15 | none | market.md:L134 |
| reader | detail-page related-items queries (RelatedRow, pickRelated, two-query cascade) | P1-21:research/[slug]/page.tsx 18-44, 128-196; operations/[slug]/page.tsx 27-53, 127-206 | P1-19, P1-20 | one relatedItems(client, self, {match, itemType}) in the surface read module, shared with the market and regulations detail lanes | research-ops.md:L110 |
| other:vocab | dimension vocabulary and labels | P1-21:operations-matrix.ts:5-33; OperationsLedger.tsx:91-106; neso-carbon-intensity-producer.mjs:16; migration 378 CHECK | P1-15 | one features/operations/model/dimensions.ts; the producers import the key | research-ops.md:L163 |
| other:absence | absence paragraph and badge | P1-21:RailAbsenceNote.tsx; ResearchFindingDetailSurface.tsx:505-509 and 483-501 | P1-17 | the ui-kit Absence and Badge parts (P1-17) | research-ops.md:L169 |
| other:chip-style | chip and panel styles | P1-21:CredibilityChipShared.tsx:103-138 | P1-17 | ui-kit Chip with an expanding panel (P1-17) | research-ops.md:L170 |
| list-variant | ResearchLedger and OperationsLedger compose ListSurfaceShell identically | P1-21:ResearchLedger, OperationsLedger | P1-17, P1-18 | the P1-17/P1-18 list shell takes a row mapper; each ledger becomes its facets plus its above-rows slot | research-ops.md:L173 |
| other:absence | RailBadge and RailAbsenceNote extracted for a deleted duplicate-code ratchet (F45) | P1-21:RailAbsenceNote.tsx | P1-17 | they belong in the ui-kit | research-ops.md:L175 |
| modal | modal shell | P1-22:GroupModals 41-153; ReportPostMenu 137-352; ModerationActions 195-320; CommunityRooms 1523-1682 | P1-17 | P1-17 Dialog with focus trap, Escape, focus return | community-a.md:L127 |
| modal | native confirm | P1-22:Post 116-121; GroupModals 229, 819 | P1-17 | P1-17 ConfirmDialog | community-a.md:L128 |
| toast | toast | P1-22:PostList 312-335; ui/Toast used by BrowseGroupsGrid and CommunityShell; GroupHeader and ModerationQueue onToast | P1-17 | one Toast owned by the Community layout, exposed by context | community-a.md:L135 |
| region-resolver | region labels | P1-22:ProfileForm 39-48; types 1-9; profile-policy REGIONS; rooms RoomKey | P1-23 | one regions module (P1-23) | community-a.md:L139 |
| other:style | input and button style objects | P1-22:ProfileForm 54-83; GroupModals 1174-1211; CommunityRooms 1684-1695 | P1-17 | P1-17 Input and Button | community-a.md:L141 |
| other:url-roundtrip | onSearchSubmit round-trips EntityPicker queries through the URL | P1-22:PostComposer 157-161 | P1-23 | a small entities search endpoint [HYPOTHESIS] | community-a.md:L144 |
| other:layout-hack | CommunityShell hides the global sidebar by injecting a global style keyed to Sidebar's Tailwind class names | P1-22:Shell 189-200 | P1-18 | P1-18 layout slot | community-a.md:L144 |
| modal | five modal implementations | P1-22:GroupModals.tsx ModalShell 41-153; ReportPostMenu.tsx 137-352; ModerationActions.tsx 195-320; CommunityRooms.tsx CreateGroupModal 1523-1682; NotificationsBell.tsx dropdown 115-140 | P1-17 | one Dialog and one ConfirmDialog from the ui-kit (P1-17) | community-a.md:L88 |
| other:poller | two notification pollers | P1-22:CommunitySidebar.tsx 76-111; useUnreadNotificationsCount (hook :21, :45-69) | P1-18 | one notifications store polled once, visibility-paused | community-a.md:L94 |
| region-resolver | region vocabulary in four places (MEA vs MEAF) | P1-22:types.ts 1-9; ProfileForm.tsx 39-48; lib/community/profile-policy.mjs REGIONS; lib/community/rooms.ts RoomKey | P1-23 | one regions module (P1-23 owns lib/community) | community-a.md:L95 |
| validator | entity-binding validator shared with the route (same validateEntityIds) | P1-22:identity-format.ts :55-58; posts/route.ts:299-301 | P1-23 | delegates to the server's validator | community-a.md:L187 |
| guard | UUID regex | P1-23:17 files under app/api/community and lib/community (member-pref-route.mjs:6 and 16 routes) | P1-01 | P1-01's isUuid() in core/db | community-b.md:L157 |
| region-resolver | region vocabulary | P1-23:profile-policy.mjs:4 REGIONS; shell-context.ts:5-14 COMMUNITY_REGIONS; rooms.ts:23-72; NoWorkspaceLanding.tsx:397-406 labels (workspace.md:166) | P1-02 | one {code, label} table in profile-policy; rooms keep their fold as a mapping over it | community-b.md:L162 |
| client-factory | service-role client construction | P1-23:dispatch.ts:26-37 beside supabase-service.ts (A4d:L56 B-DUP-1) | P1-07 | P1-07 capture.md section 8 folds it into the shared client; agreed | community-b.md:L166 |
| other:membership | oldest-membership rule | P1-23:shell-context.ts:148-153 (org.ts:17-19) | P1-01 | P1-01's resolveMembership | community-b.md:L168 |
| other:constant | length limits | P1-23:groups/route.ts:7 (120, 1,000) vs settings:8 (80, 600) | P1-11 | one constant pair in the group module; the database CHECK decides | community-b.md:L169 |
| other:page-frame | seven sign-in and shell preambles | P1-23:[slug] 1-129, browse 59-185, directory 33-40, discover 24-33, moderation 33-42, profile 19-25, home 135-139 | P1-01 | one communityPage(loader) frame | community-b.md:L118 |
| other:rpc-shape | accept_group_invitation same shape as P1-01's org accept_invitation | P1-23:invitations/[id]/accept/route.ts | P1-01, P1-11 | accept_group_invitation rpc (P1-11) | community-b.md:L194 |
| other:ban | community ban mirroring org-scoped ban of migration 156 | P1-23:moderation [id] ban_user | P1-01 | community_group_bans table checked by join and accept | community-b.md:L419 |
| guard | uuid-or-legacy id split, UUID regex | P1-24:supabase-server.ts:1268-1279; :4779-4780; :4541-4542 and portfolio-core.mjs:30 (auth-db.md lists three more) | P1-01 | one isUuid in core/db and one splitIdsByShape(ids) beside it | dash-search.md:L147 |
| other:fetch-hook | three debounced /api/search fetches | P1-24:CommandBar.tsx:251; PortfolioAddSearch.tsx:80-107; admin/corrections/ItemSearchPicker.tsx:42 | P1-17, P1-25, P1-26 | one useItemSearch(q) hook in features/search | dash-search.md:L151 |
| other:row-menu | row overflow control (PriorityDropdown with WatchButton or Remove) | P1-24:DashboardBrief.tsx:222-239 and :314-331; WatchlistSurface.tsx:361-368; PortfolioDetailView.tsx:123-135 | P1-17 | one RowActionsMenu({ item, actions }) in the ui-kit | dash-search.md:L152 |
| other:surface-vocab | surface vocabulary mapped by hand | P1-24:surface-coverage.ts:50-63; PortfolioDetailView.tsx:48-53; PortfolioAddSearch.tsx:46; DashboardBrief.tsx:370-373 | P1-18 | one surface record { key, label, href, censusClass } beside surfaceOf (P1-18 shell owns the nav vocabulary) | dash-search.md:L154 |
| other:text-input | the 44 px text input | P1-24:PortfolioAddSearch.tsx:134-144; PortfolioDetailView.tsx:217-225; PortfolioIndexView.tsx:135-145 | P1-17 | ui-kit TextInput (P1-17) | dash-search.md:L155 |
| reader | readScrapeState called for the window | P1-24:supabase-server.ts:2830 | P1-05, P1-18 | window read once per request from the same system_state row the shell already reads (P1-18 / P1-05) | dash-search.md:L160 |
| error-mapper | 403 literal duplicates org.ts | P1-24:route-support.ts | P1-01 | refuse(status, message) shared with the watchlist route | dash-search.md:L203 |
| date-format | Intl.DateTimeFormat("en-US") inline bypasses formatLocaleDate | P1-24:row-fields.ts:42, :73; WatchlistSurface.tsx:125 | P1-17 | formatLocaleDate | dash-search.md:L176 |
| other:row-shape | row-fields.ts and list-row-fields.ts one derivation used by every list | P1-24:row-fields.ts; list-row-fields.ts | P1-19, P1-20, P1-21, P1-22, P1-23 | one owner, not two | dash-search.md:L277 |
| loader | fetch-on-mount loader | P1-25:the ten sites in section 3 rank 1 | P1-06 | useAdminFetch(url, deps) | admin-a.md:L135 |
| toast | timed status flash | P1-25:TierOpinionDisagreementsView.tsx:74-77; PendingJurisdictionReviewView.tsx:67-70; IngestRejectionsView.tsx:62-65; AdminDashboard.tsx:308-311, BulkImportView.tsx:101-104, IntegrityFlagsView.tsx:73-76, PlatformIntegrityFlagsView.tsx:134-137 | P1-06 | one useFlash(ms); P1-06 names the same helper for SourceAdminControls | admin-a.md:L136 |
| other:stat-tile | stat tile | P1-25:BulkImportView.tsx:642-681; CoverageMatrixView.tsx:628-669; PlatformIntegrityFlagsView.tsx:606-647; AdminTableView.tsx:156-191 and 197-228; AdminDashboard.tsx tiles via StatBlock 545-568 | P1-17 | one StatCell in the panel kit, or P1-17's StatBlock where the numeral is a count | admin-a.md:L137 |
| other:filter-chip | filter chip | P1-25:PlatformIntegrityFlagsView.tsx:483-511; UpcomingObligationsPanel.tsx:195-209; CoverageMatrixView.tsx 363-388 and 399-418; FlagsRejectionsQueue.tsx 100-124; AccountPrimitives.tsx Chip 264-301 | P1-17 | one FilterChip (44 px, aria-pressed) and one tab button (P1-17's TabRow) | admin-a.md:L138 |
| other:card-shell | card shell with a head bar | P1-25:AdminDashboard.tsx PlateCard 896-950; AdminTableView.tsx AdminPanelFrame 292-342; CorpusTurnPanel.tsx 258-284; MembersPanel.tsx 107-133; AccountPrimitives.tsx AccountCard 20-113 | P1-17 | SectionCard (P1-17) with a head slot | admin-a.md:L140 |
| other:field-style | field style | P1-25:CorpusTurnPanel.tsx fieldStyle 59-70; StatutoryRowsUpload.tsx fieldStyle 58-72; corrections/styles.ts fieldStyle 3-12; AccountPrimitives.tsx inputBase 372-383; MembersPanel.tsx 150-160 and 526-537; AdminDashboard.tsx 822-850 | P1-17 | P1-17's TextInput and TextArea | admin-a.md:L143 |
| other:row-type | member row types | P1-25:AdminDashboard.tsx AdminMemberRow 73-92; OrganizationsTable.tsx MemberRow 51-58; MembersPanel.tsx MemberRow 41-48; WorkspacesUsageRow.tsx MemberRow 29-39 | P1-01 | one OrgMemberRow from P1-01's membership module | admin-a.md:L144 |
| other:row-type | org row type | P1-25:AdminDashboard.tsx 65-71; OrganizationsTable.tsx 43-49; WorkspacesUsageRow.tsx 21-27 | P1-01 | one OrgRow from P1-01 | admin-a.md:L145 |
| date-format | formatRelative(toDate(x)) in render | P1-25:CorpusTurnPanel.tsx:160-161; PendingJurisdictionReviewView.tsx:187, 277; IngestRejectionsView.tsx:196, 271; ResearchPipelineQueueView.tsx:146-147, 239-240; ErrorGroupsView.tsx:125 | P1-17 | P1-17's RelativeTime component | admin-a.md:L147 |
| other:members-panel | two member panels | P1-25:redesign/MembersPanel.tsx; profile/MembersPanel.tsx | P1-02 | one panel (P1-02), two mounts | admin-a.md:L148 |
| other:invite-form | two invitation forms | P1-25:InvitationsPanel.tsx 157-206; profile/MembersPanel.tsx | P1-02 | one form (P1-02); the pending list and revoke join it | admin-a.md:L149 |
| other:stat-tile | stat tiles, chips, th/td, toasts, empty states in five or six copies | P1-25:BulkImportView Stat 642-681, Th 683-695, Td 697-706; CoverageMatrixView StatCell 628-669, Th 671-691, Td 693-712; PlatformIntegrityFlagsView StatCell 606-647, Chip 483-511, FilterLabel 472-481; IntegrityFlagsView Th 393-405, Td 407-425; UpcomingObligationsPanel Chip 195-209, FilterLabel 187-193; TierOpinionDisagreementsView TierChip 392-430; AdminTableView AdminStatCard 156-191, AdminStatCellLarge 197-228, AdminTh/AdminTd 271-288; toasts AdminDashboard 599-621, BulkImportView 455-468, AdminFixedToast 135-150 | P1-17 | one family in the panel kit: StatCell, FilterChip, Th, Td, Toast, EmptyState, PanelFrame; P1-17's Button | admin-a.md:L99 |
| other:members-panel | redesign/MembersPanel beside profile/MembersPanel | P1-25:redesign/MembersPanel.tsx 580 raw; profile/MembersPanel.tsx 654 raw | P1-02 | TRASH here; admin page mounts P1-02's features/account/ui/MembersPanel; TypedConfirmDialog moves to P1-17's Dialog | admin-a.md:L102 |
| other:invite-form | InvitationsPanel beside invite form in profile/MembersPanel | P1-25:InvitationsPanel.tsx 326 raw | P1-02 | list and revoke move into P1-02's one members panel; rest TRASH | admin-a.md:L103 |
| other:empty-frame | AccountPrimitives cards duplicate admin PendingFrame and AdminEmptyDashedFrame | P1-25:AccountPrimitives.tsx | P1-17 | AccountCard becomes SectionCard with a head slot; HonestFrame is the one dashed frame | admin-a.md:L108 |
| hostOf-url-canonicaliser | canonical-URL dedup before a sources insert | P1-26:decide:157-166, promote:99-105, bulk-approve:74-91, bulk-import:347-375, scan:331-341, bulk-classify:177-183, pending:96-105 | P1-05 | one findSourceByCanonicalUrl(client, url) in P1-05's registry module, fail closed | admin-b.md:L173 |
| other:row-builder | the new sources row shape | P1-26:decide:194-219, bulk-approve:168-193, promote via buildPromotedSourceRow (lib/sources/promote-provisional.ts, P1-05) | P1-05 | the one builder | admin-b.md:L174 |
| tier-table | BIAS_TAG_VOCAB and validateBiasTags | P1-26:canonical recommend-classification:19-69, sources recommend-classification:18-75; lib/sources/bias-tag-pipeline.mjs; components/ui/BiasChips.tsx | P1-05 | one vocabulary in P1-05's bias-tags module | admin-b.md:L176 |
| reader | paged "read everything" helper | P1-26:integrity-flags:174-188, intersections:31-42, corpus-turn-requests:45-59, b2-progress:35-42, recompute-trust:46-53, :92-116, inferences/page.tsx:28-31 | P1-01 | fetchAllRows and fetchAllByIdChunks from core/db (P1-01) | admin-b.md:L180 |
| reader | chunked .in("id", ...) item join | P1-26:forward-events:55-71, intersections:56-68, corpus-turn-requests:81-95 | P1-01 | fetchAllByIdChunks | admin-b.md:L181 |
| other:modal | modal-tier helper | P1-26:tier-opinions:14-27 modal(values) | P1-05 | core/util once | admin-b.md:L186 |
| date-format | formatLocaleDate masthead label | P1-26:app/admin/page.tsx:211-216, factors:88, inferences:41, parts/masthead:17-23 | P1-01 | the Masthead computes its own label from nowIso (auth-db section 5 proposes the same) | admin-b.md:L187 |
| other:table-style | inline table styles | P1-26:factors/page.tsx:241-252 beside components/admin/AdminTableView.tsx | P1-17, P1-25 | the ui-kit table (P1-17) | admin-b.md:L188 |
| other:source-decision | three copies of one source decision with three partial-write contracts | P1-26:canonical-sources/decide 255, bulk-approve 231, sources/promote 224 | P1-05 | decideSourceCandidate in features/admin/api/source-decisions.ts | admin-b.md:L135 |
| other:prompt | the two recommend-classification routes are one file (206 shared lines) | P1-26:canonical :19-48, sources :18-47; validateBiasTags :50-69 and :55-75 | P1-05 | TRASH both; vocabulary once in P1-05's bias-tags module | admin-b.md:L136 |
| other:forwarder | two /api/agent/run forwarders identical blocks | P1-26:regenerate:50-137, regenerate-brief:33-112 | P1-13, P1-14 | one POST corpus-turn-requests | admin-b.md:L141 |
| loader | readWithFallback soft-fail readers | P1-26:app/admin/page.tsx :40, :48, :63, :84, :104, :137 | P1-01 | one readWithFallback(label, fn, empty) that logs (the same helper auth-db section 5 proposes) | admin-b.md:L143 |
| tier-table | bias-tags logic constants duplicate bias-tag-pipeline.mjs ASSIGNMENT_SOURCE vocabulary [HYPOTHESIS] | P1-26:sources/[id]/bias-tags/logic.ts | P1-05 | not stated | admin-b.md:L227 |
| other:placeholder-list | command-bar gallery hand-copies placeholder strings of 15 surfaces | P1-26:command-bar/page.tsx :23-95 | P1-17 | read from the surfaces' own constants or dropped | admin-b.md:L144 |

## F. METERED AND EXTERNAL

Source: every model-call, Browserless and external-service site the registers name with its replacement (117 rows). Registers stating they have no such site: P1-02 (workspace.md:L93), P1-09 (flywheel-a.md:L213), P1-10 (flywheel-b.md:L94), P1-14 (mint.md:L73), P1-16 (obligations.md:L238), P1-16 (obligations.md:L40), P1-17 (ui-kit.md:L106), P1-18 (shell-list.md:L107), P1-19 (regulations.md:L123), P1-20 (market.md:L102), P1-21 (research-ops.md:L101), P1-23 (community-b.md:L107).

Rows by service: anthropic 51, other 46, browserless 13, browserless + anthropic 4, none 1, anthropic (haiku) 1, anthropic + browserless 1.

| old site (lane, path:line) | purpose | service | replacement | cite |
|---|---|---|---|---|
| P1-01, api/auth/linkedin/callback/route.ts:121, 157, 158 | LinkedIn OAuth and REST (api.linkedin.com), the only raw fetch to a third party | other:linkedin | TRASH as code; feature recorded for P1-22/23 (NOT PORTED) | auth-db.md:L94 |
| P1-01, @/lib/email/send-invitation-email | invitation email (a stub, returns delivered:false, configured:false always; no email provider) | other:email-stub | not stated (kept as stub; delivery is "copy the link") | auth-db.md:L90 |
| P1-03, canonical-pipeline.ts 485-517 callSonnet (GROUND_MODEL through spendStreamRaw, max_tokens 32000), called at 1937 | extract the claim ledger from brief sections against pool blocks | anthropic | the seam: groundBrief(itemId, caller, { injectedLedger }); session author writes the ledger with every FACT span verbatim from a pool block | intake-a.md:L302 |
| P1-03, canonical-pipeline.ts 523-536 generateBriefText (spendStreamRaw then twoPassGenerate), called at 1014 and 1021 | synthesise brief body and 25 metadata fields | anthropic | the seam: generateBriefFromInjected(itemId, { body, metadata, sourcePoolHash }) into the injected branch of synthesiseAndWriteBrief (925-940) | intake-a.md:L303 |
| P1-03, canonical-pipeline.ts 540-541 callSonnetSearch (spendSearch with web_search), 550-586 discoverCorroborators (called at 1253) | find up to six corroborating sources | anthropic | deterministic identifier resolvers in seek-more.mjs (P1-05) and sources the author cites in the New Sources table, registered via registerBriefSources and growSources; no open-web search runs | intake-a.md:L304 |
| P1-03, canonical-pipeline.ts 601-607 webSearchCandidatesForQuery (spendSearch, 4 uses), injected at 641 | last-resort URL candidates for a roadblocked primary | anthropic | fallback layer removed; persistPrimaryExhaustion (652) surfaces a hold for the session to supply a URL; item kept, never archived | intake-a.md:L305 |
| P1-03, canonical-pipeline.ts 1605-1617 judgeSlotSpan (HAIKU_MODEL through spendStream, 200 tokens), called at 1979 | decide whether a nominated clause supports a required slot | anthropic | session-authored decision: nominateForSlot candidates offered to the author; author confirms as FACT with slot_key or states the GAP | intake-a.md:L306 |
| P1-03, two-pass-generate.mjs 26, 30, 39 (three streamed Sonnet calls) | recover from a truncated synthesis | anthropic | TRASH: a session-authored body has no output cap | intake-a.md:L307 |
| P1-03, first-fetch-classify.ts 239-245 spendMessage (HAIKU_MODEL, 800 tokens) | classify a fetched page | anthropic | existing offline-verdict seam: run-ledger-consume.mjs --verdicts; session author writes the verdict; deterministic parts stay as the validator | intake-a.md:L308 |
| P1-03, haiku-classify.ts 146-153 haikuVerifyCandidate (new Anthropic, messages.create, HAIKU_MODEL, 600 tokens, no ticket) | score candidate source relevance and trust tier | anthropic | tier from the institution class table through the registry (P1-05); relevance session-authored through the verdict-file shape; call TRASH | intake-a.md:L309 |
| P1-03, spend-client.ts 48-148 (spendStreamRaw, spendStream, spendMessage, spendSearch), anthropic-stream.mjs 83-143, anthropic-error.mjs, prompt-cache.mjs | chokepoint, transport, cache, classification | anthropic | TRASH: no caller remains; "every workflow step leaves an agent_runs row with cost 0" (recordRun) | intake-a.md:L310 |
| P1-03, workflows/generate-brief.ts 337-370 reresearchStep (generateBrief forceRefresh) | re-research a brief that grounded below the bar | anthropic | reresearch_only outcome becomes a hold for the session; eraseStep stays as terminal step (INV-002) | intake-a.md:L311 |
| P1-03, src/app/api/ask/route.ts, three admin classification routes, spot-check/recurring, scripts/research/backfill-themes.mjs (out of scope) | assistant, source classification, theme backfill | anthropic | their registers decide | intake-a.md:L312 |
| P1-03, spend-client.ts 104 and 136 (raw fetch to api.anthropic.com); anthropic-stream.mjs 7 (host home); haiku-classify.ts 146 (SDK) | api.anthropic.com external service | anthropic | TRASH (no metered call ported) | intake-a.md:L120 |
| P1-03, generate-brief.ts 492 (raw fetch to /api/cache/revalidate-item) | cache flush after a run | other:app-revalidate-route | workflow (through the P1-01 route guard, not a raw fetch) | intake-a.md:L120 |
| P1-03, item's own source hosts through the P1-07 fetch ladder | primary fetch | other:source-hosts | the fetch primitive is P1-07's; the author reads the pool | intake-a.md:L120 |
| P1-04, src/lib/intake/portal-harvest.ts:328 and :410-420 (firstFetchClassify, Haiku through spend-client) | classify each fetched ledger candidate | anthropic | session-authored verdict file (buildVerdictClassify, classifyGate) as the only classify source, validated by P1-03's validateClassifyVerdict; deterministic rules where they exist; no verdict means skipped, never metered | intake-b.md:L257 |
| P1-04, src/lib/intake/run-intake-cycle.ts:354 and :463 (generateBriefWorkflow, Sonnet generate and ground) | brief-grade grounding after a mint | anthropic | record-only by default (recordOnly branch 425-451); brief grade only through groundBrief(itemId, caller, { injectedLedger }) driven by features/intake/cli/ground-injected.ts | intake-b.md:L258 |
| P1-04, scripts/_reground/tombstone-delete.mjs:49-50 (corpus_census.haiku_verdict) | irreversible delete gated on a stored metered-model verdict | anthropic | deterministic content gate (--empty-only: empty brief AND zero claims, 56-64) plus bucket allowlist (26-37) and active-source precondition (18) | intake-b.md:L259 |
| P1-04, scripts/_reground/executor-ground.mjs:22 (groundBrief with injectedLedger) | FREE by construction | anthropic | kept as the seam (no change) | intake-b.md:L260 |
| P1-04, @/lib/llm/first-fetch-classify.ts:242 (Haiku); canonical-pipeline.ts callSonnet (Sonnet) | external services named | anthropic | (see L257, L258) | intake-b.md:L83 |
| P1-04, BROWSERLESS_API_KEY deleted from env by id-stamp.mjs:8 and target-match-probe.mjs:8 | so no fetch can spend | browserless | not stated | intake-b.md:L82 |
| P1-05, canonical-fetch.mjs:72 | Browserless `/content` POST (plain, then stealth) | browserless | TRASH. The direct transport and the official APIs; a JS shell or bot wall holds NO_REACHABLE_SOURCE through the ladder's exhaustion record, never a paid render | sources-a.md:L115 |
| P1-05, canonical-fetch.mjs:87 | Browserless `/unblock` POST (residential proxy) | browserless | TRASH, same as above | sources-a.md:L116 |
| P1-05, browserless.ts:48 (via canonical-fetch) | typed wrapper used by verification.ts:282, 311, recommend-source-tier.ts:85, bulk-import, fetch-now, spot-check, check-sources routes | browserless | TRASH; those callers move to core/fetch/direct.ts | sources-a.md:L117 |
| P1-05, reachability.mjs:39, 49 | default `render = browserlessFetch` for reachability probe | browserless | core/fetch/reachability.ts over the direct transport (HEAD, then GET on 405) | sources-a.md:L118 |
| P1-05, api-transport.mjs:39, 47, 74 | Federal Register documents JSON, raw_text_url, eCFR versioner XML (not metered) | other:federalregister-ecfr | KEEP behaviour in core/fetch/api.ts | sources-a.md:L119 |
| P1-05, freshness-probe.mjs:43 | HEAD request for Last-Modified and ETag (not metered) | other:http-head | KEEP in features/sources/snapshots.ts, behind the hold gate | sources-a.md:L120 |
| P1-05, fetch-hold.mjs:143 | transportFetch calls injected fetchImpl (not metered) | other:injected | dead; the cache half is kept | sources-a.md:L121 |
| P1-05, verification.ts:919 via haiku-classify.ts | Haiku relevance, freight and trust-tier classification (new Anthropic SDK client outside the spend chokepoint) | anthropic | TRASH as a model call. Tier from the class table; relevance and freight scored by deterministic vertical-fit classifiers plus a session-authored verdict batch | sources-a.md:L122 |
| P1-05, recommend-source-tier.ts:113 | Haiku tier recommendation through spendStream | anthropic | TRASH. Class-table placement and, for an unplaced host, the committed host-verdict batch (host-authority.ts:540-634) | sources-a.md:L123 |
| P1-05, recommend-source-tier.ts:85 | Browserless excerpt for the Haiku prompt | browserless | TRASH with the file | sources-a.md:L124 |
| P1-05, sitemap-walk.mjs, feed-walk.mjs, register-walk.mjs, primary-fallback.mjs, seek-more.mjs | injected fetchBytes, fetchText, fetchHtml, fetchJson, browserlessFetch, webSearch | other:binding-dependent | every binding is the direct transport; `webSearch` has no free binding and stays unbound | sources-a.md:L125 |
| P1-05, first-fetch-classify.ts (upstream of entity-gate.mjs entityVerdict) | Haiku entity verdict, metered upstream (P1-03/04) | anthropic | not stated | sources-a.md:L257 |
| P1-05, bias-tag-pipeline.mjs (upstream) | tags arrive from a Haiku recommendation upstream (outside scope) | anthropic | not stated | sources-a.md:L238 |
| P1-06, CanonicalSourceReview.tsx 209-242 (pre-cache loop), 634-670 (per-card recommendation) via /api/admin/canonical-sources/{bulk-classify,recommend-classification} | Haiku pre-cache classification and per-candidate recommendation | anthropic | one shared SourceClassificationEditor seeded by `classTierForHost` (deterministic) | sources-b.md:L87 |
| P1-06, ProvisionalReviewCard.tsx 90-127 via /api/admin/sources/recommend-classification | Haiku recommendation fetch | anthropic | the shared editor and PillPicker; preview from stored tags, no Haiku call | sources-b.md:L89 |
| P1-06, SourceTierAuditPanel.tsx 44-62 via /api/admin/sources/recommend-tier | Haiku "Recommend tier" | anthropic | TRASH; operator tier changes go through the tier override | sources-b.md:L96 |
| P1-06, inaccessible-triage.mjs:141,150 | raw HEAD and GET to arbitrary source hosts (not metered; $0, no webSearch dep) | other:source-hosts | scripts/sources/inaccessible-triage (kept) | sources-b.md:L81 |
| P1-07, check-sources/logic.ts:83-99 (browserlessRender; canonical-fetch.mjs:72,87 chrome.browserless.io /content and /unblock) | reachability check and fingerprint per source per scrape day | browserless | direct HTTP GET through the shared fetch policy, fingerprint on the decoded text; the 403 alt-fingerprint retry is the one escalation | capture.md:L78 |
| P1-07, capture-worker/index.ts:306 and :317 | fetch source hosts (direct HTTP, free) | other:source-hosts | core/capture/fetch-policy fetchDocument | capture.md:L69 |
| P1-07, Browserless in change-detection (decision (a)) | change-detection pass | browserless | replaced by the shared direct-fetch policy (complete-build-plan section 4, "free only") | capture.md:L235 |
| P1-08, scripts/gen/fetch-desnz-factors.mjs (gov.uk and assets.publishing.service.gov.uk) | DESNZ workbook fetch and parse into a committed fixture | other:gov.uk DESNZ | the producer writes emission_factors through the guarded path; P1-12..15 producer, writing the table | harness.md:L125 |
| P1-08, scripts/maintenance/canonical-autoverify.mjs (polite fetch of candidate source URLs; dry fetches candidate and current URL per row) | rule pending canonical candidates | other:arbitrary candidate source URLs | REFACTOR AND PORT (P1-05/06); rules as a data table | harness.md:L126 |
| P1-08, scripts/lib/revalidate.mjs (deployed app /api/revalidate) | POST tags after writes | other:app /api/revalidate | src/core/cache/revalidate-tags.ts, tag names imported from the cache module | harness.md:L298 |
| P1-08, scripts/lib/pg-conn.mjs:7-10 (pooler candidates in 8 regions) | direct Postgres | other:Supabase Postgres pooler | src/core/db/pg.ts: explicit URL only | harness.md:L296 |
| P1-08, scripts/lib/batch-primitives.mjs isAnthropicRetryable | retry helper (dead, 0 importers) | anthropic | NOT PORTED: no caller | harness.md:L138 |
| P1-09, generate-theme-brief.mjs 24-51 runTheme; 82-101 validates authored payload, stamps generated_by: "session-executor" | theme synthesis by a session, not a model | other:session | KEEP as the theme-briefs schema's validator; bundle export is the theme-briefs export step (scripts/turns/export-themes-for-briefs.mjs) | flywheel-a.md:L218 |
| P1-12, io-preflight.mjs:154 (from :176 and :183, 30 s apart) | GET /customer/v1/privileged/metrics with Basic service_role key (not metered; network, credential, 30 s sleep) | other:supabase-metrics | drop the disk probe; refuse on cooldown read from the last brief-apply harness_runs row; stop on the in-process byte budget (apply-record-briefs.mjs:837-955); decision-ready: keep the probe as an opt-in flag if wanted | runtimes-a.md:L240 |
| P1-12, apply-record-briefs.mjs:629 -> canonical-pipeline.ts:1979 -> :1605-1616 judgeSlotSpan | Haiku through spendStream (HAIKU_MODEL), once per uncovered required slot nomination | anthropic | the injected-ledger ground path never runs slot forcing, an uncovered slot is a refusal [HYPOTHESIS: judge unreachable, proven only by reading] | runtimes-a.md:L241 |
| P1-12, apply-record-briefs.mjs:629 -> canonical-pipeline.ts:1764-1765, 1791-1793 fetchText | direct fetch then the Browserless ladder (browserlessFetch) when no stored pool row or pool read errors | browserless | the injected path requires the stored pool the batch was hashed against; an empty pool or a read error refuses, never fetches | runtimes-a.md:L242 |
| P1-12, canonical-pipeline.ts:1937 callSonnet | Sonnet claim extraction (skipped when the batch supplies the ledger) | anthropic | keep only the injected path in the new tree | runtimes-a.md:L243 |
| P1-12, apply-record-briefs.mjs:682 growSources -> source-growth.ts | registers and credits cited sources (no model, no Browserless) | other:none | unchanged | runtimes-a.md:L244 |
| P1-12, apply-record-briefs.mjs discovery, forward events, entities, lineage | rule-based steps (no model) | other:none | unchanged | runtimes-a.md:L245 |
| P1-12, apply-question-answers.mjs:304-305, apply-record-briefs.mjs:1036-1037, dry-run-structured-actions.mjs:134-138 | raw createClient (database) | other:supabase | P1-01's service client | runtimes-a.md:L246 |
| P1-12, deliver-artifact-branch.sh:76 | node scripts/lib/record-harness-run.mjs (database insert) | other:supabase | in-process P1-08 recordRun | runtimes-a.md:L247 |
| P1-12, ledger-verdicts/README.md:9-20 (doc of run-ledger-consume.mjs --allow-api) | metered Haiku classification (P1-13 file) | anthropic | the session-verdict batch this README defines is the free replacement; the new tree drops --allow-api (P1-13 to confirm) | runtimes-a.md:L248 |
| P1-13, run-ledger-consume.mjs:1560-1562, :1760, :1824 (firstFetchClassify via collectClassifyTelemetry, only with --allow-api, :1726) | Anthropic Haiku classification | anthropic | NOT PORTED. Classification comes only from session verdicts; a candidate with no verdict is skipped and counted as owed (verdicts_owed, :977) and exported for the judgement drain | runtimes-b.md:L189 |
| P1-13, run-ledger-consume.mjs:1801, :1851 (recordOnly default true; --record-only false) | runIntakeCycle's paid grounding contract (portal-harvest.ts:150-154) [HYPOTHESIS on the paid branch] | anthropic | record-only always; the flag is not ported (mint at record grade, P1-14) | runtimes-b.md:L190 |
| P1-13, run-change-detection.mjs:498-514 (POST ${APP_URL}/api/worker/check-sources) | deployed route rendering each due source through Browserless (check-sources/logic.ts:2, :83) | browserless | the change stage calls the check in process over P1-07's free fetch ladder; no Browserless, no HTTP hop to our own app | runtimes-b.md:L191 |
| P1-13, run-ledger-consume.mjs:270-277 (direct fetch), :317 (fetchDocumentApi to federalregister.gov / ecfr.gov) | source hosts and official APIs | other:source-hosts | kept as P1-07's fetch ladder | runtimes-b.md:L192 |
| P1-13, run-source-sweep.mjs:1083-1111 (politeFetch through withFetchTimeout) | EUR-Lex, Federal Register, feeds, sitemaps | other:source-hosts | the same ladder, one gap, one timeout | runtimes-b.md:L193 |
| P1-13, run-source-sweep.mjs:1142, :1159 (Storage download and upload) | Supabase Storage | other:supabase-storage | kept, through a guarded storage writer (B-0329) | runtimes-b.md:L194 |
| P1-13, research-sweep.mjs:388-395 (fetch, no timeout) | research listings and documents | other:source-hosts | the same ladder | runtimes-b.md:L195 |
| P1-13, run-fetch-drain.mjs:328-336 (POST capture-worker) | Supabase Edge Function | other:supabase-edge | P1-07 capture, invoked in process or by function call with a timeout | runtimes-b.md:L196 |
| P1-13, run-population-flywheel.mjs children (:969, :1006, :1022, :1028, :1227) and in-process steps | Supabase only (transitive imports not traced [HYPOTHESIS]) | other:supabase | in-process P1-09/10 step functions | runtimes-b.md:L197 |
| P1-13, run-propagation-drain.mjs (drain.ts, questions-on-change, prediction-scoring) | Supabase only | other:supabase | P1-09/10 | runtimes-b.md:L198 |
| P1-14, scripts/lib/revalidate.mjs (APP_URL, WORKER_SECRET) POST cache flush | cache flush after a mint | other:app-revalidate-route | run.ts (all five surfaces), cache flush including community | mint.md:L72 |
| P1-15, scripts/research/backfill-themes.mjs:72-91 (classifyOne: streamMessagesText with HAIKU_MODEL, 300 max tokens, one call per research finding) | theme classification of null-theme research_finding rows against the closed DB_THEME_VALUE_LIST | anthropic | TRASH. FREE replacement: (a) a rule-based classifier in features/research/theme-rules.ts; (b) the residue becomes a seventh judgement-drain kind theme-classification. No metered call anywhere in the module. | producers.md:L288 |
| P1-15, backfill-themes.mjs:72-82 (streamMessagesText with HAIKU_MODEL) | one LLM call site, reached only through its fixture fake on this tree | anthropic | section 8 names the replacement (above) | producers.md:L124 |
| P1-15, ecb-fx-producer.mjs:243 | ecb.europa.eu daily XML | other:ecb | kept, behind one injectable fetch in the runner (timeouts, one retry policy, Range support) | producers.md:L124 |
| P1-15, eia-v2-petroleum-spot-producer.mjs:198 | api.eia.gov v2, key required (key appended at :195) | other:eia | kept, behind one injectable fetch in the runner; EIA keeps its key as the one documented exception | producers.md:L124 |
| P1-15, fetch-oil-bulletin.mjs:88,111 | energy.ec.europa.eu page scrape and xlsx download | other:ec-energy | kept, behind one injectable fetch in the runner | producers.md:L124 |
| P1-15, sbti-target-dashboard-producer.mjs:341 | files.sciencebasedtargets.org xlsx | other:sbti | kept, behind one injectable fetch in the runner | producers.md:L124 |
| P1-15, eea-hdv-co2-producer.mjs:41 | discomap.eea.europa.eu CSV with a Range header | other:eea | kept, behind one injectable fetch in the runner | producers.md:L124 |
| P1-15, ukpn-capacity-heatmap-producer.mjs:62 | ukpowernetworks.opendatasoft.com catalogue and attachments | other:ukpn | kept, behind one injectable fetch in the runner | producers.md:L124 |
| P1-15, bls-oews-producer.mjs:43 | api.bls.gov v2 POST | other:bls | kept, behind one injectable fetch in the runner | producers.md:L124 |
| P1-15, eurostat-lc-lci-lev-producer.mjs:46 | ec.europa.eu Eurostat dissemination API | other:eurostat | kept, behind one injectable fetch in the runner | producers.md:L124 |
| P1-15, eurostat-nrg-pc-205-producer.mjs:31 | ec.europa.eu Eurostat dissemination API | other:eurostat | kept, behind one injectable fetch in the runner | producers.md:L124 |
| P1-15, neso-carbon-intensity-producer.mjs:179 | api.carbonintensity.org.uk | other:neso | kept, behind one injectable fetch in the runner | producers.md:L124 |
| P1-15, openalex-client.mjs:58 | api.openalex.org | other:openalex | kept, behind one injectable fetch in the runner; core/http/openalex with a 20-second timeout | producers.md:L124 |
| P1-15, drain/switch.mjs:43 | the project's own PostgREST | other:supabase | kept, behind one injectable fetch in the runner | producers.md:L124 |
| P1-15, scripts/research/research-walker.mjs:258-261 (jiti dynamic import of mint-item.ts) | reach the mint chokepoint from a plain-Node script | other:jiti | a direct import in the TypeScript tree (P1-03/04 owns mint-item) | producers.md:L290 |
| P1-15, scripts/producers/research/research-assessment-producer.mjs:343-344 (@supabase/supabase-js createClient, raw service role) | live candidate read | other:supabase | the P1-01 service client factory | producers.md:L291 |
| P1-15, Browserless | none in scope | browserless | nothing to replace | producers.md:L292 |
| P1-19, MapView.tsx:193 (https://{s}.tile.openstreetmap.org) | map tiles, free | other:openstreetmap | src/features/regulations/map/MapView.tsx: Leaflet with visible attribution | regulations.md:L123 |
| P1-19, RegulationDetailSurface.tsx:334 (scoped CommandBar "Ask about this regulation") | hands questions to the assistant route, a metered call owned outside this module [HYPOTHESIS: CommandBar's route not read; /api/ask named metered by intake-a] | anthropic | not stated | regulations.md:L123 |
| P1-21, ResearchLedger.tsx:371-376 ("Why unscored" button dispatches open-ask-assistant) | hands off to the metered assistant /api/ask (claude-sonnet-4-6) | anthropic | the "Why unscored" button links to the scoring explanation in the legend rail card (P1-17 LegendRailCard) | research-ops.md:L101 |
| P1-21, ResearchLedger.tsx:80, OperationsLedger.tsx:506 (searchPlaceholder ask prompt in the list masthead, consumed by ListSurfaceShell) | hands off to the metered assistant /api/ask | anthropic | the masthead ask stays a search; whether the assistant itself survives is the assistant route owner's ruling | research-ops.md:L101 |
| P1-21, operations-ask-context.mjs (feeds src/app/api/ask/route.ts:432) | AVAILABLE OPERATIONS DATA block for a metered route | anthropic | held here until the assistant route has an owner id; src/features/operations/ask-context.ts | research-ops.md:L209 |
| P1-21, OperationsLedger.tsx:227 (fetch /api/listings/rest) | internal raw fetch | other:internal | not stated | research-ops.md:L101 |
| P1-22, (none) | metered model calls: none; no Browserless; env vars none; external services none ("The FREE constraint holds for this module") | none | none | community-a.md:L80 |
| P1-24, api/ask/route.ts:508-519 (spendStreamRaw with SONNET_MODEL) | Assistant generated answer | anthropic | one route of about 150 lines: runSearch, hit rows' own summary, tier and URL, skill passages, Operations facts, structured answer whose citations ARE the hit set; no model, no spend, no env gate | dash-search.md:L91 |
| P1-24, api/ask/route.ts:18 ANTHROPIC_API_KEY, :36 ASSISTANT_ENABLED, :159-168 | key and enablement gates | anthropic | go with the model call; kept as behaviour until the port | dash-search.md:L136 |
| P1-25, AdminDashboard.tsx:332 (authedFetch("/api/admin/scan")), 808-883 | Sonnet plus web_search discovery staged into staged_updates (api/admin/scan/route.ts:112 spendSearch) | anthropic | NOT PORTED as code; served free by the source sweep and the research walker's apply path (P1-12/13) dispatched from DispatchPanel with a topic filter; candidates enter through P1-04 consumePortalCandidates, never a model | admin-a.md:L257 |
| P1-25, IntegrityFlagsView.tsx:110, 312-320 (regenerate) | /api/agent/run Sonnet brief regeneration (regenerate/route.ts:55) | anthropic | NOT PORTED; "re-capture and re-ground": P1-07's capture then P1-03's free grounding (cheap-verify, record-only) | admin-a.md:L258 |
| P1-25, BulkImportView.tsx:94, 393-402 (autoVerify) | lib/sources/verification.ts (Browserless render plus Haiku classification) loaded by bulk-import/route.ts:377 | browserless + anthropic | NOT PORTED; direct HTTP HEAD through P1-05's core/fetch/direct.ts, classTierForHost (P1-05), deterministic source-role classifier (P1-04) | admin-a.md:L259 |
| P1-25, CorpusTurnPanel.tsx:143-149 (mode: "apply") | run-intake-cycle.ts:354, :463 generateBriefWorkflow (Sonnet) | anthropic | PORTED as the record-only cycle (P1-04 intake-b.md section 8 cycle.ts) | admin-a.md:L260 |
| P1-25, AdminDashboard.tsx:125-126, 403, 514-515 and app/admin/page.tsx:37-47 | agent_runs cost sum (spend line) | other:spend-read | NOT PORTED; masthead shows harness run count and open attention total | admin-a.md:L261 |
| P1-25, api/admin/scan/route.ts:112 | spendSearch | anthropic | see L257 | admin-a.md:L91 |
| P1-25, api/admin/integrity-flags/[id]/regenerate/route.ts:55 | /api/agent/run | anthropic | see L258 | admin-a.md:L91 |
| P1-25, lib/intake/run-intake-cycle.ts:354 and :463 | generateBriefWorkflow | anthropic | see L260 | admin-a.md:L91 |
| P1-25, api/admin/sources/bulk-import/route.ts:211, :248, :377; lib/sources/verification.ts:18, :282 | bulk-import autoVerify (Browserless plus Haiku) | browserless + anthropic | see L259 | admin-a.md:L91 |
| P1-25, recurring spot-check route (P1-05's) | spot-check classification | anthropic (Haiku) | the count stays as an attention scalar | admin-a.md:L234 |
| P1-26, canonical-sources/bulk-classify:108 | Haiku classification of up to 30 candidates | anthropic | classifySource(host, name, parentItem) = classTierForHost plus name rules (P1-05), classifySourceRole, domains and jurisdictions from parent item, bias tags from institution-class table (P1-05); computed at read time | admin-b.md:L302 |
| P1-26, canonical-sources/recommend-classification:199 | Haiku classification of one candidate | anthropic | same replacement | admin-b.md:L303 |
| P1-26, sources/recommend-classification:185 | Haiku classification of a provisional source | anthropic | same replacement | admin-b.md:L304 |
| P1-26, sources/recommend-tier via lib/sources/recommend-source-tier.ts | tier recommendation (Haiku and Browserless) | anthropic + browserless | the tier audit panel shows classTierForHost beside base_tier | admin-b.md:L305 |
| P1-26, sources/bulk-import:211 (Browserless head check), verification.ts:919 (classifyWithHaiku via verifyCandidate :434, :501) | per-row reachability and verification | browserless + anthropic | plain HEAD fetch for reachability, deterministic tier, dry-run preview kept | admin-b.md:L307 |
| P1-26, verification.ts:282 and :311 | Browserless inside verification | browserless | (bulk-import replacement) | admin-b.md:L128 |
| P1-26, sources/[id]/fetch-now:44 | manual page fetch | browserless | the free fetch primitive (P1-07) behind decideFetchOutcome | admin-b.md:L312 |
| P1-26, integrity-flags/[id]/regenerate:55 | /api/agent/run Sonnet brief regeneration | anthropic | POST corpus-turn-requests {itemId} (reason manual), turn runtime re-ground (P1-13, P1-14), outcome in harness_runs | admin-b.md:L317 |
| P1-26, sources/[id]/regenerate-brief:38 | /api/agent/run for the source's URL | anthropic | the same queue by sourceId | admin-b.md:L318 |
| P1-26, run-intake (apply inside runIntakeCycle) | paid grounding on apply | anthropic | apply = the free record-only cycle (P1-04's free path) | admin-b.md:L320 |
| P1-26, scan:196 (spendSearch) | Sonnet web_search discovery | anthropic | dispatch a source sweep and sitemap walk turn (P1-13) and the portal harvest (P1-04); the button stays | admin-b.md:L321 |
| P1-26, spot-check/recurring:63, :74 (Browserless); :100 (Haiku) | calibration spot-check | browserless + anthropic | NOT PORTED: classifier replaced by a deterministic one | admin-b.md:L322 |
| P1-26, fetch-now API ladder (EIA_API_KEY, NREL_API_KEY, DATA_GOV_API_KEY, REGULATIONS_GOV_API_KEY) | four US data APIs (free, keyed) | other:us-data-apis | not stated (kept inside source-controls fetch-now) | admin-b.md:L128 |

## G. RULINGS OWED

Source: every line a register labels "ruling owed", "needs a ruling", "gap(s) for the coordinator", "design change owed", "decision-ready", "rulings to settle" or "rulings owed" (210 rows extracted; 210 after removing rows with identical question text). Near-identical questions raised by two lanes stay as separate rows with both cites. Ids are assigned here in lane order.

| id | lane | the question in one sentence | the options the register gives | register section | label in the register | cite |
|---|---|---|---|---|---|---|
| G-001 | P1-01 | Which module ids own the five customer-surface read layers supabase-server.ts carries (dashboard, lists, detail, watchlist, operations, market, research)? | assigned to "surface read modules", ids owed | 8 Interface | Gap for the coordinator | auth-db.md:L280 |
| G-002 | P1-01 | src/lib/data.ts (1,148 lines) is in no Part 1 scope this lane can see | none given | 8 Interface | Gap for the coordinator | auth-db.md:L280 |
| G-003 | P1-01 | surface read modules ids owed for supabase-server.ts 99-5048 | none given | 8 New files | ids owed | auth-db.md:L261 |
| G-004 | P1-02 | disposition of components/pages/SettingsPage.tsx decides whether settings is one feature or two | none given | 8 Interface | Gaps for the coordinator (1) | workspace.md:L299 |
| G-005 | P1-02 | owner of src/lib/tags/* and src/lib/portfolio/* (in no listed scope) | none given | 8 Interface | Gaps for the coordinator (2) | workspace.md:L299 |
| G-006 | P1-02 | owner of src/lib/hooks/useWorkspaceBootstrap.ts and usePersonalState.ts | none given | 8 Interface | Gaps for the coordinator (3) | workspace.md:L299 |
| G-007 | P1-02 | which sector source goes: profiles.sector_overrides or workspace_settings.sector_profile; the ruling is the operator's | brief points at the tenant column (sector_profile) | 8 Interface | Gaps for the coordinator (4) | workspace.md:L299 |
| G-008 | P1-02 | profiles.sector_overrides half-slice, two sector sources | none given | 4 Dead code | Owed to P1-01 and this module jointly | workspace.md:L140 |
| G-009 | P1-02 | portfolios logic owner (lib/portfolio/portfolio-core.mjs) | none given | 7 File register | owner owed | workspace.md:L200 |
| G-010 | P1-02 | named saved views feature | workspace-scoped table | 3 Bloat | the ruling it needs (a workspace-scoped table) | workspace.md:L104 |
| G-011 | P1-02 | SavedSearchesSection feature recorded with the ruling owed | none given | 7 File register | ruling owed | workspace.md:L217 |
| G-012 | P1-02 | named saved searches as workspace-scoped saved view | none given | 8 Features | needs a ruling and a table | workspace.md:L394 |
| G-013 | P1-02 | DataSummary not ported; Coverage page answers it [HYPOTHESIS] | none given | 8 Features | a ruling confirms the settings card is not wanted | workspace.md:L395 |
| G-014 | P1-02 | SettingsPage ruling in port order | none given | 8 Port order | then the SettingsPage ruling (gap 1) | workspace.md:L342 |
| G-015 | P1-02 | second members panel | retire or share | 3 Bloat | admin copy is P1-25/26's to retire or share | workspace.md:L102 |
| G-016 | P1-02 | sourceStore new home | P1-05/06 or P1-25/26 | 7 File register | to P1-05/06 sources, or P1-25/26 admin | workspace.md:L227 |
| G-017 | P1-03 | the coordinator's row list for P1-04 onward should be checked the same way (grep -c before trusting register rows) | none given | 1 Header | the coordinator's row list ... should be checked | intake-a.md:L5 |
| G-018 | P1-03 | whether the admin health tile shows historical agent_runs spend | none given | 7 File register | the admin tile's owner decides | intake-a.md:L286 |
| G-019 | P1-03 | fate of out-of-scope metered callers (api/ask, admin classification routes, spot-check/recurring, backfill-themes) | none given | 8 Model call sites | their registers decide | intake-a.md:L312 |
| G-020 | P1-03 | which Part 1 id owns the detail-surface parsers (regulation sections, record sections, recommended actions) | ported under core/brief, id left owed | 8 Interface | Gaps for the coordinator (1) | intake-a.md:L361 |
| G-021 | P1-03 | which id is the Operations surface read module that owns operations-matrix.ts | the same owed id P1-01 named | 8 Interface | Gaps for the coordinator (2) | intake-a.md:L361 |
| G-022 | P1-03 | ruling on the metered assistant route /api/ask (skill-loader.ts, operations-ask-context.mjs wait on it) | none given | 8 Interface | Gaps for the coordinator (3) | intake-a.md:L361 |
| G-023 | P1-03 | fate of admin classification routes and spot-check/recurring under the free rule | P1-25/26 decides | 8 Interface | Gaps for the coordinator (4) | intake-a.md:L361 |
| G-024 | P1-03 | whether the assistant skill subset is ported | none given | 8 Features | the assistant route's owner decides | intake-a.md:L444 |
| G-025 | P1-03 | whether the health tile shows the agent_runs spend history | none given | 8 Features | P1-25 decides | intake-a.md:L445 |
| G-026 | P1-04 | which lane owns the item-taxonomy rule set (domains.ts, extract-registry, surface-of.mjs) | source-axis code assigned to P1-05; item-taxonomy owner not named | 8 Interface | Gaps for the coordinator (1) | intake-b.md:L251 |
| G-027 | P1-04 | where the four-surface contract assessment (surface tags) lives once the metered call is not ported | section 8 rulings | 8 Interface | Gaps for the coordinator (2) | intake-b.md:L251 |
| G-028 | P1-04 | one verbatim semantics for every FACT span check | database criterion 3 for all callers, or keep producers' whitespace-insensitive case-sensitive variant as a named second mode; recommendation: one rule, the database's | 8 Rulings to settle | Rulings to settle 1 | intake-b.md:L295 |
| G-029 | P1-04 | record payload fields with no column (binding_position, due_date, date_precision, corridor_identity, research_credibility) | add columns, route to obligations, or stop computing; recommendation: route to obligations and stop the item lift | 8 Rulings to settle | Rulings to settle 2 | intake-b.md:L296 |
| G-030 | P1-04 | deferral window 30 days vs the 14-day dwell bound | cap deferrals at 14 days, or keep 30 and state it | 8 Rulings to settle | Rulings to settle 3 | intake-b.md:L297 |
| G-031 | P1-04 | non-metered home for surface tags | session verdict file carries surface_tags, or a rule from item_type through surfaceOf; recommendation: verdict file with surfaceOf fallback | 8 Rulings to settle | Rulings to settle 4 | intake-b.md:L298 |
| G-032 | P1-04 | update_item column allowlist | recommendation: allowlist content and date columns in apply-staged-update.ts:55-66 and refuse the rest | 8 Rulings to settle | Rulings to settle 5 | intake-b.md:L299 |
| G-033 | P1-04 | two grandfathered source-less ids are data for a ruling, not code | none given | 6 Non-essential | a ruling | intake-b.md:L158 |
| G-034 | P1-04 | DEFERRAL_WINDOW_DAYS 30 vs 14-day dwell; isValidDeferral no upper bound | (see L297) | 7 File register | section 8, Rulings to settle | intake-b.md:L204 |
| G-035 | P1-05 | OECD/IEA/World Bank/IPCC placement: T2 in code, T3 in the skill | T2 (code) or T3 (skill) | 5 Duplicates | a ruling for the operator, decision-ready in section 8 | sources-a.md:L183 |
| G-036 | P1-05 | whether OECD, IEA, World Bank, IPCC sit at class gov (T2) or T3 per skill table | T2 as in host-authority.ts:53, or T3 (skill rationale argues for T3); re-tier migration is P1-11's | 8 Rulings | Decision-ready for the operator (rule 13) | sources-a.md:L370 |
| G-037 | P1-05 | coverage module lane id for tier1-priority-jurisdictions.ts | none given | 7 File register | id owed | sources-a.md:L243 |
| G-038 | P1-05 | owner of coverage/identity.mjs classifyIdentifier | none given | 8 Interface | owner id owed | sources-a.md:L338 |
| G-039 | P1-05 | URL canonicaliser merge with P1-03's url-canon.mjs | none given | 5 Duplicates | merge needs both owners' reads | sources-a.md:L186 |
| G-040 | P1-05 | diff to timeline-event candidates wired to item_timelines by P1-09 or recorded as dropped | wired by P1-09, or recorded as dropped | 8 Features | recorded as dropped by its owner | sources-a.md:L452 |
| G-041 | P1-06 | whether the Haiku recommendation layer (pre-cache, per-candidate, recommend-tier) on metered routes is dropped | register ports editor seeded by classTierForHost and drops the Haiku layer | 8 Rulings | Rulings owed (1) | sources-b.md:L280 |
| G-042 | P1-06 | whether SourceTierAuditPanel's base_tier commit (second tier path) is kept | register keeps only tier_override | 8 Rulings | Rulings owed (2) | sources-b.md:L280 |
| G-043 | P1-06 | whether canonical and provisional queues stay as operator overrides (RD-20 says intake has no human resting state) | register ports them as overrides with that copy | 8 Rulings | Rulings owed (3) | sources-b.md:L280 |
| G-044 | P1-06 | owner of customer-facing source rating and bias display if neither P1-05 nor P1-17 lists it | P1-05 sources-a or P1-17 ui-kit | 8 Interface | Gap for the coordinator | sources-b.md:L254 |
| G-045 | P1-06 | new invoker for health endpoints, inaccessible-triage and the two registry scripts | name a new invoker for each, or the operator rules them off | 8 Interface | Gap for the coordinator (health wiring) | sources-b.md:L255 |
| G-046 | P1-06 | invoker for features/health/api | new invoker or operator ruling none | 8 Port order | name the new invoker (or record the operator's ruling) | sources-b.md:L295 |
| G-047 | P1-06 | invokers for the three scripts | none given | 8 Port order | each with its invoker named | sources-b.md:L297 |
| G-048 | P1-06 | relevance band parsed from census_worklist notes free text | read a column, or name the debt | 8 Data model | the port should read a column if one exists or name the debt | sources-b.md:L241 |
| G-049 | P1-06 | Haiku tier recommendation and base_tier commit NOT PORTED | see rulings (1), (2) | 8 Features | ruling owed (1), (2) | sources-b.md:L311 |
| G-050 | P1-06 | Pre-cache AI classifications NOT PORTED | see ruling (1) | 8 Features | ruling owed (1) | sources-b.md:L316 |
| G-051 | P1-06 | which Tier-1 list is authoritative | P1-19 or the jurisdictions module | 8 Port order | after the jurisdictions owner settles the one Tier-1 list | sources-b.md:L294 |
| G-052 | P1-07 | Which lane ids own the bootstrap route, the admin Errors tab and src/lib/data.ts, consumers with no id in the brief's list? | P1-02 or P1-18 (bootstrap); P1-25/26 per P1-01 (Errors) | 8 Interface | Gap for the coordinator | capture.md:L206 |
| G-053 | P1-07 | Browserless leaves the change-detection pass, replaced by shared direct-fetch policy | ratify / reverse | 8 Rulings | coordinator ratifies or reverses (a) | capture.md:L235 |
| G-054 | P1-07 | Seed-fallback integrity flag becomes an error_events group through the sink (admin reads it in Errors, not Platform flags) | ratify / reverse; a DESIGN CHANGES OWED line for the admin artboard | 8 Rulings | coordinator ratifies or reverses (b) | capture.md:L235 |
| G-055 | P1-07 | The two revalidate routes merge | ratify / reverse | 8 Rulings | coordinator ratifies or reverses (c) | capture.md:L235 |
| G-056 | P1-07 | The D3 hooks are not ported | ratify / reverse | 8 Rulings | coordinator ratifies or reverses (d) | capture.md:L235 |
| G-057 | P1-07 | Remove capture_worker_fetch rpc and its vault secret once the harness dispatcher is the one invoker (a migration and therefore a ruling) | none given [HYPOTHESIS] | 8 Rulings | coordinator ratifies or reverses (e) | capture.md:L235 |
| G-058 | P1-07 | Seed-fallback activation read by admin in Errors | none given | 8 Features | DESIGN CHANGES OWED | capture.md:L288 |
| G-059 | P1-07 | The invitation email provider is an operator decision | none given | 7 File register | operator decision | capture.md:L152 |
| G-060 | P1-08 | Do brief_apply_runs and the unapplied d3_runs collapse into the one harness_runs ledger? | none given | 8 Data model | ruling owed by P1-11 and P1-03/04 | harness.md:L356 |
| G-061 | P1-08 | P1-12..15 named as one range; producers, drains and quarantine assigned without a finer id | none given | 8 Interface | Gap for the coordinator | harness.md:L363 |
| G-062 | P1-08 | src/lib/d3/hooks.mjs should call recordRun | none given | 8 Features | owner outside this module | harness.md:L462 |
| G-063 | P1-09 | Does the "tags derived, never customer-entered" rule retire customer workspace tags (src/lib/tags)? | (a) the rule retires customer workspace tags / (b) the rule is about derived fields and workspace tags are a filing feature outside it (working assumption) | 2 Module verdict | The one tension, for the coordinator | flywheel-a.md:L87 |
| G-064 | P1-09 | No lane for the item-identity helper (resolveItemUuid) or the theme-briefs apply | none given | 8 Interface | Gap for the coordinator | flywheel-a.md:L274 |
| G-065 | P1-09 | P1-10: corpus pass authors derivation edges; propagation event re-runs discovery | none given | 8 Interface | Interface owed | flywheel-a.md:L270 |
| G-066 | P1-09 | Item-identity helper home | none given | 5 Duplicates | id owed by the coordinator | flywheel-a.md:L145 |
| G-067 | P1-09 | Customer workspace tags move to P1-02 | none given | 8 Features | pending the ruling in section 2 | flywheel-a.md:L346 |
| G-068 | P1-10 | Should a correction emit an event (a migration), and what does it invalidate? | none given | 8 Gaps | Gaps for the coordinator 1 / Ruling owed | flywheel-b.md:L377 |
| G-069 | P1-10 | derivation_edges allowlist excludes items and claims; entity_refs has no outbox trigger | widening the allowlist (migration 339) | 8 Gaps | Gaps for the coordinator 2 | flywheel-b.md:L378 |
| G-070 | P1-10 | Is the FuelEU computation a Regulations surface feature in the rebuild, and who supplies ship-year MRV inputs? | none given | 8 Gaps | Gaps for the coordinator 3 / Ruling owed | flywheel-b.md:L379 |
| G-071 | P1-10 | No invoker of the drain; P1-08 decides the invoker | none given | 8 Gaps | Gaps for the coordinator 4 | flywheel-b.md:L380 |
| G-072 | P1-10 | Licence posture of the five UN/LOCODE names (B-0258) | none given | 8 Gaps; 6 | Gaps for the coordinator 5 / A ruling is owed | flywheel-b.md:L381 |
| G-073 | P1-10 | Module ids owed for detail read, market surface, learning module | none given | 8 Gaps | Gaps for the coordinator 6 | flywheel-b.md:L382 |
| G-074 | P1-10 | fireSignpost is three writes; ruling on an RPC belongs with the port | as one RPC if a migration is ruled | 8 Gaps | Gaps for the coordinator 7 | flywheel-b.md:L383 |
| G-075 | P1-10 | FuelEU 2030-2050 targets transcribed but unimplemented | none given | 8 Gaps | Gaps for the coordinator 8 / implementing them is a ruling | flywheel-b.md:L384 |
| G-076 | P1-10 | INV-187 vs partitionLineageWrites: which wording does the port enforce? | INV-187 wording / INV-206 exception | 8 Gaps | Gaps for the coordinator 9 / a ruling decides | flywheel-b.md:L385 |
| G-077 | P1-10 | drain invoker | none given | 8 Interface | the drain invoker itself is P1-08's to rule | flywheel-b.md:L298 |
| G-078 | P1-10 | MarketSignalDetailSurface preview figure passes undefined to lifecycle and pedigree helpers | none given | 8 What runs today | owner: the market surface lane, gap 6 | flywheel-b.md:L230 |
| G-079 | P1-12 | Keep the io-preflight disk probe? | drop it / keep the probe as an opt-in flag if wanted | 8 Call sites | Decision-ready for the operator | runtimes-a.md:L240 |
| G-080 | P1-12 | Does the new tree drop run-ledger-consume --allow-api? | none given | 8 Call sites | P1-13 to confirm | runtimes-a.md:L248 |
| G-081 | P1-12 | Drop brief_apply_runs with a migration once the kit's cooldown ships? | drop with a migration once the kit's cooldown ships | 8 Data model | Decision-ready | runtimes-a.md:L289 |
| G-082 | P1-12 | Apply migration 334 and turn structured-actions into a guarded write, or retire the step? | apply 334 and turn the structured-actions step into a guarded write of extractRecommendedActions output / retire the step | 8 Data model | Decision-ready for the operator | runtimes-a.md:L290 |
| G-083 | P1-12 | Structured-action extraction preview feature home | decision-ready (data model, migration 334) | 8 Features | decision-ready | runtimes-a.md:L357 |
| G-084 | P1-12 | Rule 17 gaps: four appliers end without downstream or revalidate; consume-turn-requests and apply-extraction-output write no artifact. | the kit's per-kind downstream hook closes all six | 8 Gaps | Gaps for the coordinator (decision-ready) | runtimes-a.md:L377 |
| G-085 | P1-12 | brief_apply_runs retirement and migration 334. | see data model | 8 Gaps | Gaps for the coordinator (decision-ready) | runtimes-a.md:L378 |
| G-086 | P1-12 | read-brief-export-queue reads every row's inputs_ref holding full pool text. | the new queue stores ids and paths | 8 Gaps | Gaps for the coordinator (decision-ready) | runtimes-a.md:L379 |
| G-087 | P1-12 | flywheel-steps forward-event key disagrees with migration 307. | P1-09/10 to take the shared key | 8 Gaps | Gaps for the coordinator (decision-ready) | runtimes-a.md:L380 |
| G-088 | P1-12 | scripts/drain/kinds.mjs names five deleted workflows as apply paths. | none given | 8 Gaps | Gaps for the coordinator (decision-ready) | runtimes-a.md:L381 |
| G-089 | P1-12 | question-answers README names a decision-ready gap (non-research needs). | none given | 7 File register | names a decision-ready gap | runtimes-a.md:L202 |
| G-090 | P1-13 | Do the stage modules live under src/core/turn/stages/ or in each family's owning module with run-turn.ts only ordering them? | stage modules under src/core/turn/stages/ (this register's layout) / each stage's code in its family's owning module and run-turn.ts only orders them | 8 One turn runtime | owed to the coordinator, one ruling on code location | runtimes-b.md:L181 |
| G-091 | P1-13 | Which P1-12 files fold into the one turn runtime (P1-12 register not on origin at writing time)? | none given | 8 One turn runtime | The coordinator reconciles | runtimes-b.md:L183 |
| G-092 | P1-13 | Are the metered paths (--allow-api, --record-only false, the Browserless check) not ported? | the register takes the plan's "everything FREE" as that ruling | 8 Rulings owed | Rulings owed (1) | runtimes-b.md:L263 |
| G-093 | P1-13 | If harness_runs still holds pre-item_id mint rows THE GATE must clear, how are they resolved? | the operator rules how they are resolved | 8 Rulings owed | Rulings owed (2) | runtimes-b.md:L263 |
| G-094 | P1-13 | Who dispatches the one turn runtime once build ends? | the operator's call | 8 Rulings owed | Rulings owed (3) | runtimes-b.md:L263 |
| G-095 | P1-13 | Classify through Haiku with token telemetry (--allow-api) | NOT PORTED (metered) | 8 Features | ruling owed (1) | runtimes-b.md:L313 |
| G-096 | P1-13 | Legacy minted-id recovery for pre-item_id slices | NOT PORTED (no artifact survives) | 8 Features | ruling owed (2) | runtimes-b.md:L320 |
| G-097 | P1-14 | screen rules as a typed data file or a screen_rules table | typed data file, or a screen_rules table | 3 Bloat | ruling owed | mint.md:L82 |
| G-098 | P1-14 | the slot ruling moves to P1-11 (migration 299 precheck TRASH) | none given | 3 Bloat | section 8 rulings | mint.md:L90 |
| G-099 | P1-14 | resolver for the ambiguous verdict (256 reviewed entries plus rule-ambiguous rows) with no consumer and no age limit | route to the flag channel with a maximum age, or a rule-extension pass | 8 Rulings owed | Rulings owed 1 | mint.md:L275 |
| G-100 | P1-14 | drop the JavaScript C1-C7 replica and keep the SQL function as the one gate | this plan assumes yes | 8 Rulings owed | Rulings owed 2 | mint.md:L276 |
| G-101 | P1-14 | migration 299 never applied; kit requires four slots the table does not | P1-11 apply 299 in the new schema with a re-mint, or drop the kit-only slots | 8 Rulings owed | Rulings owed 3 | mint.md:L277 |
| G-102 | P1-14 | heal claim-text rewriting and the numeric-tolerant tier | this plan keeps re-kinding but not rewriting (INV-298), folds separators only when value unchanged | 8 Rulings owed | Rulings owed 4 | mint.md:L278 |
| G-103 | P1-14 | two mint paths (batch and mint-item.ts) | features/mint owns one mint function that intake calls; ownership shared with P1-03/04 | 8 Rulings owed | Rulings owed 5 | mint.md:L279 |
| G-104 | P1-14 | brief listed staged_updates as a mint write | [REFUTED] for this module; staged updates are mint-item.ts's (P1-03/04) | 8 Rulings owed | Rulings owed 6 | mint.md:L280 |
| G-105 | P1-15 | Nothing dispatches this module on this tree; P1-08 must own dispatch of every producer, the drain apply side, propagation drain and population flywheel. | none given | 8 Interface | Gaps for the coordinator (1) | producers.md:L356 |
| G-106 | P1-15 | The judgement drain's six exporters and apply scripts live under scripts/turns and scripts/maintenance (P1-12/13); their port order must precede the drain's. | none given | 8 Interface | Gaps for the coordinator (2) | producers.md:L356 |
| G-107 | P1-15 | Should there be one open question per (item, surface, product_question) regardless of event, or one per event? | today's behaviour (one per item, surface, product_question) / one per event (subject_ref gains the event id); the register ports today's behaviour and records the choice | 8 Interface | B-1572 needs a ruling (gap 3) | producers.md:L356 |
| G-108 | P1-15 | The six Weekly Oil Bulletin items grounded on a summary are a live data defect for P1-07 capture and P1-14 mint. | none given | 8 Interface | Gaps for the coordinator (4) | producers.md:L356 |
| G-109 | P1-15 | computePayloadPenalty has no panel caller; P1-19/20 must wire OemRoadmapPanelView to it. | none given | 8 Interface | Gaps for the coordinator (5) | producers.md:L356 |
| G-110 | P1-15 | The sbti_dashboard licence keeps that producer dry until the operator obtains permission. | none given (ports the producer with the block) | 8 Interface | Gaps for the coordinator (6) | producers.md:L356 |
| G-111 | P1-15 | The EEA zero-emission fuel values are unknown until a real run's residue is read; the first apply needs that run. | none given | 8 Interface | Gaps for the coordinator (7) | producers.md:L356 |
| G-112 | P1-15 | Where in docs/plans/rebuild does scripts/spec09/SOURCES.md move? | none given | 6 Non-essential artifacts | coordinator's call | producers.md:L202 |
| G-113 | P1-15 | Is the series-item map a table or a JSON data file (so the ratify rewrite becomes a data write)? | a table / a JSON data file | 7 File register | P1-19/20 ruling | producers.md:L224 |
| G-114 | P1-16 | the producer of obligation_objects candidates | none given | 3 Bloat | a gap for the coordinator | obligations.md:L71 |
| G-115 | P1-16 | which lane produces obligation_objects candidates and whether the register's obligation_id link (376) is populated by it | deterministic seeds already exist FREE (record-facts [binding_position], [jurisdictional_scope], [due_date] claims, forward events, instrument identity) | 8 Interface | Gaps for the coordinator (1) / a ruling is owed | obligations.md:L245 |
| G-116 | P1-16 | spec 01 section 3.3 four-date timeline (component 4) is not built | events' kinds are the raw material | 8 Interface | Gaps for the coordinator (2) | obligations.md:L245 |
| G-117 | P1-16 | both routes are public with no requireAuth, an unrecorded exception to API security policy | ruling owed, or the P1-01 requireUser cookie-or-bearer guard applies | 8 Interface | Gaps for the coordinator (3) / ruling owed | obligations.md:L245 |
| G-118 | P1-16 | upcoming route answers a thrown error with an empty 200, register route answers 500 | none given | 8 Interface | Gaps for the coordinator (4) / one posture is owed | obligations.md:L245 |
| G-119 | P1-16 | uk versus GB has no alias table | P1-04's jurisdiction vocabulary is the home | 8 Interface | Gaps for the coordinator (5) | obligations.md:L245 |
| G-120 | P1-16 | the brief's id list has no Market id; Market policy timeline consumes this module's scoped read | none given | 8 Interface | Gaps for the coordinator (6) | obligations.md:L245 |
| G-121 | P1-16 | upcoming API: 503 on failure instead of an empty 200 | none given | 8 New files | ruling to settle | obligations.md:L205 |
| G-122 | P1-16 | optional-read disclosure surfaced as a failure of the run, not a note | none given | 8 Features | ruling: B-0322 | obligations.md:L310 |
| G-123 | P1-16 | write-forward-events.ts counted under P1-14 | here, or under P1-14 | 8 New files | if the coordinator prefers | obligations.md:L195 |
| G-124 | P1-17 | lane ids for customer surfaces P1-19..24 and coverage, watchlist, search and map features (id owed) | none given | 8 Interface | Gaps for the coordinator (a) | ui-kit.md:L324 |
| G-125 | P1-17 | ownership of vocabulary modules lib/urgency/bands.ts, lib/tier-labels.ts, lib/customer-source-tier.ts | treated as core | 8 Interface | Gaps for the coordinator (b) | ui-kit.md:L324 |
| G-126 | P1-17 | MoreBelowDisclosure and SummaryDepthSwitch move into the kit from P1-19..24 (ids owed) | none given | 8 Interface | Gaps for the coordinator (c) | ui-kit.md:L324 |
| G-127 | P1-17 | the Tailwind decision for admin and community files | kit planned without Tailwind; cn.ts kept until admin and community lanes decide | 8 Interface | Gaps for the coordinator (d) | ui-kit.md:L324 |
| G-128 | P1-17 | owner of lib/urgency/bands (P1-19..24 or core) | P1-19..24 or core | 8 Interface | id owed | ui-kit.md:L321 |
| G-129 | P1-17 | hand-offs of useWatchMembership, TagPopover/DetailTagRow, CommandBar, RegisterRow, fixtures wait on ids | none given | 8 Port order | once their ids exist | ui-kit.md:L361 |
| G-130 | P1-17 | whether `.cl-ops-*` family is used by className strings | none given | 4 Dead code | the port lane re-checks before deleting | ui-kit.md:L144 |
| G-131 | P1-18 | which lane ids own the market and research surfaces (not stated) | none given (register uses "market surface", "research surface") | 8 Interface | Gaps for the coordinator (1) | shell-list.md:L329 |
| G-132 | P1-18 | VirtualizedRowList.tsx (one importer ListSurfaceShell) sits in no scope; belongs with list surface | none given | 8 Interface | Gaps for the coordinator (2) | shell-list.md:L329 |
| G-133 | P1-18 | AskAssistant.tsx mounted only by AppShell sits in no Part 1 scope | none given | 8 Interface | Gaps for the coordinator (3) | shell-list.md:L329 |
| G-134 | P1-18 | lib/data.ts cache wrapper over list readers is in no scope | none given | 8 Interface | Gaps for the coordinator (4) | shell-list.md:L329 |
| G-135 | P1-18 | per-route loading.tsx files under market, operations, regulations, research in no scope | none given | 8 Interface | Gaps for the coordinator (5) | shell-list.md:L329 |
| G-136 | P1-18 | privacy copy needs counsel or operator ruling on the processor list before port | LinkedIn OAuth TRASH in P1-01 vs in flight per P1-02; Browserless retired; Stripe absent | 8 Interface | Gaps for the coordinator (6) | shell-list.md:L329 |
| G-137 | P1-18 | five list variants outside scope; table states what each collapses to | none given | 8 Interface | Gaps for the coordinator (7) | shell-list.md:L329 |
| G-138 | P1-18 | P1-02 gap on owner of src/lib/hooks answered: six hooks are shell data | answered: port as ui/shell/use-bootstrap, use-admin-attention, use-unread-count, scroll-container | 8 Interface | Gaps for the coordinator (8) | shell-list.md:L329 |
| G-139 | P1-18 | GfmSection proposed for P1-17 kit; coordinator confirms the owner | none given | 8 Interface | Gaps for the coordinator (9) | shell-list.md:L329 |
| G-140 | P1-18 | P1-17 hands CommandBar to this module as src/features/shell/ui/CommandBar.tsx | none given | 8 Interface | Gaps for the coordinator (10) | shell-list.md:L329 |
| G-141 | P1-18 | NotificationsBell, NotificationsList (P1-22) and ThemeBriefCard (P1-21) handed to P1-18, not read here | none given | 8 Interface | Gaps for the coordinator (11) | shell-list.md:L329 |
| G-142 | P1-18 | privacy markup REFACTOR, copy KEEP AS-IS pending counsel; legal text not edited by any lane | none given | 7 File register | pending counsel | shell-list.md:L200 |
| G-143 | P1-18 | privacy copy verbatim until counsel rules | none given | 8 New files | until counsel rules | shell-list.md:L266 |
| G-144 | P1-18 | privacy ported after the ruling | none given | 8 Port order | after the ruling | shell-list.md:L370 |
| G-145 | P1-18 | Privacy policy feature new home app/privacy (copy pending ruling) | none given | 8 Features | copy pending ruling | shell-list.md:L393 |
| G-146 | P1-19 | intake-a and this register both place the same parsers; which row is struck? | this register takes the reader half (sources table, record sections) into core/detail and leaves the writer half (section 14, recommended actions) with intake; one of the two rows needs striking | 8 Interface | Gaps for the coordinator (1) | regulations.md:L387 |
| G-147 | P1-19 | The detail architecture serves four surfaces; this register owns it and the Market, Research and Operations lanes consume it. | none given | 8 Interface | Gaps for the coordinator (2) | regulations.md:L387 |
| G-148 | P1-19 | Is a public detail page's binding banner (/api/detail/relevance, IP limited, anonymous) a documented public exception? | none given | 8 Interface | Gaps for the coordinator (3), operator ruling | regulations.md:L387 |
| G-149 | P1-19 | Which lane ids are the Market and Research surfaces? | [HYPOTHESIS that they are P1-20 and P1-22] | 8 Interface | Gaps for the coordinator (4) | regulations.md:L387 |
| G-150 | P1-19 | relevance route auth decision | none given | 8 New files | auth decision recorded (section 8, gaps) | regulations.md:L309 |
| G-151 | P1-19 | The five unrendered always-or-conditional sections need index entries and fixed ordinals (artboard 03 draws the current ten), CLAUDE.md rule 20. | none given | 8 Fact document sections | design change owed to Claude Design | regulations.md:L371 |
| G-152 | P1-19 | Sections 1, 2, 5, 6, 7, 9, 12, 13 render as structured sections. | none given | 8 Features | design change owed | regulations.md:L457 |
| G-153 | P1-19 | Route matrix for /api/detail/relevance waits on the auth ruling. | none given | 8 Proof | once the auth ruling is made | regulations.md:L421 |
| G-154 | P1-19 | Where does core/statutory live (offered to P1-10)? | P1-10 / this module | 8 New files | if the coordinator places it there | regulations.md:L340 |
| G-155 | P1-19 | Statutory and applicability handed to their consumers' placement. | none given | 8 Port order | their consumers' placement | regulations.md:L434 |
| G-156 | P1-19 | What does the ActionCard "your lanes" cell show instead of "connect data"? | none given | 7 File register | P1-17 ActionCard decides the cell | regulations.md:L260 |
| G-157 | P1-20 | MarketSignalDetailSurface.tsx (873 lines) is in no Part 1 SCOPE; needs an owner and a whole read | this module's port lane is the natural one | 1 Header / 8 Interface | gap for the coordinator | market.md:L68 |
| G-158 | P1-20 | owner for MarketSignalDetailSurface.tsx | this module's port lane is the natural one | 8 Interface | Gap for the coordinator | market.md:L294 |
| G-159 | P1-20 | src/lib/spec09/oem-payload.mjs and reroute.mjs are not in this scope | none given | 8 Interface | Gap for the coordinator | market.md:L295 |
| G-160 | P1-20 | declared horizontal scroller under 768 (MarketComparativeRibbon 345-365) vs the no-horizontal-reach rule (B-1927) | none given | 7 File register | ruling owed | market.md:L206 |
| G-161 | P1-20 | owner of list-surface (ListSurfaceShell, rail cards, sort row, facet helpers, useListSurfaceFilter) | none given | 8 Interface | whose owner the coordinator names | market.md:L293 |
| G-162 | P1-20 | market_series_items table shape (series_key text pk, item_id uuid, status text) | this register's proposal | 8 New files | ADR owed | market.md:L275 |
| G-163 | P1-20 | the sparkline and the 1m / YoY cells are not on artboard 04 / p4 (rule 20, A2-part5:L89) | none given | 8 Rulings | DESIGN CHANGE OWED | market.md:L312 |
| G-164 | P1-20 | en dashes between range numbers in format-range.mjs:22, 24 | not changed here | 6 Non-essential | flagged for the design list | market.md:L178 |
| G-165 | P1-20 | a horizontal strip against the no-horizontal-reach rule (B-1927) | none given | 8 Defects | without a ruling | market.md:L377 |
| G-166 | P1-21 | The cross-page theme view has no Part 1 id; who owns it? | this register ports it to src/core/themes and owns it until one is named | 8 Interface | Gaps for the coordinator (1) | research-ops.md:L307 |
| G-167 | P1-21 | Who owns the assistant route /api/ask (operations-ask-context waits on it)? | none given | 8 Interface | Gaps for the coordinator (2) | research-ops.md:L307 |
| G-168 | P1-21 | Who owns scripts/research/authority-score.mjs and scripts/turns/theme-briefs/schema.mjs (src-imports-scripts edges)? | P1-15 [HYPOTHESIS on the id] | 8 Interface | Gaps for the coordinator (3) | research-ops.md:L307 |
| G-169 | P1-21 | Which lane owns the shared relatedItems detail read and enrichCategoryRows? | none given | 8 Interface | Gaps for the coordinator (4) | research-ops.md:L307 |
| G-170 | P1-21 | Does the assistant itself survive the free rule? | none given | 2 Key dependencies | assistant route owner's ruling | research-ops.md:L101 |
| G-171 | P1-21 | Matrix cells 40 px tall with zero spacing sit under law 2's 44 px; the 40 px row height is an operator spec. | none given | 7 File register | DESIGN CHANGES OWED item (rule 20) | research-ops.md:L228 |
| G-172 | P1-21 | Grid carbon intensity is the seventh dimension, a system need on the DESIGN CHANGES OWED list. | none given | 8 Rulings | DESIGN CHANGES OWED list (rule 20) | research-ops.md:L325 |
| G-173 | P1-21 | Should the research detail show what_it_changes and does_not_resolve? | if yes, the detail lane reads them | 8 Features | P1-19..21's detail lane reads them | research-ops.md:L389 |
| G-174 | P1-22 | Sidebar sections open by default vs accordions closed by default | none given | 7 File register | F43 marker awaiting an operator ruling | community-a.md:L162 |
| G-175 | P1-22 | The CommandBar question CommunitySearchBar records (:9-24), carried to section 8 | none given | 7 File register | open operator ruling | community-a.md:L180 |
| G-176 | P1-22 | Accordions closed by default (operator 2026-09-08) vs the sidebar sections open with a marker reporting the case for a ruling | none given | 8 Rulings | an open operator ruling | community-a.md:L272 |
| G-177 | P1-22 | Spec 05 section 2 still states "not name or company", superseded by R8.7 identity shown by default | none given | 8 Rulings | contradiction for the operator's contradiction audit | community-a.md:L267 |
| G-178 | P1-22 | five-surfaces.md:84 and :94 and spec 05 "Current verdict" list promote-to-public as shipped; ADR-041 removed it | none given (not ported) | 8 Coordinator items | contradiction for the coordinator | community-a.md:L280 |
| G-179 | P1-22 | Editorial pickup: the dispatch's "(in flight)" contradicts ADR-041 | none given (nothing ported) | 8 Coordinator items | flagged to the coordinator | community-a.md:L284 |
| G-180 | P1-22 | My topics list: editable or removed (no write path exists) | editable or removed | 8 Features | ruling owed | community-a.md:L313 |
| G-181 | P1-22 | CommunityHome mounted on /community above or beside the rooms index | above / beside | 8 New files | the page decides with P1-23 | community-a.md:L201 |
| G-182 | P1-22 | LinkedIn verification as second method writing community_member_profiles.verification_method; route and column P1-23's and P1-01's | none given [HYPOTHESIS] | 8 Coordinator items | decision-ready (route and column choice) | community-a.md:L282 |
| G-183 | P1-23 | Is computeDominanceShare (moved by P1-10 to P1-22/23) needed? | not needed unless an aggregate path is ruled back in | 8 Gaps | Gaps and decisions for the coordinator 1 | community-b.md:L418 |
| G-184 | P1-23 | Is a community ban group-scoped or platform-wide? | group-scoped (old code's intent) / platform-wide | 8 Gaps | Gaps and decisions 2 / A ruling decides | community-b.md:L419 |
| G-185 | P1-23 | Port makes dispatch consult muted and notification_preferences (except invite); changes P1-07's dispatch row | none given | 8 Gaps | Gaps and decisions 3 | community-b.md:L420 |
| G-186 | P1-23 | Community topics read, never written: drop the sidebar list or rule a writer? | drop the sidebar list / rule a writer | 8 Gaps | Gaps and decisions 4 | community-b.md:L421 |
| G-187 | P1-23 | Confirm the directory small-cell floor value (k = 5)? | none given | 8 Gaps | Gaps and decisions 5 / A ruling confirms | community-b.md:L422 |
| G-188 | P1-23 | Owners of list remainder and notices routes have no lane id | none given | 8 Gaps | Gaps and decisions 6 | community-b.md:L423 |
| G-189 | P1-23 | /api/listings/rest unauthenticated and absent from public-route list | document the exception (public list data, IP limited) / guard it | 8 Gaps | Gaps and decisions 7 | community-b.md:L424 |
| G-190 | P1-23 | organisation_key written and never read since migration 349 | keep (verification identity, future aggregate pools) / drop the column | 8 Gaps | Gaps and decisions 8 | community-b.md:L425 |
| G-191 | P1-23 | LinkedIn verification not built in Part 2 until the operator schedules it | none given | 8 Interface | operator-scheduled | community-b.md:L339 |
| G-192 | P1-23 | require COMMUNITY_ORG_SALT and drop the fallback, or record the rotation rule | require salt and drop fallback / record rotation rule | 7 File register | COMMUNITY_ORG_SALT rotation | community-b.md:L225 |
| G-193 | P1-23 | list surfaces lane id owed for remainder.ts | none given | 8 New files | id owed | community-b.md:L280 |
| G-194 | P1-24 | Who owns row-fields.ts / list-row-fields.ts? | kept in features/dashboard/rows until the lists lane (P1-19..23) claims it; one owner, not two | 8 Interface | Gaps for the coordinator (1) | dash-search.md:L277 |
| G-195 | P1-24 | lib/coverage/* owner id owed | none given | 8 Interface | Gaps for the coordinator (2) | dash-search.md:L277 |
| G-196 | P1-24 | fetchThemeChips and theme-brief.mjs owner (research or connections lane) id owed | none given | 8 Interface | Gaps for the coordinator (3) | dash-search.md:L277 |
| G-197 | P1-24 | Port the sector-weighted urgency composite or record it as not built? | port the composite (with a stored sector input) / record it as not built | 8 Interface | Gaps for the coordinator (4) / product ruling the operator makes | dash-search.md:L277 |
| G-198 | P1-24 | Skill owner owes a sectioned form of ENVIRONMENTAL_POLICY_SKILL_CORE | none given | 8 Interface | Gaps for the coordinator (5) | dash-search.md:L277 |
| G-199 | P1-24 | Coverage page kept under features/dashboard until ruled | none given | 7 File register | until ruled | dash-search.md:L181 |
| G-200 | P1-24 | Sector-weighted urgency composite not ported | none given | 8 Features | recorded for the operator's ruling (gap 4) | dash-search.md:L348 |
| G-201 | P1-24 | coverage_gaps table fate | none given | 8 Data model | the DB lane decides the table | dash-search.md:L268 |
| G-202 | P1-25 | Does P1-26 own src/app/admin/**, src/app/api/admin/**, lib/hooks/useAdminAttention.ts and lib/admin/member-display-name.ts, and take the three new routes owed? | none given | 8 Interface | Gaps for the coordinator (1) | admin-a.md:L327 |
| G-203 | P1-25 | VirtualizedRowList.tsx and AccountPrimitives.tsx are in scope by directory only; both handed to P1-17 | none given | 8 Interface | Gaps for the coordinator (2) | admin-a.md:L327 |
| G-204 | P1-25 | The thirteen fixture pages and three fixture modules trashed here are in P1-26's and the surfaces' scopes; the trash needs one ruling across them | none given | 8 Interface | Gaps for the coordinator (3) | admin-a.md:L327 |
| G-205 | P1-26 | Which register owns src/lib/corrections/admin-api/handlers.ts and logic.mjs? | none given | 8 Interface | Gaps for the coordinator (1) | admin-b.md:L397 |
| G-206 | P1-26 | What is the lane id of src/components/sources/* (nine routes' callers)? | none given | 8 Interface | Gaps for the coordinator (2) | admin-b.md:L397 |
| G-207 | P1-26 | P1-08 retires spot-check-monthly family.json that names a trashed route | none given | 8 Interface | Gaps for the coordinator (3) | admin-b.md:L397 |
| G-208 | P1-26 | One ruling on the home of the deterministic classifier: P1-04 (per ruling) or P1-05 (per intake-b.md:233-234)? | this register imports them from P1-05 | 8 Interface | Gaps for the coordinator (4) | admin-b.md:L397 |
| G-209 | P1-26 | handlers module is in no Part 1 scope this lane can see | none given | 7 File register | gap for the coordinator | admin-b.md:L221 |
| G-210 | P1-26 | sources surface consumer owner id owed | none given | 8 Interface | owner id owed | admin-b.md:L396 |

## H. DEFECTS TO NOT REPEAT

Source: each register's section 8 "Defects the new code must not repeat" plus defects confirmed elsewhere in it, one row per item (915 extracted). H.1 holds rows carrying a CONFIRMED token or listed by the register as a defect without a token (818); H.2 the rows the register labels HYPOTHESIS (80); the 17 rows a register labels REFUTED, moot or fixed are listed in H.3 so the correction is visible. The defect summary lists repeat some file-register rows, so a defect can appear twice from one lane.

### H.1 Confirmed or listed

| defect | lane | path:line | status token | what the new code does instead | cite |
|---|---|---|---|---|---|
| isServiceSupabaseConfigured checks the key only, never the URL | P1-01 | src/lib/supabase-env.ts 1-3 | [CONFIRMED read] | not stated | auth-db.md:L175 |
| redirect-login keeps pathname only, query string lost (B-0087) | P1-01 | src/proxy.ts :84-88 | [CONFIRMED read] | proxy wiring that preserves the query string in redirect | auth-db.md:L180 |
| isPublicRoute and isStaticOrApiRoute use startsWith, /loginx, /privacy-evil, /apixyz skip auth redirect (B-1980) | P1-01 | src/lib/auth/route-policy.ts :19, :30-33 | [CONFIRMED read; executed by A4d] | exact match or prefix plus "/" | auth-db.md:L181 |
| tab and newline survive in return path (B-1981) | P1-01 | src/lib/auth/safe-return-path.mjs | [CONFIRMED read] | strip control characters | auth-db.md:L182 |
| ensureProfile builds its own service client (A4d B-DUP-1) | P1-01 | provision-personal-workspace.ts :52-56 | none | ensureProfile on the shared service client | auth-db.md:L186 |
| both catches console.warn and fall through to 401 (B-0051) | P1-01 | src/lib/api/community-auth.ts | none | not stated | auth-db.md:L190 |
| header says sliding window; code is a fixed window; per instance (B-1547) | P1-01 | src/lib/api/rate-limit.ts :7, :44-47 | [CONFIRMED read] | fixed-window limiter with an honest header | auth-db.md:L192 |
| fail-soft wrappers never distinguish "no session" from "read failed" | P1-01 | src/lib/api/org.ts | none | resolveMembership surfacing the error; callers pick fail-soft or fail-closed explicitly | auth-db.md:L194 |
| isSourcePaused fails OPEN (returns false on error) (B-0668) | P1-01 | src/lib/api/pause.ts :108, :111 | [CONFIRMED] | not ported | auth-db.md:L120 |
| 9 modules call authHeaders() and fetch themselves (B-0232) | P1-01 | (9 modules) | [CONFIRMED grep] | finding about the lint rule PROP-028 | auth-db.md:L197 |
| two dropped-error reads inside a try (B-0022) | P1-01 | api/auth/linkedin/callback/route.ts :235, :243 | none | TRASH | auth-db.md:L201 |
| { data: org } drops error, falls back to submitted name (B-0042) | P1-01 | src/app/api/orgs/route.ts :46 | none | not stated | auth-db.md:L202 |
| getMembership drops error, DB failure answers 403 "Not a member"; ownerRow and memberCount drop error (B-0041) | P1-01 | src/app/api/orgs/[org_id]/route.ts :15, :65, :76 | [CONFIRMED read] | GET org, PATCH name and slug, errors surfaced | auth-db.md:L203 |
| member GET unbounded (B-0082) | P1-01 | src/app/api/orgs/[org_id]/members/route.ts :81-87 | none | list (bounded) | auth-db.md:L204 |
| signed-in users sent to /login then bounced home (two hops) | P1-01 | src/app/signup/page.tsx :65 | [CONFIRMED read] | not stated | auth-db.md:L215 |
| getUser() drops error; failure reads as anonymous, fail closed | P1-01 | src/app/invitations/[token]/page.tsx :20 | none | not stated | auth-db.md:L216 |
| new Date() in render; header cites README and DEVIATION-LOG (B-0123, B-0124) | P1-01 | src/components/auth/AuthFrame.tsx :44 | none | not stated | auth-db.md:L217 |
| AUTH_INPUT_STYLE height 36, under the 44 px law; bare a tabs (B-0125) | P1-01 | src/components/auth/AuthPanel.tsx :27 | none | fields (44 px), tabs as Links | auth-db.md:L218 |
| header says orgId mounts null, state starts undefined (B-0126) | P1-01 | src/components/auth/AuthProvider.tsx :108, :135 | none | header reduced to one paragraph | auth-db.md:L219 |
| backdrop has no Esc handler or focus return (A2-part6) | P1-01 | src/components/auth/UserMenuDropdown.tsx | none | account dropdown with Esc and focus return | auth-db.md:L221 |
| synopses always-empty array (HALF-SLICE) | P1-01 | src/lib/supabase-server.ts:2818-2823, 2852-2857 | [CONFIRMED read] | not stated | auth-db.md:L134 |
| dropped-destructure pattern A4 counted 13 times is 0 on this tree | P1-01 | src/lib/supabase-server.ts | [CONFIRMED: grep = 0] (A4 count no longer holds) | not stated | auth-db.md:L222 |
| summary: prefix matching, control characters, dropped-error membership 403, unbounded member list, lost query string, wall-clock render, 36 px inputs, two guard families and duplicated verifier, limiter header, service client outside factory, fail-open source pause (B-1980, B-1981, B-0041, B-0082, B-0087, B-0123, B-0125, B-2145, B-1547, A4d B-DUP-1, B-0668) | P1-01 | section 8 defects paragraph | none | not stated | auth-db.md:L367 |
| settingsStore loadFromWorkspace has 0 callers; orgId null, debouncedSave never runs; briefing schedule and dashboard defaults write-only (B-0665) | P1-02 | settingsStore.ts:206, :66; BriefingScheduleSection.tsx:92, :168 | [CONFIRMED] | one settings store that takes `orgId` from workspaceStore and loads once | workspace.md:L99 |
| debouncedSave writes alert_config as two-key object, would erase briefing keys (latent) | P1-02 | settingsStore.ts:83-86 | none | one key-wise jsonb merge for `alert_config` (INV-168) | workspace.md:L99 |
| resourceStore eight optimistic-rollback copies, five dead sub-systems, own fetch (B-0568, B-0569, B-1589) | P1-02 | resourceStore.ts 263-524, :27 | [CONFIRMED] | one `optimistic` helper; persistence through `authedFetch` | workspace.md:L100 |
| UserProfilePage bare `<a href>` for in-app links; three effects fetching one field each | P1-02 | UserProfilePage.tsx:539, :599, :655, :146-228 | none | one `useAccount` loader, links from the ui-kit | workspace.md:L101 |
| BanDialog no Esc, focus move or return; Remove uses window.confirm | P1-02 | MembersPanel.tsx 558-654, :178 | [CONFIRMED] | BanDialog on the ui-kit Dialog | workspace.md:L102 |
| OnboardingWizard new Date() in render (B-0164) | P1-02 | OnboardingWizard.tsx:28-30 | none | the server `nowIso` | workspace.md:L103 |
| fixed widths 520 and 420 inside one-column mobile (B-0166) | P1-02 | OnboardingWizard.tsx:235, :601 | none | widths become `maxWidth` | workspace.md:L103 |
| userEmail passed by page and not destructured | P1-02 | OnboardingWizard.tsx:82 | [CONFIRMED] | not stated | workspace.md:L137 |
| DataSummary counts client list; NaN on empty list | P1-02 | DataSummary.tsx:69 | [CONFIRMED] | TRASH; Coverage page | workspace.md:L105 |
| ArchiveDialog no focus trap or return; buttons about 28 px | P1-02 | ArchiveDialog.tsx | [CONFIRMED] (class arithmetic) | the same dialog over the ui-kit Dialog with 44 px controls | workspace.md:L106 |
| types/source.ts dead definition tables and 14 event types (B-0689, B-1590) | P1-02 | types/source.ts 3-51, 413-443, 466-478, 103-223 | [CONFIRMED] | P1-05/06 ports the live types | workspace.md:L107 |
| fitness-allow F39/F38 comments for deleted enforcer | P1-02 | 10 sites in 5 files | [CONFIRMED] | the comments go | workspace.md:L110 |
| workspaceStore weight setters never called; readers always null (half-slice) | P1-02 | workspaceStore.ts:26-27, 47-48 | [CONFIRMED] | NOT PORTED | workspace.md:L124 |
| WorkspaceProfile five fields populated, never read (B-0228, B-0555) | P1-02 | profile.ts:16-19, 37-40, 81-84 | [CONFIRMED] | profile minus the five dead fields | workspace.md:L135 |
| NotificationPreferences compact prop dead | P1-02 | NotificationPreferences.tsx:53 | [CONFIRMED] | not stated | workspace.md:L136 |
| profiles.sector_overrides never written while read as identity | P1-02 | server-bootstrap.ts:167; bootstrap-seed.ts:71 | [CONFIRMED] | not stated (ruling owed) | workspace.md:L140 |
| viewer-relevance builds own service client; catch returns null for any failure | P1-02 | viewer-relevance.ts:22-26, :29-32 | none | the per-viewer wrapper on the P1-01 service client factory | workspace.md:L186 |
| failed membership read answers same 403 (P1-01 B-0041 class) (B-0041) | P1-02 | item-collab-route.ts:58-60 | none | not stated | workspace.md:L187 |
| item-notes roster read error after write ignored | P1-02 | item-notes.mjs:72, :112 | none | not stated | workspace.md:L189 |
| overrides resolveItemUuid drops error; role read twice (B-0044) | P1-02 | overrides/route.ts:21 | [CONFIRMED] | `resolveItemUuid` surfacing the error; one membership read | workspace.md:L193 |
| personal-state resolveItemUuid drops error (B-0045) | P1-02 | personal-state/route.ts:37 | none | `resolveItemUuid` surfacing the error | workspace.md:L194 |
| archive-impact item and membership reads drop errors; item read before org (B-0043, B-0084) | P1-02 | archive-impact/route.ts:47, :66, :44-61 | [CONFIRMED] | the pre-archive warning with errors surfaced | workspace.md:L195 |
| bootstrap loaders swallow errors to [] or null; member list unbounded (B-0082) | P1-02 | bootstrap/logic.ts:52, :67, :88, :111, :124-127, :175-178, :80-86 | none | loaders degrade independently and log | workspace.md:L197 |
| tags appliedErr swallowed to "no applied tags" | P1-02 | tags/route.ts:83 | none | not stated | workspace.md:L198 |
| profile page header describes Phase C tabs not in component; getUser drops its error (B-0096, B-0097) | P1-02 | app/profile/page.tsx:6-14, :18-20 | [CONFIRMED] | not stated | workspace.md:L205 |
| NoWorkspaceLanding accept and decline fetch outside try, no pending state; invitation list failure becomes empty list (B-0163) | P1-02 | NoWorkspaceLanding.tsx:111-138, :270-281, :81-84 | [CONFIRMED] | pending states and try on every fetch | workspace.md:L207 |
| OnboardingStepper hard-coded #fff | P1-02 | OnboardingStepper.tsx:48 | none | tokens only | workspace.md:L208 |
| wizard step 2 copy says choice scopes every count while overrides not a surface filter | P1-02 | OnboardingWizard.tsx:337 | [CONFIRMED] | not stated | workspace.md:L209 |
| seedNotificationDefaults ignores its result | P1-02 | OnboardingWizard.tsx:190-199 | none | the seed returns its error | workspace.md:L209 |
| InvitationLandingPage accept/decline outside try; raw status printed; hard-coded rgba/hex | P1-02 | InvitationLandingPage.tsx:60, :76, :164, :125-127, :171-173, :214 | none | the per-token page with try on accept and decline | workspace.md:L210 |
| UserProfilePage plan and member-count reads drop errors; fixed 40 px padding, 1100 collapse, no phone rule (B-1937) | P1-02 | UserProfilePage.tsx:157, :182, :313-368 | none (read-confirmed, not rendered) | not stated | workspace.md:L211 |
| MembersPanel invitations read failure swallowed; clipboard failure ignored; Ban button about 34 px (B-0173, B-1936) | P1-02 | MembersPanel.tsx:126, :139-141, :257-259 | none | not stated | workspace.md:L212 |
| OrganizationPanel fixed form grid no mobile rule; billing copy with no billing route | P1-02 | OrganizationPanel.tsx:159, :286-287 | [CONFIRMED] | not stated | workspace.md:L213 |
| NotificationPreferences switch flips before save, stays flipped on failure (B-0175) | P1-02 | NotificationPreferences.tsx:177-181, :165-168 | [CONFIRMED] | toggles with rollback on a failed save | workspace.md:L214 |
| BriefingScheduleSection update result never checked, prints "Saved" (B-0186) | P1-02 | BriefingScheduleSection.tsx:142-157 | [CONFIRMED] | write result checked | workspace.md:L215 |
| SupersessionHistory raw hex and `${sevColor}30` on var() fallback invalid; rows text-xs no padding (B-1953) | P1-02 | SupersessionHistory.tsx:11-15, :37, :46 | [CONFIRMED] | the list with token colours and item links | workspace.md:L219 |
| ArchiveViewer team restore fire-and-forget; raw id as title; text-xs no padding (B-0185, B-1952) | P1-02 | ArchiveViewer.tsx:97, :56-60 | none | restore results surfaced for both | workspace.md:L220 |
| team archive archivedDate is render date not stored archived_at | P1-02 | resourceStore.ts:623 | [CONFIRMED] | `mergeWithOverrides` with the stored `archived_at` | workspace.md:L224 |
| settingsStore legacy key readers (migration logic) | P1-02 | settingsStore.ts:102-136 | none | the legacy key readers become a one-shot data step | workspace.md:L225 |
| types/source TrustScore comment says human review always required against RD-20 | P1-02 | types/source.ts:87-88 | [CONFIRMED] | not stated | workspace.md:L229 |
| defects list: settings no loader, dropped-error reads, item before org, fetch outside try, wall clock in render, fixed widths, swallowed invitations, flipped switch, unchecked write, silent storage, dead profile fields, rollback copies, dead tables, one-action store, under-floor controls, raw id title, profile header drift (B-0665, B-0043, B-0044, B-0045, B-0084, B-0163, B-0164, B-0166, B-0173, B-0186, B-0187, B-0228, B-0555, B-0568, B-0569, B-1589, B-0689, B-1590, B-1588, B-1931, B-1936, B-1937, B-1952, B-1953, B-0185, B-0096, B-0097) | P1-02 |  | none | not stated | workspace.md:L408 |
| groundStep deps loadItem and loadClaims drop error (B-0291) | P1-03 | generate-brief.ts 212-217 | [CONFIRMED read] | not stated | intake-a.md:L227 |
| recordAuditGateFailureStep returns recorded: true even when the insert threw | P1-03 | generate-brief.ts 327-329 | [CONFIRMED read] | not stated | intake-a.md:L227 |
| gate-a-derived both reads drop error (read failure reads as nothing covered) | P1-03 | gate-a-derived.mjs 11-25 | [CONFIRMED read] | not stated | intake-a.md:L267 |
| instruction says "exactly 18 values" and lists 19; parser carries 19 (B-1004) | P1-03 | system-prompt.ts 375-386 | [CONFIRMED read] | the contract's instruction text and the validator share one field table | intake-a.md:L130 |
| two-pass-generate says "18 fields" against 26-field contract (B-0221, B-1537) | P1-03 | two-pass-generate.mjs 8, 38, 41 | [CONFIRMED read] | TRASH | intake-a.md:L279 |
| result-shape casing drift ("monitoring"/"LOW" vs "MONITORING"/"MODERATE") (B-0272) | P1-03 | first-fetch-classify.ts 198-199, 306-307 | [CONFIRMED read] | not stated | intake-a.md:L290 |
| direct new Anthropic and messages.create outside the chokepoint (B-0273, B-0873, B-1573) | P1-03 | haiku-classify.ts 146-148 | [CONFIRMED read] | TRASH; lint rule fails on @anthropic-ai/sdk anywhere in src | intake-a.md:L291 |
| metered wall has 0 production importers (B-0274, B-0678, B-0679, B-1574) | P1-03 | src/lib/llm/metered-gate.mjs | [CONFIRMED] | TRASH | intake-a.md:L176 |
| two scoped amendments past their own expiry present as code (B-1574) | P1-03 | metered-gate.mjs 28-52 | [CONFIRMED read] | TRASH | intake-a.md:L126 |
| seedSpend never called, program-total ceiling started at $0 every process (B-0275, B-0681) | P1-03 | spend-guard.mjs:78 | [CONFIRMED] | TRASH | intake-a.md:L175 |
| process-global counters in a serverless runtime (B-1577) | P1-03 | src/lib/llm/spend-guard.mjs | none | TRASH | intake-a.md:L283 |
| real client name "Dietl" inside a production system prompt (B-2165) | P1-03 | skill-loader.ts:57 | [CONFIRMED read] | if ported, the example must be generic | intake-a.md:L215 |
| three join helpers with two separators (B-1034) | P1-03 | anthropic-text.ts 9-14; spend-client.ts 122, 148; haiku-classify.ts 154-157 | none (B-1034 confirmed L289) | die with the metered path | intake-a.md:L192 |
| two raw fetch to the API inside the chokepoint; logSpendRun and monthly figure dead (B-0680, B-1575) | P1-03 | spend-client.ts 104, 136 | none | TRASH | intake-a.md:L282 |
| erase-with-proof path exists and nothing calls it | P1-03 | ledger-apply.mjs:194 eraseClaimWithProof | [CONFIRMED] | ledger.ts with a caller in the erase step | intake-a.md:L155 |
| date-derivation waterfall with no orchestrator (scripts/maintenance/timeline-backfill.mjs not in tree) | P1-03 | timeline-backfill-derive.mjs:421 | [CONFIRMED exports scan] | core/brief/timeline (needs its caller restored: ADR-030) | intake-a.md:L152 |
| null-tier flag tells operator to "route the facts to 4c relabel" against rule 18 (B-1003) | P1-03 | null-tier-flag.mjs:76 | [CONFIRMED read] | the "4c relabel" sentence replaced by rule 18's "register and rate" | intake-a.md:L270 |
| reserved step spanCheckClaim nothing calls (B-1045) | P1-03 | generate-brief.ts 446; span-check.ts:9 | [CONFIRMED] | NOT PORTED; P1-07's capture refresh and the kept filter cover it | intake-a.md:L169 |
| case-sensitive attribution (crossLink) beside case-insensitive kept filter: a span can be kept then fail to attribute | P1-03 | parse-output.ts 989-990; canonical-pipeline.ts 1950-1952 | [CONFIRMED read] | one spanIsVerbatim; the verbatim test has one case rule | intake-a.md:L200 |
| three private service-client builders | P1-03 | canonical-pipeline.ts 154, generate-brief.ts 53, spend-client.ts 150 | none | getServiceSupabase from core/db | intake-a.md:L131 |
| assertPlanningAssumptionShifted enforces spec 03S1 "in code" and no code calls it | P1-03 | metadata-vocab.ts:117-145 | [CONFIRMED exports scan] | not stated | intake-a.md:L162 |
| isDerivedConsistent has 0 production callers; Gate B derived-date writer not in tree | P1-03 | derived-consistency.mjs | [CONFIRMED] | kept (criterion 7's DERIVED arm reads what it would write) | intake-a.md:L160 |
| extractOperationalBriefing fed a Tier 2 expander that is not in the tree (B-0854) | P1-03 | extract-sections.ts:231 | [CONFIRMED] | not stated | intake-a.md:L150 |
| preflight spend read over agent_runs with a 1000-row default limit, EST_* constants both 0 | P1-03 | generate-brief.ts preflightStep 90-143 | none | preflight keeps only the Layer C data-audit block and the generation pause | intake-a.md:L134 |
| drift guards gone: url-canon vs SQL migration 150; source-blocks vs migration 141 | P1-03 | url-canon.mjs; source-blocks.mjs | none | canonicalizeCitationUrl tested against the parsed SQL body of migration 150 | intake-a.md:L255 |
| stale headers named by backlog gone on this tree (B-1002, B-1532, B-1001) | P1-03 | formats/technology.ts, formats/operations.ts, extract-regulation-sections.ts | [CONFIRMED read] gone | n/a | intake-a.md:L237 |
| mentioned_terms present (B-1536) | P1-03 | system-prompt.ts 387-389 | FIXED-SINCE [CONFIRMED read] | n/a | intake-a.md:L229 |
| update_item writes proposedChanges with no column allowlist (B-0059) | P1-04 | apply-staged-update.ts 272-275 | [CONFIRMED read] | applyStagedUpdate with an explicit update_item column allowlist | intake-b.md:L169 |
| new_source inserts ...proposed with no dedupe | P1-04 | apply-staged-update.ts 309-320 | [CONFIRMED read] | not stated | intake-b.md:L169 |
| flywheel-defect .then(() => {}, () => {}) swallows a database-rejected insert; no dedupe key (B-1986) | P1-04 | flywheel-defect.ts:66 | none (A4a:L71 E5) | every write checked; defect flags deduped on (item, step) | intake-b.md:L170 |
| mint-enrichment forward-event insert has no dedupe (B-2160, B-2161) | P1-04 | mint-enrichment.ts 51-56 | none | forward events with 307-key dedupe and stale report for both | intake-b.md:L173 |
| three .then(() => {}, () => {}) swallows in mint flags (B-0061, B-0264 (B-0060, B-0263, B-0265 per L396)) | P1-04 | mint-item.ts 283, 422, 444 | none | every write checked | intake-b.md:L174 |
| fitness-allow F39 and .discipline comments name a deleted enforcer | P1-04 | mint-item.ts 239, 276 | none | not stated | intake-b.md:L174 |
| disposition stamp error only console.warned | P1-04 | portal-harvest.ts:347 | [CONFIRMED read] | checked stamps | intake-b.md:L176 |
| research layer emits duplicate claims for evidence_agreement_signal and source_authority_signal (B-1568, B-2163, B-2164) | P1-04 | record-facts-research.mjs (buildResearchRecordPayload) | [CONFIRMED: executed] | one claim per slot | intake-b.md:L153 |
| record payload lifts binding_position, due_date, date_precision, corridor_identity, research_credibility onto item; no columns, dropped; item.due_date is the matched phrase | P1-04 | record-facts.mjs 932-990 | [CONFIRMED: migration grep and consumer grep; executed] | item.* lift kept only for fields a writer persists (ruling) | intake-b.md:L179 |
| five unchecked staged_updates stamps and unchecked record-only pool insert; four reads drop error (B-0062, B-0564) | P1-04 | run-intake-cycle.ts 226, 247, 299, 395, 409, 438; 236, 262, 287, 471 | [CONFIRMED grep] | stampDisposition that checks error and reports a failed stamp | intake-b.md:L180 |
| write-item header names nonexistent verbatim copy (B-1569, B-1033) | P1-04 | write-item.ts:22 | none | not stated | intake-b.md:L182 |
| propagate collapses unknown derivation to "estimated" without a note (B-1015) | P1-04 | envelope.mjs | none | not stated | intake-b.md:L183 |
| operator message names corridorId() whose module was deleted (B-1016, B-1017) | P1-04 | factor-tier.mjs:153 | [CONFIRMED read] | not stated | intake-b.md:L184 |
| register count comment says twenty-six, node import counts 28 (B-1018, B-1550) | P1-04 | source-licence.mjs:384 | [CONFIRMED: node import] | register count line matches SOURCE_KEYS.length (proof) | intake-b.md:L185 |
| executor-ground reads drop error | P1-04 | executor-ground.mjs 26-27 | none | the FREE injected-ledger grounding entry with checked reads | intake-b.md:L197 |
| free-pass-run four reads drop error (B-2195 (hostOf dup)) | P1-04 | free-pass-run.mjs 32, 57, 95, 102 | [CONFIRMED grep] | not stated | intake-b.md:L198 |
| whole-table read to find one item | P1-04 | id-stamp.mjs 19-20, 61 | none | keyed lookup | intake-b.md:L199 |
| census gate reads corpus_census.haiku_verdict, metered output with no writer; --empty-only reads every claim row (B-0592) | P1-04 | tombstone-delete.mjs 49-50, 57 | none | content-emptiness gate (deterministic, replacing the Haiku census gate) | intake-b.md:L202 |
| rpc result not checked | P1-04 | regen-quarantined.mjs:49 | none | checked re-validate | intake-b.md:L203 |
| DEFERRAL_WINDOW_DAYS 30 vs 14-day dwell; isValidDeferral no upper bound | P1-04 | plan-quarantine-disposition.mjs:31; scripts/lib/deferral.mjs | [CONFIRMED read] | ruling to settle | intake-b.md:L204 |
| assertEmbeddable has no code caller; SQL generator drift guard deleted in CLEAN-3 (B-1018) | P1-04 | source-licence.mjs:345; factor-tier.mjs:312,352,384 | [CONFIRMED] | byte-compare proof | intake-b.md:L116 |
| resolveActiveFactor and helpers have no caller (B-0557, B-0672) | P1-04 | factor-tier.mjs:231,284,300,120 | [CONFIRMED] | wired to the first factor reader | intake-b.md:L115 |
| routeItemBySourceAxis5 never wired (B-0670, B-0556) | P1-04 | routing.mjs:13 | [CONFIRMED] | NOT PORTED | intake-b.md:L108 |
| MODE_ALIASES "inland-waterway" unreachable (harmless) | P1-04 | vocabularies.mjs:540 | [CONFIRMED: node import] | not stated | intake-b.md:L127 |
| comments assert live state (B-0673) | P1-04 | vocabularies.mjs 360, 507; envelope.mjs 215 | none | not stated | intake-b.md:L187 |
| stored trust_score_overall is the prior blend while stored components are earned parts (T1 overall 85, components sum 40) (B-1044) | P1-05 | trust.ts:1231-1243 | [CONFIRMED] | planTrustScores with stored components that add up to the stored overall | sources-a.md:L214 |
| mojibake character | P1-05 | trust.ts:328 | [CONFIRMED] | not stated | sources-a.md:L214 |
| GOV_INTERGOV puts OECD, IEA, World Bank, IPCC at T2 against skill T3 (B-1007) | P1-05 | host-authority.ts:53 | [CONFIRMED] | the port carries whichever the operator rules into tier-contract.ts | sources-a.md:L215 |
| buildResolver keeps the FIRST row's base_tier per institution, resolves by row order | P1-05 | institution.ts:70 | [CONFIRMED] | buildResolver that reports a disagreeing institution instead of picking the first row | sources-a.md:L216 |
| TWO_LEVEL is a 50-entry hand list, not a public-suffix list | P1-05 | institution.ts | [CONFIRMED] | not stated | sources-a.md:L216 |
| checkDuplicate drops read error and matches ilike('%host%') limit 50 (B-0227) | P1-05 | verification.ts:383 | [CONFIRMED] | exact-host duplicate check with its error checked | sources-a.md:L217 |
| three dropped-error reads in source-growth (B-0050) | P1-05 | source-growth.ts:264, :353, :359 | [CONFIRMED] | registerCitedSources: a read error is reported, never treated as "not found" | sources-a.md:L218 |
| provisional upserts ignore their result | P1-05 | source-growth.ts:207, :231 | none | not stated | sources-a.md:L218 |
| parseNewSourcesFromBrief defaults tier_estimate to 5 and records it as a tier opinion | P1-05 | source-growth.ts:293, :176-181 | [CONFIRMED] | opinions only from an explicit estimate or the class table | sources-a.md:L218 |
| walkers never run with walker=feed in apply mode (F1-S1-02) | P1-05 | sitemap-walk.mjs | none (UNPROVEN) | not stated | sources-a.md:L219 |
| persistExhaustionRecord ignores insert result; header says "NEVER written live" but it is live | P1-05 | seek-more.mjs:155, :128 | [CONFIRMED] | exhaustion flag row with its write checked | sources-a.md:L221 |
| acquisition-request path dead (B-0830, B-1502) | P1-05 | seek-more.mjs | none | NOT PORTED as code | sources-a.md:L221 |
| eurlexSearchUrl does not encode its text | P1-05 | identifier-variants.mjs:79 | [CONFIRMED] (harmless for a CELEX id) | not stated | sources-a.md:L222 |
| intelligence_changes RLS (B-0479) | P1-05 | reconcile.ts | none | P1-11 | sources-a.md:L224 |
| legifrance (gazette) matched as a legislature | P1-05 | source-type-taxonomy.mjs:173 | none | not stated | sources-a.md:L225 |
| CJK legislature patterns unmatchable; duma listed twice | P1-05 | source-type-taxonomy.mjs:167-169, 144, 166 | [CONFIRMED] | unit test: the CJK legislature names | sources-a.md:L173 |
| change-sweep source read drops its error; diff branch never runs | P1-05 | change-sweep.mjs:131 | [CONFIRMED] | staged_updates bridge with every read error checked | sources-a.md:L227 |
| maxAlts a no-op; boundedFetch never clears its timer | P1-05 | primary-fallback.mjs:161, :108 | [CONFIRMED] | not stated | sources-a.md:L228 |
| holdEngaged fails open on unset or unknown values; fetch primitive never reads the cadence | P1-05 | fetch-hold.mjs:41 | [CONFIRMED] | refuses while SCRAPE_HOLD is engaged or the cadence is off for an unsigned caller, fails closed on a read error | sources-a.md:L229 |
| Browserless API token travels in the query string | P1-05 | canonical-fetch.mjs:72, :87 | none | TRASH | sources-a.md:L234 |
| browserless.ts drops options.caller, no signed caller can pass an engaged hold | P1-05 | browserless.ts:48-54 | [CONFIRMED] | TRASH | sources-a.md:L235 |
| tier-override guard unproven (B-0859) | P1-05 | tier-override-guard.mjs | none (UNPROVEN) | the INV-073 attack is its proof | sources-a.md:L250 |
| snapshot writer dead; nothing tracked writes raw_fetches, bridge never has two captures (B-0226) | P1-05 | snapshot-store.mjs:87; change-sweep.mjs:144 | [CONFIRMED] | raw_fetches writer gets a caller: P1-07 capture | sources-a.md:L153 |
| stale contradictory comment | P1-05 | snapshot-store.mjs:80-81 | none | not stated | sources-a.md:L251 |
| freshness HEAD bypasses the hold gate | P1-05 | freshness-probe.mjs:43 | [CONFIRMED] | freshness through the hold gate | sources-a.md:L254 |
| reachability probe defaults to Browserless | P1-05 | reachability.mjs:39 | none | core/fetch/reachability.ts over the direct transport | sources-a.md:L262 |
| bias-tag 0.80 branch pushes identical row | P1-05 | bias-tag-pipeline.mjs:92-96 | [CONFIRMED] | one adoption band | sources-a.md:L170 |
| homepageContentType always empty | P1-05 | sitemap-walk.mjs:545, 564 | [CONFIRMED] | not stated | sources-a.md:L171 |
| vacuous robots.txt filter | P1-05 | sitemap-walk.mjs:370 | [CONFIRMED] | not stated | sources-a.md:L172 |
| transportFetch dead so hold-exception telemetry never runs | P1-05 | fetch-hold.mjs:126, 135-137 | [CONFIRMED] | not stated | sources-a.md:L154 |
| trust.ts Q7 schema essay describes pre-Q2 schema; empty section header | P1-05 | trust.ts 649-709, 574-580 | [CONFIRMED] | one header sentence each | sources-a.md:L131 |
| comments cite missing header and deleted regression test | P1-05 | sitemap-walk.mjs 361-369 | none | not stated | sources-a.md:L133 |
| preResidueTierForHost contradictory comment | P1-05 | host-authority.ts 436-446 | none | not stated | sources-a.md:L135 |
| defects list: dropped-error reads, substring host match, writer with no caller, six tier versions, stored overall not sum, dead exports, guessed default as opinion, hold fails open, exhaustion write ignored (B-0050, B-0227, B-0226, B-1007, B-1044, B-0225, B-0666, B-0688, B-0830, B-1586) | P1-05 | change-sweep.mjs:131; source-growth.ts:293 | none | not stated | sources-a.md:L466 |
| four tabs carry `count: 0` literal | P1-06 | SourceHealthDashboard.tsx:312-315 | [CONFIRMED] | tabs show no count unless a real one exists | sources-b.md:L118 |
| `new Date()` in useMemo at render (B-1957) | P1-06 | SourceHealthDashboard.tsx:297 | none | not stated | sources-b.md:L164 |
| expanded URL link has no word-break (B-1959) | P1-06 | SourceHealthDashboard.tsx:133-142 | none | not stated | sources-b.md:L164 |
| `as unknown as` cast for tier_override because types/source.ts lacks it | P1-06 | SourceHealthDashboard.tsx:215 | none | not stated | sources-b.md:L164 |
| GlobalPauseToggle first GET no catch, ignores !ok, strip vanishes | P1-06 | SourceAdminControls.tsx:41-51 | none | an error state when the GET fails | sources-b.md:L165 |
| override loader swallows its error by comment (B-0199) | P1-06 | SourceAdminControls.tsx:474-486 | none | not stated | sources-b.md:L165 |
| "COALESCE(override, dynamic, base)" shown to operator | P1-06 | SourceAdminControls.tsx:665 | none | not stated | sources-b.md:L165 |
| tier legend trigger and Close minHeight 28; overlay no focus trap, no focus return (B-1961) | P1-06 | SourceTierLegend.tsx:110, :238 | none | definitions overlay with focus trap and return, 44 px targets | sources-b.md:L166 |
| re-tier buttons 30 x 30; permanent placeholder; pipeline note counts transit-only staged updates | P1-06 | ProvisionalReviewTable.tsx:313-314, :375 | [CONFIRMED] (placeholder) | pipeline note without the empty placeholder | sources-b.md:L167 |
| pill buttons about 20 px | P1-06 | ProvisionalReviewCard.tsx | none | not stated | sources-b.md:L168 |
| bulk modal no role, aria-modal or focus handling (B-0196) | P1-06 | CanonicalSourceReview.tsx:418 | none | bulk approve with an accessible modal and honest copy | sources-b.md:L169 |
| bulk copy says "verified" while set includes unverified (B-0198) | P1-06 | CanonicalSourceReview.tsx:255, :426 | none | copy names the real eligible set | sources-b.md:L169 |
| threshold buttons about 22 px | P1-06 | IntersectionDetectionView.tsx | none | not stated | sources-b.md:L170 |
| ThemesView header says no item detail route; members print as 8-char ids; Brief toggle no padding (B-0201, B-1962) | P1-06 | ThemesView.tsx:12-14, :249-253 | [CONFIRMED] (detail routes exist) | member links to item detail | sources-b.md:L171 |
| SourceTierAuditPanel stale header; Flag writes nothing (B-0200) | P1-06 | SourceTierAuditPanel.tsx:8, :16, :41, :147 | [CONFIRMED] | TierOverrideControl raises an integrity_flags row | sources-b.md:L172 |
| B2 note failed read renders Absence "pending" | P1-06 | B2RegenerationNote.tsx:52, :76 | none | the strip; a failed read says it failed | sources-b.md:L173 |
| CLAUDE.md lists deleted B2ProgressBanner.tsx (B-0195) | P1-06 | fsi-app/.claude/CLAUDE.md | none | not stated | sources-b.md:L173 |
| CoveragePageView typed `any`; stale SeriesProvenance comment (B-0146) | P1-06 | CoveragePageView.tsx:12-15, 48-53, :106-109 | [CONFIRMED] (file exists) | typed page | sources-b.md:L174 |
| census read twice per matrix build (B-1019, B-0245, B-1552) | P1-06 | index-data.ts:139-229; load-matrix.mjs:17 | none | one census read per build | sources-b.md:L94 |
| index-data header calls entries route "authenticated + read-only" while admin-only (B-1551) | P1-06 | index-data.ts:56-58 | none | not stated | sources-b.md:L179 |
| verified-brief count error now throws, closed by PR 1123 (B-0054) | P1-06 | index-data.ts:163-170 | [CONFIRMED] | not stated | sources-b.md:L179 |
| matrix-data outer catch drops the cause; unproven, no test (B-1553, B-0867) | P1-06 | matrix-data.ts:42, :51 | none | outage never cached; the cause logged | sources-b.md:L181 |
| coverage-state unreachable default (B-0674) | P1-06 | coverage-state.mjs:124 | [CONFIRMED] | not stated | sources-b.md:L106 |
| client.ts bare catch turns 2xx JSON parse error into "network failed"; no test (B-0866) | P1-06 | client.ts:43 | none | not stated | sources-b.md:L183 |
| coverage-gaps failed read returns [] and all-gap rollup cached 60 s; console.log in request path | P1-06 | coverage-gaps.ts:20, :34-37, :50 | none | a failed read is an error state, not a cached all-gap | sources-b.md:L186 |
| entries route builds service client for admin check | P1-06 | api/coverage/entries/route.ts:10 | none | admin entry list through requireAdmin | sources-b.md:L188 |
| health surfaces route duplicate counts and hand-typed item_type families | P1-06 | api/health/surfaces/route.ts:113, 86-89 | [CONFIRMED] (duplicate) | worker-secret probe counting through surface_of | sources-b.md:L191 |
| health routes have no in-repo caller (UNWIRED) | P1-06 | api/health/surfaces/route.ts, api/health/spend/route.ts | [CONFIRMED] | name a new invoker | sources-b.md:L121 |
| source-role-cleanup raw SQL outside guarded write path (B-2214) | P1-06 | source-role-cleanup.mjs:28,50 | none | re-classify role through the guarded write path | sources-b.md:L197 |
| identity_http_status, title_source selected never read | P1-06 | index-data.ts:149-150 | [CONFIRMED] | select only the columns the mapper reads | sources-b.md:L117 |
| README stale (deleted workflow, deleted files) (B-1117, B-2029) | P1-06 | scripts/sources/README.md | [CONFIRMED] | TRASH | sources-b.md:L154 |
| defects list: fetch failure as pending, modal focus, narrower copy, button promising write, stale headers, census twice, dropped cause, flag nothing closes, sub-floor targets, wall clock at render, overdue while off, long URL, region buckets as ISO, raw SQL (B-0199, B-0196, B-0198, B-0146, B-0200, B-0201, B-0245, B-1019, B-1553, B-0246, B-1956, B-1960, B-1961, B-1962, B-1957, B-1958, B-1959, B-1984, B-2214) | P1-06 |  | none | not stated | sources-b.md:L336 |
| claim update drops error (read error reads as already claimed, fail-closed by accident) | P1-07 | capture-worker/index.ts:291 | [CONFIRMED] | queue claim (atomic, error read) | capture.md:L138 |
| idempotency read drops error (read error reads as no duplicate, fail-open) | P1-07 | capture-worker/index.ts:466 | [CONFIRMED] | idempotency read with its error read | capture.md:L138 |
| worker excluded from typecheck, nothing in CI checks or deploys it | P1-07 | tsconfig.json:34, eslint.config.mjs:43 | [CONFIRMED] | a Deno check of the edge function in CI | capture.md:L138 |
| three writes after the assessment drop their errors (A1-part1 L433) | P1-07 | check-sources/logic.ts :141, :142, :148 | confirmed by read | the three writes reading their errors | capture.md:L139 |
| no kill-switch read on check-sources route | P1-07 | check-sources/route.ts | [CONFIRMED read] | P1-08 dispatcher reads gate plus kill switch | capture.md:L140 |
| reconcile route with no caller kept live (B-0651) | P1-07 | api/worker/reconcile/route.ts | [CONFIRMED] | NOT PORTED as a route; P1-08 harness dispatch of runReconcilePass | capture.md:L93 |
| D3 heartbeat to a table that does not exist, swallowed (B-0248, B-0558, B-1554) | P1-07 | d3/hooks.mjs:9-19 | [CONFIRMED] | NOT PORTED; harness run ledger (P1-08) | capture.md:L94 |
| D3 flag branch never fires (callers pass browserless-render) | P1-07 | d3/hooks.mjs:22-28, 35, 51 | [CONFIRMED read] | quarantine-not-evict rule lives in decideSourceAssessment (P1-05) | capture.md:L95 |
| d3AuditEvent checks loop runs zero times | P1-07 | d3/hooks.mjs:65-75 | [CONFIRMED grep -A3] | data-audit lane (P1-08) is the audit | capture.md:L96 |
| error_events increment read-modify-write, racy and accepted | P1-07 | capture-error.ts :48-53 | [CONFIRMED read] | not stated | capture.md:L142 |
| surface-health route has no invoker since uptime-probes.yml deleted | P1-07 | src/app/api/health/surfaces/route.ts | [CONFIRMED] | consumed by the P1-08 probe | capture.md:L144 |
| reporter's own failures swallowed (by design) (B-0202) | P1-07 | GlobalErrorReporter.tsx | none | not stated | capture.md:L145 |
| dispatch.ts own client (B-DUP-1) | P1-07 | notifications/dispatch.ts :26-37 | none | dispatchNotification on the shared service client | capture.md:L153 |
| service_role_missing class cannot self-record (structural) (B-0277) | P1-07 | notifications/seed-fallback-flag.ts | none | stays loud in function logs | capture.md:L154 |
| /api/revalidate not wrapped in withErrorCapture (A1-part1 note) | P1-07 | api/revalidate/route.ts | none | wrapped in withErrorCapture | capture.md:L155 |
| fallback guard applied to 5 of 20 unstable_cache sites | P1-07 | cache/fallback-guard.ts; src/lib/data.ts | none | the rest is the read layer's work (P1-01 surface reads) | capture.md:L157 |
| metered render where a direct fetch does | P1-07 | check-sources/logic.ts:83 | none | fetchDocument (direct, free) | capture.md:L304 |
| header pair copied into a script | P1-07 | inaccessible-triage.mjs:53 | none | one fetch-policy | capture.md:L304 |
| tag vocabulary mirrored into a script | P1-07 | revalidate.mjs:14-21 | none | scripts import core tags module | capture.md:L304 |
| module whose only proof was a deleted test (B-0861, B-0878, B-0886) | P1-07 | (tests removed in CLEAN-3) | none | not stated | capture.md:L304 |
| summary: heartbeat to missing table, route with no caller, dropped-error writes and out-of-CHECK vocabulary, dropped-error worker reads, metered render, second error channel, service client outside factory, copied header pair, mirrored tag vocabulary, worker no gate reaches, proof only a deleted test (B-0248, B-0558, B-1554, B-0651, B-0861, B-0878, B-0886) | P1-07 | section 8 defects paragraph | none | not stated | capture.md:L304 |
| two numbering authorities for one run id; file renamed to agree (B-0353, F1-S6-07) | P1-08 | record-harness-run.mjs:7-18; harness-run-number.mjs:15-27 | none | the table's uuid; no file, no claim, no rename | harness.md:L469 |
| recorder drops finished_at; every row's finished_at NULL | P1-08 | record-harness-run.mjs:61-76 | [CONFIRMED read] | finished_at not null in proposed table | harness.md:L215 |
| descriptor list whose rationale disagrees with it | P1-08 | family.json (chain-proof, downstream-chain) | [CONFIRMED: read] | one FAMILIES constant | harness.md:L122 |
| registry throws at import (B-0310) | P1-08 | family-registry.mjs | none | families.ts | harness.md:L222 |
| primary-key snapshot goes stale (B-0384 to B-0387, B-1132) | P1-08 | table-primary-keys.mjs | [CONFIRMED: migration grep] | keys from P1-11 generated schema | harness.md:L226 |
| apply step with no existence check; re-run inserts second open flag (B-0065) | P1-08 | apply-deferrals.mjs:140-146 | [CONFIRMED read] | deferral apply with a per-item existence check | harness.md:L254 |
| dead decline path kept for later (B-0696) | P1-08 | resolve-provisional-sources.mjs:427-431, 612-616 | [CONFIRMED read] | not stated | harness.md:L161 |
| CITE names a retired human step (B-1061) | P1-08 | tag-proposals.mjs:16 | [CONFIRMED read] | not stated | harness.md:L259 |
| per-file main guards in five forms (B-2201 to B-2203) | P1-08 |  | none | one CLI entry | harness.md:L192 |
| six hostOf definitions (B-2204, B-2205) | P1-08 |  | [CONFIRMED: grep] | one hostOf in sources module | harness.md:L184 |
| tests wrote fixture runs into real directories; committed run ids overlap ledger ids (F1-S6-03, F1-S6-07) | P1-08 |  | none | no file; INV-182 | harness.md:L121 |
| chain cannot fire on this tree (workflows deleted) | P1-08 | upstream-artifact.mjs, loop-run-id.mjs, chained-dry-guard.mjs | [CONFIRMED: ls .github/workflows] | run frame calls downstream in same process | harness.md:L123 |
| 7 surviving maintenance steps record nothing | P1-08 | maintenance/lib/cli.mjs | [CONFIRMED] | the run frame is the only frame | harness.md:L124 |
| canonical-autoverify factTokens hard-coded [] so fact-token branch never runs | P1-08 | canonical-autoverify.mjs:647, 301-305 | [CONFIRMED: read] | fact-token path wired or removed | harness.md:L126 |
| canonical-autoverify approve is two writes and a repoint with no transaction | P1-08 | canonical-autoverify.mjs:695-711 | [CONFIRMED read] | not stated | harness.md:L255 |
| ledger-export readers always return present:false; loop-run-id ledger verification inert | P1-08 | run-artifact.mjs:303-367; loop-run-id.mjs:124-147 | [CONFIRMED: ls] | root_run_id column | harness.md:L148 |
| NOOP_FAMILIES trace refs point at deleted files | P1-08 | upstream-artifact.mjs:132-139 | [CONFIRMED: ls] | not stated | harness.md:L151 |
| validation error text points at gone ALLOWED_FAMILIES, CONVENTION.md, F28 | P1-08 | run-artifact.mjs:141-148 | [CONFIRMED read] | not stated | harness.md:L214 |
| pg-conn 8-region pooler guessing and rejectUnauthorized:false | P1-08 | pg-conn.mjs:7-10, :57, :33 | [CONFIRMED read] | explicit URL only | harness.md:L230 |
| maintenance cli process.exit inside makes a step un-awaitable | P1-08 | maintenance/lib/cli.mjs | none | run frame; step returns {outputs, outcome} | harness.md:L253 |
| enumerate-unclassified-hosts reads whole agent_run_searches and intelligence_items per run | P1-08 | enumerate-unclassified-hosts.mjs:246-247 | none | not stated | harness.md:L257 |
| audit-skill-conformance runs on import; N+1 full_brief reads; writes to absent dir | P1-08 | audit-skill-conformance.mjs:8, :26, :62-63 | none | TRASH | harness.md:L278 |
| holdings-audit reads whole grounding pool into memory | P1-08 | holdings-audit.mjs:47 | none | TRASH | harness.md:L277 |
| d3_runs created by no migration while hooks.mjs inserts into it, warns-and-skips | P1-08 | src/lib/d3/hooks.mjs:11 | [CONFIRMED] | recordRun (owner outside) | harness.md:L170 |
| batch-primitives no caller (B-0351, B-0708) | P1-08 | batch-primitives.mjs | [CONFIRMED] | NOT PORTED | harness.md:L246 |
| fetch-desnz writes a committed file instead of the table | P1-08 | fetch-desnz-factors.mjs:772-775 | none | producer writes emission_factors | harness.md:L267 |
| host-verdicts-001 evidence says About page not fetched | P1-08 | host-verdicts-001.json | none | not stated | harness.md:L262 |
| mutation-lease no test | P1-08 | mutation-lease.mjs | UNPROVEN | not stated | harness.md:L233 |
| emission-factors-common mid-file import | P1-08 | emission-factors-common.mjs:111 | none | not stated | harness.md:L266 |
| reading another module's source as text at import and parsing a prose heading (B-2147, B-2148) | P1-09 | derive-tags.mjs 76, 102-103 | none | the vocabulary is data, read from one module | flywheel-a.md:L350 |
| raw Supabase clients beside the guarded layer (B-2198) | P1-09 | analyze-corpus.mjs 40; discover-for-items.mjs 94 | none | inject the guarded client | flywheel-a.md:L352 |
| top-level script with no main guard (B-2198) | P1-09 | analyze-corpus.mjs | none | every pass is a function; CLI shell is runCli | flywheel-a.md:L353 |
| three copies of the signature loader (B-2199, B-2200, F45-1) | P1-09 |  | none | one | flywheel-a.md:L354 |
| comments that contradict the live rule (B-1010, B-1012, B-0671) | P1-09 | flag-namespaces.mjs 8-9; signal-candidates.mjs 8, 108-109; theme-stats.mjs 29 | none | port carries no posture comments | flywheel-a.md:L355 |
| hard-coded surface tables and MODERATE and /regulations/ (B-0236) | P1-09 | connection-view-model.mjs 26, 111-120, 152, 160 | none | one routing module | flywheel-a.md:L356 |
| dead branch kept alive by an empty constant (B-0241, B-0242) | P1-09 | signal-confidence.mjs 8, 50-53 | [CONFIRMED read] | not stated | flywheel-a.md:L357 |
| wall-clock reads inside pure modules (B-0240) | P1-09 | signal-confidence.mjs 274 | none | the clock is injected | flywheel-a.md:L358 |
| exact-string jurisdiction matching (B-0238, B-2150, B-2151) | P1-09 | gaps.mjs 3-10 | none | jurisdiction entities | flywheel-a.md:L359 |
| duplicate acronym entries and label tables (B-2153) | P1-09 | tag-labels.mjs 66-67 | none | not stated | flywheel-a.md:L360 |
| relationship vocabulary hand-copied from a CHECK constraint (B-2146) | P1-09 | brief-candidates.mjs 17 | none | generated, drift-checked | flywheel-a.md:L361 |
| four homes of one identity helper (B-0287, B-0863, B-1548) | P1-09 |  | none | one | flywheel-a.md:L362 |
| swallowed parse errors (B-0243) | P1-09 | lib term-recurrence.mjs 98 | none | a malformed rationale is counted and reported | flywheel-a.md:L363 |
| tests mutating a production constant to reach a branch (B-0241) | P1-09 | deleted signal-confidence test | none | fixtures inject vocabulary | flywheel-a.md:L364 |
| ENTITY_RATIONALE_RE parses another module's prose rationale | P1-09 | term-recurrence.mjs 93 | none | not stated | flywheel-a.md:L186 |
| title-entity branch cannot fire (TITLE_ENTITY_VOCABULARY empty set) | P1-09 | signal-confidence.mjs 8 | none | TRASH | flywheel-a.md:L95 |
| surfaceOf called with item_type only (B-1011) | P1-09 | run-discovery.mjs 40 | none | always (item_type, domain) | flywheel-a.md:L167 |
| CONVERGENCE_BANDS hand copy; comment cites 7/8/12 vs 8/12 (B-0671) | P1-09 | ThemesView.tsx 69; theme-stats.mjs 29 | none | one exported constant | flywheel-a.md:L173 |
| parseDecisionNote has no caller (B-0237) | P1-09 | decision-note.mjs 28 | none | TRASH | flywheel-a.md:L117 |
| four dead domain sets (B-DEAD-3, B-0676, B-1558) | P1-09 | domains.ts 26-41 | none | TRASH | flywheel-a.md:L110 |
| fixtures dir named by B-1982 does not exist (B-1982) | P1-09 | src/lib/connections/fixtures/ | [CONFIRMED: ls] | not stated | flywheel-a.md:L161 |
| dropped errors on spine reads and writes (B-0056, B-0057, B-1560) | P1-10 | link-item-entities.mjs; corridor-scope.ts:81, :94 | [CONFIRMED read] | the mint-time spine link, every error surfaced; corridor scopes with read errors surfaced | flywheel-b.md:L389 |
| listCorridorScopes renders a corridor with no jurisdictions when :81 fails (B-0056, B-0057) | P1-10 | corridor-scope.ts:81 | [CONFIRMED read] | destructure and surface the error | flywheel-b.md:L149 |
| corpus re-read per link call; mints adopted-term entities on every call (B-0256) | P1-10 | link-items.ts:83-94, :98-99 | none | not stated | flywheel-b.md:L205 |
| open-flag read drops its error then inserts | P1-10 | link-items.ts:157 | none | hasOpenFlag that fails closed | flywheel-b.md:L150 |
| wall-clock read inside a pure builder (B-0254) | P1-10 | crosswalk.mjs:159 | none | identifierRow with an injected clock | flywheel-b.md:L199 |
| alias module shipped with no caller (B-0257, B-0560) | P1-10 | resolve.mjs:1-311 | [CONFIRMED] | merge follower only into id.ts | flywheel-b.md:L117 |
| registered method the drain cannot dispatch (B-0552, B-1006) | P1-10 | signpost-watch.ts:131 | [CONFIRMED] | not stated | flywheel-b.md:L120 |
| inference with no inputs; first inference can never be recomputed (B-0829) | P1-10 | infer-from-question.ts:203 | none | not stated | flywheel-b.md:L186 |
| constants documented as consumed and never imported (B-0677) | P1-10 | decisions.mjs:9, 17 | [CONFIRMED read] | not stated | flywheel-b.md:L121 |
| JS mirror with one live export (B-0223, B-0551) | P1-10 | aggregate-safeguards.mjs | [CONFIRMED] | NOT PORTED as JS; SQL in migration 287 stays | flywheel-b.md:L182 |
| cache tag nothing invalidates; returns [] without service client (B-1559, B-2157) | P1-10 | corridor-scope-cache.ts | none | invalidation tag the seed calls | flywheel-b.md:L209 |
| writer with no input file and no reader (B-0356, B-0584) | P1-10 | statutory-rows.ts; write-statutory.mjs | [CONFIRMED: ls] | not stated | flywheel-b.md:L101 |
| host helper imported through a crypto module (B-1025) | P1-10 | entity-id.mjs:24; api-transport.mjs:9 | none | browser-safe core/entities/id.ts | flywheel-b.md:L155 |
| NUL byte in source hides file from plain grep | P1-10 | resolve.mjs:298 | [CONFIRMED] | escape or printable separator | flywheel-b.md:L157 |
| stale comment "NOT CALLED BY drain.ts YET" (B-1005) | P1-10 | infer-from-question.ts:219-220 | [CONFIRMED read] | not stated | flywheel-b.md:L132 |
| fireSignpost is three writes, not one transaction (B-0552, B-1006) | P1-10 | signpost-watch.ts:206-266 | [CONFIRMED read] | as one RPC if a migration is ruled | flywheel-b.md:L187 |
| superseded-notices swallows every read error to [] by design | P1-10 | superseded-notices.ts:75, :82, :89 | [CONFIRMED read] | not stated | flywheel-b.md:L188 |
| MarketSignalDetailSurface preview always reads corroborated at 0.7 | P1-10 | MarketSignalDetailSurface.tsx:394, :396 | [CONFIRMED read] | owner is the market surface | flywheel-b.md:L184 |
| seed-corridors candidate scan always returns [] | P1-10 | seed-corridors.mjs:124-127 | [CONFIRMED read] | four confirmed seeds as data plus convention parser | flywheel-b.md:L107 |
| three dead corridor-scope readers drop every read error (B-0056) | P1-10 | corridor-scope.ts 148-247 | [CONFIRMED] | not ported | flywheel-b.md:L106 |
| backfill-derivation-edges retirement condition never observed (B-0921, B-2024) | P1-10 | backfill-derivation-edges.mjs | none | not stated | flywheel-b.md:L212 |
| backfill-lineage-edges hand-rolled corpus pager (B-0922) | P1-10 | backfill-lineage-edges.mjs:35-45 | none | fetchAllRows form | flywheel-b.md:L213 |
| suppressed-render reads whole corrections table for more than one item | P1-10 | suppressed-render.mjs:94 | none | not stated | flywheel-b.md:L217 |
| item_corrections read per item unpaginated | P1-10 | admin-api/logic.mjs:29 (A4d:314) | none | not stated | flywheel-b.md:L218 |
| corrections never enter Loop B (no outbox trigger) | P1-10 |  | [CONFIRMED] | gap 1 | flywheel-b.md:L231 |
| URL patterns are config in code (B-1028) | P1-10 | source-role.mjs | none | not stated | flywheel-b.md:L206 |
| entityDictionary rebuilt on every detectMentions and named resolve (B-1026) | P1-10 | entity-resolve.mjs:45, :70 | none | not stated | flywheel-b.md:L203 |
| crosswalk ROR and IMO_COMPANY rules marked UNCONFIRMED | P1-10 | crosswalk.mjs:95, :107 | none | not stated | flywheel-b.md:L199 |
| drain kinds name five deleted workflows as applyWorkflow | P1-12 | kinds.mjs:34, 79, 97, 115, 133 | [CONFIRMED: grep] | the kit's own runApply | runtimes-a.md:L66 |
| io-preflight thresholds labelled HYPOTHESIS, never calibrated | P1-12 | io-preflight.mjs 13-16, 44-213 | none | cooldown from harness_runs and in-process byte budget | runtimes-a.md:L104 |
| ENTITIES not-present fallback branch cannot run | P1-12 | apply-record-briefs.mjs:80-81, 394-404, 785 | [CONFIRMED: ls] | shim removed | runtimes-a.md:L120 |
| config.drained never updated; !== true always true | P1-12 | brief-export/queue.mjs:111, 151 | [CONFIRMED: grep] | not stated | runtimes-a.md:L122 |
| drift test cited is not in the tree; registry copy unguarded (B-0579, B-2193) | P1-12 | record-briefs/schema.mjs:92-99, 319-375 | [CONFIRMED: git ls-files] | import the registry | runtimes-a.md:L124 |
| forward-event identity key disagrees with migration 307 | P1-12 | src/lib/intake/flywheel-steps.mjs:13-16 | [CONFIRMED read] | one forwardEventKey, the 307 shape | runtimes-a.md:L138 |
| family artifact emitter drift (QA_LOOP_RUN_ID read by one copy only) | P1-12 | needs-search/artifact.mjs:14-22; question-answers/artifact.mjs:14-28 | none | P1-08's recordRun | runtimes-a.md:L143 |
| RESEARCH-SWEEP.md stale on two points (manifest not committed; seen-urls file not in tree) | P1-12 | RESEARCH-SWEEP.md | [CONFIRMED: ls] | TRASH; facts carried to section 8 and P1-13 | runtimes-a.md:L161 |
| apply-extraction-output has no harness artifact (rule 17 gap) | P1-12 | apply-extraction-output.mjs | none | kit per-kind downstream hook | runtimes-a.md:L172 |
| apply-need-urls reads all sources rows | P1-12 | apply-need-urls.mjs:94 | none | not stated | runtimes-a.md:L173 |
| raw createClient | P1-12 | apply-question-answers.mjs:304-305 | none | P1-01's service client | runtimes-a.md:L174 |
| raw item_changelog insert; dry structured-actions step (B-0327) | P1-12 | apply-record-briefs.mjs:573, 711-727 | none | kinds/record-briefs/apply (guarded) | runtimes-a.md:L175 |
| no try/catch around write; no revalidate (B-0893) | P1-12 | apply-theme-briefs.mjs:178 | none | not stated | runtimes-a.md:L176 |
| inputs_ref carries full part JSON (pool text) | P1-12 | brief-export/queue.mjs:127 | [CONFIRMED read] | queue row stores item ids and part paths only | runtimes-a.md:L178 |
| reads all full_brief then applies --limit | P1-12 | dry-run-structured-actions.mjs:80-81 | none | TRASH | runtimes-a.md:L182 |
| full item_forward_events read | P1-12 | export-corpus-for-extraction.mjs:377 | none | not stated | runtimes-a.md:L188 |
| raw run-ledger insert (B-0328) | P1-12 | io-preflight.mjs:231 | none | brief_apply_runs retires | runtimes-a.md:L192 |
| ledger-verdicts README stale on arming and config key (B-1080, B-1617) | P1-12 | ledger-verdicts/README.md | none | folds into AUTHORING | runtimes-a.md:L194 |
| reads all non-archived items for lineage | P1-12 | needs-search/data.mjs:108-110 | none | not stated | runtimes-a.md:L199 |
| reads inputs_ref of every row | P1-12 | read-brief-export-queue.mjs:77 | [CONFIRMED read] | the new queue stores ids and paths | runtimes-a.md:L207 |
| apply-theme-briefs: no revalidate, no downstream (rule 17 gap) | P1-12 | apply-theme-briefs.mjs | none | kit per-kind downstream hook | runtimes-a.md:L221 |
| consume-turn-requests: no artifact (rule 17 gap) | P1-12 | consume-turn-requests.mjs | none | kit per-kind downstream hook | runtimes-a.md:L227 |
| Defects list: raw changelog insert beside guarded writes (B-0327) | P1-12 | apply-record-briefs.mjs:573 | none | not stated | runtimes-a.md:L385 |
| Defects list: raw run-ledger insert (B-0328) | P1-12 | io-preflight.mjs:231 | none | not stated | runtimes-a.md:L385 |
| Defects list: a writer with no reader (B-0578) | P1-12 |  | none | not stated | runtimes-a.md:L385 |
| Defects list: validator whose duplicate guard was a test that no longer exists (B-0579, B-2193) | P1-12 |  | none | not stated | runtimes-a.md:L385 |
| Defects list: unwired preview that claims it writes nothing (B-0703, B-1077) | P1-12 |  | none | not stated | runtimes-a.md:L385 |
| Defects list: appliers that never ran live (B-0890 to B-0897) | P1-12 |  | none | not stated | runtimes-a.md:L385 |
| Defects list: write loop with no catch so a throw leaves no run record (B-0893) | P1-12 |  | none | not stated | runtimes-a.md:L385 |
| Defects list: comments that state a step count the code does not run (B-1073) | P1-12 | apply-record-briefs.mjs:520 | none | not stated | runtimes-a.md:L385 |
| Defects list: READMEs that describe deleted workflows and retired paths (B-1074, B-1080, B-1081, B-1082, B-1617) | P1-12 |  | none | not stated | runtimes-a.md:L385 |
| Defects list: lander named for a branch it no longer makes, passing with zero rows landed (B-1075, B-1076, B-2134) | P1-12 |  | none | not stated | runtimes-a.md:L385 |
| Defects list: a second landing path (B-1616) | P1-12 |  | none | not stated | runtimes-a.md:L385 |
| Defects list: a duplicate contract no code reads (B-2192) | P1-12 |  | none | not stated | runtimes-a.md:L385 |
| nothing invokes six of the seven runtimes; rule 17 satisfied by nothing | P1-13 | .github/workflows (eleven deleted) | [CONFIRMED git show --stat] | ONE turn runtime triggering its downstream stage itself | runtimes-b.md:L41 |
| four resume and gate mechanisms read a local directory empty on a checkout | P1-13 | run-population-flywheel.mjs:1481, :1490; run-source-sweep.mjs:1244; run-ledger-consume.mjs:1435-1441, :1595; run-propagation-drain.mjs:259 | [CONFIRMED git check-ignore; ls] | the port reads all four from the harness_runs table (P1-08) | runtimes-b.md:L42 |
| apply always disarmed (no batch files); every --mode apply runs as plan | P1-13 | run-ledger-consume.mjs:1117-1134 | [CONFIRMED] | not stated | runtimes-b.md:L93 |
| stale parameter name applyEnabled | P1-13 | run-ledger-consume.mjs:1121 | [CONFIRMED read] | not stated | runtimes-b.md:L95 |
| writer with no reader: record-last-turn writes tracked LAST-TURN.json | P1-13 | run-population-flywheel.mjs:1238-1241, :641-648 | [CONFIRMED] | NOT PORTED (the run ledger's last connect row is the marker) | runtimes-b.md:L97 |
| dead flag --max-hosts | P1-13 | run-source-sweep.mjs:105, :179, :266-269, :300, :1386 | [CONFIRMED read] | one metric name per count; dead flag dropped | runtimes-b.md:L99 |
| propagation replay vacuous: failed ids never replayed | P1-13 | run-propagation-drain.mjs:221-226, :259 | [CONFIRMED ls and .gitignore:82] | replay from harness_runs | runtimes-b.md:L103 |
| sitemap cursor vacuous: every --all-hosts run restarts at the front | P1-13 | run-source-sweep.mjs:1243-1245 | [CONFIRMED] | cursor from harness_runs | runtimes-b.md:L104 |
| export cursor vacuous: every export starts at the beginning | P1-13 | run-ledger-consume.mjs:1595 | [CONFIRMED] | export cursor from harness_runs | runtimes-b.md:L105 |
| --check-gate vacuous: answers ok whatever the database holds | P1-13 | run-population-flywheel.mjs:1479-1486 | [CONFIRMED read and ls] | THE GATE over harness_runs | runtimes-b.md:L106 |
| density and added_date selected, never read | P1-13 | theme-briefs/data.mjs:7 | [CONFIRMED read] | not stated | runtimes-b.md:L109 |
| name, institution_id selected, never read | P1-13 | research-sweep.mjs:369 | [CONFIRMED read] | not stated | runtimes-b.md:L110 |
| README every operational pointer stale | P1-13 | theme-briefs/README.md | [CONFIRMED] | TRASH; contract carried by section 8 and INV-198 | runtimes-b.md:L141 |
| fetch has no timeout; seen-URL manifest is a local file | P1-13 | research-sweep.mjs:392, :373-377 | none | seen-state in the database; every fetch carries a timeout | runtimes-b.md:L152 |
| route non-ok recorded route_error and run exits 0; read helpers return 0 or [] on error | P1-13 | run-change-detection.mjs:217, :487-491, :534-535, :550, :585, :593 | none | a failed read is a stage error | runtimes-b.md:L153 |
| POST has no timeout; service-role key sent as Bearer to own function URL; per-item HTTP failure exit 0 | P1-13 | run-fetch-drain.mjs:328-336, :330-333 | none | batched capture with a timeout | runtimes-b.md:L154 |
| arming rules described differently; verdict validator restates schema (B-1620, B-1621, B-1622) | P1-13 | run-ledger-consume.mjs | none | verdict load against schema.json | runtimes-b.md:L155 |
| step numbers disagree in comments; writes a tracked file; five spawned children (B-1083) | P1-13 | run-population-flywheel.mjs:51, :650 | none | in-process handlers | runtimes-b.md:L156 |
| raw monitoring_queue insert and raw storage upload outside guarded path; failed upsert error text dropped (B-0329) | P1-13 | run-source-sweep.mjs:1199, :1159, :409-411 | none | guarded storage writer; recordChangeSignal (guarded insert) | runtimes-b.md:L158 |
| ws[0] single-tenant weights (B-0912) | P1-13 | theme-briefs/data.mjs:63-64 | none | weights per org | runtimes-b.md:L161 |
| production CLIs import a test fake for --fixture | P1-13 | theme-briefs/fixture-deps.mjs | none | production entry points take no --fixture flag | runtimes-b.md:L162 |
| product module under src imports a scripts file | P1-13 | src/lib/research/theme-brief.mjs:7 | none | contract in src/core | runtimes-b.md:L163 |
| Defects list: raw write outside the guarded path (monitoring_queue insert and storage upload) (B-0329) | P1-13 |  | none | not stated | runtimes-b.md:L335 |
| Defects list: outputs no automated consumer reads (B-0580) | P1-13 |  | none | not stated | runtimes-b.md:L335 |
| Defects list: runtime with no invoker and no proof (B-0898, B-0899, B-1619, B-1622) | P1-13 |  | none | not stated | runtimes-b.md:L335 |
| Defects list: comments that disagree with the step order (B-1083) | P1-13 |  | none | not stated | runtimes-b.md:L335 |
| Defects list: arming rules described differently in docs and code (B-1620, B-1621) | P1-13 |  | none | not stated | runtimes-b.md:L335 |
| Defects list: a step chain that exists only as a workflow graph (B-1873) | P1-13 |  | none | not stated | runtimes-b.md:L335 |
| Defects list: single-tenant reads in a multi-org product and a schema probe by error text (B-0912) | P1-13 |  | none | not stated | runtimes-b.md:L335 |
| Defects list: resume state and gates read from a local directory | P1-13 | (INV-196) | none | not stated | runtimes-b.md:L335 |
| Defects list: fetches with no timeout | P1-13 |  | none | not stated | runtimes-b.md:L335 |
| Defects list: an exit 0 after a route error | P1-13 |  | none | not stated | runtimes-b.md:L335 |
| Defects list: read helpers that turn a failed read into zero | P1-13 |  | none | not stated | runtimes-b.md:L335 |
| Defects list: a production module importing a test fake | P1-13 |  | none | not stated | runtimes-b.md:L335 |
| Defects list: a runtime that writes a tracked file | P1-13 |  | none | not stated | runtimes-b.md:L335 |
| holds written only to _snapshots/*.held.json, never to census_worklist, so held rows re-selected and re-fetched every run | P1-14 | export-census-rows.mjs | [CONFIRMED read] | every exported or held census row ends the run with its disposition recorded on census_worklist (INV-297) | mint.md:L149 |
| summary "eligible (post filters/limit)" computed from preselected (B-2187) | P1-14 | export-census-rows.mjs 1457, 1507 | [CONFIRMED read] | not stated | mint.md:L149 |
| numeric-tolerant tier folds 12.345 onto 12,345; claim_text rewritten to another sentence at Jaccard 0.15 (B-2188) | P1-14 | heal-provenance.mjs 762-787, 2458, 3157-3171 | none | value-preserving numeric fold; re-kind without rewriting text (INV-298) | mint.md:L150 |
| restore_sql assembled so a lint heuristic cannot see it | P1-14 | heal-provenance.mjs 2216-2223 | none | not stated | mint.md:L150 |
| heal runtime entry orphaned by CLEAN-3 | P1-14 | heal-provenance.mjs:3929, 3996 | [CONFIRMED] | heal/run | mint.md:L101 |
| core_sustainability_climate_environment cites a companion note that does not exist | P1-14 | screen-rules.mjs:124 | [CONFIRMED read] | not stated | mint.md:L151 |
| census row stamped reconciled for every inserted item including minted_unverified (B-2186) | P1-14 | apply-mint-batch.mjs 452-464 | [CONFIRMED read] | reconciled only on minted_verified; hold with reason otherwise | mint.md:L152 |
| header and artifact note say reopen re-validates (it does not); note says discovery did not run here (it does) (B-1065) | P1-14 | apply-mint-batch.mjs 159-163, 676-677, 678-681, 404-417 | [CONFIRMED read] | not stated | mint.md:L152 |
| cache tags omit community | P1-14 | apply-mint-batch.mjs:702 | none | cache flush including community | mint.md:L152 |
| Gate B not modelled in replica; record_hollow reported as criterion 5 though live RPC has no such check | P1-14 | validate-mint-payload.mjs 680, 442-461 | none | replica TRASH; kit checks kept | mint.md:L153 |
| stale "no exporter ships" (B-1066) | P1-14 | run-mint-batch.mjs:64 | [CONFIRMED] | not stated | mint.md:L154 |
| reopen per-row update loop; never re-validates | P1-14 | reopen-validation-holds.mjs | none | not stated | mint.md:L157 |
| migration-299 precheck guards a NEVER APPLIED migration; caller swallowed its exit code | P1-14 | migration-299-precheck.mjs | [CONFIRMED read] | TRASH; ruling to P1-11 | mint.md:L156 |
| screen-reconcile ambiguous list has no consumer; census joined by exact URL only | P1-14 | screen-reconcile-records.mjs 56, 48 | none | not stated | mint.md:L159 |
| rederive one rpc per candidate, sequential, no cap; builds its own client | P1-14 | rederive-record-provenance.mjs 36, 75 | none | not stated | mint.md:L160 |
| tag_presence output has no reader (B-0573) | P1-14 | lib/tag-presence-check.mjs:36 via run-mint-batch.mjs:255 | [CONFIRMED] | warning recorded on the ledger row | mint.md:L161 |
| mint canonicalizer null behaviour differs from src copy (B-2189) | P1-14 | lib/canonicalize-citation-url.mjs | none | use src/lib/agent/url-canon.mjs | mint.md:L164 |
| item-type-required-slots.json stricter than live table by four slots; _intake_note describes absent types | P1-14 | item-type-required-slots.json | [CONFIRMED read] | the table is the source | mint.md:L169 |
| --grade brief in batch mode parsed and never read | P1-14 | run-mint-batch.mjs:534-537 | [CONFIRMED read] | not stated | mint.md:L107 |
| --max-items recorded, never enforced | P1-14 | run-mint-batch.mjs:490-492, 612 | [CONFIRMED read] | not stated | mint.md:L108 |
| citation regex divergence (« » etc excluded in one, not the other) (B-2188) | P1-14 | validate-mint-payload.mjs:318; heal-provenance.mjs:1446 | [CONFIRMED read; B1c executed] | one CITED_URL_RE | mint.md:L119 |
| MINT-RUNBOOK partly stale (enrichment, withdrawn types, off_domain vs off_vertical) (B-1064) | P1-14 | MINT-RUNBOOK.md 494-497 | [CONFIRMED read] | TRASH, rulings carried into section 8 | mint.md:L140 |
| payload-schema.json not enforced; screen.provenance enum lacks registry (B-0320) | P1-14 | payload-schema.json; validate-mint-payload.mjs:481 | [CONFIRMED] | typed MintPayload | mint.md:L141 |
| ambiguous rows parked forever; rulings and verdicts stored as code and committed data | P1-14 | screen-rules.mjs; reviewed-verdicts.json | none | screen_verdicts table; ambiguous resolver ruling | mint.md:L334 |
| SCREEN-REPORT-FORMAT describes replaced flow (B-1067, B-1068, B-2006) | P1-14 | SCREEN-REPORT-FORMAT.md | none | TRASH | mint.md:L166 |
| no flywheel hand-off inside the module (rule 17 defect) | P1-14 | (deleted population-turn.yml) | [CONFIRMED read] | run.ts hand-off to P1-09/10 in the same run | mint.md:L197 |
| judgement drain apply side points at six workflows deleted by CLEAN-3 | P1-15 | kinds.mjs :34, :61, :79, :97, :115, :133; plan-drain.mjs:115 | [CONFIRMED git show --stat] | kinds carry a dispatcher step id (P1-08) instead of a workflow filename | producers.md:L132 |
| governing-files list hand-copies the family descriptor and names deleted producers.yml | P1-15 | emit-producers-artifact.mjs :106-113 | [CONFIRMED read and ls] | governing files read from the family descriptor (core/producers/summary) | producers.md:L148 |
| entity-ref check the header promises is never run by a producer | P1-15 | operator-rows-contract.mjs validateEntityRefs; auxiliary:47, indexation:60 | [CONFIRMED read] | entity-ref validation now called (core/producers/rows-file.ts) | producers.md:L168 |
| process.exit inside main after a top-level await (B-0324) | P1-15 | ecb-fx-producer.mjs | none | no process.exit inside an async function (test/lint property) | producers.md:L218 |
| dry mode reads no existing rows so a dry plan always says create-all | P1-15 | eu-weekly-oil-bulletin.mjs:77-79 | none | not stated | producers.md:L220 |
| GB entity must pre-exist; reads the whole sources table (B-0325) | P1-15 | ukpn-capacity-heatmap-producer.mjs :311-312, :223 | none | not stated | producers.md:L232 |
| exits 2 without credentials even in dry; no rate-limit check (B-0326) | P1-15 | bls-oews-producer.mjs :61-64 | none | not stated | producers.md:L233 |
| EEA producer plans 0 rows with the shipped config (B-0576) | P1-15 | eea-hdv-co2-producer.mjs | none | not stated | producers.md:L229 |
| header still calls migration 344 DDL-sketch-only; only items with no current row scored, no drift re-score (B-1072) | P1-15 | research-assessment-producer.mjs :31, :444-450 | none | not stated | producers.md:L244 |
| bare catch drops the error text (B-0271) | P1-15 | questions-on-change.mjs:162 | none | not stated | producers.md:L253 |
| subject_ref carries no event id, so a change-time question collides with an open mint-time one (B-1572) | P1-15 | trigger-questions.mjs :84, :154 | [CONFIRMED read] | ports today's behaviour and records the choice (ruling owed) | producers.md:L254 |
| highAuthorityIndependent unreachable in production because funding is always null (B-0701) | P1-15 | authority-score.mjs; producer :176 | [CONFIRMED read] | not stated | producers.md:L255 |
| research walker mode hard-coded dry, apply arm unreachable (B-0577) | P1-15 | research-walker.mjs:503, :446-454 | [CONFIRMED read] | the walker becomes a producer spec: search, rate, mint through the chokepoint | producers.md:L260 |
| computePayloadPenalty has no caller; panel does not render the delta | P1-15 | src/lib/spec09/oem-payload.mjs | [CONFIRMED census] | lost feature until P1-19/20 wires it | producers.md:L277 |
| OpenAlex client has no timeout, retries 429 only | P1-15 | openalex-client.mjs | none | a 20-second timeout (core/http/openalex) | producers.md:L259 |
| split.mjs breaks a quoted field containing a newline | P1-15 | src/lib/csv/split.mjs | [CONFIRMED read and A4d:321] | the streaming reader is the one CSV home; splitCsvText a wrapper | producers.md:L138 |
| a process.exit inside an async main (B-0324) | P1-15 | ecb-fx-producer.mjs | none | not stated | producers.md:L460 |
| producer reads existing rows in dry mode so needs credentials to plan | P1-15 | bls-oews-producer.mjs (B1b) | none | not stated | producers.md:L460 |
| dry plan always says create-all because existing rows are not read | P1-15 | eu-weekly-oil-bulletin.mjs | none | not stated | producers.md:L460 |
| whole-table reads filtered in JavaScript | P1-15 | ecb, eia, eu-weekly, sbti, refresh, ukpn, neso | none | not stated | producers.md:L460 |
| header states a migration is a sketch when it is in the tree (B-1072) | P1-15 | research-assessment-producer.mjs | none | not stated | producers.md:L460 |
| question dedup key silently absorbs change-time questions (B-1572) | P1-15 | trigger-questions.mjs | none | not stated | producers.md:L460 |
| bare catch that drops the error text (B-0271) | P1-15 | questions-on-change.mjs | none | not stated | producers.md:L460 |
| rate limit never checked (B-0326) | P1-15 | bls-oews-producer.mjs | none | not stated | producers.md:L460 |
| governing-file list hand-copied beside the descriptor | P1-15 | emit-producers-artifact 103-113 | none | not stated | producers.md:L460 |
| summary presented as a page capture (B-2007) | P1-15 | refresh-published-price-statistics.mjs / build-oil-bulletin-rows.mjs | none | not stated | producers.md:L460 |
| fixtures with invented figures on real organisations (B-1070, B-0698) | P1-15 | carrier-ets-surcharge-fixtures.mjs, state-cost-facts-fixtures.mjs | none | not stated | producers.md:L460 |
| three identical mains (B-0357, B-2215 to B-2217) | P1-15 | grid-queue, oem-roadmap, reroute producers | none | not stated | producers.md:L460 |
| contract check the producer never calls | P1-15 | validateEntityRefs | none | not stated | producers.md:L460 |
| entity-ref the mapper reads and ignores (B-1571) | P1-15 | eea-hdv-map.mjs | none | not stated | producers.md:L460 |
| exports kept "for tests" that no longer exist | P1-15 | section 4 | none | not stated | producers.md:L460 |
| fetchUpcomingObligations has no executable caller (B-1565) | P1-16 | read-upcoming.mjs:234 | [CONFIRMED] | not stated | obligations.md:L85 |
| no-op .replace('ç', 'ç') (same byte sequence) | P1-16 | extract-forward-events.mjs:70 | [CONFIRMED: od -c] | not stated | obligations.md:L92 |
| re: field on rule entered-into-force-on unread | P1-16 | extract-forward-events.mjs:646 | [CONFIRMED grep] | not stated | obligations.md:L93 |
| let dateStart never reassigned | P1-16 | extract-forward-events.mjs:898 | [CONFIRMED read] | not stated | obligations.md:L94 |
| two silent drops (claim with no span; section with empty md) against "every drop recorded" rule | P1-16 | extract-forward-events.mjs:1310 to 1312, 1412 | [CONFIRMED read] (A4a:231) | a spanless claim and an empty section land in skipped | obligations.md:L95 |
| OBJECT_INSERT_COLUMNS referenced nowhere | P1-16 | derive-obligation-objects.mjs:15 | [CONFIRMED] | not stated | obligations.md:L101 |
| OBJECT_DERIVATION_VERSION never stamped on a row | P1-16 | derive-obligation-objects.mjs:5 | [CONFIRMED read] | a derivation_version on the row | obligations.md:L102 |
| BINDING_POSITION_RULES exported for tests and an audit UI, neither exists | P1-16 | classify-binding-position.mjs:165 | [CONFIRMED] | rule table as data | obligations.md:L90 |
| detail variant still uses overfetch path (spec.limit * 5 / 1000) the CAP-1000 fix replaced | P1-16 | read-register.mjs 272 to 306; register/route.ts:96 | none | one paged read; detail variant passes itemId and limit | obligations.md:L67 |
| obligation-object writer has no producer; every chained run passes [] (B-0574, B-0697, B-1610) | P1-16 | derive-obligation-objects.mjs | [CONFIRMED grep] | keep the writer; producer is a gap for the coordinator | obligations.md:L71 |
| proposer_notes carries a dated narrative and a user-home path; FORWARD_EVENTS_GOVERNING_FILES 0 importers | P1-16 | run-extraction.mjs 181 to 187, 24 | [CONFIRMED] | shared envelope under P1-08 | obligations.md:L72 |
| DRY-RUN-REPORT machine evidence under scripts/ (B-1113, B-2026) | P1-16 | scripts/forward-events/DRY-RUN-REPORT.md | none | TRASH | obligations.md:L73 |
| two write paths for compliance_deadline; raw .update() beside guarded path (A4a:229) | P1-16 | compliance-deadline-sync.mjs 49 to 55, 53; dispatch-extraction.mjs 84 to 103 | none | one syncComplianceDeadline taking the writer | obligations.md:L74 |
| half-finished sentence in route header | P1-16 | upcoming/route.ts:39 | none | one sentence each | obligations.md:L75 |
| readOptional swallows read error; chained run classifies by title alone and reports success (B-0322) | P1-16 | derive-obligations.mjs:245 to 253 | none | optional reads surfaced, not swallowed | obligations.md:L131 |
| events-query error folded into empty result; item read drops error; overfetch before scope filter starves short; uk never matches GB (B-1564, B-0058, B-0260) | P1-16 | read-upcoming.mjs 209, 215, 206 | [CONFIRMED read] | readUpcoming with the scope filter in the query and errors surfaced | obligations.md:L148 |
| two item reads drop error; paged read returns {rows: [], total} on segment error (B-0049) | P1-16 | read-register.mjs 295, 472, 464 | [CONFIRMED read] | one paged read with errors surfaced | obligations.md:L151 |
| register legacy_id lookup drops error (B-0038) | P1-16 | register/route.ts:90 | none | resolveItemId from core/db | obligations.md:L153 |
| upcoming soft-fails to {events: []} on any throw (outage reads as no obligations); legacy_id lookup drops error (B-0039) | P1-16 | upcoming/route.ts 131 to 136, 76 | [CONFIRMED read] | 503 on failure instead of an empty 200 (ruling to settle) | obligations.md:L154 |
| full readAll("obligations", "forward_event_id") each run | P1-16 | derive-obligations.mjs:268 | [CONFIRMED read] | not stated | obligations.md:L155 |
| harness family.json names a governing file of a deleted workflow (date-chain.yml) | P1-16 | scripts/harness-runs/date-chain/family.json | [CONFIRMED] | P1-08 (governing paths updated) | obligations.md:L136 |
| every Supabase read must handle error: violated at six sites | P1-16 | read-register.mjs 295, 472; read-upcoming.mjs 215; register/route.ts 90; upcoming/route.ts 76; read-upcoming.mjs 209 | none | property test/lint: every read destructures and handles error | obligations.md:L251 |
| 200-character floor restated (B-2158) | P1-16 | read-and-extract.mjs:97 and others | none | one constant in the capture module | obligations.md:L327 |
| three writers of item_forward_events with three dedupe postures (A4a:238 to 240) | P1-16 | flywheel-steps.mjs; mint-enrichment.ts; dispatch-extraction.mjs | none | one insertForwardEvents | obligations.md:L327 |
| header history superseded (67-134 reversed by 135-165); narrow variant identical to dash (B-0204) | P1-17 | Absence.tsx | [CONFIRMED] | `narrow` folded into `dash`; one sentence per part | ui-kit.md:L189 |
| raw rgba rules where --line-2 exists | P1-17 | ActionCard.tsx:264, :289; DetailSubSection.tsx:19 | none | the two 1px rules on `--line-2` | ui-kit.md:L190 |
| share and copy fail silently (B-0205, B-1527) | P1-17 | ActionRow.tsx:186, :196 | [CONFIRMED] | returning a result the caller shows ("Link copied", "Copy failed") | ui-kit.md:L191 |
| ActionRow media 768 while every other part uses 767 | P1-17 | ActionRow.tsx:73 | [CONFIRMED] | one base.css; the breakpoint typed once | ui-kit.md:L191 |
| BandTile style tag per tile; aria-label builds own dash glyph | P1-17 | BandTile.tsx:69-84, :170 | none | not stated | ui-kit.md:L194 |
| Button sm about 28 px, md about 36 px under 44 floor | P1-17 | Button.tsx:29-30 | [CONFIRMED] | sizes with the 44 px floor as the smallest | ui-kit.md:L197 |
| WorkspaceTagPill remove button 14x14 no clearance; raw hex | P1-17 | Chips.tsx:211-213, :191, :247, :259, :264, :316 | [CONFIRMED] | remove button 24 px with 8 px clearance | ui-kit.md:L199 |
| CommandBar failed search renders "No results"; window.location.href navigation | P1-17 | CommandBar.tsx:252, :256-258, :395 | [CONFIRMED] | a failed search says so (StateNote error variant) | ui-kit.md:L200 |
| CoverageState request action fetches inside kit | P1-17 | CoverageState.tsx:94 | none | `onRequest` callback and `requestState` props replace the inline fetch | ui-kit.md:L201 |
| DetailTagRow remove returning false ignored; load errors not surfaced (B-1528) | P1-17 | DetailTagRow.tsx:72-74 | [CONFIRMED] | every false and null result shown | ui-kit.md:L203 |
| FactCard TierSquare literal ceiling 7 (B-2144) | P1-17 | FactCard.tsx:222 | [CONFIRMED] | TierChip from Chips (SOURCE_TIER_MAX) | ui-kit.md:L205 |
| raw #7A6E6C where --ink-3 exists | P1-17 | ImpactMeter.tsx:199 | none | not stated | ui-kit.md:L207 |
| ListRow 13.6 KB CSS per row | P1-17 | ListRow.tsx:802, :573, :278 | [CONFIRMED] | class names only; rows in base.css | ui-kit.md:L210 |
| Masthead nowFrom(undefined) reads new Date() in render; VOL IV literal (B-0209) | P1-17 | Masthead.tsx:107, :28; render-now.ts:10 | [CONFIRMED] | `nowIso` required; `volume` a prop | ui-kit.md:L211 |
| MilestoneTimeline re-export no importer; variant="full" no caller | P1-17 | MilestoneTimeline.tsx:40-45, :37, :75 | [CONFIRMED] | not stated | ui-kit.md:L212 |
| RailCard headLink bare `<a>` for internal route (A2bc L1) | P1-17 | RailCard.tsx:96 | [CONFIRMED] | `headLink` renders next/link | ui-kit.md:L213 |
| RelativeTime setInterval per instance | P1-17 | RelativeTime.tsx:31 | [CONFIRMED] | one shared 60 s ticker | ui-kit.md:L214 |
| RowTable legacy tokens; menu "undesigned, do not invent" | P1-17 | RowTable.tsx:224, :333-334, :24-28 | none | overflow on the Menu primitive | ui-kit.md:L215 |
| SectionHeader hex fallbacks; title 24px override with !important | P1-17 | SectionHeader.tsx:85, :108; globals.css:625-626 | none | on SectionHead's `rule` and `size` props, no `!important` | ui-kit.md:L217 |
| SectionIndex imports SummaryDepthSwitch from consumer | P1-17 | SectionIndex.tsx:41 | [CONFIRMED] | the depth switch inside the kit | ui-kit.md:L219 |
| SectionRule raw hex gradient where --brand exists (B-0214) | P1-17 | SectionRule.tsx:28 | [CONFIRMED] | the card shell with the rule on `--brand` | ui-kit.md:L222 |
| StatBlock header names deleted AdminStatTile (B-0212) | P1-17 | StatBlock.tsx:25 | [CONFIRMED] | not stated | ui-kit.md:L225 |
| StateNote action.href bare `<a>` (A2bc L2) | P1-17 | StateNote.tsx:78 | [CONFIRMED] | `action.href` renders next/link | ui-kit.md:L226 |
| SystemErrorBanner reads undefined warning tokens, raw hex fallbacks live | P1-17 | SystemErrorBanner.tsx:19-20 | [CONFIRMED] | on `--action-tint` and `--action-border` | ui-kit.md:L227 |
| TagPopover apply/remove false ignored, create null silent; five raw hex (B-0215, B-0214) | P1-17 | TagPopover.tsx:169-176, :189, :264, :286, :295, :333, :377 | [CONFIRMED] | every false and null result shown; raw hex to tokens | ui-kit.md:L229 |
| TagPopover uncontrolled trigger branch unreachable | P1-17 | TagPopover.tsx:246-273 | [CONFIRMED] | not stated | ui-kit.md:L146 |
| Timeline both forms in DOM; tab stop per marker; "obligations are current" from entry list alone (B-1965, B-1964) | P1-17 | Timeline.tsx:111-144, :357, :219 | [CONFIRMED] | one markup, grid reflow; one focusable per marker | ui-kit.md:L230 |
| Toast timer re-arms every parent render; no max-width; inner timeout not cleared (B-1966, B-1967) | P1-17 | Toast.tsx:36, :45-47, :32 | [CONFIRMED] | toast with max-width, timer keyed on `visible` only, inner timeout cleared | ui-kit.md:L231 |
| WatchButton failed membership read leaves "Watch"; failure only as title | P1-17 | WatchButton.tsx:121, :253-259, :337-345 | [CONFIRMED] | a visible failure line | ui-kit.md:L232 |
| milestone-timeline-classify `!hasNext` dead (B-0210) | P1-17 | milestone-timeline-classify.ts:8 | [CONFIRMED] | hasNext parameter dropped | ui-kit.md:L235 |
| section-index-styles raw #FFFFFF (B-0214) | P1-17 | section-index-styles.ts:42 | [CONFIRMED] | not stated | ui-kit.md:L237 |
| nav-counts fixture counts frozen 2026-09-23 (B-0203) | P1-17 | __fixtures__/nav-counts-fixture.ts:3-12 | [CONFIRMED] | move with gallery or test fixtures | ui-kit.md:L243 |
| globals.css ::selection orange no token defines; 36 !important | P1-17 | globals.css:192-195 | [CONFIRMED] | selection on the token | ui-kit.md:L186 |
| theme.css 73 tokens unread; kit reads 12 legacy names, two undefined falling back to hex (B-0654, B-0656) | P1-17 | theme.css | [CONFIRMED] | no alias layer | ui-kit.md:L185 |
| Skeleton fitness-allow F42 comment for deleted enforcer | P1-17 | Skeleton.tsx:73 | [CONFIRMED] | deleted with history move | ui-kit.md:L147 |
| defects list: silent share/copy, silent tag failures, render-time clock, dead hasNext, header naming deleted wrapper, raw hex, stale header, frozen counts, dead stylesheet layer, tier ceiling literal, timeline sentence, hidden tab stop, toast timer and width, two heads, sub-floor Button and tag pill, failed search as no results, bare anchor, 13.6 KB CSS per row (B-0205, B-1527, B-0215, B-1528, B-0209, B-0210, B-0212, B-0214, B-0204, B-0203, B-0654, B-0656, B-2144, B-1964, B-1965, B-1966, B-1967, B-1529) | P1-17 |  | none | not stated | ui-kit.md:L426 |
| stale/wrong narrative comments (useNearestScrollParent says min-h-screen; deferred rail cards exist; 44 px fix sets 28) (B-0156) | P1-18 | useNearestScrollParent.ts:35-53; ListSurfaceShell.tsx:19-26; ListSurfaceSortRow.tsx:137-145 | [CONFIRMED] | one header sentence per file; rulings cited by id in section 8 | shell-list.md:L113 |
| bootstrap ships adminAttention nobody reads while Sidebar polls separately (B-0562, B-0563, B-1029, B-2159) | P1-18 | src/app/api/workspace/bootstrap/route.ts:63,84; useWorkspaceBootstrap.ts:80 | [CONFIRMED] | admin attention read from bootstrap with one visible-tab refresh for platform admins | shell-list.md:L114 |
| unread poll per instance and with no signed-in gate (anonymous /privacy 401) (B-0153) | P1-18 | useUnreadNotificationsCount.ts:44-71; TopBar.tsx:66 | [CONFIRMED] | one gated unread singleton | shell-list.md:L184 |
| market detail keyword-regex classification of severity and band when null | P1-18 | MarketSignalDetailSurface.tsx 205-222, 231-297 | [CONFIRMED] | severity and band from the columns only, absence when null | shell-list.md:L115 |
| carbon-intensity block rendered twice | P1-18 | MarketSignalDetailSurface.tsx 629-652, 697-713 | [CONFIRMED] | one carbon block | shell-list.md:L115 |
| "Do now" reads r.recommendedActions which no mapper fills (always-empty branch) | P1-18 | MarketSignalDetailSurface.tsx:433, 666-680 | [CONFIRMED] | not stated | shell-list.md:L140 |
| IntelligenceBrief rewrites brief text with regexes and colours cells by substring (B-0662) | P1-18 | IntelligenceBrief.tsx 427-452, 370-377 | [CONFIRMED] | TRASH | shell-list.md:L222 |
| LIST_SURFACE_MOBILE_CSS injected twice per mount | P1-18 | ListSurfaceShell.tsx:384, :411 | [CONFIRMED] | CSS once | shell-list.md:L142 |
| overlays role=dialog with scrim click, no Esc, no focus move or return (B-1955) | P1-18 | Sidebar.tsx:471-525; ListSurfaceShell.tsx 240-317 | [CONFIRMED] | P1-17 Dialog under Sheet supplies scrim, Esc, focus move and return | shell-list.md:L118 |
| settings Dashboard defaults write keys nothing reads (B-0543) | P1-18 | SettingsPage.tsx:359-459 | [CONFIRMED] | a control ships only with its reader and its write | shell-list.md:L143 |
| Freight sectors card sets in-memory zustand only, never persists | P1-18 | stores/workspaceStore.ts:45 | [CONFIRMED] | moves to P1-02 | shell-list.md:L119 |
| NO_SIDEBAR_ROUTES omits /privacy: anonymous visitor gets signed-in shell and polls (B-0121) | P1-18 | AppShell.tsx:19 | [CONFIRMED] | /privacy and the auth routes without the signed-in chrome | shell-list.md:L181 |
| prefix route match (/auth matches /author, /market matches /marketplace) (B-1980) | P1-18 | AppShell.tsx:40; Sidebar.tsx:102, :137 | none | segment match | shell-list.md:L158 |
| BackToTop listens to window while main scrolls, never shows; 40x40 (B-0658, B-1518, B-0127) | P1-18 | BackToTop.tsx; AppShell.tsx:160, :254 | [CONFIRMED] | appears after 400 px of `<main>` scroll, 44 px target | shell-list.md:L185 |
| bootstrap never reset on sign-out; signed-out attempt keeps prior data (B-1566) | P1-18 | useWorkspaceBootstrap.ts:139-147 | [CONFIRMED] | one per-session bootstrap store, reset on auth change | shell-list.md:L188 |
| no guard for absent personalState (B-0262) | P1-18 | usePersonalState.ts:49 | [CONFIRMED] | not stated | shell-list.md:L190 |
| scroll container resolved once, never re-resolved (B-0261) | P1-18 | useNearestScrollParent.ts:72-91 | [CONFIRMED] | context exposing `<main>` to VirtualizedRowList and BackToTop | shell-list.md:L193 |
| nav counts failure returns zeros; Sidebar prints "0" | P1-18 | nav-counts.ts:41-43; Sidebar.tsx:158, :192 | [CONFIRMED] | null on failure, never zeros | shell-list.md:L194 |
| root loading is dashboard-shaped skeleton for every route; raw #fafaf8 | P1-18 | app/loading.tsx:3 | none | route-neutral skeleton from P1-17's SkeletonPage | shell-list.md:L197 |
| error page "Failed to load dashboard data", names Supabase, echoes error.message (B-0093, B-1511) | P1-18 | app/error.tsx:41-49 | [CONFIRMED] | route-neutral copy, digest reference, retry, report; no raw message, no vendor name | shell-list.md:L198 |
| privacy renders `<main>` inside AppShell `<main>` | P1-18 | app/privacy/page.tsx:12 | [CONFIRMED] | no nested `<main>` | shell-list.md:L200 |
| useRemainderFetch turns failed remainder into empty rest; list stays at first page (B-0155) | P1-18 | ListSurfaceShell.tsx:659-661 | [CONFIRMED] | first page plus remainder with an explicit failed state and Retry | shell-list.md:L201 |
| sort, window and surface facets not in URL contract | P1-18 | list-surface-helpers.ts | none | one param vocabulary for every list facet, sort, window and surface extras | shell-list.md:L202 |
| Obligations card renders failed route as Absence "not in primary source" | P1-18 | ListSurfaceRailCards.tsx:303-310, :331-332 | [CONFIRMED] | obligations rail card with an error state | shell-list.md:L204 |
| Carbon foot auditor note on customer card; Clear button minHeight 24 (B-1923) | P1-18 | ListSurfaceRailCards.tsx:472-473 | none | not stated | shell-list.md:L204 |
| SortRow options minHeight 28, stale rationale (B-0156) | P1-18 | ListSurfaceSortRow.tsx:137-145 vs :152 | [CONFIRMED] | not stated | shell-list.md:L205 |
| ItemConnectionsCard prints basis scores to customers; link cards no min height (B-1954) | P1-18 | ItemConnectionsCard.tsx:260, :139, :268 | none | not stated | shell-list.md:L212 |
| PageMasthead mobile 64 px left padding clears a hamburger that no longer exists (B-1000, B-0191) | P1-18 | PageMasthead.tsx:69-77 | none | TRASH | shell-list.md:L215 |
| SettingsPage fixed 40 px padding, collapse only at 1100 (B-1934) | P1-18 | SettingsPage.tsx | none | not stated | shell-list.md:L220 |
| IntelligenceMetadataStrip any fetch error renders nothing (B-0663) | P1-18 | IntelligenceMetadataStrip.tsx:87-95 | none | TRASH | shell-list.md:L223 |
| revalidate-item comment says sliding window; limiter is fixed window (B-1547) | P1-18 | api/cache/revalidate-item/route.ts | none | not stated | shell-list.md:L232 |
| revalidate route not wrapped in withErrorCapture | P1-18 | api/revalidate/route.ts | none | not stated | shell-list.md:L233 |
| public listing read has no failed flag: RPC error same as empty corpus | P1-18 | supabase-server.ts:975-980 | [CONFIRMED] | readListing returns `failed` | shell-list.md:L234 |
| slim RPC missing id tiebreak "flagged, not fixed" | P1-18 | supabase-server.ts:750-756 | none | every listing RPC gets a total order | shell-list.md:L234 |
| failed timeline chunk renders items with no timeline, logged only | P1-18 | supabase-server.ts:1112-1125 | [CONFIRMED] | chunked timelines with a per-chunk failure count | shell-list.md:L235 |
| aggregates return zeros on error | P1-18 | supabase-server.ts:1454 | [CONFIRMED] | aggregates and surface counts, null on failure | shell-list.md:L236 |
| category read catch returns empty | P1-18 | supabase-server.ts:2226-2229 | none | category routed reads, paged, failure surfaced | shell-list.md:L237 |
| payload wrappers ignore failed and report every empty as rpc_error | P1-18 | supabase-server.ts:3062-3064, :3100-3101 | [CONFIRMED] | not stated | shell-list.md:L238 |
| theme chips reads every row then slices 12; read error returns [] with no log | P1-18 | supabase-server.ts:4407 | none | theme chips strip and its bounded reader | shell-list.md:L239 |
| identical-arm ternaries | P1-18 | Sidebar.tsx:235; PageMasthead.tsx:46 | [CONFIRMED] | not stated | shell-list.md:L141 |
| ThemeStripView internal word "Themes across the corpus", "Brief - stale" (B-0193) | P1-18 | ThemeStripView.tsx | none | not stated | shell-list.md:L211 |
| Market Intel voided fetchRemainder | P1-18 | MarketIntelLedger (A2-part5:L90) | none | dead remainder removed | shell-list.md:L311 |
| Operations remainder failure falls back to first-page counts | P1-18 | OperationsLedger (A2-part5:L107) | none | ListSurface + use-list-rows failure state | shell-list.md:L313 |
| defects list (signed-in shell on public page, back-to-top, error page, failed remainder, stale comments, raw tokens, duplicated pollers, bootstrap reset, scroll container, write-only settings, overlays, 40 px padding) (B-0121, B-0153, B-0658, B-0127, B-0093, B-0155, B-0156, B-0190 (refuted), B-0189, B-0562, B-1029, B-2159, B-1566, B-0261, B-0543, B-1955, B-1934) | P1-18 |  | none | not stated | shell-list.md:L430 |
| region-filter URL parameter with a writer and no reader; every Coverage-gap link reloads the same unfiltered map | P1-19 | src/app/map/page.tsx:36; MapPageView.tsx:488 | [CONFIRMED] | working region filter (map/MapPage.tsx) | regulations.md:L177 |
| r.legalInstrument and r.lastVerifiedDate never mapped by the item read, so "Reviewed" and the instrument never appear | P1-19 | [slug]/page.tsx:179, :173; supabase-server.ts:3996-4083 | [CONFIRMED read] | the mapper for the fields the four surfaces render (core/detail/item-read.ts) | regulations.md:L220 |
| remainder failure silently empty; initialArchived unused; "corpus" in customer text (B-0180) | P1-19 | RegulationsLedger.tsx:101, :338 | none | list surface with an error state for the remainder | regulations.md:L223 |
| obligation fetch turns failure into []; Full depth renders the whole full_brief again incl raw Sources; "pending generation" copy (B-0047, B-1943) | P1-19 | RegulationDetailSurface.tsx:194-207, :403-407, :490 | [CONFIRMED read] | obligation events fetched with an error state; Full depth renders the fact document's sections by key, never the raw full_brief | regulations.md:L224 |
| 36 px menu items and no arrow keys (B-1942) | P1-19 | PriorityDropdown.tsx | none | 44 px items, arrow-key roving and focus return (P1-17 Menu) | regulations.md:L225 |
| "(migration 274)" in customer copy; raw hex in bindingChipStyle (B-0177) | P1-19 | ObligationRegisterFilterBar.tsx:297, :428-437 | none | not stated | regulations.md:L226 |
| style tag mounted twice | P1-19 | ObligationRegisterPageView.tsx:139, :173 | [CONFIRMED read] | not stated | regulations.md:L227 |
| non-OK becomes EMPTY_RESULT so an outage reads as an empty register | P1-19 | ObligationRegister.tsx:143, :147 | none | an error state for a failed seed | regulations.md:L228 |
| strip outage reads as "No upcoming obligations" | P1-19 | UpcomingObligationsStrip.tsx:102, :106-107 | none | not stated | regulations.md:L230 |
| owner select about 33 px; rosterFailed true for org-less user; "Last update" always "Not recorded" (B-1941) | P1-19 | OwnerTeamCard.tsx:138-142, :70 | [CONFIRMED read] | owner select at 44 px; org-less is not a failure | regulations.md:L232 |
| AffectedLanesCard footer promises a customer-data connection ADR-042 rules out | P1-19 | AffectedLanesCard.tsx:155 | [CONFIRMED read] | TRASH (not ported) | regulations.md:L233 |
| keyless fragment in AtAGlanceCard; InThisListStat "not in primary source" when opened directly; hard-coded #fff (B-0148) | P1-19 | DetailShell.tsx:419-428, :590, :172 | none | not stated | regulations.md:L238 |
| bare <a> for in-app links; view computed twice | P1-19 | CrossPageSection.tsx:85, :211, :218 | none | links through next/link; view computed once by the caller | regulations.md:L239 |
| new Date() in render in client surfaces (B-1919) | P1-19 | RequirementTrajectory.tsx:17 | none | take nowIso | regulations.md:L247 |
| wall-clock default when no fromIso; lib imports ui (B-1024) | P1-19 | timeline-math.ts:31-34, :7 | none | now is a required argument | regulations.md:L257 |
| pickCurrentStepIndex builds new Date(step.date) | P1-19 | requirement-trajectory-classify.ts:10 | [CONFIRMED read] | not stated | regulations.md:L258 |
| relevance route IP-limited, no requireAuth: anonymous readers get the binding banner; stale header | P1-19 | app/api/detail/relevance/route.ts:43-44, :12-18 | [CONFIRMED read] | auth decision recorded (gaps) | regulations.md:L269 |
| 14 EU members have no label and print as raw codes (B-1570) | P1-19 | lib/jurisdictions/iso.ts | [CONFIRMED loop over COUNTRY_LABELS] | country labels from Intl.DisplayNames | regulations.md:L273 |
| EU chip is ["eu"] only; three-letter codes fabricated from legacy ids; Coverage gaps error state whenever empty | P1-19 | MapPageView.tsx:83-90, :230, :476-479 | [CONFIRMED read] | ISO-keyed register, region chips from ISO groups, coverage layer | regulations.md:L278 |
| 30 of 84 legacy ids have a centroid; items in the other 54 uncharted | P1-19 | jurisdictionCentroids.ts | [CONFIRMED count] | centroids keyed by ISO code | regulations.md:L280 |
| map comment false (no region-filter reader); console.log | P1-19 | app/map/page.tsx:27, :36-38 | none | not stated | regulations.md:L281 |
| map key = legacy column or a title regex which misclassifies | P1-19 | jurisdiction-rollup.ts | none | counts by ISO code | regulations.md:L282 |
| select("*") caches every column; unbounded relationship reads; mapper omits three fields; readThemeBriefs reads every brief; fetchCrossPageForItem reads every theme | P1-19 | supabase-server.ts:3897, :3931-3957, :3996-4083, :4248-4257, :4340 | [CONFIRMED read] | explicit column list, bounded relationship reads | regulations.md:L289 |
| timers raced and never cleared; failed register seed returns empty ("No obligations on file yet") | P1-19 | data.ts:452-456, :609-614, :1144-1146 | [CONFIRMED read] | an error state for a failed seed | regulations.md:L290 |
| six reads of one item id per detail render | P1-19 | supabase-server.ts:3895-3900 etc. | [CONFIRMED read] | the item read returns {uuid, legacyId} once | regulations.md:L132 |
| AtAGlanceCard silently discards rows; RailLegend kept while comment says deleted | P1-19 | DetailShell.tsx:407-412, :355-361, :438-442 | [CONFIRMED read] | callers pass only the rows the card draws; one Legend card | regulations.md:L133 |
| /map payload: three corpus-wide reads for nothing; anonymous viewer gets an empty map and the error banner | P1-19 | supabase-server.ts:3161-3208, :3178-3180 | [CONFIRMED read] | one cached public read of the regulation rows | regulations.md:L137 |
| stale comments: ObligationRegister mount, FilterBar props, 300 s vs 3600 (B-1023) | P1-19 | ObligationRegister.tsx; FilterBar 38-42; load-detail-core.ts:72, 85-86 | [CONFIRMED read] | one sentence per function | regulations.md:L130 |
| fixture title contradicts the live 4/4 collapse rule; fixture citations drifted (B-1020, B-2156) | P1-19 | action-card-fixtures.ts:91; state-note-fixtures.tsx:112 | [CONFIRMED read] | not ported as lib code | regulations.md:L129 |
| Defects list: detail field read from a column the item read never maps (recommended_actions, instrument, last verified) | P1-19 |  | none | not stated | regulations.md:L485 |
| Defects list: writer shape and reader shape for one column differ | P1-19 |  | none | not stated | regulations.md:L485 |
| Defects list: one id resolved six times | P1-19 |  | none | not stated | regulations.md:L485 |
| Defects list: raw Sources dump and duplicated sections at Full depth | P1-19 |  | none | not stated | regulations.md:L485 |
| Defects list: eight stored sections with no structured render | P1-19 |  | none | not stated | regulations.md:L485 |
| Defects list: client fetch whose failure reads as "nothing to show" (B-0047, B-0180) | P1-19 | register seed and loader A2-part4:L69, strip A2-part4:L76 | none | not stated | regulations.md:L485 |
| Defects list: two fetches of one route per page | P1-19 |  | none | not stated | regulations.md:L485 |
| Defects list: wall-clock read in render (B-1919, B-1024) | P1-19 |  | none | not stated | regulations.md:L485 |
| Defects list: map keyed to a legacy vocabulary and a title regex | P1-19 |  | none | not stated | regulations.md:L485 |
| Defects list: URL parameter with a writer and no reader | P1-19 |  | none | not stated | regulations.md:L485 |
| Defects list: hidden tile attribution | P1-19 |  | none | not stated | regulations.md:L485 |
| Defects list: fabricated three-letter codes | P1-19 |  | none | not stated | regulations.md:L485 |
| Defects list: coverage card whose empty state is an error state | P1-19 |  | none | not stated | regulations.md:L485 |
| Defects list: rail card that silently drops what callers pass | P1-19 |  | none | not stated | regulations.md:L485 |
| Defects list: 36 px menu items and a 33 px select (B-1942, B-1941) | P1-19 |  | none | not stated | regulations.md:L485 |
| Defects list: customer copy naming migrations or promising features (B-1943) | P1-19 | FilterBar:297, AffectedLanesCard:155 | none | not stated | regulations.md:L485 |
| Defects list: comments citing headers, tests or scripts that no longer exist | P1-19 |  | none | not stated | regulations.md:L485 |
| published_price_statistics.source_tier always written null (rule 18) | P1-20 | refresh-published-price-statistics.mjs:112 | [CONFIRMED read] | display rows write source_tier from the source's rating | market.md:L187 |
| docstring says every map entry pending; all six ratified (B-2169) | P1-20 | refresh-published-price-statistics.mjs 77-79 | none | not stated | market.md:L187 |
| lead-time comment says sbti not registered; it is; feed licence-blocked (B-1036, B-0567) | P1-20 | lead-time-position.mjs 5-7 | none | comment fix | market.md:L188 |
| registry lookup at import with literal fallback (B-2168) | P1-20 | parsers/eu-weekly-oil-bulletin.mjs 3, 100 | none | not stated | market.md:L191 |
| carbonCostPerFeu ok branch never runs in production (both callers pass null inputs) HALF-SLICE (B-0565) | P1-20 | carbon-cost-per-feu.mjs 125-163; page.tsx:105-111, carbon-overlay-view.mjs:181-187 | [CONFIRMED] | not stated | market.md:L192 |
| carbon-intensity pick logic duplicated in carbon-overlay-view (B-2166) | P1-20 | carbon-intensity.mjs | none | buildCarbonOverlayView calls carbonIntensity | market.md:L195 |
| carrier ETS envelope HALF-SLICE (producer dry only, ENABLED false) (B-0566, B-2167) | P1-20 | carrier-ets-surcharge-envelope.mjs; carrier-ets-surcharge-producer.mjs:21 | none | P1-15, feeding lib/carbon once a live write path exists | market.md:L196 |
| select-modal-factor bypasses factor-tier; detached JSDoc; dangling header reference (B-0276) | P1-20 | select-modal-factor.mjs 15-21, 29 | none | one selectFactor over the emission_factors table | market.md:L197 |
| carbon-overlay-view copy is stale state; per-FEU half HALF-SLICE | P1-20 | carbon-overlay-view.mjs 65-66, 105 | [CONFIRMED read] | gap copy without internal producer names | market.md:L198 |
| freshness fallback picks shortest period not shorter than cadence, so off-grid cadence reads fresher than its source | P1-20 | series-freshness.mjs:23 | [CONFIRMED read against REFRESH_PERIOD_DAYS] | fallback corrected to the longest period not longer than the cadence | market.md:L199 |
| facts in code: six intelligence_items UUIDs in series-item-map; titles restate PRODUCTS (B-2172) | P1-20 | series-item-map.mjs 1-58 | none (B1b:L175) | market_series_items table seeded by migration | market.md:L200 |
| carbon family targets deferred eex-eua stub while ruled source is carrier-ets | P1-20 | series-family.mjs | none (A4b:L126) | not stated | market.md:L201 |
| signal-promotion "fail-open" wording contradicts code; dangling header references (B-1038) | P1-20 | signal-promotion.mjs 39-40, 38, 68 | none | comment fix | market.md:L203 |
| resolve-item-corridor parser duplicate; JSDoc cites deleted test function (B-2170) | P1-20 | resolve-item-corridor.mjs 12-22, 93-94 | none | resolveItemCorridor over corridor-scope's parser | market.md:L204 |
| entity_id back-fill on update dead branch; process.env read in default parameter | P1-20 | write-market-series.mjs:62, 11 | [CONFIRMED read] | the planner back-fills entity_id only when the caller selects it (or always stamps) | market.md:L139 |
| horizontal scroller under 768 vs no-horizontal-reach rule (B-1927) | P1-20 | MarketComparativeRibbon.tsx 345-365 | none (ruling owed) | not stated | market.md:L206 |
| kind filter, sort and flat view are component state, kind-filtered view cannot be linked | P1-20 | MarketIntelLedger.tsx 145-148 | [CONFIRMED read] | kind facet and sort in the URL contract | market.md:L207 |
| scope line "signals are unverified by design" while RPC returns only verified rows (B-1928) | P1-20 | MarketIntelLedger.tsx:287 | none | copy reconciled with the verified gate | market.md:L207 |
| development history in customer copy; raw hex | P1-20 | CarbonCostOverlay.tsx 148, 152-159, 82, 84 | [CONFIRMED read] | badge from tokens | market.md:L208 |
| 9.5 px drawer summary with no padding, under law-2 floor; no-op ternary (B-1929) | P1-20 | MarketSeriesBoard.tsx 115 | none | 44 px drawer summary | market.md:L209 |
| envelopeFromSeriesRow never sets sourceTier; no series figure shows its source's rating (rule 18, INV-262) | P1-20 | SeriesProvenance.tsx 31-46 | [CONFIRMED read] | FigureEnvelope with sourceTier for every adapter | market.md:L210 |
| em dashes in copy; hex fallback | P1-20 | SeriesFreshness.tsx 19-20, 87, 11 | [CONFIRMED read] | tones from tokens | market.md:L211 |
| internal copy; 375 px leaves about 19 px for the bar (B-0158, B-1926) | P1-20 | LeadTimeChart.tsx 65-70 | none (arithmetic) | not stated | market.md:L212 |
| raw hex ramp; title says "12 wk" whatever the point count | P1-20 | TrajectoryBars.tsx 9-12, 43 | none | title from the actual point count | market.md:L213 |
| indexation subtitle promises a computation the view never makes (B-0538) | P1-20 | IndexationPanelView.tsx:45 | none | not stated | market.md:L215 |
| rerouting HALF-SLICE; raw corridor ids printed; repo path in copy (B-0540) | P1-20 | ReroutingPanelView.tsx 48, 17 | none | corridor names, not ids; no repo paths or codes in copy | market.md:L217 |
| reroute and OEM panel read error becomes empty | P1-20 | ReroutingPanel.tsx; OemRoadmapPanel.tsx | none | readPanelRows (failure distinct from empty) | market.md:L218 |
| OEM roadmap HALF-SLICE; "M (missing)", "floor not yet set" on screen (B-0539, B-0160) | P1-20 | OemRoadmapPanelView.tsx:52 | none | no repo paths or codes in copy | market.md:L219 |
| page reads committed DESNZ fixture (INV-183); stale comment | P1-20 | app/market/page.tsx:37, 33 | none | the index page stops reading the fixture (INV-183) | market.md:L222 |
| convergence read drops its error; console.log on every render; full board built for one row | P1-20 | [slug]/page.tsx 139, 336, 264 | [CONFIRMED read] | loadMarketDetailBundle (convergence with its error surfaced) | market.md:L223 |
| formatRange prints dash glyph per missing bound rather than naming it; silently swaps mis-ordered triple | P1-20 | format-range.mjs 22, 23 | none | formatRange naming a missing bound | market.md:L227 |
| EstimatedFigure HALF-SLICE (no estimated_values writer); default now = new Date() reads clock in render (B-0537, F1-S4-09) | P1-20 | EstimatedFigure.tsx 69, 129 | none (A2-part6:L65) | now required (injected render instant) | market.md:L229 |
| StatutoryFigure dead (B-0659) | P1-20 | StatutoryFigure.tsx:52 | [CONFIRMED] | kind ported inside Figures.tsx | market.md:L230 |
| RecalculationNotice prints method ids, table names and primary keys to customers | P1-20 | RecalculationNotice.tsx 82-89 | [CONFIRMED read] (A2-part6:L67) | customer copy without table names or primary keys | market.md:L231 |
| NoticesRail failed read renders the empty message; feed org-watchlist-wide not item-scoped (B-0046) | P1-20 | NoticesRail.tsx 78, 83-85 | none | useRecalculationNotices with a distinct error state | market.md:L232 |
| unionVocabulary dead (B-0289, B-1587) | P1-20 | adopted-terms.mjs:78 | [CONFIRMED] | not stated | market.md:L233 |
| price-stat decoration is a second read after the cached RPC on every render | P1-20 | data.ts 969-1032 | none | not stated | market.md:L236 |
| fetchRemainder kept as "documentation" via void | P1-20 | MarketIntelLedger.tsx:98-105 | [CONFIRMED read] | not stated | market.md:L137 |
| non-null watchMembership branch never runs (only mount passes null) | P1-20 | MarketSeriesBoard.tsx:208-222 | [CONFIRMED grep] | not stated | market.md:L138 |
| customer-visible development copy and state claims across market files | P1-20 | CarbonCostOverlay.tsx:148; LeadTimeChart.tsx:65-70; ReroutingPanelView.tsx:16-17; OemRoadmapPanelView.tsx:15-16, 52; MarketSeriesBoard.tsx:97; MarketComparativeRibbon.tsx:151; carbon-overlay-view.mjs:65-66, 105; carbon-cost-per-feu.mjs:13; RecalculationNotice.tsx:82-89 | [all CONFIRMED read] | not stated | market.md:L176 |
| raw hex against the semantic-token rule | P1-20 | TrajectoryBars.tsx:9-12, CarbonCostOverlay.tsx:82, 84, StatutoryFigure.tsx:66, EstimatedFigure.tsx:79, SeriesFreshness.tsx:11 | [CONFIRMED read] | tokens | market.md:L177 |
| sub-floor targets (B-1929, B-1930) | P1-20 | not stated | none | not stated | market.md:L377 |
| duplicated formatting and selection rules (B-2166 to B-2173, B-0276) | P1-20 | not stated | none | not stated | market.md:L377 |
| fitness-allow F39 / F42 notes for enforcers deleted in CLEAN-3 (4 sites) | P1-20 | MarketComparativeRibbon.tsx 439-466 and others | none | not stated | market.md:L108 |
| R1 gate anchors on the FIRST dated forward event whether or not statutory (B-1581) | P1-21 | assess.mjs:165-166 | [CONFIRMED read] | test the event's own text | research-ops.md:L152 |
| TRL ladder: 6-7 row's "demonstration plant" unreachable (B-1581) | P1-21 | assess.mjs:20-21 | [CONFIRMED read] | specific phrases before general ones | research-ops.md:L153 |
| last-mile zero-emission pattern unreachable; deriveSeverity reads Date.now() in a pure module (B-0283, B-1582) | P1-21 | taxonomy.mjs:65, 74, :173 | [CONFIRMED read] | order last-mile's specific patterns first or require a freight qualifier; take now as an argument | research-ops.md:L154 |
| labour chain mixes annual and hourly units ("USD/year per productive hour") (B-1580) | P1-21 | labour-chain.ts:93-96, 194-201; region-grid.mjs:112 | [CONFIRMED read] | accept a base wage only in a per-hour unit and require every term in one currency | research-ops.md:L155 |
| contradicting comments in RegionDimensionMatrix (B-0169) | P1-21 | RegionDimensionMatrix.tsx 665-671, 730-732 vs 282-305, 348-366 | [CONFIRMED read] | one header paragraph naming the two operator rulings | research-ops.md:L107 |
| chips mounted once as a legend with no props; scored branches never run; credibility_evidence_score never rendered (B-0547, B-0548) | P1-21 | app/research/page.tsx:123-124; read-assessments.mjs:65 | [CONFIRMED read; CONFIRMED grep] | one CredibilityChips.tsx mounted per assessment with the stored evidence score and authority distribution | research-ops.md:L111 |
| per-page fetch_status read whose result is dropped | P1-21 | operations/[slug]/page.tsx 148-156; OperationsDetailSurface.tsx:110 | [CONFIRMED read] | delete the read and the prop | research-ops.md:L116 |
| OperationsLedger dead computations every render | P1-21 | OperationsLedger.tsx 254-270, 274-284, 125-138, 197 | [CONFIRMED read] | delete; the matrix computes its own grid | research-ops.md:L114 |
| OperationsFact.freshness computed, never rendered | P1-21 | supabase-server.ts:3378, 3488-3493 | [CONFIRMED] | operations-reads + RegionMatrix (shown) | research-ops.md:L140 |
| OperationsCoverageRow.notes selected, never rendered | P1-21 | supabase-server.ts:3351, 3427, 3467 | [CONFIRMED] | operations-reads + RegionMatrix disclosure | research-ops.md:L141 |
| dissentingSources never passed (HALF-SLICE) (B-0661) | P1-21 | DissentPanel.tsx:39-44, 60, 86-97 | [CONFIRMED read] | not stated | research-ops.md:L137 |
| internal words on customer surfaces; GridQueue months line prints "p50 needs p50 queue monthsmo" (B-0169, B-0181, B-0183) | P1-21 | RegionDimensionMatrix.tsx:644, :775, :781-782; ResearchFindingDetailSurface.tsx:506-509; AssessmentHistoryLedger.tsx:78; DissentPanel.tsx:101-102; SignpostList.tsx:70-71; ResearchLedger.tsx:247; CredibilityChipAuthority.tsx:78-79, 104; CredibilityChipEvidence.tsx:38-39; AuxiliaryEnergyPanelView.tsx:17; GridQueuePanelView.tsx:37, :75 | [CONFIRMED read] | all to be removed in the port | research-ops.md:L182 |
| summarizePredicate ignores basis: movement_by_date; both fetchers soft-fail to empty | P1-21 | read-signposts.mjs; assess.mjs:342 | [CONFIRMED read] | predicate summary including basis; errors surfaced to a fallback state | research-ops.md:L193 |
| BARE_SCORE_RE strips every bare three-decimal number in [0,1], real figures included (B-1583) | P1-21 | theme-brief-text.mjs:19 | [CONFIRMED read] | restrict to the stats-header context | research-ops.md:L196 |
| ThemeBriefView typedef omits the sections it returns | P1-21 | theme-brief.mjs | none | not stated | research-ops.md:L197 |
| verdict-word label dropped with no count (B-0278) | P1-21 | statements.mjs:182 | [CONFIRMED read] | port adds the dropped count to the block foot | research-ops.md:L202 |
| labels carry a literal em dash; parser has three SOC codes, spec 04 names nine | P1-21 | bls-oews-parser.mjs:100 | [CONFIRMED read] | occupation list extensible to spec 04's nine SOC codes | research-ops.md:L203 |
| label hard-codes "(all taxes and levies)" and status flags unread (B-0281) | P1-21 | eurostat-nrg-pc-205-parser.mjs:88 | [CONFIRMED read] | parser reading the payload's tax dimension and status flags | research-ops.md:L205 |
| natural key includes fact_label, a relabel inserts a new row and leaves the old | P1-21 | regional-facts-envelope.mjs | none | not stated | research-ops.md:L206 |
| page passes [resource.jurisdiction] only, never the item's jurisdiction array; omitNote dead | P1-21 | operations/[slug]/page.tsx:122-125 | [CONFIRMED read] | S3/S4 gate over the item's full jurisdiction list, one rendered omit note | research-ops.md:L208 |
| TRL label shows "8-8" for a point corridor; meta repeats theme (B-0182) | P1-21 | ResearchFindingDetailSurface.tsx:516 | none | not stated | research-ops.md:L217 |
| prints the raw entity id as "watches <id>" | P1-21 | SignpostList.tsx:60 | [CONFIRMED read] | the port resolves it to the entity's label | research-ops.md:L220 |
| auxiliary panel read error reads as not covered | P1-21 | AuxiliaryEnergyPanel.tsx | none | not stated | research-ops.md:L221 |
| raw hex; "monthsmo" concatenation | P1-21 | GridQueuePanelView.tsx:63, :75 | none | ui-kit tokens | research-ops.md:L224 |
| every gap says "not in primary source" whatever the cause (B-0167) | P1-21 | LabourChain.tsx:110, :156 | [CONFIRMED read] | chain render with a cause per gap | research-ops.md:L225 |
| indexEntries omits the spec-09 sections the header says carry index entries | P1-21 | OperationsDetailSurface.tsx:229-234 | [CONFIRMED read] | spec-09 sections in the index | research-ops.md:L226 |
| remainder failure becomes a first-page count (B-0168) | P1-21 | OperationsLedger.tsx:233-239 | [CONFIRMED read] | remainder failure stated | research-ops.md:L227 |
| readAssessmentsByItemId drops the per-chunk error and soft-fails to an empty map | P1-21 | app/research/page.tsx:45 | [CONFIRMED read] | errors surfaced to a fallback state, never dropped | research-ops.md:L230 |
| list skeleton draws four tiles the list no longer has | P1-21 | app/research/loading.tsx | none | list and detail skeletons matching the real layouts | research-ops.md:L231 |
| four dropped-error reads inside try/catch | P1-21 | research/[slug]/page.tsx:148, :163, :181, :214 | [CONFIRMED read] | errors surfaced to a fallback state | research-ops.md:L232 |
| dropped-error reads; wasted fetch_status read | P1-21 | operations/[slug]/page.tsx:140, :149, :165, :184 | none | not stated | research-ops.md:L236 |
| coverage card shows transport modes under a "Source coverage" title | P1-21 | supabase-server.ts 1749-1793 | none | not stated | research-ops.md:L238 |
| Defects list: R1 anchoring on an unrelated event and the unreachable TRL 6-7 row (B-0685, B-1581) | P1-21 |  | none | not stated | research-ops.md:L394 |
| Defects list: unreachable theme pattern and a clock read in a pure module (B-0283, B-1582) | P1-21 |  | none | not stated | research-ops.md:L394 |
| Defects list: score-stripping regex that removes real figures (B-1583) | P1-21 |  | none | not stated | research-ops.md:L394 |
| Defects list: labour chain that mixes annual and hourly units (B-1580) | P1-21 |  | none | not stated | research-ops.md:L394 |
| Defects list: verdict-word statement dropped without a count (B-0278) | P1-21 |  | none | not stated | research-ops.md:L394 |
| Defects list: parser that hard-codes "all taxes" and ignores status flags (B-0281) | P1-21 |  | none | not stated | research-ops.md:L394 |
| Defects list: hand copies of the regions roster (B-2177) | P1-21 |  | none | not stated | research-ops.md:L394 |
| Defects list: one absence reason for every gap (B-0167) | P1-21 |  | none | not stated | research-ops.md:L394 |
| Defects list: failed remainder fetch shown as a complete count (B-0168) | P1-21 |  | none | not stated | research-ops.md:L394 |
| Defects list: internal words and stale comments on customer surfaces (B-0169, B-0181, B-0183, B-0182) | P1-21 |  | none | not stated | research-ops.md:L394 |
| Defects list: half-slice chips and panels mounted without data (B-0542, B-0547, B-0548, B-0549, B-0661) | P1-21 |  | none | not stated | research-ops.md:L394 |
| Defects list: an unused helper (B-0686) | P1-21 |  | none | not stated | research-ops.md:L394 |
| unreachable default body behind children ?? (invitation accept/decline unreachable; accept/decline routes have no caller) | P1-22 | CommunityShell.tsx 163-169, 205-627 | [CONFIRMED read and grep] | one Community home that carries the invitation panel (CommunityHome) | community-a.md:L87 |
| Rooms composer posts no entity_ids, route refuses, every Rooms post returns 400 | P1-22 | CommunityRooms.tsx 291-299; posts/route.ts:299-301 | [CONFIRMED read of both; not executed] | Rooms composer binds entities through the same EntityPicker | community-a.md:L87 |
| GroupHeader mounted without onToast (star, mute, settings, invite, revoke, leave feedback never shows; failed star or mute reverts silently) | P1-22 | app/community/[slug]/page.tsx:206 | [CONFIRMED read] | toast owned inside the feature, never optional | community-a.md:L87 |
| ModerationQueue mounted without onToast (failed moderation silent); default canBan=true | P1-22 | app/community/moderation/page.tsx:69; ModerationQueue.tsx :85 | [CONFIRMED read] | toast owned inside the feature, never optional | community-a.md:L164 |
| customer copy contradicts ADR-041 | P1-22 | EntityPicker 244-245; CommunityRooms 1265-1266, 1746-1747; EntityDiscoveryPanel 10-12 | [CONFIRMED read] | copy within ADR-041; SignoffRail copy without "citable" | community-a.md:L151 |
| browser-client table writes beside routes | P1-22 | CommunityRooms.tsx :382-386, :410-413 | none | join and leave by route; cite needs a route | community-a.md:L160 |
| room tiles repeat(4,1fr) with no narrow rule; page padding 40; every action error collapses to a generic notice (A2-part2:L65) | P1-22 | CommunityRooms.tsx :809, :766 | none | tiles (wrapping grid) | community-a.md:L160 |
| no focus trap; three window.confirm | P1-22 | GroupModals.tsx :57-61, 229, 819; Post 116-121 | none | P1-17 Dialog and ConfirmDialog | community-a.md:L88 |
| fixed 280 px sidebar with no narrow rule; dead filter input; inert topic rows; second poller; chevron about 10 px (A2-part2:L68-69) | P1-22 | CommunitySidebar.tsx :216-231, :288-305, :432-454 | [CONFIRMED read] | narrow-width drawer; working filter or none; topics editable or not shown | community-a.md:L162 |
| new Date() for masthead date in render (A2-part2:L68) | P1-22 | CommunityShell.tsx :129 | none | CommunityLayout (server date) | community-a.md:L163 |
| moderation limit 50 with no paging; group and user targets render "Reported item no longer available" | P1-22 | ModerationQueue.tsx :103, :316-318 | none | queue, filters, paging | community-a.md:L164 |
| replies render legacy name block only, no identity projection; replies capped at 20 with no more | P1-22 | Post.tsx :441-503, :78 | [CONFIRMED] | replies with the identity projection and paging | community-a.md:L165 |
| NotificationsList rollback of the count but not the items; silent pagination stop (A2-part2:L81) | P1-22 | NotificationsList.tsx 190-210, 183-185 | none | inbox list with consistent rollback and an error on load-older | community-a.md:L166 |
| Date.now() in render (A2-part2:L74) | P1-22 | GroupHeader.tsx :78-80; GroupCard 58-59 | none | isRecentlyActive with a server now | community-a.md:L167 |
| post hit links to the group page not the post; close target about 18 px | P1-22 | CommunitySearchResults.tsx :324, :143-157 | none | a post hit links to the post anchor | community-a.md:L168 |
| "Request to join" permanently disabled; "Pending acceptance" has no accept path | P1-22 | GroupCard.tsx | [CONFIRMED: route list] | not stated | community-a.md:L169 |
| moderation action targets about 24 px with 6 px gap (A2-part2:L77) | P1-22 | ModerationActions.tsx | none | not stated | community-a.md:L170 |
| sector is free text, not the sector taxonomy | P1-22 | ProfileForm.tsx :244-251 | none | sector from the taxonomy | community-a.md:L173 |
| own toast div; Retry about 21 px (A2-part2:L85) | P1-22 | PostList.tsx | none | one Toast | community-a.md:L174 |
| getEntityThreads returns null on every failure (A2-part2:L91) | P1-22 | api-client.ts | none | one typed client, one error shape | community-a.md:L175 |
| failure renders "Loading" forever; reply count shown with a Bell icon (A2-part2:L71) | P1-22 | EntityDiscoveryPanel.tsx :212-214, :252 | none | digest with an error state | community-a.md:L176 |
| read error renders the private-group message (A2-part2:L70) | P1-22 | CouncilMembersRail.tsx :38-44 | none | server rail with an honest error state | community-a.md:L177 |
| scope chips under the target floor (A2-part2:L66) | P1-22 | CommunitySearchBar.tsx | none | not stated | community-a.md:L180 |
| NotificationsBell 36 px (A2-part2:L80) | P1-22 | NotificationsBell.tsx | none | platform inbox bell, 44 px | community-a.md:L181 |
| raw #fff | P1-22 | CommunityRegionTabs.tsx :107 | none | tokens only | community-a.md:L183 |
| minmax(300px,1fr) cannot fit beside a 280 px sidebar at 375 px (B-1904) | P1-22 | BrowseGroupsGrid.tsx | none | not stated | community-a.md:L185 |
| bare res.json() turns a non-JSON 502 into "Network error" | P1-22 | CommunitySearchResults 83, NotificationsList 142 and 178, GroupModals 198, 732, 763 | none | one typed client | community-a.md:L90 |
| 85 raw hex literals; Rooms header claims no raw hex while carrying rgba borders | P1-22 | CommunityRooms 839, 916, 986, 1014, 1128 and others | [CONFIRMED read] | tokens only, hover by CSS | community-a.md:L93 |
| CommunitySidebar poller never pauses in a background tab | P1-22 | CommunitySidebar.tsx 76-111 | none | one notifications store, visibility-paused | community-a.md:L94 |
| two codes for one region (MEA, MEAF) | P1-22 | lib/community/rooms.ts; profile-policy.mjs | none | one regions module | community-a.md:L95 |
| HowPublishingWorks teaches the removed PROMOTE TO PUBLIC flow (A2-part2:L76) | P1-22 | HowPublishingWorks.tsx :9, :15 | [CONFIRMED read] | TRASH | community-a.md:L149 |
| customer-visible internal words ("(R8.7)", "(spec 05 section 1)", saf_premium_usd_per_kg, "Welcome back, operator", "Onboard", "(fallback applied)" reachable on phase_d_stub) | P1-22 | ProfileForm 189, 318; PostComposer 285, 302; CommunityRooms 1721; ModerationActions 87, 243; Shell 544, 493; Sidebar 184, 354, 203; EntityPicker 86 | [CONFIRMED read] | not stated | community-a.md:L150 |
| unreachable phaseD branch | P1-22 | ModerationActions.tsx:243 | [CONFIRMED read] | not stated | community-a.md:L106 |
| platform inbox reachable only from /community/* shell pages, not /community | P1-22 | NotificationsBell (CommunitySearchBar :145); page.tsx:494 | [CONFIRMED grep] | bell and list as platform chrome (P1-18) | community-a.md:L121 |
| summary: unreachable default body, composer skipping required field, optional toast callbacks, read error as privacy statement, failure as loading, count-only rollback, silent pagination stop, ADR-041 copy, internal ids in customer text, wall-clock reads in render, five modal shells without focus traps, browser-client writes, fixed 280 px sidebar and 4-column grid | P1-22 | section 8 defects paragraph | none | not stated | community-a.md:L359 |
| backlog STATUS: CONFIRMED-P1 25 rows (B-0128, B-0133, B-0135, B-0138, B-0139, B-0141, B-0142, B-0143, B-0144, B-1519, B-1520, B-1522, B-1523, B-1524, B-1904, B-1905, B-1906, B-1907, B-1908, B-1909, B-1910, B-1911, B-1913, B-2141, B-2142) | P1-22 | (backlog) | [CONFIRMED] | not stated | community-a.md:L365 |
| ban only deletes a membership row; banned author re-joins a public group | P1-23 | moderation/reports/[id]/route.ts:317-339, :324-328 | [CONFIRMED] | community_group_bans table checked by join and accept; moderate_report rpc | community-b.md:L198 |
| moderation body/action/notes packed into reason text column | P1-23 | reports/route.ts:20-39, [id]/route.ts:27-66 | none | three columns and moderate_report rpc | community-b.md:L114 |
| side effects run before the close; raced second action re-runs side effect | P1-23 | [id]/route.ts:269-363, :351-360 | none | moderate_report closes report and applies side effect in one transaction | community-b.md:L198 |
| mute_user is a stub (sends a warning) | P1-23 | [id]/route.ts:301-316 | none | mute and ban real, with the schema items | community-b.md:L114 |
| notification writer ignores preferences and group mutes | P1-23 | dispatch.ts:46-50 | [CONFIRMED] | dispatch consults both (except invite) | community-b.md:L237 |
| 18 reads drop their error | P1-23 | many | none | groupRole that surfaces its error; errors are errors, not 404 | community-b.md:L80 |
| invitations role read drops error, DB failure answers 403 (B-0023) | P1-23 | groups/[id]/invitations/route.ts:34 | none | not stated | community-b.md:L186 |
| invite-candidates drops role and exclusion read errors; offers existing members (B-0024) | P1-23 | invite-candidates:28, :51-62 | none | not stated | community-b.md:L187 |
| invite role read drops error (B-0025) | P1-23 | invite:44 | none | not stated | community-b.md:L188 |
| join: no UUID check; member read drops error; invitation clear unchecked (B-0026, B-0077) | P1-23 | join:15, :45, :86-91 | none | clears pending invitations with the error read; refuses a banned user | community-b.md:L189 |
| members: existing read and admin count drop errors (null count reads as 0) (B-0027) | P1-23 | members:103, :120 | none | not stated | community-b.md:L190 |
| settings pre-reads drop errors (404); RLS-refused update returns ok: true, group: null (B-0028) | P1-23 | settings:84-99, :117-131 | none | RLS-refused update is a 403, not ok | community-b.md:L192 |
| groups rollback delete result unchecked; two writes on two clients (B-0029) | P1-23 | groups/route.ts:119 | none | create_group_for_self rpc | community-b.md:L185 |
| accept rollback unchecked; two writes two clients (B-0030) | P1-23 | accept:79-82 | none | accept_group_invitation rpc | community-b.md:L194 |
| decline read drops error, answers 404 (B-0031) | P1-23 | decline:23 | none | not stated | community-b.md:L195 |
| revoke reads drop errors (B-0032) | P1-23 | revoke:28, :49 | none | not stated | community-b.md:L196 |
| moderation post reads drop errors (B-0033) | P1-23 | [id]:124, :220 | none | not stated | community-b.md:L198 |
| group filter runs after .limit(); group page short (B-1884) | P1-23 | reports/route.ts:74-81, :173-179 | [CONFIRMED read] | group filter in the query | community-b.md:L197 |
| moderation membership read drops error (B-0034) | P1-23 | reports/route.ts:245 | none | not stated | community-b.md:L197 |
| posts member-profile and default_anonymous reads drop error; compensating delete unchecked (B-0035, B-0078) | P1-23 | posts/route.ts:133, :325, :385 | [CONFIRMED read] | create_thread rpc (insert and links in one) | community-b.md:L202 |
| replies before parameter filters .gt (after-cursor under a before name) | P1-23 | replies:118 | none | an honest after cursor | community-b.md:L204 |
| verify getClaims error dropped, reads as no email on file | P1-23 | profile/verify:19 | none | not stated | community-b.md:L207 |
| search group-name read drops error | P1-23 | search:115 | none | not stated | community-b.md:L208 |
| home page Promise.all drops membership, posts, roster errors; sign-off read drops error (B-0092) | P1-23 | community/page.tsx:211-242, :275 | none | not stated | community-b.md:L211 |
| group page group read and membership read drop errors, end in notFound | P1-23 | [slug]/page.tsx:62, :114 | none | errors are errors, not 404 | community-b.md:L212 |
| grid comment promises collapse under 880 px that inline style cannot do | P1-23 | [slug]:231-233 | [CONFIRMED read] | not stated | community-b.md:L212 |
| browse groups read drops error; membership and invite reads drop errors | P1-23 | browse:83, :152-158 | none | not stated | community-b.md:L213 |
| identity rpc failure only warns, every author reads as anonymous (B-0832) | P1-23 | threads/route.ts:91 | none | not stated | community-b.md:L184 |
| rooms normJur cuts any token with a dash at index 1 or 2 | P1-23 | rooms.ts:88-94 | none | exact token, then ISO subdivision | community-b.md:L227 |
| shell-context employer read has no order | P1-23 | shell-context.ts:148-153 | none | employer through P1-01 resolveMembership | community-b.md:L229 |
| notices href /entities/<id>; no such route; every notice link 404s | P1-23 | notices/logic.ts:32 | [CONFIRMED] | port links to the item or drops the href | community-b.md:L234 |
| resolve-watched-entities read errors swallowed with no log | P1-23 | resolve-watched-entities.ts:58, :66, :76 | none | errors logged, not swallowed | community-b.md:L235 |
| getUser network round trip per page; perf console.log in production | P1-23 | [slug] :83, :120, :156; browse :97, :153, :182 | none | communityPage frame: claims, timing through telemetry sink | community-b.md:L118 |
| antitrust aggregate branch unreachable | P1-23 | antitrust.mjs:147-180; posts/route.ts:309 | [CONFIRMED] | a 30-line guard | community-b.md:L119 |
| dead cursor route left in place (B-0649, B-0650) | P1-23 | listings/cursor/route.ts:67 | [CONFIRMED] | TRASH | community-b.md:L130 |
| handlers with no test (B-0855, B-0856) | P1-23 | member-pref-route.mjs, viewer.ts | none | unit tests | community-b.md:L429 |
| /api/listings/rest exception undocumented in CLAUDE.md public-route list | P1-23 | listings/rest/route.ts | [CONFIRMED read] | document or guard | community-b.md:L233 |
| no test executes; proofs removed by CLEAN cuts | P1-23 |  | [CONFIRMED] | properties carried as tests | community-b.md:L74 |
| two meanings of "verified"; directory without small-cell floor | P1-23 |  | none | emailVerified and isVerifier | community-b.md:L429 |
| unanchored keyword heuristic for impact meter and jurisdiction; LOW weighs 1 (B-0687, B-0883, B-1584) | P1-24 | scoring.ts:9-10, :47, :43 | [CONFIRMED by read; not re-executed] | anchored, word-bounded patterns and an explicit LOW weight | dash-search.md:L192 |
| scoring.ts global branch dead (lines 35 and 36 both return global) | P1-24 | scoring.ts:35-36 | [CONFIRMED read] | not stated | dash-search.md:L116 |
| seven timeout races never clear their timer; eight fail-soft caches store a failure (B-0250, B-0252) | P1-24 | data.ts:720, 737, 872, 927, 969, 998, 1004, 1010 | [CONFIRMED read] | cachedRead clears its timer, refuses to cache a payload carrying _error | dash-search.md:L214 |
| two functions named getCoverageGaps (B-0249, B-0251) | P1-24 | data.ts:802 | [CONFIRMED] | closed by deleting the dead one | dash-search.md:L121 |
| page-lifetime membership cache pins a failed read as unwatched | P1-24 | membership.ts:129, :142-143, :146 | [CONFIRMED read] | caches successes only | dash-search.md:L193 |
| ilike with unescaped name (B-2174) | P1-24 | portfolio-core.mjs:156 | [CONFIRMED read] | ilike escaped or replaced by name_key equality | dash-search.md:L201 |
| swallowed JSON parse (B-0279) | P1-24 | portfolio/client.ts:24-28 | [CONFIRMED read] | a parse failure is a stated error | dash-search.md:L200 |
| parse error answered as "send a body"; 403 literal duplicates org.ts (B-2175) | P1-24 | route-support.ts | [CONFIRMED read] | refuse(status, message) | dash-search.md:L203 |
| override read fails to empty, archived member looks held (B-0280, B-1991) | P1-24 | read.ts; supabase-server.ts:2464-2467 | [CONFIRMED read] | override read failure surfaced as the detail's error state | dash-search.md:L202 |
| silent navigation to empty id (B-0172) | P1-24 | PortfolioIndexView.tsx:72 | [CONFIRMED read] | a missing id after create is a stated error | dash-search.md:L207 |
| local date formatter beside the shared one (B-0216) | P1-24 | WatchlistSurface.tsx:125 | [CONFIRMED read] | toListRowFields | dash-search.md:L194 |
| notices feed outage reads as empty (B-0217) | P1-24 | NoticesRail.tsx:83 | [CONFIRMED read of the hook's catch] | notices card with a distinct failed state | dash-search.md:L194 |
| masthead wrapper with no mobile override on three surfaces (B-1935, B-1951) | P1-24 | PortfolioDetailView.tsx:151; PortfolioIndexView.tsx:80; SearchResultsView.tsx:45 | [CONFIRMED read; not measured] | not stated | dash-search.md:L206 |
| 9 px badge and 10.5 px source line under type floor (B-1921) | P1-24 | DashboardWatchlist.tsx:45, :94 | [CONFIRMED read, not measured] | not stated | dash-search.md:L190 |
| dropped error object (B-0122) | P1-24 | AskAssistant.tsx:309 | [CONFIRMED read] | failure as StateNote | dash-search.md:L212 |
| intro promises community discussions the route never reads (B-1902) | P1-24 | AskAssistant.tsx:410 | [CONFIRMED] | not stated | dash-search.md:L212 |
| panel wider than a 375 viewport (B-1903) | P1-24 | AskAssistant.tsx:335-358 | [CONFIRMED by arithmetic; not rendered] | positioned by the command bar's anchor only | dash-search.md:L212 |
| close button has no padding (law-2 floor) | P1-24 | AskAssistant.tsx:391-398 | none | close button at the law-2 floor | dash-search.md:L212 |
| privilege differed by entry point (B-0005, B-0006, B-0099) | P1-24 | search/route.ts | [CONFIRMED] closed by PR 1122 | runs on caller's client | dash-search.md:L209 |
| Absence reason "connect data" presumes customer data connection (B-1917) | P1-24 | DashboardMasthead.tsx:73 | [CONFIRMED read] | port uses "pending" | dash-search.md:L179 |
| enrichment set counted from raw feed while rows deduped (B-1985) | P1-24 | brief-rows.ts:163-168, :89-91 | [CONFIRMED read of the asymmetry] | selectBriefResources counts the rendered set | dash-search.md:L174 |
| surface-coverage fallback overlay returns [] on error; EMPTY_INTEL cached on failure (A-03) | P1-24 | surface-coverage.ts:157-163, :185-193 | [CONFIRMED read] | read the rpc; on error return the error state | dash-search.md:L177 |
| fetchWorkspaceAggregates EMPTY cached 60 s on error | P1-24 | supabase-server.ts:1453-1457; data.ts:737-743 | [CONFIRMED read] | typed { error, trigger } | dash-search.md:L216 |
| WatchlistItem.timeline never filled; every row draws empty track | P1-24 | supabase-server.ts:4789-4790; WatchlistSurface.tsx:143-149 | [CONFIRMED read] | no timeline field until a read fills it | dash-search.md:L126 |
| dashboard read issues reads for 7 payload fields never used | P1-24 | supabase-server.ts:2707-3006 | [CONFIRMED] | three reads plus two count reads | dash-search.md:L99 |
| PortfolioAddSearch request has no try; Searching... stays on | P1-24 | PortfolioAddSearch.tsx:91 | [CONFIRMED read] | useItemSearch with error | dash-search.md:L205 |
| personal POST stores org_id nothing reads; revalidateTag flushes every per-org cache | P1-24 | route.ts:294-296; data.ts:102-118 | [CONFIRMED read] | revalidateTag scoped to the caller's org entries | dash-search.md:L197 |
| DashboardBrief aggregates and nowIso props declared and unused | P1-24 | DashboardBrief.tsx:65, :77 | [CONFIRMED read] | not stated | dash-search.md:L178 |
| watchlist page comment claims a lint error no longer carried | P1-24 | watchlist/page.tsx:23-26 | none | not stated | dash-search.md:L195 |
| rule-021 hash on DASHBOARD_DATA_CACHE_KEY has no enforcer since CLEAN-3 | P1-24 | supabase-server.ts:2567-2590 | none | not stated | dash-search.md:L217 |
| fetchThemeChips reads every connection_themes row then slices 12 | P1-24 | supabase-server.ts:4406-4411 | none | not stated | dash-search.md:L218 |
| rail card 28 px CTA and Assistant close button fail law-2 floor | P1-24 |  | none | interactive targets at the law-2 floor | dash-search.md:L283 |
| refresh read swallowed by catch {} (B-0111) | P1-25 | AdminDashboard.tsx 303-305 | [CONFIRMED read] | not stated | admin-a.md:L169 |
| orgRes.data and updateRes.data read with .error never destructured | P1-25 | AdminDashboard.tsx 297, 302 | [CONFIRMED read] | refresh reads through admin routes | admin-a.md:L169 |
| human-gate copy beside machine-gate code (B-0112) | P1-25 | AdminDashboard.tsx 814, 875 vs 797 | none | copy goes with file rewrite | admin-a.md:L169 |
| raw hex #FFFFFF | P1-25 | AdminDashboard.tsx 475 | none | tokens | admin-a.md:L169 |
| AdminInlineStatusText export with 0 importers | P1-25 | AdminTableView.tsx:124-131 | [CONFIRMED grep] | not stated | admin-a.md:L121 |
| raw fetch plus authHeaders; result dumped as raw JSON; "paid generation" copy (B-0232's class) | P1-25 | CorpusTurnPanel.tsx 82-83, 110-111, 142-143, 352, 289-290 | none | results rendered in words, not raw JSON; authedFetch | admin-a.md:L173 |
| tr onClick with no role, tabindex or key handler | P1-25 | CoverageMatrixView.tsx 456-470 | [CONFIRMED read] | row selection as a button | admin-a.md:L175 |
| raw ISO computed_at; title is table name | P1-25 | InferenceReview.tsx 37, 57 | none | not stated | admin-a.md:L178 |
| buttons size="sm" height not measured (B-1893) | P1-25 | IntegrityFlagsView.tsx | none | not stated | admin-a.md:L180 |
| fetch outside try leaves creating true, no finally (B-1514) | P1-25 | InvitationsPanel.tsx 87-93, 106-108 | [CONFIRMED read] | not stated | admin-a.md:L181 |
| clipboard catch {} (B-0117) | P1-25 | InvitationsPanel.tsx 122-124 | none | not stated | admin-a.md:L181 |
| Clear about 21 px (B-1515) | P1-25 | IssueFilterCaption.tsx 38-47 | [CONFIRMED read of the style; not rendered] | filter banner with a 44 px Clear | admin-a.md:L182 |
| date-format swallow catch { return iso } (B-0118) | P1-25 | OrganizationsTable.tsx 247-249 | none | not stated | admin-a.md:L183 |
| PartsPageHeading padding 28px 36px (B-1896) | P1-25 | PartsPageHeading.tsx 3 | none | TRASH | admin-a.md:L185 |
| sibling-token buttons about 18 px | P1-25 | PendingJurisdictionReviewView.tsx 253-269 | [CONFIRMED read of the classes] | 44 px sibling picks | admin-a.md:L186 |
| row header div onClick with no role, tabindex or key handler (B-1516) | P1-25 | PlatformIntegrityFlagsView.tsx 285-291 | [CONFIRMED read] | row header as a button, keyboard-operable rows | admin-a.md:L187 |
| stale header "Block 4 populates the payload" (B-0119) | P1-25 | ProvenanceFailures.tsx 19-21 | none | not stated | admin-a.md:L188 |
| retired seven-domain labels; publish copy contradicts RD-20 (B-0120) | P1-25 | ResearchPipelineQueueView.tsx 48-56, 117-118, 10-15 | [CONFIRMED read] | no retired domain labels | admin-a.md:L189 |
| right column fixed 200 px with no media query | P1-25 | ResearchPipelineQueueView.tsx 159 | [CONFIRMED read; overflow at 375 not rendered] | one column at 375 | admin-a.md:L189 |
| browser client reads intelligence_items under RLS | P1-25 | ResearchPipelineQueueView.tsx 67-83 | none | through a new /api/admin/pipeline/drafts read | admin-a.md:L189 |
| Defer writes nothing | P1-25 | TierOpinionDisagreementsView.tsx 183-189 | [CONFIRMED read] | no defer | admin-a.md:L117 |
| submit awaits onSubmit with no try (pending stays true on reject); callers never throw | P1-25 | corrections/CorrectionForm.tsx 62-78 | [CONFIRMED read] | not stated | admin-a.md:L194 |
| postRevoke stricter than the RPC (empty reason refused vs p_reason null) (INV-282) | P1-25 | corrections/model.mjs 170-172; lib/corrections/admin-api/logic.mjs:104 | [CONFIRMED grep] | not stated | admin-a.md:L201 |
| stale types.ts header gone (B-0115) | P1-25 | corrections/types.ts | [CONFIRMED read] | not stated | admin-a.md:L203 |
| issues rail rows 28 px with 2 px padding, no gap (B-1897) | P1-25 | redesign/AdminIssuesRail.tsx 185-200 | [CONFIRMED read] | the port gives the rows 44 px | admin-a.md:L204 |
| duplicate member panel (B-1517) | P1-25 | redesign/MembersPanel.tsx | none | P1-02's one panel | admin-a.md:L206 |
| Remove and Ban about 19 px, role chip about 16 px (B-1517) | P1-25 | redesign/MembersPanel.tsx 331-343, 391-429 | [CONFIRMED read of the styles] | not stated | admin-a.md:L206 |
| dead layout="row" branch (B-0657) | P1-25 | redesign/WorkspacesUsageRow.tsx 178-226 | [CONFIRMED] | rail form only | admin-a.md:L207 |
| stale header says wired into RegulationsLedger only (B-0154) | P1-25 | ledger/VirtualizedRowList.tsx 18-23 | [CONFIRMED grep] | header reduced to one paragraph | admin-a.md:L208 |
| raw hex under a header that forbids it (B-0109) | P1-25 | account/AccountPrimitives.tsx 196, 345 | [CONFIRMED read] | tokens | admin-a.md:L209 |
| ToggleSwitch 32 by 18 px; SegmentedControl 24 px | P1-25 | account/AccountPrimitives.tsx 326-327, 179, 188 | [CONFIRMED read] | SegmentedControl (44 px segments), ToggleSwitch (44 px hit area) | admin-a.md:L209 |
| TextInput mutates style.borderColor on focus | P1-25 | account/AccountPrimitives.tsx 392-401 | none | class-based focus | admin-a.md:L209 |
| Parts tile hard-coded value="1" | P1-25 | AdminDashboard.tsx:567 | none | goes with the parts pages | admin-a.md:L120 |
| cadence asserted in copy "Mon / Wed / Fri 07:00 UTC" while rule 16 holds it off | P1-25 | AdminDashboard.tsx:810 | none | goes with the scan form | admin-a.md:L160 |
| userId, userEmail props never read | P1-25 | AdminDashboard.tsx:113-115 | [CONFIRMED read] | not stated | admin-a.md:L124 |
| DOMAIN_LABEL retired vocabulary (B-0120) | P1-25 | ResearchPipelineQueueView.tsx:48-56 | [CONFIRMED read] | no retired domain labels | admin-a.md:L127 |
| summary list: catch {} swallow, human-gate copy, fetch outside try, clipboard/date swallows, dead layout branch, non-keyboard rows, targets under law-2 floor, overflow-hidden tables, fixed 200 px column, wall-clock render read, raw hex, stale headers, two panels, hard-coded count, cadence in copy (B-0111, B-0112, B-0120, B-1514, B-0117, B-0118, B-0657, B-1516, B-1515, B-1517, B-1888, B-1890, B-1894, B-1897, B-1901, B-1892, B-1900, B-1891, B-0109, B-0119, B-0154) | P1-25 | section 8 defects paragraph | none | not stated | admin-a.md:L423 |
| trust-event insert and candidate mark unchecked (B-0008, B-0009) | P1-26 | canonical-sources/bulk-approve/route.ts :214, :253 | none | one checked audit write (INV-288) | admin-b.md:L209 |
| three reads drop their error (B-0010) | P1-26 | canonical-sources/bulk-classify :164, :178, :187 | none | TRASH | admin-b.md:L210 |
| dedup read drops error; trust-event insert unchecked (B-0068, B-1507, B-0011) | P1-26 | canonical-sources/decide :161, :234 | none | dedup fail closed; checked audit write | admin-b.md:L211 |
| parent read drops error (B-0013) | P1-26 | canonical-sources/recommend-classification :173 | none | TRASH | admin-b.md:L213 |
| open_count caps at 1000 | P1-26 | corpus-turn-requests :71, :119 | none | not stated | admin-b.md:L214 |
| replace_url writes raw URL not canonicalised, leaves source_id; audit is console.log (A1-part1:L218) | P1-26 | integrity-flags/[id]/resolve :80-82 | none | resolve with a canonical URL and an audit row | admin-b.md:L218 |
| six-category list misses workflow_gap; per-brief read unbounded; count read drops error | P1-26 | integrity-flags/route.ts :105-112, :18-37, :46 | [CONFIRMED read against migration 050] | seven-category constant equal to the CHECK (INV-290); paged | admin-b.md:L219 |
| run-intake builds its own service client (B-DUP-1 class) | P1-26 | run-intake/route.ts:39 | none | shared client | admin-b.md:L225 |
| spot-check Math.random sampling, cooldown read drops error, two unchecked upserts, no caller (B-0021) | P1-26 | spot-check/recurring :190, :229, :263, :402 | [CONFIRMED: ls] (no caller) | TRASH | admin-b.md:L138 |
| fetch-now sources update unchecked (B-0015) | P1-26 | sources/[id]/fetch-now :109 | none | not stated | admin-b.md:L229 |
| tier-override events read drops error; stale header (B-0016) | P1-26 | sources/[id]/tier-override :68, :32 | none | not stated | admin-b.md:L232 |
| bulk-import validated type, language, jurisdiction never written | P1-26 | sources/bulk-import :19-30, :184-188, :200-202, :528-537 | [CONFIRMED read] | the row's own type and jurisdiction written to the provisional row | admin-b.md:L162 |
| quoted newline corrupts a CSV row; duplicated validateRow on apply (A4d:L321) | P1-26 | sources/bulk-import (splitCsvLine), :497 | none | csv parse from core/csv | admin-b.md:L139 |
| integrity_flags fallback insert silent by design (B-0017, B-0073) | P1-26 | sources/bulk-import :580-599 | none | not stated | admin-b.md:L235 |
| commit-tier-change prior read drops error, read failure answers 404 | P1-26 | commit-tier-change/logic.ts :55 | [CONFIRMED read] | not stated | admin-b.md:L236 |
| base-tier commit writes no source_trust_events row (INV-288) | P1-26 | commit-tier-change/route.ts | [CONFIRMED read] | with an audit row | admin-b.md:L237 |
| promote dedup read drops error; reuse mark and two audit inserts unchecked (B-0075, B-1510, B-0018) | P1-26 | sources/promote :102, :107, :189, :253 | none | dedup fail closed; checked audit | admin-b.md:L239 |
| tier-opinions sources join drops error (B-0020) | P1-26 | sources/tier-opinions :58 | none | not stated | admin-b.md:L242 |
| ingest-rejections count read drops error | P1-26 | triage/ingest-rejections :32 | none | not stated | admin-b.md:L247 |
| PJR two-step write non-atomic (A1-part1:L281) | P1-26 | triage/pending-jurisdiction-review :178-185 | none | one rpc (INV-289) | admin-b.md:L248 |
| users GET no range; POST accepts any role string and a password (B-0076, B-0645) | P1-26 | users/route.ts :85-88, :51 | [CONFIRMED: caller grep] (POST no caller) | GET bounded; POST TRASH | admin-b.md:L249 |
| dashboard six silent soft-fails, three dropped errors; wall clock in render (B-0089, B-0090) | P1-26 | app/admin/page.tsx :40, :48, :63, :84, :104, :137, :225-227, :211 | none | readWithFallback that logs, one service client | admin-b.md:L250 |
| two hex fallbacks against semantic tokens rule | P1-26 | factors/page.tsx :137, :223 | none | not stated | admin-b.md:L251 |
| inferences records unbounded; titles read drops error; no link (B-0652) | P1-26 | inferences/page.tsx :14-17, :29 | [CONFIRMED: grep] (no link) | paged, with a nav row | admin-b.md:L252 |
| mapSourceRow fabricates score 50, components 20/10/10/10, accuracy 0.5, accessibility 1.0 | P1-26 | supabase-server.ts :329-351 | [CONFIRMED read] | mapSourceRow without fabricated defaults (null stays null; "not scored") | admin-b.md:L285 |
| bias-tags route has no caller (feature unwired) (B-0644, B-1508) | P1-26 | sources/[id]/bias-tags/route.ts:12 | [CONFIRMED] | kept in source-controls; UI mount owed to P1-25 | admin-b.md:L155 |
| recompute-trust route no caller (B-0643) | P1-26 | recompute-trust/route.ts:21 | [CONFIRMED] | TRASH; writers to P1-05 | admin-b.md:L153 |
| hand-copied placeholder list drifts | P1-26 | parts/command-bar/page.tsx :23-95 | none | read from surfaces' constants or dropped | admin-b.md:L144 |
| summary list: unchecked audit/mark writes, dedup reads pass open, unbounded reads, six-vs-seven categories, base-tier no audit, two-step PJR, dropped import columns, CSV quoted newline, fabricated defaults, service client in route, wall-clock read, silent soft-fails, console.log audit, unchecked cooldown, hand-copied placeholder list (B-0008, B-0009, B-0011, B-0018, B-0019, B-0075, B-0068, B-1507, B-1510, B-0076, B-1883, B-0089, B-0014, B-0021) | P1-26 | section 8 defects paragraph | none | not stated | admin-b.md:L491 |

### H.2 Labelled HYPOTHESIS by the register

| defect | lane | path:line | status token | what the new code does instead | cite |
|---|---|---|---|---|---|
| fixed width: 380 inside one-column mobile layout | P1-01 | src/app/auth/reset-password/page.tsx; update-password/page.tsx | [HYPOTHESIS: not rendered] | not stated | auth-db.md:L212 |
| SavedSearchesSection localStorage only, roadmap copy, unread recall params, always-empty fields (B-0187) | P1-02 | SavedSearchesSection.tsx:42-64, :156, :232, :104-107 | [HYPOTHESIS] (params unread) | TRASH as code | workspace.md:L104 |
| sourceStore filterSources ignores tier_override | P1-02 | sourceStore.ts:107 | [HYPOTHESIS] | not stated | workspace.md:L227 |
| mint dedup corpus read has no .range() or order; sees at most first 1,000 rows (B-0267, B-1988) | P1-04 | mint-item.ts 170-174 | [HYPOTHESIS for production max_rows] | dedup over the FULL non-archived corpus via paginate | intake-b.md:L174 |
| a failed stamp leaves the row pending (RD-20 never parks holds only if re-selected) (B-1990) | P1-04 | run-intake-cycle.ts | [HYPOTHESIS] | checked stamps | intake-b.md:L180 |
| verbatim-grounding has no Unicode quote or dash folding (B-0865) | P1-04 | verbatim-grounding.mjs | [HYPOTHESIS] | one verbatim rule matching criterion 3 | intake-b.md:L186 |
| unpaginated --all-ratified and --auto-adopt list reads; 1,287 open flags above 1,000-row cap | P1-04 | apply-classifications.mjs 899-903, 923-927, 950-951, 966-967 | [HYPOTHESIS for production max_rows] | one deterministic classify-sources job | intake-b.md:L195 |
| census fallback client-side NOT IN list overflowed at about 435 rows (B-1989) | P1-04 | portal-harvest.ts 248-280, 310-317 | [HYPOTHESIS: B-1989] | RPC-only keyset page | intake-b.md:L91 |
| RENDER_FIRST_HOSTS 12 hosts only Browserless reached; without render tier they hold NO_REACHABLE_SOURCE | P1-05 | transport-escalation.mjs:111-112 | [HYPOTHESIS] | not stated | sources-a.md:L223 |
| vertical-fit-gate fails open on a read error, reads suspended rows without a range | P1-05 | vertical-fit-gate.ts:40-43 | [HYPOTHESIS] (row cap truncation) | off-vertical negative list, paginated, fail closed for unattended callers | sources-a.md:L247 |
| api-transport has no hold check of its own | P1-05 | api-transport.mjs | [HYPOTHESIS] | not stated | sources-a.md:L259 |
| Health "overdue" against wall clock while cadence off (B-1958) | P1-06 | SourceHealthDashboard.tsx:296-299 | [HYPOTHESIS] (live counts) | Health reads the schedule state and says "scraping is off" | sources-b.md:L90 |
| row buttons and override inputs about 24-28 px (B-1956) | P1-06 | SourceAdminControls.tsx | [HYPOTHESIS] | 44 px | sources-b.md:L165 |
| `/` in geography would corrupt cellKey; n() uses en-US | P1-06 | coverage-matrix.mjs | [HYPOTHESIS] | unit test: a `/` in a geography refused or escaped | sources-b.md:L178 |
| request-coverage select-then-insert race; nothing closes these flags (B-0246) | P1-06 | request-coverage.mjs | [HYPOTHESIS] (race) | one open flag per subject_ref | sources-b.md:L185 |
| rollup looks up sources.jurisdictions by ISO code while editors write region buckets (B-1984) | P1-06 | coverage-gaps-rollup.ts:48-68 | [HYPOTHESIS] (live values) | the port reads jurisdiction_iso | sources-b.md:L187 |
| backfill may never have run | P1-06 | backfill-source-type.mjs | [HYPOTHESIS] | data migration | sources-b.md:L195 |
| monitoring_queue.last_result written values outside migration 004 CHECK; reconcile can never see a change | P1-07 | check-sources/logic.ts :152; migration 004:404-408 | [HYPOTHESIS: the live CHECK was not read] | vocabulary is one constant the CHECK is generated from; writes read their errors | capture.md:L139 |
| committed fact data read by a page (rule 1) | P1-08 | scripts/gen/fixtures/emission-factors/desnz-modal-defaults-2025.json; src/app/market/page.tsx:37 | [HYPOTHESIS: whether 4 rows live not measured] | INV-183: surface reads from Supabase | harness.md:L202 |
| db.mjs header cites deleted audit; snapshots to gitignored dir lost with CI runner | P1-08 | db.mjs:280, :98-102 | [HYPOTHESIS: no CI write run inspected] | not stated | harness.md:L225 |
| eurlex-cellar cellarEndpointForOj labelled [HYPOTHESIS] in its own comment | P1-08 | eurlex-cellar.mjs:26-29 | [HYPOTHESIS] | not stated | harness.md:L238 |
| whole-table reads on every per-item write (B-0244, B-1983) | P1-09 | write-edges.mjs 73-85; run-discovery.mjs 24-35 | [HYPOTHESIS: cost] | read the candidate pairs and the signatures needed | flywheel-a.md:L351 |
| unbounded entities read at mint (2,880 entities exceed 1,000-row default) (B-0057) | P1-10 | link-item-entities.mjs:27 | [CONFIRMED read; HYPOTHESIS: truncated set harmless] | bounded read | flywheel-b.md:L201 |
| event whose mark-drained update fails is not in processedEvents but invalidation applied | P1-10 | drain.ts:257-265 | [CONFIRMED read; consequence HYPOTHESIS] | not stated | flywheel-b.md:L175 |
| UN/LOCODE names published while licence says redistribution prohibited (B-0258) | P1-10 | unlocode-names.mjs:10-16 | [CONFIRMED both texts; legal significance HYPOTHESIS] | ruling owed | flywheel-b.md:L167 |
| two metered paths remain reachable | P1-13 | run-ledger-consume.mjs:1560-1562, :1760, :1726-1732, :154-156, :1851; run-change-detection.mjs:498-514 | [CONFIRMED grep]; paid branch [HYPOTHESIS] | the port keeps only the free paths | runtimes-b.md:L44 |
| second reconcile pass in apply | P1-13 | run-change-detection.mjs:430-431 | [CONFIRMED read; route behaviour HYPOTHESIS] | reconcile once | runtimes-b.md:L102 |
| stamp-wo26 full-table read per run; target date and count hard-coded (B-1069) | P1-14 | stamp-wo26-archive-reason.mjs 58, 10-12 | [HYPOTHESIS: live count not re-measured] (L90) | TRASH | mint.md:L158 |
| FACT_MARKER_RE defensive branch inert | P1-14 | heal-provenance.mjs:2508, 2340, 2519 | [HYPOTHESIS: inert] | not stated | mint.md:L109 |
| SLOTS step writes source_tier_at_grounding from item.source_tier, no such column on intelligence_items | P1-14 | heal-provenance.mjs:2968 | [CONFIRMED grep]; always-null [HYPOTHESIS] | not stated | mint.md:L226 |
| six published Market items grounded on a hand-embedded WebFetch summary presented as captured_text, fetched_length set to its own length (B-2007) | P1-15 | refresh-published-price-statistics.mjs:49-65; refresh:33-48; build:32 | [CONFIRMED read]; spans grounding [HYPOTHESIS] | TRASH the chain; data defect to P1-07 (re-capture) and P1-14 (re-ground the six items) | producers.md:L134 |
| read-and-extract claim and section reads unpaginated; console.warn per refused event | P1-16 | read-and-extract.mjs 298, 299, 254 | [HYPOTHESIS: bounded per item] | not stated | obligations.md:L146 |
| fetchRegisterFacetOptions reads whole active table every first load | P1-16 | read-register.mjs:539 | [HYPOTHESIS on cost] | not stated | obligations.md:L151 |
| dispatch-extraction has no caller; reads every item id into memory; jiti unnecessary (B-0923) | P1-16 | dispatch-extraction.mjs 37 to 47 | [CONFIRMED: no workflow, no importer]; [HYPOTHESIS on scale] | jobs/extract-backfill | obligations.md:L158 |
| ExposureCell measures scrollHeight with no resize listener | P1-17 | ActionCard.tsx:131-136 | [HYPOTHESIS] | ExposureCell re-measures on resize | ui-kit.md:L190 |
| sourceNameWrapsToTwoLines character-count heuristic; matrix reads untyped facts | P1-17 | FactCard.tsx:255-261, :394-396 | [HYPOTHESIS] (by own comment) | typed matrix fact | ui-kit.md:L205 |
| TabRow tabs about 34 px; role=tab without arrow-key roving | P1-17 | TabRow.tsx | [HYPOTHESIS] (34 px) | 44 px tabs, arrow-key roving for `tablist` | ui-kit.md:L228 |
| skeleton-page animate-pulse; maxWidth 1040 with 32 px padding at 375 | P1-17 | skeleton-page.tsx | [HYPOTHESIS] | page frame without `animate-pulse` | ui-kit.md:L239 |
| second user in same tab may see first user's overrides | P1-18 | useWorkspaceBootstrap.ts | [HYPOTHESIS] | not stated | shell-list.md:L188 |
| desktop nav rows about 40 px | P1-18 | Sidebar.tsx | [HYPOTHESIS] | not stated | shell-list.md:L183 |
| not-found link about 37 px | P1-18 | app/not-found.tsx | [HYPOTHESIS] | honest 404 with a 44 px link | shell-list.md:L199 |
| region facet label is the raw key (B-1922) | P1-18 | list-surface-helpers.ts:96, :105 | [CONFIRMED] (keys being codes is HYPOTHESIS) | not stated | shell-list.md:L202 |
| `newest` sort no NaN guard on added | P1-18 | list-surface-helpers.ts:262 | [HYPOTHESIS] | sortResourceRows (NaN-safe) | shell-list.md:L202 |
| metadata route answers 404 with database message; legacy id may fail as 22P02 | P1-18 | metadata/route.ts:29-31 | [HYPOTHESIS] (22P02 part) | TRASH | shell-list.md:L224 |
| map region link: nothing parses ?region= ISO list; may narrow to zero rows | P1-18 | MapPageView.tsx:407; list-surface-helpers.ts:206, 438 | [HYPOTHESIS] | the map's region link resolves to the list's own jurisdiction tokens | shell-list.md:L135 |
| attributionControl={false} hides OSM attribution | P1-19 | MapView.tsx:190, :194 | [CONFIRMED read]; OSM policy [HYPOTHESIS] | Leaflet with visible attribution | regulations.md:L279 |
| recommended_actions never read by detail page; writer shape differs from reader shape; toIsoDateOrNull local/UTC | P1-19 | extract-recommended-actions.mjs:117-124, :73-76; types/resource.ts:85-90; DetailShell.tsx:296-298 | [CONFIRMED read]; day shift [HYPOTHESIS] | mapper includes recommended_actions in the shape the extractor writes | regulations.md:L287 |
| oil bulletin slug thresholds unverified against live workbook (B-0683) | P1-20 | oil-bulletin-workbook.mjs | [HYPOTHESIS] | not stated | market.md:L190 |
| indexation read error becomes not-covered; service client bypasses migration 311 org_read policy; cookie read makes route dynamic | P1-20 | IndexationPanel.tsx:29 | [HYPOTHESIS] for the dynamic route | readPanelRows (failure distinct from empty) | market.md:L216 |
| SERIES_HISTORY_LIMIT 1000 caps whole table not each series; YoY and sparkline can fall outside window | P1-20 | supabase-server.ts market readers | [HYPOTHESIS: live row count not read] | readSeriesBoard (per-series window, not a whole-table cap) | market.md:L235 |
| severity chip "needs regeneration for severity"; theme and window state not in URL; empty-state buttons no padding (B-1948) | P1-21 | ResearchLedger.tsx:247 | B-1948 [HYPOTHESIS: not rendered] | theme and window in the URL | research-ops.md:L218 |
| gCO2e never computed (HALF-SLICE); requestRef names an anchor no page carries (B-0542) | P1-21 | AuxiliaryEnergyPanelView.tsx | [CONFIRMED grep]; join [HYPOTHESIS] | carbon figure joined from grid intensity when present | research-ops.md:L222 |
| cells 40 px with zero spacing under law 2; profile links bare <a> (B-0169) | P1-21 | RegionDimensionMatrix.tsx:1012, :509, :881, :935 | [HYPOTHESIS: computed from the styles, not rendered] | DESIGN CHANGES OWED item | research-ops.md:L228 |
| no row cap on facts | P1-21 | supabase-server.ts 3315-3594 | [HYPOTHESIS on current count] | not stated | research-ops.md:L240 |
| sensitivity field is free text a member types as a database key | P1-22 | PostComposer.tsx :279-299 | [HYPOTHESIS: field list in lib/community/antitrust.mjs not read] | sensitivity field as a choice, not a key | community-a.md:L171 |
| notifications/[id] no UUID check; malformed id returns 500 | P1-23 | notifications/[id]:12-18 | [HYPOTHESIS: 22P02] | not stated | community-b.md:L200 |
| counts reads every unread row with no limit; short past row cap (B-1885) | P1-23 | counts:17-21 | [CONFIRMED read] (cap value HYPOTHESIS) | grouped count in SQL | community-b.md:L201 |
| decide verifier_status and follow-up read drop errors; two writes two clients (B-0036, B-0079) | P1-23 | decide:111, :154 | B-0079 HYPOTHESIS kept | decision and stamp in one rpc | community-b.md:L209 |
| home page padding and 4-column grid at 375 px | P1-23 | community/page.tsx:482 (A2-part2:L65) | [HYPOTHESIS, not rendered] | not stated | community-b.md:L211 |
| directory reads all profiles with service role per render; no small-cell floor; read failure renders 0 members | P1-23 | directory/page.tsx:60-69, :70-75 | [HYPOTHESIS: re-identification risk] | SQL aggregate with the k floor | community-b.md:L214 |
| notices .catch(() => null) on org read; label read drops error (B-0037, B-1886) | P1-23 | notices/route.ts:56, :86 | B-1886 HYPOTHESIS kept | errors logged, not swallowed | community-b.md:L236 |
| RLS assumed and never attacked (B-0832, B-0852) | P1-23 |  | [HYPOTHESIS] | RLS attacks scripted and wired into a lane | community-b.md:L332 |
| AskAssistant no-anchor drawer branch | P1-24 | AskAssistant.tsx:359-368 | [HYPOTHESIS: never null in a mounted bar] | positioned by the command bar's anchor only | dash-search.md:L137 |
| PlateCard title and meta both nowrap in one flex row (B-1887) | P1-25 | AdminDashboard.tsx 926, 940 | [HYPOTHESIS] | not stated | admin-a.md:L169 |
| FormatTabButton about 35 px tall (B-1888) | P1-25 | BulkImportView.tsx 485-510 | [HYPOTHESIS] | not stated | admin-a.md:L172 |
| CoverageCatalogueView overflow hypothesis does not hold on CSS read (B-1889) | P1-25 | CoverageCatalogueView.tsx 133-143 | [HYPOTHESIS] | not stated | admin-a.md:L174 |
| tier chips about 26 px tall (B-1890) | P1-25 | CoverageMatrixView.tsx 370 | [HYPOTHESIS] | not stated | admin-a.md:L175 |
| wall-clock read during render (formatRelativeCompact reads Date.now()) (B-1891) | P1-25 | ErrorGroupsView.tsx 125 | [CONFIRMED read]; hydration mismatch [HYPOTHESIS] | relative time through P1-17's RelativeTime | admin-a.md:L176 |
| 6-column table in overflow-hidden, no horizontal scroll (B-1892) | P1-25 | IngestRejectionsView.tsx 178-182 | [HYPOTHESIS] | table scrolls horizontally | admin-a.md:L179 |
| Revoke and Copy buttons about 24 px (B-1894) | P1-25 | InvitationsPanel.tsx 247, 309 | [HYPOTHESIS] | not stated | admin-a.md:L181 |
| fixed tracks may overflow at 375 (B-1895) | P1-25 | OrganizationsTable.tsx 71-78 | [HYPOTHESIS] | not stated | admin-a.md:L183 |
| header claims every target 44 px; " , " where a dash was stripped (B-1899) | P1-25 | StatutoryRowsUpload.tsx 26, 158, 240 | [HYPOTHESIS: not measured] | not stated | admin-a.md:L191 |
| 8-column table clipped by overflow-hidden (B-1900) | P1-25 | TierOpinionDisagreementsView.tsx 235-239 | [HYPOTHESIS] | a card per source | admin-a.md:L192 |
| filter chips about 26 px (B-1901) | P1-25 | UpcomingObligationsPanel.tsx 195-209 | [HYPOTHESIS] | kit FilterChip | admin-a.md:L193 |
| role menu closes onBlur after 120 ms, click can race (B-1898) | P1-25 | redesign/MembersPanel.tsx 330 | [HYPOTHESIS] | not stated | admin-a.md:L206 |
| select("*") no range; lookups drop error (B-1883, B-0012, B-0070) | P1-26 | canonical-sources/pending :68-71, :81, :99 | [HYPOTHESIS on the count] | paged, errors checked | admin-b.md:L212 |
| scan cooldown read drops error, stamp unchecked; titles unbounded (B-0014) | P1-26 | scan/route.ts :65, :449, :91 | [HYPOTHESIS, needs a row count] (titles cap) | TRASH | admin-b.md:L226 |
| cl-noop event dispatch forces nothing React observes | P1-26 | parts/nav-card/NavCardPartsDemo.tsx :63 | [HYPOTHESIS: not rendered] | not stated | admin-b.md:L268 |
| fixed 300px 300px grid overflows 375 px; command-bar width 1440 clips; masthead width 380 | P1-26 | parts/rail-card :30, command-bar :116, masthead :68 | [HYPOTHESIS] | not stated | admin-b.md:L287 |
| parts-registry cwd fallback resolves wrong; serverless tracing question (A4d:L293, B-1978) | P1-26 | lib/admin/parts-registry.ts | [HYPOTHESIS, needs a deploy] (B-1978) | static TypeScript list, no fs read | admin-b.md:L196 |

### H.3 Labelled REFUTED, moot or fixed by the register (not live)

| item | lane | path:line | status token | note | cite |
|---|---|---|---|---|---|
| api/agent/run guard reads fail closed (backlog row refuted) (B-0001) | P1-03 | route.ts 79-86, 103-112 | [REFUTED] on this tree | KEEP AS-IS | intake-a.md:L228 |
| no scripts/mint/lib reference in gate-a-scan (B-1534, B-1535) | P1-03 | gate-a-scan.mjs | moot [CONFIRMED grep: 0] | n/a | intake-a.md:L266 |
| timeline-section line 5 still names the gone drift test (B-0220) | P1-03 | formats/timeline-section.mjs:5 | half FIXED, half moot | not stated | intake-a.md:L241 |
| worker reads no gate (no system_state, fleet-budget-halt, SCRAPE_HOLD) | P1-07 | capture-worker/index.ts | [CONFIRMED] (brief's claim it honours the hold [REFUTED]) | gate and kill-switch read in the one dispatcher (P1-08) | capture.md:L214 |
| resource-lookup dropped error (B-0053) | P1-09 | resource-lookup.ts 13-16, 50-51 | [REFUTED] on this tree | not stated | flywheel-a.md:L191 |
| InferenceClaim prints raw CONFIRMED/HYPOTHESIS/REFUTED token and origin class to customers (B-0189) | P1-18 | InferenceClaim.tsx:72-74 | none | inference card with the status vocabulary rendered in words | shell-list.md:L216 |
| loading.tsx called DEAD (B-0655) | P1-19 | src/app/regulations/loading.tsx | [REFUTED] (framework convention) | KEEP AS-IS | regulations.md:L219 |
| inference-view swallowed successorsError (B-0055) | P1-19 | inference-view.mjs:151-160 | [REFUTED] | not stated | regulations.md:L489 |
| SourcesGrid comment about RegulationDetailSurface import (B-0150) | P1-19 | SourcesGrid.tsx:12-14 | [REFUTED] | not stated | regulations.md:L489 |
| format-fixed-date names DashboardTopPriority (B-0176) | P1-19 | format-fixed-date.ts | [REFUTED] | not stated | regulations.md:L489 |
| 720 px minimum on cl-table-cards on mobile (B-0178) | P1-19 | globals.css:583 | [REFUTED] | not stated | regulations.md:L489 |
| npmtest cited deleted (B-1557) | P1-19 |  | [REFUTED] | not stated | regulations.md:L489 |
| no-defect observation rows (B-0147, B-0149, B-1938, B-1945) | P1-19 |  | [REFUTED] | not stated | regulations.md:L489 |
| "Global" in seven rooms flagged by A2 (B-0131 (A2 P-4)) | P1-22 | CommunityRooms.tsx | [REFUTED] | not stated | community-a.md:L160 |
| backlog STATUS: REFUTED 9 rows (B-0129, B-0130, B-0131, B-0132, B-0134, B-0137, B-0140, B-1912, B-1914) | P1-22 | (backlog) | [REFUTED] | not stated | community-a.md:L366 |
| "overflowWrap anywhere" cell (B-0113) | P1-25 | corrections/CorrectionRow.tsx | [REFUTED as a defect] | not stated | admin-a.md:L195 |
| ItemCorrectionsPanel cell (B-0114) | P1-25 | corrections/ItemCorrectionsPanel.tsx | [REFUTED as a defect] | not stated | admin-a.md:L197 |

## I. PROOFS

The plan (docs/plans/complete-build-plan-2026-10-11.md section 4) names six: P1 chain proof green (email); P2 ten real minted pages on the site by URL; P3 their ledger rows with non-zero flywheel outcomes; P4 one real source change detected and shown; P5 data audits green on the deploy (email); P6 spec 08's five falsification tests red/green in CI. Rows mapped to a P-number by substance (the register describes the proof without the number) were mapped at extraction; flywheel-a and flywheel-b rows are such substance mappings.

| proof | lanes serving it | files or tests (lane: as written, cite) |
|---|---|---|
| P1 | P1-03, P1-07, P1-08, P1-10, P1-14 | P1-03: the proof run of build-plan section 6.2 on one item end to end (injectBrief, groundInjectedLedger, validate_item_provenance); harness records the outcome in the run's own artifact (rule 17) (intake-a.md:L390) // P1-03: features/intake/api/run.ts; then the section 6.2 proof run (intake-a.md:L403) // P1-07: capture worker integration against the local Supabase stack (config.toml already serves the edge runtime for the chain proof): one agent_runs row, one agent_run_searches row byte for byte, pending_first_fetch done, duplicate_skipped, ceiling bind, requeue to fifth attempt (capture.md:L240) // P1-07: chain-proof.yml deleted by CLEAN-3 f906b210 (no workflow invokes the worker) (capture.md:L70) // P1-08: CI chain proof runs every family in hop order against the local stack's own harness_runs; green = one root_run_id with a success row for every family and no failed row (harness.md:L390) // P1-08: chain-proof family: not a production family; the CI chain proof records into the stack's own ledger (P1 proof) (harness.md:L315) // P1-10: Spec 08 section 7 assertion 2 on a real database (the chain-proof or a local Postgres in CI): revise one emission factor, dependents stale, apply drain supersedes, nothing outside the closure moved; today proven only on fakes (F1-S4-15) (flywheel-b.md:L321) // P1-14: the mint row's downstream flywheel row carries the mint's run id as upstream (mint.md:L286) |
| P2 | P1-08, P1-14 | P1-08: select outputs->'minted_item_ids' from harness_runs where family='mint' and mode='apply' and outcome='success' yields ten ids, each opened by URL (harness.md:L391) // P1-14: runMint --limit 10 --mode apply on real census rows; each item provenance_status='verified', at least one substantive FACT beyond the title, every FACT span verbatim (INV-156), the page renders (mint.md:L284) |
| P3 | P1-04, P1-08, P1-09, P1-10, P1-14 | P1-04: Participation: a mint and a substantive update produce the same step list; re-run inserts zero forward events; stale-events flag; deduped defect flag (intake-b.md:L305) // P1-08: rows sharing those runs' root_run_id in the flywheel families with an output count above zero (harness.md:L392) // P1-09: corpusPass records its outcome in the run artifact (rule 17) (flywheel-a.md:L237) // P1-09: every pass returns counts and writes its outcome into the run artifact (P1-08 harness) (flywheel-a.md:L273) // P1-09: mint chokepoint test (P1-03) asserting runConnectionDiscovery is called once per mint (flywheel-a.md:L302) // P1-10: drain history: one real recompute (propagation-run-004, 8 invalidated, 8 recomputed); last apply drain run-008 (0, 0); 19 later ledger rows all dry; none offered (flywheel-b.md:L228) // P1-10: autonomous firing by hops 07 and 08 never proven: F1-S6-04 maps no fired ledger row to either hop (flywheel-b.md:L227) // P1-14: the same run's ledger row carries minted ids and non-zero edges or forward events from the same-run hand-off (mint.md:L285) |
| P4 | P1-05, P1-07, P1-08 | P1-05: change detection: features/sources/change.ts, snapshots.ts (fingerprint, freshness), reconcile pass, staged_updates bridge; bridge needs two captures (writer gets P1-07 caller) (sources-a.md:L303) // P1-07: change-detection pass against the local stack: three fixture sources (changed, unchanged, 403); last_content_hash seeded then changed; monitoring_queue rows accepted by the CHECK; runReconcilePass consumes the changed row (capture.md:L241) // P1-08: a change-detection row, mode='apply', outputs->>'changes_detected' >= 1, with the item it touched (harness.md:L393) |
| P5 | P1-03, P1-05, P1-06, P1-07, P1-08, P1-16, P1-20 | P1-03: Generation pause and Layer C data-audit block halt with dated waivers (readOpenDataAuditBlock, hasValidWaiver): workflow preflight; gates.ts (intake-a.md:L412) // P1-05: INV-088 is the audit that catches disagreeing institution rows (sources-a.md:L216) // P1-06: INV-110 (Gate A gauge readable and zero); gate_a_health gauges and probe verdict (core/health/gate-a.ts) (sources-b.md:L259) // P1-07: D3 audit-event checks NOT PORTED: the data-audit lane (P1-08) is the audit (capture.md:L291) // P1-08: the live-smoke (or audit) row whose code_sha is the deployed SHA has outcome='success' (harness.md:L394) // P1-08: live-smoke family (P5 proof) (harness.md:L327) // P1-16: database proof on the proof stack (ADR-045): derive twice yields same obligations count; register total equals count(*); persona matrix; extractor replay inserts zero new rows against the 307 identity (obligations.md:L276) // P1-20: A database attack for INV-262: render a series row whose source has a rating and assert the rating text is present; same for a published price statistic (market.md:L318) |
| P6 | P1-08, P1-14 | P1-08: CI checks, not ledger rows; the ledger adds nothing here and the register does not claim it (harness.md:L395) // P1-14: insert a payload whose span is not verbatim and expect quarantine; insert a duplicate key and expect refusal (mint.md:L288) |

Proofs no lane serves: none. Lanes whose proof section names none of P1 to P6 (own module proofs only): P1-01, P1-02, P1-12, P1-13, P1-15, P1-17, P1-18, P1-19, P1-21, P1-22, P1-23, P1-24, P1-25, P1-26.


## J. COUNTS

Source: each register's section 2 (current code LOC by awk, non-blank non-comment; clean estimate with its arithmetic). "Clean" is the module figure the register gives first; code the register says leaves the module for another lane is in the note and is not added again (the receiving lane counts it where it says so). Every clean figure is read-derived and labelled HYPOTHESIS by its register until a port lane counts it.

| lane | module | current code LOC | clean estimate | register arithmetic note | cite |
|---|---|---|---|---|---|
| P1-01 | auth-db | 6,830 | 2,450 | auth-db about 2,450 (core/db 115 + core/auth 610 + features/auth API 810 + features/auth UI 915) plus about 1,900 surface read layer leaving the module (2,030 rounded to 1,900 after six fallback wrappers collapse); module 36 percent, whole scope 64 percent; [HYPOTHESIS until the port lane counts them] | auth-db.md:L73 |
| P1-02 | workspace | 8,071 | 4,900 | core/workspace 540 + features/workspace 1,710 + features/account 1,124 + features/onboarding 965 + features/settings 550 = 4,889 rounded 4,900; plus about 510 leaving (sourceStore 80 and types/source 250 to P1-05/06, types/resource 180 to core/types); TRASH SavedSearchesSection 365, DataSummary 82, navigationStore 56, nav types about 25; about 61 percent, whole scope about 67 percent | workspace.md:L72 |
| P1-03 | intake-a | 6,771 | 3,870 | about 3,870 for intake-a plus about 250 that leaves the module (operations-matrix to Operations surface read module, operations-ask-context to assistant route owner); core/brief 1,770 + core/grounding 1,440 + core/intake/classify-verdict 120 + features/intake 540; shrinks to 57 percent; read-derived [HYPOTHESIS until the port lane counts them] | intake-a.md:L98 |
| P1-04 | intake-b | 5,295 | 3,340 | features/intake 1,855 + core/contracts 1,075 + source axes 410 (axes 260, classify-sources job 150; home P1-05) = 3,340; 63 percent; by group intake 2,347 to 1,520, contracts 1,228 to 1,075, classification 1,116 to 410, quarantine 604 to 335; read-derived [HYPOTHESIS until the port lane counts them] | intake-b.md:L61 |
| P1-05 | sources-a | 6,288 | 4,000 | core/sources 1,445 + core/url 45 + core/fetch 840 + features/sources 1,665 = 3,995; plus about 150 leaving the module (jurisdiction list to coverage, failure-phrase check to intake); 222 code lines trashed (canonical-fetch 79, browserless 33, recommend-source-tier 91, acquire-lock 19); shrinks to 64 percent | sources-a.md:L87 |
| P1-06 | sources-b | 5,948 | 3,830 | admin source UI 1,970 + coverage 1,095 + health 360 + scripts 405 = 3,830; 64 percent; largest cut the Haiku layer (about 330 code lines) | sources-b.md:L61 |
| P1-07 | capture | 1,451 | 1,000 | capture 490 (worker 230, fetch policy 90, change detection 140, check-sources route 30) + telemetry 240 + perf 120 + version 10 + email 18 + notifications 25 + seed-fallback helper 15 + cache 85 = 1,003; trash removes 84 (hooks.mjs 56, reconcile route 28); 69 percent; [HYPOTHESIS until the port lane counts them] | capture.md:L50 |
| P1-08 | harness | 6,848 | 460 | 62 code files plus 877 JSON/Markdown lines; harness 460 + moved 2,312 (core/db and env 342, P1-03/04 125, P1-05/06 625, P1-09/10 351, P1-12..15 504, P1-11 405, tools 60) = 2,872 minus 100 counted twice = 2,772; harness shrinks from 1,933 counted lines to 460 (24 percent); [HYPOTHESIS] | harness.md:L97 |
| P1-09 | flywheel-a | 4,403 | 2,810 | 41 files; port 2,810 plus about 390 that leave the module (300 src/lib/tags to P1-02, forward-event-format to P1-16, resolveItemUuid to identity home, ensureCensusRow to intake); trashed about 1,200 | flywheel-a.md:L67 |
| P1-10 | flywheel-b | 4,199 | 2,640 | 43 code files (two JSON fixtures add 172 data lines); plus about 12 that move to P1-22/23 community; core/propagation 770 + features/statutory 270 + core/entities 805 + features/corrections 305 + ops CLIs 490 = 2,640; fueleu constants JSON (111 data) kept, dry fixture (61) not; 63 percent; [HYPOTHESIS] | flywheel-b.md:L74 |
| P1-12 | runtimes-a | 5,330 | 2,950 | awk over 31 code files, plus 1,947 lines of docs and data; 755 code lines TRASH outright; remaining 4,575 fold to about 2,950 (kit replaces about 1,000 scaffold with about 420; record-briefs 1,408 to about 800; export-corpus and ticket queue 613 to about 250; brief-export queue and reader 180 to about 70); plus about 250 lines of authoring docs | runtimes-a.md:L72 |
| P1-13 | runtimes-b | 5,341 | 3,010 | orchestrator 180 + sweep 520 + research walker 200 + change 220 + fetch-drain 170 + ledger-consume 600 + connect 520 + propagate 230 + theme-brief contract 200 + theme-brief material 170 = 3,010; plus about 70 moved to P1-07 (fetch ladder) and about 50 moved to the test tree (fixture db); 56 percent; estimates [HYPOTHESIS until the port lane counts them] | runtimes-b.md:L46 |
| P1-14 | mint | 6,024 | 2,250 | about 2,250 for the mint feature plus about 600 that leave for owners (identity 150 to P1-03/04, capture and titles 350 to P1-07, register-and-rate glue 100 to P1-05) = 2,850 in all; 37 percent (47 with moved code); plus 10,278 raw lines JSON/Markdown/fixtures not in code total; read-derived [HYPOTHESIS until the port lane counts them] | mint.md:L51 |
| P1-15 | producers | 7,845 | 4,950 | 63 percent; core 1,039 + learning 580 + drain 380 + market 1,430 + operations 775 + research 730 = 4,934; data files (7 registry JSON 78, 12 emitting-table JSON 76, EEA classification JSON 9) not counted | producers.md:L104 |
| P1-16 | obligations | 2,445 | 2,150 | extract 700 + read-extraction-input 80 + verbatim-in-source 40 + classify 150 + derive-register 140 + derive-objects 150 + compliance-deadline 40 + register-read 190 + register-facets 70 + upcoming-read 120 + rail-select 25 + kinds 15 + api register 60 + api upcoming 65 + jobs 290 = 2,135 rounded to 2,150; 88 percent; markdown report 339 non-blank lines TRASH; write-forward-events 60 new (counted under P1-14 if coordinator prefers, L195); read-derived [HYPOTHESIS until the port lane counts them] | obligations.md:L42 |
| P1-17 | ui-kit | 6,830 | 5,100 | kit (src/ui) 4,253 + leaving the kit 850 (TagPopover/DetailTagRow 330 to P1-02, WatchButton 250 to watchlist, CommandBar 250 to P1-18, coverage request 20) = 5,103 rounded 5,100; 75 percent code lines, about 49 percent raw | ui-kit.md:L87 |
| P1-18 | shell-list | 6,947 | 2,730 | shell-list 2,734 rounded 2,730 (shell 1,264 + list surface 1,280 + core 190); plus about 1,290 moves to other modules; 1,108 code lines trashed; reconciliation 1,872+2,000+252+1,715+1,108 = 6,947; module shrinks to 39 percent, whole scope 58 percent | shell-list.md:L83 |
| P1-19 | regulations | 8,879 | 5,430 | 8,196 awk over 70 files plus 683 in read-layer slices; clean = core/detail 1,385 + ui/detail 1,415 + features/regulations 2,193 + core/jurisdictions 280 + core/statutory 95 + core/applicability 65; plus about 780 (stated also as about 800) moved out to other lanes; 61 percent; estimates [HYPOTHESIS until the port lane counts them] | regulations.md:L100 |
| P1-20 | market | 4,617 | 3,310 | about 2,560 stay in market feature, about 415 move to producers (P1-15), about 245 shared figures model, about 90 shared vocabulary loader; figures 245 + vocabulary 90 + market lib 860 + market read 260 + market UI 1,212 + routes 230 + producers 415 = 3,312 rounded to 3,310; 72 percent; read-derived [HYPOTHESIS until the port lane counts them] | market.md:L80 |
| P1-21 | research-ops | 6,069 | 4,300 | features/research 1,645 + features/operations 2,455 + core/themes 190 = 4,290; 71 percent; 1,770 removed (dead reader 148, duplicated resolvers and related queries about 180, dead ledger computations about 60, panel split about 60, comment inflation, four chip files to one about 120); estimates [HYPOTHESIS until the port lane counts them] | research-ops.md:L79 |
| P1-22 | community-a | 10,275 | 5,450 | shell and navigation 1,020 + rooms 750 + groups 860 + posts 830 + entities 290 + members rail 110 + moderation 450 + notifications 330 + profile 220 + peer-org directory 90 + shared parts 190 + lib 325 = 5,465, written as about 5,450; 53 percent; [HYPOTHESIS until the port lane counts them] | community-a.md:L58 |
| P1-23 | community-b | 5,294 | 2,680 | awk over 55 files; plus 40 counted by P1-07 for dispatch and seed-fallback flag; lib 660 + api 1,395 + pages 465 + list remainder 70 + notices 90 = 2,680; Community proper 4,872 to 2,520 (52 percent); read-derived [HYPOTHESIS] | community-b.md:L82 |
| P1-24 | dash-search | 6,219 | 3,850 | 41 files and five reader ranges; about 450 of today's lines leave to other lanes (286 mapper and public resources read to list surfaces; about 250 data.ts getters to P1-19..23, P1-02, P1-16); dashboard 995 + watchlist 755 + portfolio 1,155 + search 160 + assistant 470 + core/urgency 165 + core/cache 150 = 3,850; 62 percent of 6,219, 67 percent of the 5,770 that stay; [HYPOTHESIS] | dash-search.md:L71 |
| P1-25 | admin-a | 9,454 | 5,200 | admin-a about 5,200 plus about 540 that move to other modules (VirtualizedRowList 120 to P1-17, AccountPrimitives 250 to P1-17, typed-confirm dialog 80 to P1-17, InvitationsPanel list+revoke 90 to P1-02); per-file sum 5,270 rounded to 5,200; 55 percent, 61 percent with moved code; [HYPOTHESIS until the port lane counts them] | admin-a.md:L68 |
| P1-26 | admin-b | 7,608 | 3,560 | 47 percent; features/admin/api 2,290 + read 290 + ui 255 + galleries under src/ui 640 + helpers 85 = 3,560; recompute-trust/logic.ts writers (46) move to P1-05 and are counted there; trashed outright about 1,760; [HYPOTHESIS until the port lane counts them] | admin-b.md:L105 |

- Summed current code LOC, 25 registers: **155,281**. Summed clean estimates (module figure): **86,220**.
- Section 8 planned-file tables summed (section A): 94,687 all rows; 86,339 on rows with a src/ path.
- Targets (complete-build-plan-2026-10-11 via the Part 1 brief): substrate 15,000 to 25,000 LOC; platform 35,000 to 60,000 LOC; both together 50,000 to 85,000.
- Gap, section 2 clean sum 86,220: +61,220 against the substrate ceiling, +26,220 against the platform ceiling, +1,220 against the combined ceiling of 85,000, +36,220 against the combined floor of 50,000.
- Gap, section A sum 94,687: +34,687 against the platform ceiling, +9,687 against the combined ceiling.
- The registers do not split their estimates into substrate and platform; no split is made here. P1-11 schema (SQL objects, not TS LOC) is not in these sums.

