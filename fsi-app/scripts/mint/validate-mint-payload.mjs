#!/usr/bin/env node
// validate-mint-payload.mjs — a $0, local, no-DB replica of public.validate_item_provenance's seven live
// criteria (C1-C7), run against a mint PAYLOAD (see payload-schema.json) BEFORE the coordinator ever writes
// a row. This is the gate every M0/M1..Mn payload must clear before handoff (MINT-RUNBOOK.md step 5).
//
// PROVENANCE: this is a hand-port of the LIVE function body reconstructed from the migration chain
// (114 -> 119 -> 145 -> 150 -> 158 -> 171 -> 202 -> 206 -> 209 -> 216/217 -> 218(revert) -> 224/225 ->
// 227 -> 250 -> 254 -> 264), read migration-by-migration in this lane (see the M0 report's "write plan"
// section for the full derivation). One piece is imported UNMODIFIED from src/ rather than re-derived:
//   src/lib/agent/gate-a-scan.mjs   -- criterion 7 (Gate A). Imported directly (lane DEAD-EXEC,
//   2026-09-04): the mint kit's own scripts/mint/lib/gate-a-scan.mjs / gate-a-match.mjs shims (pure
//   `export *` re-exports of this same file since Wave GOV-SINGLE) were deleted as dead weight — this
//   was their one real (non-test) importer. gate-a-match.mjs itself is not imported here; only
//   validate-mint-payload.mjs's own scanBrief() call needs gate-a-scan.mjs directly.
// One piece is a faithful JS port of a live SQL function:
//   lib/canonicalize-citation-url.mjs            -- criterion 2's URL compare (migration 150).
//
// KNOWN SIMPLIFICATIONS vs the live DB function (named, not hidden):
//   - A FACT/ANALYSIS claim's cited source is resolved against the payload's own `source` +
//     `registry_sources` + `search_results` (the payload's closed world), not by a search_result_id /
//     source_id foreign key into live tables. This is the natural analogue for a pre-apply payload: the
//     coordinator's real INSERT still creates the links this validator is standing in for. The SPAN check
//     (criterion 3's "is the span in the cited text") matches the claim's `source_url` to a search result
//     by exact canonical URL. The AUTHORITY-TIER lookup (criterion 3's floor) resolves the claim's
//     `source_url` to a registered source by exact canonical URL first and, failing that, by REGISTRY
//     IDENTITY (scripts/lib/institution-key.mjs's institutionKey — the same rule registerSource dedups
//     by): a fact citing `legislation.gov.uk/uksi/2021/1095` is a fact OF the registered institution row
//     `legislation.gov.uk/`. That is exactly what the live gate computes, because apply-mint-batch.mjs
//     binds every grounded fact's `source_id` to the payload's source and migration 202 derives the tier
//     through that FK. Before 2026-09-02 this lookup was exact-URL only, stricter than the registry's own
//     identity, and it failed all 19 record-grade payloads of mint-run-008 with `source_tier_derived:
//     null` against a tier-1 registered source (population run #4). Never re-tighten it to exact URL.
//   - Gate A's DERIVED-claim coverage arm (Gate B, migration 227: derivedCoveredTokens, a live DB lookup)
//     is not modeled -- this validator always passes an empty derivedCovered set to scanBrief(). A payload
//     that legitimately needs a DERIVED claim to clear Gate A must get a coordinator-side check; flag this
//     in the payload's cover note (see MINT-RUNBOOK.md).
//   - No "standard-only floor loosens to institution tier 4" case has been exercised end-to-end (this kit's
//     proof item is a directive); the logic is ported from migration 202 but unverified for that item_type.
//
// USAGE:
//   node scripts/mint/validate-mint-payload.mjs scripts/mint/example-payload.json
//   import { validateMintPayload } from "./validate-mint-payload.mjs";  // for programmatic / test use

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { scanBrief } from "../../src/lib/agent/gate-a-scan.mjs";
import { canonicalizeCitationUrl } from "./lib/canonicalize-citation-url.mjs";
import { institutionKey } from "../lib/institution-key.mjs";
import { isImplementedSeriesKey } from "../../src/lib/market/series-registry.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REQUIRED_SLOTS = JSON.parse(readFileSync(resolve(__dirname, "item-type-required-slots.json"), "utf8"));

// KIT VERSION (Lane HOLLOW-GATE, 2026-09-04). This module had no version constant before this lane; adding
// one now that a new kit-level check (record_hollow, below) changes what "green" means for a record-grade
// payload — see MINT-RUNBOOK.md §5's kept-in-sync note.
export const VALIDATE_MINT_PAYLOAD_KIT_VERSION = "vmp-2026-09-04.2"; // +criterion-3 floor as warning (migration 302)

// ── Wave MH-3: capture-completeness gate ────────────────────────────────────────────────────────
// mint-run-001.json's defects_found[0]: batch-001's six archived source-<celex>.txt files held only
// narrow ~600-900-char cited-excerpt windows (2-12KB total per file) around each FACT claim's offsets,
// not the full fetched documents (43,813-178,953 chars each) -- even though the full document WAS
// actually fetched (window.__docs[celex].length confirmed it). Nothing stopped a payload whose
// result_content was silently an excerpt; only coordinator review caught it. This gate makes that
// structurally impossible: every search_results[] entry must carry `fetched_length` (payload-schema.json,
// Wave MH-3), recorded independently of result_content, and result_content must actually be that length
// within a small documented tolerance.
const CAPTURE_LENGTH_TOLERANCE_CHARS = 50; // allows for whitespace/newline normalization between the raw
// in-page length read (e.g. window.__docs[celex].length, pre-normalization) and the archived,
// whitespace-normalized result_content -- NOT enough slack to hide an excerpt-vs-full-document gap.
const CAPTURE_COMPLETENESS_FLOOR = 0.98; // result_content must retain at least 98% of the fetched
// document's length. batch-001's actual captures were 1.5%-27% of their documents (2,812/178,953 to
// 12,082/12,237 chars) -- nowhere close to this floor; a genuine full capture with normal whitespace
// collapsing lands well above it.

