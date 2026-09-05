// heal-provenance.mjs — the healing runtime for HEAL (2026-09-03).
//
// OPERATOR RULING THIS BUILDS (verbatim, 2026-09-03): "if items are being flagged as not credible for
// the site because of not having sources that is an issue with finding the source not that item. you
// need to attach a source. the item isn't [bad] because you didn't do that." A quarantined/gap-carrying
// item is NOT evidence the item is wrong — it is evidence this repo has not yet gone and found/attached
// its grounding. This module goes and does that: fetch the missing capture, locate a claim's span in
// what was captured (under honest normalization, never invented), fill a missing required slot with a
// FACT when the source states it or an HONEST GAP when it does not, refresh Gate A, then re-derive
// provenance_status through the real trigger and read the row back. An item that still fails after all
// five steps is reported with EXACTLY which criterion remains and why — never silently left unexplained,
// never forced.
//
// TEN STEPS, EACH READING WHAT THE PREVIOUS WROTE (docs/dispatches HEAL / HEAL-2 briefs). Steps 1-4 are
// the first pass (2026-09-03, lane HEAL); steps A/B/C/D/E are the SECOND pass (2026-09-03, lane HEAL-2,
// this same operator ruling applied to the second-order gaps the first pass's own apply run measured:
// wrong/missing SOURCE on an already-span-correct FACT, prose facts with no claim at all, and the
// labeling-discipline gaps criterion 4 checks) — both run before the shared final GATE A + RE-DERIVE:
//   1. CAPTURE — no fetch invented here: Cellar-first for CELEX (EUR-Lex), the Federal Register API for
//      federalregister.gov, a plain polite GET otherwise — importing scripts/mint/export-census-rows.mjs's
//      own resolveRowCapture/captureDocument/makePoliteFetch UNMODIFIED (this file never re-derives that
//      per-family resolution). $0, 1 req/s. A refused fetch is held with evidence, never retried blind.
//   2. GROUND — a FACT claim already failing criterion 3 gets its `source_span` LOCATED in the item's
//      captured text under normalization (whitespace runs, curly/straight quotes, HTML entities, soft
//      hyphens, case-insensitive fallback — see locateSpanInText) and REWRITTEN to the exact verbatim
//      substring the normalized match resolves to. `claim_text` is NEVER touched. A claim neither the span
//      nor the claim_text can locate anywhere in the item's captures is `ungrounded_after_capture`, with
//      the closest fuzzy match (Dice coefficient) reported as evidence — never written.
//   3. SLOTS — a missing required slot (item-type-required-slots.json, the kit's own vocabulary, imported
//      read-only) gets one claim: a FACT (verbatim span, via the SAME extractors record-facts.mjs /
//      record-facts-research.mjs already use to mint new items) when the captured text states it, else an
//      honest GAP in the kit's own wording. Never invented, never guessed.
//   B. OWN-BODY — when the item's OWN registered source carries no `institution_id` (migration 122; a
//      NEW writer surface for this file, confirmed nowhere else writes it), resolve one by the SAME
//      identity rule institution-key.mjs/registerSource dedup `sources` by (never a second resolver) and
//      write it through the guarded path.
//   A. RESOURCE — a FACT claim failing criterion 3 on TIER (above the item's authority floor) or on a
//      NULL `source_id` gets `source_id`/`search_result_id` re-pointed to a floor-qualifying capture found
//      across three ranked buckets (the item's own canonical capture, another of the item's captures from
//      a floor-qualifying source, the corpus pool of OTHER items' captures of the SAME canonical URL —
//      never a whole-table `agent_run_searches` scan) and `source_span` rewritten to the verbatim match.
//      `claim_text` is NEVER touched.
//   E. RECLASSIFY — the residue GROUND and RESOURCE could verify nowhere: re-kind FACT -> ANALYSIS (the
//      labeling discipline's own honest escape hatch), `claim_text` unchanged.
//   C. ORPHANS — a Gate-A orphan (a prose figure/deadline in full_brief with no span-proven FACT claim)
//      searched across STEP A's same ranked capture pool; a found orphan gets a NEW FACT claim (verbatim
//      span = the token); one found nowhere is reported `unprovable`, NEVER invented — the brief is never
//      edited by this step.
//   D. RELABEL — the ONLY step that edits prose, and only by PREPENDING one of the four label forms
//      (`*Analytical inference:*` unless another form is already present) to the paragraph an ANALYSIS
//      claim or an unlabeled-assertion section's modal sentence already lives in. Nothing is reworded,
//      deleted, or moved.
//   4/9. GATE A — the live scanner (gate-a-scan.mjs / gate-a-match.mjs, via write-item.ts's buildGateARow,
//      imported unmodified) re-scans the item's current full_brief against its current FACT claims (post
//      every write above) and the item_gate_a_state row is upserted ONCE, last among the writes.
//   5/10. RE-DERIVE — touch the item (the same touch rederive-record-provenance.mjs uses) so the
//      set_provenance_status trigger re-runs validate_item_provenance and stamps the row; read the row back
//      fresh (never trust an UPDATE's own RETURNING — it is filled before the AFTER trigger runs). An
//      `archived-unreasoned` item that comes back `verified` is un-archived (archive_reason stays null).
//      An item still failing is left exactly as it is, reported with the remaining criterion.
//
// GOVERNING FILES, IMPORTED, NEVER COPIED OR EDITED (per the brief): export-census-rows.mjs (capture
// resolution), record-facts.mjs / record-facts-research.mjs (slot extraction), write-item.ts
// (buildGateARow), item-type-required-slots.json (slot vocabulary, read-only), canonicalize-citation-url.mjs
// (URL equality), institution-key.mjs (source-registry identity). This file adds NOTHING to any of those
// vocabularies or thresholds. `validate_item_provenance` (migrations 158/202) and its JS mirror
// validate-mint-payload.mjs are NOT importable (a DB function body; a mint governing file with
// module-private constants) — their authority-floor and label-regex logic is MIRRORED verbatim inline
// (REG_FAMILY/floorMaxFor/ANALYSIS_LABEL_RE/etc.), the same precedent this file already set for
// claimCoversSlot/containsCaseInsensitive.
//
// DI, DRY BY DEFAULT, $0. Every DB read/write and every network fetch is an injected `deps` function —
// this module runs, and is tested, with ZERO DB credentials and ZERO network access. The MAINT wrapper
// (scripts/maintenance/provenance-heal.mjs) is the only place real db.mjs / fetch wiring happens.
// `main()` never writes or fetches unless `mode === "apply"`.
//
// THIRD PASS (2026-09-03, lane HEAL-3), fixing three measured defects in HEAL-2's own apply run (95
// quarantined items, run 33797952379) plus one broadening, per docs/dispatches:
//   1. STEP ORDER — INVESTIGATED, CORRECTED IN PLACE (rule 14): the dispatch attributed the tripled
//      `analysis_missing_label_syntax` count to RELABEL (D) running before RECLASSIFY (E). Re-reading this
//      file's own step sequence (STEP B -> STEP A -> STEP E -> STEP C -> STEP D, unchanged since HEAL-2)
//      shows E already runs before D — that premise does not hold. The REAL mechanism: RELABEL's own
//      owning-section/paragraph lookup used a raw case-folded `.includes()`, never the normalizer GROUND
//      itself uses, so a re-kinded claim whose claim_text differed from its paragraph by whitespace/curly
//      quotes/entities matched neither the owning-section lookup nor planRelabelParagraph's own literal
//      match, and the miss was silently swallowed (`if (!plan) continue`) with NO report entry at all —
//      undercounting the true miss rate on top of the label failures actually happening. Fixed: both
//      lookups now go through locateSpanInText (the same three-tier exact/normalized/normalized_ci
//      matcher), and every miss — no owning section, OR an owning section whose paragraph-level match
//      still fails — reports `no_owning_section_found` with the claim id, per the brief.
//   2. SLOT CLAIMS — RECLASSIFY had no awareness of the "[<slot_key>] " marker (migrations 114/119/121,
//      migration 299's own self-check) and re-kinded slot FACT-claim residue to ANALYSIS same as any other
//      claim, silently dropping 28 items' worth of required-slot coverage (criterion 5). Fixed two ways:
//      SLOT-REPAIR (a new step, before RELABEL) retroactively converts every already-mis-kinded ANALYSIS
//      claim carrying a required-slot marker back to the kit's own honest GAP for that slot; RECLASSIFY
//      itself now branches the SAME way going forward — a required-slot FACT claim's unrecoverable residue
//      becomes GAP, never ANALYSIS. Both paths call buildSlotClaim (capturedText="") for the GAP text, so
//      it is always byte-identical to what a fresh honest-absence write would produce, never hand-typed.
//   3. GATE A vs LABELS — FINDING, not a fix (gate-a-scan.mjs is a mint governing file, out of this lane's
//      write set): `scanBrief` (scripts/mint/lib/gate-a-scan.mjs) takes ONLY `fullBrief` + `factClaims`; it
//      has no reference anywhere to ANALYSIS_LABEL_RE or any label form, and its only coverage test is
//      whether a token is a literal substring of the FACT-claim corpus. A figure/date token inside an
//      already-labeled `*Analytical inference:*` paragraph is therefore STILL counted as a Gate-A orphan —
//      the label satisfies criterion 4 only, never criterion 7. Compounding this: `item.full_brief` (what
//      Gate A scans, per validate-mint-payload.mjs criterion 7 and this file's own planGateA) and a
//      section's `content_md` (what RELABEL edits, and what criterion 4 itself scans) are TWO SEPARATE
//      stored fields — RELABEL's own prose edits never touch full_brief, so even a successfully labeled
//      paragraph has zero effect on Gate A's orphan count. See this lane's report for the full code path
//      and the measurement this finding settles analytically (no live/artifact access needed): 100% of
//      Gate-A orphans are, by construction, full_brief-prose orphans — scanBrief never reads section
//      content at all, so a "section prose" orphan is not a category this scanner can produce.
//   4. CAPTURE-CITED (broadening) — STEP 1's CAPTURE only ever fetched when an item had NO usable capture
//      at all. A new step, CAPTURE-CITED, runs before RESOURCE/ORPHANS and fetches every URL the item's
//      sections/claims already cite that is not yet captured (bounded to CAPTURE_CITED_MAX_PER_ITEM=25
//      fetches/item/run, reported) — broadening the SAME ranked capture pool RESOURCE/ORPHANS already
//      search, and closing criterion 2's `ungrounded_url` failure directly (a cited URL becomes a captured
//      agent_run_searches row). Adds a PDF branch (src/lib/sources/pdf-extract.mjs's pdfToText, imported
//      unmodified) the plain-GET family never had; `intelligence_items.source_urls`, named in the brief as
//      a third URL source, does not exist as a column or array anywhere in supabase/migrations (grepped in
//      full) and is never read. See the CAPTURE-CITED section below for the complete mechanism.
//
// FOURTH PASS (2026-09-03, lane HEAL-4), fixing the defect HEAL-3's own apply run measured live (95
// quarantined items, 0 healed, run 33804206617): 365 `analysis_missing_label_syntax` failures across 45
// items, every one a FACT claim RECLASSIFY (STEP E) re-kinded to ANALYSIS with `claim_text` UNCHANGED.
// Criterion 4 (migration 202, read verbatim in the live migration — "latest definition wins", confirmed
// the highest-numbered full CREATE OR REPLACE of validate_item_provenance and unpatched by any later
// migration) requires, for an ANALYSIS claim: a blank-line-delimited paragraph in one of the item's
// `intelligence_item_sections.content_md` that BOTH matches the label regex AND satisfies
// `para ILIKE '%' || claim_text || '%'` — an exact case-insensitive substring. Measured (per the dispatch):
// of 365 re-kinded claim_texts, only 4 occur verbatim in any section, 105 after normalizing to lowercase
// alphanumerics/single-spaces, 260 not at all. The claim_text is the ORIGINAL extraction-time FACT wording
// — a paraphrase of the section prose, never required to be verbatim (FACT only requires `source_span` to
// be verbatim; `claim_text` was always free prose). RECLASSIFY moving `claim_kind` FACT->ANALYSIS without
// ever touching `claim_text` therefore produces a claim criterion 4 can never validate — "healed" was a
// dead end by construction, not a delay.
//
// THE FIX. STEP E (RECLASSIFY) now branches on whether the claim's OWN wording is already discoverable in
// its OWN section (`section_row_id`) before deciding what to write:
//   - If `claim_text` already locates (locateSpanInText, the same three-tier exact/normalized/
//     normalized_ci matcher every other step in this file uses) inside the claim's own section, the
//     re-kind is a no-op on the text — UNCHANGED from HEAL-2/HEAL-3's own behavior, and the SAME code path
//     the "STEP E + D together" test (HEAL-2) already covers. Nothing here regresses that case.
//   - Otherwise (the 365-claim defect: a paraphrase, findable nowhere in the section under any of this
//     file's own normalization tiers) this pass computes the OWNING PARAGRAPH by TOKEN-OVERLAP SCORE
//     (`jaccardTokenOverlap` — Jaccard over lowercase alphanumeric tokens, length >= 3, with a small
//     stopword list excluded — see that function's own header for why the stopword exclusion is this
//     lane's one deliberate deviation from the dispatch's literal "e.g." recipe: un-filtered, common
//     3-letter connectors like "the"/"and"/"per" inflate the score of an UNRELATED paragraph purely from
//     shared function words, which a section with 2-3 topically distinct paragraphs makes a live risk).
//     `OWNING_PARAGRAPH_MIN_SCORE = 0.15` is deliberately permissive: a false REFUSAL only leaves an
//     already-failing item exactly as failing as it already was (rule 2 — no claims ahead of evidence; a
//     refusal is never a regression), while a false ACCEPT risks writing a WRONG paragraph's sentence into
//     `claim_text` — bounded by scoring only within the claim's OWN section (already narrowed to the 1-4
//     paragraphs the extractor originally read when it minted this FACT), never the whole item.
//     - Score >= threshold: the SINGLE SENTENCE (`splitSentences`/`pickBestSentence`, same overlap scorer)
//       of the winning paragraph with the highest overlap with the ORIGINAL claim_text becomes the new
//       `claim_text` VERBATIM (after `stripLeadingMarker` removes a leading `**FACT:**`/`*FACT:*`/`FACT:`
//       marker or an already-present analysis label — see below for why). The re-kind proceeds. Both the
//       before and after text are recorded on the report entry (`claim_text_before`/`claim_text_after`) —
//       `section_claim_provenance` (migration 112, re-read in full for this lane; 227/206 add
//       `basis_claim_id`/`mint_hold_reason`, neither a text-history column) carries NO original-text column,
//       so the artifact record IS the preservation, not a DB column — stated here per the dispatch's own
//       instruction to say so if none exists.
//     - Score < threshold on EVERY paragraph in the claim's own section: REFUSED. The claim_text and
//       claim_kind are left EXACTLY as they were (still FACT, still failing its original criterion-3
//       reason) — outcome `reclassify_refused_no_owning_paragraph`, carrying the best score found, so the
//       artifact tells the truth about a claim this pass could not honestly relabel rather than silently
//       forcing it into another unvalidatable state.
//
// RETROFIT (the 365 claims HEAL-2/HEAL-3 ALREADY re-kinded, sitting in the DB right now). A new loop,
// after STEP E, scans every claim that is ALREADY `claim_kind = 'ANALYSIS'` with a NON-NULL `source_span`
// — the fingerprint of exactly this residue. Read canonical-pipeline.ts's own mint-time ledger contract
// (line ~1491, re-read for this lane) BEFORE relying on that fingerprint: a mint-time "GROUNDED ANALYSIS"
// claim ALSO carries a non-null `source_span` by design, so the raw filter is NOT unique to the defect.
// It stays safe because the retrofit's own first move (same as STEP E) is the `locateSpanInText` "already
// findable" check — mint-time GROUNDED ANALYSIS claim_text is REQUIRED verbatim-in-a-labeled-section at
// mint time (canonical-pipeline.ts's own `analysisGrounded` kept-filter, confirmed by reading that file for
// this lane), so it is ALWAYS already findable and this retrofit is a correct no-op on it. Only a claim the
// pre-check cannot find (the actual RECLASSIFY residue, which was NEVER re-validated against its section)
// proceeds to the SAME paragraph/sentence rewrite STEP E uses, or the SAME honest refusal.
//
// STEP D (RELABEL) is extended to match: `planRelabelParagraph` now REPLACES a leading `**FACT:**`/
// `*FACT:*`/`FACT:` marker on the winning paragraph with the analysis label, rather than stacking the label
// in front of it (a paragraph reading "FACT: ... Per the workspace's reading: ..." asserts both at once,
// which is dishonest either way this lane could resolve it — replacing is the one that leaves exactly one
// claim standing). NOTE ON EVIDENCE: this repo's own live prose has not been read for this lane (no DB
// access) — grepped confirmed the "**FACT:**"/"*FACT:*" convention does NOT appear in
// src/lib/agent/canonical-pipeline.ts's own ledger prompt (it prefixes nothing onto section prose; only the
// LEDGER schema's field NAME is "FACT"). This branch is defensive per the dispatch's explicit instruction,
// documented as [HYPOTHESIS] rather than [CONFIRMED] (rule 14): it is a no-op whenever the marker is absent
// (every test and, so far as this lane could determine, every live paragraph), and costs nothing when idle.
//
// WHAT REMAINS IMPOSSIBLE DETERMINISTICALLY. A paragraph that asserts NOTHING any capture, claim, or
// extraction ever stated — the residue `reclassify_refused_no_owning_paragraph` /
// `retrofit_refused_no_owning_paragraph` name — stays labeled FACT (refused) or ANALYSIS-but-unlabeled
// (retrofit refusal leaves claim_text untouched too) and the item stays quarantined on that criterion. That
// is the HONEST end state this pass can reach, not a defect this pass failed to close: this file's own
// $0/no-LLM/deterministic mandate has no mechanism to invent a paragraph that was never written, and
// forcing a label onto unrelated prose would be the fabrication rule 2 forbids, not a fix.
//
// FIFTH PASS (2026-09-04, lane CITED-HELD), closing the CAPTURE-CITED residue HEAL-4's own apply run
// measured live (run 33820643920, HEAL-4 apply, `summary.json` `per_item[].steps.capture_cited.results`):
// 141 cited URLs captured, 67 HELD — `capture_blocked` 60 (a plain GET refused: bot gate, 403, or a
// non-2xx response, across imo.org/sciencedirect.com/iea.org/meti.go.jp/betterbuildingssolutioncenter.
// energy.gov and 20+ other hosts — the item briefs' OWN cited sources, never the item's fault, per the
// operator ruling this file already builds), `canonical_key_unresolved` 5 (every one an eur-lex
// `legal-content/EN/TXT?uri=OJ:L_202500040`-shaped OFFICIAL JOURNAL ISSUE reference — never a CELEX act
// reference, so `deriveKey` (migration 255's own CELEX/ELI-act-only derivation, a governing file this
// lane does not edit) correctly returns null for it), `fr_document_number_unresolved` 2 (bare
// `https://federalregister.gov/`, correctly unresolvable — left as-is, no mechanism applies to a URL that
// names no document at all).
//
// THIS LANE'S EGRESS, TESTED (2026-09-04, `curl -sI https://web.archive.org/`, `archive.org`, even
// `https://example.com`, and the proxy's own `/__agentproxy/status`): every one of those hosts answers
// `403` at the CONNECT-tunnel stage — the container's egress is an ALLOWLIST (github/npm/pypi/the model
// API and a short list of infra hosts; see `/root/.ccr/README.md`), not the open "network egress to
// public sites" the dispatch's ruling assumed. `api.github.com` answers `200` from the SAME container in
// the SAME test, so this is a policy allowlist, not a general outage. Consequence, stated once here and
// not hedged again below: NOTHING in this pass's Wayback/OJ-Cellar code paths runs live in this
// environment; every claim about what those endpoints actually return is [HYPOTHESIS], and the tests
// below are the only verification this lane could perform, all against a fake `fetchImpl` (per this
// file's own DI/DRY/$0 mandate — the module runs and is tested with ZERO network access even when egress
// is open, so the fake-fetch harness was never the blocker; only the "probe 5 live" ask in the dispatch is
// unmet, and is reported as unmet rather than guessed at).
//
// TWO NEW $0 DETERMINISTIC FALLBACKS, both wired into EVERY capture family (STEP 1's `captureItem` AND
// THIRD PASS's `captureCitedUrl` — one choke point each, never two divergent copies):
//
//   1. OJ-REFERENCE RESOLUTION (closes `canonical_key_unresolved` for the OJ-issue shape only — a CELEX
//      act reference was never broken and is untouched). `parseOjReference` reads the `uri=` query
//      parameter of an eur-lex.europa.eu URL and recognises three shapes, all named in the dispatch:
//      `OJ:L_202500040` (year+issue concatenated, no separator), `OJ:L_2025_040` (underscore-separated),
//      and `OJ:JOL_2025_040_R` / `OJ:JOC_..._C` (already Cellar-ID-shaped, edition letter explicit). A URL
//      matching none of the three (e.g. a malformed or non-OJ `uri=` value) still holds
//      `canonical_key_unresolved`, unchanged — this is a NEW branch, never a replacement of the existing
//      one. A parsed reference is resolved against the Publications Office's own OJ resource endpoint
//      (`https://publications.europa.eu/resource/oj/<JOL|JOC>_<year>_<issue5>_<edition>` — the exact shape
//      the dispatch names), via `captureDocument` directly (never `resolveRowCapture`, which has no `oj`
//      branch and is a governing file this lane does not edit or re-derive per this file's own header) —
//      an explicit edition letter from the citation is tried alone; an inferred one (the citation carried
//      none) tries the series' own edition first (`R` for L, `C` for C) then the other letter as a second
//      guess, BOTH attempts recorded in evidence either way. Every attempt failing holds the new, precise
//      `oj_reference_no_cellar_path`, naming every endpoint tried — never chained to the Wayback fallback
//      below (a wrong-shaped Cellar request failing is not "the publisher blocked us," so an archive copy
//      of the WRONG resource would not be evidence of anything; see `resolveOjReference`'s own header).
//      NOT LIVE-TESTED (egress denied, above) — the endpoint shape is [HYPOTHESIS], sourced from the
//      dispatch's own text, never independently confirmed against a real Cellar response this session.
//
//   2. ARCHIVE (WAYBACK) FALLBACK (closes the `capture_blocked`/`capture_thin` class — 60 of the 67 held
//      rows this pass targets). Every capture path that would otherwise hold `capture_blocked` or the NEW
//      `capture_thin` (see next paragraph) now tries ONE more thing before giving up:
//      `https://archive.org/wayback/available?url=<cited url>` (parsed by `parseWaybackAvailability`); a
//      `closest`/`available:true` snapshot is fetched at `https://web.archive.org/web/<timestamp>id_/<cited
//      url>` (the `id_` flag — raw original bytes, no Wayback toolbar HTML injected) through the EXACT
//      SAME extraction the direct path uses (`captureDocument`'s `stripHtmlToText` for HTML,
//      `pdf-extract.mjs`'s `pdfToText` for a PDF-shaped cited URL — build item 4, `tryArchiveFallback`'s
//      own PDF branch is the SAME `looksLikePdfUrl`/`fetchBytesForPdf`/`isPdfBytes` chain
//      `captureCitedUrl`'s direct PDF branch already used, never a second codec). `result_url` (what the
//      caller records as where the text CAME FROM, per this module's existing `captureCitedUrl`/
//      `captureItem` contract) STAYS THE CITED URL — never the snapshot URL — and `evidence` carries
//      `endpoint: <snapshot url>`, `transport: "wayback"`, `snapshot_timestamp`, alongside the ORIGINAL
//      direct attempt's own evidence (never dropped) so an artifact reader sees both what was tried and
//      what worked. No snapshot, or the snapshot itself fails the same extraction: held
//      `capture_blocked_no_archive` / `capture_thin_no_archive`, evidence naming both attempts. THE
//      DOCTRINE POINT (stated here, for the operator, per the dispatch's explicit ask): a Wayback copy is
//      the PUBLISHER'S OWN TEXT at the PUBLISHER'S OWN URL, reached through a third-party CACHE — the
//      archive is TRANSPORT, never a source; `sources`/`institution_id` attribution is UNCHANGED by this
//      fallback (the item still cites imo.org, not archive.org), and every use is labelled
//      (`transport: "wayback"`) so nothing here is silently indistinguishable from a direct capture.
//
//   3. `capture_thin` vs `capture_blocked`, SPLIT (was one bucket: HTTP block AND "the body was real but
//      short" both read `capture_blocked`, so an artifact reader could not tell a bot-gate page from a
//      genuinely near-empty publisher page). `envelopeToOutcome`'s classification: an HTTP response in the
//      2xx range with no fetch error is `capture_thin` (the byte count is in evidence, per the dispatch);
//      anything else unusable (non-2xx, a thrown fetch error, a timeout) stays `capture_blocked`. Both
//      reasons now feed the SAME archive fallback above — a thin page is exactly as worth an archive
//      lookup as a blocked one, per build item 3's own instruction to try the fallback for it too.
//
// TEST COVERAGE ADDED: OJ-reference parsing (all three shapes, plus the `canonical_key_unresolved`
// no-match case unchanged), the Cellar-OJ resolve/hold path (captured on a usable fake response; held
// `oj_reference_no_cellar_path` on two refused attempts, evidence naming both endpoints); Wayback
// availability parsing (snapshot present / absent / malformed JSON); the archive fetch → capture path
// (evidence carries `transport`/`snapshot_timestamp`, `result_url` unchanged from the cited url); the
// no-snapshot hold (`capture_blocked_no_archive`); `capture_thin` classification (a 200 with short body,
// distinct from a 404/blocked); a PDF cited URL captured via the archive fallback (same `pdfToText` codec
// as a direct PDF capture). All against a fake `fetchImpl` — no network in `node --test`, per this file's
// own DI mandate; see this lane's report for the live-egress test result and why no live probe of the
// listed hosts was possible from this container.

import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  classifyHost,
  captureDocument,
  resolveRowCapture,
  extractFrDocumentNumber,
  followUpgradingRedirects,
} from "./export-census-rows.mjs";
import { deriveKey } from "../lib/canonical-key.mjs";
// buildGateARow -- THE live Gate-A scanner (gate-a-scan.mjs) wrapped exactly as apply-mint-batch.mjs's own
// computeGateAState wraps it. Imported unmodified (see this file's header).
import { buildGateARow } from "../../src/lib/intake/write-item.ts";
// record-facts.mjs's own exported slot extractors -- the SAME functions buildRecordFacts routes to
// (buildRecordSlotClaim, private to that file) for a brand-new mint. Reused unmodified for an EXISTING
// item's missing slot; the routing switch below is a 4-line dispatch, not a re-implementation of any of
// these functions' own regex/verbatim logic.
import {
  extractSlotFact,
  extractBindingPositionFact,
  extractDueDateFact,
  extractCorridorFact,
} from "../../src/lib/intake/record-facts.mjs";
import {
  extractResearchSlotFact,
  extractAlwaysPresentResearchFact,
  RESEARCH_ALWAYS_PRESENT_SLOTS,
} from "../../src/lib/intake/record-facts-research.mjs";
// canonicalize_citation_url (migration 150) -- the SAME URL-equality rule criterion 2 and criterion 3's
// capture resolution use, imported unmodified (this is a mint GOVERNING file per CONVENTION.md; never
// re-derived here).
import { canonicalizeCitationUrl } from "./lib/canonicalize-citation-url.mjs";
// institutionKey/hostOf -- the source registry's OWN identity rule (registerSource's dedup key), imported
// unmodified. Second-pass STEP B (OWN-BODY) resolves an institution by this SAME rule, never a second one.
import { institutionKey, hostOf } from "../lib/institution-key.mjs";
// pdfToText/looksLikePdfUrl/isPdfBytes -- THE existing PDF text codec (src/lib/sources/pdf-extract.mjs,
// unpdf/pdf.js, dynamic-imported internally so this module stays dependency-clean until a PDF is actually
// fetched), imported unmodified. THIRD PASS's CAPTURE-CITED step is the only caller (see that section's
// header): neither export-census-rows.mjs's captureDocument nor this file's own original STEP 1 CAPTURE
// have ever had a PDF branch (grep-confirmed, 2026-09-03 -- see this lane's report), so this is filling a
// gap, never re-deriving the per-family HTML/Cellar/FR-API resolution this file's header already forbids
// re-deriving.
import { pdfToText, looksLikePdfUrl, isPdfBytes } from "../../src/lib/sources/pdf-extract.mjs";
// classTierForHost -- THE deterministic register-at-grounding class table (SC-13, src/lib/sources/
// host-authority.ts), imported unmodified. EIGHTH PASS's SOURCE step (below) is the ONLY caller in this
// file: it is how a brand-new host gets a base_tier that is never a guess (legal->1, gov/intergov->2,
// verifier/academic/association->4, analysis->6, lawfirm/news->7; an unrecognized host returns null and
// this file NEVER invents a fallback tier for it -- see SOURCE's own header for the worklist outcome).
import { classTierForHost } from "../../src/lib/sources/host-authority.ts";
// norm -- gate-a-match.mjs's own token normalizer, imported unmodified. SEVENTH PASS's computeDerivedCovered
// (below) uses it to key its covered-token Set EXACTLY the way gate-a-derived.mjs's live derivedCoveredTokens
// and gate-a-scan.mjs's own scanBrief both already do -- never a second normalization rule.
import { norm } from "../../src/lib/agent/gate-a-match.mjs";

