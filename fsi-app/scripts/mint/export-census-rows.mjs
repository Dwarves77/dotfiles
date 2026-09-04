#!/usr/bin/env node
// export-census-rows.mjs — the census-worklist exporter Lane POP's record-tier population plan named as
// the one piece it could not build inside its earlier write set
// (docs/plans/record-tier-population-plan-2026-09-01.md §3: "Building this array from the live
// census_worklist + sources + agent_run_searches tables is a SQL join a DB-connected caller runs ... not
// a pure, DB-less script, and therefore out of run-mint-batch.mjs's own scope"). This script IS that
// join, plus item_type/canonical-key/jurisdiction derivation and a $0 capture pass.
//
// ── UPDATE 2026-09-02 (Lane POP2, first live dry run 33639133429, limit 50, capture on) ───────────────
// eligible 3,661; excluded_held 650; exported **0**; held 50 (canonical_key_unresolved 24,
// capture_too_short 24, item_type_unmapped 2). Root causes, all CONFIRMED against that run's own
// census-rows.held.json plus a browser-verified read of the live pages:
//   1. EUR-Lex (24 rows): the old capture target was `legal-content/EN/TXT/?uri=CELEX:...`, which a
//      plain HTTP GET gets a 157-byte WAF/interstitial page for (verified: the SAME url renders ~100k
//      chars in a browser). `legal-content/EN/TXT/HTML/?uri=CELEX:...` — the machine-readable clean-text
//      endpoint — renders 96,777 chars of real act text (browser-verified 2026-09-02). These rows'
//      `canonical_instrument_key` was NEVER the problem (deriveKey already resolves the CELEX from the
//      URL) — the hold was purely the capture target.
//   2. legislation.gov.uk (~15) and federalregister.gov (8): held `canonical_key_unresolved` only because
//      `classifyItemTypeFromCelexKey` (the ONLY identity path that existed) demanded a CELEX-shaped key.
//      Neither host has one — this repo's own `intelligence_items` corpus already carries
//      `canonical_instrument_key = null` for every non-EU host (federalregister/leginfo/imo/...) — so
//      inventing a synthetic key for them would be the false-precision mistake this repo's own doctrine
//      forbids (canonical-key.mjs's header). Dedup for these two families is the URL-holder check
//      (`--exclude-held` / apply-mint-batch.mjs's M4 url-holder rule), which never needed a key.
//   3. `31978H0072` (H = recommendation) and `31978A0311` (A = agreement) held `item_type_unmapped`
//      because the old CELEX-letter map only had R/L/D. H and A are now mapped (see
//      `classifyItemTypeFromCelexKey` below) — every other letter (notably C, "other acts") still holds,
//      explicitly, not guessed.
// ── UPDATE 2026-09-02 (population run #4, 33643532589) ───────────────────────────────────────────────
// The `/TXT/HTML/` endpoint above is behind EUR-Lex's bot gate for a plain HTTP client (all 26 rows: HTTP
// 202, 2,035 bytes, "verify that you're not a robot"). CELEX rows now capture from the Publications
// Office's Cellar first (see the Cellar block near extractCellarTitle) and fall back to EUR-Lex.
// This pass adds per-source-family identity + capture resolution (`resolveIdentity` / per-family capture
// in `resolveRowCapture`) so EUR-Lex, legislation.gov.uk and federalregister.gov each resolve identity
// and text the way their own corpus shape requires, instead of forcing every row through the CELEX-only
// path. See MINT-RUNBOOK.md §11 for the full per-family table and the browser-capture escape hatch for a
// site whose automated capture is refused (operator ruling, MINT-RUNBOOK §1a: read it through the
// browser, never report it as a blocker).
//
// WHAT IT DOES, per row of census_worklist WHERE dryrun_disposition = 'would_mint':
//   1. Join sources on source_id (id/url/base_tier/tier_override/status/institution_id/category/name).
//   2. Join agent_run_searches on result_url = document_url, requiring >200 chars result_content (the
//      live-confirmed shape: 680 of 3,661 would_mint rows have this today).
//   3. IDENTITY — `resolveIdentity(censusRow, source)`, deterministic per source family (see its own doc
//      comment below): EUR-Lex/CELEX (canonical key + CELEX-letter item_type), legislation.gov.uk (no
//      canonical scheme — never invented; item_type from the legislation-type path segment),
//      federalregister.gov (no canonical scheme; item_type from the FR API's own `type` field — a live
//      network call, gated behind `--capture` exactly like every other family's capture, see below), any
//      other host held `identity_unmapped_source` (host recorded, never guessed).
//   4. CAPTURE — for a row with NO existing agent_run_searches text, `--capture` fetches it PER FAMILY:
//      EUR-Lex fetches the `/TXT/HTML/?uri=CELEX:...` clean-text endpoint; legislation.gov.uk tries
//      `<url>/data.htm` first, falling back to the page itself; federalregister.gov fetches the
//      document's API JSON for `type`/`title`/`raw_text_url`, then the `raw_text_url` body. A capture
//      that comes back non-2xx or ≤200 chars of text is held `capture_blocked` WITH EVIDENCE
//      (`http_status`, `bytes`, `head` — the first 300 chars of whatever text came back — and the
//      `endpoint` actually tried), never a bare unexplained hold. No capture and no `--capture` → held
//      `no_capture`, as before.
//   5. title: the family's own capture step supplies it when it can (EUR-Lex: first heading of the act,
//      body-lead as a documented fallback; legislation.gov.uk: `<title>`/`<h1>`; federalregister.gov: the
//      API JSON's own `title`, the most reliable of the three); otherwise the source's registered name
//      plus the instrument identifier. `title_origin` records which, honestly, per row.
//   6. --exclude-held (default ON; --include-held turns it off): a row whose document_url already has AN
//      intelligence_items.source_url row -- archived or not -- is excluded before export (not merely
//      held), with the excluded count reported.
//
// A row that cannot be built for ANY reason is emitted to a SIBLING `<out>.held.json` file with a `hold`
// reason -- per this lane's charter, "never silently dropped". Rows excluded by --exclude-held are
// counted and reported but are NOT written to the held file (they are not a build failure -- they are a
// row this run correctly declines to touch because the corpus already holds it).
//
// OUTPUT SHAPE: exactly the enriched-row array run-mint-batch.mjs's --census-rows mode documents (see
// that file's own header above loadCensusRows) -- row_id, source_url, item_type, title,
// instrument_identifier, canonical_instrument_key, jurisdiction_iso, priority, source{}, captured_text,
// fetched_length, plus this script's own title_origin (additionalProperties is true throughout that
// contract -- an extra field is never rejected). `canonical_instrument_key` is legitimately `null` for a
// non-EU-instrument row (legislation.gov.uk, federalregister.gov) — that field is documented OPTIONAL in
// run-mint-batch.mjs's own --census-rows contract, and apply-mint-batch.mjs's M4 pre-check already
// tolerates a null key (it falls back to the same-source_url holder check).
//
// USAGE:
//   node scripts/mint/export-census-rows.mjs [--limit 50] [--source-id <uuid>] [--celex-prefix 32024]
//        [--include-held] [--capture] [--out path/to/census-rows.json]
//
// Zero DB writes. Reads via scripts/lib/db.mjs's readAll (paginated, capped-read-safe). --capture makes
// real outbound HTTP GETs to census_worklist.document_url values (and, for EUR-Lex/federalregister rows,
// a family-specific derived endpoint) only -- never a DB write, never an LLM call, $0. WITHOUT --capture
// this script makes NO outbound HTTP request at all, including for federalregister.gov's item_type
// lookup (that lookup is gated behind --capture exactly like text capture, so a --capture-off run stays
// fully network-free and predictable — see buildRows below; a federalregister.gov row that already has
// existing agent_run_searches text but no --capture run yet to classify its type holds
// `fr_type_pending_capture`, distinct from `no_capture`, so the two cases are never confused in a report).
//
// [UNCONFIRMED] legislation.gov.uk's `/data.htm` endpoint: confirmed (WebFetch, 2026-09-02) to return
// HTTP 200 with the instrument's real text present, but this sandbox could not confirm at the byte level
// that it is meaningfully SMALLER/cleaner than the ordinary page (WebFetch renders through an HTML→
// markdown→LLM-summary pipeline, not a raw byte inspection, and this sandbox's Bash has no general
// outbound network access to check with curl). Implemented as instructed (tried first, page as fallback);
// flagged here and in MINT-RUNBOOK.md §11 rather than asserted as verified.
//
// [UNCONFIRMED→CORRECTED] the federalregister.gov API's `type` field is NOT the RULE/PRORULE/NOTICE/
// PRESDOCU short codes (those are the *search-filter* query-param codes) — a per-document JSON's own
// `type` field is a human-readable string: "Rule", "Proposed Rule", "Notice", "Presidential Document"
// (WebFetch-verified against a live document and a live RULE-filtered search, 2026-09-02). This script's
// `classifyFrDocType` matches against those actual field values, case-insensitively.
//
// ── UPDATE 2026-09-02 (Lane HELD) — the three classes every population run holds ~16-20% of its slice
// to, closed at the root, per docs/plans/wave2-lanes-2026-09-02.md ────────────────────────────────────
// Evidence: `scripts/_snapshots/population-{33659080799,33666187388,33678399902}/census-rows.held.json`
// (mint-run-012..014's own held rows) — 8/50 in the run named `PENDING-RUN.md` discharges. All three
// classes were root-caused to real, fixable gaps, not to genuinely off-vertical or genuinely unresolvable
// documents:
//   1. `canonical_key_unresolved` (3/8): `classifyItemTypeFromCelexKey` demanded CELEX sector "3" before
//      ever reading the letter, so a key `deriveKey` HAD resolved (sector 2 international agreements,
//      sector 4 EEA/EFTA complementary legislation) came back mislabeled as "never resolved." Fixed:
//      `CELEX_SECTOR_LETTER_MAP` (below) separates "shape never matched" (still `canonical_key_unresolved`)
//      from "shape matched, sector/letter has no item_type home" (now correctly `item_type_unmapped`), and
//      adds sectors 2 and 4 on the four evidenced keys (22004A0806(01), 21998A0912(01), 22023D2729,
//      42012D0708) — see that constant's own header for the semantic argument.
//   2. `item_type_unmapped` (1/8, but the single largest class across every run read for this fix — 8+ of
//      ~20 held rows per run): federalregister.gov "Proposed Rule" had no item_type. Fixed: `Proposed
//      Rule` -> `initiative` (`classifyFrDocType`), the same not-yet-binding posture a CELEX 'D' decision
//      already gets. `Notice`/`Presidential Document` have zero evidence in this repo's held history and
//      stay held, explicitly (see `held-classes.mjs` for the dossier and the ruling recommendation).
//   3. `identity_unmapped_source` (4/8): every held host (sdir.no, climate.ec.europa.eu,
//      rules.cityofnewyork.us, and others across the three snapshots) already had a REGISTERED `sources`
//      row — census_worklist.source_id already joined to it — `resolveIdentity`'s three-family
//      allowlist just had no fourth branch for "a document from a registered institution this repo
//      already trusts, classified by the registry's own `category` column." Fixed: `institutionKey`
//      equality (scripts/lib/institution-key.mjs, the SAME identity rule the registry's own tier
//      derivation uses) confirms the document belongs to its own row's registered source; a `'regulatory'`
//      category institution's document defaults to `item_type: 'regulation'` (no canonical scheme
//      invented, matching the legislation.gov.uk precedent); any other/unset category holds the new,
//      more precise `institution_category_unmapped` (never silently guessed); a genuine non-match still
//      holds `identity_unmapped_source`, exactly as before.
//   Also: federalregister.gov rows now carry a real `canonical_instrument_key` — the FR's own document
//      number (e.g. "2026-13667"), extracted verbatim, never fabricated — instead of always `null`.
// See `held-classes.mjs` for the dossier this fix's own evidence was read from, and MINT-RUNBOOK.md §13.
//
// ── UPDATE 2026-09-03 (Lane EXPORT-HOLD, population-turn runs #13 dry / #14 apply) — two defects ──────
// (1) HOLDER REFUSAL REACHES THE MINT: row 26bf4a98-9dc4-472e-9c6a-8883c3bffea1 (a EUR-Lex CELEX
//     32019R1242 row, document_url `.../TXT/?uri=CELEX:32019R1242`) passed this file's --exclude-held
//     check (a `source_url` exact-string match against `intelligence_items`) because the row that already
//     holds the same instrument (item ab922a18-c9a8-4b1b-9ac6-b7f20606c5d7, minted 2026-04-05) stores it
//     under a DIFFERENT url shape — same instrument, different URL, so the string comparison missed it.
//     The payload was built, validated, and only THEN refused by apply-mint-batch.mjs's M4 pre-check
//     (`checkM4`/`buildItemsIndex`: `not_applied_holder_conflict`, mint-run.json's own per_item evidence).
//     This file already derives `canonical_instrument_key` per row (`resolveIdentity`) — M4's OWN holder
//     rule is: does any `intelligence_items` row (archived included) already carry this EXACT
//     `canonical_instrument_key` string. `partitionExcludeHeldByKey`/`buildHeldKeyIndex` below apply that
//     SAME rule (same column, same exact-string equality, archived rows included) at export time, so a
//     key-collision row is excluded here, before a payload is ever built for it — never a second opinion.
//     Reported in `<out>.held.json` with reason `already_held_by_key` and the holder's item id as
//     evidence (`holder_archived: true` added when the holder itself is archived) so the row stops
//     re-appearing as build work every run, without changing anything about what happens to an archived
//     holder itself (the 459/529-row archived-holder disposition is a separate, already-executed operator
//     ruling — docs/plans/population-pass-2026-09-03.md — this fix only stops EXPORTING a row that
//     collides with one, archived or not).
// (2) THE EUR-LEX ROBOT PAGE, RE-FETCHED EVERY RUN: 19 of run #14's 22 holds were `capture_blocked`; ten
//     were EUR-Lex CELEX keys with an OJ-sequence `(NN)` suffix (e.g. `22004A0806(01)`, `32023D0628(01)`,
//     `32020D1124(01)`). Root cause, confirmed live (WebFetch against publications.europa.eu, 2026-09-03):
//     `cellarEndpointForCelex` builds the Cellar URL with `encodeURIComponent`, which does NOT escape `(`
//     or `)` (they are in JS's own unreserved set) — so a suffixed key's Cellar request carries LITERAL
//     parens and Cellar 404s it ("Resource [system 'celex' - id '22004A0806(01)'] not found."), exactly
//     the held evidence's `cellar_status: 404`. The SAME key with `(`/`)` percent-encoded to `%28`/`%29`
//     resolves: confirmed live for three of the ten (`22004A0806(01)`, `32023D0628(01)`, `32020D1124(01)`)
//     — each a `302` to a real `cellar/<uuid>/rdf/object/full` resource — and for a control key with no
//     suffix (`32006D0507`, unaffected either way, `302` as documented above). `cellarEndpointForCelex`
//     now encodes the parens explicitly; this converts those ten rows from a permanent EUR-Lex-bot-gate
//     hold into a real Cellar capture, not merely a differently-labelled hold.
//     A genuinely non-existent key (the eleventh row this run held, a malformed `32025D05242` census
//     identifier that `deriveKey` correctly truncates to `32025D0524`) still 404s from Cellar under EITHER
//     encoding (confirmed live) — for that case, and any other CELEX row where Cellar fails and the
//     EUR-Lex fallback answers with its OWN known bot-gate interstitial (HTTP 202 + the "verify that
//     you're not a robot" marker text — never inferred from byte count alone), the hold is now
//     `no_capture_path` (same evidence shape as `capture_blocked`) so a permanently-refused fetch is never
//     retried every population-turn run for no reason; a `capture_blocked` transient failure (a timeout, a
//     5xx, a differently-shaped refusal) still reads `capture_blocked` and is worth retrying.