/**
 * Capture-completeness check for one search_results[] entry. Returns a failures[] (possibly empty).
 * `index` is the entry's position in search_results[], for the reason payload.
 */
function checkCaptureCompleteness(result, index) {
  const failures = [];
  const contentLen = String(result?.result_content ?? "").length;
  const fetchedLength = result?.fetched_length;
  if (typeof fetchedLength !== "number" || !Number.isFinite(fetchedLength) || fetchedLength < 0) {
    failures.push({
      criterion: "kit",
      reason: "missing_fetched_length",
      result_index: index,
      result_url: result?.result_url ?? null,
    });
    return failures; // nothing to compare against
  }
  const diff = contentLen - fetchedLength;
  if (Math.abs(diff) <= CAPTURE_LENGTH_TOLERANCE_CHARS) return failures; // clean within tolerance

  if (diff > 0) {
    // result_content is LONGER than the recorded fetch -- either fetched_length was under-recorded, or
    // content was padded/duplicated. Either way the two numbers disagree beyond honest whitespace slop.
    failures.push({
      criterion: "kit",
      reason: "capture_length_exceeds_fetched",
      result_index: index,
      result_url: result?.result_url ?? null,
      result_content_length: contentLen,
      fetched_length: fetchedLength,
    });
    return failures;
  }

  const ratio = fetchedLength === 0 ? 1 : contentLen / fetchedLength;
  if (ratio < CAPTURE_COMPLETENESS_FLOOR) {
    failures.push({
      criterion: "kit",
      reason: "capture_incomplete",
      result_index: index,
      result_url: result?.result_url ?? null,
      result_content_length: contentLen,
      fetched_length: fetchedLength,
      ratio: Number(ratio.toFixed(4)),
      floor: CAPTURE_COMPLETENESS_FLOOR,
    });
  } else {
    // Beyond the tight tolerance but still above the floor -- a smaller, real gap (e.g. a slice dropped
    // at rebuild) that is not batch-001's excerpt-scale defect but is still not an honest length match.
    failures.push({
      criterion: "kit",
      reason: "capture_length_mismatch",
      result_index: index,
      result_url: result?.result_url ?? null,
      result_content_length: contentLen,
      fetched_length: fetchedLength,
      tolerance: CAPTURE_LENGTH_TOLERANCE_CHARS,
    });
  }
  return failures;
}

// ── Wave MH-3: unicode integrity ────────────────────────────────────────────────────────────────
// mint-run-001.json's defects_found[1]+[2]: two hand-transcription bugs (an ASCII 'x' substituted for
// the source's real '×' in 32019R1242; curly quotation marks substituted for the source's straight
// quotes around 'CBAM' in 32023R0956) passed criterion 3 clean because the SAME error was typed into
// BOTH the claim's source_span and the payload's own result_content -- an intra-payload comparison,
// however strict, cannot tell two identically-wrong fields apart from two identically-right ones. The
// fix needs a THIRD, independently-produced reference: search_results[].archived_source_path (schema,
// above) -- a file the same hand did not retype the claim from a second time. When absent, the checks
// below fall back to result_content alone (a strictly weaker guarantee, documented at each call site).
const UNICODE_SUBSTITUTION_CLASSES = Object.freeze([
  { name: "multiplication_sign", chars: ["×", "x", "X"] }, // × vs ascii x/X (32019R1242's real bug)
  { name: "curly_single_quote", chars: ["‘", "’", "'"] }, // ‘ ’ vs straight apostrophe (32023R0956's real bug)
  { name: "curly_double_quote", chars: ["“", "”", '"'] }, // “ ” vs straight double quote
  { name: "en_em_dash", chars: ["–", "—", "-"] }, // – — vs hyphen
  { name: "nbsp_space", chars: [" ", " "] }, // non-breaking space (U+00A0) vs plain space (U+0020)
]);
const SUBSTITUTION_CLASS_BY_CHAR = new Map();
for (const cls of UNICODE_SUBSTITUTION_CLASSES) {
  for (const ch of cls.chars) SUBSTITUTION_CLASS_BY_CHAR.set(ch, cls.name);
}
// canonical (first-listed) member of each class, keyed by class name -- used to fold every variant in a
// class to one representative character for FUZZY LOCATION only (see canonicalizeForFuzzyMatch).
const CANONICAL_CHAR_BY_CLASS = new Map(UNICODE_SUBSTITUTION_CLASSES.map((c) => [c.name, c.chars[0]]));

function nfkc(s) {
  return String(s ?? "").normalize("NFKC");
}

/**
 * Fold a string for APPROXIMATE matching only (never for the pass/fail decision): NFKC-normalize,
 * lowercase, then map every character in a known substitution class to that class's canonical member.
 * Every substitution-class member is exactly one character, so this is length- and position-preserving
 * for plain-text legal excerpts (the one case this kit needs it for) -- a documented simplification, not
 * a general-purpose Unicode confusable-folding implementation.
 */
