#!/usr/bin/env node
// validate-mint-payload.mjs — a $0, local, no-DB replica of public.validate_item_provenance's seven live
// criteria (C1-C7), run against a mint PAYLOAD (see payload-schema.json) BEFORE the coordinator ever writes
// a row. This is the gate every M0/M1..Mn payload must clear before handoff (MINT-RUNBOOK.md step 5).
//
// PROVENANCE: this is a hand-port of the LIVE function body reconstructed from the migration chain
// (114 -> 119 -> 145 -> 150 -> 158 -> 171 -> 202 -> 206 -> 209 -> 216/217 -> 218(revert) -> 224/225 ->
// 227 -> 250 -> 254 -> 264), read migration-by-migration in this lane (see the M0 report's "write plan"
// section for the full derivation). Two pieces are imported UNMODIFIED from src/ rather than re-derived:
//   lib/gate-a-scan.mjs / lib/gate-a-match.mjs   -- criterion 7 (Gate A), copied from src/lib/agent/.
// One piece is a faithful JS port of a live SQL function:
//   lib/canonicalize-citation-url.mjs            -- criterion 2's URL compare (migration 150).
//
// KNOWN SIMPLIFICATIONS vs the live DB function (named, not hidden):
//   - A FACT/ANALYSIS claim's cited source is resolved by exact-canonicalized-URL match against the
//     payload's own `source` + `registry_sources` + `search_results` (the payload's closed world), not by
//     a search_result_id foreign key into a live agent_run_searches table. This is the natural analogue
//     for a pre-apply payload: the coordinator's real INSERT still creates the search_result_id link this
//     validator is standing in for.
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

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { scanBrief } from "./lib/gate-a-scan.mjs";
import { canonicalizeCitationUrl } from "./lib/canonicalize-citation-url.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REQUIRED_SLOTS = JSON.parse(readFileSync(resolve(__dirname, "item-type-required-slots.json"), "utf8"));

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
const URL_RE = /https?:\/\/[^\s)\]}"'<>]+/g;

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

/** Validate one mint payload against C1-C7. Returns { valid, failures[], recommended_status, gate_a }. */
export function validateMintPayload(payload) {
  const failures = [];
  const item = payload?.item || {};
  const source = payload?.source || {};
  const registrySources = payload?.registry_sources || [];
  const sections = payload?.sections || [];
  const searchResults = payload?.search_results || [];
  const claims = payload?.claims || [];

  // ── KIT-LEVEL structural guards (not live DB criteria -- catch a malformed payload before C1-C7 run
  //    on garbage). Reported with criterion:"kit" so they are never confused with the seven real numbers. ──
  const sectionKeys = new Set(sections.map((s) => s.section_key));
  for (const c of claims) {
    if (!sectionKeys.has(c.section_key)) {
      failures.push({ criterion: "kit", reason: "claim_references_unknown_section_key", claim: c.claim_text, section_key: c.section_key });
    }
  }

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
      }

      // migration 202: a STANDARD item's own-authoring-body fact grounds at tier 4, not the reg floor.
      const resolvedSource = c.source_url ? sourceByCanonUrl.get(canonicalizeCitationUrl(c.source_url)) : null;
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
        failures.push({
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
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: node validate-mint-payload.mjs <payload.json>");
    process.exit(2);
  }
  const payload = JSON.parse(readFileSync(resolve(process.cwd(), file), "utf8"));
  const result = validateMintPayload(payload);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.valid ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