import { parseArgs } from "node:util";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveKey } from "../lib/canonical-key.mjs";
import { screenVerdictFor, isMintable } from "./lib/screen-verdict.mjs";
import { sameInstitution } from "../lib/institution-key.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, "..", "..");

// ── pure helpers (unit-tested directly, no I/O) ─────────────────────────────────────────────────────

/** The CELEX shape deriveKey() itself matches ("[1-9]YYYY<letter>NNNN", the OJ '(NN)' suffix optional).
 *  Shared with classifyItemTypeFromCelexKey below so "the key never derived" (this fails) and "the key
 *  derived but this sector has no item_type home" (this passes, the sector map below misses) are two
 *  DIFFERENT, correctly-named holds — see that function's own header for why this split exists. */
const CELEX_SHAPE_RE = /^[1-9]\d{4}[A-Z]\d{4}/;

/** CELEX sector digit (position 0) -> the letter->item_type map valid FOR THAT SECTOR. Sector 3
 *  (secondary legislation: regulations/directives/decisions/recommendations/opinions) is the original
 *  mapping. Sectors 2 (international agreements) and 4 (complementary legislation -- chiefly EEA/EFTA
 *  Joint Committee acts) are added 2026-09-02 (Lane HELD) on live evidence: population runs #9-#14 held
 *  four rows -- 22004A0806(01), 21998A0912(01) (sector 2, letter A = "international agreement"),
 *  22023D2729 (sector 2, letter D = "decision of a body set up by an agreement"), 42012D0708 (sector 4,
 *  letter D = "EEA Joint Committee decision") -- as `canonical_key_unresolved`, mislabeled: `deriveKey`
 *  HAD resolved every one of these keys; only the item_type mapping was missing, because the old
 *  single-sector regex rejected the key outright before the letter was ever read (see
 *  classifyItemTypeFromCelexKey's header). Sector 2's own letter vocabulary differs from sector 3's in the
 *  official EUR-Lex sector-number scheme (A = agreement, not "opinion"; D = decision of an agreement body,
 *  not a Commission/Council decision) -- but this repo's existing MAP already names each mapped LETTER by
 *  its role (agreement/decision/opinion all -> framework/initiative), not by sector, and every one of the
 *  four evidenced sector-2/4 keys lands on a semantically sound item_type under the SAME map (an
 *  international agreement -> "framework", exactly the fit "framework" already serves for sector 3's own
 *  A-letter opinions; a decision of a treaty body or an EEA Joint Committee -> "initiative", the same fit
 *  sector 3's own D-letter Commission/Council decisions already get). Sectors 1 (treaties), 5 (preparatory
 *  acts), 6 (case-law), 7+ have NO evidence in this repo's held-row history and are deliberately NOT added
 *  here -- guessing their letter semantics without a single observed row would be exactly the false-
 *  precision mistake this file's own doctrine forbids. See held-classes.mjs's dossier for the recommendation
 *  on those sectors if evidence ever appears. */
const CELEX_SECTOR_LETTER_MAP = {
  2: { A: "framework", D: "initiative" },
  3: { R: "regulation", L: "directive", D: "initiative", H: "guidance", A: "framework" },
  4: { D: "initiative" },
};

/**
 * item_type from a CELEX-shaped canonical_instrument_key ("[1-9]YYYY<letter>NNNN[(NN)]"). Pure. Two
 * DISTINCT holds, never conflated (Lane HELD, 2026-09-02 -- see CELEX_SECTOR_LETTER_MAP's header for the
 * bug this replaced, where a key that HAD derived still came back `canonical_key_unresolved` because this
 * function re-tested the key's shape and sector together in one regex):
 *   - `canonical_key_unresolved`: canonicalKey is not a string, or is not CELEX-shaped at all (deriveKey
 *     itself returned null, or the value never had a CELEX pattern to begin with) -- the key was never
 *     resolved, full stop.
 *   - `item_type_unmapped`: canonicalKey IS CELEX-shaped (a real key WAS resolved) but its sector or its
 *     sector's letter has no item_type home in CELEX_SECTOR_LETTER_MAP above -- named, never guessed.
 * @param {string|null} canonicalKey
 * @returns {{itemType: string|null, hold: string|null}}
 */