function canonicalizeForFuzzyMatch(s) {
  const norm = nfkc(s).toLowerCase();
  let out = "";
  for (const ch of norm) {
    const cls = SUBSTITUTION_CLASS_BY_CHAR.get(ch);
    out += cls ? CANONICAL_CHAR_BY_CLASS.get(cls) : ch;
  }
  return out;
}

/**
 * Compare a hand-transcribed span against a reference text through three lenses. Returns
 * { strict, nfkcMatch, fuzzy, substitution } -- `substitution` names the single-character substitution
 * class (see UNICODE_SUBSTITUTION_CLASSES) that explains the divergence when the span is found only via
 * the fuzzy lens, or null when the span is either an exact match or not found even loosely.
 */
function compareSpanAgainstReference(span, referenceText) {
  const s = String(span ?? "").trim();
  const ref = String(referenceText ?? "");
  // 'strict' mirrors criterion 3's own leniency (case-insensitive substring, per ilikeIncludes) so this
  // check reports a NEW divergence only when C3 itself would not already have reported one -- it never
  // re-flags a mere-case difference C3 already tolerates. It still does NOT fold any Unicode substitution
  // class (case-folding a letter never turns 'x' into '×', a curly quote into a straight one, etc.).
  const strict = s.length > 0 && ref.toLowerCase().includes(s.toLowerCase());
  const nfkcMatch = s.length > 0 && nfkc(ref).toLowerCase().includes(nfkc(s).toLowerCase());
  const canonRef = canonicalizeForFuzzyMatch(ref);
  const canonSpan = canonicalizeForFuzzyMatch(s);
  const fuzzyIdx = s.length > 0 ? canonRef.indexOf(canonSpan) : -1;
  const fuzzy = fuzzyIdx !== -1;

  let substitution = null;
  if (!strict && fuzzy) {
    // canonicalizeForFuzzyMatch is position-preserving, so fuzzyIdx lines up 1:1 with the ORIGINAL
    // (uncanonicalized) ref string's characters at that offset -- slice it directly, not canonRef.
    const window = ref.slice(fuzzyIdx, fuzzyIdx + s.length);
    for (let i = 0; i < s.length; i++) {
      if (s[i] === window[i]) continue;
      if (s[i].toLowerCase() === window[i].toLowerCase()) continue; // case-only -- strict already tolerates this
      const cls = SUBSTITUTION_CLASS_BY_CHAR.get(s[i]) ?? SUBSTITUTION_CLASS_BY_CHAR.get(window[i]);
      if (cls) {
        substitution = { class: cls, span_char: s[i], reference_char: window[i], offset: i, window };
        break; // a classified divergence -- enough to name and to point a reader at the exact spot
      }
      // an unclassified character difference at this position -- keep scanning; a later position may
      // still be a known substitution class, and an early unknown mismatch should not mask it.
    }
  }
  return { strict, nfkcMatch, fuzzy, substitution };
}

/**
 * Scan free-text prose (full_brief / a section's content_md) for any occurrence of a substitution-class
 * character whose local context (a small window around it) fuzzy-matches the reference text but does
 * NOT strictly match it -- i.e. the prose carries a character the reference does not have at that same
 * position. Independent of the FACT-claim-level check: this catches a substitution anywhere in authored
 * prose, not only inside a claim's own source_span.
 */
function scanTextForUnicodeSubstitutions(text, referenceText, windowChars = 30) {
  const flags = [];
  if (!referenceText) return flags;
  const t = String(text ?? "");
  for (let i = 0; i < t.length; i++) {
    if (!SUBSTITUTION_CLASS_BY_CHAR.has(t[i])) continue;
    const start = Math.max(0, i - windowChars);
    const end = Math.min(t.length, i + windowChars);
    const cmp = compareSpanAgainstReference(t.slice(start, end), referenceText);
    if (!cmp.strict && cmp.fuzzy && cmp.substitution) {
      flags.push({ offset: i, char: t[i], ...cmp.substitution });
    }
  }
  return flags;
}

/**
 * Resolve a search_results[] entry's independently archived source text, if it names one.
 * `baseDir` is where `archived_source_path` is resolved relative to (the validator CLI defaults this to
 * the payload file's own directory -- see main()). Returns { text, unreadable, path }: `text` is null
 * when no path was named OR the named file could not be read; `unreadable` distinguishes the latter
 * (a payload that CLAIMS an archive and is wrong about the path is a sharper problem than one that never
 * named one) so the caller can fail loudly on a broken pointer rather than silently falling back.
 */
function resolveArchivedSourceText(result, baseDir) {
  const p = result?.archived_source_path;
  if (!p) return { text: null, unreadable: false, path: null };
  const full = resolve(baseDir, p);
  if (!existsSync(full)) return { text: null, unreadable: true, path: p };
  try {
    return { text: readFileSync(full, "utf8"), unreadable: false, path: p };
  } catch {
    return { text: null, unreadable: true, path: p };
  }
}

/**
 * Wave MH-3 unicode-integrity check for one FACT claim. `haystack` is the same result_content criterion
 * 3 already checked the claim against. Returns failures[] (possibly empty), criterion:"kit" (this has no
 * live-DB analogue -- see the header block above this section).
 */