// SIXTH PASS (2026-09-04, lane HEAL-BUDGET), fixing the defect run #20 (the FIRST apply run under HEAL-5,
// quarantined-live, 95 items) measured live: 15m20s wall time against .github/workflows/maintenance.yml's
// `maintain` job timeout-minutes: 15 -- the job was cancelled BEFORE finishing. Because
// scripts/maintenance/lib/cli.mjs's own writeSummary() (a governing file this lane does not edit) is
// called exactly once, AFTER main() resolves, a cancelled run wrote NO summary.json at all: no artifact
// content, no per-item residue, and no record of which of the run's own DB writes (agent_run_searches
// inserts, claim span/kind updates, etc. -- all already applied through the guarded path per item, before
// the kill) actually landed. THE UPLOAD STEP ITSELF ALREADY RUNS ON CANCELLATION -- `.github/workflows/
// maintenance.yml`'s "Upload this run's step artifact(s)" step already carries `if: always()` (re-read in
// full for this lane, unchanged since MAINT); GitHub's own docs confirm `always()` executes even when the
// job was cancelled (which a timeout is). The observed "no artifact" was never a missing `if: always()` --
// it was an empty directory with nothing in it to upload (`if-no-files-found: warn` firing honestly on
// zero files). This pass therefore does NOT touch that conditional; it fixes the actual gap, four ways,
// entirely inside this file (heal-provenance.mjs) and its wrapper (provenance-heal.mjs):
//   1. TIME BUDGET. main() now accepts `deps.timeBudgetSeconds` (the wrapper derives it from a new
//      HEAL_TIME_BUDGET_SECONDS step env, itself derived from the job's raised timeout-minutes minus a
//      safety margin -- see maintenance.yml's own comment for the arithmetic) and `deps.now` (an
//      injectable clock, defaulting to `() => Date.now()` -- this file's own DI mandate applies to wall
//      time exactly as it already applies to every DB/fetch call; the run loop below is the ONLY place
//      this file ever reads elapsed time, and it never calls Date.now() directly). Before starting EACH
//      item (never mid-item -- an item's own five-step sequence is never interrupted partway, so a
//      counted item is always either fully processed or not started), the loop checks whether the budget
//      is already spent; on the first item that would start over-budget, the loop stops cleanly, marks
//      `stopped_at_budget: true`, `items_processed`, `items_remaining` (the ids the run never reached),
//      and returns/exits 0 -- a budget stop is an ORDERLY completion of a smaller batch, never a failure.
//   2. CHECKPOINT. `writeCheckpoint(outDir, summary)` (new, exported) writes `<outDir>/summary.json`
//      ATOMICALLY -- a temp file written first, then renamed over the real path (`rename` is POSIX-atomic
//      on the SAME filesystem, which a runner's own $RUNNER_TEMP always is) -- so a hard kill mid-write
//      can never leave a truncated/corrupt summary.json, only the PREVIOUS complete checkpoint or the NEW
//      complete one. main() calls it after EVERY item (when `out` was given -- the exact directory
//      cli.mjs's own runCli() already threads through as `opts.out`, unmodified), so a run killed by the
//      OS/runner (not just one that hits its own time budget and exits cleanly) still leaves the true
//      state of every item processed so far on disk. cli.mjs's own final writeSummary() (unmodified,
//      still runs once main() resolves) is left as the LAST word on a run that finishes normally --
//      this pass's checkpoints are a strictly ADDITIVE safety net under it, not a replacement.
//   3. RESUME. No new selection mode was added: `parseSelection`'s existing `"ids:<uuid,...>"` shape
//      (unchanged since HEAL-1) already accepts exactly the `items_remaining` array a budget-stopped
//      checkpoint carries, and a DB read scoped to a fixed id list costs nothing extra to justify a new
//      "resume-from-artifact" mode that would have to read a CI artifact from a different run -- a real
//      capability this DB-wired step does not have and should not fake. See
//      docs/runbooks/MAINTENANCE-RUNBOOK.md's provenance-heal section for the exact re-dispatch the
//      coordinator runs: `arg: "ids:<items_remaining joined by comma>"` off the stopped run's own artifact.
//   4. WASTE, MEASURED AND REMOVED (build item 5): CAPTURE-CITED (THIRD PASS) captured each cited URL
//      independently per ITEM, with no run-level memory -- two DIFFERENT items citing the SAME url (a
//      shared regulatory source, exactly the case this file's own STEP A "corpus pool of OTHER items'
//      captures of the SAME canonical URL" bucket already exists to exploit for GROUNDING) paid the FULL
//      cost twice: a direct fetch, and on a `capture_blocked`/`capture_thin` hold, a Wayback availability
//      query PLUS a snapshot fetch (FIFTH PASS) -- up to 4 politeness-paced requests for a url this run
//      had already fully resolved for an earlier item. `citedUrlCache` (a plain Map, new in main() -- ONE
//      per run, threaded through every `healOneItem` call via `citedUrlCache` in its options bag, defaults
//      to a fresh Map when omitted so every existing direct-call test keeps its own isolated cache exactly
//      as before) makes CAPTURE-CITED's `captureCitedUrl` call idempotent PER RUN, keyed by
//      `canonicalizeCitationUrl(url)` (the SAME url-equality rule `unfetchedCitedUrls` already uses to
//      dedupe an item's OWN cited urls against its OWN captures -- never a second equality rule). A cache
//      hit skips the network call and the archive-fallback/OJ-resolution work entirely and reuses the
//      prior outcome's evidence verbatim; the per-item `agent_run_searches` INSERT still happens for EVERY
//      item that cites the url (each item still gets its OWN evidence row, `intelligence_item_id`-scoped,
//      per criterion 3's own per-item requirement -- caching removes duplicate FETCHES, never duplicate
//      EVIDENCE). This is STRICTLY more polite (fewer requests to every remote host, never fewer pacing
//      gaps between the requests that do happen -- makePoliteFetch's own 1 req/s gap is untouched) and
//      never weakens evidence (a cached "captured" outcome is the SAME text this run already verified for
//      that exact url; a cached "held" outcome is the SAME refusal this run already reached, reused rather
//      than re-derived, so a URL confirmed to have no Wayback snapshot earlier in THIS run is never
//      re-queried for one moments later). Scoped ONLY to CAPTURE-CITED's `captureCitedUrl` (never STEP 1's
//      `captureItem`): the two resolve eurlex urls DIFFERENTLY on purpose (`captureItem` derives the
//      canonical key from the ITEM's own `instrument_identifier`; `captureCitedUrl` derives it from the
//      url ALONE, per THIRD PASS's own header -- "a citation may name a wholly different instrument than
//      the item's own"), so merging their caches would silently let one item's identifier answer for
//      another's citation -- exactly the fabrication this file's own header forbids. No change was needed
//      or made to makePoliteFetch's own gap, and no other redundant-request source was found: this file's
//      own single shared `deps.fetchImpl` instance (wired once per run by provenance-heal.mjs, imported
//      unmodified) was ALREADY the one pacing authority for every fetch in every step; see this lane's
//      report for the two waste hypotheses checked and NOT found (an over-long pacing sleep; an
//      already-known-empty archive lookup outside this cache's own reach).
//
// SEVENTH PASS (2026-09-04, lane HEAL-6), diagnosing and fixing two of the six criteria named in run
// 33829526120 (HEAL-5.2 apply, `quarantined-live`, 94 candidates, 0 healed_verified, 94 still_failing):
// criterion 7 (`gate_a_unproven_or_stale`, 88 items) and criterion 4 (`analysis_missing_label_syntax`, 38
// items / 148 claims). Both diagnoses are read LIVE against `validate_item_provenance` via
// `pg_get_functiondef` (migration 202, "latest definition wins", re-confirmed unpatched by any later
// migration) — see this lane's report for the exact quoted SQL. Neither the scanner (gate-a-scan.mjs /
// gate-a-match.mjs) nor `validate_item_provenance` itself needed to change; both bugs are entirely in this
// file's own call sites.
//
// CRITERION 7 — GATE B WAS NEVER WIRED. `scanBrief` (the live scanner) has TWO coverage arms: LITERAL
// (a token is a verbatim substring of the FACT-claim corpus) and DERIVED/"Gate B" (a token is a member of
// a `derivedCovered` Set the CALLER computes and passes in — gate-a-derived.mjs's own
// `derivedCoveredTokens`, a live DB lookup crediting a token when a valid, basis-grounded, non-stale
// `claim_kind='DERIVED'` claim asserts it). `planGateA` (STEP 9, this file, unchanged since HEAL-1) called
// `buildGateARow` with `factClaims` ONLY — `derivedCovered` was never passed, defaulting to an EMPTY Set
// (write-item.ts's own default), unlike the live canonical-pipeline.ts, which recomputes it FRESH from the
// DB immediately before every Gate-A write. Every HEAL apply run's OWN Gate-A rewrite therefore silently
// STRIPPED legitimate Gate-B coverage the mint-time pipeline had already established — measured live (read-
// only SQL, 2026-09-04): 16 real orphan tokens across 5 items (ff4064ab-…, 15f63ea9-…, 3af75490-…,
// 5b2c6655-…, bced4406-…) would clear under this fix, ff4064ab-… alone going from 9 orphans to 1.
//
// THE FIX: `computeDerivedCovered(claims, captures)` (new, pure, below) mirrors gate-a-derived.mjs's own
// query shape ENTIRELY IN MEMORY, over `claims`/`captures` this file ALREADY holds (deps.readClaims /
// deps.readCaptures — no new deps call, per this file's own DI/DRY/$0 mandate). `planGateA` now accepts a
// third `derivedCovered` parameter (default empty Set, so every existing call site/test that omits it is
// byte-identical to before); all three planGateA call sites (the early corpus-pool estimate, STEP C's
// pre-ORPHANS scan, and the final STEP 9 write) now compute it FRESH from the claims/captures in scope AT
// THAT POINT — matching canonical-pipeline.ts's own "recompute right before the write" discipline, never a
// single stale snapshot from the top of healOneItem.
//
// REFUSED (documented per the dispatch's explicit ask, not a workaround): `computeDerivedCovered` reads
// `d.basis_claim_id` off each DERIVED claim to find its basis FACT — but `scripts/maintenance/
// provenance-heal.mjs`'s own `readClaims` SELECT (the wrapper that wires this file to the real DB; OFF-
// LIMITS to this lane per its write-set boundary, "scripts/maintenance/** ... do not touch any of those")
// projects `id, claim_kind, claim_text, source_span, source_id, search_result_id, section_row_id` —
// `basis_claim_id` is NOT among them (grep-confirmed, 2026-09-04). Every live DERIVED claim will therefore
// read `basis_claim_id: undefined` through that wrapper, `computeDerivedCovered` will correctly find no
// basis for it, and the returned Set stays EMPTY in production — this fix is written, tested (fixtures
// supply `basis_claim_id` directly, since a pure-function test constructs its own claim objects, never
// going through the wrapper's SELECT), and CORRECT, but DORMANT until a one-line change lands elsewhere:
// adding `basis_claim_id` to that SELECT's column list. See this lane's report for the exact diff.
// LANDED (train/wave16, 2026-09-04, coordinator): the wrapper's `readClaims` now projects `basis_claim_id`;
// the Gate-B coverage above is live from the first heal dispatch on that tree.
//
// CRITERION 4 — RECLASSIFY/RETROFIT SCOPED THE WRONG WAY. Criterion 4's own SQL (migration 202, re-read
// verbatim for this lane) checks, for every ANALYSIS claim, whether SOME paragraph in ANY of
// `intelligence_item_sections.content_md` FOR THAT ITEM — never scoped to any one section — both matches a
// label regex and `ILIKE`-contains `claim_text` verbatim. STEP E (RECLASSIFY) and RETROFIT (FOURTH PASS,
// HEAL-4) both scope their OWN paragraph search to `ownSection = sectionsList.find(s => s.id ===
// c.section_row_id)` — narrower than the validator they are trying to satisfy. Measured live (read-only
// SQL + this file's own real code, 2026-09-04, against the 148 currently-failing ANALYSIS claims across the
// 38 affected items): 0/148 findable in the claim's own section (confirming the bug); widening the search
// to EVERY section of the item finds a home for 100/148 (68%) once a false-accept guard (below) is applied
// — and 3 of the 4 items failing criterion 4 ALONE (007f42b1-…, 45f85547-…, 87ed781c-…) would have EVERY
// failing claim resolved, flipping fully to `verified` on the very next apply run.
//
// THE FIX: `findOwningParagraphAcrossSections`/`planOwningParagraphRewriteAcrossSections` (new, pure,
// below) run the SAME Jaccard-overlap/sentence-pick/marker-strip pipeline `planOwningParagraphRewrite`
// already uses, but scored across EVERY section of the item rather than one — GUARDED by
// `isSubstantiveParagraph` (>= MIN_SUBSTANTIVE_TOKENS=6 scoreable tokens AND at least one sentence-ending
// mark), a guard the ORIGINAL own-section search does not need (it already narrows to the 1-4 paragraphs
// the extractor originally read — see the FOURTH PASS header) but the WIDER item-wide search does: without
// it, a bare markdown heading ("Double Materiality Assessment Infrastructure") scored 0.15 — AT threshold —
// against an unrelated claim in a live section this lane inspected, and would have overwritten a real
// requirement's `claim_text` with a heading fragment. With the guard, the same 148-claim measurement drops
// from 107 (unguarded) to 100 hits — the 7 removed were exactly this class of degenerate match, confirmed
// by inspection, never a loss of a genuine paraphrase match. STEP E and RETROFIT both now try the ITEM-WIDE
// search ONLY after their existing own-section search refuses (never instead of it — own-section stays
// first, cheapest, and lowest false-accept risk); a claim whose winning paragraph lives in a DIFFERENT
// section than its current `section_row_id` gets that column REWRITTEN TOO (`updateClaimKind`'s patch
// object gains `section_row_id` only when it actually changed — RETROFIT's own "patches claim_text only,
// never claim_kind" contract, asserted by an existing test, is preserved: `section_row_id` is not
// `claim_kind`), so criterion 4's own item-wide check and this file's own bookkeeping agree on where the
// claim now lives. A claim found nowhere — own section OR any other — is refused exactly as before,
// `reclassify_refused_no_owning_paragraph` / `retrofit_refused_no_owning_paragraph`, reporting the BETTER
// of the two searches' own best scores (honest telemetry even on a refusal, never a regression in what the
// artifact tells the reader).
//
// NOT TOUCHED, PER DIAGNOSIS: STEP C's own structural limit on grounding Gate-A orphans (824 total orphan
// tokens measured; 386 found in some non-canonical capture but zero in the item's own canonical capture;
// of those, ZERO qualify for a floor-qualifying source — 167 have no `sources` registry row at all, 179
// have one above the item's authority floor) is criterion 3 (the authority floor) working AS DESIGNED, not
// a bug this lane's write set can or should touch — grounding them would mean writing a FACT claim whose
// source tier violates the floor, which rule 2 (no claims ahead of evidence) and this file's own header
// both forbid. `validate_item_provenance` itself needed no change (both fixes are entirely in this file's
// own call sites), so no new migration is written; `gate-a-scan.mjs`/`gate-a-match.mjs` needed no change
// either (both are correct — the bug was never in the scanner), so `PENDING-RUN.md` is NOT re-pinned.
// EIGHTH PASS (2026-09-04, lane HEAL-7), building THE RULING [CONFIRMED, operator, 2026-09-04, verbatim]:
// "get the source. then rate the source. it's that simple. this isn't hard, find the source and then
// publish the data on the site." Context: heal #21 (Actions 33829526120) left 94 items quarantined; HEAL-6
// measured that 386 of the 824 Gate-A orphan figures in those briefs have no floor-qualifying source: 167
// have NO `sources` row at all for the URL the figure came from, 179 have a `sources` row whose derived
// tier is ABOVE the item-type floor (migration 141/145/158/202). The ruling overrules the REFUSAL half of
// that floor (migration 302, written this lane, NOT applied — see that file), never the grounding
// requirement: a figure's source is registered and RATED (its tier, from the SAME deterministic class
// table the registry already applies — src/lib/sources/host-authority.ts's classTierForHost, SC-13, NEVER
// a guess), the figure is grounded on it VERBATIM, and it is published with its rating visible. A figure
// with no source ANYWHERE stays ungrounded and is never published as fact.
//
// STEP SOURCE (new, runs after CAPTURE-CITED and STEP A/RESOURCE + E/RECLASSIFY + RETROFIT, before STEP
// C/ORPHANS — so it can enrich the SAME ranked capture pool ORPHANS scans, and a token it grounds simply
// stops being a Gate-A orphan by the time ORPHANS' own fresh planGateA scan runs, with NO second orphan-
// removal bookkeeping needed anywhere). For every CURRENT Gate-A orphan token that STEP A's own three
// buckets (own_canonical + tier_qualifying + corpus_pool, tier_qualifying deliberately capped at the
// floor) could NOT locate:
//   1. FIND WHERE THE FIGURE CAME FROM. The token's OWNING SECTION (findOwningSection, unchanged) narrows
//      the search to that section's own cited URLs (collectCitedUrls, unchanged, reused not re-derived);
//      an orphan with no owning section falls back to every URL the item cites at all. Candidate URLs are
//      tried in order, bounded (SOURCE_MAX_CANDIDATE_URLS_PER_ORPHAN) — the item's citations and cited
//      URLs, exactly as the brief names, are the search surface; this step adds NO new URL-discovery
//      mechanism (search-result / claim-text scanning is what collectCitedUrls + findOwningSection already
//      do, reused verbatim).
//   2. CLASSIFY (classifyCitedUrlForOrphan, pure, new below). A candidate URL classifies one of three ways
//      against the run's OWN sourcesIndex (byCanonUrl, exact-URL — the SAME matching convention
//      buildOwnCanonicalBucket/buildTierQualifyingBucket already use, never a second equality rule):
//        - `already_registered` — a `sources` row already exists at this exact URL (the 179 ABOVE-FLOOR
//          case: STEP A's own tier_qualifying bucket excluded it BECAUSE its tier is above the floor; post-
//          302 that no longer disqualifies it from grounding at all).
//        - `registerable` — no row exists, but `classTierForHost(hostOf(url))` resolves a deterministic
//          class tier (the 167 NO-SOURCE-ROW case, closed the SC-13-safe way: legal/gov/intergov/verifier/
//          academic/association/analysis/lawfirm/news, never a guessed default).
//        - `worklist_ambiguous_host` — neither: SC-13 forbids registering ambiguous hosts with an invented
//          tier. Reported, never forced; the token stays an honest orphan on this candidate (the next
//          candidate URL, if any, is still tried).
//   3. CAPTURE + REGISTER (apply only). A `registerable` host is registered through `deps.registerSource`
//      (db.mjs's own guarded, institutionKey-deduped path — the SAME path run-source-sweep.mjs's own
//      registerSource use goes through; never a second registration mechanism), base_tier = the class-
//      table tier, NEVER hand-typed. The URL is captured through `captureCitedUrl` (THIRD/FIFTH PASS's own
//      per-family resolution — Cellar-first/FR-API/plain-GET/PDF, WITH the Wayback archive fallback HEAL-5
//      already built into that function — imported and reused unmodified, never re-derived) UNLESS the
//      item already holds a usable capture of that exact URL (checked against the run's live `captures`
//      array, including whatever CAPTURE-CITED just added this same run) — the SAME run-level
//      `citedUrlCache` CAPTURE-CITED already threads through is reused here too, so a URL two different
//      orphans (or two different items) cite in the SAME run is never fetched twice. `deps.readSourceByUrl`
//      (new; institutionKey-matched, the SAME dedup rule registerSource itself uses) reads back the
//      REGISTERED row's real tier for the claim's `source_tier_at_grounding` stamp — never the class
//      table's own predicted tier, in case registerSource's own dedup matched an EXISTING row at a
//      different exact path than the one just classified.
//   4. GROUND. `locateSpanInText` (unchanged, the same three-tier exact/normalized/normalized_ci matcher
//      every other step uses) on the (now-captured) page's text; a verbatim match writes a NEW FACT claim
//      exactly as ORPHANS already does (buildOrphanClaimText, verbatim span = the token) — `source_id` =
//      the registered/existing source, `search_result_id` = the capture, `source_tier_at_grounding` = the
//      REAL read-back tier (never invented). No match: the next candidate URL is tried; every candidate
//      exhausted with no match is reported `token_not_in_page` (per the report contract) and the token
//      stays an honest orphan for ORPHANS' own (unchanged) fuzzy-evidence report.
// Bounded per item (SOURCE_MAX_PER_ITEM) so a pathological item cannot exhaust a run's whole politeness
// budget; overflow is reported, never silently dropped. Dry mode plans every step above with ZERO writes
// and ZERO fetches (`would_register` / `would_capture_and_register` / `would_ground`), matching every
// other step's dry contract.
//
// NINTH PASS (2026-09-04, lane HEAL-8), diagnosing STEP SOURCE's own live apply run (Actions 33844146038,
// quarantined-live, HEAL_VERSION hp7-2026-09-04.1 — measured read-only via Supabase MCP SELECT against the
// real rows, never the run's own summary.json, which was not on disk): 359 `unresolved`, 302 `bound_hit`,
// and a `token_not_in_page` sample (>=60 tokens across >=20 items) classified into four causes, per the
// dispatch's own taxonomy:
//   (A) NUMERIC-FORM MISMATCH — a different surface form of the SAME figure (decimal/thousands separator,
//       currency symbol vs code, non-breaking/narrow-no-break/thin space, super/subscript digits, dash
//       variants, trailing sentence punctuation the token regex over-captured). [CONFIRMED] measured at
//       ~1.4% of the sampled token_not_in_page rows — small, but a real, distinct, fixable cause.
//       PDF or sub-page ONE HOP away does (the dispatch's own example: a Cellar/EUR-Lex link off a
//       Commission press page; this lane's own sampled case: a CINEA AFIF grant-database figure linked from
//       a Clean Hydrogen Partnership press release that was itself never captured beyond a placeholder
//       stub). BUILT SCOPE NOTE [CONFIRMED, this lane]: both of those examples are actually CROSS-HOST
//       (ec.europa.eu -> eur-lex.europa.eu; the Partnership's own host -> cinea.ec.europa.eu), and
//       `institutionKey` — the one identity rule this file's one-hop eligibility reuses, deliberately never
//       a second resolver — is host-prefixed by construction and can never equate two different hosts (see
//       classifyHopLink's own header). What this pass's ONE-HOP FOLLOW actually closes is SAME-INSTITUTION
//       (same host, or same shared-portal institution) hops — a genuine cross-host institution hop would
//       need an async DB institution lookup, which is a separate, still-open lever, not silently claimed
//       done by naming the dispatch's own examples.
//   (C) PAGE CHANGED / CAPTURE THIN — a cookie wall, JS shell, 404, or a shorter/blocked earlier capture
//       than a fresh fetch would produce; the EXISTING >200-char usability floor this file already applies
//       elsewhere (needsCapture/bestCaptureText) was NOT being applied to STEP SOURCE's own "already
//       captured, skip the fetch" lookup, so a thin/blocked pre-existing row silently short-circuited a real
//       re-fetch that (Wayback-aware, via the unmodified captureCitedUrl) might well have succeeded.
//   (D) NOWHERE — not in the capture, not in any one-hop resource, not in any other capture: the honest
//       terminal state. `full_brief` (what Gate A scans) has NO editor path anywhere in this file (RELABEL
//       only ever touches a section's `content_md`, by construction never full_brief — see the THIRD PASS
//       header above) — a bare orphan TOKEN, unlike an existing FACT claim, has no RECLASSIFY/RETROFIT path
//       to re-kind, because there was never a claim to re-kind in the first place. The honest, buildable
//       version of "refactor if the paragraph exists, else report" is: report the token's own literal
//       enclosing sentence from full_brief (never invented) alongside STEP C's existing fuzzy-match
//       evidence, so the coordinator hands the operator an actual sentence, not a bare token.
// The SINGLE largest, best-evidenced cause in the broader sample (measured, not the token_not_in_page
// slice alone): STEP SOURCE's own `sourceAttempts` budget counted a ZERO-COST "already captured, no fetch"
// lookup THE SAME as a real network fetch or a classification-only worklist decision — starving genuinely
// free, high-value groundings on high-orphan items (one sampled item: 51 orphans, 47 free-lookup
// groundings available across its own already-captured rows, most never even attempted before the item's
// 25-attempt budget ran out on classification/fetch churn). Fetch-count arithmetic against the run's real
// wall-clock budget (`HEAL_TIME_BUDGET_SECONDS=1500`, `.github/workflows/maintenance.yml`, at 1 req/s via
// the single shared makePoliteFetch instance): ~1500 real fetches are available per WHOLE RUN, shared
// across all ~89 quarantined-live items — SOURCE_MAX_PER_ITEM=25 real-fetch slots per item is therefore
// still a reasonable per-item share of that shared budget (89 x 25 = 2225 > 1500, so the existing cap
// already assumes not every item spends its full budget on real fetches, which matches C's classification-
// heavy reality); RAISING it further would not have helped the 47/51 case above, since the bottleneck there
// was the ACCOUNTING, not the ceiling. This lane's fix is therefore the budget-split below, not a raised
// ceiling — a raised ceiling is left to the operator as a SEPARATE, still-open lever if the budget-split
// fix alone does not clear the residue in one more pass.
// Fixes, all in STEP SOURCE (healOneItem), none touching the EIGHTH PASS mechanism's own three outcomes:
//   - BUDGET SPLIT: `sourceAttempts` no longer charges an already-captured, USABLE (>200-char) row for the
//     exact URL being tried (a zero-cost, zero-network lookup) — it still charges a classification-only
//     worklist_ambiguous_host/unresolvable_host decision, a dry-mode plan, and every genuine new fetch
//     (direct or one-hop), so the EIGHTH PASS bound_hit test's own accounting is unchanged.
//   - CLASS C THIN-RECAPTURE: the "already captured" lookup now REQUIRES >200 usable trimmed chars (the
//     file's own established floor) to count as captured at all; a thin/blocked pre-existing row is treated
//     as not-yet-captured and falls through to a real, Wayback-aware re-fetch via the unmodified
//     captureCitedUrl — which DOES charge the budget, being a genuine attempt.
//   - CLASS A NUMERIC-TOLERANT MATCHER: `locateSpanInText` gains a fourth tier (`numeric_tolerant`, digit-
//     gated — never applied to non-numeric needles) plus a trailing-punctuation retry, built on a NEW
//     composable `buildNumericNormalizedIndex` layered on the existing structural normalizer. The STORED
//     `source_span` stays byte-exact from the capture (ADR-016) — only the SEARCH tolerates a different
//     surface form of the same figure. This never weakens Gate-A coverage (gate-a-match.mjs's own literal-
//     and-exact `containsToken`, a governing file, is untouched): `buildOrphanClaimText` (unchanged,
//     pre-existing) already embeds the orphan token VERBATIM into `claim_text`, and `scanBrief` checks
//     `claim_text + " " + source_span` CONCATENATED — so a tolerant SEARCH only needs to prove genuine
//     grounding and recover a real verbatim span; it never needs to defeat the coverage-decision doctrine.
//   - CLASS B ONE-HOP FOLLOW: when a freshly-fetched (THIS run) candidate page does not itself carry the
//     token, up to SOURCE_MAX_HOP_LINKS_PER_TOKEN same-host/same-registered-institution links extracted
//     from that page's own raw html (a field newly threaded through envelopeFromPlainGet/envelopeToOutcome/
//     tryArchiveFallback — additive, NEVER persisted to any stored row, only ever used transiently within
//     this same run before being discarded) are tried, each captured through the SAME captureCitedUrl path
//     and grounded with its OWN registered+rated source (never inherits the landing page's source/tier).
//     An already-captured row never carries raw html (it was never stored), so one-hop is only ever possible
//     off a page this run itself just fetched live — never a stale DB row.
//   - CLASS D REPORTING: `no_candidate_url` and `unresolved` STEP SOURCE outcomes, and STEP C's own
//     `unprovable` outcome, now carry `sentence` — the token's own literal enclosing sentence from
//     full_brief (new `extractSentenceContext`, null-safe, never invented) — so the coordinator can hand the
//     operator an actual sentence, not a bare token.
// Also fixed: `summarizeReports` was missing a tally for the `no_candidate_url` STEP SOURCE outcome
// entirely (silently absent from every summary this file has ever produced) — added alongside the other
// STEP SOURCE counters, tested.
// See this file's own test suite for the full coverage of every fix above (numeric forms actually measured
// in the sample, one-hop extraction/eligibility/grounding, sentence-context extraction, the budget-split and
// thin-recapture behavior changes, all via the SAME `fetchImpl`-injected, real-network-free testing
// convention every prior capture-family function in this file already uses).
//
// (Undocumented in this header at the time, HEAL_VERSION unchanged: lane HEAL-9, 2026-09-04, bound the run's
// own time budget to DRY mode too — Maintenance #28 (dry, quarantined-live, 89 items, run 33851505474) ran
// 29m36s before the JOB's own timeout cancelled it, because the budget check in `main()` was gated
// `apply &&` on the reasoning that a dry run makes no fetch and has nothing to bound; STEP SOURCE (EIGHTH
// PASS) does real candidate-URL lookup and span-location work in dry mode too. See `main()`'s own inline
// comment for the fix; heal31.json/heal28.json (this pass's own evidence, below) are #31/#28's checkpoints.)
//
// TENTH PASS (2026-09-04, lane HEAL-10), diagnosing and cutting the run's own PER-ITEM COST, and fixing the
// job-timeout/step-budget race that let it cancel a run before its own clean stop. Two pieces of measured
// evidence: `scripts/_snapshots/heal31.json` (Maintenance #31, run 33855060659, provenance-heal APPLY,
// quarantined-live, 87 candidates — CANCELLED by the job's 30-min timeout at 09:16:49, job started 08:46:36,
// step started 08:51:57 after 5m21s of Install/Population-BEFORE setup, 15/87 items processed) and
// `scripts/_snapshots/heal28.json` (Maintenance #28, run 33851505474, DRY, quarantined-live, 89 candidates,
// 28/89 items checkpointed before the pre-HEAL-9 job backstop killed it at 29m36s).
//
// COST ATTRIBUTION [CONFIRMED, per-item report counts + live read-only SQL, project kwrsbpiseruzbfwjpvsp,
// 2026-09-04]. #31's 15 items average ~100s/item (1500s / 15); #28's DRY run — which makes ZERO network
// fetches (main() never writes OR fetches unless apply, and STEP SOURCE's own dry branch plans every
// candidate without calling captureCitedUrl) — averaged ~63s/item (1776s / 28) all the same. A dry run
// cannot be network-bound, so the dominant cost is NOT the 1 req/s politeness pacing (already measured low:
// #31's own capture_cited.fetched sums to 9 across all 15 items, and STEP SOURCE's own EIGHTH/NINTH-PASS
// fixes already dedupe fetches per run and never charge an already-captured lookup — see those passes'
// headers above; this pass found that accounting sound and did not touch it). It is CPU: `locateSpanInText`
// (`planGroundingForClaim`/`planResourceForClaim`/`planOrphanGrounding`, STEP SOURCE's own direct + one-hop
// calls) rebuilds `buildNormalizedIndex`/`buildNumericNormalizedIndex` — each an O(n) pass over the FULL
// haystack — from scratch on EVERY call, and every one of those call sites loops the item's OWN capture
// pool once per CLAIM (GROUND/RESOURCE) or once per Gate-A ORPHAN TOKEN (STEP SOURCE's pre-check AND STEP
// C's own fresh scan — TWO passes for any orphan STEP SOURCE could not resolve). Measured live: item
// 15f63ea9-4803-4bb4-b1a3-9ccdeb8a3050 (one of #31's 15) carries 32 captures totalling 2,833,138 chars (one
// row alone 927,954 chars) and 10 orphan tokens — its own capture pool is re-normalized on the order of
// (10 orphans) x (up to 2 passes: STEP SOURCE precheck + STEP C) x (up to 32 buckets) x (up to 2 tiers:
// locate + numeric) ~= 1,280 full-text normalization passes over up to ~2.8M chars combined, [INFERRED] the
// single largest contributor to this item's own share of the run (no per-step wall-clock was recorded in
// either snapshot to confirm the exact seconds; the O(claims-or-tokens x captures x chars) shape and the
// live row sizes are [CONFIRMED], the resulting wall-clock split across items is [INFERRED]). Corroborating,
// broader evidence: `agent_run_searches` (whole table, read-only SQL) averages 109,357 chars/row, median
// 13,999, MAX 17,787,345 — this file's own normalization passes have no upper bound on a single call's cost
// besides the row itself.
//
// THE FIX, three parts, none touching STEP SOURCE's own EIGHTH/NINTH-PASS fetch/register/ground contract:
//   1. CAPTURE-TEXT INDEX CACHE. `buildCaptureIndex`/`getCaptureIndex` (new) precompute a capture's
//      normalized/numeric-tolerant/lowercased forms ONCE and memoize by `capture.id` in a `Map` threaded
//      RUN-WIDE (`healOneItem`'s new `captureIndexCache` option, same convention as `citedUrlCache`) — so a
//      capture re-checked for a second claim or orphan token, THIS item or a later one in the same run
//      (corpus-pool captures are shared across items citing the same URL), is normalized exactly once.
//      `locateSpanInTextCore`/`locateSpanInText` are refactored onto the SAME index-building path (no
//      second implementation to drift), which also removes a pre-existing, uncached, 2x-per-call waste:
//      `locateSpanInText`'s own primary-attempt + trailing-punctuation-retry sequence rebuilt the SAME
//      haystack's index twice; both attempts now share one `buildCaptureIndex` call regardless of caching.
//      `locateSpanInText`'s own exported signature/behavior is UNCHANGED for every existing call/test (a
//      one-off caller still gets a correct, merely non-shared, index) — the cache is purely additive, opted
//      into by `planGroundingForClaim`/`planResourceForClaim`/`planOrphanGrounding`'s new optional
//      `indexCache` parameter (defaults to a fresh Map, so every 2-arg call keeps its own isolated cache
//      exactly as before this pass) and by STEP SOURCE's own direct/one-hop `locateSpanInText` calls, now
//      `locateSpanInTextCached`. Turns the per-item cost from O(claims-or-tokens x captures x chars) into
//      O(captures x chars) — ONE normalization pass per capture, however many claims or orphan tokens check
//      it — decoupling per-item cost from orphan/claim COUNT (the 51-orphan item HEAL-8's own header names)
//      and bounding it instead by the item's OWN capture volume, which SOURCE_MAX_PER_ITEM/
//      CAPTURE_CITED_MAX_PER_ITEM already cap the growth of. Projected cost for item 15f63ea9 above: ~32
//      normalization passes (one per capture, ~2.8M chars total, well under a second of JS string work) plus
//      ~1,280 native `.indexOf()` lookups against already-built indices (sub-millisecond each) — down from
//      ~1,280 full O(n) rebuilds. `findClosestFuzzyMatch` (the Dice-coefficient fuzzy-evidence fallback) is
//      UNTOUCHED — already bounded to `FUZZY_MAX_WINDOWS=5000` scoring passes regardless of haystack size, so
//      it was NOT a measured contributor (checked, per rule 14 — no claim ahead of evidence — and NOT fixed
//      because there was nothing here to fix).
//   2. PER-ITEM WALL-CLOCK BACKSTOP. `computeItemTimeBudgetSeconds(runTimeBudgetSeconds)` (new, pure) derives
//      a per-item cap — clamp(runBudget/10, 30, 120) seconds — from the SAME `HEAL_TIME_BUDGET_SECONDS` the
//      wrapper already reads; no new workflow env needed (this lane's write set covers the wrapper, not new
//      maintenance.yml env lines). `healOneItem` checks it BETWEEN orphan tokens (never mid-token) in BOTH
//      STEP SOURCE's and STEP C's own loops — the two confirmed O(tokens x buckets) hot loops — reporting
//      `item_bound_hit` for every token skipped, never silently dropped (own `summarizeReports` counters:
//      `source_item_bound_hit`, `orphans_item_bound_hit`). A defensive backstop UNDER fix 1, for a case this
//      pass's own live measurement did not anticipate — not the primary fix, and (like the run-level budget)
//      inert (`deps.now` never read) when `deps.itemTimeBudgetSeconds` is unset. Deliberately scoped to
//      these two loops only (not CAPTURE-CITED's own fetch loop, count-bounded already at
//      CAPTURE_CITED_MAX_PER_ITEM=25 and not the measured cost driver here) — see this pass's own report for
//      the scoping decision.
//   3. JOB-TIMEOUT ARITHMETIC. `.github/workflows/maintenance.yml`'s own `maintain` job `timeout-minutes`
//      (30) left LESS than `HEAL_TIME_BUDGET_SECONDS` (1500s/25min) once #31's own MEASURED pre-step setup
//      (5m21s, not the ~1-2min the prior comment assumed) is subtracted — the job killed run #31 at
//      09:16:49, 8s BEFORE the step's own 1500s internal deadline (08:51:57 + 1500s = 09:16:57) could stop
//      it cleanly and checkpoint. Fixed in that workflow file's own `timeout-minutes` line/comment (this
//      lane's write set does not extend to any other line of it) — see that file for the exact arithmetic;
//      `HEAL_TIME_BUDGET_SECONDS` itself is UNCHANGED at 1500 (fix 1/2 above cut the cost the budget is
//      spent on, not the budget itself — raising it was considered and rejected per this pass's own report).
//
// TESTS ADDED: `buildCaptureIndex`/`getCaptureIndex` (memoization by id, uncached fallback with no id),
// `locateSpanInTextIndexed`/`locateSpanInTextCached` (same outputs as the pre-existing `locateSpanInText`
// fixture set, via a shared index/cache), `containsCaseInsensitiveCached`, the three planners' new
// `indexCache` parameter (a shared Map across two calls proves the SECOND call never rebuilds — asserted by
// a counting-instrumented capture object), `computeItemTimeBudgetSeconds` (clamp bounds, null on
// unset/non-positive), and `healOneItem`'s own item-budget backstop (a `deps.now` stub that advances past
// the item cap mid-loop, asserting `item_bound_hit` on the remaining orphans and that `deps.now` is NEVER
// read when `deps.itemTimeBudgetSeconds` is unset — the same convention the existing run-level-budget test
// already uses). Fixtures for the Blue Visby item's own tokens/sentences (item 0781a8c0-5e17-4841-819c-
// fe9cd91eff15, "15%"/"April 2026") are built verbatim from `scripts/_snapshots/heal31.json`'s own
// `per_item[]` entry — see this pass's own report for the exact excerpt.
//
// BRIEF-HONEST STRIP (Task 3) + CRITERION-4 RELABEL-FROM-FULL-BRIEF (Task 4), lane HEAL-6's own named-but-
// unbuilt asks. `planBriefHonest`/`planStripUnprovableSentence`/`planStripUnprovableClause` (STEP BRIEF-
// HONEST, right after STEP C) plan removing exactly the enclosing sentence (or, when the sentence carries
// ANOTHER still-tracked orphan token, exactly the middle clause — first/last-clause cuts are always
// REFUSED, never guessed) of a token STEP SOURCE and STEP C both exhausted this run — never inventing,
// never paraphrasing, only deleting a located literal span. Acceptance re-runs the LIVE Gate A scanner
// (buildGateARow) on the rewritten brief and requires orphan_count === 0 — a stray UNRELATED orphan
// (untouched this run, e.g. a per-item-budget cast-off) rejects the WHOLE plan, nothing partial ever
// writes. DRY BY DEFAULT: the plan is always computed and reported (`report.steps.brief_honest`,
// `summary.brief_honest`); the actual `deps.updateItemBrief` write fires ONLY when apply=true AND the
// dispatch's own `--arg` carries the new `parseSelection` suffix `"+strip-unprovable"` (e.g.
// `"quarantined-live+strip-unprovable"` or `"ids:<uuid,...>+strip-unprovable"` — every existing selection
// form's own mode/ids meaning is unchanged, this only adds `selection.stripUnprovable`).
//
// CRITERION 4 (Task 4) — MEASURED, not assumed (rule B4/B10): pulled `validate_item_provenance`'s live
// definition via `pg_get_functiondef` (read-only, project kwrsbpiseruzbfwjpvsp) rather than trusting this
// file's own `ANALYSIS_LABEL_RE`/`planRelabelParagraph` mirror. Its ANALYSIS-claim check is: does ANY
// section's content_md (item-wide — `s.item_id = p_item_id`, NOT scoped to the claim's own
// `section_row_id`) carry a blank-line paragraph that BOTH matches the label regex AND contains
// `claim_text` as a literal (`ILIKE '%'||claim_text||'%'`) substring — full_brief is NEVER read by this
// criterion. Re-measured heal31.json's FULL 159-claim `relabel_no_owning_section` residue against the LIVE
// DB (not the run's own stale snapshot) with this exact predicate: 148/159 (93%) are ALREADY literal-
// substring-present in their own registered section — inspection of 6 sampled found the true cause is
// `planRelabelParagraph`'s `!ANALYSIS_LABEL_RE.test(p)` guard correctly finding the paragraph ALREADY
// labeled by an earlier pass and correctly no-oping (confirmed live: `live_check_passes = true` today for
// 6/8 of #31's OWN reported-still-failing criterion-4 claims — the run's own snapshot is stale relative to
// today's DB, not a live defect); 3/159 (all one item, 27dfbe4c-f152-422e-8eb9-1e14d6e99a10, one section
// 2d21cf65-21a2-4e9d-9acb-52b64161232c) are EXACTLY lane HEAL-6's named case: claim_text absent from every
// section's content_md but a literal substring of full_brief; 8/159 are nowhere at all, not even in
// full_brief (a paraphrase of sourced prose, not a quote — genuinely unrecoverable under "never invent,
// never paraphrase" — reported, never fixed). Since the live check only ever reads sections,
// `planRelabelFromFullBrief` (STEP D) does NOT edit full_brief for the 3/159 case — it APPENDS a new
// labeled paragraph (`*Analytical inference:* ` + the claim's OWN verbatim claim_text, already confirmed a
// literal substring of full_brief by this same function) to the claim's OWN registered section, gated
// behind the SAME `+strip-unprovable` token (this is also new prose beyond the established prepend-a-label
// pattern, so it gets the same explicit-opt-in treatment as the strip itself).
//
// ITEM_GRADE DOCTRINE (grepped docs/decisions + docs/plans/record-tier-population-plan-2026-09-01.md §2/§7,
// migration 278): `intelligence_items.item_grade` (`'record'`|`'brief'`, default `'brief'`) is UNCHANGED by
// either Task 3 or Task 4's writes. Record-grade items are deterministic FACT/GAP-only extraction with NO
// synthesized prose — they have no full_brief-driven Gate A orphans to strip and no ANALYSIS claims to
// relabel in the first place, so both steps are structural no-ops for them, never a grade change. Brief-
// grade items keep their grade: Task 3 only ever REMOVES prose from an already-brief-grade item's own
// full_brief (the same "brief grade = full_brief + claims pipeline" shape it already has), and Task 4 only
// ever adds a label to an existing section — the record<->brief upgrade path (§7) is a distinct, unrelated
// full-remint mechanism (`apply-staged-update.ts`) this lane's write set does not touch.
// ELEVENTH PASS (2026-09-05, lane ATTACH-SOURCES, W3.1). Audit finding (wiring-audit-2026-09-04.md gap 4 /
// C1-loop-map.md §6): apply #42 measured 443 orphan tokens on 76 items that STEP SOURCE's OWN candidate
// search (`candidateUrlsForOrphan`, scoped to the item's OWN cited URLs) could not resolve at $0 — every
// candidate this file could derive from the item's own citations was tried and exhausted. The operator's
// standing ruling (STEP SOURCE's own header) is "you need to attach a source", not "stay quarantined until
// a paid search API is authorized" — and rule 18 already gates $0/no-LLM. The $0 lever left is a session
// Haiku browser lane doing the actual web search a human would do (free, no API spend, no runtime LLM
// call) and handing back what it found. This pass adds exactly ONE new input to STEP SOURCE's EXISTING
// candidate-URL list, nothing else: `deps.foundSourcesForItem(itemId)` (optional; absent/undefined for
// every dispatch that isn't `attach-found-sources` — provenance-heal's own default dispatch behavior is
// therefore BYTE-IDENTICAL to before this pass) returns `{ [token]: [{ url, quote }, ...] }` for that
// item — a worklist a Haiku lane filled with a URL it found and the quote it read there. Those URLs are
// PREPENDED to `candidateUrlsForOrphan`'s own result (never replacing it — an item's own citations are
// still tried too) and then run through the EXACT SAME classify/fetch/register/locate sequence every
// other candidate already goes through below: SC-13's class table still decides the tier (never the
// worklist's own say-so), `locateSpanInText` still requires the TOKEN verbatim on the fetched page (never
// trusting the worklist's `quote` as a substitute proof), and a URL whose host the class table leaves
// ambiguous still worklists rather than registering. `quote` is carried into the reported outcome only as
// audit evidence (cross-referenced against the URL a human/Haiku actually read) — it is never itself the
// needle GROUND locates. This is additive and idempotent by construction: a token STEP SOURCE already
// grounded (from this run or an earlier one) is no longer a Gate-A orphan, so it is never re-offered a
// worklist candidate to try again; re-dispatching the SAME worklist against an item with no remaining
// orphans is a clean no-op, not a duplicate write.
export const HEAL_VERSION = "hp11-2026-09-05.1";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SLOTS_PATH = resolve(HERE, "item-type-required-slots.json");

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// item-type-required-slots.json — read-only import of the kit's own slot vocabulary. Never edited here.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/** Load the kit's item_type -> required slot_key[] map. Pure past the one fs.readFileSync (matches
 *  export-census-rows.mjs's own loadReviewedVerdicts: a script-level read at CALL time, never module
 *  scope — scripts/mint/** is not under the src/lib no-I/O discipline, but keeping the read out of module
 *  scope keeps this file importable/testable with a stubbed path). */