export function classifyItemTypeFromCelexKey(canonicalKey) {
  if (typeof canonicalKey !== "string" || !CELEX_SHAPE_RE.test(canonicalKey)) {
    return { itemType: null, hold: "canonical_key_unresolved" };
  }
  const sector = canonicalKey.charAt(0);
  const letter = canonicalKey.charAt(5);
  const itemType = CELEX_SECTOR_LETTER_MAP[sector]?.[letter] ?? null;
  return itemType ? { itemType, hold: null } : { itemType: null, hold: "item_type_unmapped" };
}

/** UK Statutory-Instrument-family path segments this script maps to item_type "regulation" (the ONLY
 *  item_type legislation.gov.uk rows map to today — a re-scope to directive/framework/etc. per instrument
 *  type is a future refinement, not silently guessed here). No canonical-key scheme exists for UK
 *  legislation in this system (unlike CELEX/ELI) — inventing one would be false precision this repo's own
 *  canonical-key doctrine forbids, so `resolveIdentity` below always returns `canonicalKey: null` for
 *  this family; the URL-holder check is this family's whole dedup story. */
const UK_LEGISLATION_TYPE_RE = /\/(uksi|ukpga|wsi|ssi|nisr)\//i;

/** item_type from a legislation.gov.uk document_url's path segment, or null (held item_type_unmapped by
 *  the caller) when the path carries none of the mapped instrument-type segments. Pure. */
export function classifyUkLegislationType(documentUrl) {
  return UK_LEGISLATION_TYPE_RE.test(String(documentUrl ?? "")) ? "regulation" : null;
}

/** The federalregister.gov document number out of a `/documents/YYYY/MM/DD/<docnum>/...` URL path (the
 *  shape the census `document_url` carries). Pure. Returns null when the URL does not carry this shape
 *  (e.g. a `/d/<docnum>` short-link or a non-document federalregister.gov URL) -- held
 *  `fr_document_number_unresolved` by the caller rather than guessed. */
const FR_DOCNUM_RE = /\/documents\/\d{4}\/\d{2}\/\d{2}\/([A-Za-z0-9-]+)/;
export function extractFrDocumentNumber(documentUrl) {
  const m = String(documentUrl ?? "").match(FR_DOCNUM_RE);
  return m ? m[1] : null;
}

/** federalregister.gov API `type` field value -> `intelligence_items.item_type`. "Rule" (enacted) ->
 *  "regulation", the FR analogue of an EU regulation -- the original mapping. "Proposed Rule" ->
 *  "initiative" is added 2026-09-02 (Lane HELD): it was the single largest held class this repo's own
 *  population runs ever produced (8+ of the ~20 held rows in every one of runs #9-#14's held-row
 *  snapshots, `scripts/_snapshots/population-{33659080799,33666187388,33678399902}/census-rows.held.json`)
 *  and it IS legitimately in vertical -- a proposed rule is a real regulatory action already published and
 *  open for comment, exactly the "not yet binding, still worth tracking" shape `item_type = "initiative"`
 *  already serves for a CELEX sector-3 'D' decision (see CELEX_SECTOR_LETTER_MAP above) and for a sector-2
 *  agreement-body decision -- the same not-yet-in-force posture, the same item_type, same required slots
 *  (`action_now`/`conversion_trigger`/`driving_parties`/`signal_event`; see
 *  `item-type-required-slots.json`'s `_federal_register_type_map` entry). "Notice" and "Presidential
 *  Document" have ZERO occurrences in this repo's held-row history across every run read for this fix --
 *  guessing an item_type for a class with no observed row would be exactly the false-precision mistake
 *  this file's doctrine forbids, so both still hold `item_type_unmapped`, naming the FR type verbatim; see
 *  `held-classes.mjs`'s dossier for the recommendation if either ever shows up with evidence. Pure.
 *  Case-insensitive (API responses have been observed capitalized; this stays robust to either). */
export function classifyFrDocType(frType) {
  const t = String(frType ?? "").trim().toLowerCase();
  if (t === "rule") return { itemType: "regulation", hold: null };
  if (t === "proposed rule") return { itemType: "initiative", hold: null };
  return { itemType: null, hold: "item_type_unmapped" };
}