function checkUnicodeIntegrity(claim, result, haystack, baseDir) {
  const failures = [];
  const span = claim.source_span;
  if (!span || String(span).trim() === "") return failures; // C3 already reports fact_missing_source_span

  const archived = resolveArchivedSourceText(result, baseDir);
  if (archived.unreadable) {
    failures.push({
      criterion: "kit",
      reason: "archived_source_path_unreadable",
      claim: claim.claim_text,
      archived_source_path: archived.path,
    });
    return failures; // can't run the reference-based checks below without it
  }

  const usingArchive = archived.text != null;
  const referenceText = usingArchive ? archived.text : haystack;
  const cmpRef = compareSpanAgainstReference(span, referenceText);

  if (usingArchive) {
    const cmpPayload = compareSpanAgainstReference(span, haystack);
    if (cmpPayload.strict && !cmpRef.strict) {
      // The span matches the payload's OWN result_content byte-for-byte (case-insensitively) but
      // diverges from the independently archived source -- "the match only succeeds because both sides
      // carry the same [payload-internal] error" (mint-run-001.json defects_found[2]'s named gap: an
      // intra-payload comparison cannot tell two identically-wrong fields from two identically-right
      // ones). This is the exact defect class batch-001's × → x and curly-quote bugs fell into.
      failures.push({
        criterion: "kit",
        reason: "fact_span_matches_payload_only_not_archive",
        claim: claim.claim_text,
        source_span: span,
        substitution: cmpRef.substitution,
      });
      return failures;
    }
  }

  if (!cmpRef.strict) {
    if (cmpRef.substitution) {
      failures.push({
        criterion: "kit",
        reason: "fact_span_unicode_substitution",
        claim: claim.claim_text,
        source_span: span,
        substitution_class: cmpRef.substitution.class,
        span_char: cmpRef.substitution.span_char,
        source_char: cmpRef.substitution.reference_char,
        reference: usingArchive ? "archived_source" : "result_content",
      });
    } else if (cmpRef.fuzzy) {
      failures.push({
        criterion: "kit",
        reason: usingArchive ? "fact_span_not_in_archived_source" : "fact_span_unicode_normalization_mismatch",
        claim: claim.claim_text,
        source_span: span,
        reference: usingArchive ? "archived_source" : "result_content",
      });
    }
    // else: not found even loosely against this reference -- criterion 3's fact_span_not_in_source
    // already reports the result_content case; a total miss against an archive with no payload-side
    // match either is not a NEW class of problem this check invents a reason for.
  }
  return failures;
}

