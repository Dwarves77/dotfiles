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
export const HEAL_VERSION = "hp5-2026-09-04.2";

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

/**
 * Locate `needle` inside `haystackText`: exact literal substring first (the common, cheap case), then a
 * normalized match (structural normalization only, case preserved), then a normalized CASE-INSENSITIVE
 * fallback. Returns `{ span, method }` — `span` is a VERBATIM slice of the ORIGINAL `haystackText` (never
 * the normalized form), `method` one of `"exact" | "normalized" | "normalized_ci"`. Returns null when no
 * method locates it. Pure.
 */
export function locateSpanInText(needle, haystackText) {
  const needleTrim = String(needle ?? "").trim();
  const hay = String(haystackText ?? "");
  if (!needleTrim || !hay) return null;

  const litIdx = hay.indexOf(needleTrim);
  if (litIdx !== -1) return { span: hay.slice(litIdx, litIdx + needleTrim.length), method: "exact" };

  const { normalized: hayNorm, map } = buildNormalizedIndex(hay);
  const { normalized: needleNorm } = buildNormalizedIndex(needleTrim);
  if (!needleNorm) return null;

  let idx = hayNorm.indexOf(needleNorm);
  let method = "normalized";
  if (idx === -1) {
    idx = hayNorm.toLowerCase().indexOf(needleNorm.toLowerCase());
    method = "normalized_ci";
  }
  if (idx === -1) return null;

  const origStart = map[idx];
  const origEnd = map[idx + needleNorm.length];
  if (origStart == null || origEnd == null || origEnd <= origStart) return null;
  const span = hay.slice(origStart, origEnd).trim();
  return span ? { span, method } : null;
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
 */
export function planGroundingForClaim(claim, captures) {
  if (claim.claim_kind !== "FACT") return { outcome: "not_applicable" };
  const caps = captures ?? [];

  if (claim.source_span && caps.some((c) => containsCaseInsensitive(c.result_content, claim.source_span))) {
    return { outcome: "already_grounded" };
  }

  if (claim.source_span) {
    for (const c of caps) {
      const found = locateSpanInText(claim.source_span, c.result_content);
      if (found) return { outcome: "healed", newSpan: found.span, method: found.method, searchId: c.id };
    }
  }
  for (const c of caps) {
    const found = locateSpanInText(claim.claim_text, c.result_content);
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
 *  caller (planGroundingForClaim) uses. First bucket match wins. Pure. */
export function planResourceForClaim(claim, buckets) {
  const needle = claim.source_span || claim.claim_text;
  for (const capture of buckets ?? []) {
    const found = locateSpanInText(needle, capture.result_content);
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
 *  planResourceForClaim (found / unprovable-with-fuzzy-evidence). Pure. */
export function planOrphanGrounding(orphan, buckets) {
  for (const capture of buckets ?? []) {
    const found = locateSpanInText(orphan.token, capture.result_content);
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

/** The item_gate_a_state row for `item`'s CURRENT full_brief and CURRENT FACT claims. Pure (buildGateARow
 *  is pure — the live scanner is pure text computation, no I/O). */
export function planGateA(item, claims) {
  const factClaims = (claims ?? [])
    .filter((c) => c.claim_kind === "FACT")
    .map((c) => ({ claim_text: c.claim_text ?? "", source_span: c.source_span ?? "" }));
  return buildGateARow({ itemId: item.id, fullBrief: item.full_brief ?? "", factClaims });
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
export function parseSelection(arg) {
  const raw = String(arg ?? "").trim();
  if (!raw || raw === "quarantined-live") return { ok: true, mode: "quarantined-live", ids: null };
  if (raw === "archived-unreasoned") return { ok: true, mode: "archived-unreasoned", ids: null };
  if (raw === "slots-backfill") return { ok: true, mode: "slots-backfill", ids: null };
  if (raw.startsWith("ids:")) {
    const ids = raw.slice(4).split(",").map((s) => s.trim()).filter(Boolean);
    if (!ids.length) return { ok: false, error: '--arg "ids:<uuid,uuid,...>" requires at least one id.' };
    return { ok: true, mode: "ids", ids };
  }
  return {
    ok: false,
    error: `unrecognized --arg ${JSON.stringify(raw)} (expected blank/"quarantined-live", "archived-unreasoned", "ids:<uuid,uuid,...>", or "slots-backfill").`,
  };
}

/** The slots-backfill candidate set: every item deps.readCandidateTypeItems returns (market_signal /
 *  initiative / research_finding, verified, live) that is ACTUALLY missing >=1 kit-required slot right
 *  now — narrowed here (not left to the caller) so a dispatch of this selection never runs the pipeline
 *  over an item that has nothing to backfill. */
export async function resolveSlotsBackfillCandidates(deps, requiredSlotsMap) {
  const items = await deps.readCandidateTypeItems(["market_signal", "initiative", "research_finding"]);
  const kept = [];
  for (const item of items) {
    const claims = await deps.readClaims(item.id);
    if (missingRequiredSlots(item.item_type, claims, requiredSlotsMap).length) kept.push(item);
  }
  return kept;
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
 *   touchItem(itemId) -> {...}, readProvenanceStatus(itemId) -> string|null, unarchiveItem(itemId) -> {...}.
 * `sourcesIndex` ({byId, byCanonUrl}, see buildSourcesIndex) is read ONCE per RUN by main() and threaded
 * through every item — defaults to empty maps so a direct caller (tests) may omit it.
 * In dry mode (`apply:false`) every write/fetch is SKIPPED and reported as `would_*` — every read still
 * runs (dry mode plans against the item's REAL current captures/claims, per the brief); the local
 * claims/sections snapshots are only MUTATED to reflect a write when `apply` is true, so a later step's
 * dry-mode plan is never built against a write that never happened.
 */
export async function healOneItem(item, { deps, apply, selectionMode, requiredSlotsMap, sourcesIndex, citedUrlCache }) {
  const report = { id: item.id, item_type: item.item_type, steps: {} };
  const sIdx = sourcesIndex ?? { byId: new Map(), byCanonUrl: new Map() };
  // Run-level CAPTURE-CITED dedup cache (HEAL-BUDGET, SIXTH PASS). Defaults to a fresh, item-scoped Map
  // when no caller-shared one is threaded through (every existing direct healOneItem call in this file's
  // own tests), so this parameter is purely additive -- see this file's HEAL_VERSION header note.
  const runCitedCache = citedUrlCache ?? new Map();

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
    const plan = planGroundingForClaim(c, captures);
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
      captures.push({ id: ins.id, result_url: row.result_url, result_content: row.result_content });
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
  const gateRowEarlyEstimate = planGateA(item, claims); // cheap/pure — only to decide whether corpus_pool is worth a read
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
    const plan = planResourceForClaim(c, resourceBuckets);
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
    const rewrite = ownSection ? planOwningParagraphRewrite(c.claim_text, ownSection.content_md) : { outcome: "no_owning_paragraph", bestScore: 0 };
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
    if (apply) {
      await deps.updateClaimKind(c.id, { claim_kind: "ANALYSIS", claim_text: rewrite.newClaimText });
      c.claim_kind = "ANALYSIS"; c.claim_text = rewrite.newClaimText;
    }
    reclassifyResults.push({
      claim_id: c.id, reason, outcome: apply ? "reclassified" : "would_reclassify", rewritten: true,
      claim_text_before: claimTextBefore, claim_text_after: rewrite.newClaimText,
      paragraph_score: rewrite.paragraphScore, sentence_score: rewrite.sentenceScore, section_id: ownSection.id,
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
    const rewrite = ownSection ? planOwningParagraphRewrite(c.claim_text, ownSection.content_md) : { outcome: "no_owning_paragraph", bestScore: 0 };
    if (rewrite.outcome !== "found") {
      retrofitResults.push({
        claim_id: c.id, claim_text: c.claim_text, outcome: "retrofit_refused_no_owning_paragraph",
        best_score: rewrite.bestScore, section_id: ownSection ? ownSection.id : null,
      });
      continue;
    }
    const claimTextBefore = c.claim_text;
    if (apply) {
      await deps.updateClaimKind(c.id, { claim_text: rewrite.newClaimText });
      c.claim_text = rewrite.newClaimText;
    }
    retrofitResults.push({
      claim_id: c.id, outcome: apply ? "retrofitted" : "would_retrofit",
      claim_text_before: claimTextBefore, claim_text_after: rewrite.newClaimText,
      paragraph_score: rewrite.paragraphScore, sentence_score: rewrite.sentenceScore, section_id: ownSection.id,
    });
  }
  report.steps.retrofit = retrofitResults;

  // ── STEP C — ORPHANS (criterion 7) — a FRESH scan against claims post-RECLASSIFY (E may have exposed
  //    a token whose only "coverage" was a claim just demoted to ANALYSIS), before this step's own
  //    inserts, so it names exactly what's missing right now. ──────────────────────────────────────
  const gateRowForOrphans = planGateA(item, claims);
  const orphanResults = [];
  let orphanFallbackSectionId = null;
  for (const orphan of gateRowForOrphans.orphans ?? []) {
    const plan = planOrphanGrounding(orphan, resourceBuckets);
    if (plan.outcome !== "found") {
      orphanResults.push({ token: orphan.token, class: orphan.class, outcome: "unprovable", fuzzy: plan.fuzzy });
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
    if (!plan) { relabelResults.push({ claim_id: claim.id, section_id: owning.id, outcome: "no_owning_section_found" }); continue; }
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

  // ── 9. GATE A — final scan, after every claim/section write above ──────────────────────────────────
  const gateRow = planGateA(item, claims);
  if (apply) {
    const existing = await deps.readGateAState(item.id);
    await deps.upsertGateA(gateRow, !!existing);
  }
  report.steps.gate_a = { outcome: apply ? "written" : "would_write", orphan_count: gateRow.orphan_count, scanned_hash: gateRow.scanned_hash };

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
    }
    for (const rl of r.steps.relabel ?? []) {
      if (rl.outcome === "relabeled") s.relabeled_paragraphs += 1;
      if (rl.outcome === "no_owning_section_found") s.relabel_no_owning_section += 1;
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
      `${counts.unarchived} un-archived.`
    : `DRY — plan only, nothing written or fetched. ${counts.would_heal_verified}/${items.length} would ` +
      `heal to verified on current captures; the rest need capture/grounding/slots work this run's per_item ` +
      `lists explicitly.`;
  return summary;
}

/**
 * @param {{ mode?: "dry"|"apply", arg?: string, out?: string|null }} opts — `out`, when given, is this
 *   run's checkpoint/artifact directory (cli.mjs's own `--out`, threaded through unmodified); a summary.json
 *   is written there atomically after EVERY item, not only at the end (HEAL-BUDGET).
 * @param {object} deps — see healOneItem's own header, plus selection resolvers:
 *   readQuarantinedLive(), readArchivedUnreasoned(), readCandidateTypeItems(itemTypes), readByIds(ids),
 *   readAllSources() -> the `sources` registry (read ONCE per run, same precedent as db.mjs's own
 *   registerSource dedup read — small table, not the agent_run_searches full-scan the brief forbids;
 *   optional, defaults to `[]` so a direct healOneItem caller need not supply it),
 *   optionally `requiredSlotsMap` (defaults to loadRequiredSlots()), and (HEAL-BUDGET) optionally
 *   `timeBudgetSeconds` (a positive number — apply mode only; unset/non-positive means no budget, the
 *   original unbounded behavior) and `now` (an injectable clock, `() => number`, defaulting to
 *   `() => Date.now()` — this file's own DI mandate; the run loop below is the only place this file reads
 *   elapsed wall time, and it is never read without going through this hook).
 */
export async function main({ mode = "dry", arg = "", out = null } = {}, deps) {
  const apply = mode === "apply";
  const timeBudgetMs = apply && Number.isFinite(deps.timeBudgetSeconds) && deps.timeBudgetSeconds > 0
    ? deps.timeBudgetSeconds * 1000
    : null;
  const now = deps.now ?? (() => Date.now());
  // The clock is read ONLY when a budget is actually set (apply mode + a positive timeBudgetSeconds) --
  // a dry run, or an apply run with no budget configured, never calls `now()` at all, so a caller's own
  // `deps.now` stub can safely assert it is never invoked outside a budgeted apply run.
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
  else items = await deps.readByIds(selection.ids);

  // Run-level CAPTURE-CITED dedup cache (HEAL-BUDGET) — ONE per run, shared across every item below.
  const citedUrlCache = new Map();
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
    perItem.push(await healOneItem(items[i], { deps, apply, selectionMode: selection.mode, requiredSlotsMap, sourcesIndex, citedUrlCache }));
    if (out) writeCheckpoint(out, buildSummaryObject({ mode, apply, selection, items, perItem, stoppedAtBudget: false, itemsRemaining: [] }));
  }

  const summary = buildSummaryObject({ mode, apply, selection, items, perItem, stoppedAtBudget, itemsRemaining });
  if (out) writeCheckpoint(out, summary);
  return summary;
}

export default main;