/** The hostname of a URL, lowercased, or null for an unparseable URL. Pure. */
export function getHostname(url) {
  try {
    return new URL(String(url)).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Which source family a document_url (or, failing that, the source's own url) belongs to, for
 *  `resolveIdentity` below. Pure. Returns null for any host not yet mapped -- held
 *  `identity_unmapped_source`, host recorded, never guessed at. */
export function classifyHost(url) {
  const host = getHostname(url);
  if (!host) return null;
  if (host.endsWith("eur-lex.europa.eu")) return "eurlex";
  if (host.endsWith("legislation.gov.uk")) return "uk_legislation";
  if (host.endsWith("federalregister.gov")) return "federal_register";
  return null;
}

/**
 * Per-source-family identity resolution: `{ scheme, canonicalKey, itemType, jurisdictionIso, hold, host,
 * needsFrLookup?, frDocumentNumber?, frType? }`. Pure, deterministic given its inputs — federalregister.
 * gov's item_type genuinely requires an external API value (`frDocType`); when that has not been resolved
 * yet, this returns `needsFrLookup: true` and `frDocumentNumber` instead of guessing, and the CALLER
 * (buildRows) is responsible for the actual network call (gated behind --capture, see buildRows) and a
 * second call to this function with `frDocType` supplied. This keeps the function itself free of I/O —
 * the same "caller resolves, function classifies" split this file already uses for capture (buildExportRow
 * takes an already-resolved `capture`, never fetches itself).
 * @param {object} censusRow @param {object|null} source @param {{frDocType?: string}} opts
 */
export function resolveIdentity(censusRow, source, { frDocType } = {}) {
  const documentUrl = censusRow?.document_url ?? null;
  const host = getHostname(documentUrl) ?? getHostname(source?.url) ?? null;
  const family = classifyHost(documentUrl) ?? classifyHost(source?.url);

  if (family === "eurlex") {
    const canonicalKey = deriveKey(censusRow?.instrument_identifier ?? null, documentUrl);
    const { itemType, hold } = classifyItemTypeFromCelexKey(canonicalKey);
    return { scheme: "celex", canonicalKey, itemType, jurisdictionIso: "EU", hold, host };
  }

  if (family === "uk_legislation") {
    const itemType = classifyUkLegislationType(documentUrl);
    return {
      scheme: "uk_legislation",
      canonicalKey: null,
      itemType,
      jurisdictionIso: "GB",
      hold: itemType ? null : "item_type_unmapped",
      host,
    };
  }

  if (family === "federal_register") {
    // Lane HELD (2026-09-02): canonicalKey is now the FR's OWN document number ("2026-13667", extracted
    // verbatim by extractFrDocumentNumber -- never fabricated), not always null. This is a real,
    // stable, citation-shaped identifier the Federal Register itself assigns and publishes per document
    // (its own cross-reference key, the FR analogue of a CELEX id for the EU corpus) -- unlike inventing
    // a CELEX-shaped key for a non-EU host (the false precision this file's header still forbids), a
    // document's OWN registry-assigned number is exactly the kind of key deriveKey resolves for EUR-Lex.
    // Set as soon as the number itself is known, before frType is even looked up, so a row held
    // `no_capture`/`fr_type_pending_capture` upstream (buildRows, before this returns) still carries it.
    const frDocumentNumber = extractFrDocumentNumber(documentUrl);
    if (!frDocumentNumber) {
      return { scheme: "federal_register", canonicalKey: null, itemType: null, jurisdictionIso: "US", hold: "fr_document_number_unresolved", host };
    }
    if (frDocType === undefined) {
      return { scheme: "federal_register", canonicalKey: frDocumentNumber, itemType: null, jurisdictionIso: "US", hold: null, host, needsFrLookup: true, frDocumentNumber };
    }
    const { itemType, hold } = classifyFrDocType(frDocType);
    return { scheme: "federal_register", canonicalKey: frDocumentNumber, itemType, jurisdictionIso: "US", hold, host, frType: frDocType, frDocumentNumber };
  }

  // Lane HELD (2026-09-02): a host none of the three coded families above claim is NOT automatically
  // `identity_unmapped_source` any more. `census_worklist.source_id` already ties this row to a
  // REGISTERED `sources` row (buildRows only calls resolveIdentity once that lookup has succeeded --
  // `source` here is never null in production; see buildRows's own `source_not_found` check, which runs
  // FIRST). When this document_url genuinely belongs to that same registered institution -- confirmed by
  // `institutionKey` equality with the source's own registered url, the SAME identity rule
  // `registerSource`/the live provenance gate already use for tier derivation (institution-key.mjs's own
  // header) -- the row is not "unmapped," it is a document from an institution this registry ALREADY
  // knows, that just isn't one of the three hand-coded schemes (`sameInstitution`, institution-key.mjs).
  // `source.category` (migration 084's
  // four-value canonical routing taxonomy, already loaded for every kept row) is the one classification
  // this registry already carries for that institution without inventing anything: `'regulatory'` sources
  // are, by that migration's own definition, "portals where legislation lives" -- the same claim
  // `item_type`'s schema default ('regulation') already encodes -- so a regulatory-category institution's
  // own document defaults to `item_type: 'regulation'`, `canonicalKey: null` (no scheme exists for a
  // generic host, never invented, same doctrine as legislation.gov.uk above). A matched institution whose
  // category is NOT `'regulatory'` (research/market_news/operational_data/unset) is held
  // `institution_category_unmapped`, naming the category -- a more precise, and more honest, hold than
  // "identity_unmapped_source" for a source this registry can already name (see held-classes.mjs's
  // dossier for the ruling this needs: extend this map, or leave those categories held). A document_url
  // whose host does NOT even institution-match its own row's source (a redirect off-institution, a
  // mis-joined census row) still holds `identity_unmapped_source`, host recorded, exactly as before.
  if (sameInstitution(documentUrl, source?.url)) {
    if (source.category === "regulatory") {
      return { scheme: "registered_institution", canonicalKey: null, itemType: "regulation", jurisdictionIso: null, hold: null, host, category: source.category };
    }
    return { scheme: null, canonicalKey: null, itemType: null, jurisdictionIso: null, hold: "institution_category_unmapped", host, category: source.category ?? null };
  }

  return { scheme: null, canonicalKey: null, itemType: null, jurisdictionIso: null, hold: "identity_unmapped_source", host };
}

/** Strip HTML to plain text. Mirrors src/lib/sources/canonical-fetch.mjs's inline `stripText` (that
 *  function is not exported, so this is a documented re-implementation of the SAME two-line pattern, not
 *  a second design -- see this file's header). Also decodes the handful of entities a raw (un-browser-
 *  rendered) fetch leaves undecoded. Pure. Harmless (a no-op past whitespace collapse) on plain text input
 *  such as a federalregister.gov raw_text_url body or an FR API JSON body -- no tags to strip. */
export function stripHtmlToText(html) {
  return String(html ?? "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    // numeric character references (legislation.gov.uk's data.htm carries `&#xD;` line ends inside
    // running text; mint-run-008 emitted one inside a penalty_summary span) — decoded, never left as markup
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    // U+0000 cannot be stored in a Postgres text column at all ("unsupported Unicode escape sequence" on
    // the insert): a Federal Register raw_text carried one and aborted population-turn run #8's apply
    // mid-batch (2026-09-02). Dropped here, at the capture, so every downstream span is taken from the
    // same text the store will hold. Other C0 controls are whitespace-collapsed below.
    .replace(/\u0000/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract a title from raw HTML: <title> first, then the first <h1>. Returns null when neither is
 *  present or both are blank after stripping. Pure. */
export function extractTitleFromHtml(html) {
  const h = String(html ?? "");
  const titleM = h.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleM) {
    const t = stripHtmlToText(titleM[1]);
    // An OJ file name ("C_2023226EN.01000601.xml") is what EUR-Lex/Cellar put in <title> for Official
    // Journal C-series notices; it is never the act's title (population run #12 exported two rows so
    // titled, 2026-09-02). Skip it so the act-title extractor below gets its turn.
    if (t && !isOjFileName(t)) return { title: t, origin: "captured_title" };
  }
  const h1M = h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1M) {
    const t = stripHtmlToText(h1M[1]);
    if (t) return { title: t, origin: "captured_heading" };
  }
  return null;
}

/** Title for a freshly-captured EUR-Lex clean-text page: `extractTitleFromHtml`'s <title>/<h1> first (in
 *  case the endpoint does carry one), else the first ~300 chars of the stripped body text — EUR-Lex's
 *  clean-text endpoint opens directly with the act's own title (e.g. "COUNCIL DECISION of 14 October 2004
 *  concerning ..." -- coordinator-verified in a browser, 2026-09-02). [UNCONFIRMED] the exact markup
 *  around that opening line: eur-lex.europa.eu's robots.txt blocks this sandbox's own WebFetch from
 *  reading a live page to confirm it (`ROBOTS_DISALLOWED`), so this stays a documented text-lead
 *  heuristic, not a verified tag-targeted extractor. Pure. */
export function extractEurlexTitle(html) {
  const heading = extractTitleFromHtml(html);
  if (heading) return heading;
  const text = stripHtmlToText(html);
  if (!text) return null;
  return bodyLeadTitle(text);
}

// ── Official Journal file names and act titles (2026-09-02, population run #12) ────────────────────────
// OJ C-series notices (e.g. CELEX 32023D0628(01), a Commission decision published in OJ C 226) come back
// from both Cellar and EUR-Lex with the OJ file name as <title> and no `oj-doc-ti` paragraphs; the body
// opens "C_2023226EN.01000601.xml 28.6.2023 EN Official Journal of the European Union C 226/6 COMMISSION
// DECISION of 19 April 2023 on instructing ... (2023/C 226/06) THE EUROPEAN COMMISSION, ...". The act's
// title is the span from the first act-type keyword to its OJ reference parenthetical. Both helpers are
// pure and used by every body-lead fallback so a file name can never become a customer-facing title.
const OJ_FILENAME_RE = /^[A-Z]_\d{7}[A-Z]{2}\.\d{6,}\.xml$/i;
/** True for an Official Journal file name such as "L_2006209EN.01000101.xml" or "C_2023226EN.01000601.xml". */
export function isOjFileName(s) {
  return OJ_FILENAME_RE.test(String(s ?? "").trim());
}
const OJ_ACT_TITLE_RE =
  /\b((?:COMMISSION|COUNCIL|EUROPEAN PARLIAMENT AND (?:OF THE )?COUNCIL|REGULATION|DIRECTIVE|DECISION|RECOMMENDATION)\b[\s\S]{0,400}?\((?:\d{4}\/[A-Z]?\s?\d+(?:\/\d+)?|\d{4}\/\d+\/[A-Z]+)\))/;
/** The act title inside an OJ body lead, or null when no act-type keyword + OJ reference is found. */
export function extractOjActTitle(text) {
  const t = String(text ?? "").replace(/\s+/g, " ");
  const m = t.match(OJ_ACT_TITLE_RE);
  if (!m) return null;
  const title = m[1].trim();
  return title.length >= 20 ? title : null;
}
/** Body-lead fallback shared by the EUR-Lex and Cellar extractors: the act title when the lead carries
 *  one (origin `captured_body_act_title`), else the first ~300 chars with any leading OJ file name
 *  removed (origin `captured_body_lead`). */
function bodyLeadTitle(text) {
  const act = extractOjActTitle(text);
  if (act) return { title: act, origin: "captured_body_act_title" };
  const cleaned = String(text).replace(/^\S+\.xml\s+/i, "");
  const lead = cleaned.slice(0, 300).trim();
  return lead ? { title: lead, origin: "captured_body_lead" } : null;
}

// ── EU Publications Office Cellar (2026-09-02, population run #4) ──────────────────────────────────────
// Run 33643532589 held all 26 EUR-Lex rows `capture_blocked`: eur-lex.europa.eu answers the runner's GET
// on `/legal-content/EN/TXT/HTML/?uri=CELEX:...` with HTTP 202 and a 2,035-byte "verify that you're not
// a robot" interstitial (its bot gate; the same URL renders ~97k chars in a browser). The runner cannot
// and must not pass a bot challenge. The act text is ALSO published, with no gate, by the Publications
// Office's Cellar repository — the system EUR-Lex itself is a front end for:
//   GET https://publications.europa.eu/resource/celex/<CELEX>   (Accept: text/html,application/xhtml+xml;
//   Accept-Language: en) → 303 → http://publications.europa.eu/resource/cellar/<uuid>.<lang>.<fmt>/DOC_1,
//   the act's XHTML (browser-verified 2026-09-02 for 32006D0507: 96,603 chars, `p.oj-doc-ti` title lines,
//   Content-Type application/xhtml+xml). The redirect target is plain http; followUpgradingRedirects
//   below upgrades it to https before following (Cellar serves both; the runner never speaks http).
// Cellar is tried FIRST for every CELEX row; EUR-Lex's clean-text endpoint is the fallback and the held
// evidence names both attempts. A `<title>` on the Cellar page is the OJ file name
// ("L_2006209EN.01000101.xml"), never the act's title — extractCellarTitle reads the `oj-doc-ti`
// paragraphs instead and joins them with single spaces, which is exactly how stripHtmlToText renders
// them in captured_text, so the identity FACT (record-facts.mjs) finds the title verbatim.

/** Cellar's CELEX resolver URL for one key. Pure. `encodeURIComponent` leaves `(` and `)` LITERAL (they
 *  are in its own unreserved set — confirmed: `encodeURIComponent("22004A0806(01)")` === the input,
 *  unchanged) — Cellar's own resolver 404s a literal-paren OJ-sequence-suffixed key (confirmed live,
 *  2026-09-03: `.../celex/22004A0806(01)` → 404 "Resource ... not found"; the SAME key with `(`/`)`
 *  percent-encoded → 302 to a real cellar resource). Encoded explicitly here, after encodeURIComponent, so
 *  every OJ-sequence-suffixed CELEX key (the ten held `capture_blocked` in population-turn run #14) gets a
 *  request Cellar actually resolves, not the request its own JS encoder would build unmodified. */
export function cellarEndpointForCelex(canonicalKey) {
  const encoded = encodeURIComponent(String(canonicalKey)).replace(/\(/g, "%28").replace(/\)/g, "%29");
  return `https://publications.europa.eu/resource/celex/${encoded}`;
}

/** EUR-Lex's own JS bot-gate interstitial: HTTP 202 with the "verify that you're not a robot" marker text
 *  (population-turn run #14's own held evidence, byte-for-byte). Detected by status + marker text, never
 *  by byte count alone (a real short act could coincidentally be near 2,035 bytes). Pure. Used by
 *  `resolveRowCapture`'s celex branch to tell "EUR-Lex permanently refuses this exact request" (worth
 *  holding `no_capture_path`, never retried) apart from any other capture failure (worth retrying,
 *  `capture_blocked`). */
const EURLEX_ROBOT_GATE_RE = /verify that you.?re not a robot/i;
export function isEurlexRobotGate(status, head) {
  return Number(status) === 202 && EURLEX_ROBOT_GATE_RE.test(String(head ?? ""));
}

/** Title for a Cellar XHTML act: the `p.oj-doc-ti` lines joined by a space ("COUNCIL DECISION of 14
 *  October 2004 concerning ... (2006/507/EC)"), origin `cellar_doc_title`; falls back to the body-lead
 *  heuristic extractEurlexTitle uses (never to <title>, which is the OJ file name here). Pure. */
export function extractCellarTitle(html) {
  const h = String(html ?? "");
  const parts = [];
  const re = /<p[^>]*class="[^"]*\boj-doc-ti\b[^"]*"[^>]*>([\s\S]*?)<\/p>/gi;
  for (const m of h.matchAll(re)) {
    const t = stripHtmlToText(m[1]);
    if (t) parts.push(t);
  }
  if (parts.length) return { title: parts.join(" "), origin: "cellar_doc_title" };
  // Older acts (pre-Formex; run 33647357868 hit six, e.g. 32001D0573, 32008R1272) come back from Cellar
  // as the legacy EUR-Lex HTML: <title>EUR-Lex - <CELEX> - EN</title>, an <h1> carrying the CELEX, then
  // the act's title as the first <strong> ("2001/573/EC: Council Decision of 23 July 2001 amending ...").
  // Without this branch the body-lead fallback produced "EUR-Lex - 32001D0573 - EN Important legal
  // notice | 32001D0573 2001/573/EC: Council Decision ..." as the title.
  const legacyTitle = h.match(/<title[^>]*>\s*EUR-Lex\s*-\s*[0-9A-Z()]+\s*-\s*[A-Z]{2}\s*<\/title>/i);
  if (legacyTitle) {
    const strong = h.match(/<strong[^>]*>([\s\S]*?)<\/strong>/i);
    const t = strong ? stripHtmlToText(strong[1]) : "";
    if (t.length >= 20) return { title: t, origin: "cellar_legacy_title" };
  }
  const text = stripHtmlToText(h);
  return text ? bodyLeadTitle(text) : null;
}

/** Wrap a fetch so redirects are followed by hand, upgrading any `http://` Location to `https://` first
 *  (Cellar's 303 points at plain http). Fetch-shaped, so it composes with makePoliteFetch (every hop
 *  pays the politeness gap). Gives up after `maxHops` with the last redirect response, which the caller
 *  then reports as a non-2xx capture. */
export function followUpgradingRedirects(fetchImpl, { maxHops = 5 } = {}) {
  return async function upgradingFetch(url, opts = {}) {
    let current = String(url);
    let res = null;
    for (let hop = 0; hop <= maxHops; hop++) {
      res = await fetchImpl(current, { ...opts, redirect: "manual" });
      const status = Number(res?.status ?? 0);
      const location = typeof res?.headers?.get === "function" ? res.headers.get("location") : null;
      if (![301, 302, 303, 307, 308].includes(status) || !location) return res;
      current = new URL(location, current).toString().replace(/^http:\/\//i, "https://");
    }
    return res;
  };
}

/** Partition rows by the relevance screen (scripts/mint/lib/screen-verdict.mjs: the rules, then the
 *  operator's reviewed verdicts where the rules said ambiguous). ONLY `on_vertical` rows may mint; every
 *  other row is returned in `screenedOut` with its verdict/basis/provenance so the run's evidence names
 *  why it was not exported. Pure. WHY (2026-09-02, population runs #9–#11): the exporter selected on
 *  `dryrun_disposition = 'would_mint'` alone and minted ~130 items from the UNSCREENED pool, about half
 *  of them off-vertical by the operator's own 2026-08-31 ruling — ADR-020's August incident repeated.
 *  The ruling's verdicts were never stamped on census_worklist; this gate applies them at the export,
 *  every run, so they cannot be skipped again.
 *
 *  Lane WSEQ (2026-09-02): a `mintable` row is returned as `{ ...r, screen: { verdict, provenance, basis } }`
 *  — the SAME verdict this function used to decide mintability, carried onto the row itself (not just
 *  recorded for the rejects) — so buildExportRow/buildRows can copy it onto the exported row and
 *  run-mint-batch.mjs's --census-rows path can carry it into the mint payload as `payload.screen`.
 *  Without this, a payload built from an exported row would have NO screen evidence at all: the kit-level
 *  check validate-mint-payload.mjs runs on every record-grade payload could never see WHY the row passed
 *  the screen, only that a filter upstream once let it through — exactly the kind of convention (never
 *  checked, easy to silently regress) this lane's write sequence closes for the item write itself. */
export function partitionByScreen(rows, reviewed = {}) {
  const mintable = [];
  const screenedOut = [];
  for (const r of rows ?? []) {
    const v = screenVerdictFor({ id: r.id, title: r.title ?? null, document_url: r.document_url, surface_tags: r.surface_tags ?? [] }, reviewed);
    if (isMintable(v.verdict)) mintable.push({ ...r, screen: { verdict: v.verdict, provenance: v.provenance, basis: v.basis } });
    else screenedOut.push({ row_id: r.id, document_url: r.document_url, verdict: v.verdict, rule: v.rule, basis: v.basis, provenance: v.provenance });
  }
  return { mintable, screenedOut };
}

/** Select the would_mint census rows this run will consider, in order: disposition filter, then the
 *  optional --source-id / --celex-prefix narrowing, then --limit. Pure. */
export function selectCensusRows(censusRows, { sourceId = null, celexPrefix = null, limit = 50 } = {}) {
  return (censusRows ?? [])
    .filter((r) => r?.dryrun_disposition === "would_mint")
    .filter((r) => !sourceId || r.source_id === sourceId)
    .filter((r) => !celexPrefix || String(r.instrument_identifier ?? "").startsWith(celexPrefix))
    .slice(0, limit == null ? undefined : limit); // null = no cap (main() caps AFTER the held-exclusion)
}

/** Partition selected rows into { kept, excludedHeld } against a Set of source_urls that already have an
 *  intelligence_items row (archived or not). Pure. When `excludeHeld` is false, nothing is excluded
 *  (every row passes through as `kept`) -- the caller still gets the same shape either way. */
export function partitionExcludeHeld(rows, heldUrlSet, excludeHeld = true) {
  if (!excludeHeld) return { kept: rows.slice(), excludedHeld: [] };
  const kept = [], excludedHeld = [];
  for (const r of rows) {
    if (heldUrlSet.has(r.document_url)) excludedHeld.push(r);
    else kept.push(r);
  }
  return { kept, excludedHeld };
}

/** Map `canonical_instrument_key` -> `{ id, archived }` from a live `intelligence_items` read (id,
 *  canonical_instrument_key, archive_reason -- archived rows INCLUDED). Pure. This is the SAME rule
 *  apply-mint-batch.mjs's M4 pre-check uses (`checkM4`/`buildItemsIndex` there: any row, archived or not,
 *  holding this exact key blocks the mint) -- same column, same exact-string equality, so this file's
 *  export-time exclusion can never disagree with the M4 refusal it is meant to pre-empt (Lane EXPORT-HOLD,
 *  2026-09-03, row 26bf4a98-9dc4-472e-9c6a-8883c3bffea1 / holder ab922a18-c9a8-4b1b-9ac6-b7f20606c5d7, this
 *  file's own header). First holder wins on the rare case more than one live row shares a key (should not
 *  happen in a healthy corpus; recorded, never silently overwritten). */
export function buildHeldKeyIndex(items) {
  const byKey = new Map();
  for (const it of items ?? []) {
    const key = it?.canonical_instrument_key;
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, { id: it.id, archived: it.archive_reason != null });
  }
  return byKey;
}

/** Partition rows into { kept, excludedHeldByKey } against `buildHeldKeyIndex`'s map, using the SAME
 *  `canonical_instrument_key` this file's own `resolveIdentity` derives for every row (never a second
 *  key-derivation) -- `source` is not needed for the key itself (only resolveIdentity's registered-
 *  institution fallback branch reads it, and that branch's canonicalKey is always null), so this can run
 *  before sources are even fetched. Pure. A row whose derived key is null (no scheme, e.g.
 *  legislation.gov.uk) passes through untouched -- nothing to collide on.
 *  Excluded rows carry a hold-shaped record (row_id, document_url, canonical_instrument_key, reason
 *  "already_held_by_key", holder_item_id, and holder_archived: true when the holder's own archive_reason
 *  is set) -- unlike partitionExcludeHeld's URL exclusion (correctly silent past a count: a row this run
 *  declines to touch because the corpus already holds it AT THIS URL), a key collision on a DIFFERENT url
 *  is new information worth keeping legible in <out>.held.json until the URL-shape mismatch this closes
 *  stops recurring (Lane EXPORT-HOLD, 2026-09-03). */
export function partitionExcludeHeldByKey(rows, heldKeyIndex) {
  const kept = [], excludedHeldByKey = [];
  for (const r of rows) {
    const canonicalKey = resolveIdentity(r, null).canonicalKey;
    const holder = canonicalKey ? heldKeyIndex.get(canonicalKey) : null;
    if (holder) {
      excludedHeldByKey.push({
        row_id: r.id,
        document_url: r.document_url,
        canonical_instrument_key: canonicalKey,
        reason: "already_held_by_key",
        holder_item_id: holder.id,
        ...(holder.archived ? { holder_archived: true } : {}),
      });
    } else {
      kept.push(r);
    }
  }
  return { kept, excludedHeldByKey };
}

// ── IN-FORCE SCREEN (Lane HOLLOW-GATE, 2026-09-04) ──────────────────────────────────────────────────────
// Build requirement 3: a row whose capture states the act is no longer in force must be HELD `not_in_force`
// with the evidence span, never minted. EUR-Lex's interactive act page carries this as a structurally
// distinct widget: `<p class="forceIndicator ..."><span ...>...</span>STATUS TEXT</p>`, e.g.
// `<p class="forceIndicator forceIndicatorRED">... <span ...></span>No longer in force</p>` (red/off) vs.
// `<p class="forceIndicator forceIndicatorGREEN">... <span ...></span>In force</p>` (green/on).
//
// This deliberately does NOT do a bare substring search for "no longer in force" anywhere in captured
// text. [CONFIRMED, Supabase, 2026-09-04] The literal phrase "no longer in force" appears in the BODY
// PROSE (a recital) of CELEX 32020R0893, a document that is itself currently in force -- that recital
// describes a DIFFERENT, unrelated repealed regulation. A bare scan would have wrongly held a live,
// in-force row. Anchoring on the `forceIndicator` widget markup itself (only ever present when an
// agent-driven historical capture happened to carry the interactive page's raw HTML -- see
// `agent_run_searches` capture-shape note in resolveRowCapture's own header) avoids that trap the same way
// record-facts.mjs's `findInForceStatusMatch` does. This is an independent, from-scratch implementation in
// this file (not a cross-file import) -- consistent with this repo's existing per-file convention of small,
// zero-dependency detectors (see stripHtmlToText / extractTitleFromHtml above, each self-contained).
//
// [CONFIRMED, Supabase, 2026-09-04] Zero rows in the live `agent_run_searches` corpus carry a genuine
// forceIndicatorRED / "No longer in force" widget today (n_red = 0, verified with a properly-`FILTER`ed
// count after an earlier mis-aggregated query overcounted). This screen is therefore built and tested
// against a real-shaped GREEN fixture (32020R0893, including its own false-positive-trap prose) plus an
// explicitly `[HYPOTHESIS]`-labeled synthetic RED fixture (EUR-Lex's own asset-naming convention inferred,
// not observed live) -- it is currently INERT against the live corpus (holds nothing today) but is real
// protection the moment such a row's raw HTML is captured (e.g. via the MINT-RUNBOOK §1a browser-capture
// escape hatch for a WAF-blocked EUR-Lex row).

const FORCE_INDICATOR_RE = /<p[^>]*class="[^"]*\bforceIndicator\b[^"]*"[^>]*>[\s\S]{0,300}?<\/span>\s*([^<]{1,200})/i;
const NOT_IN_FORCE_STATUS_RE = /^no longer in force\b/i;

/** Scan `capturedText` for EUR-Lex's own structurally-anchored in-force-status widget markup and report
 *  whether it states the act is no longer in force. Returns `null` when no such widget is present (the
 *  common case: neither the Cellar nor the EUR-Lex clean-text capture endpoints this pipeline fetches by
 *  default ever carry this interactive-page-only widget). Never a bare substring scan -- see header above
 *  for why that is unsafe. Pure, no I/O. */
export function detectNotInForce(capturedText) {
  const text = String(capturedText ?? "");
  const m = text.match(FORCE_INDICATOR_RE);
  if (!m) return null;
  const statusText = m[1].trim();
  if (!statusText) return null;
  return { span: m[0], statusText, notInForce: NOT_IN_FORCE_STATUS_RE.test(statusText) };
}

/**
 * Build one enriched export row (or a hold record) from a census_worklist row plus its resolved source,
 * resolved identity, and resolved capture. Pure -- every input is already resolved by the caller (no I/O
 * in here); this is the same "caller resolves, this classifies" split `resolveIdentity` documents above.
 * @param {object} censusRow census_worklist row (id, document_url, instrument_identifier, ...)
 * @param {object|null} source the resolved `sources` row, or null if none was found
 * @param {object} identity `resolveIdentity`'s (already-finalized — no `needsFrLookup` pending) output
 * @param {{text:string|null, html?:string|null, title?:string|null, titleOrigin?:string|null}} capture
 *   the resolved capture: `text` becomes captured_text; `title`/`titleOrigin` when the capture step
 *   already resolved a title (federalregister.gov's API title, EUR-Lex's body-lead, ...); `html`, when
 *   present and no `title` was supplied, is read via `extractTitleFromHtml` as a last attempt before the
 *   source-name fallback.
 * @returns {{row:object}|{hold:object}}
 */
export function buildExportRow(censusRow, source, identity, capture) {
  const rowId = censusRow?.id ?? null;
  const documentUrl = censusRow?.document_url ?? null;

  if (!source) {
    return { hold: { row_id: rowId, document_url: documentUrl, reason: "source_not_found" } };
  }

  if (identity?.hold) {
    return {
      hold: {
        row_id: rowId,
        document_url: documentUrl,
        instrument_identifier: censusRow?.instrument_identifier ?? null,
        canonical_instrument_key: identity.canonicalKey ?? null,
        scheme: identity.scheme ?? null,
        host: identity.host ?? null,
        ...(identity.frType ? { fr_type: identity.frType } : {}),
        ...(identity.category !== undefined ? { category: identity.category } : {}),
        reason: identity.hold,
      },
    };
  }

  const capturedText = capture?.text ?? null;
  if (!capturedText || capturedText.trim().length <= 200) {
    return {
      hold: {
        row_id: rowId,
        document_url: documentUrl,
        reason: "capture_too_short",
        fetched_length: capturedText ? capturedText.length : 0,
      },
    };
  }

  const forceStatus = detectNotInForce(capturedText);
  if (forceStatus?.notInForce) {
    return {
      hold: {
        row_id: rowId,
        document_url: documentUrl,
        reason: "not_in_force",
        evidence_span: forceStatus.span,
        status_text: forceStatus.statusText,
      },
    };
  }

  let title = capture?.title ?? null;
  let titleOrigin = capture?.titleOrigin ?? null;
  if (!title && capture?.html) {
    const t = extractTitleFromHtml(capture.html);
    if (t) { title = t.title; titleOrigin = t.origin; }
  }
  if (!title) {
    title = censusRow?.instrument_identifier
      ? `${source.name ?? source.url} — ${censusRow.instrument_identifier}`
      : (source.name ?? source.url);
    titleOrigin = "source_name_fallback";
  }

  return {
    row: {
      row_id: rowId,
      source_url: documentUrl,
      item_type: identity.itemType,
      title,
      title_origin: titleOrigin,
      instrument_identifier: censusRow?.instrument_identifier ?? null,
      canonical_instrument_key: identity.canonicalKey ?? null,
      jurisdiction_iso: identity.jurisdictionIso ?? null,
      priority: "MODERATE",
      source: {
        id: source.id,
        url: source.url,
        base_tier: source.base_tier ?? null,
        tier_override: source.tier_override ?? null,
        status: source.status,
        institution_id: source.institution_id ?? null,
        category: source.category ?? null,
        name: source.name ?? null,
      },
      captured_text: capturedText,
      fetched_length: capturedText.length,
      // Lane WSEQ (2026-09-02): the relevance-screen verdict partitionByScreen attached to this censusRow
      // (null when buildExportRow is called directly, outside the screened export path, e.g. by a test) —
      // carried onto the exported row so run-mint-batch.mjs's --census-rows path can pass it straight into
      // buildRecordPayload as `screen`, and validate-mint-payload.mjs's kit check can see it.
      screen: censusRow?.screen ?? null,
    },
  };
}

// ── live capture (network; injected fetchImpl so tests never hit the network) ──────────────────────────

/** Politely fetch one URL and reduce it to { ok, status, text, html, error }. `fetchImpl` defaults to
 *  the global fetch; a caller may inject a stub for tests. Times out at `timeoutMs` (default 20000).
 *  Generic across every family below -- HTML gets tag-stripped, plain text (an FR raw_text_url body, an
 *  FR API JSON body) passes through `stripHtmlToText` as a harmless no-op past whitespace collapse. */
export async function captureDocument(url, { fetchImpl = fetch, timeoutMs = 20000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      headers: {
        "user-agent": "FSI-population-turn/1.0 (+population-turn)",
        accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "accept-language": "en",
      },
      signal: controller.signal,
    });
    const html = await res.text();
    return { ok: res.ok, status: res.status, html, text: stripHtmlToText(html), error: res.ok ? null : `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, status: null, html: null, text: null, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/** A rate-limited fetch bound to one politeness gap (POPULATION_FETCH_GAP_MS, default 1000ms), matching
 *  run-source-sweep.mjs's politeFetch discipline (1 req/s, never a burst). Fetch-shaped (not
 *  capture-shaped) so it can be handed to `captureDocument` as `fetchImpl` for ANY of this row's fetches
 *  -- a federalregister.gov row's two requests (API JSON, then raw_text_url) share ONE politeFetch
 *  instance via buildRows below, so the gap is enforced across BOTH, not just within one family's own
 *  internal retry. */
export function makePoliteFetch({ gapMs = Number(process.env.POPULATION_FETCH_GAP_MS ?? 1000), fetchImpl = fetch } = {}) {
  let lastFetchAt = 0;
  return async function politeFetch(url, opts) {
    const wait = lastFetchAt + gapMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastFetchAt = Date.now();
    return fetchImpl(url, opts);
  };
}

/** Fetch + parse a federalregister.gov document's API JSON (`/api/v1/documents/<docnum>.json`), reducing
 *  it to exactly what identity + capture need: `{ ok, status, bytes, head, endpoint, frType, title,
 *  rawTextUrl, error }`. `bytes`/`head` are always populated (even on failure) so a hold built from this
 *  carries the same evidence shape `capture_blocked` requires elsewhere in this file. */
export async function fetchFrDocumentMeta(documentNumber, { fetchImpl = fetch, timeoutMs = 20000 } = {}) {
  const endpoint = `https://www.federalregister.gov/api/v1/documents/${documentNumber}.json`;
  const res = await captureDocument(endpoint, { fetchImpl, timeoutMs });
  const bytes = Buffer.byteLength(res.html ?? "", "utf8");
  const head = (res.text ?? "").slice(0, 300);
  if (!res.ok) {
    return { ok: false, status: res.status, bytes, head, endpoint, frType: null, title: null, rawTextUrl: null, error: res.error };
  }
  let json;
  try {
    json = JSON.parse(res.html ?? "");
  } catch (err) {
    return { ok: false, status: res.status, bytes, head, endpoint, frType: null, title: null, rawTextUrl: null, error: `unparseable FR API JSON: ${err.message}` };
  }
  return {
    ok: true,
    status: res.status,
    bytes,
    head,
    endpoint,
    frType: json?.type ?? null,
    title: json?.title ?? null,
    rawTextUrl: json?.raw_text_url ?? null,
    error: null,
  };
}

/** Reduce one `captureDocument` result into the unified capture envelope every family below returns:
 *  `{ usable, status, bytes, head, endpoint, text, html, title?, titleOrigin?, error, ...extra }`.
 *  `usable` is the SAME test buildExportRow's own capture_too_short check makes (ok AND >200 stripped
 *  chars) — computed once here so a `capture_blocked` hold and a usable row never disagree about the
 *  threshold. `titleFn`, when usable, is called on the raw html/text to pre-resolve a title. */
function envelopeFromCaptureDocument(res, endpoint, { titleFn = null, ...extra } = {}) {
  const bytes = Buffer.byteLength(res.html ?? "", "utf8");
  const text = res.text ?? "";
  const head = text.slice(0, 300);
  const usable = !!(res.ok && text.trim().length > 200);
  const envelope = { usable, status: res.status, bytes, head, endpoint, text: usable ? text : null, html: res.html ?? null, error: res.error, ...extra };
  if (usable && titleFn) {
    const t = titleFn(res.html);
    if (t) { envelope.title = t.title; envelope.titleOrigin = t.origin; }
  }
  return envelope;
}

/**
 * Per-family live capture, given an already-resolved `identity` (its `needsFrLookup` case must already be
 * resolved by the caller -- see buildRows). Returns the unified envelope `envelopeFromCaptureDocument`
 * documents, or `{ usable: false, ... }` when this identity carries no capture path at all (should not
 * happen in practice -- buildRows only calls this after `identity.hold` is already false).
 */
export async function resolveRowCapture(censusRow, identity, { fetchImpl = fetch, timeoutMs = 20000 } = {}) {
  const documentUrl = censusRow?.document_url ?? null;

  if (identity.scheme === "celex" && identity.canonicalKey) {
    // Cellar first (no bot gate; see the Cellar block above), EUR-Lex's clean-text endpoint as fallback.
    const cellar = cellarEndpointForCelex(identity.canonicalKey);
    const first = await captureDocument(cellar, { fetchImpl: followUpgradingRedirects(fetchImpl), timeoutMs });
    const firstEnv = envelopeFromCaptureDocument(first, cellar, { titleFn: extractCellarTitle });
    if (firstEnv.usable) return firstEnv;
    const endpoint = `https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:${identity.canonicalKey}`;
    const res = await captureDocument(endpoint, { fetchImpl, timeoutMs });
    const env = envelopeFromCaptureDocument(res, endpoint, {
      titleFn: extractEurlexTitle,
      fallbackFrom: cellar,
      cellar_status: firstEnv.status,
      cellar_bytes: firstEnv.bytes,
      cellar_head: firstEnv.head,
    });
    // Cellar already refused (firstEnv not usable, above) AND EUR-Lex's own fallback is its known bot-gate
    // interstitial: no capture path exists for this exact request, and re-fetching it every run gains
    // nothing (see isEurlexRobotGate's header). Tagged on the envelope, not decided here, so buildRows'
    // hold classification stays the one place a hold reason is chosen.
    if (!env.usable && isEurlexRobotGate(env.status, env.head)) env.noCapturePath = true;
    return env;
  }

  if (identity.scheme === "uk_legislation") {
    const dataEndpoint = `${String(documentUrl ?? "").replace(/\/+$/, "")}/data.htm`;
    const first = await captureDocument(dataEndpoint, { fetchImpl, timeoutMs });
    const firstEnv = envelopeFromCaptureDocument(first, dataEndpoint, { titleFn: extractTitleFromHtml });
    if (firstEnv.usable) return firstEnv;
    const fb = await captureDocument(documentUrl, { fetchImpl, timeoutMs });
    return envelopeFromCaptureDocument(fb, documentUrl, { titleFn: extractTitleFromHtml, fallbackFrom: dataEndpoint });
  }

  if (identity.scheme === "federal_register") {
    const meta = identity._frMeta ?? (await fetchFrDocumentMeta(identity.frDocumentNumber, { fetchImpl, timeoutMs }));
    if (!meta.ok || !meta.rawTextUrl) {
      return { usable: false, status: meta.status ?? null, bytes: meta.bytes ?? 0, head: meta.head ?? "", endpoint: meta.endpoint ?? null, error: meta.error ?? "FR API response carried no raw_text_url" };
    }
    const res = await captureDocument(meta.rawTextUrl, { fetchImpl, timeoutMs });
    const env = envelopeFromCaptureDocument(res, meta.rawTextUrl, { apiEndpoint: meta.endpoint });
    if (env.usable) { env.title = meta.title ?? null; env.titleOrigin = "fr_api_title"; }
    return env;
  }

  return { usable: false, status: null, bytes: 0, head: "", endpoint: null, error: "no capture path for this identity scheme" };
}

/** Build the { rows, held } arrays for every kept census row, given lookup maps for source and existing
 *  capture text. Rows with no existing capture are captured PER FAMILY (see resolveRowCapture) ONLY when
 *  `capture` is true; otherwise they hold "no_capture" immediately. federalregister.gov's item_type
 *  ALSO needs a live API call (see this file's header) — that lookup is likewise gated behind `capture`
 *  so a --capture-off run stays fully network-free; an FR row that already carries existing DB text but
 *  has never had its type classified holds the distinct `fr_type_pending_capture` in that case, never
 *  silently exported with a guessed type. Returns counts alongside the arrays so the CLI summary and the
 *  tests share one source of truth. */
export async function buildRows(
  keptCensusRows,
  { sourcesById, existingCaptureByUrl, capture = false, fetchImpl = fetch, timeoutMs = 20000 } = {},
) {
  const rows = [];
  const held = [];
  let captured = 0;
  let captureFailed = 0;

  for (const censusRow of keptCensusRows) {
    const source = sourcesById.get(censusRow.source_id) ?? null;
    if (!source) {
      held.push({ row_id: censusRow.id, document_url: censusRow.document_url, reason: "source_not_found" });
      continue;
    }

    let identity = resolveIdentity(censusRow, source);
    let existingCapture = existingCaptureByUrl.get(censusRow.document_url) ?? null;

    if (identity.needsFrLookup) {
      if (!capture) {
        held.push({
          row_id: censusRow.id,
          document_url: censusRow.document_url,
          reason: existingCapture ? "fr_type_pending_capture" : "no_capture",
        });
        continue;
      }
      const meta = await fetchFrDocumentMeta(identity.frDocumentNumber, { fetchImpl, timeoutMs });
      if (!meta.ok) {
        captureFailed += 1;
        held.push({
          row_id: censusRow.id,
          document_url: censusRow.document_url,
          reason: "capture_blocked",
          http_status: meta.status,
          bytes: meta.bytes,
          head: meta.head,
          endpoint: meta.endpoint,
        });
        continue;
      }
      identity = resolveIdentity(censusRow, source, { frDocType: meta.frType });
      identity._frMeta = meta;
      if (existingCapture) existingCapture = { text: existingCapture.text, html: null, title: meta.title, titleOrigin: "fr_api_title" };
    }

    if (identity.hold) {
      held.push({
        row_id: censusRow.id,
        document_url: censusRow.document_url,
        instrument_identifier: censusRow.instrument_identifier ?? null,
        canonical_instrument_key: identity.canonicalKey ?? null,
        scheme: identity.scheme ?? null,
        host: identity.host ?? null,
        ...(identity.frType ? { fr_type: identity.frType } : {}),
        ...(identity.category !== undefined ? { category: identity.category } : {}),
        reason: identity.hold,
      });
      continue;
    }

    let captureResult = existingCapture;
    if (!captureResult) {
      if (!capture) {
        held.push({ row_id: censusRow.id, document_url: censusRow.document_url, reason: "no_capture" });
        continue;
      }
      const envelope = await resolveRowCapture(censusRow, identity, { fetchImpl, timeoutMs });
      if (!envelope || !envelope.usable) {
        captureFailed += 1;
        held.push({
          row_id: censusRow.id,
          document_url: censusRow.document_url,
          // Lane EXPORT-HOLD (2026-09-03): Cellar refused AND EUR-Lex's own fallback matched its known
          // bot-gate interstitial (isEurlexRobotGate, tagged on the envelope by resolveRowCapture) -> no
          // capture path exists for this exact request; held distinctly so it is never mistaken for a
          // transient failure worth retrying every run (see this file's header, run #14).
          reason: envelope?.noCapturePath ? "no_capture_path" : "capture_blocked",
          http_status: envelope?.status ?? null,
          bytes: envelope?.bytes ?? null,
          head: envelope?.head ?? null,
          endpoint: envelope?.endpoint ?? null,
          // a family that tried a first endpoint before this one records that attempt too (Cellar → EUR-Lex,
          // data.htm → page): a hold must name EVERY endpoint that refused, not just the last
          ...(envelope?.fallbackFrom ? { fallback_from: envelope.fallbackFrom } : {}),
          ...(envelope?.cellar_status !== undefined ? { cellar_status: envelope.cellar_status, cellar_bytes: envelope.cellar_bytes, cellar_head: envelope.cellar_head } : {}),
        });
        continue;
      }
      captured += 1;
      captureResult = envelope;
    }

    const built = buildExportRow(censusRow, source, identity, captureResult);
    if (built.hold) held.push(built.hold);
    else rows.push(built.row);
  }

  return { rows, held, captured, captureFailed };
}

// ── summary formatting (pure) ───────────────────────────────────────────────────────────────────────

export function summarize({ eligibleCount, excludedHeldCount, excludedHeldByKeyCount = 0, rows, held, captured, captureFailed }) {
  const heldByReason = {};
  for (const h of held) heldByReason[h.reason] = (heldByReason[h.reason] ?? 0) + 1;
  const lines = [
    `export-census-rows: eligible (post filters/limit)=${eligibleCount}`,
    `  excluded_held (already have an intelligence_items row at this URL)=${excludedHeldCount}`,
    `  excluded_held_by_key (already have an intelligence_items row at this canonical_instrument_key)=${excludedHeldByKeyCount}`,
    `  exported=${rows.length}`,
    `  held=${held.length}${held.length ? " -> " + Object.entries(heldByReason).map(([k, v]) => `${k}=${v}`).join(", ") : ""}`,
    `  captured=${captured} capture_failed=${captureFailed}`,
  ];
  return lines.join("\n");
}

/** The operator-reviewed verdicts file the 2026-08-31 screen rounds produced (scripts/mint/reviewed-verdicts.json).
 *  Absent file = no reviewed overrides (the rules alone decide); a malformed file is an error, never ignored. */
export function loadReviewedVerdicts(path = resolve(dirname(fileURLToPath(import.meta.url)), "reviewed-verdicts.json")) {
  if (!existsSync(path)) return {};
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`reviewed-verdicts must be a JSON object keyed by census_worklist.id: ${path}`);
  return parsed;
}

export function countBy(list, keyFn) {
  const out = {};
  for (const x of list ?? []) { const k = keyFn(x); out[k] = (out[k] ?? 0) + 1; }
  return out;
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────────

function usage() {
  return [
    "Usage: node scripts/mint/export-census-rows.mjs [--limit 50] [--source-id <uuid>]",
    "         [--celex-prefix 32024] [--include-held] [--capture] [--out path/to/census-rows.json]",
  ].join("\n");
}

function defaultOutPath() {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return resolve(FSI_ROOT, "scripts", "_snapshots", `population-${ts}`, "census-rows.json");
}

function heldPathFor(outPath) {
  return outPath.replace(/\.json$/i, ".held.json");
}

/** Read `columns` from `table` for rows whose `keyColumn` is in `values`, in chunks (PostgREST `in`
 *  filters are URL-encoded; 50 keeps a chunk of long document URLs under the request-line limit). */
export async function fetchRowsIn(sb, table, columns, keyColumn, values, { chunk = 50 } = {}) {
  const out = [];
  for (let i = 0; i < values.length; i += chunk) {
    const slice = values.slice(i, i + chunk);
    const { data, error } = await sb.from(table).select(columns).in(keyColumn, slice);
    if (error) throw new Error(`fetchRowsIn(${table}) failed: ${error.message}`);
    out.push(...(data ?? []));
  }
  return out;
}

/** Distinct values of `column` for rows whose `keyColumn` is in `values`. */
export async function fetchColumnIn(sb, table, column, keyColumn, values, opts) {
  const rows = await fetchRowsIn(sb, table, column, keyColumn, values, opts);
  return [...new Set(rows.map((r) => r[column]).filter(Boolean))];
}

export async function main() {
  const { values } = parseArgs({
    options: {
      limit: { type: "string", default: "50" },
      "source-id": { type: "string" },
      "celex-prefix": { type: "string" },
      "include-held": { type: "boolean", default: false },
      capture: { type: "boolean", default: false },
      out: { type: "string" },
      help: { type: "boolean", default: false },
    },
    allowPositionals: false,
    strict: true,
  });

  if (values.help) {
    console.log(usage());
    return;
  }

  const limit = Number(values.limit);
  if (!Number.isFinite(limit) || limit <= 0) {
    console.error(`export-census-rows: --limit must be a positive number (got ${JSON.stringify(values.limit)}).\n${usage()}`);
    process.exit(1);
  }

  try { process.loadEnvFile(resolve(FSI_ROOT, ".env.local")); } catch { /* CI: env injected */ }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("export-census-rows: no DB creds — cannot run here (exit 2).");
    process.exit(2);
  }
  const { readAll, readClient } = await import("../lib/db.mjs");

  // READ SHAPE (population-turn run 33631394941, 2026-09-02): the first live dry run read ALL of
  // agent_run_searches (result_url, result_content) through readAll and Postgres cancelled the statement
  // ("canceling statement due to statement timeout"): result_content is the grounding pool, full captured
  // documents per ADR-016, and the table is far larger than any batch this script exports. Reads are now
  // batch-scoped: census rows first (would_mint only), the selection applied, and only THEN the captures,
  // holder urls and sources for the selected rows, fetched by `in (...)` in chunks. Nothing here reads a
  // table it does not need whole.
  console.log("export-census-rows: reading census_worklist (would_mint)...");
  const censusRows = await readAll(
    "census_worklist",
    "id, source_id, document_url, title, lane, shape_class, enumeration_status, dryrun_disposition, hold_reason, surface_tags, instrument_identifier",
    { match: (q) => q.eq("dryrun_disposition", "would_mint") }, // readAll's match is a query fn (db.mjs:135), not an object
  );
  const preselected = selectCensusRows(censusRows, {
    sourceId: values["source-id"] || null,
    celexPrefix: values["celex-prefix"] || null,
    limit: null, // the held-exclusion below needs the full ordered candidate set; the limit is applied after it
  });
  const sb = readClient();
  const candidateUrls = [...new Set(preselected.map((r) => r.document_url).filter(Boolean))];
  // Defect 1 (Lane EXPORT-HOLD, 2026-09-03, this file's own header): a row can share its instrument with
  // an existing intelligence_items row under a DIFFERENT url shape, so the url-only check above misses it
  // and the payload only gets refused later, by apply-mint-batch.mjs's M4 pre-check. canonical_instrument_key
  // is read alongside source_url, batch-scoped exactly like it (an `in (...)` chunked read, never the whole
  // table -- see the READ SHAPE note above), and the SAME M4 rule (buildHeldKeyIndex's own header) is
  // applied here, before a payload is ever built.
  const candidateKeys = [...new Set(preselected.map((r) => resolveIdentity(r, null).canonicalKey).filter(Boolean))];
  const [heldUrlSet, heldItemsByKey] = await Promise.all([
    fetchColumnIn(sb, "intelligence_items", "source_url", "source_url", candidateUrls).then((urls) => new Set(urls)),
    fetchRowsIn(sb, "intelligence_items", "id, canonical_instrument_key, archive_reason", "canonical_instrument_key", candidateKeys),
  ]);
  const heldKeyIndex = buildHeldKeyIndex(heldItemsByKey);
  const excludeHeld = !values["include-held"];
  const { kept: keptUnscreened0, excludedHeld } = partitionExcludeHeld(preselected, heldUrlSet, excludeHeld);
  const { kept: keptUnscreened, excludedHeldByKey } = excludeHeld
    ? partitionExcludeHeldByKey(keptUnscreened0, heldKeyIndex)
    : { kept: keptUnscreened0, excludedHeldByKey: [] };
  // The relevance screen, applied at the export every run (see partitionByScreen). The limit is applied
  // to MINTABLE rows, so a limit-50 dispatch yields 50 on-vertical candidates, not 50 minus the junk.
  const reviewed = loadReviewedVerdicts();
  const { mintable: keptAll, screenedOut } = partitionByScreen(keptUnscreened, reviewed);
  const kept = limit ? keptAll.slice(0, limit) : keptAll;
  const selected = preselected;

  const sourceIds = [...new Set(kept.map((r) => r.source_id).filter(Boolean))];
  const sources = await fetchRowsIn(sb, "sources", "id, url, name, base_tier, tier_override, status, institution_id, category", "id", sourceIds);
  const sourcesById = new Map(sources.map((s) => [s.id, s]));
  const keptUrls = [...new Set(kept.map((r) => r.document_url).filter(Boolean))];
  const searches = await fetchRowsIn(sb, "agent_run_searches", "result_url, result_content", "result_url", keptUrls);
  const existingCaptureByUrl = new Map();
  for (const s of searches) {
    if (!s.result_url || typeof s.result_content !== "string" || s.result_content.length <= 200) continue;
    if (!existingCaptureByUrl.has(s.result_url)) existingCaptureByUrl.set(s.result_url, { text: s.result_content, html: null });
  }

  const fetchImpl = values.capture ? makePoliteFetch() : fetch;
  const { rows, held, captured, captureFailed } = await buildRows(kept, {
    sourcesById,
    existingCaptureByUrl,
    capture: values.capture,
    fetchImpl,
  });

  const outPath = resolve(values.out || defaultOutPath());
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(rows, null, 2) + "\n", "utf8");
  console.log(`Wrote ${outPath} (${rows.length} row(s))`);
  const screenedPath = outPath.replace(/\.json$/, ".screened-out.json");
  // Evidence sized for a reader: verdict counts, the off-vertical rows rolled up by rule, and the
  // ambiguous rows in full (those are the ones that need a ruling); the standing off-vertical set is
  // ~1,700 rows every run and is already recorded row-by-row in the screen family's artifacts.
  writeFileSync(screenedPath, JSON.stringify({
    counts: countBy(screenedOut, (x) => x.verdict),
    off_vertical_by_rule: countBy(screenedOut.filter((x) => x.verdict === "off_vertical"), (x) => `${x.provenance}:${x.rule ?? "reviewed"}`),
    ambiguous: screenedOut.filter((x) => x.verdict === "ambiguous"),
  }, null, 1) + "\n", "utf8");
  console.log(`Wrote ${screenedPath} (${screenedOut.length} row(s) not exported by the relevance screen: ${JSON.stringify(countBy(screenedOut, (x) => x.verdict))})`);

  // excludedHeldByKey rows never reach buildRows (excluded before capture/sources are even fetched) but
  // are still written into the held file, distinctly labelled, per this file's header: unlike a plain
  // url-holder exclusion (silently correct, counted only), a key collision on a different url is new
  // information worth keeping legible until defect 1 stops recurring.
  const heldPath = heldPathFor(outPath);
  const heldAll = [...excludedHeldByKey, ...held];
  writeFileSync(heldPath, JSON.stringify(heldAll, null, 2) + "\n", "utf8");
  console.log(`Wrote ${heldPath} (${heldAll.length} held row(s))`);

  console.log(summarize({
    eligibleCount: selected.length,
    excludedHeldCount: excludedHeld.length,
    excludedHeldByKeyCount: excludedHeldByKey.length,
    rows,
    held, // build-failure holds only; excludedHeldByKey is reported on its own line above, not folded in
    captured,
    captureFailed,
  }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error("export-census-rows: fatal:", e);
    process.exit(1);
  });
}