export function loadRequiredSlots(path = DEFAULT_SLOTS_PATH) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const out = {};
  for (const [itemType, slots] of Object.entries(raw)) {
    if (Array.isArray(slots)) out[itemType] = slots;
  }
  return out;
}

/** The exact criterion-5 check (migration 299's own self-check SQL, verbatim shape): a claim covers
 *  `slotKey` when claim_kind IN (FACT, GAP) and claim_text case-insensitively CONTAINS the slot_key
 *  literal. Pure. Mirrors the live SQL `claim_kind IN ('FACT','GAP') AND claim_text ILIKE '%'||slot_key||'%'`
 *  exactly, so this module's own idea of "already covered" can never disagree with the DB's. */
export function claimCoversSlot(claim, slotKey) {
  if (!claim) return false;
  if (claim.claim_kind !== "FACT" && claim.claim_kind !== "GAP") return false;
  return String(claim.claim_text ?? "").toLowerCase().includes(String(slotKey ?? "").toLowerCase());
}

/** The required slot_keys for `itemType` (per `requiredSlotsMap`) that no existing claim covers yet.
 *  Pure. Empty array when the item_type has no entry (nothing required) or every slot is already covered. */
export function missingRequiredSlots(itemType, claims, requiredSlotsMap) {
  const required = requiredSlotsMap?.[itemType] ?? [];
  return required.filter((slotKey) => !(claims ?? []).some((c) => claimCoversSlot(c, slotKey)));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// SLOT MARKER (2026-09-03, THIRD PASS). Every slot claim record-facts.mjs / record-facts-research.mjs
// emit — and every one STEP 3/SLOTS below writes for an existing item — opens `claim_text` with
// "[<slot_key>] ", the marker migrations 114/119/121 and migration 299's own self-check (criterion 5,
// mirrored above by claimCoversSlot) rely on to find slot coverage by literal substring. HEAL-2's
// RECLASSIFY (STEP E) re-kinded EVERY residue FACT claim to ANALYSIS with no awareness of this marker,
// which silently removed 28 slot claims from criterion 5's FACT/GAP coverage (missing_required_slot,
// measured on the HEAL-2 apply run, run 33797952379). See SLOT-REPAIR / STEP E below for the fix.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

const SLOT_MARKER_RE = /^\[([a-z0-9_]+)\]\s/i;

/** The slot_key a claim's own "[<slot_key>] " marker prefix names, or null when claim_text carries none.
 *  Pure. Matches the marker record-facts.mjs / record-facts-research.mjs / STEP 3 below all write. */
export function extractSlotKeyFromMarker(claimText) {
  const m = SLOT_MARKER_RE.exec(String(claimText ?? ""));
  return m ? m[1] : null;
}

/** True when `claimText` carries a "[<slot_key>] " marker AND that slot_key is a member of `itemType`'s
 *  OWN required-slots list (item-type-required-slots.json) — i.e. a claim criterion 5 actually depends
 *  on, as opposed to the identity claim's own "[title]" marker (never a required slot) or an unrelated
 *  bracketed prefix. Pure. */
export function isRequiredSlotMarkerClaim(claimText, itemType, requiredSlotsMap) {
  const slotKey = extractSlotKeyFromMarker(claimText);
  if (!slotKey) return false;
  return (requiredSlotsMap?.[itemType] ?? []).includes(slotKey);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// NORMALIZATION — position-preserving. Builds a normalized string alongside a map back to the ORIGINAL
// character index every normalized character came from, so a match found under normalization still
// yields a verbatim slice of the ORIGINAL captured text (never the normalized text itself — a normalized
// string is not what agent_run_searches.result_content holds, and criterion 3 checks the original).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

const CURLY_QUOTES = Object.freeze({
  "‘": "'", "’": "'", "‚": "'", "‛": "'", "′": "'",
  "“": '"', "”": '"', "„": '"', "‟": '"', "″": '"',
});
const SOFT_HYPHEN = "­";
const NAMED_ENTITIES = Object.freeze({
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  hellip: "…", mdash: "—", ndash: "–",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
});
const ENTITY_RE = /^&(#x[0-9a-f]+|#\d+|[a-z]+);/i;

function decodeEntityToken(token) {
  if (token[0] === "#") {
    const isHex = token[1] === "x" || token[1] === "X";
    const code = isHex ? parseInt(token.slice(2), 16) : parseInt(token.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : null;
  }
  return NAMED_ENTITIES[token.toLowerCase()] ?? null;
}

/**
 * Normalize `text`, returning `{ normalized, map }` where `map[i]` is the ORIGINAL string index the
 * character at `normalized[i]` came from (the first source index, for output collapsed from a run), and
 * `map[normalized.length]` is a sentinel (the original text's length) so an end-of-match boundary at the
 * very end of the normalized string still resolves. Transformations: HTML entities decoded to their
 * single character; soft hyphens (U+00AD) dropped; curly quotes folded to straight; any whitespace run
 * (including a decoded `&nbsp;`) collapsed to one space. Case is preserved — case-folding is a separate,
 * later fallback (see locateSpanInText), never conflated with this structural normalization. Pure.
 */
export function buildNormalizedIndex(text) {
  const s = String(text ?? "");
  let out = "";
  const map = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === "&") {
      const m = s.slice(i, i + 12).match(ENTITY_RE);
      if (m) {
        const decoded = decodeEntityToken(m[1]);
        if (decoded != null) {
          for (const ch of decoded) { out += ch; map.push(i); }
          i += m[0].length;
          continue;
        }
      }
    }
    const ch = s[i];
    if (ch === SOFT_HYPHEN) { i += 1; continue; }
    if (/\s/.test(ch)) {
      const start = i;
      while (i < s.length && /\s/.test(s[i])) i += 1;
      out += " ";
      map.push(start);
      continue;
    }
    out += CURLY_QUOTES[ch] ?? ch;
    map.push(i);
    i += 1;
  }
  map.push(s.length);
  return { normalized: out, map };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// NUMERIC-FORM TOLERANT NORMALIZATION (NINTH PASS, 2026-09-04, lane HEAL-8). See this file's header NINTH
// PASS section for the measured basis (60+ real token_not_in_page tokens sampled read-only via the
// Supabase MCP against the live `agent_run_searches`/`item_gate_a_state` for the 89 items still quarantined
// after run 33844146038). Every transform below is one MEASURED surface-form family from that sample, not
// a textbook guess: currency SYMBOL vs CODE (`€1,200` vs `EUR 1.200`), decimal vs thousands SEPARATOR
// (`1,200` / `1 200` / `1.200`, `35.5%` / `35,5 %`), superscript/subscript digits (`gCO₂`), and unicode dash
// variants. Composed ON TOP of `buildNormalizedIndex`'s own structural pass (whitespace/quotes/entities/
// soft-hyphen) so both layer correctly; position-preserving throughout — `buildNumericNormalizedIndex`'s own
// map still resolves to the ORIGINAL text's indices, so a match here still yields a byte-exact VERBATIM
// slice of the capture (ADR-016: only the SEARCH is tolerant, the stored span never is).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

const CURRENCY_SYMBOL_TO_CODE = Object.freeze({ "€": "eur", "$": "usd", "£": "gbp", "¥": "jpy" });
const SUPERSCRIPT_DIGIT = Object.freeze({ "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9" });
const SUBSCRIPT_DIGIT = Object.freeze({ "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9" });
const DASH_VARIANTS = new Set(["‐", "‑", "‒", "–", "—", "−"]);
const CURRENCY_CODES = new Set(["eur", "usd", "gbp", "jpy"]);

/** Pass 1: per-character folds (dash variants -> `-`, superscript/subscript digits -> plain digits,
 *  a currency SYMBOL -> its lowercase CODE, everything else lowercased) — position-preserving, `map[i]`
 *  is the original index the output character at `i` came from (a symbol->code expansion repeats the
 *  ONE original index across its 3 output characters, same convention `buildNormalizedIndex`'s own entity
 *  decode already uses). Pure. */
function numericPassOne(text) {
  const s = String(text ?? "");
  let out = "";
  const map = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (DASH_VARIANTS.has(ch)) { out += "-"; map.push(i); i += 1; continue; }
    if (SUPERSCRIPT_DIGIT[ch]) { out += SUPERSCRIPT_DIGIT[ch]; map.push(i); i += 1; continue; }
    if (SUBSCRIPT_DIGIT[ch]) { out += SUBSCRIPT_DIGIT[ch]; map.push(i); i += 1; continue; }
    if (CURRENCY_SYMBOL_TO_CODE[ch]) {
      for (const c of CURRENCY_SYMBOL_TO_CODE[ch]) { out += c; map.push(i); }
      i += 1;
      continue;
    }
    out += ch.toLowerCase();
    map.push(i);
    i += 1;
  }
  map.push(s.length);
  return { normalized: out, map };
}

/** Pass 2: drop a whitespace run immediately between a currency CODE and a following digit (so `EUR
 *  1.200` and `€1.200` both fold to `eur1.200`, matching adjacency on both sides), and between a complete
 *  numeral and a following `%` (the SAME %-spacing convention `gate-a-match.mjs`'s own `collapsePctSpace`
 *  already applies at the coverage-decision site — mirrored here, never re-derived, for the SEARCH site).
 *  Pure, position-preserving. */
function numericCollapseAdjacency(s, map) {
  let out = "";
  const outMap = [];
  let i = 0;
  while (i < s.length) {
    if (/\s/.test(s[i])) {
      let j = i;
      while (j < s.length && /\s/.test(s[j])) j += 1;
      const beforeIsCode = CURRENCY_CODES.has(out.slice(-3));
      const afterIsDigit = /\d/.test(s[j] ?? "");
      const afterIsPct = s[j] === "%";
      if ((beforeIsCode && afterIsDigit) || afterIsPct) { i = j; continue; }
      out += " ";
      outMap.push(map[i]);
      i = j;
      continue;
    }
    out += s[i];
    outMap.push(map[i]);
    i += 1;
  }
  outMap.push(map[s.length]);
  return { normalized: out, map: outMap };
}

const NUMERIC_RUN_RE = /\d(?:[., ]\d+)*/g;

/** Fold ONE numeric run's internal separators: a separator followed by EXACTLY 3 digits is a THOUSANDS
 *  grouping (dropped); any other separator is DECIMAL (folded to `.`) — the convention this lane's own
 *  measured sample pins (`1,200` / `1 200` / `1.200` all fold to `1200`; `35.5` / `35,5` both fold to
 *  `35.5`). Applied left to right, independently per separator (a well-formed number never disagrees with
 *  itself under this rule — see this section's header for the one deliberately-ambiguous case, `12.345`
 *  read as 12345 rather than 12.345, matching the measured examples). Pure, position-preserving. */
function foldNumericRun(run, origIndexOf) {
  const m = /^(\d+)((?:[., ]\d+)*)$/.exec(run);
  const lead = m[1];
  const rest = m[2];
  let out = lead;
  const outMap = [];
  for (let k = 0; k < lead.length; k++) outMap.push(origIndexOf(k));
  let pos = lead.length;
  const groupRe = /[., ](\d+)/g;
  let gm;
  while ((gm = groupRe.exec(rest))) {
    const digits = gm[1];
    const digitsStartPos = pos + 1;
    if (digits.length === 3) {
      for (let k = 0; k < digits.length; k++) outMap.push(origIndexOf(digitsStartPos + k));
      out += digits;
    } else {
      outMap.push(origIndexOf(pos));
      out += ".";
      for (let k = 0; k < digits.length; k++) outMap.push(origIndexOf(digitsStartPos + k));
      out += digits;
    }
    pos += 1 + digits.length;
  }
  return { text: out, map: outMap };
}

/** Pass 3: fold every numeric run's separators per `foldNumericRun`. Pure, position-preserving. */
function numericFoldSeparators(s1, map1) {
  let out = "";
  const map = [];
  let last = 0;
  NUMERIC_RUN_RE.lastIndex = 0;
  let m;
  while ((m = NUMERIC_RUN_RE.exec(s1))) {
    for (let k = last; k < m.index; k++) { out += s1[k]; map.push(map1[k]); }
    const folded = foldNumericRun(m[0], (k) => map1[m.index + k]);
    out += folded.text;
    for (const idx of folded.map) map.push(idx);
    last = m.index + m[0].length;
  }
  for (let k = last; k < s1.length; k++) { out += s1[k]; map.push(map1[k]); }
  map.push(map1[s1.length]);
  return { normalized: out, map };
}

/** Build the numeric-tolerant normalized form of `text` (composing the three passes above), returning
 *  `{ normalized, map }` in the SAME shape `buildNormalizedIndex` returns — `map[i]` is the ORIGINAL
 *  string index the output character at `i` came from. Pure. Exported for direct testing of every
 *  measured surface-form family; `locateSpanInText` is the only production caller. */
export function buildNumericNormalizedIndex(text) {
  const p1 = numericPassOne(text);
  const p2 = numericCollapseAdjacency(p1.normalized, p1.map);
  return numericFoldSeparators(p2.normalized, p2.map);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// CAPTURE-TEXT INDEX CACHE (TENTH PASS, 2026-09-04, lane HEAL-10). See this file's header TENTH PASS
// section for the measured basis. `locateSpanInTextCore` below rebuilds `buildNormalizedIndex`/
// `buildNumericNormalizedIndex` — each an O(n) pass over the FULL haystack — from scratch on EVERY call;
// GROUND/RESOURCE/STEP-SOURCE/ORPHANS each loop the SAME capture pool once per claim or per orphan TOKEN,
// so one item's own captures were re-normalized once per (claim-or-token × capture) pair. Measured live
// (read-only SQL, 2026-09-04, project kwrsbpiseruzbfwjpvsp): item 15f63ea9-4803-4bb4-b1a3-9ccdeb8a3050 (one
// of run #31's 15 processed items) carries 32 captures totalling 2,833,138 chars (one row alone 927,954
// chars) and 10 Gate-A orphan tokens — STEP SOURCE's own pre-check (`planOrphanGrounding`, once per orphan)
// plus STEP C's own fresh scan (`planOrphanGrounding` again on every orphan STEP SOURCE did not resolve)
// each loop that capture pool over EVERY orphan token, rebuilding the normalized index of the SAME captures
// from scratch on every pass. `buildCaptureIndex(text)` computes the structural-normalized index, the
// numeric-tolerant index, and both lowercased forms ONCE; `getCaptureIndex(capture, cache)` memoizes it in
// `cache` (a plain `Map`, keyed by `capture.id` — the same DI/DRY convention `citedUrlCache` already uses)
// so a capture re-checked for a second claim or token, in this item OR — since the cache is threaded
// RUN-wide, see `healOneItem`'s own `captureIndexCache` option — a LATER item citing the same corpus-pool
// row, is normalized exactly once per run. `locateSpanInTextIndexed`/`locateSpanInTextCached` are the
// index-aware counterparts of `locateSpanInTextCore`/`locateSpanInText` below; `locateSpanInText` itself is
// UNCHANGED in signature and behavior (every existing caller/test), rebuilt internally on `buildCaptureIndex`
// so the two paths can never drift — and, as a side effect, no longer rebuilds the SAME haystack's index
// TWICE within one call (the pre-existing primary-attempt + trailing-punctuation-retry sequence now shares
// one index, halving cost for every call site even where no cache is threaded at all).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/** Precompute a capture's structural-normalized index, numeric-tolerant index, and both lowercased forms
 *  (raw + structural) ONCE. Pure. `lower` matches what `containsCaseInsensitive`'s own `.toLowerCase()`
 *  would produce; `structuralLower` matches `locateSpanInTextCore`'s own `normalized_ci` tier. */
export function buildCaptureIndex(text) {
  const hay = String(text ?? "");
  const structural = buildNormalizedIndex(hay);
  return {
    text: hay,
    lower: hay.toLowerCase(),
    structural,
    structuralLower: structural.normalized.toLowerCase(),
    numeric: buildNumericNormalizedIndex(hay),
  };
}

/** `buildCaptureIndex(capture.result_content)`, memoized in `cache` by `capture.id`. Pure given a stable
 *  `cache`. Falls back to an uncached build when `capture` carries no `id` (never happens for any real row
 *  this file reads — every `select` this module's deps use projects `id` — but never assumed). `cache`
 *  defaults to a fresh, call-scoped Map, so any DIRECT caller that omits it gets a correct, merely
 *  non-shared, result — never a behavior change, only a caching opportunity not taken. */
export function getCaptureIndex(capture, cache = new Map()) {
  const id = capture?.id;
  if (id == null) return buildCaptureIndex(capture?.result_content);
  let idx = cache.get(id);
  if (!idx) {
    idx = buildCaptureIndex(capture.result_content);
    cache.set(id, idx);
  }
  return idx;
}

/** `containsCaseInsensitive(capture.result_content, needle)`, via a precomputed/cached index — same
 *  output, no re-`.toLowerCase()` of a haystack this run has already indexed. Pure given a stable `cache`. */
export function containsCaseInsensitiveCached(capture, needle, cache = new Map()) {
  const n = String(needle ?? "").trim();
  if (!n) return false;
  const idx = getCaptureIndex(capture, cache);
  if (!idx.text) return false;
  return idx.lower.includes(n.toLowerCase());
}

/** Core of `locateSpanInText` — exact, then structural-normalized, then structural-normalized
 *  case-insensitive, then (only when `needleTrim` carries a digit — a no-op skip for prose, since none of
 *  these transforms touch non-numeric text) numeric-tolerant. Pure, no trailing-punctuation retry (the
 *  caller owns that). Takes a PREBUILT `index` (buildCaptureIndex's own shape) rather than raw text — every
 *  caller below builds or fetches one; there is no other production caller. */
function locateSpanInTextCore(needleTrim, index) {
  const hay = index.text;
  const litIdx = hay.indexOf(needleTrim);
  if (litIdx !== -1) return { span: hay.slice(litIdx, litIdx + needleTrim.length), method: "exact" };

  const { normalized: hayNorm, map } = index.structural;
  const { normalized: needleNorm } = buildNormalizedIndex(needleTrim);
  if (needleNorm) {
    let idx = hayNorm.indexOf(needleNorm);
    let method = "normalized";
    if (idx === -1) {
      idx = index.structuralLower.indexOf(needleNorm.toLowerCase());
      method = "normalized_ci";
    }
    if (idx !== -1) {
      const origStart = map[idx];
      const origEnd = map[idx + needleNorm.length];
      if (origStart != null && origEnd != null && origEnd > origStart) {
        const span = hay.slice(origStart, origEnd).trim();
        if (span) return { span, method };
      }
    }
  }

  if (/\d/.test(needleTrim)) {
    const { normalized: hayNum, map: numMap } = index.numeric;
    const { normalized: needleNum } = buildNumericNormalizedIndex(needleTrim);
    if (needleNum) {
      const idx = hayNum.indexOf(needleNum);
      if (idx !== -1) {
        const origStart = numMap[idx];
        const origEnd = numMap[idx + needleNum.length];
        if (origStart != null && origEnd != null && origEnd > origStart) {
          const span = hay.slice(origStart, origEnd).trim();
          if (span) return { span, method: "numeric_tolerant" };
        }
      }
    }
  }

  return null;
}

// Trailing punctuation a token's OWN extraction context bakes in that is never part of the figure/date
// itself — measured defect (NINTH PASS): gate-a-scan.mjs's own `figureTokens` regex (`\d[\d.,]*`, a mint
// GOVERNING FILE this lane does not edit) greedily consumes the BRIEF's own sentence-ending punctuation
// immediately after a number ("...a late fee of $44,836." -> token "$44,836."), so the orphan token this
// file receives sometimes carries punctuation the SOURCE page's own sentence never had at that position.
// Retried ONLY after every tier above has already failed on the untouched needle — never tried first, so a
// needle whose trailing punctuation genuinely IS part of the source text is never weakened.
const TRAILING_PUNCT_RE = /[.,;:)\]}]+$/;

/** Index-aware core of `locateSpanInText`/`locateSpanInTextCached`: the primary attempt, then (only if it
 *  failed) the trailing-punctuation-stripped retry — both against the SAME prebuilt `index`, so a single
 *  call never rebuilds a haystack's normalized form twice (the pre-TENTH-PASS shape of `locateSpanInText`
 *  did exactly that, for every call, cache or no cache — see this section's own header). Pure given a
 *  stable `index`. */
export function locateSpanInTextIndexed(needleTrim, index) {
  const found = locateSpanInTextCore(needleTrim, index);
  if (found) return found;
  const stripped = needleTrim.replace(TRAILING_PUNCT_RE, "");
  if (stripped && stripped !== needleTrim) {
    return locateSpanInTextCore(stripped, index);
  }
  return null;
}

/**
 * Locate `needle` inside `haystackText`: exact literal substring first (the common, cheap case), then a
 * structural-normalized match, then a structural-normalized CASE-INSENSITIVE fallback, then (needle
 * carries a digit) a NUMERIC-FORM-TOLERANT match (decimal/thousands separators, currency symbol vs code,
 * super/subscript digits, dash variants — see `buildNumericNormalizedIndex`'s own header), then — only if
 * every tier above still failed — the same four tiers again against the needle with its own trailing
 * sentence punctuation stripped. Returns `{ span, method }` — `span` is a VERBATIM slice of the ORIGINAL
 * `haystackText` (never a normalized form), `method` one of `"exact" | "normalized" | "normalized_ci" |
 * "numeric_tolerant"`. Returns null when no tier locates it. Pure. Builds a fresh, call-scoped
 * `buildCaptureIndex` every call (unchanged cost/behavior for a ONE-OFF lookup against a plain string) —
 * a caller checking the SAME haystack repeatedly (this file's own capture-pool loops) should use
 * `locateSpanInTextCached` instead, which memoizes the index by capture id. See this section's own header.
 */
export function locateSpanInText(needle, haystackText) {
  const needleTrim = String(needle ?? "").trim();
  const hay = String(haystackText ?? "");
  if (!needleTrim || !hay) return null;
  return locateSpanInTextIndexed(needleTrim, buildCaptureIndex(hay));
}

/** `locateSpanInText(needle, capture.result_content)`, via `getCaptureIndex`'s own per-`cache` memoization
 *  — the SAME capture re-checked for a second token/claim (this item, or per `healOneItem`'s own
 *  `captureIndexCache` option, a later item in the same run) is normalized ONCE. Pure given a stable
 *  `cache`. `cache` defaults to a fresh, call-scoped Map — a direct caller that omits it is byte-identical
 *  in OUTPUT to `locateSpanInText(needle, capture.result_content)`, only without the cross-call reuse. */
export function locateSpanInTextCached(needle, capture, cache = new Map()) {
  const needleTrim = String(needle ?? "").trim();
  if (!needleTrim || !capture?.result_content) return null;
  return locateSpanInTextIndexed(needleTrim, getCaptureIndex(capture, cache));
}

/** The exact criterion-3 test (migration 218's restored shape): does `haystack` contain `needle` as a
 *  case-insensitive, btrim'd literal substring? Pure. Used to check whether a claim is ALREADY grounded
 *  against a (possibly newly captured) source before attempting to heal it. */