// ── C4 label/legal vocabulary — ported verbatim from migration 171's c_label_re / c_legal_req_re /
//    c_forward_re (the LIVE regex constants; unchanged by every migration after 171 that touched C4). ──
const ANALYSIS_LABEL_RE =
  /\*?(per the workspace's reading|analytical inference|industry interpretation|operational implication)(\s*\([^)]*\))?:\*?/i;
const LEGAL_CALLOUT = "*legal confirmation required:*";
const LEGAL_REQ_RE =
  /(the\s+(regulation|law|directive|rule|act|amendment|mechanism|standard)\s+(requires|mandates|obligates|prohibits|imposes))|(is\s+required\s+(under|by))|(legally\s+required)/i;
const FORWARD_RE =
  /(propos|would|will|expected|forthcoming|consultation|draft|anticipat|pending|set\s+to|once\s+(adopted|enacted)|if\s+adopted|(by|from|effective|until)\s+20[0-9][0-9])/i;
const UNLABELED_MODAL_RE = /\b(requires|must|mandates|obligates|prohibits|applies to)\b/i;
// Migration 289 (2026-09-02): one-level balanced parentheses, mirrored from the live
// validate_item_provenance. A '(' is consumed only with its matching ')', so EUR-Lex "(01)" identifiers
// (CELEX 32023D0628(01)) extract whole, while a URL written inside prose parentheses "(see https://x/a)"
// still stops before the unmatched ')'. Population run #12 lost 2/42 payloads to the old regex.
// Migration 300 (2026-09-03, lane URL-GUIL): typographic delimiters excluded. The mint kit delimits a
// verbatim span with guillemets « » (record-facts.mjs), and when a span or a section paragraph ends with
// a URL and no space before the closing delimiter, the old class swallowed it whole — a URL of
// "http://eur-lex.europa.eu»" extracted as literally that, canonicalize_citation_url's trailing-punct
// strip (`[/.,;:]+$`) does not touch '»', and the URL grounds nowhere (`ungrounded_url`). Population run
// #16 (mint-run-018, row 429c85d2, "The Renewable Transport Fuel Obligations (Amendment) Order 2013")
// is the measured case. Fixed by excluding « » ‹ › and curly quotes “ ” ‘ ’ from the class, the same
// technique already used for the straight `"'<>` — a URL match simply stops one character earlier, it is
// never trimmed after the fact. Mirrors the live SQL function patched the same way (migration 300).
const URL_RE = /https?:\/\/(?:[^\s()\]}"'<>«»‹›“”‘’]|\([^\s()]*\))+/g;

// ── C3 authority floor — item-type floor table (migration 145/171), unconditional for the reg family
//    (migration 158). ──
const REG_FAMILY = new Set(["regulation", "directive", "standard", "guidance", "framework"]);
function floorMaxFor(itemType) {
  if (REG_FAMILY.has(itemType)) return 2;
  if (itemType === "research_finding") return 4;
  if (["technology", "innovation", "tool"].includes(itemType)) return 5;
  return null;
}

function ilikeIncludes(haystack, needle) {
  return String(haystack ?? "").toLowerCase().includes(String(needle ?? "").toLowerCase());
}
function paragraphs(text) {
  return String(text ?? "").split(/\n[ \t]*\n/);
}

/**
 * Validate one mint payload against C1-C7 plus the Wave MH-3 kit-level gates (capture-completeness,
 * unicode integrity). Returns { valid, failures[], recommended_status, gate_a }.
 * @param {object} payload
 * @param {{baseDir?: string}} [opts] - baseDir resolves any `archived_source_path`; defaults to cwd.
 *   The CLI (main(), below) passes the payload file's own directory so a payload's archive references
 *   are relative to itself, matching how batch-001's payload-<celex>.json / source-<celex>.txt sat
 *   side by side.
 */
export function validateMintPayload(payload, opts = {}) {
  const baseDir = opts.baseDir ?? process.cwd();
  const failures = [];
  // Migration 302 (lane HEAL-7, 2026-09-04 — operator ruling verbatim: "get the source. then rate the
  // source. ... find the source and then publish the data on the site"). Criterion 3's authority-floor
  // check (fact_below_authority_floor) is a RATING, never a refusal: it no longer pushes to `failures`
  // (so it never affects `valid`/`recommended_status`) — it accumulates here instead, mirroring the DB
  // function's own `v_warnings`/`v_below_floor_facts` byte-for-byte (same jsonb_build_object payload).
  // fact_missing_source_span / fact_span_not_in_source / fact_mint_hold are UNCHANGED — the ruling
  // overrules the refusal half of the floor, never the grounding requirement.
  const warningClaims = [];
  const item = payload?.item || {};
  const source = payload?.source || {};
  const registrySources = payload?.registry_sources || [];
  const sections = payload?.sections || [];
  const searchResults = payload?.search_results || [];
  const claims = payload?.claims || [];

  // ── GRADE DISCRIMINATOR (Lane POP, 2026-09-01, migration 278) — item.grade: "record" | "brief"
  //    (absent/anything-else defaults to "brief", so this is a strict ADDITION: an omitted grade field
  //    runs the identical brief-grade path this validator has always run, byte-for-byte). C1-C7 below
  //    are NEVER branched on grade -- the live public.validate_item_provenance function they replicate
  //    knows nothing of item_grade and enforces the same seven criteria unconditionally (see migration
  //    278's header). The only grade-specific behavior is the two RECORD-PURITY kit checks immediately
  //    below: they encode "no synthesis" as a mechanically-checkable rule rather than trusting every
  //    future record-payload author to remember it, exactly the doctrine every other kit-level check in
  //    this file already follows (capture-completeness, unicode integrity). ──
  const grade = item.grade === "record" ? "record" : "brief";

  // ── KIT-LEVEL structural guards (not live DB criteria -- catch a malformed payload before C1-C7 run
  //    on garbage). Reported with criterion:"kit" so they are never confused with the seven real numbers. ──
  const sectionKeys = new Set(sections.map((s) => s.section_key));
  for (const c of claims) {
    if (!sectionKeys.has(c.section_key)) {
      failures.push({ criterion: "kit", reason: "claim_references_unknown_section_key", claim: c.claim_text, section_key: c.section_key });
    }
  }

  // ── RECORD-PURITY (grade === "record" only) ─────────────────────────────────────────────────────
  //   1. claim_kind restricted to FACT/GAP -- ANALYSIS/LEGAL/DERIVED are how a synthesized brief's own
  //      interpretation enters a payload (criterion 4's label-syntax rules exist for exactly that
  //      content); a record-grade item carries none of it, by definition ("no synthesis").
  //   2. every FACT claim's source_span appears verbatim (case-insensitive substring, matching
  //      criterion 3's own comparison) inside item.full_brief -- the "short extracted description made
  //      ONLY of verbatim FACT spans" is not just a naming convention, it is checked.
  //   Both are ADDITIVE to C1-C7, never a replacement for any of them -- a record payload still has to
  //   clear the exact same seven criteria a brief payload does (grade is a label on what already passed
  //   honestly, per migration 278's header).
  if (grade === "record") {
    for (const c of claims) {
      if (!["FACT", "GAP"].includes(c.claim_kind)) {
        failures.push({
          criterion: "kit",
          reason: "record_grade_forbidden_claim_kind",
          claim: c.claim_text,
          claim_kind: c.claim_kind,
        });
      }
    }
    const fullBriefLower = String(item.full_brief ?? "").toLowerCase();
    for (const c of claims) {
      if (c.claim_kind !== "FACT" || !c.source_span || String(c.source_span).trim() === "") continue;
      if (!fullBriefLower.includes(String(c.source_span).trim().toLowerCase())) {
        failures.push({
          criterion: "kit",
          reason: "record_grade_full_brief_not_extractive",
          claim: c.claim_text,
          source_span: c.source_span,
        });
      }
    }

    // ── HOLLOW-RECORD REFUSAL (Lane HOLLOW-GATE, 2026-09-04) — grade === "record" only. Live count
    //    [CONFIRMED via Supabase, 2026-09-04]: 1,230 record-grade items live and verified; 551 carry ONLY
    //    the [title] FACT and every other slot a GAP (350 with a genuine title FACT, 201 with none at
    //    all), 115 carry exactly one substantive fact beyond the title. Root cause: a title FACT plus an
    //    all-GAP required-slots section already satisfies criterion 5 (`missing_required_slot` only checks
    //    that a slot has ANY FACT-or-GAP claim, and a GAP always qualifies) — so a payload built from a
    //    document `record-facts.mjs` found nothing substantive in still cleared the gate, and the item
    //    shipped to the customer site with an effectively empty Summary (item
    //    8670d8bf-9847-4da6-8724-0d52308b008e, CELEX 31999D0823, is the traced example: 17,022 chars of
    //    real EUR-Lex text, zero substantive facts extracted). Criterion 5 is correct on its own terms (a
    //    slot IS covered by a GAP) and is deliberately left unchanged — this is an ADDITIVE kit check for a
    //    different, coarser question criterion 5 was never designed to answer: did this extraction pass
    //    produce ANY actual information, or only the one fact (the title) that requires no extraction at
    //    all. A payload whose only FACT claim is the title (or which carries no FACT claim at all) is
    //    refused here as `record_hollow`, independent of which required slots it happens to cover with
    //    GAPs. Reported as criterion 5 (not "kit") on the operator's own instruction, so
    //    `apply-mint-batch.mjs`'s existing validation-failed hold-back records it as
    //    `validation_failed:5:record_hollow` and `reopen-validation-holds.mjs --reason-contains record_hollow`
    //    re-admits a row once a fixed extractor pass has re-run over it — no new hold mechanism, reusing
    //    the one lane URL-GUIL already built for exactly this shape of "held for a fixable reason".
    //    Matched by claim_text prefix, not `slot_key`, so a hand-built browser-capture payload (MINT-
    //    RUNBOOK.md §11's escape hatch, which may omit `slot_key`) is checked the same way a
    //    record-facts.mjs-built payload is — the SAME method this lane used to measure the live 551/115
    //    figures above, so the check and the diagnosis agree by construction.
    const substantiveFactCount = claims.filter(
      (c) => c.claim_kind === "FACT" && !String(c.claim_text ?? "").trim().toLowerCase().startsWith("[title]")
    ).length;
    //    SERIES-BACKED EXEMPTION (train/wave16, 2026-09-04, the gate's first CI run): a `market_signal`
    //    payload whose `instrument_identifier` is a registered, implemented market-series key
    //    (`src/lib/market/series-registry.mjs`, the six oil-bulletin products and the EIA/BLS/ECB series)
    //    is not hollow — its substance is the `market_series` rows the producer writes and
    //    `ratify-series-items.mjs` binds to the item (series-item-map.mjs), not FACT claims extracted
    //    from the bulletin's landing page; the surface renders the series. The exemption is mechanical
    //    (registry lookup), never a free-text flag, so a hand-built market row with an unregistered key
    //    is still refused. Research records get NO exemption: an all-GAP research record is exactly the
    //    "item with no details" the operator refused on 2026-09-04, and is held for re-extraction.
    const seriesBacked = item.item_type === "market_signal" && isImplementedSeriesKey(item.instrument_identifier);
    if (substantiveFactCount === 0 && !seriesBacked) {
      failures.push({
        criterion: 5,
        reason: "record_hollow",
        fact_count: claims.filter((c) => c.claim_kind === "FACT").length,
      });
    }

    // ── SCREEN VERDICT (Lane WSEQ, 2026-09-02) — grade === "record" only. Three population-turn apply
    //    runs (mint-run-011..013) minted ~130 record-grade items straight from the UNSCREENED
    //    would_mint pool; about half were off-vertical by the operator's own 2026-08-31 screen ruling
    //    (ADR-020's August incident, repeated — see MINT-RUNBOOK.md's "relevance screen is part of the
    //    export"). The fix landed as RUNTIME code (export-census-rows.mjs -> lib/screen-verdict.mjs) that
    //    filters at the export; this is the STRUCTURAL backstop — a record-grade payload's own screen
    //    verdict is checked here, mechanically, so a future exporter regression (or a hand-built
    //    browser-capture row that forgot to carry `screen`, per MINT-RUNBOOK.md's escape-hatch procedure)
    //    is caught by the gate every payload already has to clear, not only by the export filter that
    //    already failed once. Two defect classes: no usable screen data at all
    //    (screen_verdict_missing — this is what a payload built before this field existed, or with a
    //    forgotten `screen`, looks like) vs. a screen verdict present but not on_vertical
    //    (screen_verdict_not_on_vertical — the payload's OWN evidence says it should never have minted).
    //    Brief-grade payloads are exempt: the screen gates the record tier's exporter, not brief-tier
    //    generation, which has its own separate provenance path and is unaffected by this incident class.
    const screen = payload?.screen;
    const hasVerdict = !!screen && typeof screen === "object" && typeof screen.verdict === "string" && screen.verdict.length > 0;
    const hasBasis = !!screen && typeof screen === "object" && typeof screen.basis === "string" && screen.basis.trim() !== "";
    const hasProvenance = !!screen && typeof screen === "object" && ["rule", "reviewed", "registry"].includes(screen.provenance) // "registry": research-sweep subjects (Lane RSRCH, 2026-09-02), basis = the source's registry role;
    if (!hasVerdict || !hasBasis || !hasProvenance) {
      failures.push({ criterion: "kit", reason: "screen_verdict_missing", screen: screen ?? null });
    } else if (screen.verdict !== "on_vertical") {
      failures.push({ criterion: "kit", reason: "screen_verdict_not_on_vertical", verdict: screen.verdict, basis: screen.basis });
    }
  }

  // ── Wave MH-3 capture-completeness gate — runs over EVERY search_results[] entry unconditionally
  //    (not just ones a FACT cites), so a silently-excerpted fetch is caught even before any claim
  //    references it. See the header block above validateMintPayload's imports. ──
  searchResults.forEach((r, i) => failures.push(...checkCaptureCompleteness(r, i)));

  // ══ CRITERION 1 — Validated source ═══════════════════════════════════
  if (!source.id) {
    failures.push({ criterion: 1, reason: "missing_source_id" });
  } else {
    if (source.base_tier == null && source.tier_override == null) {
      failures.push({ criterion: 1, reason: "source_tier_null", source_id: source.id });
    }
    if (source.status !== "active") {
      failures.push({ criterion: 1, reason: "source_not_active", source_id: source.id, status: source.status });
    }
  }

  const hasSections = sections.some((s) => String(s.content_md ?? "").trim() !== "");
  let gaFacts = [];

  if (!hasSections) {
    // ══ FAIL-CLOSE (migration 119) — no groundable content ═════════════
    failures.push({ criterion: 2, reason: "no_section_content" });
  } else {
    // ══ CRITERION 2 — Citation URL grounding ═══════════════════════════
    const groundedUrls = new Set();
    if (item.source_url) groundedUrls.add(canonicalizeCitationUrl(item.source_url));
    for (const r of searchResults) if (r.result_url) groundedUrls.add(canonicalizeCitationUrl(r.result_url));
    if (source.url) groundedUrls.add(canonicalizeCitationUrl(source.url));
    for (const rs of registrySources) if (rs.url) groundedUrls.add(canonicalizeCitationUrl(rs.url));

    const seenUrls = new Set();
    for (const s of sections) {
      for (const m of String(s.content_md ?? "").matchAll(URL_RE)) {
        const canon = canonicalizeCitationUrl(m[0]);
        if (seenUrls.has(canon)) continue;
        seenUrls.add(canon);
        if (!groundedUrls.has(canon)) failures.push({ criterion: 2, reason: "ungrounded_url", url: canon });
      }
    }

    // Resolve a claim's cited source (for C3's derived tier) + fetched text (for C3's span check).
    const sourceByCanonUrl = new Map();
    if (source.url) sourceByCanonUrl.set(canonicalizeCitationUrl(source.url), source);
    for (const rs of registrySources) if (rs.url) sourceByCanonUrl.set(canonicalizeCitationUrl(rs.url), rs);
    // Registry identity (see the header's KNOWN SIMPLIFICATIONS): the payload's own source first, then
    // registry_sources in order, keyed the way registerSource dedups. `source` wins on a key collision
    // because it is the row apply-mint-batch.mjs will bind every grounded fact's source_id to.
    const sourceByInstitution = new Map();
    for (const rs of registrySources) { const k = rs.url ? institutionKey(rs.url) : ""; if (k && !sourceByInstitution.has(k)) sourceByInstitution.set(k, rs); }
    if (source.url) { const k = institutionKey(source.url); if (k) sourceByInstitution.set(k, source); }
    const resolveClaimSource = (citeUrl) => {
      if (!citeUrl) return null;
      const exact = sourceByCanonUrl.get(canonicalizeCitationUrl(citeUrl));
      if (exact) return exact;
      const k = institutionKey(citeUrl);
      return k ? sourceByInstitution.get(k) ?? null : null;
    };
    const resultByCanonUrl = new Map();
    for (const r of searchResults) if (r.result_url) resultByCanonUrl.set(canonicalizeCitationUrl(r.result_url), r);

    const priorityHigh = item.priority === "CRITICAL" || item.priority === "HIGH";
    const floorMax = floorMaxFor(item.item_type);
    // migration 158: the reg family arms the floor UNCONDITIONALLY.
    const floorArmed = priorityHigh || REG_FAMILY.has(item.item_type);

    // ══ CRITERION 3 — Claim-level FACT grounding ═══════════════════════
    for (const c of claims) {
      if (c.claim_kind !== "FACT") continue;
      gaFacts.push({ claim_text: c.claim_text ?? "", source_span: c.source_span ?? "" });

      const span = c.source_span;
      if (!span || String(span).trim() === "") {
        failures.push({ criterion: 3, reason: "fact_missing_source_span", claim: c.claim_text });
      } else {
        const canonCiteUrl = c.source_url ? canonicalizeCitationUrl(c.source_url) : null;
        const result = canonCiteUrl ? resultByCanonUrl.get(canonCiteUrl) : null;
        const haystack = result ? result.result_content : null;
        if (!haystack || !String(haystack).toLowerCase().includes(String(span).trim().toLowerCase())) {
          failures.push({ criterion: 3, reason: "fact_span_not_in_source", claim: c.claim_text, source_span: span });
        }
        // Wave MH-3 unicode integrity — kit-level, runs whenever the claim's cited result resolved at
        // all (even if C3 above already failed it on the loose check; a span that fails BOTH gets both
        // failures, which is honest — it is genuinely broken two different ways).
        if (result) failures.push(...checkUnicodeIntegrity(c, result, haystack, baseDir));
      }

      // migration 202: a STANDARD item's own-authoring-body fact grounds at tier 4, not the reg floor.
      const resolvedSource = resolveClaimSource(c.source_url);
      const derivedTier = resolvedSource ? (resolvedSource.tier_override ?? resolvedSource.base_tier ?? null) : null;
      let effectiveFloor = floorMax;
      if (
        item.item_type === "standard" &&
        source.institution_id != null &&
        resolvedSource &&
        resolvedSource.institution_id === source.institution_id
      ) {
        effectiveFloor = 4;
      }
      if (floorArmed && effectiveFloor != null && (derivedTier == null || derivedTier > effectiveFloor)) {
        // 302: a RATING, not a failure — get the source, then rate the source; the item is never
        // refused publication on tier alone once its claim is genuinely span-grounded (above).
        warningClaims.push({
          criterion: 3,
          reason: "fact_below_authority_floor",
          claim: c.claim_text,
          source_tier_derived: derivedTier,
          floor_max: effectiveFloor,
        });
      }
      // migration 206: mint-time S-CONFLATE HARD hold.
      if (c.mint_hold_reason) {
        failures.push({ criterion: 3, reason: "fact_mint_hold", claim: c.claim_text, mint_hold_reason: c.mint_hold_reason });
      }
    }

    // ── Wave MH-3 unicode integrity — SEPARATE prose scan ═══════════════
    // Independent of the FACT-claim-level check above: scans item.full_brief and every section's
    // content_md for a substitution-class character whose local context diverges from the item's
    // primary source's reference text at the same position -- catches a hand-transcription slip
    // anywhere in authored prose, not only inside a claim's own source_span.
    {
      const primaryCanonUrl = item.source_url ? canonicalizeCitationUrl(item.source_url) : null;
      const primaryResult = primaryCanonUrl ? resultByCanonUrl.get(primaryCanonUrl) : null;
      if (primaryResult) {
        const archived = resolveArchivedSourceText(primaryResult, baseDir);
        const referenceText = archived.text ?? primaryResult.result_content;
        const texts = [
          { label: "full_brief", text: item.full_brief },
          ...sections.map((s) => ({ label: `section:${s.section_key}`, text: s.content_md })),
        ];
        for (const { label, text } of texts) {
          for (const flag of scanTextForUnicodeSubstitutions(text, referenceText)) {
            failures.push({
              criterion: "kit",
              reason: "prose_unicode_substitution",
              location: label,
              substitution_class: flag.class,
              prose_char: flag.span_char,
              source_char: flag.reference_char,
              window: flag.window,
              reference: archived.text != null ? "archived_source" : "result_content",
            });
          }
        }
      }
    }

    // ══ CRITERION 4 — Labeling discipline ══════════════════════════════
    const legalCalloutPresent = sections.some((s) => ilikeIncludes(s.content_md, LEGAL_CALLOUT));
    for (const c of claims) {
      if (c.claim_kind === "ANALYSIS") {
        const labeled = sections.some((s) =>
          paragraphs(s.content_md).some((p) => ANALYSIS_LABEL_RE.test(p) && ilikeIncludes(p, c.claim_text))
        );
        if (!labeled) failures.push({ criterion: 4, reason: "analysis_missing_label_syntax", claim: c.claim_text });
        if (LEGAL_REQ_RE.test(c.claim_text ?? "") && !FORWARD_RE.test(c.claim_text ?? "")) {
          failures.push({ criterion: 4, reason: "legal_claim_mislabeled_analysis", claim: c.claim_text });
        }
      } else if (c.claim_kind === "LEGAL") {
        if (!legalCalloutPresent) failures.push({ criterion: 4, reason: "legal_not_routed_to_callout", claim: c.claim_text });
      }
    }
    for (const s of sections) {
      const md = String(s.content_md ?? "");
      if (md.trim() === "") continue;
      const hasFactInSection = claims.some((c) => c.claim_kind === "FACT" && c.section_key === s.section_key);
      if (UNLABELED_MODAL_RE.test(md) && !(ANALYSIS_LABEL_RE.test(md) || ilikeIncludes(md, LEGAL_CALLOUT)) && !hasFactInSection) {
        failures.push({ criterion: 4, reason: "unlabeled_assertion", section_key: s.section_key });
      }
    }

    // ══ CRITERION 5 — Active sourcing / required slots ═════════════════
    const requiredSlots = REQUIRED_SLOTS[item.item_type] || [];
    for (const slotKey of requiredSlots) {
      const covered = claims.some((c) => ["FACT", "GAP"].includes(c.claim_kind) && ilikeIncludes(c.claim_text, slotKey));
      if (!covered) failures.push({ criterion: 5, reason: "missing_required_slot", slot_key: slotKey, item_type: item.item_type });
    }
  }

  // ══ CRITERION 6 — Brief presence ══════════════════════════════════════
  const hasBrief = item.full_brief != null && String(item.full_brief).trim() !== "";
  if (!hasBrief) failures.push({ criterion: 6, reason: "missing_full_brief" });

  // ══ CRITERION 7 — Gate A (prose-fact, hash-validated) ═════════════════
  let gateA = null;
  if (hasBrief) {
    // If sections were empty, gaFacts was never populated above -- recompute over ALL FACT claims so
    // Gate A still runs standalone (the live function's criterion 7 is unconditional on full_brief
    // presence, independent of the section-walk branch).
    if (!hasSections) gaFacts = claims.filter((c) => c.claim_kind === "FACT").map((c) => ({ claim_text: c.claim_text ?? "", source_span: c.source_span ?? "" }));
    gateA = scanBrief(item.full_brief, gaFacts, new Set() /* Gate B DERIVED coverage: not modeled, see header */);
    if (gateA.orphan_count > 0) {
      failures.push({ criterion: 7, reason: "gate_a_unproven_or_stale", orphan_count: gateA.orphan_count, orphans: gateA.orphans });
    }
  }

  return {
    valid: failures.length === 0,
    failures,
    recommended_status: failures.length === 0 ? "verified" : "quarantined",
    gate_a: gateA,
    // 302: below-floor tier RATINGS, never blocking. Same shape as the DB function's v_result.warnings.
    warnings: { below_floor_facts: warningClaims.length, claims: warningClaims },
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: node validate-mint-payload.mjs <payload.json>");
    process.exit(2);
  }
  const payloadPath = resolve(process.cwd(), file);
  const payload = JSON.parse(readFileSync(payloadPath, "utf8"));
  // archived_source_path (Wave MH-3) resolves relative to the payload file's own directory, matching
  // how batch-001 archived payload-<celex>.json / source-<celex>.txt side by side.
  const result = validateMintPayload(payload, { baseDir: dirname(payloadPath) });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.valid ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