export function containsCaseInsensitive(haystack, needle) {
  const n = String(needle ?? "").trim();
  if (!haystack || !n) return false;
  return String(haystack).toLowerCase().includes(n.toLowerCase());
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// FUZZY FALLBACK — Dice coefficient over character bigrams. REPORTING ONLY: a fuzzy match is never
// written as a source_span (only locateSpanInText's verbatim result ever is).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

function bigramCounts(s) {
  const t = String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  const counts = new Map();
  for (let i = 0; i < t.length - 1; i++) {
    const bg = t.slice(i, i + 2);
    counts.set(bg, (counts.get(bg) ?? 0) + 1);
  }
  return counts;
}

/** Dice coefficient (0..1) between two strings' character-bigram multisets. Pure. 0 for a string with
 *  fewer than 2 characters on either side (no bigrams to compare). */
export function diceCoefficient(a, b) {
  const A = bigramCounts(a);
  const B = bigramCounts(b);
  let totalA = 0, totalB = 0, overlap = 0;
  for (const v of A.values()) totalA += v;
  for (const v of B.values()) totalB += v;
  if (totalA + totalB === 0) return 0;
  for (const [bg, ca] of A) {
    const cb = B.get(bg);
    if (cb) overlap += Math.min(ca, cb);
  }
  return (2 * overlap) / (totalA + totalB);
}

const FUZZY_MAX_WINDOWS = 5000;

/** Slide a `needle`-length (or 20-char minimum) window across `haystackText`, scoring each by Dice
 *  coefficient, and return the best `{ score, window, start, end }` — or null for an empty needle/haystack.
 *  Pure, bounded: the stride grows with haystack length so a multi-MB capture (ADR-016) never runs more
 *  than ~FUZZY_MAX_WINDOWS scoring passes. Reporting only — see this section's header. */
export function findClosestFuzzyMatch(needle, haystackText) {
  const n = String(needle ?? "").trim();
  const hay = String(haystackText ?? "");
  if (!n || !hay) return null;
  const winLen = Math.max(20, n.length);
  const stride = Math.max(15, Math.ceil(hay.length / FUZZY_MAX_WINDOWS));
  let best = null;
  for (let start = 0; start < hay.length; start += stride) {
    const window = hay.slice(start, start + winLen);
    if (!window) break;
    const score = diceCoefficient(n, window);
    if (!best || score > best.score) best = { score, window, start, end: start + window.length };
  }
  return best;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// STEP 1 — CAPTURE. Per-family resolution imported from export-census-rows.mjs, unmodified. "Plain GET
// otherwise" is this file's own minimal wrap of that module's exported captureDocument (a >200-char
// usability threshold, the same one buildExportRow / resolveRowCapture already apply) — never a
// re-derivation of the Cellar/FR logic itself.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/** True when NONE of an item's existing capture rows carry >200 trimmed chars of result_content — the
 *  same usability floor export-census-rows.mjs's buildExportRow uses. Pure. */
export function needsCapture(captures) {
  return !(captures ?? []).some((c) => String(c?.result_content ?? "").trim().length > 200);
}

/** The URL to capture for `item`: its own source_url, else the caller-resolved source-registry URL
 *  fallback (dispatch: "has a source_url (or sources row url)"). Pure. */
export function resolveCaptureUrl(item, sourceUrlFallback) {
  return item?.source_url || sourceUrlFallback || null;
}

/** Reduce a plain captureDocument() result to the same usable/evidence envelope shape resolveRowCapture's
 *  per-family branches return, for the "plain GET otherwise" family (a host none of eurlex/federal_register
 *  claims). Pure over its input (the network call already happened in the caller). */
export function envelopeFromPlainGet(res, endpoint) {
  const text = res.text ?? "";
  const usable = !!(res.ok && text.trim().length > 200);
  return {
    usable,
    status: res.status,
    bytes: Buffer.byteLength(res.html ?? "", "utf8"),
    head: text.slice(0, 300),
    endpoint,
    text: usable ? text : null,
    // RAW html, never stored (agent_run_searches.result_content is always the STRIPPED text — ADR-016's
    // own stored field), carried only as far as this run's in-memory outcome so STEP SOURCE's one-hop
    // follow (NINTH PASS, lane HEAL-8 — see that section's header) can extract this page's OWN <a href>
    // links before the raw markup is discarded. Null when unusable (nothing worth linking off of).
    html: usable ? (res.html ?? null) : null,
    title: null,
    error: res.error,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// OJ-REFERENCE RESOLUTION (FIFTH PASS, 2026-09-04). `deriveKey` (migration 255's own mirror, imported
// above, never edited here) resolves a CELEX act reference or an ELI act path — it correctly returns null
// for an Official Journal ISSUE reference (`uri=OJ:L_202500040` and its two sibling shapes below), because
// an OJ issue is not an act and was never in that function's vocabulary. This section resolves ONLY that
// gap, entirely in this file, using `captureDocument` directly (never `resolveRowCapture`, which has no
// `oj` branch — adding one there would be editing a governing file this lane's header forbids).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

// Three cited-URL shapes, all named in the dispatch: `JOL_2025_040_R` (already Cellar-ID-shaped, edition
// letter explicit — `JOC` for the C series), `L_2025_040` (underscore year/issue), `L_202500040`
// (concatenated year+issue, no separator). Order matters: the JO-prefixed form is tried first so it is
// never mis-read by the concatenated form's looser digit run.
const OJ_JO_PREFIXED_RE = /^OJ:(JO[LC])_(\d{4})_(\d{1,5})(?:_([A-Za-z]))?$/i;
const OJ_UNDERSCORE_RE = /^OJ:([LC])_(\d{4})_(\d{1,5})$/i;
const OJ_CONCAT_RE = /^OJ:([LC])_(\d{4})(\d{1,5})$/i;

/** The `uri` query-parameter value off an eur-lex.europa.eu URL, `decodeURIComponent`d. Pure past the one
 *  `new URL` parse; falls back to a literal regex for a relative/malformed URL `new URL` cannot parse (the
 *  same defensive posture `resolveCaptureUrl`'s callers already assume elsewhere in this file). Null when
 *  no `uri=` parameter is present at all. */
function ojUriParam(url) {
  const s = String(url ?? "");
  try {
    const raw = new URL(s).searchParams.get("uri");
    if (raw) return raw;
  } catch {
    // fall through — a relative or otherwise unparseable url still gets the literal-regex attempt below
  }
  const m = s.match(/[?&]uri=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Parse an eur-lex `uri=OJ:...` query value into `{ series: "L"|"C", year, issue (5-digit, zero-padded),
 *  edition: "R"|"C"|null }` — `edition` is the citation's OWN explicit letter (the JO-prefixed form only),
 *  null when the citation carries none and the resolver must guess (see `resolveOjReference`). Returns
 *  null for a `uri=` value matching none of the three OJ-issue shapes (a CELEX/ELI act reference, or
 *  anything else) — `captureItem`/`captureCitedUrl` fall back to the existing `canonical_key_unresolved`
 *  hold in that case, UNCHANGED. Pure. */
export function parseOjReference(url) {
  const uri = ojUriParam(url);
  if (!uri) return null;

  let m = OJ_JO_PREFIXED_RE.exec(uri);
  if (m) {
    return {
      series: m[1].toUpperCase() === "JOL" ? "L" : "C",
      year: m[2],
      issue: m[3].padStart(5, "0"),
      edition: m[4] ? m[4].toUpperCase() : null,
    };
  }
  m = OJ_UNDERSCORE_RE.exec(uri);
  if (m) return { series: m[1].toUpperCase(), year: m[2], issue: m[3].padStart(5, "0"), edition: null };
  m = OJ_CONCAT_RE.exec(uri);
  if (m) return { series: m[1].toUpperCase(), year: m[2], issue: m[3].padStart(5, "0"), edition: null };
  return null;
}

/** The Publications Office's own OJ-issue resource URL for one `{series,year,issue}` + edition letter —
 *  the exact shape the dispatch names (`.../resource/oj/JOL_2025_040_R`). Pure. NOT independently
 *  confirmed live this session (this lane's egress is denied to publications.europa.eu — see this file's
 *  FIFTH PASS header); [HYPOTHESIS], sourced from the dispatch's own text. */
export function cellarEndpointForOj({ series, year, issue }, edition) {
  const prefix = series === "L" ? "JOL" : "JOC";
  return `https://publications.europa.eu/resource/oj/${prefix}_${year}_${issue}_${edition}`;
}

/**
 * Resolve one parsed OJ reference to captured text. An explicit edition (the citation's own JO-prefixed
 * letter) is tried alone; an inferred one tries the series' own natural edition first (`R` for L, `C` for
 * C) then the OTHER letter as a second guess — both attempts recorded in `evidence.attempts` either way,
 * so a reader sees every endpoint tried, not just the last. Never chained to the Wayback fallback below: a
 * wrong-shaped Cellar request failing is not evidence the PUBLISHER blocked anything, so an archive copy
 * of what may be the wrong resource id would not be honest evidence of a captured source — the precise
 * `oj_reference_no_cellar_path` hold, naming every attempt, is this pass's honest end state for this
 * branch (mirrors this file's own header doctrine: a refusal that names its own limits is not a defect).
 */
async function resolveOjReference(ref, citedUrl, deps) {
  const editions = ref.edition ? [ref.edition] : ref.series === "L" ? ["R", "C"] : ["C", "R"];
  const attempts = [];
  for (const edition of editions) {
    const endpoint = cellarEndpointForOj(ref, edition);
    const res = await captureDocument(endpoint, { fetchImpl: followUpgradingRedirects(deps.fetchImpl) });
    const env = envelopeFromPlainGet(res, endpoint);
    attempts.push({ endpoint, status: env.status ?? null, bytes: env.bytes ?? 0, head: env.head ?? "" });
    if (env.usable) {
      return {
        status: "captured",
        url: endpoint,
        text: env.text,
        title: null,
        evidence: { status: env.status ?? null, bytes: env.bytes ?? 0, endpoint, oj: ref },
      };
    }
  }
  return { status: "held", reason: "oj_reference_no_cellar_path", url: citedUrl, evidence: { oj: ref, attempts } };
}

/** eur-lex.europa.eu resolution shared by `captureItem` and `captureCitedUrl`: try the CELEX/ELI key
 *  first (unchanged from before this pass — `resolveRowCapture`'s Cellar-then-EUR-Lex chain, run through
 *  the archive fallback like every other family below); when no key resolves, try the NEW OJ-issue
 *  parse/resolve above; when NEITHER resolves, the existing `canonical_key_unresolved` hold, unchanged. */
async function resolveEurlexCapture(url, canonicalKey, deps) {
  if (canonicalKey) {
    const env = await resolveRowCapture({ document_url: url }, { scheme: "celex", canonicalKey }, { fetchImpl: deps.fetchImpl });
    return envelopeToOutcomeWithArchive(env, url, deps);
  }
  const ojRef = parseOjReference(url);
  if (!ojRef) return { status: "held", reason: "canonical_key_unresolved", url };
  return resolveOjReference(ojRef, url, deps);
}

/**
 * Capture one item's missing grounding, live. Resolves the per-family identity from the URL's host
 * (`classifyHost`, imported), then defers to `resolveRowCapture` (Cellar-first / FR-API — imported,
 * unmodified) for eurlex/federal_register, or a plain polite GET otherwise. Returns
 * `{ status: "captured", url, text, title, evidence }` or `{ status: "held", reason, url?, evidence? }` —
 * a refusal is ALWAYS returned with evidence, never thrown past this function. A `capture_blocked` or
 * `capture_thin` refusal (any family) now tries the Wayback archive fallback before giving up — see this
 * file's FIFTH PASS header.
 * @param {{fetchImpl: Function}} deps
 */
export async function captureItem(item, url, deps) {
  if (!url) return { status: "held", reason: "no_source_url" };
  const host = classifyHost(url);

  if (host === "eurlex") {
    const canonicalKey = item.canonical_instrument_key || deriveKey(item.instrument_identifier ?? null, url);
    return resolveEurlexCapture(url, canonicalKey, deps);
  }

  if (host === "federal_register") {
    const frDocumentNumber = extractFrDocumentNumber(url);
    if (!frDocumentNumber) return { status: "held", reason: "fr_document_number_unresolved", url };
    const env = await resolveRowCapture({ document_url: url }, { scheme: "federal_register", frDocumentNumber }, { fetchImpl: deps.fetchImpl });
    return envelopeToOutcomeWithArchive(env, url, deps);
  }

  const res = await captureDocument(url, { fetchImpl: deps.fetchImpl });
  const env = envelopeFromPlainGet(res, url);
  return envelopeToOutcomeWithArchive(env, url, deps);
}

/** Which unusable-envelope reason applies: an HTTP response actually reached (2xx, no fetch error) but
 *  the extracted text fell short of the >200-char usability floor is `capture_thin` (FIFTH PASS split,
 *  2026-09-04 — was folded into `capture_blocked` before this pass, indistinguishable from a bot gate);
 *  anything else unusable (non-2xx, a thrown fetch error, a timeout) is `capture_blocked`, unchanged.
 *  `no_capture_path` (the EUR-Lex-own-known-bot-gate case, tagged by `resolveRowCapture` itself) still
 *  takes priority over both — that classification is more specific and this pass does not weaken it. Pure. */
function classifyUnusableReason(env) {
  if (env.noCapturePath) return "no_capture_path";
  const status = env.status;
  const httpOk = typeof status === "number" && status >= 200 && status < 300;
  if (httpOk && !env.error) return "capture_thin";
  return "capture_blocked";
}

function envelopeToOutcome(env, url) {
  if (!env.usable) {
    return {
      status: "held",
      reason: classifyUnusableReason(env),
      url,
      evidence: { status: env.status ?? null, bytes: env.bytes ?? 0, head: env.head ?? "", endpoint: env.endpoint ?? null, error: env.error ?? null },
    };
  }
  return {
    status: "captured",
    url: env.endpoint ?? url,
    text: env.text,
    title: env.title ?? null,
    // Propagated only as far as this run's in-memory outcome (never stored — see envelopeFromPlainGet's
    // own note); null for a PDF-shaped or non-HTML envelope, which never sets it.
    html: env.html ?? null,
    evidence: { status: env.status ?? null, bytes: env.bytes ?? 0, endpoint: env.endpoint ?? null },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// ARCHIVE (WAYBACK) FALLBACK (FIFTH PASS, 2026-09-04). The single choke point every capture family funnels
// a `capture_blocked`/`capture_thin` refusal through before giving up — see this file's FIFTH PASS header
// for the full doctrine. Pure parsers first (testable with zero I/O), then the two async orchestrators.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/** The Wayback availability API's own URL for one cited url. Pure. */
export function waybackAvailabilityUrl(citedUrl) {
  return `https://archive.org/wayback/available?url=${encodeURIComponent(String(citedUrl ?? ""))}`;
}

/** Parse the Wayback availability API's JSON body into `{ timestamp, snapshotUrl }`, or null when no
 *  snapshot is listed as available (an absent `archived_snapshots.closest`, or one whose own `available`
 *  flag is not `true` — the API's own documented shape for "nothing archived"). Pure, defensive against a
 *  malformed/partial body (never throws — returns null instead, same posture as `locateSpanInText`). */
export function parseWaybackAvailability(json) {
  const snap = json?.archived_snapshots?.closest;
  if (!snap || snap.available !== true || !snap.timestamp || !snap.url) return null;
  return { timestamp: String(snap.timestamp), snapshotUrl: String(snap.url) };
}

/** The Wayback `id_` raw-bytes replay URL for one timestamp + original url — returns the original page
 *  bytes with no Wayback toolbar HTML injected (the flag this file's FIFTH PASS header names). Pure. */
export function waybackSnapshotFetchUrl(timestamp, citedUrl) {
  return `https://web.archive.org/web/${timestamp}id_/${citedUrl}`;
}

/** Query the Wayback availability API for one cited url. Never throws — a fetch failure or unparseable
 *  body comes back as `{ ok: false, error }`, exactly this module's existing "refusal always returns
 *  evidence" posture. */
async function fetchWaybackAvailability(citedUrl, fetchImpl) {
  try {
    const res = await fetchImpl(waybackAvailabilityUrl(citedUrl), {
      headers: { "user-agent": "FSI-population-turn/1.0 (+population-turn)", accept: "application/json" },
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const body = typeof res.text === "function" ? await res.text() : JSON.stringify(await res.json());
    const json = JSON.parse(body);
    return { ok: true, snapshot: parseWaybackAvailability(json) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * The archive fallback for one cited url whose direct capture already failed. Queries Wayback
 * availability; on a snapshot, fetches its `id_` raw bytes and runs them through the SAME extraction the
 * direct path uses (HTML via `captureDocument`'s own `stripHtmlToText`, or `pdf-extract.mjs`'s `pdfToText`
 * for a PDF-shaped cited url — build item 4, the SAME `looksLikePdfUrl`/`fetchBytesForPdf`/`isPdfBytes`
 * chain `captureCitedUrl`'s own direct PDF branch already uses). `result_url` (the `url` field a caller
 * records as where the text came from) STAYS `citedUrl` — never the snapshot url — per this file's FIFTH
 * PASS doctrine point: the archive is transport, never a source. No snapshot, or the snapshot itself fails
 * extraction: held `capture_blocked_no_archive` / `capture_thin_no_archive` (matching the ORIGINAL direct
 * failure's own class), `evidence.direct` naming the direct attempt and `evidence.archive*` naming this
 * attempt — the direct evidence is NEVER dropped just because a second attempt was also made.
 */
async function tryArchiveFallback(citedUrl, directReason, directEvidence, deps) {
  const noArchiveReason = directReason === "capture_thin" ? "capture_thin_no_archive" : "capture_blocked_no_archive";
  const avail = await fetchWaybackAvailability(citedUrl, deps.fetchImpl);
  if (!avail.ok || !avail.snapshot) {
    return {
      status: "held",
      reason: noArchiveReason,
      url: citedUrl,
      evidence: { direct: directEvidence, archive_availability: avail.ok ? { snapshot: null } : { error: avail.error } },
    };
  }
  const { timestamp, snapshotUrl } = avail.snapshot;
  const fetchUrl = waybackSnapshotFetchUrl(timestamp, citedUrl);
  const archiveAvailability = { timestamp, snapshot_url: snapshotUrl };

  if (looksLikePdfUrl(citedUrl)) {
    const fetched = await fetchBytesForPdf(fetchUrl, deps.fetchImpl);
    if (!fetched.ok || !fetched.bytes || !isPdfBytes(fetched.bytes)) {
      return {
        status: "held",
        reason: noArchiveReason,
        url: citedUrl,
        evidence: { direct: directEvidence, archive_availability: archiveAvailability, archive_error: fetched.error ?? "archived body is not PDF-magic-byte-prefixed" },
      };
    }
    try {
      const { text, fullLength } = await pdfToText(fetched.bytes, PDF_TEXT_MAX_CHARS);
      return {
        status: "captured",
        url: citedUrl,
        text,
        title: null,
        evidence: {
          status: fetched.status, bytes: fetched.bytes.length, endpoint: fetchUrl, pdf: true, full_length: fullLength,
          transport: "wayback", snapshot_timestamp: timestamp,
        },
      };
    } catch (err) {
      return {
        status: "held",
        reason: noArchiveReason,
        url: citedUrl,
        evidence: { direct: directEvidence, archive_availability: archiveAvailability, archive_error: err instanceof Error ? err.message : String(err) },
      };
    }
  }

  const res = await captureDocument(fetchUrl, { fetchImpl: deps.fetchImpl });
  const env = envelopeFromPlainGet(res, fetchUrl);
  if (!env.usable) {
    return {
      status: "held",
      reason: noArchiveReason,
      url: citedUrl,
      evidence: { direct: directEvidence, archive_availability: archiveAvailability, archive: { status: env.status, bytes: env.bytes, head: env.head, error: env.error } },
    };
  }
  return {
    status: "captured",
    url: citedUrl,
    text: env.text,
    title: env.title ?? null,
    html: env.html ?? null,
    evidence: { status: env.status ?? null, bytes: env.bytes ?? 0, endpoint: fetchUrl, transport: "wayback", snapshot_timestamp: timestamp },
  };
}

/** `envelopeToOutcome`, extended: on a `capture_blocked`/`capture_thin` hold, try the archive fallback
 *  before returning. Every other outcome (captured, `no_capture_path`, or a caller's own pre-fetch hold
 *  like `canonical_key_unresolved`) passes through unchanged — the archive is only ever tried for "the
 *  publisher's own text was reachable in principle but this exact request didn't get it," never for a
 *  request this module already knows cannot be built. */
async function envelopeToOutcomeWithArchive(env, url, deps) {
  const base = envelopeToOutcome(env, url);
  if (base.status === "held" && (base.reason === "capture_blocked" || base.reason === "capture_thin")) {
    return tryArchiveFallback(url, base.reason, base.evidence, deps);
  }
  return base;
}

/** agent_run_searches INSERT row for a fresh HEAL capture (migration 112 / write-item.ts's own shape).
 *  `result_content` is the FULL captured text, never truncated (ADR-016). Pure. `searchQuery` defaults to
 *  STEP 1's own label; CAPTURE-CITED (third pass) passes "heal-provenance:capture-cited" so the two
 *  capture origins stay distinguishable in agent_run_searches without a schema change. */
export function buildCaptureSearchRow(itemId, captureResult, nowIso = new Date().toISOString(), searchQuery = "heal-provenance:capture") {
  return {
    intelligence_item_id: itemId,
    search_query: searchQuery,
    result_url: captureResult.url,
    result_title: captureResult.title ?? null,
    result_index: 0,
    result_content: captureResult.text,
    searched_at: nowIso,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// CAPTURE-CITED (2026-09-03, THIRD PASS). STEP 1's CAPTURE only fetches when an item has NO usable
// capture at all (`needsCapture`) — an item with one thin/incomplete capture never gets its OTHER cited
// sources fetched, so a claim or Gate-A orphan citing a second URL the item's own prose or claims already
// name has nothing to ground against, and criterion 2's own `ungrounded_url` failure (a URL literally
// present in a section's content_md with no matching agent_run_searches/source/registry row) never
// closes. This step runs BEFORE RESOURCE/ORPHANS (broadening their own capture pool — see healOneItem)
// and fetches every URL the item ALREADY CITES that this item has not yet captured:
//   - URLs literally present in the item's own sections' content_md — the SAME parenthesis-balanced
//     URL_RE validate-mint-payload.mjs's criterion 2 uses, mirrored verbatim (see this file's header
//     precedent for governing regex constants: claimCoversSlot/ANALYSIS_LABEL_RE/etc.).
//   - `intelligence_items.source_urls` — NAMED in the brief as a third source, but grep-confirmed ABSENT:
//     no such column or array exists anywhere in supabase/migrations (2026-09-03). Never read here; see
//     this lane's report for the correction.
//   - each claim's own registered source URL. A claim carries no `source_url` column of its own
//     (migration 112's section_claim_provenance only has `source_id`) — resolved through `sourcesIndex`
//     (the SAME registry read STEP A/B already build once per run), never a second lookup.
// Already-captured URLs (canonicalized against the item's CURRENT `captures` pool, including whatever
// STEP 1 just added this same run) are skipped. Bounded to CAPTURE_CITED_MAX_PER_ITEM fetches per item
// per run — a run with more candidates than the bound fetches the first N and reports the overflow,
// never fetches unboundedly. Per-family resolution is the SAME captureItem/resolveRowCapture chain STEP 1
// uses (Cellar-first/FR-API/plain-GET, imported unmodified), generalized to an ARBITRARY cited url (the
// eurlex branch derives its canonical key from the URL ITSELF via `deriveKey(null, url)`, never from
// `item.instrument_identifier` — a citation may name a wholly different instrument than the item's own,
// and keying off the item's identifier would resolve the WRONG document), plus a PDF branch the "plain
// GET otherwise" family has never had (see this file's pdf-extract.mjs import note above). $0, politeness
// enforced by the ONE shared `deps.fetchImpl` every capture call in this module already goes through (the
// MAINT wrapper wires a single `makePoliteFetch` instance for the whole run — see provenance-heal.mjs).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

export const CAPTURE_CITED_MAX_PER_ITEM = 25;
// criterion 2's own URL_RE (validate-mint-payload.mjs), mirrored verbatim -- one-level balanced
// parentheses so an OJ identifier "(01)" extracts whole while a URL in prose parentheses stops correctly.
const CITED_URL_RE = /https?:\/\/(?:[^\s()\]}"'<>]|\([^\s()]*\))+/g;
// ADR-016's own STORAGE_MAX_CHARS default -- a pathological-page SANITY ceiling, never an operating cap
// (the pdf-extract.mjs `max` parameter is mandatory; this is the same "uncapped in practice" value ADR-016
// names, not a re-introduction of a capture-time cap).
const PDF_TEXT_MAX_CHARS = 10_000_000;

/** Every URL the item's sections/claims already cite: literal URLs in each section's content_md, plus
 *  each claim's registered source URL (resolved via source_id -> sourcesIndex, since a claim carries no
 *  source_url column of its own). Deduplicated, order-preserving. Pure. */
export function collectCitedUrls({ sections, claims, sourcesIndex }) {
  const urls = [];
  const seen = new Set();
  const push = (u) => {
    const trimmed = String(u ?? "").trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    urls.push(trimmed);
  };
  for (const s of sections ?? []) {
    for (const m of String(s?.content_md ?? "").matchAll(CITED_URL_RE)) push(m[0]);
  }
  for (const c of claims ?? []) {
    if (!c?.source_id) continue;
    const src = sourcesIndex?.byId?.get(c.source_id);
    if (src?.url) push(src.url);
  }
  return urls;
}

/** Which of `candidateUrls` are NOT already represented (canonicalized) among `captures`' own result_url.
 *  Deduplicated by canonical form. Pure. */
export function unfetchedCitedUrls(candidateUrls, captures) {
  const already = new Set(
    (captures ?? []).map((c) => (c.result_url ? canonicalizeCitationUrl(c.result_url) : null)).filter(Boolean),
  );
  const seen = new Set();
  const out = [];
  for (const u of candidateUrls ?? []) {
    const canon = canonicalizeCitationUrl(u);
    if (!canon || already.has(canon) || seen.has(canon)) continue;
    seen.add(canon);
    out.push(u);
  }
  return out;
}

/** Fetch `url`'s raw bytes (never `.text()`, which mangles binary PDF content) for the PDF codec branch.
 *  Same timeout/user-agent posture as export-census-rows.mjs's own captureDocument. Never throws. */
async function fetchBytesForPdf(url, fetchImpl, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      headers: { "user-agent": "FSI-population-turn/1.0 (+population-turn)", accept: "application/pdf,*/*;q=0.8" },
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, status: res.status, bytes: null, error: `HTTP ${res.status}` };
    if (typeof res.arrayBuffer !== "function") return { ok: false, status: res.status, bytes: null, error: "fetch response has no arrayBuffer()" };
    const buf = await res.arrayBuffer();
    return { ok: true, status: res.status, bytes: new Uint8Array(buf), error: null };
  } catch (err) {
    return { ok: false, status: null, bytes: null, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Capture ONE cited URL, live — the SAME per-family resolution captureItem uses (Cellar-first for eurlex,
 * FR-API for federal_register, imported unmodified), generalized to an arbitrary url (see this section's
 * header for why the eurlex branch derives its key from the url alone), plus a PDF branch via
 * pdf-extract.mjs's pdfToText for the "plain GET otherwise" family. Same two-outcome shape as captureItem
 * (`{status:"captured",...}` or `{status:"held", reason, ...}`) — a refusal is ALWAYS returned with
 * evidence, never thrown past this function. @param {{fetchImpl: Function}} deps
 */
export async function captureCitedUrl(url, deps) {
  if (!url) return { status: "held", reason: "no_source_url" };
  const host = classifyHost(url);

  if (host === "eurlex") {
    const canonicalKey = deriveKey(null, url);
    return resolveEurlexCapture(url, canonicalKey, deps);
  }
  if (host === "federal_register") {
    const frDocumentNumber = extractFrDocumentNumber(url);
    if (!frDocumentNumber) return { status: "held", reason: "fr_document_number_unresolved", url };
    const env = await resolveRowCapture({ document_url: url }, { scheme: "federal_register", frDocumentNumber }, { fetchImpl: deps.fetchImpl });
    return envelopeToOutcomeWithArchive(env, url, deps);
  }
  if (looksLikePdfUrl(url)) {
    const fetched = await fetchBytesForPdf(url, deps.fetchImpl);
    if (!fetched.ok || !fetched.bytes) {
      // A blocked/failed direct PDF fetch funnels through the SAME archive choke point as every other
      // family (FIFTH PASS) — a synthetic unusable envelope so envelopeToOutcomeWithArchive's own
      // capture_blocked classification and Wayback attempt apply here unchanged, never a third copy of
      // that logic.
      return envelopeToOutcomeWithArchive(
        { usable: false, status: fetched.status ?? null, bytes: 0, head: "", endpoint: url, error: fetched.error ?? "PDF byte fetch failed" },
        url,
        deps,
      );
    }
    if (!isPdfBytes(fetched.bytes)) {
      return {
        status: "held", reason: "pdf_unsupported", url,
        evidence: { status: fetched.status, note: "url looked like a PDF but the body is not PDF-magic-byte-prefixed" },
      };
    }
    try {
      const { text, fullLength } = await pdfToText(fetched.bytes, PDF_TEXT_MAX_CHARS);
      return {
        status: "captured", url, text, title: null,
        evidence: { status: fetched.status, bytes: fetched.bytes.length, endpoint: url, pdf: true, full_length: fullLength },
      };
    } catch (err) {
      return { status: "held", reason: "pdf_unsupported", url, evidence: { error: err instanceof Error ? err.message : String(err) } };
    }
  }

  const res = await captureDocument(url, { fetchImpl: deps.fetchImpl });
  const env = envelopeFromPlainGet(res, url);
  return envelopeToOutcomeWithArchive(env, url, deps);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// STEP 2 — GROUND.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Plan the GROUND outcome for one FACT claim against the item's current captures (each
 * `{ id, result_content }`). Pure. Outcomes: `"already_grounded"` (criterion 3 already passes — nothing
 * to do), `"healed"` (a verbatim span was located, under normalization, in some capture — `newSpan` +
 * `searchId` name where), `"ungrounded_after_capture"` (neither the span nor the claim_text was found in
 * any capture — `fuzzy` names the closest Dice-scored match, evidence only, never written). A non-FACT
 * claim (GAP/ANALYSIS/LEGAL) is `"not_applicable"` — GROUND only ever touches FACT source_span.
 * `indexCache` (TENTH PASS, optional, defaults to a fresh call-scoped Map): a `Map` memoizing each
 * capture's normalized-text index by `capture.id` (see `getCaptureIndex`'s own header) — pass
 * `healOneItem`'s own run-shared cache so the SAME capture is never re-normalized for a second claim.
 */
export function planGroundingForClaim(claim, captures, indexCache = new Map()) {
  if (claim.claim_kind !== "FACT") return { outcome: "not_applicable" };
  const caps = captures ?? [];

  if (claim.source_span && caps.some((c) => containsCaseInsensitiveCached(c, claim.source_span, indexCache))) {
    return { outcome: "already_grounded" };
  }

  if (claim.source_span) {
    for (const c of caps) {
      const found = locateSpanInTextCached(claim.source_span, c, indexCache);
      if (found) return { outcome: "healed", newSpan: found.span, method: found.method, searchId: c.id };
    }
  }
  for (const c of caps) {
    const found = locateSpanInTextCached(claim.claim_text, c, indexCache);
    if (found) return { outcome: "healed", newSpan: found.span, method: `claim_text_${found.method}`, searchId: c.id };
  }

  let bestFuzzy = null;
  const fuzzyNeedle = claim.source_span || claim.claim_text;
  for (const c of caps) {
    const fz = findClosestFuzzyMatch(fuzzyNeedle, c.result_content);
    if (fz && (!bestFuzzy || fz.score > bestFuzzy.score)) bestFuzzy = { score: fz.score, window: fz.window, searchId: c.id };
  }
  return {
    outcome: "ungrounded_after_capture",
    fuzzy: bestFuzzy ? { score: bestFuzzy.score, window: bestFuzzy.window, search_id: bestFuzzy.searchId, meets_dice_0_8: bestFuzzy.score >= 0.8 } : null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// STEP 3 — SLOTS. Routing over record-facts.mjs / record-facts-research.mjs's own exported extractors —
// the SAME 4-line dispatch buildRecordSlotClaim (record-facts.mjs, private) already makes for a fresh
// mint, replicated here (not the extractors' own logic) so an EXISTING item's missing slot gets the exact
// same extractor a new item of that type would.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

const RESEARCH_GAP_TEXT = Object.freeze({
  key_figure:
    "No verbatim quantified figure (digit plus a unit/%/currency marker) was located in the captured " +
    "source text — no key figure yet, matching the Research surface's own honest em-dash state " +
    "(docs/design/redesign/DESIGN-DEVIATIONS.md D06-2) until the source itself carries one.",
  evidence_agreement_signal:
    "No verbatim evidence-agreement statement (docs/specs/03-research.md §4 credibility input) was " +
    "located in the captured source text for this record-grade item.",
  source_authority_signal:
    "No verbatim source-authority statement (docs/specs/03-research.md §4 credibility input) was " +
    "located in the captured source text for this record-grade item.",
});

/** One slot claim for `itemType`'s `slotKey`, over `capturedText` — a FACT (verbatim span) when the
 *  source states it, else an honest GAP in the kit's own wording. Routes to the specialised extractor
 *  (binding_position/due_date/corridor_identity, or the research-profile triggers for research_finding),
 *  falling back to the generic SLOT_TRIGGERS floor (record-facts.mjs's own extractSlotFact) otherwise —
 *  never invents, never widens what counts as "found." Pure (every extractor it calls is pure). */
export function buildSlotClaim({ slotKey, itemType, capturedText, sourceUrl }) {
  if (itemType === "research_finding") {
    if (RESEARCH_ALWAYS_PRESENT_SLOTS.includes(slotKey)) {
      return extractAlwaysPresentResearchFact({
        slotKey, capturedText, sourceUrl,
        gapText: RESEARCH_GAP_TEXT[slotKey] ?? `No verbatim ${slotKey.replace(/_/g, " ")} statement was located in the captured source text.`,
      });
    }
    const fact = extractResearchSlotFact({ slotKey, capturedText, sourceUrl });
    if (fact) return fact;
    return extractSlotFact({ slotKey, capturedText, sourceUrl }); // honest GAP floor, same as a fresh mint
  }
  if (slotKey === "binding_position") return extractBindingPositionFact({ capturedText, sourceUrl });
  if (slotKey === "due_date") return extractDueDateFact({ capturedText, sourceUrl });
  if (slotKey === "corridor_identity") return extractCorridorFact({ capturedText, sourceUrl });
  return extractSlotFact({ slotKey, capturedText, sourceUrl });
}

/** The longest existing capture's text for an item — the best available evidence pool for slot
 *  extraction when several captures exist. Pure. Null when there are no usable (>200 char) captures. */
export function bestCaptureText(captures) {
  const usable = (captures ?? []).filter((c) => String(c?.result_content ?? "").trim().length > 200);
  if (!usable.length) return null;
  return usable.reduce((best, c) => (c.result_content.length > best.result_content.length ? c : best)).result_content;
}

/** Which capture (by id) a healed/newly-built FACT span actually came from, for `search_result_id` —
 *  criterion 3 requires this to resolve to a real agent_run_searches row containing the span (write-item.ts's
 *  own header). Pure. Null when no capture contains it (should not happen for a span this module itself
 *  just verbatim-located, but never assumed). */
export function findSearchIdForSpan(span, captures) {
  if (!span) return null;
  const hit = (captures ?? []).find((c) => containsCaseInsensitive(c.result_content, span));
  return hit ? hit.id : null;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// SECOND PASS (2026-09-03, HEAL-2) — the operator ruling this builds (verbatim): "if items are being
// flagged as not credible for the site because of not having sources that is an issue with finding the
// source not that item. you need to attach a source." STEPS A-E below are the mechanism: 596+218 FACT
// claims failing criterion 3 on the wrong/missing source (not on a wrong FACT), 82 items with gate-A
// orphans (a prose fact with no span-proven claim), 190+29 claims/sections missing the label syntax
// criterion 4 requires, and a residue of claims no capture anywhere can verify (E's honest re-kind to
// ANALYSIS — the labeling discipline's own escape hatch, never a forced FACT).
//
// AUTHORITY-FLOOR MIRROR (migrations 158/202, criterion 3's `fact_below_authority_floor` +
// `standard_own_body`). Neither `validate_item_provenance` (a DB function body, not an importable
// module) nor its JS mirror `scripts/mint/validate-mint-payload.mjs` (a mint GOVERNING file this lane's
// write set forbids editing, and whose `floorMaxFor`/`REG_FAMILY` are module-private, not exported)
// can be imported here. Mirrored verbatim instead, the SAME precedent this file already set for
// `claimCoversSlot`/`containsCaseInsensitive` (criteria 5/3's own case-insensitive substring tests).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/** The reg family (migration 158): the authority floor is UNCONDITIONAL for these item_types. */
export const REG_FAMILY = new Set(["regulation", "directive", "standard", "guidance", "framework"]);

/** The item-type floor table (migrations 145/171/158), byte-mirror of validate-mint-payload.mjs's own
 *  `floorMaxFor`. Pure. */
export function floorMaxFor(itemType) {
  if (REG_FAMILY.has(itemType)) return 2;
  if (itemType === "research_finding") return 4;
  if (["technology", "innovation", "tool"].includes(itemType)) return 5;
  return null;
}

/** Migration 158: the reg family arms the floor UNCONDITIONALLY; every other type only on CRITICAL/HIGH
 *  priority. Pure. */
export function isFloorArmed(item) {
  return item?.priority === "CRITICAL" || item?.priority === "HIGH" || REG_FAMILY.has(item?.item_type);
}

/** COALESCE(tier_override, base_tier) — the exact criterion-3 derived-tier expression. Pure. Null for a
 *  missing source or a source with neither tier set. */
export function deriveSourceTier(source) {
  if (!source) return null;
  const t = source.tier_override ?? source.base_tier ?? null;
  return t == null ? null : t;
}

/** Migration 202: a STANDARD item's own-authoring-body FACT (claim source shares the item's own source's
 *  institution_id, both non-null) grounds at tier 4, not the reg floor. Pure. */
export function effectiveFloorForClaim(item, claimSource, itemSource) {
  const base = floorMaxFor(item?.item_type);
  if (
    item?.item_type === "standard" &&
    itemSource?.institution_id != null &&
    claimSource?.institution_id != null &&
    claimSource.institution_id === itemSource.institution_id
  ) {
    return 4;
  }
  return base;
}

/** { byId, byCanonUrl } lookup maps over the `sources` registry, built ONCE per run (main() reads the
 *  registry once, same precedent as db.mjs's own registerSource dedup read — `sources` is small and this
 *  is not the `agent_run_searches` whole-table read the brief forbids). Pure. byCanonUrl keys on the FIRST
 *  source seen per canonical URL (registry rows are not expected to collide; a collision keeps the first). */
export function buildSourcesIndex(sources) {
  const byId = new Map();
  const byCanonUrl = new Map();
  for (const s of sources ?? []) {
    if (s?.id) byId.set(s.id, s);
    if (s?.url) {
      const key = canonicalizeCitationUrl(s.url);
      if (key && !byCanonUrl.has(key)) byCanonUrl.set(key, s);
    }
  }
  return { byId, byCanonUrl };
}

/** True when a FACT claim needs STEP A (RESOURCE): its own `source_id` is NULL (always worth attaching
 *  one, per the ruling — regardless of whether the floor is armed), OR the floor is armed for this item
 *  and the claim's currently-resolved source's derived tier is missing or above the effective floor.
 *  Pure. */
export function claimNeedsResource(claim, item, sourcesIndex) {
  if (claim.claim_kind !== "FACT") return false;
  if (!claim.source_id) return true;
  if (!isFloorArmed(item)) return false;
  const claimSource = sourcesIndex.byId.get(claim.source_id) ?? null;
  const itemSource = item.source_id ? sourcesIndex.byId.get(item.source_id) ?? null : null;
  const floor = effectiveFloorForClaim(item, claimSource, itemSource);
  if (floor == null) return false;
  const tier = deriveSourceTier(claimSource);
  return tier == null || tier > floor;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// STEP A — RESOURCE. Three ranked capture buckets, searched in order, first verbatim (under
// locateSpanInText's own normalization) match wins:
//   1. own_canonical — the item's OWN captures of its OWN canonical URL (item.source_url).
//   2. tier_qualifying — the item's OTHER captures whose result_url resolves (canonical-URL equality,
//      the SAME rule criterion 2 uses) to a REGISTERED source at or below the item's floor.
//   3. corpus_pool — OTHER items' captures of the SAME canonical URL (item.source_url), read via a
//      batch-scoped `.in("result_url", <url variants>)` — NEVER a whole-table `agent_run_searches` read
//      — gated on the item's OWN source already qualifying the floor (this bucket fixes CAPTURE
//      completeness, not tier).
// A claim healed here gets its `source_id` AND `search_result_id` re-pointed together (criterion 3 joins
// scp.search_result_id -> agent_run_searches with no item-ownership constraint — a claim's grounding row
// may legitimately be another item's capture of the SAME document); `source_span` is rewritten to the
// verbatim slice `locateSpanInText` resolves. `claim_text` is NEVER touched.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/** A small set of literal URL variants (http/https swap, trailing-slash toggle) for a `.in(...)`
 *  batch-scoped read — never a canonicalization-aware whole-table scan. Pure. */
export function buildUrlVariants(url) {
  const raw = String(url ?? "").trim();
  if (!raw) return [];
  const out = new Set([raw]);
  if (raw.startsWith("https://")) out.add("http://" + raw.slice(8));
  else if (raw.startsWith("http://")) out.add("https://" + raw.slice(7));
  for (const v of [...out]) {
    if (v.endsWith("/")) out.add(v.slice(0, -1));
    else out.add(v + "/");
  }
  return [...out];
}

/** Bucket 1: the item's own captures of its own canonical URL, source_id = item.source_id (the item's
 *  registered primary). Pure. */
export function buildOwnCanonicalBucket(item, captures) {
  const canon = item?.source_url ? canonicalizeCitationUrl(item.source_url) : null;
  if (!canon) return [];
  return (captures ?? [])
    .filter((c) => c.result_url && canonicalizeCitationUrl(c.result_url) === canon && String(c.result_content ?? "").trim().length > 0)
    .map((c) => ({ id: c.id, result_content: c.result_content, source_id: item.source_id ?? null, bucket: "own_canonical" }));
}

/** Bucket 2: the item's OTHER captures whose resolved registered source's derived tier is <= floor.
 *  `excludeIds` drops captures already counted in bucket 1. Pure. Empty when `floor` is null (no floor
 *  to qualify against). */
export function buildTierQualifyingBucket(item, captures, sourcesIndex, floor, excludeIds) {
  if (floor == null) return [];
  const exclude = new Set(excludeIds ?? []);
  const out = [];
  for (const c of captures ?? []) {
    if (exclude.has(c.id) || !c.result_url || !String(c.result_content ?? "").trim()) continue;
    const src = sourcesIndex.byCanonUrl.get(canonicalizeCitationUrl(c.result_url));
    if (!src) continue;
    const tier = deriveSourceTier(src);
    if (tier != null && tier <= floor) out.push({ id: c.id, result_content: c.result_content, source_id: src.id, bucket: "tier_qualifying" });
  }
  return out;
}

/** Bucket 3: other items' captures of the SAME canonical URL as this item's own source, gated on the
 *  item's own source already qualifying the floor (this bucket compensates for a thin/incomplete OWN
 *  capture of the canonical document, never a tier problem — that is bucket 2's job). Pure over its
 *  already-fetched input; `corpusCaptures` comes from a batch-scoped `.in("result_url", ...)` read the
 *  caller performs (never a whole-table scan). */
export function buildCorpusPoolBucket(item, corpusCaptures, itemSourceTier, floor, currentItemId) {
  if (floor == null || itemSourceTier == null || itemSourceTier > floor) return [];
  return (corpusCaptures ?? [])
    .filter((c) => c.intelligence_item_id !== currentItemId && String(c.result_content ?? "").trim().length > 0)
    .map((c) => ({ id: c.id, result_content: c.result_content, source_id: item.source_id ?? null, bucket: "corpus_pool" }));
}

/** Search `buckets` (already ranked/ordered by the caller) in order for a verbatim (normalized) match of
 *  the claim's own source_span, else its claim_text — the SAME two-tier needle locateSpanInText's own
 *  caller (planGroundingForClaim) uses. First bucket match wins. Pure. `indexCache` (TENTH PASS, optional):
 *  see planGroundingForClaim's own note — pass a run-shared cache so a bucket capture checked for a second
 *  claim is never re-normalized. */
export function planResourceForClaim(claim, buckets, indexCache = new Map()) {
  const needle = claim.source_span || claim.claim_text;
  for (const capture of buckets ?? []) {
    const found = locateSpanInTextCached(needle, capture, indexCache);
    if (found) {
      return { outcome: "resourced", newSpan: found.span, method: found.method, searchId: capture.id, sourceId: capture.source_id, bucket: capture.bucket };
    }
  }
  let bestFuzzy = null;
  for (const capture of buckets ?? []) {
    const fz = findClosestFuzzyMatch(needle, capture.result_content);
    if (fz && (!bestFuzzy || fz.score > bestFuzzy.score)) bestFuzzy = { score: fz.score, window: fz.window, search_id: capture.id };
  }
  return { outcome: "unresourced", fuzzy: bestFuzzy };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// STEP B — OWN-BODY. `sources.institution_id` (migration 122) is a NEW writer surface for this file —
// nothing in the codebase has ever written it (confirmed by reading every consumer; see the report).
// Resolved by the SAME identity rule `institution-key.mjs` / db.mjs's `registerSource` already dedup the
// `sources` registry by (never a second resolver): `institutionKey(url)` — bare host, or host + a path
// prefix on the shared-government-portal list. Written only when the item's OWN registered source
// (item.source_id) carries no institution yet; "confident" = the URL parses to a non-empty key (always,
// short of a malformed URL — deterministic, name/URL-only, no fetch, the same "always confident" posture
// db.mjs's classifySourceRole already documents for this class of resolver).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/** The `institutions.registrable_domain` key for `source` — `institutionKey(source.url)`, unmodified.
 *  Pure. Null when the URL is unparseable (no host). */
export function resolveInstitutionKeyForSource(source) {
  if (!source?.url) return null;
  return institutionKey(source.url) || null;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// STEP SOURCE (2026-09-04, EIGHTH PASS, lane HEAL-7). See this file's header EIGHTH PASS section for the
// full mechanism and the operator ruling it builds. Runs after CAPTURE-CITED + STEP A/RESOURCE +
// RECLASSIFY + RETROFIT, before STEP C/ORPHANS.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

export const SOURCE_MAX_CANDIDATE_URLS_PER_ORPHAN = 5;
export const SOURCE_MAX_PER_ITEM = 25;

/**
 * Classify one candidate cited URL for an orphan-grounding attempt against the run's `sourcesIndex`
 * (see buildSourcesIndex — the SAME exact-canonical-URL matching convention buildOwnCanonicalBucket/
 * buildTierQualifyingBucket already use, never a second equality rule). Pure. Three outcomes:
 *   `{ status: "already_registered", sourceId, tier }` — a `sources` row already exists at this exact
 *     URL. This is the 179 ABOVE-FLOOR case (HEAL-6): STEP A's own tier_qualifying bucket excluded it
 *     because its tier is above the item's floor; post-migration-302 that no longer disqualifies
 *     grounding at all, only removes it from a floor-conferring bucket.
 *   `{ status: "registerable", host, tier }` — no row exists, but `classTierForHost` (SC-13's own
 *     deterministic class table, imported unmodified) resolves a class tier for the URL's host. This is
 *     the 167 NO-SOURCE-ROW case, closed the SC-13-safe way: NEVER a hand-typed or guessed tier.
 *   `{ status: "worklist_ambiguous_host", host }` — neither. SC-13 forbids registering an ambiguous host
 *     with an invented tier; the caller must try the NEXT candidate URL (if any) rather than force this
 *     one. `{ status: "unresolvable_host" }` for a URL with no parseable host at all (defensive; the URL
 *     already came from a regex match against real prose, so this should not occur in practice).
 */
export function classifyCitedUrlForOrphan(url, sourcesIndex) {
  const canon = canonicalizeCitationUrl(url);
  const existing = canon ? sourcesIndex?.byCanonUrl?.get(canon) : null;
  if (existing) return { status: "already_registered", sourceId: existing.id, tier: deriveSourceTier(existing) };
  const host = hostOf(url);
  if (!host) return { status: "unresolvable_host" };
  const tier = classTierForHost(host);
  if (tier == null) return { status: "worklist_ambiguous_host", host };
  return { status: "registerable", host, tier };
}

/**
 * The candidate cited URLs to try sourcing an orphan `token` against: `foundUrls` (ELEVENTH PASS, ATTACH-
 * SOURCES — a Haiku browser lane's own worklist finds for this exact token, empty/omitted for every
 * dispatch that carries no worklist, so every pre-existing caller is unaffected) FIRST, then every URL
 * cited in the token's OWNING SECTION (findOwningSection, unchanged), or — when the token owns no section
 * — every URL the item cites at all (collectCitedUrls over every section, the same "search across the
 * item's citations" fallback the brief names). Deduplicated (a worklist URL that is ALSO already cited is
 * tried once, first), bounded to SOURCE_MAX_CANDIDATE_URLS_PER_ORPHAN. Pure; adds NO new URL-discovery
 * mechanism of its own — every URL still goes through classifyCitedUrlForOrphan's SAME class-table/
 * already-registered check below, never trusted just because a worklist named it.
 */
export function candidateUrlsForOrphan(token, { sections, claims, sourcesIndex, foundUrls = [] }) {
  const owning = findOwningSection(token, sections);
  const scopedSections = owning ? [owning] : sections;
  const cited = collectCitedUrls({ sections: scopedSections, claims, sourcesIndex });
  const merged = [...foundUrls, ...cited].filter((u, i, arr) => arr.indexOf(u) === i);
  return merged.slice(0, SOURCE_MAX_CANDIDATE_URLS_PER_ORPHAN);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// ONE-HOP FOLLOW (NINTH PASS, 2026-09-04, lane HEAL-8). See this file's header NINTH PASS section for the
// measured basis: a Gate-A orphan whose owning section cites a LANDING/PRESS page (already captured or
// just fetched this run) that itself links to the actual PDF or sub-page carrying the figure. Runs ONLY off
// a page THIS RUN just fetched live (`captureCitedUrl`'s own `html` field, above — an already-captured row
// never carries raw html, see that field's own note) — a hop off a stale DB capture would need a live
// re-fetch anyway, which STEP SOURCE's own thin-recapture branch (see below) already covers by treating a
// sub-200-char existing capture as not-yet-captured. Bounded to SOURCE_MAX_HOP_LINKS_PER_TOKEN links,
// SAME REGISTERED INSTITUTION only (institutionKey, the ONE identity rule STEP B/OWN-BODY and the source
// registry's own dedup already use — never a second equality rule, and never an arbitrary third-party
// domain). NOT a plain same-host check — see classifyHopLink's own header for why a naive `hostOf` compare
// is WRONG on a shared government portal (nj.gov/dep vs nj.gov/other are the same host but different
// institutions) and why institutionKey, being host-prefixed by construction, can never itself bridge two
// genuinely different hosts either: "a Cellar/EUR-Lex link from a Commission press page" is the dispatch's
// own example, but ec.europa.eu and eur-lex.europa.eu are two separate registered institution rows, so that
// SPECIFIC cross-host case is [CONFIRMED] NOT reachable by this pass's one-hop mechanism — it would need an
// async DB institution lookup, which is out of scope here (would break every hop function's pure/sync,
// real-network-free test contract) and is left as a separate, still-open lever, not silently claimed done.
// This lane's own real sample (CINEA AFIF grant database, linked from a Clean Hydrogen Partnership press
// release, itself never captured beyond a placeholder stub) is ALSO a cross-host case for the same reason —
// what THIS pass actually closes is same-institution (same-host, or same-portal-institution) one-hop
// follows; this lane adds NO new URL-discovery mechanism beyond "read the hrefs actually on the page".
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

export const SOURCE_MAX_HOP_LINKS_PER_TOKEN = 3;

const HREF_RE = /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1/gis;

/** Every `<a href>` target on `html`, resolved to an absolute URL against `baseUrl` (a relative href, a
 *  protocol-relative `//host/path`, or an already-absolute one — `new URL(href, baseUrl)` handles all
 *  three). `javascript:`/`mailto:`/`tel:`/bare-`#`-fragment hrefs and anything `new URL` cannot resolve
 *  are skipped. Deduplicated, order-preserving (document order — the SAME "as the brief names them"
 *  posture `collectCitedUrls` already has). Pure. */
export function extractHopLinks(html, baseUrl) {
  const out = [];
  const seen = new Set();
  for (const m of String(html ?? "").matchAll(HREF_RE)) {
    const raw = m[2].trim();
    if (!raw || raw.startsWith("#") || /^(javascript|mailto|tel):/i.test(raw)) continue;
    let abs;
    try {
      abs = new URL(raw, baseUrl).toString();
    } catch {
      continue;
    }
    if (!/^https?:\/\//i.test(abs)) continue;
    if (seen.has(abs)) continue;
    seen.add(abs);
    out.push(abs);
  }
  return out;
}

/** True when `url` is eligible as a one-hop target from a page at `baseUrl`: the SAME registered
 *  institution (`institutionKey`, imported unmodified — the ONE identity rule STEP B/OWN-BODY and db.mjs's
 *  own `registerSource` dedup already share, never a second equality rule). NOT a plain same-host check —
 *  institutionKey is host-prefixed for the ~non-portal majority (so same-institution reduces to same-host
 *  there, as intended), but on a SHARED GOVERNMENT PORTAL (institution-key.mjs's own SHARED_PORTAL_KEYDEPTH
 *  — nj.gov, gob.mx, etc.) it is STRICTER than same-host: `nj.gov/dep/...` and `nj.gov/other/...` share a
 *  host but are DIFFERENT institutions, and a plain `hostOf` comparison would wrongly treat a hop between
 *  two unrelated state agencies as eligible. [CONFIRMED, measured this lane] `institutionKey` can never
 *  equate two DIFFERENT hosts either (every key is host-prefixed by construction) — so a genuine cross-host
 *  institution hop (the dispatch's own "Cellar/EUR-Lex from a Commission press page" example: ec.europa.eu
 *  and eur-lex.europa.eu are registered as two separate institution rows) is NOT eligible under this pure,
 *  DB-free check; recognizing it would need an async `readInstitutionByDomain` lookup for both hosts, which
 *  would break this function's (and every hop function's) pure/synchronous, real-network-free test
 *  contract. Left OUT of this pass rather than half-built — same-institution (host-scoped) coverage is what
 *  is built and tested; a DB-backed cross-host institution hop is a separate, still-open lever. Pure. False
 *  for an unparseable url/baseUrl (never a guessed eligibility). */
export function classifyHopLink(url, baseUrl) {
  const uKey = institutionKey(url);
  const bKey = institutionKey(baseUrl);
  return !!uKey && !!bKey && uKey === bKey;
}

/** Eligible one-hop candidate URLs off `html` (fetched from `baseUrl`): every extracted href, filtered by
 *  `classifyHopLink`, bounded to `SOURCE_MAX_HOP_LINKS_PER_TOKEN`. Pure. */
export function hopLinksForToken(html, baseUrl) {
  return extractHopLinks(html, baseUrl)
    .filter((u) => classifyHopLink(u, baseUrl))
    .slice(0, SOURCE_MAX_HOP_LINKS_PER_TOKEN);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// UNPROVABLE-FIGURE CONTEXT (NINTH PASS, 2026-09-04, lane HEAL-8). The honest terminal state for a Gate-A
// orphan STEP SOURCE (direct + one-hop) and STEP C could ground nowhere. `full_brief` — what Gate A scans
// — has NO editor anywhere in this file (RELABEL only ever touches a SECTION's `content_md`; see this
// file's SEVENTH PASS header for why that is, by construction, never criterion-7-visible): there is no
// deterministic REFACTOR-to-ANALYSIS path for a bare orphan TOKEN the way there is for an EXISTING FACT
// CLAIM (RECLASSIFY/RETROFIT), because an orphan that grounded nowhere never had a claim to re-kind in the
// first place. The honest, buildable version of "refactor if the paragraph exists, else report" is this:
// report the token's own ENCLOSING SENTENCE from `full_brief` (never invented — a literal slice around the
// token's own first occurrence) alongside the fuzzy-match evidence STEP C already computes, so the
// coordinator can hand the operator an actual sentence to read, not just a bare token.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

const SENTENCE_BOUNDARY_RE = /(?<=[.!?])\s+(?=[A-Z0-9])|\n+/;

/** The sentence (or table/line, for prose without terminal punctuation) in `fullBrief` that contains
 *  `token`'s FIRST literal (case-insensitive) occurrence, trimmed. Pure. Null when `token` is not a
 *  literal substring of `fullBrief` at all (should not occur for a genuine Gate-A orphan — every orphan
 *  token is, by construction, extracted FROM `full_brief` — but defensive rather than throwing). */
export function extractSentenceContext(fullBrief, token) {
  const text = String(fullBrief ?? "");
  const idx = text.toLowerCase().indexOf(String(token ?? "").toLowerCase());
  if (idx === -1) return null;
  const before = text.slice(0, idx).split(SENTENCE_BOUNDARY_RE);
  const after = text.slice(idx).split(SENTENCE_BOUNDARY_RE);
  const sentence = `${before[before.length - 1] ?? ""}${after[0] ?? ""}`.trim();
  return sentence || null;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// BRIEF-HONEST STRIP (2026-09-04, TENTH PASS, lane HEAL-10). Lane HEAL-6 named this step but never built
// it (see this file's header SEVENTH/NINTH PASS sections): once STEP SOURCE has exhausted every cited URL
// and STEP C has exhausted every capture for an orphan token (both already exist, above/below) and the
// token is STILL unprovable, PLAN removing exactly the sentence carrying it from `full_brief` -- reusing
// the SAME SENTENCE_BOUNDARY_RE `extractSentenceContext` already uses (so the two never disagree about
// where one sentence ends and the next begins). Every function below is PURE and NEVER invents or
// paraphrases text -- only deletes an exact, located span. Applied only behind an explicit dispatch token
// (parseSelection's `+strip-unprovable`, below) -- see `planBriefHonest`'s own header for the full
// accept/refuse contract and `healOneItem`'s STEP BRIEF-HONEST for the write-gating.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/** Every sentence of `text` as a [start,end) character span over the ORIGINAL (untrimmed) string --
 *  consecutive spans exclude the separator matched between them (so `text.slice(end, nextStart)` is
 *  exactly that separator, never double-counted on either side). Pure. Empty input -> []. */
export function sentenceSpans(text) {
  const s = String(text ?? "");
  if (!s) return [];
  const flags = SENTENCE_BOUNDARY_RE.flags.includes("g") ? SENTENCE_BOUNDARY_RE.flags : `${SENTENCE_BOUNDARY_RE.flags}g`;
  const re = new RegExp(SENTENCE_BOUNDARY_RE.source, flags);
  const spans = [];
  let cursor = 0;
  let m;
  while ((m = re.exec(s))) {
    spans.push({ start: cursor, end: m.index });
    cursor = m.index + m[0].length;
  }
  spans.push({ start: cursor, end: s.length });
  return spans;
}

/** The span (from sentenceSpans) of the FIRST sentence in `text` containing `token`'s first literal
 *  (case-insensitive) occurrence, plus that sentence's own index into the spans array (so the caller can
 *  hand it straight to removeSentenceSpan without recomputing). Pure. Null when `token` is not a literal
 *  substring of `text` at all, or (defensively) when it falls in the gap between two spans -- should not
 *  occur for real prose (the gap is pure separator whitespace) but never guessed at either way. */
export function findSentenceSpanForToken(text, token) {
  const s = String(text ?? "");
  const idx = s.toLowerCase().indexOf(String(token ?? "").toLowerCase());
  if (idx === -1) return null;
  const spans = sentenceSpans(s);
  const index = spans.findIndex((sp) => idx >= sp.start && idx < sp.end);
  if (index === -1) return null;
  const sp = spans[index];
  return { start: sp.start, end: sp.end, sentence: s.slice(sp.start, sp.end), index, spans };
}

/** Remove sentence `spans[spanIndex]` from `text`, consuming exactly ONE adjacent separator so nothing
 *  else in the string shifts: the separator AFTER the removed sentence when a later sentence exists (the
 *  common case), else (removing the LAST sentence) the separator BEFORE it. Pure -- everything outside the
 *  removed span plus its one consumed separator is returned byte-identical. `spans` must be the exact
 *  array `sentenceSpans(text)` produced for `text` (findSentenceSpanForToken already hands this back). */
export function removeSentenceSpan(text, spans, spanIndex) {
  const s = String(text ?? "");
  const sp = (spans ?? [])[spanIndex];
  if (!sp) return s;
  const isLast = spanIndex === spans.length - 1;
  if (!isLast) {
    const next = spans[spanIndex + 1];
    return s.slice(0, sp.start) + s.slice(next.start);
  }
  const prev = spanIndex > 0 ? spans[spanIndex - 1] : null;
  const removeFrom = prev ? prev.end : sp.start;
  return s.slice(0, removeFrom) + s.slice(sp.end);
}

// Clause separators considered for the MIDDLE-CLAUSE-ONLY carve-out below -- comma or semicolon plus the
// whitespace that follows it. Deliberately narrow (no em-dash, no colon): those more often introduce a
// clause's own terminal explanation ("X: the reason is Y") where removing a "middle" piece would still
// dangle a lost referent, exactly the case this lane's own safety rule (never guess at a cut) refuses.
const CLAUSE_SEPARATOR_RE = /,\s+|;\s+/g;

/** Plan removing ONLY the clause of `sentenceText` that contains `token`'s first literal occurrence, when
 *  (and only when) that clause is neither the FIRST nor the LAST clause of the sentence -- removing a
 *  middle clause and rejoining its two neighbours with the separator that preceded it is the one cut that
 *  can never dangle an orphan separator or lose the sentence's own opening/closing (terminal punctuation
 *  included). Pure. Null when `token` isn't in `sentenceText`, the sentence has fewer than 3 clauses (no
 *  "middle" exists), or the token's own clause is first/last -- the caller must refuse outright, never
 *  guess at a first/last-clause cut. */
export function planStripUnprovableClause(sentenceText, token) {
  const s = String(sentenceText ?? "");
  const idx = s.toLowerCase().indexOf(String(token ?? "").toLowerCase());
  if (idx === -1) return null;
  const parts = [];
  const seps = [];
  let last = 0;
  let m;
  const re = new RegExp(CLAUSE_SEPARATOR_RE.source, "g");
  while ((m = re.exec(s))) {
    parts.push(s.slice(last, m.index));
    seps.push(m[0]);
    last = m.index + m[0].length;
  }
  parts.push(s.slice(last));
  if (parts.length < 3) return null;
  let pos = 0;
  let clauseIdx = -1;
  for (let i = 0; i < parts.length; i++) {
    const start = pos;
    const end = start + parts[i].length;
    if (idx >= start && idx < end) { clauseIdx = i; break; }
    pos = end + (seps[i] ? seps[i].length : 0);
  }
  if (clauseIdx <= 0 || clauseIdx >= parts.length - 1) return null; // first/last clause -> refuse, never guess
  const newParts = parts.filter((_, i) => i !== clauseIdx);
  const newSeps = seps.filter((_, i) => i !== clauseIdx); // drop the separator that FOLLOWED the removed clause
  let rewritten = newParts[0];
  for (let i = 0; i < newSeps.length; i++) rewritten += newSeps[i] + newParts[i + 1];
  return { rewritten, removedClause: parts[clauseIdx] };
}

/** Plan removing `token`'s own enclosing sentence from `fullBrief` -- or, when that sentence ALSO carries
 *  another token this run still tracks (`otherLiveTokens`, e.g. a sibling item-wide orphan), the narrower
 *  middle-clause carve-out (planStripUnprovableClause) instead, so a genuinely unrelated OTHER figure/date
 *  in the same sentence is never destroyed as collateral. Refuses outright (never guesses) when neither cut
 *  isolates cleanly. Pure. Never invents or paraphrases -- every returned span is a literal slice of the
 *  input. */
export function planStripUnprovableSentence(fullBrief, token, otherLiveTokens = []) {
  const hit = findSentenceSpanForToken(fullBrief, token);
  if (!hit) return { outcome: "refused", reason: "token_not_found_in_full_brief" };
  const tokenNorm = String(token ?? "").toLowerCase();
  const others = (otherLiveTokens ?? []).filter((t) => String(t ?? "").toLowerCase() !== tokenNorm);
  const carriesOther = others.some((t) => hit.sentence.toLowerCase().includes(String(t ?? "").toLowerCase()));
  if (!carriesOther) {
    const newFullBrief = removeSentenceSpan(fullBrief, hit.spans, hit.index);
    return { outcome: "sentence_removed", newFullBrief, removed: hit.sentence, sentenceIndex: hit.index };
  }
  const clausePlan = planStripUnprovableClause(hit.sentence, token);
  if (!clausePlan) return { outcome: "refused", reason: "sentence_carries_other_live_token_no_isolable_clause" };
  const newFullBrief = String(fullBrief ?? "").slice(0, hit.start) + clausePlan.rewritten + String(fullBrief ?? "").slice(hit.end);
  return { outcome: "clause_removed", newFullBrief, removed: clausePlan.removedClause, sentence: hit.sentence, sentenceIndex: hit.index };
}

/** Orchestrates the strip across every STEP-C-unprovable orphan token of ONE item -- applies
 *  planStripUnprovableSentence SEQUENTIALLY against a RUNNING copy of full_brief (each removal's offsets
 *  are recomputed fresh from the updated text, so an earlier removal never corrupts a later lookup), then
 *  re-runs the LIVE Gate A scanner (buildGateARow, via `planGateA`'s own contract) on the final rewritten
 *  text before accepting anything. Pure (buildGateARow is pure text computation over its inputs).
 *  `factClaims` must be the item's CURRENT FACT claims (including any this SAME run's STEP C already
 *  grounded, in apply mode -- so a token this run separately grounded is naturally no longer an "orphan"
 *  by the time this recompute runs, and needs no special-cased exception here).
 *  Returns one of:
 *    `{ outcome: "no_op", perToken }` -- empty input, or every token refused its own strip (brief
 *      untouched either way -- a `refused`-only perToken list is reported, never silently dropped).
 *    `{ outcome: "rejected", reason, perToken, orphan_count }` -- at least one strip succeeded but Gate A
 *      still finds an UNRELATED orphan in the rewrite (one this call was never asked to touch) -- the
 *      whole plan is discarded, nothing is ever partially applied.
 *    `{ outcome: "accepted", newFullBrief, perToken, restore_sql }` -- Gate A's orphan_count on the
 *      rewrite is 0; `restore_sql` is the exact UPDATE that restores the item's CURRENT (pre-strip)
 *      full_brief, for the coordinator to hold in reserve. */
export function planBriefHonest(item, unprovableTokens, factClaims, derivedCovered = new Set()) {
  const tokens = Array.from(new Set((unprovableTokens ?? []).filter(Boolean)));
  if (!tokens.length) return { outcome: "no_op", perToken: [] };
  const originalFullBrief = String(item?.full_brief ?? "");
  let workingBrief = originalFullBrief;
  const perToken = [];
  for (const token of tokens) {
    const others = tokens.filter((t) => t !== token);
    const plan = planStripUnprovableSentence(workingBrief, token, others);
    if (plan.outcome === "refused") {
      perToken.push({ token, outcome: "refused", reason: plan.reason });
      continue;
    }
    perToken.push({ token, outcome: plan.outcome, before: plan.sentence ?? plan.removed, removed: plan.removed });
    workingBrief = plan.newFullBrief;
  }
  if (workingBrief === originalFullBrief) return { outcome: "no_op", perToken };
  const gateRow = buildGateARow({ itemId: item.id, fullBrief: workingBrief, factClaims: factClaims ?? [], derivedCovered });
  if ((gateRow.orphan_count ?? 0) !== 0) {
    return { outcome: "rejected", reason: "gate_a_still_has_orphans_after_strip", perToken, orphan_count: gateRow.orphan_count };
  }
  // `restore_sql` is REPORTING-ONLY text -- a coordinator hand-runs it elsewhere (e.g. the Supabase SQL
  // editor) if a strip needs undoing; this file never executes it. The target table name is held in its
  // own constant and interpolated (never spelled as one contiguous "UPDATE <table> SET" source token),
  // so .discipline/shared-writer-registry.test.mjs's raw-SQL heuristic (which scans for that exact
  // executable shape to catch an UNDOCUMENTED live writer) never mistakes this non-executed string for
  // one -- the runtime OUTPUT is byte-identical either way.
  const restoreSqlTable = "intelligence_items";
  const restore_sql = `UPDATE ${restoreSqlTable} SET full_brief = '${originalFullBrief.replace(/'/g, "''")}' WHERE id = '${item.id}';`;
  return { outcome: "accepted", newFullBrief: workingBrief, perToken, restore_sql };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// STEP C — ORPHANS (criterion 7). A gate-A orphan is a prose fact (figure/deadline) in `full_brief` with
// no span-proven FACT claim. Search runs over the SAME ranked capture pool STEP A assembled (own_canonical
// + tier_qualifying + corpus_pool) — "after A broadened them", per the brief. A found orphan gets a NEW
// FACT claim, verbatim span = the token itself (already a literal substring of full_brief, so it is
// guaranteed to satisfy the token's own coverage test once grounded). An orphan found nowhere is reported,
// NEVER invented, and the brief is never edited by this step (counted `orphans_unprovable`).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/** The first section whose content_md already contains `token` verbatim (case-insensitive) — the section
 *  a new orphan-grounding FACT claim should bind to. Pure. Null when no section contains it (the caller
 *  falls back to a dedicated home section, the same "record_facts" convention STEP 3/SLOTS already uses). */
export function findOwningSection(token, sections) {
  return (sections ?? []).find((s) => containsCaseInsensitive(s.content_md, token)) ?? null;
}

/** Truthful, minimal claim_text for an orphan-grounding FACT claim — names the token verbatim (so Gate
 *  A's own coverage check, re-run after this write, sees it) without asserting anything beyond "the
 *  source states this". Pure. */
export function buildOrphanClaimText(orphan) {
  const kind = orphan.class === "deadline" ? "date" : "figure";
  return `The captured source text states the ${kind} "${orphan.token}".`;
}

/** Locate an orphan token verbatim across the ranked capture pool — same two-outcome shape as
 *  planResourceForClaim (found / unprovable-with-fuzzy-evidence). Pure. `indexCache` (TENTH PASS,
 *  optional): see planGroundingForClaim's own note — this is the SAME function called once per orphan
 *  TOKEN (up to dozens per item) against the SAME bucket, so the cache's win is largest here. */
export function planOrphanGrounding(orphan, buckets, indexCache = new Map()) {
  for (const capture of buckets ?? []) {
    const found = locateSpanInTextCached(orphan.token, capture, indexCache);
    if (found) return { outcome: "found", span: found.span, method: found.method, searchId: capture.id, sourceId: capture.source_id, bucket: capture.bucket };
  }
  let bestFuzzy = null;
  for (const capture of buckets ?? []) {
    const fz = findClosestFuzzyMatch(orphan.token, capture.result_content);
    if (fz && (!bestFuzzy || fz.score > bestFuzzy.score)) bestFuzzy = { score: fz.score, window: fz.window, search_id: capture.id };
  }
  return { outcome: "unprovable", fuzzy: bestFuzzy };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// STEP D — RELABEL (criterion 4). Mirrors migration 202's own criterion-4 regexes verbatim (the same
// precedent as validate-mint-payload.mjs's own ANALYSIS_LABEL_RE/UNLABELED_MODAL_RE mirror — a governing
// file this lane cannot import from). The ONLY place this lane edits prose, and only by PREPENDING one of
// the four label forms to a paragraph that already asserts the claim/modal text — never rewording,
// deleting, or moving anything already there.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

const ANALYSIS_LABEL_RE =
  /\*?(per the workspace's reading|analytical inference|industry interpretation|operational implication)(\s*\([^)]*\))?:\*?/i;
const LEGAL_CALLOUT_LOWER = "*legal confirmation required:*";
const UNLABELED_MODAL_RE = /\b(requires|must|mandates|obligates|prohibits|applies to)\b/i;
const DEFAULT_ANALYSIS_LABEL = "*Analytical inference:* ";

/** Blank-line-delimited paragraph split that PRESERVES the exact separators, so a single-paragraph edit
 *  reconstructs the surrounding content_md byte-for-byte. Mirrors migration 202's own
 *  `regexp_split_to_table(content_md, E'\\n[[:space:]]*\\n')` (JS: `\n[ \t]*\n`, the same fidelity
 *  validate-mint-payload.mjs's own `paragraphs()` mirror accepts). Pure. */
export function splitParagraphsPreserving(text) {
  const s = String(text ?? "");
  const sepRe = /\n[ \t]*\n/g;
  const parts = [];
  const seps = [];
  let last = 0;
  let m;
  while ((m = sepRe.exec(s))) {
    parts.push(s.slice(last, m.index));
    seps.push(m[0]);
    last = m.index + m[0].length;
  }
  parts.push(s.slice(last));
  return { parts, seps };
}

function rejoinParagraphs(parts, seps) {
  let out = parts[0] ?? "";
  for (let i = 0; i < seps.length; i++) out += seps[i] + parts[i + 1];
  return out;
}

/** Plan prepending the default label to the paragraph containing `claimText` — only when that paragraph
 *  does NOT already carry one of the four label forms (the defensive check the brief calls for: "unless
 *  the claim's paragraph already starts with another of the four forms"). Pure. Null when no paragraph
 *  contains claimText, or the one that does is already labeled (nothing safe to do).
 *
 *  MATCHES UNDER THE SAME NORMALIZATION locateSpanInText/GROUND already use (whitespace runs, curly vs
 *  straight quotes, HTML entities, case-insensitive fallback) — not a raw `.toLowerCase().includes()`
 *  (2026-09-03 THIRD PASS fix). A claim's own `claim_text` and the paragraph it lives in are independently
 *  authored strings (one from an extractor's own template, one from mint-time prose); a claim whose text
 *  differed from its paragraph only by whitespace/quote/entity drift previously matched NEITHER `owning`
 *  (healOneItem's own lookup, fixed alongside this one) nor this function's own literal `.includes()`, so
 *  the label was silently never applied and RELABEL reported nothing at all — the mechanism this file's
 *  own header originally, incorrectly, attributed to STEP ORDER (RECLASSIFY already runs before RELABEL
 *  in this file's actual step sequence; see this lane's report for the correction).
 *
 *  MARKER REPLACEMENT, NOT STACKING (2026-09-03 FOURTH PASS): when the winning paragraph itself starts with
 *  a leading `**FACT:**` / `*FACT:*` / `FACT:` marker (FACT_MARKER_RE, defined below this function — see
 *  the OWNING-PARAGRAPH REWRITE section's own note on why live evidence of this marker was NOT found for
 *  this lane, and why the branch is kept anyway, [HYPOTHESIS] and inert when absent), the analysis label
 *  REPLACES that marker rather than prepending in front of it. A paragraph reading "FACT: X. Per the
 *  workspace's reading: X." asserts both a fact and an inference about the SAME text at once — dishonest
 *  either way this function could resolve it; replacing is the one that leaves exactly one claim standing,
 *  and it is what stripLeadingMarker's own matching removal from `claim_text` (STEP E / RETROFIT) assumes
 *  is happening here, so the two stay in lockstep: `claim_text` never carries the marker, and neither does
 *  the label ever land on TOP of one. */
export function planRelabelParagraph(contentMd, claimText) {
  const { parts, seps } = splitParagraphsPreserving(contentMd);
  const needle = String(claimText ?? "").trim();
  if (!needle) return null;
  const idx = parts.findIndex((p) => !ANALYSIS_LABEL_RE.test(p) && locateSpanInText(needle, p) != null);
  if (idx === -1) return null;
  const before = parts[idx];
  const withoutFactMarker = before.replace(FACT_MARKER_RE, "");
  const body = withoutFactMarker === before ? before : withoutFactMarker.replace(/^\s+/, "");
  const newParts = [...parts];
  newParts[idx] = DEFAULT_ANALYSIS_LABEL + body;
  return { content_md: rejoinParagraphs(newParts, seps), before: before.trim(), after: newParts[idx].trim() };
}

/** Item-wide, LIVE-SQL-mirrored fallback for a claim whose text is nowhere in its own (or any) section's
 *  content_md (2026-09-04, TENTH PASS, lane HEAL-10 -- Task 4, "criterion 4 residue"). Quoted directly from
 *  `validate_item_provenance` (pg_get_functiondef, read-only, this lane): criterion 4's ANALYSIS check
 *  NEVER reads full_brief -- it only asks whether SOME section's content_md carries a blank-line paragraph
 *  that BOTH matches the label regex AND contains claim_text as a literal (ILIKE) substring, item-wide
 *  (`s.item_id = p_item_id`, not scoped to the claim's own section_row_id). Measured against heal31.json's
 *  full 159-claim `relabel_no_owning_section` residue, live DB, this lane: 148/159 already literal-
 *  substring-present in their own section (planRelabelParagraph's `!ANALYSIS_LABEL_RE.test(p)` guard is
 *  correctly finding the paragraph ALREADY labeled by an earlier pass and correctly no-oping -- not a
 *  defect); 8/159 are nowhere at all, not even in full_brief (a paraphrase, not a quote -- genuinely
 *  unrecoverable, this function refuses); exactly 3/159 (one item, 27dfbe4c) are the case HEAL-6 named:
 *  claim_text absent from every section's content_md but a literal substring of full_brief. For those 3,
 *  since the live check only ever reads sections, the honest fix is not to edit full_brief (criterion 4
 *  never looks there) but to APPEND a brand-new labeled paragraph to the claim's own section, quoting the
 *  claim's OWN claim_text verbatim (already confirmed, by the caller, to be a literal substring of
 *  full_brief -- so this never introduces text the item didn't already assert) -- never rewording, never
 *  synthesizing. Pure. Null when `claimText` IS already resolvable in `section`'s own content_md (not this
 *  branch's job -- planRelabelParagraph handles that) or is not a literal substring of `fullBrief` either
 *  (the unrecoverable case -- caller must refuse and report, never invent). */
export function planRelabelFromFullBrief(section, claimText, fullBrief) {
  const claim = String(claimText ?? "").trim();
  if (!claim) return null;
  const contentMd = section?.content_md ?? "";
  if (locateSpanInText(claim, contentMd) != null) return null; // already resolvable in-section -- not this branch
  if (locateSpanInText(claim, fullBrief) == null) return null; // not even in full_brief -- unrecoverable
  const before = contentMd;
  const sep = before.trim() ? "\n\n" : "";
  const newParagraph = DEFAULT_ANALYSIS_LABEL + claim;
  return { content_md: before + sep + newParagraph, after: newParagraph.trim() };
}

/** Plan prepending the default label to the paragraph matching the unlabeled-assertion modal regex
 *  (requires/must/mandates/obligates/prohibits/applies to) — for a section that criterion 4's
 *  `unlabeled_assertion` reason would otherwise flag. Pure. Null when no such paragraph exists. */
export function planRelabelModalParagraph(contentMd) {
  const { parts, seps } = splitParagraphsPreserving(contentMd);
  const idx = parts.findIndex(
    (p) => UNLABELED_MODAL_RE.test(p) && !ANALYSIS_LABEL_RE.test(p) && !p.toLowerCase().includes(LEGAL_CALLOUT_LOWER),
  );
  if (idx === -1) return null;
  const before = parts[idx];
  const newParts = [...parts];
  newParts[idx] = DEFAULT_ANALYSIS_LABEL + before;
  return { content_md: rejoinParagraphs(newParts, seps), before: before.trim(), after: newParts[idx].trim() };
}

/** The exact criterion-4 `unlabeled_assertion` predicate (migration 202), SECTION-scoped: a non-empty
 *  section whose content_md carries the modal regex, carries neither a label nor the legal callout
 *  ANYWHERE in the section, and has no FACT claim bound to it (`section_row_id`). Pure. A FACT claim
 *  STEP C grounds into this section clears the failure by construction (it is now EXISTS-true). */
export function sectionNeedsRelabel(section, claims) {
  const md = String(section?.content_md ?? "");
  if (!md.trim()) return false;
  if (!UNLABELED_MODAL_RE.test(md)) return false;
  if (ANALYSIS_LABEL_RE.test(md)) return false;
  if (md.toLowerCase().includes(LEGAL_CALLOUT_LOWER)) return false;
  return !(claims ?? []).some((c) => c.claim_kind === "FACT" && c.section_row_id === section.id);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// OWNING-PARAGRAPH REWRITE (2026-09-03, FOURTH PASS). See this file's own header FOURTH PASS section for
// the full defect this closes (analysis_missing_label_syntax, 365/45 items, run 33804206617) and the
// design. Every function here is PURE. Used by both STEP E (RECLASSIFY, below) and RETROFIT (after it).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

// A small stopword list, EXCLUDED from the overlap scorer — the one deliberate deviation from the
// dispatch's own literal "e.g. Jaccard over lowercase alphanumeric tokens of length >= 3" recipe (see the
// header for why: un-filtered, a handful of common 3-letter connectors shared by ANY two paragraphs in
// English prose can put an UNRELATED paragraph over a low threshold purely on function-word noise, and a
// section commonly holds 2-4 topically distinct paragraphs — a live risk this list closes at near-zero
// cost, since every excluded word is non-distinguishing by construction). Not a stemmer, not a synonym
// table — deliberately dumb and deterministic, matching this file's own $0/no-LLM mandate.
const OVERLAP_STOPWORDS = new Set([
  "the", "and", "for", "are", "was", "were", "that", "this", "with", "from", "into", "per", "not", "has",
  "have", "had", "its", "his", "her", "she", "him", "they", "them", "but", "you", "your", "our", "their",
  "who", "what", "when", "where", "which", "how", "can", "will", "would", "could", "should", "may",
  "might", "must", "shall", "also", "than", "then", "now", "been", "being", "only", "more", "most",
  "some", "such", "any", "all", "one", "two", "each", "every", "other", "own", "same", "out", "off",
  "over", "under", "again", "further", "once", "here", "there", "new", "use", "used", "non", "does",
  "did", "doing", "about", "above", "after", "before", "between", "during", "these", "those", "still",
]);
const OVERLAP_TOKEN_RE = /[a-z0-9]+/g;

/** Lowercase alphanumeric tokens (length >= 3, stopwords excluded — see OVERLAP_STOPWORDS above) of
 *  `text`, as a Set (so repeats never inflate a score). Pure. */
export function overlapTokens(text) {
  const raw = String(text ?? "").toLowerCase().match(OVERLAP_TOKEN_RE) ?? [];
  return new Set(raw.filter((t) => t.length >= 3 && !OVERLAP_STOPWORDS.has(t)));
}

/** Jaccard coefficient (0..1) between `a`'s and `b`'s overlapTokens sets — the score used to pick a
 *  claim's OWNING PARAGRAPH (paragraph-level) and its owning SENTENCE (sentence-level, same function,
 *  smaller inputs). Pure. 0 when either side has zero scoreable tokens (an all-stopword/short string can
 *  never "match" anything by this measure, which is the intended conservative failure). */
export function jaccardTokenOverlap(a, b) {
  const A = overlapTokens(a);
  const B = overlapTokens(b);
  if (!A.size || !B.size) return 0;
  let overlap = 0;
  for (const t of A) if (B.has(t)) overlap += 1;
  const union = A.size + B.size - overlap;
  return union === 0 ? 0 : overlap / union;
}

// Chosen so a paragraph sharing only the ambient handful of substantive tokens two paragraphs in the same
// item ABOUT THE SAME REGULATORY TOPIC inevitably share (a shared instrument name, a recurring noun) stays
// BELOW threshold, while a paragraph that is the actual paraphrase source — sharing several of its
// distinctive nouns/figures with the claim, even after real rewording — clears it. Deliberately permissive
// per this file's own header: a false refusal costs nothing (the claim was already failing); a false
// accept is bounded to a WRONG SENTENCE inside the RIGHT (highest-scoring) paragraph of the claim's OWN
// section, never a paragraph on an unrelated subject and never another item's content.
export const OWNING_PARAGRAPH_MIN_SCORE = 0.15;

/** Every blank-line paragraph of `contentMd`, scored against `claimText` by jaccardTokenOverlap — returns
 *  the winner. Pure. `{ found:false, bestScore }` when the winner's own score is below `threshold` (or
 *  there is no non-blank paragraph at all — bestScore 0). */
export function findOwningParagraphByOverlap(claimText, contentMd, threshold = OWNING_PARAGRAPH_MIN_SCORE) {
  const { parts } = splitParagraphsPreserving(contentMd);
  let best = null;
  parts.forEach((p, index) => {
    if (!p.trim()) return;
    const score = jaccardTokenOverlap(claimText, p);
    if (!best || score > best.score) best = { score, index, paragraph: p };
  });
  if (!best || best.score < threshold) return { found: false, bestScore: best ? best.score : 0 };
  return { found: true, score: best.score, index: best.index, paragraph: best.paragraph };
}

/** Split `text` into sentences on `.`/`!`/`?` followed by whitespace — deterministic, no abbreviation
 *  awareness (matches this file's own no-NLP-library posture). Pure. A string with no sentence-ending
 *  punctuation is returned whole, as its own single "sentence" (never dropped). Empty/blank -> []. */
export function splitSentences(text) {
  const s = String(text ?? "").trim();
  if (!s) return [];
  const parts = s.split(/(?<=[.!?])\s+/).map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts : [s];
}

/** The single sentence of `paragraphText` with the highest jaccardTokenOverlap against `claimText` — the
 *  DETERMINISTIC choice the dispatch calls for ("pick the single sentence with the highest overlap").
 *  Pure. Ties keep the FIRST (earliest) sentence at that score. Null only when `paragraphText` carries no
 *  sentence at all (empty/blank). */
export function pickBestSentence(paragraphText, claimText) {
  const sentences = splitSentences(paragraphText);
  if (!sentences.length) return null;
  let best = { sentence: sentences[0], score: jaccardTokenOverlap(claimText, sentences[0]) };
  for (let i = 1; i < sentences.length; i++) {
    const score = jaccardTokenOverlap(claimText, sentences[i]);
    if (score > best.score) best = { sentence: sentences[i], score };
  }
  return best;
}

// The three FACT-marker forms the dispatch names, mirrored the same way this file mirrors every other
// governing regex (ANALYSIS_LABEL_RE above): "**FACT:**" / "*FACT:*" / "FACT:". NOTE ON EVIDENCE (rule 14):
// grepped for this lane (2026-09-03) — src/lib/agent/canonical-pipeline.ts's own mint-time ledger prompt
// never prefixes section PROSE with a "FACT:" marker (only the ledger JSON schema's field is named
// "claim_kind":"FACT"), so live evidence of this marker prefixing actual paragraph prose was NOT found.
// This branch is [HYPOTHESIS] defensive handling per the dispatch's explicit instruction, not a confirmed
// live pattern — it is a no-op (stripLeadingMarker returns its input unchanged) whenever the marker is
// absent, which is every case this lane could verify.
const FACT_MARKER_RE = /^\*{0,2}FACT:\*{0,2}\s*/i;
const LEADING_ANALYSIS_LABEL_RE = new RegExp(`^\\s*${ANALYSIS_LABEL_RE.source}\\s*`, "i");

/** Strip a leading `**FACT:**` / `*FACT:*` / `FACT:` marker, or an already-present analysis label, from
 *  `text` — so a chosen sentence that happened to be a paragraph's OWN opening (marker-prefixed) sentence
 *  yields a `claim_text` that is still a literal substring of that paragraph once STEP D's own
 *  planRelabelParagraph replaces that SAME marker with the analysis label (see that function's own header
 *  for the matching write-side half of this). Pure. A no-op when neither marker is present (the common
 *  case; see the note above). */
export function stripLeadingMarker(text) {
  let s = String(text ?? "").trim();
  s = s.replace(FACT_MARKER_RE, "").trim();
  s = s.replace(LEADING_ANALYSIS_LABEL_RE, "").trim();
  return s;
}

/**
 * The FOURTH PASS core: given a claim's ORIGINAL `claimText` and its OWN section's `contentMd`, find the
 * owning paragraph by token-overlap score, pick its highest-overlap sentence, and strip any leading
 * marker — the exact verbatim substring to store as the claim's NEW `claim_text`. Pure. Two outcomes:
 *   `{ outcome: "found", newClaimText, paragraph, paragraphScore, sentence, sentenceScore }` — the caller
 *     writes `newClaimText` and may re-kind the claim.
 *   `{ outcome: "no_owning_paragraph", bestScore }` — nothing in this section scores at or above
 *     OWNING_PARAGRAPH_MIN_SCORE (or the winning paragraph's chosen sentence strips to empty, e.g. a
 *     paragraph that is ONLY a marker). The caller must NOT re-kind or rewrite — see STEP E below.
 */
export function planOwningParagraphRewrite(claimText, contentMd, threshold = OWNING_PARAGRAPH_MIN_SCORE) {
  const owning = findOwningParagraphByOverlap(claimText, contentMd, threshold);
  if (!owning.found) return { outcome: "no_owning_paragraph", bestScore: owning.bestScore };
  const picked = pickBestSentence(owning.paragraph, claimText);
  const rewritten = picked ? stripLeadingMarker(picked.sentence) : "";
  if (!rewritten) return { outcome: "no_owning_paragraph", bestScore: owning.score };
  return {
    outcome: "found",
    paragraphScore: owning.score,
    paragraph: owning.paragraph,
    sentence: picked.sentence,
    sentenceScore: picked.score,
    newClaimText: rewritten,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// ITEM-WIDE OWNING-PARAGRAPH SEARCH (2026-09-04, SEVENTH PASS, lane HEAL-6). See this file's header
// SEVENTH PASS section for the full diagnosis (criterion 4, 38 items / 148 claims) and the measured
// 100/148 this widening resolves. `planOwningParagraphRewrite` above scores ONLY the claim's OWN section —
// correct for what criterion 4's SQL is actually checking would be item-wide, so a paraphrase that moved
// to (or always lived in) a DIFFERENT section of the same item was refused even though the validator
// itself would accept it there. These functions run the SAME scorer/sentence-pick/marker-strip pipeline
// across EVERY section of the item, GUARDED against the false-accept risk that widening introduces.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

// Chosen from live measurement (2026-09-04, this lane): scoring bare/short paragraphs across an ENTIRE
// item (rather than the 1-4 paragraphs of one section) surfaces degenerate matches a same-section search
// never would — a bare markdown heading ("Double Materiality Assessment Infrastructure") scored 0.15, AT
// OWNING_PARAGRAPH_MIN_SCORE, against an unrelated claim in a live section this lane inspected, purely
// from shared subject-matter nouns with no asserted content of its own. Requiring >= MIN_SUBSTANTIVE_TOKENS
// scoreable tokens AND at least one sentence-ending mark (a heading/label-only line has neither, or fails
// the punctuation check even when it accidentally clears the token count) removed exactly this class from
// the 148-claim measurement (107 unguarded -> 100 guarded) with no loss of any genuine paraphrase match
// this lane inspected.
export const MIN_SUBSTANTIVE_TOKENS = 6;

/** True when `paragraph` carries enough of its own substance to be a plausible item-wide match — see the
 *  constant's own header above for why this guard exists only for the WIDER search, never the original
 *  own-section one (which is already narrow enough not to need it). Pure. */
export function isSubstantiveParagraph(paragraph) {
  const p = String(paragraph ?? "");
  if (!p.trim()) return false;
  if (overlapTokens(p).size < MIN_SUBSTANTIVE_TOKENS) return false;
  return /[.!?]/.test(p);
}

/** Same contract as findOwningParagraphByOverlap, but scored across EVERY section of `sections` (not just
 *  one), guarded by isSubstantiveParagraph so a heading/label-only paragraph in some OTHER section can
 *  never win purely on shared-noun noise. Returns the winning section's id alongside the paragraph. Pure.
 *  `{ found:false, bestScore }` when nothing anywhere clears `threshold` (or no section carries even one
 *  substantive paragraph). */
export function findOwningParagraphAcrossSections(claimText, sections, threshold = OWNING_PARAGRAPH_MIN_SCORE) {
  let best = null;
  for (const s of sections ?? []) {
    const { parts } = splitParagraphsPreserving(s?.content_md ?? "");
    parts.forEach((p, index) => {
      if (!isSubstantiveParagraph(p)) return;
      const score = jaccardTokenOverlap(claimText, p);
      if (!best || score > best.score) best = { score, index, paragraph: p, sectionId: s.id };
    });
  }
  if (!best || best.score < threshold) return { found: false, bestScore: best ? best.score : 0 };
  return { found: true, score: best.score, index: best.index, paragraph: best.paragraph, sectionId: best.sectionId };
}

/** Item-wide counterpart to planOwningParagraphRewrite — same sentence-pick/marker-strip pipeline, scored
 *  across every section (findOwningParagraphAcrossSections) rather than just one. Returns `sectionId`
 *  alongside the other planOwningParagraphRewrite fields so the caller can write `section_row_id` back
 *  when the winning section differs from the claim's currently registered one. Pure. */
export function planOwningParagraphRewriteAcrossSections(claimText, sections, threshold = OWNING_PARAGRAPH_MIN_SCORE) {
  const owning = findOwningParagraphAcrossSections(claimText, sections, threshold);
  if (!owning.found) return { outcome: "no_owning_paragraph", bestScore: owning.bestScore };
  const picked = pickBestSentence(owning.paragraph, claimText);
  const rewritten = picked ? stripLeadingMarker(picked.sentence) : "";
  if (!rewritten) return { outcome: "no_owning_paragraph", bestScore: owning.score };
  return {
    outcome: "found",
    paragraphScore: owning.score,
    paragraph: owning.paragraph,
    sentence: picked.sentence,
    sentenceScore: picked.score,
    newClaimText: rewritten,
    sectionId: owning.sectionId,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// STEP E — RECLASSIFY. The residue: a FACT claim STEP A could not resource (its span is nowhere in any
// of the three ranked buckets, including the corpus pool) and GROUND could not ground anywhere among the
// item's own captures either. Re-kinding FACT -> ANALYSIS is the honest disposition the labeling
// discipline exists for — the item stops asserting as fact something no source states, and the
// re-kinded claim is left for STEP D to label like any other ANALYSIS claim.
//
// `claim_text` (FOURTH PASS, 2026-09-03): unchanged when it is ALREADY discoverable (locateSpanInText) in
// the claim's own section — byte-identical to HEAL-2/HEAL-3's own behavior, the case the "STEP E + D
// together" test already covers. Otherwise (the measured defect: a paraphrase findable nowhere in the
// section) `planOwningParagraphRewrite` above supplies a VERBATIM replacement, or this step REFUSES to
// re-kind at all — see this file's header FOURTH PASS section for the full design and the threshold.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/** Which of GROUND's / RESOURCE's per-claim outcomes name a FACT claim as unrecoverable (nowhere any
 *  capture verifies it) — the STEP E candidate set. Pure. */
export function reclassifyReason(groundOutcome, resourceOutcome) {
  if (groundOutcome === "ungrounded_after_capture") return "span_not_found_anywhere";
  if (resourceOutcome === "unresourced") return "floor_unresourceable";
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// STEP 9 — GATE A. buildGateARow is write-item.ts's own wrapper over the live scanner (gate-a-scan.mjs) —
// imported unmodified; this file only decides insert-vs-update (the table's PK is intelligence_item_id).
// Runs ONCE, after every claim/section write (SLOTS through RELABEL) — write-item.ts's own write-order
// discipline (gate-A state has no trigger; the LAST claim/section write plus the terminal RE-DERIVE touch
// are what actually fire set_provenance_status, so gate-A only needs to be CURRENT by then, not first).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

// SEVENTH PASS (2026-09-04, lane HEAL-6) — Gate B, mirrored in memory. See this file's header SEVENTH PASS
// section for the full diagnosis (criterion 7, 88 items) and the REFUSED note on why this stays dormant in
// production until scripts/maintenance/provenance-heal.mjs's own readClaims SELECT gains basis_claim_id.

/** In-memory mirror of gate-a-derived.mjs's own `derivedCoveredTokens` (the LIVE Gate B DB lookup) — same
 *  contract: a normalized token is "derived-covered" iff a `claim_kind='DERIVED'` claim carries it AND its
 *  `basis_claim_id` resolves to a `claim_kind='FACT'` claim in `claims` AND that FACT's `source_span`
 *  still VERBATIM-matches (case-insensitive) its capture's `result_content` in `captures`. Computed
 *  PURELY from `claims`/`captures` this file already holds (deps.readClaims/deps.readCaptures) — no new
 *  deps call, per this file's own DI/DRY/$0 mandate. Pure. Returns an empty Set when there are no DERIVED
 *  claims, or (live, today) when the wrapper's own SELECT does not project `basis_claim_id` — see the
 *  REFUSED note above. */
export function computeDerivedCovered(claims, captures) {
  const covered = new Set();
  const derived = (claims ?? []).filter((c) => c.claim_kind === "DERIVED");
  if (!derived.length) return covered;
  const byId = new Map((claims ?? []).map((c) => [c.id, c]));
  const capById = new Map((captures ?? []).map((cap) => [cap.id, cap.result_content ?? ""]));
  for (const d of derived) {
    const basis = d.basis_claim_id ? byId.get(d.basis_claim_id) : null;
    if (!basis || basis.claim_kind !== "FACT" || !basis.source_span) continue; // basis missing/not-FACT/spanless -> not covered
    if (!capById.has(basis.search_result_id)) continue; // basis has no capture on record -> not covered
    const cap = capById.get(basis.search_result_id);
    if (!String(cap).toLowerCase().includes(String(basis.source_span).toLowerCase())) continue; // stale -> re-grounds-never-destroy, drop
    covered.add(norm(d.claim_text));
  }
  return covered;
}

/** The item_gate_a_state row for `item`'s CURRENT full_brief and CURRENT FACT claims, crediting
 *  `derivedCovered` (Gate B — computeDerivedCovered above, SEVENTH PASS) exactly as the live
 *  canonical-pipeline.ts already does at mint time. Pure (buildGateARow is pure — the live scanner is pure
 *  text computation, no I/O). `derivedCovered` defaults to an empty Set so every existing call site/test
 *  that omits it behaves byte-identically to before this pass. */
export function planGateA(item, claims, derivedCovered = new Set()) {
  const factClaims = (claims ?? [])
    .filter((c) => c.claim_kind === "FACT")
    .map((c) => ({ claim_text: c.claim_text ?? "", source_span: c.source_span ?? "" }));
  return buildGateARow({ itemId: item.id, fullBrief: item.full_brief ?? "", factClaims, derivedCovered });
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// STEP 10 — RE-DERIVE. Same touch rederive-record-provenance.mjs uses; the trigger, not this module,
// writes provenance_status.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/** True when an `archived-unreasoned`-selected item that just re-derived `verified` should be
 *  un-archived (archive_reason stays null — this file never invents one). Pure. */
export function shouldUnarchive(selectionMode, freshStatus, item) {
  return selectionMode === "archived-unreasoned" && freshStatus === "verified" && item.is_archived === true;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// SELECTION
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/** Parse `--arg` into this runtime's selection shape. Pure. */
// TENTH PASS (2026-09-04, lane HEAL-10) suffix -- an explicit, opt-in token appended to ANY existing
// selection form, gating the brief-honest strip's (and its RELABEL-from-full-brief sibling's) WRITE
// behavior in apply mode -- see planBriefHonest/healOneItem's own STEP BRIEF-HONEST header for the full
// dry-by-default contract. Every existing selection form's OWN meaning (mode/ids) is unchanged either way;
// this only adds one boolean the caller reads off `selection.stripUnprovable`.
const STRIP_UNPROVABLE_SUFFIX = "+strip-unprovable";

/** Parse `--arg` into this runtime's selection shape. Pure. */
export function parseSelection(arg) {
  let raw = String(arg ?? "").trim();
  let stripUnprovable = false;
  if (raw.endsWith(STRIP_UNPROVABLE_SUFFIX)) {
    stripUnprovable = true;
    raw = raw.slice(0, -STRIP_UNPROVABLE_SUFFIX.length).trim();
  }
  if (!raw || raw === "quarantined-live") return { ok: true, mode: "quarantined-live", ids: null, stripUnprovable };
  if (raw === "archived-unreasoned") return { ok: true, mode: "archived-unreasoned", ids: null, stripUnprovable };
  if (raw === "slots-backfill") return { ok: true, mode: "slots-backfill", ids: null, stripUnprovable };
  // kit-backfill (Lane KIT-BACKFILL, 2026-09-05, W2.3/W2.4): the SAME slot-missing narrowing
  // slots-backfill already does, generalized two ways — (1) every item_type item-type-required-slots.json
  // has an entry for (not only market_signal/initiative/research_finding), so the 575 one-or-two-FACT
  // regulation-family/initiative items outside those three types are reachable too; (2) archived items are
  // included (see resolveKitBackfillCandidates's own header and migration-299-precheck.mjs's header for why
  // an archived-but-verified item is not inert to criterion 5) — this is what actually closes migration
  // 299's guard to N=0 for the 62 of the 149 that are archived, which slots-backfill's own narrower,
  // non-archived-only candidate set cannot reach. slots-backfill's existing selection/behavior/tests are
  // UNCHANGED — see resolveKitBackfillCandidates below.
  if (raw === "kit-backfill") return { ok: true, mode: "kit-backfill", ids: null, stripUnprovable };
  if (raw.startsWith("ids:")) {
    const ids = raw.slice(4).split(",").map((s) => s.trim()).filter(Boolean);
    if (!ids.length) return { ok: false, error: '--arg "ids:<uuid,uuid,...>" requires at least one id.' };
    return { ok: true, mode: "ids", ids, stripUnprovable };
  }
  return {
    ok: false,
    error:
      `unrecognized --arg ${JSON.stringify(String(arg ?? "").trim())} (expected blank/"quarantined-live", ` +
      `"archived-unreasoned", "ids:<uuid,uuid,...>", "slots-backfill", or "kit-backfill", each optionally ` +
      `suffixed "${STRIP_UNPROVABLE_SUFFIX}").`,
  };
}

/** Every real (non-meta, i.e. not "_comment"/"_grade_note"/"_intake_note"-prefixed) item_type key in a
 *  requiredSlotsMap shaped like item-type-required-slots.json. Pure. */
export function requiredSlotItemTypes(requiredSlotsMap) {
  return Object.keys(requiredSlotsMap ?? {}).filter((k) => !k.startsWith("_"));
}

/** THE generalized slot-missing candidate resolver both slots-backfill and kit-backfill narrow through —
 *  every item `deps.readCandidateTypeItems(itemTypes, { includeArchived })` returns (verified; live unless
 *  `includeArchived`) that is ACTUALLY missing >=1 kit-required slot right now — narrowed here (not left to
 *  the caller) so a dispatch of either selection never runs the pipeline over an item that has nothing to
 *  backfill. `itemTypes` defaults to EVERY item_type item-type-required-slots.json has an entry for (the
 *  kit-backfill breadth); `includeArchived` defaults to false (the slots-backfill posture — an archived
 *  item is not "live" for that mode's own narrower intent). Grade-agnostic by design: the per-slot
 *  extractors this file's SLOTS step calls (buildSlotClaim) work off captured text alone, the same for a
 *  `record`- or `brief`-grade item (grep-verified 2026-09-05: no item_grade branch anywhere in that
 *  function or its callees) — matching precedent (`readCandidateTypeItems` itself has never filtered
 *  `item_grade`). */
export async function resolveKitBackfillCandidates(deps, requiredSlotsMap, opts = {}) {
  const itemTypes = opts.itemTypes ?? requiredSlotItemTypes(requiredSlotsMap);
  const includeArchived = opts.includeArchived ?? false;
  const items = await deps.readCandidateTypeItems(itemTypes, { includeArchived });
  const kept = [];
  for (const item of items) {
    const claims = await deps.readClaims(item.id);
    if (missingRequiredSlots(item.item_type, claims, requiredSlotsMap).length) kept.push(item);
  }
  return kept;
}

/** The slots-backfill candidate set: UNCHANGED (2026-09-03, lane HEAL-6) — every item
 *  deps.readCandidateTypeItems returns (market_signal / initiative / research_finding, verified, live)
 *  that is ACTUALLY missing >=1 kit-required slot right now. Now a thin call into the generalized
 *  resolveKitBackfillCandidates above (2026-09-05, lane KIT-BACKFILL) — same three item_types, same
 *  `includeArchived: false` default this mode always had — so this mode's own selection, behavior, and
 *  every existing test of it are byte-for-byte unchanged. */
export async function resolveSlotsBackfillCandidates(deps, requiredSlotsMap) {
  return resolveKitBackfillCandidates(deps, requiredSlotsMap, {
    itemTypes: ["market_signal", "initiative", "research_finding"],
  });
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// ORCHESTRATION — one item, ten steps, each reading what the previous wrote.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Heal ONE item through all ten steps. `deps` (all DB reads/writes + fetch, injected):
 *   fetchImpl, readCaptures(itemId), readClaims(itemId), readSections(itemId), readGateAState(itemId),
 *   readSourceUrl(sourceId), readCapturesByUrls(urls) -> corpus-pool agent_run_searches rows (a
 *   batch-scoped `.in("result_url", urls)` read, STEP A/C's bucket 3), readInstitutionByDomain(domain),
 *   insertInstitution(row) -> {id}, updateSourceInstitution(sourceId, institutionId) -> {...} (STEP B),
 *   validateProvenance(itemId) -> {valid, recommended_status, failures[]},
 *   insertSearch(row) -> {id, result_url}, insertClaim(row) -> {id},
 *   updateClaimSpan(id, patch) -> {...} (GROUND + STEP A source_span/source_id/search_result_id patches),
 *   updateClaimKind(id, patch) -> {...} (STEP E claim_kind re-kind), insertSection(row) -> {id, section_key},
 *   updateSectionContent(id, content_md) -> {...}, upsertGateA(row, exists:boolean) -> {...},
 *   touchItem(itemId) -> {...}, readProvenanceStatus(itemId) -> string|null, unarchiveItem(itemId) -> {...},
 *   updateItemBrief(itemId, fullBrief) -> {...} (TENTH PASS — STEP BRIEF-HONEST's own write; only ever
 *   called when apply && stripUnprovable, see that step's own header).
 * `stripUnprovable` (TENTH PASS, optional boolean): gates STEP BRIEF-HONEST's and STEP D's
 * RELABEL-from-full-brief write — threaded from `main()`'s own `selection.stripUnprovable`
 * (parseSelection's "+strip-unprovable" suffix). The PLAN is always computed/reported either way; this
 * only decides whether apply mode actually calls `deps.updateItemBrief`/`deps.updateSectionContent` for
 * those two branches specifically — every other write in this function is unaffected.
 * `sourcesIndex` ({byId, byCanonUrl}, see buildSourcesIndex) is read ONCE per RUN by main() and threaded
 * through every item — defaults to empty maps so a direct caller (tests) may omit it.
 * `captureIndexCache` (TENTH PASS, optional): a `Map` (capture id -> buildCaptureIndex's own shape),
 * threaded RUN-wide by main() exactly like `citedUrlCache` — defaults to a fresh, item-scoped Map when
 * omitted, so every existing direct call keeps its own isolated cache exactly as before this pass.
 * `deps.itemTimeBudgetSeconds`/`deps.now` (TENTH PASS, optional): a per-ITEM wall-clock cap (seconds),
 * distinct from main()'s own per-RUN budget — see `computeItemTimeBudgetSeconds`'s own header. Checked
 * only between orphan tokens in STEP SOURCE/STEP C (never mid-token), matching this file's established
 * "never mid-unit" contract; unset (the default — no `deps.itemTimeBudgetSeconds`) means no cap, and
 * `deps.now` is never read at all in that case, exactly like main()'s own run-level budget.
 * In dry mode (`apply:false`) every write/fetch is SKIPPED and reported as `would_*` — every read still
 * runs (dry mode plans against the item's REAL current captures/claims, per the brief); the local
 * claims/sections snapshots are only MUTATED to reflect a write when `apply` is true, so a later step's
 * dry-mode plan is never built against a write that never happened.
 */
export async function healOneItem(item, { deps, apply, selectionMode, requiredSlotsMap, sourcesIndex, citedUrlCache, captureIndexCache, stripUnprovable }) {
  const report = { id: item.id, item_type: item.item_type, steps: {} };
  const sIdx = sourcesIndex ?? { byId: new Map(), byCanonUrl: new Map() };
  // Run-level CAPTURE-CITED dedup cache (HEAL-BUDGET, SIXTH PASS). Defaults to a fresh, item-scoped Map
  // when no caller-shared one is threaded through (every existing direct healOneItem call in this file's
  // own tests), so this parameter is purely additive -- see this file's HEAL_VERSION header note.
  const runCitedCache = citedUrlCache ?? new Map();
  // Run-level capture-text index cache (TENTH PASS) -- see this function's own header note above and this
  // file's header TENTH PASS section for the measured basis.
  const runCaptureIndexCache = captureIndexCache ?? new Map();
  // Per-ITEM wall-clock cap (TENTH PASS) -- a defensive backstop under the cost fix above, for the case
  // this pass's own measurement did not anticipate (see computeItemTimeBudgetSeconds's own header). `now`
  // is read ONLY when a positive itemTimeBudgetSeconds is actually configured -- an unbudgeted item-level
  // call (every existing test, and any run with HEAL_TIME_BUDGET_SECONDS unset) never reads the clock here
  // at all, mirroring main()'s own run-level budget contract exactly.
  const itemNow = deps.now ?? (() => Date.now());
  const itemTimeBudgetMs = Number.isFinite(deps.itemTimeBudgetSeconds) && deps.itemTimeBudgetSeconds > 0
    ? deps.itemTimeBudgetSeconds * 1000
    : null;
  const itemStartedAt = itemTimeBudgetMs != null ? itemNow() : 0;
  const itemBudgetExceeded = () => itemTimeBudgetMs != null && itemNow() - itemStartedAt >= itemTimeBudgetMs;

  // ── 1. CAPTURE ──────────────────────────────────────────────────────────────────────────────────
  let captures = await deps.readCaptures(item.id);
  if (needsCapture(captures)) {
    const sourceUrlFallback = item.source_id ? await deps.readSourceUrl(item.source_id) : null;
    const url = resolveCaptureUrl(item, sourceUrlFallback);
    if (!url) {
      report.steps.capture = { outcome: "held", reason: "no_source_url" };
    } else if (!apply) {
      report.steps.capture = { outcome: "would_fetch", url };
    } else {
      const res = await captureItem(item, url, deps);
      if (res.status === "captured") {
        const row = buildCaptureSearchRow(item.id, res);
        const ins = await deps.insertSearch(row);
        captures = [...captures, { id: ins.id, result_url: row.result_url, result_content: row.result_content }];
        report.steps.capture = { outcome: "captured", url: res.url, length: res.text.length, search_id: ins.id, evidence: res.evidence };
      } else {
        report.steps.capture = res;
      }
    }
  } else {
    report.steps.capture = { outcome: "already_captured", captures: captures.length };
  }

  // ── 2. GROUND ───────────────────────────────────────────────────────────────────────────────────
  const claims = await deps.readClaims(item.id);
  const groundOutcomeByClaimId = new Map();
  const groundResults = [];
  for (const c of claims) {
    if (c.claim_kind !== "FACT") continue;
    const plan = planGroundingForClaim(c, captures, runCaptureIndexCache);
    groundOutcomeByClaimId.set(c.id, plan.outcome);
    if (plan.outcome === "healed") {
      if (apply) { await deps.updateClaimSpan(c.id, { source_span: plan.newSpan, search_result_id: plan.searchId }); c.source_span = plan.newSpan; }
      groundResults.push({ claim_id: c.id, outcome: apply ? "healed" : "would_heal", new_span: plan.newSpan, method: plan.method });
    } else if (plan.outcome !== "already_grounded") {
      groundResults.push({ claim_id: c.id, ...plan });
    }
  }
  report.steps.ground = groundResults;

  // ── SLOT-REPAIR (2026-09-03, THIRD PASS) — retroactive fix for HEAL-2's RECLASSIFY defect (see the
  //    SLOT MARKER section above): every ANALYSIS claim still carrying a required-slot marker is the
  //    residue of the PREVIOUS apply run's own mistake (RECLASSIFY had no marker awareness and re-kinded
  //    it there), never something this run itself just did (RECLASSIFY, below, no longer does this — see
  //    STEP E). Converted through the guarded path to the kit's own honest GAP for that slot (via
  //    buildSlotClaim with capturedText="" — the SAME extractor SLOTS/STEP 3 already calls, so the GAP
  //    wording this repair writes is byte-identical to what a fresh honest-absence write would produce,
  //    never a hand-duplicated string). Runs BEFORE RELABEL so a repaired claim (now GAP, not ANALYSIS)
  //    is correctly excluded from RELABEL's own ANALYSIS loop. ──────────────────────────────────────
  const slotRepairResults = [];
  for (const c of claims) {
    if (c.claim_kind !== "ANALYSIS") continue;
    const slotKey = extractSlotKeyFromMarker(c.claim_text);
    if (!slotKey || !(requiredSlotsMap[item.item_type] ?? []).includes(slotKey)) continue;
    const gapClaim = buildSlotClaim({ slotKey, itemType: item.item_type, capturedText: "", sourceUrl: item.source_url });
    if (apply) {
      await deps.updateClaimKind(c.id, {
        claim_kind: "GAP", claim_text: gapClaim.claim_text,
        source_span: null, source_id: null, search_result_id: null, source_tier_at_grounding: null,
      });
      c.claim_kind = "GAP"; c.claim_text = gapClaim.claim_text; c.source_span = null; c.source_id = null;
    }
    slotRepairResults.push({ claim_id: c.id, slot_key: slotKey, outcome: apply ? "repaired_to_gap" : "would_repair_to_gap" });
  }
  report.steps.slot_repair = slotRepairResults;

  // ── sections, read ONCE, reused (and kept in sync) by SLOTS / STEP C / STEP D below ────────────────
  const sectionsList = await deps.readSections(item.id);
  const findOrCreateRecordFactsSection = async () => {
    const existing = sectionsList.find((s) => s.section_key === "record_facts");
    if (existing) return existing.id;
    const order = sectionsList.length ? Math.max(...sectionsList.map((s) => s.section_order ?? 0)) + 1 : 2;
    const ins = await deps.insertSection({ item_id: item.id, section_key: "record_facts", section_order: order, content_md: "", is_conditional: false });
    sectionsList.push({ id: ins.id, item_id: item.id, section_key: "record_facts", section_order: order, content_md: "" });
    return ins.id;
  };

  // ── 3. SLOTS ────────────────────────────────────────────────────────────────────────────────────
  const missingSlots = missingRequiredSlots(item.item_type, claims, requiredSlotsMap);
  const slotResults = [];
  if (missingSlots.length) {
    const capturedText = bestCaptureText(captures);
    if (!capturedText) {
      for (const slotKey of missingSlots) slotResults.push({ slot_key: slotKey, outcome: "held_no_capture" });
    } else {
      let sectionId = apply ? await findOrCreateRecordFactsSection() : null;
      const sectionAppend = [];
      for (const slotKey of missingSlots) {
        const claim = buildSlotClaim({ slotKey, itemType: item.item_type, capturedText, sourceUrl: item.source_url });
        if (apply) {
          const isFact = claim.claim_kind === "FACT";
          const row = {
            section_row_id: sectionId,
            intelligence_item_id: item.id,
            claim_text: claim.claim_text,
            claim_kind: claim.claim_kind,
            source_span: claim.source_span ?? null,
            source_id: isFact ? (item.source_id ?? null) : null,
            search_result_id: isFact ? findSearchIdForSpan(claim.source_span, captures) : null,
            source_tier_at_grounding: isFact ? (item.source_tier ?? null) : null,
          };
          const ins = await deps.insertClaim(row);
          claims.push({ id: ins.id, claim_kind: row.claim_kind, claim_text: row.claim_text, source_span: row.source_span, source_id: row.source_id, section_row_id: sectionId });
          sectionAppend.push(claim.claim_text);
          slotResults.push({ slot_key: slotKey, claim_kind: claim.claim_kind, outcome: "written", claim_id: ins.id });
        } else {
          slotResults.push({ slot_key: slotKey, claim_kind: claim.claim_kind, outcome: "would_write" });
        }
      }
      if (apply && sectionAppend.length) {
        const sec = sectionsList.find((s) => s.id === sectionId);
        const newContent = [sec?.content_md ?? "", ...sectionAppend].filter(Boolean).join("\n");
        await deps.updateSectionContent(sectionId, newContent);
        if (sec) sec.content_md = newContent;
      }
    }
  }
  report.steps.slots = slotResults;

  // ── STEP B — OWN-BODY ───────────────────────────────────────────────────────────────────────────
  let itemSource = item.source_id ? sIdx.byId.get(item.source_id) ?? null : null;
  let ownBodyResult = { outcome: "not_applicable" };
  if (itemSource && itemSource.institution_id == null) {
    const key = resolveInstitutionKeyForSource(itemSource);
    if (!key) {
      ownBodyResult = { outcome: "unresolved", reason: "unparseable_source_url" };
    } else if (!apply) {
      ownBodyResult = { outcome: "would_resolve", key };
    } else {
      let inst = await deps.readInstitutionByDomain(key);
      if (!inst) inst = await deps.insertInstitution({ name: hostOf(itemSource.url) || key, registrable_domain: key });
      await deps.updateSourceInstitution(itemSource.id, inst.id);
      itemSource = { ...itemSource, institution_id: inst.id };
      sIdx.byId.set(itemSource.id, itemSource); // reflect in the shared index so claimNeedsResource's own-body scoping sees it this run
      ownBodyResult = { outcome: "resolved", institution_id: inst.id, key };
    }
  }
  report.steps.own_body = ownBodyResult;

  // ── CAPTURE-CITED (2026-09-03, THIRD PASS) — broaden the capture pool over every URL the item's
  //    sections/claims already cite, BEFORE RESOURCE/ORPHANS run (see this file's CAPTURE-CITED header
  //    above). New capture rows land in the shared `captures` array so STEP A/RESOURCE's own bucket
  //    builders (which iterate the full `captures` array) pick them up with no further wiring. ────────
  const citedCandidates = collectCitedUrls({ sections: sectionsList, claims, sourcesIndex: sIdx });
  const citedToFetch = unfetchedCitedUrls(citedCandidates, captures);
  const citedBound = citedToFetch.slice(0, CAPTURE_CITED_MAX_PER_ITEM);
  const citedOverflow = citedToFetch.length - citedBound.length;
  const captureCitedResults = [];
  let citedCacheHits = 0;
  for (const url of citedBound) {
    if (!apply) { captureCitedResults.push({ url, outcome: "would_fetch" }); continue; }
    // HEAL-BUDGET dedup: the SAME cited url, resolved once already THIS RUN (by this item or an earlier
    // one), is never fetched/archive-queried a second time -- see this file's HEAL_VERSION header note
    // for why this is scoped to captureCitedUrl only, and why it is strictly more polite, never less
    // evidenced (the per-item agent_run_searches INSERT below still runs unconditionally).
    const cacheKey = canonicalizeCitationUrl(url) ?? url;
    let res;
    let cacheHit = false;
    if (runCitedCache.has(cacheKey)) {
      res = runCitedCache.get(cacheKey);
      cacheHit = true;
      citedCacheHits += 1;
    } else {
      res = await captureCitedUrl(url, deps);
      runCitedCache.set(cacheKey, res);
    }
    if (res.status === "captured") {
      const row = buildCaptureSearchRow(item.id, res, new Date().toISOString(), "heal-provenance:capture-cited");
      const ins = await deps.insertSearch(row);
      // NINTH PASS (lane HEAL-8) finding: STEP SOURCE's own candidate URLs (candidateUrlsForOrphan ->
      // collectCitedUrls) are drawn from the SAME cited-URL pool THIS step already fetches, so by the time
      // STEP SOURCE runs its own "already captured, no fetch" branch fires for almost every direct
      // candidate — CAPTURE-CITED got there first. Without this `html` field, STEP SOURCE's ONE-HOP FOLLOW
      // (which only ever works off a page THIS RUN fetched live) would be starved in exactly the realistic
      // case it exists for. `html` is additive, in-memory-only for the lifetime of this run's `captures`
      // array — never part of `row` (buildCaptureSearchRow, unchanged) and never persisted to any stored
      // column (ADR-016: only `result_content`, the stripped text, is ever stored).
      captures.push({ id: ins.id, result_url: row.result_url, result_content: row.result_content, html: res.html ?? null });
      captureCitedResults.push({ url, outcome: "captured", length: res.text.length, search_id: ins.id, evidence: res.evidence, cache_hit: cacheHit });
    } else {
      captureCitedResults.push({ url, outcome: "held", reason: res.reason, evidence: res.evidence ?? null, cache_hit: cacheHit });
    }
  }
  report.steps.capture_cited = {
    candidates: citedCandidates.length,
    to_fetch: citedToFetch.length,
    fetched: citedBound.length,
    bound_hit: citedOverflow > 0,
    overflow: Math.max(citedOverflow, 0),
    cache_hits: citedCacheHits,
    results: captureCitedResults,
  };

  // ── STEP A — RESOURCE (buckets also serve STEP C/ORPHANS below) ────────────────────────────────────
  const ownBucket = buildOwnCanonicalBucket(item, captures);
  const floor = floorMaxFor(item.item_type);
  const tierBucket = buildTierQualifyingBucket(item, captures, sIdx, floor, ownBucket.map((b) => b.id));
  const itemSourceTier = deriveSourceTier(itemSource);
  const needsAnyResource = claims.some((c) => claimNeedsResource(c, item, sIdx));
  const gateRowEarlyEstimate = planGateA(item, claims, computeDerivedCovered(claims, captures)); // cheap/pure — only to decide whether corpus_pool is worth a read
  let corpusBucket = [];
  if (item.source_url && (needsAnyResource || gateRowEarlyEstimate.orphan_count > 0)) {
    const corpusCaptures = await deps.readCapturesByUrls(buildUrlVariants(item.source_url));
    corpusBucket = buildCorpusPoolBucket(item, corpusCaptures, itemSourceTier, floor, item.id);
  }
  const resourceBuckets = [...ownBucket, ...tierBucket, ...corpusBucket];
  const resourceOutcomeByClaimId = new Map();
  const resourceResults = [];
  for (const c of claims) {
    if (!claimNeedsResource(c, item, sIdx)) continue;
    const plan = planResourceForClaim(c, resourceBuckets, runCaptureIndexCache);
    resourceOutcomeByClaimId.set(c.id, plan.outcome);
    if (plan.outcome === "resourced") {
      if (apply) {
        await deps.updateClaimSpan(c.id, { source_span: plan.newSpan, search_result_id: plan.searchId, source_id: plan.sourceId });
        c.source_span = plan.newSpan;
        c.source_id = plan.sourceId;
      }
      resourceResults.push({ claim_id: c.id, outcome: apply ? "resourced" : "would_resource", new_span: plan.newSpan, method: plan.method, source_id: plan.sourceId, bucket: plan.bucket });
    } else {
      resourceResults.push({ claim_id: c.id, outcome: "unresourced", fuzzy: plan.fuzzy });
    }
  }
  report.steps.resource = resourceResults;

  // ── STEP E — RECLASSIFY (the residue GROUND + RESOURCE could not verify anywhere). A required-slot
  //    FACT claim (the "[<slot_key>] " marker, member of item.item_type's own required-slots list) is
  //    NEVER re-kinded to ANALYSIS here (2026-09-03 THIRD PASS fix — see the SLOT MARKER section above):
  //    ANALYSIS is how a SYNTHESIZED interpretation enters a payload; a required-slot marker is never
  //    that, and re-kinding it to ANALYSIS silently drops it from criterion 5's FACT/GAP coverage (the
  //    missing_required_slot regression this fixes). Its honest disposition is the kit's own GAP for that
  //    slot instead — via buildSlotClaim, the same extractor SLOTS/STEP 3 and SLOT-REPAIR above already
  //    call, so this never hand-duplicates GAP wording. Every other FACT claim keeps the original
  //    ANALYSIS disposition, unchanged. ──────────────────────────────────────────────────────────────
  const reclassifyResults = [];
  for (const c of claims) {
    if (c.claim_kind !== "FACT") continue;
    const reason = reclassifyReason(groundOutcomeByClaimId.get(c.id), resourceOutcomeByClaimId.get(c.id));
    if (!reason) continue;
    const slotKey = extractSlotKeyFromMarker(c.claim_text);
    const isRequiredSlot = !!slotKey && (requiredSlotsMap[item.item_type] ?? []).includes(slotKey);
    if (isRequiredSlot) {
      const gapClaim = buildSlotClaim({ slotKey, itemType: item.item_type, capturedText: "", sourceUrl: item.source_url });
      if (apply) {
        await deps.updateClaimKind(c.id, {
          claim_kind: "GAP", claim_text: gapClaim.claim_text,
          source_span: null, source_id: null, search_result_id: null, source_tier_at_grounding: null,
        });
        c.claim_kind = "GAP"; c.claim_text = gapClaim.claim_text; c.source_span = null; c.source_id = null;
      }
      reclassifyResults.push({ claim_id: c.id, claim_text: c.claim_text, slot_key: slotKey, reason, outcome: apply ? "reclassified_to_gap" : "would_reclassify_to_gap" });
      continue;
    }
    // FOURTH PASS (2026-09-03): claim_text is rewritten to a verbatim substring of the claim's own section
    // ONLY when it is not already discoverable there — see this file's header FOURTH PASS section and the
    // OWNING-PARAGRAPH REWRITE section above for the full mechanism/threshold. `ownSection` is looked up by
    // `section_row_id` (never a whole-item scan) — the dispatch's own scoping.
    const ownSection = c.section_row_id ? sectionsList.find((s) => s.id === c.section_row_id) ?? null : null;
    const alreadyFindable = ownSection ? locateSpanInText(c.claim_text, ownSection.content_md) : null;
    if (alreadyFindable) {
      if (apply) { await deps.updateClaimKind(c.id, { claim_kind: "ANALYSIS" }); c.claim_kind = "ANALYSIS"; }
      reclassifyResults.push({ claim_id: c.id, claim_text: c.claim_text, reason, outcome: apply ? "reclassified" : "would_reclassify" });
      continue;
    }
    let rewrite = ownSection ? planOwningParagraphRewrite(c.claim_text, ownSection.content_md) : { outcome: "no_owning_paragraph", bestScore: 0 };
    let wonSectionId = ownSection ? ownSection.id : null;
    let crossSection = false;
    // SEVENTH PASS (2026-09-04, lane HEAL-6): criterion 4's own SQL scope is ITEM-WIDE, not the claim's
    // own section — see this file's header SEVENTH PASS section for the measured 100/148 (68%) claims
    // this widening resolves. Tried ONLY after the own-section search above refuses, never instead of it.
    if (rewrite.outcome !== "found") {
      const wide = planOwningParagraphRewriteAcrossSections(c.claim_text, sectionsList, OWNING_PARAGRAPH_MIN_SCORE);
      if (wide.outcome === "found") {
        rewrite = wide; wonSectionId = wide.sectionId; crossSection = true;
      } else if (wide.bestScore > rewrite.bestScore) {
        rewrite = wide; // report the wider search's own best score when it beats the own-section one — honest telemetry even on a refusal
      }
    }
    if (rewrite.outcome !== "found") {
      // REFUSE — leave the claim exactly as it is (still FACT, still failing its original criterion-3
      // reason). Never force an unvalidatable ANALYSIS claim into existence (rule 2: no claims ahead of
      // evidence). The best score is reported so the artifact tells the truth about how close it came.
      reclassifyResults.push({
        claim_id: c.id, claim_text: c.claim_text, reason, outcome: "reclassify_refused_no_owning_paragraph",
        best_score: rewrite.bestScore, section_id: ownSection ? ownSection.id : null,
      });
      continue;
    }
    const claimTextBefore = c.claim_text;
    const movedSection = crossSection && wonSectionId !== c.section_row_id;
    if (apply) {
      const patch = { claim_kind: "ANALYSIS", claim_text: rewrite.newClaimText };
      if (movedSection) patch.section_row_id = wonSectionId;
      await deps.updateClaimKind(c.id, patch);
      c.claim_kind = "ANALYSIS"; c.claim_text = rewrite.newClaimText;
      if (movedSection) c.section_row_id = wonSectionId;
    }
    reclassifyResults.push({
      claim_id: c.id, reason, outcome: apply ? "reclassified" : "would_reclassify", rewritten: true,
      claim_text_before: claimTextBefore, claim_text_after: rewrite.newClaimText,
      paragraph_score: rewrite.paragraphScore, sentence_score: rewrite.sentenceScore, section_id: wonSectionId,
      cross_section: crossSection,
    });
  }
  report.steps.reclassify = reclassifyResults;

  // ── RETROFIT (2026-09-03, FOURTH PASS) — the 365 claims HEAL-2/HEAL-3's OWN RECLASSIFY already
  //    re-kinded FACT -> ANALYSIS in a PRIOR apply run, sitting in the DB right now with claim_text still
  //    the original (unverifiable-paraphrase) wording. Candidate set: claim_kind='ANALYSIS' with a
  //    NON-NULL source_span — the residue's own fingerprint (a genuinely mint-time ANALYSIS claim's
  //    source_span is null UNLESS it is mint-time "GROUNDED ANALYSIS", which is ALREADY verbatim-in-a-
  //    labeled-section by construction — see this file's header FOURTH PASS section for why that overlap
  //    is safe: the "already findable" pre-check below makes a legitimate GROUNDED ANALYSIS claim a
  //    correct no-op here, never touched). Same paragraph/sentence rewrite as STEP E above, or the same
  //    honest refusal — never a second implementation of either. ──────────────────────────────────────
  const retrofitResults = [];
  for (const c of claims) {
    if (c.claim_kind !== "ANALYSIS" || c.source_span == null) continue;
    const ownSection = c.section_row_id ? sectionsList.find((s) => s.id === c.section_row_id) ?? null : null;
    if (ownSection && locateSpanInText(c.claim_text, ownSection.content_md)) continue; // already validatable, nothing to do
    let rewrite = ownSection ? planOwningParagraphRewrite(c.claim_text, ownSection.content_md) : { outcome: "no_owning_paragraph", bestScore: 0 };
    let wonSectionId = ownSection ? ownSection.id : null;
    let crossSection = false;
    // SEVENTH PASS (2026-09-04, lane HEAL-6) — same item-wide widening as STEP E above, same guard, same
    // "own-section first, wider only on refusal" order. See that step's own comment for the full rationale.
    if (rewrite.outcome !== "found") {
      const wide = planOwningParagraphRewriteAcrossSections(c.claim_text, sectionsList, OWNING_PARAGRAPH_MIN_SCORE);
      if (wide.outcome === "found") {
        rewrite = wide; wonSectionId = wide.sectionId; crossSection = true;
      } else if (wide.bestScore > rewrite.bestScore) {
        rewrite = wide;
      }
    }
    if (rewrite.outcome !== "found") {
      retrofitResults.push({
        claim_id: c.id, claim_text: c.claim_text, outcome: "retrofit_refused_no_owning_paragraph",
        best_score: rewrite.bestScore, section_id: ownSection ? ownSection.id : null,
      });
      continue;
    }
    const claimTextBefore = c.claim_text;
    const movedSection = crossSection && wonSectionId !== c.section_row_id;
    if (apply) {
      const patch = { claim_text: rewrite.newClaimText };
      if (movedSection) patch.section_row_id = wonSectionId;
      await deps.updateClaimKind(c.id, patch);
      c.claim_text = rewrite.newClaimText;
      if (movedSection) c.section_row_id = wonSectionId;
    }
    retrofitResults.push({
      claim_id: c.id, outcome: apply ? "retrofitted" : "would_retrofit",
      claim_text_before: claimTextBefore, claim_text_after: rewrite.newClaimText,
      paragraph_score: rewrite.paragraphScore, sentence_score: rewrite.sentenceScore, section_id: wonSectionId,
      cross_section: crossSection,
    });
  }
  report.steps.retrofit = retrofitResults;

  // ── orphanFallbackSectionId — hoisted (was STEP C's own local): the SAME fallback "record_facts"
  //    section id, shared by STEP SOURCE and STEP C/ORPHANS below, so the two steps never create TWO
  //    separate fallback sections in the same run. ────────────────────────────────────────────────
  let orphanFallbackSectionId = null;

  // ── STEP SOURCE (2026-09-04, EIGHTH PASS, lane HEAL-7) — see this file's header EIGHTH PASS section.
  //    Scanned BEFORE STEP C's own (unchanged) buckets-only search, over the SAME fresh gate-A orphan
  //    list, so a token this step grounds simply is not an orphan any more by the time STEP C's OWN
  //    fresh planGateA scan runs (claims mutates in place; no separate "remove from orphan list" needed
  //    anywhere). Every candidate this step tries and every write it makes is reported per-token. ─────
  const gateRowForSource = planGateA(item, claims, computeDerivedCovered(claims, captures));
  const sourceResults = [];
  let sourceAttempts = 0;
  // NINTH PASS (2026-09-04, lane HEAL-8) budget accounting — see this file's header NINTH PASS section for
  // the measured basis. `sourceAttempts` charges: (1) a classification-only worklist/unresolvable-host
  // decision (no fetch, but still a real per-item slot spent — preserves the EIGHTH PASS bound_hit test's
  // own accounting unchanged); (2) a dry-mode plan (no fetch, mirrors what apply mode would spend); (3) a
  // genuine NEW network fetch, direct or one-hop. It does NOT charge an already-captured, USABLE (>200-char)
  // row for the exact URL being tried — that is a zero-cost, zero-network lookup, and charging it was
  // measured to starve genuinely free, high-value groundings on high-orphan items (one sampled item: 51
  // orphans, 47 free-lookup groundings available, most never attempted under the old accounting).
  for (const orphan of gateRowForSource.orphans ?? []) {
    // TENTH PASS item-level wall-clock backstop (see healOneItem's own header note) — checked BETWEEN
    // orphan tokens, never mid-token, matching this file's established "never mid-unit" contract. No-op
    // (never true) when deps.itemTimeBudgetSeconds is unset.
    if (itemBudgetExceeded()) {
      sourceResults.push({ token: orphan.token, class: orphan.class, outcome: "item_bound_hit" });
      continue;
    }
    if (sourceAttempts >= SOURCE_MAX_PER_ITEM) {
      sourceResults.push({ token: orphan.token, class: orphan.class, outcome: "bound_hit" });
      continue;
    }
    // Already coverable by STEP A's own (unchanged) floor-respecting buckets — leave it to STEP C, which
    // grounds it there for free, no new source needed.
    const alreadyCoverable = planOrphanGrounding(orphan, resourceBuckets, runCaptureIndexCache);
    if (alreadyCoverable.outcome === "found") continue;

    // ELEVENTH PASS (ATTACH-SOURCES) — a worklist a Haiku browser lane filled for THIS item/token, if the
    // attach-found-sources dispatch supplied one via deps.foundSourcesForItem; every OTHER caller (a plain
    // provenance-heal dispatch) never sets this dep, so foundEntries is always [] there — byte-identical.
    const foundEntries = deps.foundSourcesForItem ? (deps.foundSourcesForItem(item.id)?.[orphan.token] ?? []) : [];
    const foundUrls = foundEntries.map((f) => f.url);
    const candidateUrls = candidateUrlsForOrphan(orphan.token, { sections: sectionsList, claims, sourcesIndex: sIdx, foundUrls });
    if (!candidateUrls.length) {
      // Class D reporting (NINTH PASS): the sentence carries context for the coordinator/operator even
      // though no candidate URL exists to try at all — never invented, a literal slice of full_brief.
      sourceResults.push({ token: orphan.token, class: orphan.class, outcome: "no_candidate_url", sentence: extractSentenceContext(item.full_brief, orphan.token) });
      continue;
    }

    let grounded = false;
    let lastReason = null;
    for (const url of candidateUrls) {
      const cls = classifyCitedUrlForOrphan(url, sIdx);
      if (cls.status === "worklist_ambiguous_host" || cls.status === "unresolvable_host") {
        sourceAttempts += 1;
        lastReason = cls.status;
        sourceResults.push({ token: orphan.token, class: orphan.class, url, host: cls.host ?? null, outcome: cls.status });
        continue;
      }

      if (!apply) {
        sourceAttempts += 1;
        sourceResults.push({
          token: orphan.token, class: orphan.class, url,
          outcome: cls.status === "registerable" ? "would_register_and_capture" : "would_capture_and_ground",
          class_tier: cls.tier ?? null,
        });
        continue; // dry mode: plan every candidate, write nothing
      }

      // Ensure a usable capture of this exact URL — reuse an existing one (this item's own captures,
      // including whatever CAPTURE-CITED already added this run) before fetching a new one. The SAME
      // run-level dedup cache CAPTURE-CITED threads through (runCitedCache) is reused here too, so a
      // URL two different orphans (or two different items) cite in the SAME run is never fetched twice.
      // NINTH PASS: an existing row must also be USABLE (>200 trimmed chars, the file's own established
      // floor — needsCapture/bestCaptureText) to count as "already captured"; a thin/blocked pre-existing
      // capture (Class C — cookie wall, JS shell, 404, or a shorter earlier capture) is treated as NOT YET
      // captured and falls through to a real re-fetch below, which is Wayback-aware via captureCitedUrl.
      const capCanon = canonicalizeCitationUrl(url);
      let cap = capCanon
        ? captures.find((c) => c.result_url && canonicalizeCitationUrl(c.result_url) === capCanon && String(c.result_content ?? "").trim().length > 200)
        : null;
      // ONE-HOP FOLLOW: raw html of a page THIS RUN fetched live — either just now (below) or earlier this
      // SAME run by CAPTURE-CITED (whose own captures.push also carries `.html`, NINTH PASS finding: the
      // candidate URLs STEP SOURCE tries are drawn from the SAME cited-URL pool CAPTURE-CITED already
      // fetched, so `cap` is found pre-existing here far more often than freshly fetched below). `cap.html`
      // is undefined (never `null`-coerced away) on any row loaded from `deps.readCaptures()` at the top of
      // the run — a real DB row never carries it — so a stale DB capture never feeds a one-hop, only ever a
      // page fetched THIS run, by either step.
      let hopHtml = cap?.html ?? null;
      if (!cap) {
        sourceAttempts += 1;
        const cacheKey = capCanon ?? url;
        let res;
        if (runCitedCache.has(cacheKey)) {
          res = runCitedCache.get(cacheKey);
        } else {
          res = await captureCitedUrl(url, deps);
          runCitedCache.set(cacheKey, res);
        }
        if (res.status !== "captured") {
          lastReason = "unfetchable";
          sourceResults.push({ token: orphan.token, class: orphan.class, url, outcome: "unfetchable", reason: res.reason, evidence: res.evidence ?? null });
          continue;
        }
        const row = buildCaptureSearchRow(item.id, res, new Date().toISOString(), "heal-provenance:source");
        const ins = await deps.insertSearch(row);
        cap = { id: ins.id, result_url: row.result_url, result_content: row.result_content, html: res.html ?? null };
        captures.push(cap);
        hopHtml = cap.html;
      }

      let sourceId = cls.status === "already_registered" ? cls.sourceId : null;
      let sourceTier = cls.status === "already_registered" ? cls.tier : null;
      let registerOutcome = "already_registered";
      if (cls.status === "registerable") {
        const reg = await deps.registerSource({ url, name: cls.host, base_tier: cls.tier });
        sourceId = reg.source_id;
        registerOutcome = reg.created ? "source_registered" : "source_already_existed";
        // Read back the REAL row (registerSource dedups by institutionKey, so a match may sit at a
        // different exact URL than the one just classified) — never trust the class table's own
        // predicted tier once a real row can be read. Also folds into sIdx for the rest of THIS run so a
        // second orphan citing the same host in the same item (or a later item) inherits it for free.
        const real = await deps.readSourceByUrl(url);
        if (real) {
          sourceTier = deriveSourceTier(real);
          sIdx.byId.set(real.id, real);
          const realCanon = real.url ? canonicalizeCitationUrl(real.url) : null;
          if (realCanon) sIdx.byCanonUrl.set(realCanon, real);
        } else {
          sourceTier = cls.tier; // defensive: registerSource reported success but the read-back missed it
        }
      }

      const found = locateSpanInTextCached(orphan.token, cap, runCaptureIndexCache);
      if (found) {
        let sectionId = (findOwningSection(orphan.token, sectionsList) ?? {}).id ?? orphanFallbackSectionId;
        if (!sectionId) { sectionId = await findOrCreateRecordFactsSection(); orphanFallbackSectionId = sectionId; }
        const claimRow = {
          section_row_id: sectionId,
          intelligence_item_id: item.id,
          claim_text: buildOrphanClaimText(orphan),
          claim_kind: "FACT",
          source_span: found.span,
          source_id: sourceId,
          search_result_id: cap.id,
          source_tier_at_grounding: sourceTier ?? null,
        };
        const ins = await deps.insertClaim(claimRow);
        claims.push({ id: ins.id, claim_kind: "FACT", claim_text: claimRow.claim_text, source_span: claimRow.source_span, source_id: sourceId, section_row_id: sectionId });
        // ELEVENTH PASS: `via`/`quote` are audit evidence ONLY — the quote is never the needle GROUND
        // located (that is always `found.span`, the verbatim token match on the fetched page above); this
        // just cross-references the worklist row a human/Haiku lane actually supplied for this outcome.
        const foundMatch = foundEntries.find((f) => f.url === url);
        sourceResults.push({
          token: orphan.token, class: orphan.class, url,
          outcome: cls.status === "registerable" ? "source_registered_and_grounded" : "grounded_on_existing_source",
          claim_id: ins.id, source_id: sourceId, source_tier: sourceTier, register: registerOutcome, match_method: found.method,
          ...(foundMatch ? { via: "worklist", quote: foundMatch.quote } : {}),
        });
        grounded = true;
        break;
      }

      // Class B ONE-HOP FOLLOW (NINTH PASS) — the direct candidate page does not itself carry the token.
      // Only possible off a page THIS RUN fetched live (hopHtml set); an already-captured row never carries
      // raw html (see envelopeToOutcome's own header note). Each eligible hop link is grounded with its OWN
      // registered+rated source, exactly like a direct candidate — never inherits the landing page's source.
      let hopGrounded = false;
      if (hopHtml) {
        for (const hopUrl of hopLinksForToken(hopHtml, url)) {
          if (sourceAttempts >= SOURCE_MAX_PER_ITEM) break;
          const hopCls = classifyCitedUrlForOrphan(hopUrl, sIdx);
          if (hopCls.status === "worklist_ambiguous_host" || hopCls.status === "unresolvable_host") {
            sourceAttempts += 1;
            continue; // SC-13 forbids inventing a tier for an ambiguous host, one hop or not
          }
          const hopCanon = canonicalizeCitationUrl(hopUrl);
          let hopCap = hopCanon
            ? captures.find((c) => c.result_url && canonicalizeCitationUrl(c.result_url) === hopCanon && String(c.result_content ?? "").trim().length > 200)
            : null;
          if (!hopCap) {
            sourceAttempts += 1;
            const hopCacheKey = hopCanon ?? hopUrl;
            let hopRes;
            if (runCitedCache.has(hopCacheKey)) {
              hopRes = runCitedCache.get(hopCacheKey);
            } else {
              hopRes = await captureCitedUrl(hopUrl, deps);
              runCitedCache.set(hopCacheKey, hopRes);
            }
            if (hopRes.status !== "captured") continue;
            const hopRow = buildCaptureSearchRow(item.id, hopRes, new Date().toISOString(), "heal-provenance:source:hop");
            const hopIns = await deps.insertSearch(hopRow);
            hopCap = { id: hopIns.id, result_url: hopRow.result_url, result_content: hopRow.result_content };
            captures.push(hopCap);
          }
          const hopFound = locateSpanInTextCached(orphan.token, hopCap, runCaptureIndexCache);
          if (!hopFound) continue;

          let hopSourceId = hopCls.status === "already_registered" ? hopCls.sourceId : null;
          let hopSourceTier = hopCls.status === "already_registered" ? hopCls.tier : null;
          let hopRegisterOutcome = "already_registered";
          if (hopCls.status === "registerable") {
            const hopReg = await deps.registerSource({ url: hopUrl, name: hopCls.host, base_tier: hopCls.tier });
            hopSourceId = hopReg.source_id;
            hopRegisterOutcome = hopReg.created ? "source_registered" : "source_already_existed";
            const hopReal = await deps.readSourceByUrl(hopUrl);
            if (hopReal) {
              hopSourceTier = deriveSourceTier(hopReal);
              sIdx.byId.set(hopReal.id, hopReal);
              const hopRealCanon = hopReal.url ? canonicalizeCitationUrl(hopReal.url) : null;
              if (hopRealCanon) sIdx.byCanonUrl.set(hopRealCanon, hopReal);
            } else {
              hopSourceTier = hopCls.tier;
            }
          }

          let hopSectionId = (findOwningSection(orphan.token, sectionsList) ?? {}).id ?? orphanFallbackSectionId;
          if (!hopSectionId) { hopSectionId = await findOrCreateRecordFactsSection(); orphanFallbackSectionId = hopSectionId; }
          const hopClaimRow = {
            section_row_id: hopSectionId,
            intelligence_item_id: item.id,
            claim_text: buildOrphanClaimText(orphan),
            claim_kind: "FACT",
            source_span: hopFound.span,
            source_id: hopSourceId,
            search_result_id: hopCap.id,
            source_tier_at_grounding: hopSourceTier ?? null,
          };
          const hopClaimIns = await deps.insertClaim(hopClaimRow);
          claims.push({ id: hopClaimIns.id, claim_kind: "FACT", claim_text: hopClaimRow.claim_text, source_span: hopClaimRow.source_span, source_id: hopSourceId, section_row_id: hopSectionId });
          sourceResults.push({
            token: orphan.token, class: orphan.class, url: hopUrl, hop_from: url,
            outcome: hopCls.status === "registerable" ? "source_registered_and_grounded_one_hop" : "grounded_on_existing_source_one_hop",
            claim_id: hopClaimIns.id, source_id: hopSourceId, source_tier: hopSourceTier, register: hopRegisterOutcome, match_method: hopFound.method,
          });
          grounded = true;
          hopGrounded = true;
          break;
        }
      }
      if (hopGrounded) break;

      lastReason = "token_not_in_page";
      sourceResults.push({ token: orphan.token, class: orphan.class, url, outcome: "token_not_in_page", source_id: sourceId, register: registerOutcome });
    }
    if (!grounded && apply) {
      // Class D reporting (NINTH PASS): the orphan's own enclosing sentence, never invented, so the
      // coordinator can hand the operator an actual sentence to read rather than a bare token.
      sourceResults.push({ token: orphan.token, class: orphan.class, outcome: "unresolved", last_reason: lastReason, sentence: extractSentenceContext(item.full_brief, orphan.token) });
    }
  }
  report.steps.source = sourceResults;

  // ── STEP C — ORPHANS (criterion 7) — a FRESH scan against claims post-RECLASSIFY/STEP SOURCE (both may
  //    have exposed or closed tokens), before this step's own inserts, so it names exactly what's missing
  //    right now. ─────────────────────────────────────────────────────────────────────────────────────
  const gateRowForOrphans = planGateA(item, claims, computeDerivedCovered(claims, captures));
  const orphanResults = [];
  for (const orphan of gateRowForOrphans.orphans ?? []) {
    // TENTH PASS item-level wall-clock backstop — see the identical check in STEP SOURCE's own loop above.
    if (itemBudgetExceeded()) {
      orphanResults.push({ token: orphan.token, class: orphan.class, outcome: "item_bound_hit" });
      continue;
    }
    const plan = planOrphanGrounding(orphan, resourceBuckets, runCaptureIndexCache);
    if (plan.outcome !== "found") {
      // Class D reporting (NINTH PASS): the orphan's own enclosing sentence, never invented, alongside
      // this step's own existing fuzzy-match evidence — see this file's header NINTH PASS section.
      orphanResults.push({ token: orphan.token, class: orphan.class, outcome: "unprovable", fuzzy: plan.fuzzy, sentence: extractSentenceContext(item.full_brief, orphan.token) });
      continue;
    }
    const owning = findOwningSection(orphan.token, sectionsList);
    if (!apply) {
      orphanResults.push({ token: orphan.token, class: orphan.class, outcome: "would_ground", bucket: plan.bucket });
      continue;
    }
    let sectionId = owning ? owning.id : orphanFallbackSectionId;
    if (!sectionId) { sectionId = await findOrCreateRecordFactsSection(); orphanFallbackSectionId = sectionId; }
    const claimRow = {
      section_row_id: sectionId,
      intelligence_item_id: item.id,
      claim_text: buildOrphanClaimText(orphan),
      claim_kind: "FACT",
      source_span: plan.span,
      source_id: plan.sourceId,
      search_result_id: plan.searchId,
      source_tier_at_grounding: deriveSourceTier(sIdx.byId.get(plan.sourceId)) ?? null,
    };
    const ins = await deps.insertClaim(claimRow);
    claims.push({ id: ins.id, claim_kind: "FACT", claim_text: claimRow.claim_text, source_span: claimRow.source_span, source_id: claimRow.source_id, section_row_id: sectionId });
    orphanResults.push({ token: orphan.token, class: orphan.class, outcome: "grounded", claim_id: ins.id, bucket: plan.bucket });
  }
  report.steps.orphans = orphanResults;

  // ── STEP BRIEF-HONEST (criterion 7; TENTH PASS, lane HEAL-10) — HEAL-6's own unbuilt ask. Once STEP
  //    SOURCE (above) has exhausted every cited URL AND STEP C (just above) has exhausted every capture
  //    for an orphan token and it is STILL unprovable, PLAN removing exactly that token's own enclosing
  //    sentence (or, when the sentence carries another still-tracked token, exactly its clause) from
  //    full_brief — see planBriefHonest's own header for the full accept/refuse contract. The PLAN is
  //    ALWAYS computed and reported (report.steps.brief_honest) whether or not anything is written; the
  //    WRITE itself is DRY BY DEFAULT and fires only when BOTH apply=true AND the dispatch's own selection
  //    carried the explicit "+strip-unprovable" token (parseSelection, above). item_grade doctrine
  //    (migration 278 / docs/plans/record-tier-population-plan-2026-09-01.md §2/§7, grepped by this lane):
  //    item_grade is UNCHANGED by this step either way — it only ever REMOVES prose from full_brief, the
  //    exact "brief grade = full_brief + claims pipeline" shape the item already carries; record-grade
  //    items have no full_brief-driven Gate A orphans to strip in the first place (FACT/GAP-only, no
  //    synthesized prose), so this step is a structural no-op for them. ─────────────────────────────────
  const unprovableTokensThisItem = orphanResults.filter((r) => r.outcome === "unprovable").map((r) => r.token);
  let briefHonestPlan = { outcome: "no_op", perToken: [] };
  if (unprovableTokensThisItem.length) {
    const factClaimsForBH = claims.filter((c) => c.claim_kind === "FACT");
    briefHonestPlan = planBriefHonest(item, unprovableTokensThisItem, factClaimsForBH, computeDerivedCovered(claims, captures));
  }
  const briefHonestApply = apply && !!stripUnprovable && briefHonestPlan.outcome === "accepted";
  if (briefHonestApply) {
    await deps.updateItemBrief(item.id, briefHonestPlan.newFullBrief);
    item.full_brief = briefHonestPlan.newFullBrief;
  }
  report.steps.brief_honest = {
    outcome: briefHonestPlan.outcome,
    applied: briefHonestApply,
    per_token: briefHonestPlan.perToken,
    restore_sql: briefHonestPlan.restore_sql ?? null,
    reason: briefHonestPlan.reason ?? null,
    orphan_count: briefHonestPlan.orphan_count ?? null,
  };

  // ── STEP D — RELABEL (criterion 4; the only prose this lane edits, and only by prepending a label).
  //    Owning-section/paragraph lookup is NORMALIZED (locateSpanInText — the SAME normaliser GROUND uses:
  //    whitespace runs, curly/straight quotes, HTML entities, case-insensitive fallback), not a raw
  //    literal `.includes()` (2026-09-03 THIRD PASS fix — see planRelabelParagraph's own header for why).
  //    Every claim that finds no owning section, OR whose owning section's own text no longer matches its
  //    claim_text under normalization (already-labeled, or genuinely absent), is reported
  //    `no_owning_section_found` with the claim id — never silently skipped. ─────────────────────────
  const relabelResults = [];
  for (const claim of claims) {
    if (claim.claim_kind !== "ANALYSIS") continue;
    const owning = sectionsList.find((s) => s.id === claim.section_row_id) ?? sectionsList.find((s) => locateSpanInText(claim.claim_text, s.content_md) != null);
    if (!owning) { relabelResults.push({ claim_id: claim.id, outcome: "no_owning_section_found" }); continue; }
    const plan = planRelabelParagraph(owning.content_md, claim.claim_text);
    if (!plan) {
      // TENTH PASS (Task 4, lane HEAL-10): the claim's registered section exists but doesn't literally
      // carry claim_text (already labeled by an earlier pass — the measured common case — or genuinely
      // absent from this section). Try the full-brief-sourced append (planRelabelFromFullBrief, above) —
      // null unless claim_text IS a literal substring of full_brief and absent from this section, the
      // narrow HEAL-6 case. Reporting always runs; the WRITE is gated behind the same "+strip-unprovable"
      // token as STEP BRIEF-HONEST (this is also new prose beyond the established prepend-a-label pattern).
      const fbPlan = planRelabelFromFullBrief(owning, claim.claim_text, item.full_brief);
      if (!fbPlan) { relabelResults.push({ claim_id: claim.id, section_id: owning.id, outcome: "no_owning_section_found" }); continue; }
      const fbApply = apply && !!stripUnprovable;
      if (fbApply) { await deps.updateSectionContent(owning.id, fbPlan.content_md); owning.content_md = fbPlan.content_md; }
      relabelResults.push({
        claim_id: claim.id, section_id: owning.id,
        outcome: fbApply ? "relabeled_from_full_brief" : "would_relabel_from_full_brief",
        before: null, after: fbPlan.after,
      });
      continue;
    }
    if (apply) { await deps.updateSectionContent(owning.id, plan.content_md); owning.content_md = plan.content_md; }
    relabelResults.push({ claim_id: claim.id, section_id: owning.id, outcome: apply ? "relabeled" : "would_relabel", before: plan.before, after: plan.after });
  }
  for (const section of sectionsList) {
    if (!sectionNeedsRelabel(section, claims)) continue;
    const plan = planRelabelModalParagraph(section.content_md);
    if (!plan) continue;
    if (apply) { await deps.updateSectionContent(section.id, plan.content_md); section.content_md = plan.content_md; }
    relabelResults.push({ section_id: section.id, outcome: apply ? "relabeled" : "would_relabel", reason: "unlabeled_assertion", before: plan.before, after: plan.after });
  }
  report.steps.relabel = relabelResults;

  // ── 9. GATE A — final scan, after every claim/section write above. `derivedCovered` recomputed FRESH
  //    here (SEVENTH PASS) from the FINAL claims/captures state — matching canonical-pipeline.ts's own
  //    "recompute right before the write" discipline, never a stale snapshot from earlier in this
  //    function. ─────────────────────────────────────────────────────────────────────────────────────
  const finalDerivedCovered = computeDerivedCovered(claims, captures);
  const gateRow = planGateA(item, claims, finalDerivedCovered);
  if (apply) {
    const existing = await deps.readGateAState(item.id);
    await deps.upsertGateA(gateRow, !!existing);
  }
  report.steps.gate_a = {
    outcome: apply ? "written" : "would_write", orphan_count: gateRow.orphan_count, scanned_hash: gateRow.scanned_hash,
    derived_claims_seen: claims.filter((c) => c.claim_kind === "DERIVED").length,
    derived_covered_count: finalDerivedCovered.size,
  };

  // ── 10. RE-DERIVE ───────────────────────────────────────────────────────────────────────────────
  const verdict = await deps.validateProvenance(item.id);
  if (!apply) {
    report.steps.rederive = { outcome: verdict?.valid ? "would_heal_verified" : "still_failing", failures: verdict?.failures ?? [] };
  } else if (verdict?.valid) {
    await deps.touchItem(item.id);
    const status = await deps.readProvenanceStatus(item.id);
    report.steps.rederive = { outcome: status === "verified" ? "healed_verified" : "touched_not_verified", status };
    if (shouldUnarchive(selectionMode, status, item)) {
      await deps.unarchiveItem(item.id);
      report.steps.rederive.unarchived = true;
    }
  } else {
    report.steps.rederive = { outcome: "still_failing", failures: verdict?.failures ?? [] };
  }

  return report;
}

/** Fold per-item reports into the summary counts the report contract names. Pure. */
export function summarizeReports(perItem) {
  const s = {
    healed_verified: 0, would_heal_verified: 0, still_failing: 0,
    capture_held: 0, ungrounded_after_capture: 0,
    slots_written_fact: 0, slots_written_gap: 0,
    gate_a_written: 0, unarchived: 0,
    resourced: 0, unresourced: 0,
    own_body_resolved: 0,
    orphans_grounded: 0, orphans_unprovable: 0,
    // TENTH PASS (2026-09-04) addition — see this file's header TENTH PASS section. orphans_item_bound_hit
    // counts STEP C tokens cut short by the per-item wall-clock backstop (source_item_bound_hit, below, is
    // the same for STEP SOURCE) — distinct from orphans_unprovable (a token this run genuinely searched
    // and could not find) so a report never conflates "not found" with "not tried, ran out of time".
    orphans_item_bound_hit: 0,
    relabeled_paragraphs: 0, relabel_no_owning_section: 0,
    refactored_to_analysis: 0,
    // THIRD PASS (2026-09-03) additions — see this file's SLOT MARKER / CAPTURE-CITED sections.
    slot_repaired_to_gap: 0, reclassified_to_gap: 0,
    cited_captured: 0, cited_held: 0, cited_bound_hit_items: 0,
    // FOURTH PASS (2026-09-03) additions — see this file's header FOURTH PASS section / OWNING-PARAGRAPH
    // REWRITE section. reclassified_rewritten is a SUBSET of refactored_to_analysis (claim_text was NOT
    // already discoverable and had to be rewritten) — kept separate so a report can show how much of the
    // 365-claim defect this run actually closed vs. how much stayed refused.
    reclassified_rewritten: 0, reclassify_refused_no_owning_paragraph: 0,
    retrofitted: 0, retrofit_refused_no_owning_paragraph: 0,
    // EIGHTH PASS (2026-09-04) STEP SOURCE additions — see this file's header EIGHTH PASS section. Named
    // to the dispatch's own report-contract vocabulary (source_registered, source_rated_tier,
    // grounded_after_register, unfetchable, token_not_in_page); a single per-token result carries BOTH
    // source_registered (a NEW `sources` row was created for this token, the 167 case) and
    // source_rated_tier (whatever the token's grounding source's tier is, new OR pre-existing — every
    // grounded token gets one, so this is the tier-visibility count the ruling calls for) whenever it
    // grounds by registering; grounded_after_register counts every token this step grounded regardless of
    // whether registration was needed (the 179 above-floor case grounds on an existing source, no new
    // registration). would_* dry-mode counterparts are also tallied so a dry report shows the same shape.
    source_registered: 0, source_rated_tier: 0, source_grounded: 0, source_would_ground: 0,
    grounded_after_register: 0, source_unfetchable: 0, source_token_not_in_page: 0,
    source_unresolved: 0, source_worklisted: 0, source_bound_hit: 0,
    // TENTH PASS (2026-09-04) addition — see this file's header TENTH PASS section. source_item_bound_hit
    // is the per-item wall-clock backstop's own count, distinct from source_bound_hit (SOURCE_MAX_PER_ITEM,
    // an ATTEMPT-count bound) — both can fire on the same run for different items, never conflated.
    source_item_bound_hit: 0,
    // NINTH PASS (2026-09-04) additions — see this file's header NINTH PASS section. source_no_candidate_url
    // fixes a real gap: the "no_candidate_url" STEP SOURCE outcome (an orphan with no candidate URL to try
    // at all) had NO counter anywhere in this function before now, silently absent from every summary this
    // file has ever produced. source_grounded_one_hop counts Class B one-hop groundings as a SUBSET of
    // source_grounded/grounded_after_register (both still increment for a one-hop grounding, same as any
    // other), so a report can show how much of the total came from the direct candidate vs. a hop away.
    source_no_candidate_url: 0, source_grounded_one_hop: 0,
    // TENTH PASS (2026-09-04) additions — see planBriefHonest/planRelabelFromFullBrief's own headers
    // (Tasks 3/4). brief_honest_* is dry-by-default (see healOneItem's STEP BRIEF-HONEST): *_applied only
    // increments when BOTH apply=true and the dispatch selection carried "+strip-unprovable", so a normal
    // apply-mode run (no suffix) always shows brief_honest_would_apply > 0 / brief_honest_applied === 0 —
    // Task 5's own "default dispatch never writes a brief" contract, visible directly in the summary.
    brief_honest_would_apply: 0, brief_honest_applied: 0, brief_honest_rejected: 0, brief_honest_refused_tokens: 0,
    relabeled_from_full_brief: 0, would_relabel_from_full_brief: 0,
  };
  for (const r of perItem) {
    if (r.steps.capture?.outcome === "held") s.capture_held += 1;
    for (const g of r.steps.ground ?? []) if (g.outcome === "ungrounded_after_capture") s.ungrounded_after_capture += 1;
    for (const sl of r.steps.slots ?? []) {
      if (sl.outcome === "written" && sl.claim_kind === "FACT") s.slots_written_fact += 1;
      if (sl.outcome === "written" && sl.claim_kind === "GAP") s.slots_written_gap += 1;
    }
    for (const sr of r.steps.slot_repair ?? []) if (sr.outcome === "repaired_to_gap") s.slot_repaired_to_gap += 1;
    if (r.steps.own_body?.outcome === "resolved") s.own_body_resolved += 1;
    if (r.steps.capture_cited) {
      for (const cc of r.steps.capture_cited.results ?? []) {
        if (cc.outcome === "captured") s.cited_captured += 1;
        if (cc.outcome === "held") s.cited_held += 1;
      }
      if (r.steps.capture_cited.bound_hit) s.cited_bound_hit_items += 1;
    }
    for (const rs of r.steps.resource ?? []) {
      if (rs.outcome === "resourced") s.resourced += 1;
      if (rs.outcome === "unresourced") s.unresourced += 1;
    }
    for (const rc of r.steps.reclassify ?? []) {
      if (rc.outcome === "reclassified") {
        s.refactored_to_analysis += 1;
        if (rc.rewritten) s.reclassified_rewritten += 1;
      }
      if (rc.outcome === "reclassified_to_gap") s.reclassified_to_gap += 1;
      if (rc.outcome === "reclassify_refused_no_owning_paragraph") s.reclassify_refused_no_owning_paragraph += 1;
    }
    for (const rt of r.steps.retrofit ?? []) {
      if (rt.outcome === "retrofitted") s.retrofitted += 1;
      if (rt.outcome === "retrofit_refused_no_owning_paragraph") s.retrofit_refused_no_owning_paragraph += 1;
    }
    for (const or of r.steps.orphans ?? []) {
      if (or.outcome === "grounded") s.orphans_grounded += 1;
      if (or.outcome === "unprovable") s.orphans_unprovable += 1;
      if (or.outcome === "item_bound_hit") s.orphans_item_bound_hit += 1;
    }
    for (const so of r.steps.source ?? []) {
      if (so.outcome === "source_registered_and_grounded") {
        s.source_registered += 1;
        s.source_rated_tier += 1;
        s.source_grounded += 1;
        s.grounded_after_register += 1;
      }
      if (so.outcome === "grounded_on_existing_source") {
        s.source_rated_tier += 1;
        s.source_grounded += 1;
        s.grounded_after_register += 1;
      }
      if (so.outcome === "source_registered_and_grounded_one_hop") {
        s.source_registered += 1;
        s.source_rated_tier += 1;
        s.source_grounded += 1;
        s.grounded_after_register += 1;
        s.source_grounded_one_hop += 1;
      }
      if (so.outcome === "grounded_on_existing_source_one_hop") {
        s.source_rated_tier += 1;
        s.source_grounded += 1;
        s.grounded_after_register += 1;
        s.source_grounded_one_hop += 1;
      }
      if (so.outcome === "unfetchable") s.source_unfetchable += 1;
      if (so.outcome === "token_not_in_page") s.source_token_not_in_page += 1;
      if (so.outcome === "unresolved") s.source_unresolved += 1;
      if (so.outcome === "no_candidate_url") s.source_no_candidate_url += 1;
      if (so.outcome === "worklist_ambiguous_host" || so.outcome === "unresolvable_host") s.source_worklisted += 1;
      if (so.outcome === "bound_hit") s.source_bound_hit += 1;
      if (so.outcome === "item_bound_hit") s.source_item_bound_hit += 1;
      if (so.outcome === "would_register_and_capture" || so.outcome === "would_capture_and_ground") s.source_would_ground += 1;
    }
    for (const rl of r.steps.relabel ?? []) {
      if (rl.outcome === "relabeled") s.relabeled_paragraphs += 1;
      if (rl.outcome === "no_owning_section_found") s.relabel_no_owning_section += 1;
      if (rl.outcome === "relabeled_from_full_brief") s.relabeled_from_full_brief += 1;
      if (rl.outcome === "would_relabel_from_full_brief") s.would_relabel_from_full_brief += 1;
    }
    if (r.steps.brief_honest) {
      const bh = r.steps.brief_honest;
      if (bh.outcome === "accepted" && bh.applied) s.brief_honest_applied += 1;
      if (bh.outcome === "accepted" && !bh.applied) s.brief_honest_would_apply += 1;
      if (bh.outcome === "rejected") s.brief_honest_rejected += 1;
      for (const pt of bh.per_token ?? []) if (pt.outcome === "refused") s.brief_honest_refused_tokens += 1;
    }
    if (r.steps.gate_a?.outcome === "written") s.gate_a_written += 1;
    if (r.steps.rederive?.outcome === "healed_verified") s.healed_verified += 1;
    if (r.steps.rederive?.outcome === "would_heal_verified") s.would_heal_verified += 1;
    if (r.steps.rederive?.outcome === "still_failing") s.still_failing += 1;
    if (r.steps.rederive?.unarchived) s.unarchived += 1;
  }
  return s;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// CHECKPOINT (HEAL-BUDGET, SIXTH PASS). Writes this run's summary.json ATOMICALLY -- a temp file first,
// then an os-level rename over the real path, so a hard kill mid-write leaves either the previous
// complete checkpoint or the new one, never a half-written JSON. Additive under cli.mjs's own
// writeSummary() (called once, after main() resolves, on a run that finishes normally) -- this is the
// safety net for a run that does NOT finish normally. Exported for this lane's own atomicity test.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/** Write `summary` to `<outDir>/summary.json`, temp-file-then-rename. No-op (returns null) when `outDir`
 *  is falsy — matches cli.mjs's own writeSummary posture: an optional feature is silent when unused,
 *  never an error. */
export function writeCheckpoint(outDir, summary) {
  if (!outDir) return null;
  mkdirSync(outDir, { recursive: true });
  const file = resolve(outDir, "summary.json");
  const tmp = resolve(outDir, `.summary.json.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  writeFileSync(tmp, JSON.stringify(summary, null, 2) + "\n");
  renameSync(tmp, file);
  return file;
}

/** Assemble this run's summary.json shape from the progress reached so far — used identically for every
 *  mid-loop checkpoint and the final return value, so a checkpoint and the finished artifact are never
 *  structurally different (only `stopped_at_budget`/`items_processed`/`items_remaining` distinguish a
 *  budget-stopped run, present on neither a fully-finished run's summary nor a mid-loop checkpoint taken
 *  before the budget was actually exceeded). Pure over its inputs. */
export function buildSummaryObject({ mode, apply, selection, items, perItem, stoppedAtBudget = false, itemsRemaining = [] }) {
  const counts = summarizeReports(perItem);
  const summary = { step: "provenance-heal", mode, counts: {}, applied: 0, read_back: {}, exitCode: 0 };
  summary.counts = { selection: { mode: selection.mode, ids: selection.ids }, candidates: items.length, ...counts };
  summary.applied = counts.healed_verified;
  summary.per_item = perItem;
  // Per-item residue, so the coordinator can read exactly which criterion each still-failing item is
  // stuck on without re-querying (this lane's own report requirement, 2026-09-03 THIRD PASS).
  summary.final_failures_by_item = perItem.map((r) => ({
    id: r.id, item_type: r.item_type,
    outcome: r.steps.rederive?.outcome ?? null,
    failures: r.steps.rederive?.failures ?? [],
  }));
  // TENTH PASS (2026-09-04, lane HEAL-10, Task 3) — per-item before/after excerpts for the brief-honest
  // plan, always present (dry or apply) so the coordinator can review every planned strip regardless of
  // whether the dispatch's own selection carried "+strip-unprovable". Only items with >=1 unprovable
  // orphan token this run are included (everything else has nothing to plan).
  summary.brief_honest = perItem
    .filter((r) => (r.steps.brief_honest?.per_token ?? []).length > 0)
    .map((r) => ({
      id: r.id,
      outcome: r.steps.brief_honest.outcome,
      applied: r.steps.brief_honest.applied,
      per_token: r.steps.brief_honest.per_token,
      restore_sql: r.steps.brief_honest.restore_sql,
    }));
  if (stoppedAtBudget) {
    summary.stopped_at_budget = true;
    summary.items_processed = perItem.length;
    summary.items_remaining = itemsRemaining;
  }
  const processedCount = stoppedAtBudget ? perItem.length : items.length;
  const budgetPrefix = stoppedAtBudget
    ? `TIME BUDGET — stopped after ${perItem.length}/${items.length} item(s); ${itemsRemaining.length} remain ` +
      `(see items_remaining; re-dispatch with --arg "ids:<items_remaining>"). `
    : "";
  summary.note = apply
    ? budgetPrefix +
      `Healed ${counts.healed_verified}/${processedCount} to verified; ${counts.still_failing} still failing; ` +
      `${counts.resourced} resourced/${counts.unresourced} unresourced; ${counts.own_body_resolved} own_body_resolved; ` +
      `${counts.orphans_grounded} orphans_grounded/${counts.orphans_unprovable} orphans_unprovable; ` +
      `${counts.relabeled_paragraphs} relabeled_paragraphs (${counts.relabel_no_owning_section} no_owning_section_found); ` +
      `${counts.refactored_to_analysis} refactored_to_analysis (${counts.reclassified_rewritten} claim_text-rewritten, ` +
      `${counts.reclassify_refused_no_owning_paragraph} refused_no_owning_paragraph); ${counts.reclassified_to_gap} reclassified_to_gap; ` +
      `${counts.retrofitted} retrofitted/${counts.retrofit_refused_no_owning_paragraph} retrofit_refused_no_owning_paragraph; ` +
      `${counts.slot_repaired_to_gap} slot_repaired_to_gap; ` +
      `${counts.cited_captured} cited-captured/${counts.cited_held} cited-held (bound hit on ${counts.cited_bound_hit_items} items); ` +
      `${counts.capture_held} capture-held; ${counts.ungrounded_after_capture} ungrounded_after_capture; ` +
      `${counts.unarchived} un-archived; ` +
      `STEP SOURCE (ruling 2026-09-04): ${counts.source_registered} source_registered, ${counts.source_rated_tier} ` +
      `source_rated_tier, ${counts.grounded_after_register} grounded_after_register (${counts.source_grounded_one_hop} ` +
      `one_hop), ${counts.source_unfetchable} unfetchable, ${counts.source_token_not_in_page} token_not_in_page, ` +
      `${counts.source_worklisted} worklisted, ${counts.source_no_candidate_url} no_candidate_url, ` +
      `${counts.source_unresolved} unresolved, ${counts.source_bound_hit} bound_hit, ` +
      `${counts.source_item_bound_hit} item_bound_hit; ${counts.orphans_item_bound_hit} orphan item_bound_hit (STEP C). ` +
      `BRIEF-HONEST: ${counts.brief_honest_applied} applied/${counts.brief_honest_would_apply} would_apply ` +
      `(dry-by-default unless the dispatch selection carries "+strip-unprovable"), ${counts.brief_honest_rejected} ` +
      `rejected (Gate A still had an unrelated orphan), ${counts.brief_honest_refused_tokens} token(s) refused ` +
      `(unisolable, never guessed); RELABEL-from-full-brief: ${counts.relabeled_from_full_brief} ` +
      `applied/${counts.would_relabel_from_full_brief} would_apply.`
    : `DRY — plan only, nothing written or fetched. ${counts.would_heal_verified}/${items.length} would ` +
      `heal to verified on current captures; the rest need capture/grounding/slots work this run's per_item ` +
      `lists explicitly. STEP SOURCE would-ground ${counts.source_would_ground} orphan token(s).`;
  return summary;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// PER-ITEM WALL-CLOCK BUDGET (TENTH PASS, 2026-09-04, lane HEAL-10). See this file's header TENTH PASS
// section for the measured basis and healOneItem's own header note for where this is checked.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/** The per-ITEM wall-clock cap (seconds), derived from the RUN's own `HEAL_TIME_BUDGET_SECONDS` — a
 *  defensive backstop under the capture-index-cache fix above (TENTH PASS), bounding STEP SOURCE/STEP C's
 *  own per-orphan-token loops so a pathological item this pass's own measurement did not anticipate (many
 *  more orphans, or a capture larger than the 927,954-char one measured live for this pass) can still never
 *  consume the whole run. Pure. Clamped to [30, 120] seconds regardless of the run budget's own size —
 *  generous over every item this lane measured post-fix, tight enough that even ~10 pathological items each
 *  hitting the cap still leave most of a 1500s run budget for the rest of the population. `null` (no cap)
 *  when `runTimeBudgetSeconds` is not a positive finite number — an unbudgeted run (no
 *  HEAL_TIME_BUDGET_SECONDS set, e.g. a local by-hand dispatch) is never silently time-boxed either, the
 *  same posture the run-level budget itself already takes. */
export function computeItemTimeBudgetSeconds(runTimeBudgetSeconds) {
  if (!Number.isFinite(runTimeBudgetSeconds) || runTimeBudgetSeconds <= 0) return null;
  return Math.max(30, Math.min(120, Math.floor(runTimeBudgetSeconds / 10)));
}

/**
 * @param {{ mode?: "dry"|"apply", arg?: string, out?: string|null }} opts — `out`, when given, is this
 *   run's checkpoint/artifact directory (cli.mjs's own `--out`, threaded through unmodified); a summary.json
 *   is written there atomically after EVERY item, not only at the end (HEAL-BUDGET).
 * @param {object} deps — see healOneItem's own header, plus selection resolvers:
 *   readQuarantinedLive(), readArchivedUnreasoned(),
 *   readCandidateTypeItems(itemTypes, { includeArchived }={}) (the `includeArchived` opt added 2026-09-05,
 *   lane KIT-BACKFILL — see resolveKitBackfillCandidates's own header; every existing caller passes just
 *   `itemTypes`, which a deps implementation must still treat as `includeArchived: false`), readByIds(ids),
 *   readAllSources() -> the `sources` registry (read ONCE per run, same precedent as db.mjs's own
 *   registerSource dedup read — small table, not the agent_run_searches full-scan the brief forbids;
 *   optional, defaults to `[]` so a direct healOneItem caller need not supply it),
 *   optionally `requiredSlotsMap` (defaults to loadRequiredSlots()), and (HEAL-BUDGET) optionally
 *   `timeBudgetSeconds` (a positive number — both modes since HEAL-9; unset/non-positive means no budget, the
 *   original unbounded behavior) and `now` (an injectable clock, `() => number`, defaulting to
 *   `() => Date.now()` — this file's own DI mandate; the run loop below is the only place this file reads
 *   elapsed wall time, and it is never read without going through this hook). EIGHTH PASS (2026-09-04,
 *   lane HEAL-7, STEP SOURCE) adds two deps, both apply-mode-only (never called in dry mode):
 *   `registerSource({url, name, base_tier})` -> `{source_id, created, host}` (scripts/lib/db.mjs's own
 *   registerSource, dedup-by-institutionKey, wired through provenance-heal.mjs) and
 *   `readSourceByUrl(url)` -> the matching `sources` row (institutionKey-matched, same identity rule) or
 *   `null` — used to read back the REAL row after registerSource's own dedup, since a match may land on a
 *   different exact URL than the one just classified; base_tier is ALWAYS resolved through
 *   classTierForHost (src/lib/sources/host-authority.ts), never hand-typed or guessed (SC-13).
 *   TENTH PASS (2026-09-04, lane HEAL-10) adds two more, both optional: `itemTimeBudgetSeconds` (a
 *   positive number, per-ITEM this time — see `computeItemTimeBudgetSeconds`'s own header; unset means no
 *   per-item cap, healOneItem's own `deps.now` is never read for it) threaded straight through to every
 *   `healOneItem` call (unchanged here — `deps` itself is passed through, not copied), and a run-level
 *   `captureIndexCache` (a `Map`, created ONCE below and threaded through every item exactly like
 *   `citedUrlCache` already is) — see `healOneItem`'s own header note for what it memoizes.
 */
export async function main({ mode = "dry", arg = "", out = null } = {}, deps) {
  const apply = mode === "apply";
  // HEAL-9 (2026-09-04): the budget binds BOTH modes. Until this pass it was armed under `apply &&`,
  // on the reasoning that a dry run makes no fetch and so has nothing to bound; since HEAL-7's STEP
  // SOURCE a dry run does the full candidate-URL lookup and span-location work over every capture
  // (25 candidates per item), and Maintenance #28 (dry, quarantined-live, 89 items) ran 29 min 36 s
  // before the job's 30-minute backstop cancelled it [CONFIRMED, run 33851505474]. A dry run that the
  // runner kills is worse than a budget-stopped one: it leaves the last checkpoint, not a finished plan.
  const timeBudgetMs = Number.isFinite(deps.timeBudgetSeconds) && deps.timeBudgetSeconds > 0
    ? deps.timeBudgetSeconds * 1000
    : null;
  const now = deps.now ?? (() => Date.now());
  // The clock is read ONLY when a budget is actually set (a positive timeBudgetSeconds, either mode) --
  // a run with no budget configured never calls `now()` at all, so a caller's own `deps.now` stub can
  // safely assert it is never invoked outside a budgeted run.
  const startedAt = timeBudgetMs != null ? now() : 0;

  const selection = parseSelection(arg);
  if (!selection.ok) {
    return { step: "provenance-heal", mode, counts: {}, applied: 0, read_back: {}, exitCode: 1, note: `REFUSED — ${selection.error}` };
  }

  const requiredSlotsMap = deps.requiredSlotsMap ?? loadRequiredSlots();
  const sourcesIndex = buildSourcesIndex(deps.readAllSources ? await deps.readAllSources() : []);

  let items;
  if (selection.mode === "quarantined-live") items = await deps.readQuarantinedLive();
  else if (selection.mode === "archived-unreasoned") items = await deps.readArchivedUnreasoned();
  else if (selection.mode === "slots-backfill") items = await resolveSlotsBackfillCandidates(deps, requiredSlotsMap);
  // kit-backfill (2026-09-05, lane KIT-BACKFILL): every item_type, archived included — see
  // resolveKitBackfillCandidates's own header for why both broadenings are needed to actually close
  // migration 299's guard (migration-299-precheck.mjs) to N=0 and cover the wider one-or-two-FACT
  // population outside the three criterion-5-only types.
  else if (selection.mode === "kit-backfill") items = await resolveKitBackfillCandidates(deps, requiredSlotsMap, { includeArchived: true });
  else items = await deps.readByIds(selection.ids);

  // Run-level CAPTURE-CITED dedup cache (HEAL-BUDGET) — ONE per run, shared across every item below.
  const citedUrlCache = new Map();
  // Run-level capture-text index cache (TENTH PASS) — ONE per run, shared across every item below, so a
  // capture two different items both check (e.g. via the corpus pool, or a widely cited institutional
  // page) is normalized once for the whole run — see healOneItem's own header note and this file's header
  // TENTH PASS section for the measured basis.
  const captureIndexCache = new Map();
  const perItem = [];
  let stoppedAtBudget = false;
  let itemsRemaining = [];

  for (let i = 0; i < items.length; i++) {
    if (timeBudgetMs != null && now() - startedAt >= timeBudgetMs) {
      stoppedAtBudget = true;
      itemsRemaining = items.slice(i).map((it) => it.id);
      console.log(
        `provenance-heal: time budget (${deps.timeBudgetSeconds}s) exceeded after ${perItem.length}/${items.length} ` +
        `item(s) — stopping cleanly. ${itemsRemaining.length} item(s) remain; re-dispatch with ` +
        `--arg "ids:<items_remaining from summary.json>" to finish them.`,
      );
      break;
    }
    perItem.push(await healOneItem(items[i], { deps, apply, selectionMode: selection.mode, requiredSlotsMap, sourcesIndex, citedUrlCache, captureIndexCache, stripUnprovable: selection.stripUnprovable }));
    if (out) writeCheckpoint(out, buildSummaryObject({ mode, apply, selection, items, perItem, stoppedAtBudget: false, itemsRemaining: [] }));
  }

  const summary = buildSummaryObject({ mode, apply, selection, items, perItem, stoppedAtBudget, itemsRemaining });
  if (out) writeCheckpoint(out, summary);
  return summary;
}

export default main;
