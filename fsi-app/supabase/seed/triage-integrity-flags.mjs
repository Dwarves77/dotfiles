// triage-integrity-flags.mjs
//
// READ-ONLY triage script for intelligence_items rows that the integrity
// trigger from migration 035 has flagged. The orchestrator runs this and
// then ACTS on the JSON plan — this script never issues UPDATE/INSERT.
//
// What it does:
//   1. SELECT every flagged-and-unresolved intelligence_items row, joining
//      sources for source_name + source_root_url.
//   2. Heuristically classify each flag into one of 6 issue types
//      (a..f) using the matched phrase, the brief content, and the
//      source URL.
//   3. Run a regex sieve over each brief looking for SPECIFIC named
//      regulations that the platform doesn't already track as its own
//      intelligence_items row — these become "missing-regulation" entries.
//   4. Emit a recommended action per item:
//        replace_url / regenerate / insert_new_item / clear_flag / human_review
//      plus an `auto_action_safe` flag that the orchestrator uses to
//      decide whether to apply the action without asking.
//   5. Detect cross-item patterns (e.g. "12 flags clustered on EU CSDDD")
//      and emit them in patterns_detected.
//   6. Estimate worst-case Claude API cost if every regenerate-class flag
//      were re-run.
//   7. Write two artifacts:
//        - docs/INTEGRITY-TRIAGE-PLAN.json   (machine-readable plan)
//        - docs/INTEGRITY-TRIAGE-REPORT.md   (human-readable report)
//
// Usage (from fsi-app/):
//   node supabase/seed/triage-integrity-flags.mjs
//
// Env: prefers SUPABASE_URL, falls back to NEXT_PUBLIC_SUPABASE_URL.
// Service role required for full read coverage across RLS.

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { writeFileSync, mkdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, "..", ".."));
process.loadEnvFile(".env.local");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// ─── Tunables ───────────────────────────────────────────────────────
// Cost model — used only for the estimated regenerate cost line in the
// markdown report. Treat as worst-case (every regenerate-class flag
// actually triggers an API call).
const COST_PER_REGENERATE_USD = 0.15;

// Stale threshold. The 035 trigger sets agent_integrity_flagged_at when
// the FALSE→TRUE edge happens. If the flag is older than this AND the
// brief explicitly references a year, we treat it as a stale-info flag.
const STALE_THRESHOLD_DAYS = 180;

// Brief-too-short threshold — under this many chars, the brief is likely
// a placeholder and we route it to regenerate.
const SHORT_BRIEF_CHAR_THRESHOLD = 1500;

// ─── Canonical regulator hosts ──────────────────────────────────────
// Used in two ways:
//  (1) source-url-broken detection — if the matched phrase suggests a
//      "specific regulatory text" was expected but the source_url points
//      to an aggregator/news/wikipedia-style host instead.
//  (2) replace_url candidate hunting — if the brief itself mentions one
//      of these canonical hosts via a URL we can extract, we propose
//      that as the replacement.
const CANONICAL_REGULATOR_HOSTS = [
  // US federal
  "federalregister.gov",
  "regulations.gov",
  "epa.gov",
  "energy.gov",
  "ferc.gov",
  "doe.gov",
  "ftc.gov",
  "sec.gov",
  // US state — California is a hot spot for the flagged set
  "leginfo.legislature.ca.gov",
  "arb.ca.gov",
  "cdpr.ca.gov",
  "energy.ca.gov",
  "cpuc.ca.gov",
  "oehha.ca.gov",
  "calepa.ca.gov",
  // US state — others
  "dec.ny.gov",
  "ecology.wa.gov",
  "oregon.gov",
  "leg.wa.gov",
  "nyserda.ny.gov",
  // EU / international
  "eur-lex.europa.eu",
  "ec.europa.eu",
  "europa.eu",
  "consilium.europa.eu",
  "emsa.europa.eu",
  "eea.europa.eu",
  "imo.org",
  "icao.int",
  "unfccc.int",
  "iso.org",
  // UK
  "legislation.gov.uk",
  "gov.uk",
];

// Aggregator/news hosts that should NOT be a primary source for a
// regulation-class brief. Presence here + a "specific text" phrase is
// a strong source-url-broken signal.
const NON_CANONICAL_HOSTS = [
  "wikipedia.org",
  "reuters.com",
  "bloomberg.com",
  "ft.com",
  "wsj.com",
  "nytimes.com",
  "lexology.com",
  "law360.com",
  "natlawreview.com",
  "jdsupra.com",
  "mondaq.com",
  "linkedin.com",
  "medium.com",
  "substack.com",
];

// ─── Missing-regulation regex sieve ─────────────────────────────────
// These are the patterns we run over each brief to find SPECIFIC named
// regulations. Each pattern carries a jurisdiction hint that we use when
// proposing the new intelligence_items row in the plan.
//
// The patterns are deliberately conservative — we'd rather miss a real
// regulation than fabricate one. Each pattern requires:
//   • a recognisable bill/regulation prefix or framework name
//   • a numeric or distinguishing component
// to avoid false-positive matches on prose like "the bill" or "the rule".
const REGULATION_PATTERNS = [
  // California Senate Bill / Assembly Bill — e.g. "SB 253", "Senate Bill 253", "AB 1305", "Assembly Bill 1305"
  {
    name: "ca_sb_ab",
    regex: /\b(?:(?:California\s+)?(?:Senate|Assembly)\s+Bill|SB|AB)\s*[-#]?\s*(\d{1,4})\b/gi,
    jurisdiction_iso: "US-CA",
    canonical_host: "leginfo.legislature.ca.gov",
    label: (m) => {
      const n = m[1];
      const isSenate = /senate|SB/i.test(m[0]);
      return `California ${isSenate ? "Senate" : "Assembly"} Bill ${n}`;
    },
    proposed_url: (m) => {
      const n = m[1];
      const prefix = /senate|SB/i.test(m[0]) ? "SB" : "AB";
      // leginfo URL pattern is bill_id=20232024xxNNN — we leave the
      // session blank because we don't know it; orchestrator fills.
      return `https://leginfo.legislature.ca.gov/faces/billSearchClient.xhtml?session_year=current&house=Both&author=All&lawCode=All&keyword=${prefix}+${n}`;
    },
    item_type: "regulation",
  },
  // US Federal — H.R. 1234 / S. 1234 / Public Law NNN-NNN
  {
    name: "us_federal_bill",
    regex: /\b(?:H\.?\s?R\.?|S\.?)\s+(\d{1,5})\b/g,
    jurisdiction_iso: "US",
    canonical_host: "congress.gov",
    label: (m) => `${m[0].trim()} (US Congress)`,
    proposed_url: () => `https://www.congress.gov/`,
    item_type: "regulation",
  },
  // EU — "Directive 2024/1234", "Regulation (EU) 2023/956"
  {
    name: "eu_directive_regulation",
    regex: /\b(Directive|Regulation)(?:\s*\(EU\))?\s+(\d{4})\/(\d{1,5})\b/gi,
    jurisdiction_iso: "EU",
    canonical_host: "eur-lex.europa.eu",
    label: (m) => `${m[1]} (EU) ${m[2]}/${m[3]}`,
    proposed_url: (m) => {
      const kind = /directive/i.test(m[1]) ? "dir" : "reg";
      return `https://eur-lex.europa.eu/eli/${kind}/${m[2]}/${m[3]}/oj`;
    },
    item_type: "regulation",
  },
  // EU — named frameworks: CSRD, CSDDD, CBAM, ETS, ReFuelEU, FuelEU
  {
    name: "eu_named_framework",
    regex: /\b(CSRD|CSDDD|CBAM|EU\s+ETS|ReFuelEU(?:\s+Aviation)?|FuelEU(?:\s+Maritime)?)\b/g,
    jurisdiction_iso: "EU",
    canonical_host: "eur-lex.europa.eu",
    label: (m) => m[1].replace(/\s+/g, " "),
    proposed_url: () => `https://eur-lex.europa.eu/`,
    item_type: "regulation",
  },
  // US state generic — NY/WA/OR style "S. 1234" or "HB 1234" inside a
  // brief that mentions a specific state. Only fire when the state name
  // is also present in the brief (handled in the matcher loop).
  {
    name: "us_state_hb_sb",
    regex: /\b(HB|H\.B\.|SB|S\.B\.)\s*(\d{1,4})\b/gi,
    jurisdiction_iso: null, // resolved at match time from brief context
    canonical_host: null,
    label: (m) => `${m[1].replace(/\./g, "")} ${m[2]}`,
    proposed_url: () => null,
    item_type: "regulation",
    requires_state_context: true,
  },
];

// State-name → jurisdiction_iso for the state-context resolver above.
const STATE_NAME_TO_ISO = {
  "new york": "US-NY",
  "washington state": "US-WA",
  "washington dc": "US-DC",
  oregon: "US-OR",
  texas: "US-TX",
  florida: "US-FL",
  illinois: "US-IL",
  massachusetts: "US-MA",
  pennsylvania: "US-PA",
  michigan: "US-MI",
  "new jersey": "US-NJ",
  colorado: "US-CO",
  georgia: "US-GA",
  "north carolina": "US-NC",
  minnesota: "US-MN",
  virginia: "US-VA",
  maryland: "US-MD",
  connecticut: "US-CT",
};

// ─── Helpers ─────────────────────────────────────────────────────────
function extractHost(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  let s = rawUrl.trim();
  if (!s) return null;
  if (!/^[a-z]+:\/\//i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    let h = u.hostname.toLowerCase();
    if (h.endsWith(".")) h = h.slice(0, -1);
    if (h.startsWith("www.")) h = h.slice(4);
    return h || null;
  } catch {
    return null;
  }
}

function hostMatchesAny(host, list) {
  if (!host) return false;
  return list.some((c) => host === c || host.endsWith("." + c));
}

// Pull every URL out of a string. Used for replace_url candidate hunting.
function extractUrls(text) {
  if (!text) return [];
  const re = /https?:\/\/[^\s)<>"'`\]]+/gi;
  return Array.from(text.matchAll(re)).map((m) => m[0].replace(/[.,;:!?]+$/, ""));
}

// Find a year reference like "as of 2024" or "in 2023" — used for stale-info.
function mentionsOlderYear(text) {
  if (!text) return null;
  const now = new Date();
  const currentYear = now.getFullYear();
  const m = text.match(/\b(?:as\s+of|in|since|effective)\s+(20\d{2})\b/i);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  if (y < currentYear) return y;
  return null;
}

function daysSince(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / (1000 * 60 * 60 * 24);
}

// Detect state-context for a brief — "if the brief mentions Oregon,
// state-level patterns can claim US-OR".
function detectStateContext(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const [name, iso] of Object.entries(STATE_NAME_TO_ISO)) {
    if (lower.includes(name)) return iso;
  }
  return null;
}

// ─── Fetch ──────────────────────────────────────────────────────────
console.log("Loading flagged intelligence_items …");

async function fetchAllFlagged() {
  const all = [];
  let from = 0;
  const PAGE = 500;
  while (true) {
    const { data, error } = await supabase
      .from("intelligence_items")
      .select(
        `id, legacy_id, title, source_url, item_type, priority,
         jurisdiction_iso, jurisdictions, full_brief,
         agent_integrity_flag, agent_integrity_phrase, agent_integrity_flagged_at,
         source:source_id ( id, name, url )`,
      )
      .eq("agent_integrity_flag", true)
      .is("agent_integrity_resolved_at", null)
      .order("agent_integrity_flagged_at", { ascending: false, nullsFirst: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

const flagged = await fetchAllFlagged();
console.log(`  ${flagged.length} flagged-and-unresolved items`);

// ─── Build a title→item lookup so missing-regulation detection can
// check whether the candidate already exists in the platform. We only
// fetch (id, legacy_id, title) to keep memory bounded.
console.log("Loading intelligence_items title index for missing-regulation lookup …");
async function fetchAllTitles() {
  const all = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("intelligence_items")
      .select("id, legacy_id, title")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}
const allItems = await fetchAllTitles();
const titleIndex = new Set(allItems.map((r) => normaliseTitle(r.title)));
const legacyIdIndex = new Set(allItems.map((r) => (r.legacy_id || "").toLowerCase()).filter(Boolean));

function normaliseTitle(t) {
  if (!t) return "";
  return t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

console.log(`  ${allItems.length} total items in title index`);

// ─── Classification pipeline ────────────────────────────────────────
const classifications = {
  source_url_broken: 0,
  factual_gap: 0,
  missing_regulation: 0,
  stale_info: 0,
  over_flag: 0,
  other: 0,
};

const itemsOut = [];
const sourceHostFreq = new Map(); // for pattern detection
const phraseFreq = new Map(); // for pattern detection
const jurisdictionFreq = new Map(); // for pattern detection

for (const it of flagged) {
  const phrase = (it.agent_integrity_phrase || "").toLowerCase();
  const brief = it.full_brief || "";
  const briefLower = brief.toLowerCase();
  const briefLen = brief.length;
  const sourceHost = extractHost(it.source_url);
  const sourceName = it.source?.name || null;
  const sourceRootUrl = it.source?.url || null;

  const flaggedDaysAgo = daysSince(it.agent_integrity_flagged_at);
  const olderYear = mentionsOlderYear(brief);

  // ── Heuristic 1: over-flag detection. If the matched phrase appears
  // ONLY in legitimate prose context, the trigger over-fired.
  // Specifically: "should be there" inside a phrase like "exemption
  // notification should be there for…" — the surrounding tokens make it
  // descriptive, not a self-flag.
  const isOverFlag = detectOverFlag(phrase, briefLower);

  // ── Heuristic 2: source-url-broken. The phrase suggests a specific
  // regulatory text was expected, but the source_url points at an
  // aggregator/news/wikipedia host (not a canonical regulator).
  const phraseSuggestsSpecificText =
    phrase.includes("specific article") ||
    phrase.includes("should be there") ||
    phrase.includes("replace the source url");
  const isNonCanonicalHost =
    sourceHost && hostMatchesAny(sourceHost, NON_CANONICAL_HOSTS);
  const isCanonicalHost =
    sourceHost && hostMatchesAny(sourceHost, CANONICAL_REGULATOR_HOSTS);
  const isSourceUrlBroken =
    !isOverFlag &&
    phraseSuggestsSpecificText &&
    (isNonCanonicalHost || (!isCanonicalHost && sourceHost));

  // ── Heuristic 3: factual-gap. Verification-class phrase + canonical
  // host = the URL is fine but the brief has an unverified claim.
  const phraseIsVerification =
    phrase.includes("unable to verify") ||
    phrase.includes("could not confirm") ||
    phrase.includes("integrity rule");
  const isFactualGap =
    !isOverFlag && phraseIsVerification && isCanonicalHost;

  // ── Heuristic 4: missing-regulation. Detect SPECIFIC named regulations
  // in the brief that don't exist as their own intelligence_items rows.
  const missingRegs = !isOverFlag ? detectMissingRegulations(brief) : [];
  const hasMissingReg = missingRegs.length > 0;

  // ── Heuristic 5: stale-info. Flag is older than threshold and brief
  // mentions an older year, OR the brief is suspiciously short.
  const isStaleByAge =
    flaggedDaysAgo !== null &&
    flaggedDaysAgo > STALE_THRESHOLD_DAYS &&
    olderYear !== null;
  const isShortBrief = briefLen < SHORT_BRIEF_CHAR_THRESHOLD;
  const isStaleInfo = !isOverFlag && (isStaleByAge || isShortBrief);

  // ── Resolve to a single issue type. Order matters — over-flag wins
  // over everything (we never escalate noise), then source-url-broken
  // (cheapest fix), then missing-regulation (highest value), then
  // factual-gap, then stale-info, then other.
  let issue_type, issue_label, action, rationale, auto_action_safe = false;
  let proposed_url = null;
  let missing_regulation = null;
  let needs_human_review_because = null;

  if (isOverFlag) {
    issue_type = "e";
    issue_label = "over-flag";
    action = "clear_flag";
    rationale = `Matched phrase "${phrase}" appears in legitimate prose context, not as a self-flag.`;
    auto_action_safe = true;
  } else if (isSourceUrlBroken) {
    issue_type = "a";
    issue_label = "source-url-broken";
    // Hunt for a replacement URL inside the brief that points to a
    // canonical regulator host.
    const candidate = findReplacementUrl(brief);
    if (candidate) {
      action = "replace_url";
      proposed_url = candidate;
      rationale = `Source URL host "${sourceHost}" is non-canonical for a "${phrase}" flag. Brief mentions canonical URL ${candidate}.`;
      auto_action_safe = true;
    } else {
      action = "manual_review";
      rationale = `Source URL host "${sourceHost}" is non-canonical for a "${phrase}" flag, but no replacement URL found in the brief.`;
      auto_action_safe = false;
      needs_human_review_because = "no_replacement_url_candidate_in_brief";
    }
  } else if (hasMissingReg) {
    issue_type = "c";
    issue_label = "missing-regulation";
    action = "insert_new_item";
    // Take the first detected missing regulation as the primary proposal.
    const mr = missingRegs[0];
    missing_regulation = {
      name: mr.label,
      jurisdiction_iso: mr.jurisdiction_iso,
      source_url: mr.proposed_url,
      item_type: mr.item_type,
      priority: it.priority || "MODERATE",
      additional_candidates: missingRegs.slice(1).map((m) => ({
        name: m.label,
        jurisdiction_iso: m.jurisdiction_iso,
        source_url: m.proposed_url,
      })),
    };
    rationale = `Brief references "${mr.label}" which is not in intelligence_items. ${
      missingRegs.length > 1 ? `(+${missingRegs.length - 1} more candidates)` : ""
    }`;
    // insert_new_item is NEVER auto-safe — it spawns new platform content.
    auto_action_safe = false;
  } else if (isFactualGap) {
    issue_type = "b";
    issue_label = "factual-gap";
    action = "regenerate";
    rationale = `Verification-class phrase "${phrase}" with canonical host ${sourceHost}. Brief needs regen for missing facts.`;
    auto_action_safe = true;
  } else if (isStaleInfo) {
    issue_type = "d";
    issue_label = "stale-info";
    action = "regenerate";
    rationale = isShortBrief
      ? `Brief is ${briefLen} chars (under ${SHORT_BRIEF_CHAR_THRESHOLD}) — likely placeholder; regenerate.`
      : `Flag is ${Math.floor(flaggedDaysAgo)} days old and brief mentions ${olderYear}; regenerate.`;
    auto_action_safe = true;
  } else {
    issue_type = "f";
    issue_label = "other";
    action = "human_review";
    rationale = `Phrase "${phrase}" did not match any heuristic conclusively. Host: ${sourceHost || "(none)"}, brief len: ${briefLen}.`;
    auto_action_safe = false;
    needs_human_review_because = "no_heuristic_matched";
  }

  // ── Tally
  switch (issue_type) {
    case "a": classifications.source_url_broken++; break;
    case "b": classifications.factual_gap++; break;
    case "c": classifications.missing_regulation++; break;
    case "d": classifications.stale_info++; break;
    case "e": classifications.over_flag++; break;
    case "f": classifications.other++; break;
  }

  // ── Pattern frequency tracking
  if (sourceHost) sourceHostFreq.set(sourceHost, (sourceHostFreq.get(sourceHost) || 0) + 1);
  if (phrase) phraseFreq.set(phrase, (phraseFreq.get(phrase) || 0) + 1);
  if (it.jurisdiction_iso) {
    jurisdictionFreq.set(it.jurisdiction_iso, (jurisdictionFreq.get(it.jurisdiction_iso) || 0) + 1);
  }

  itemsOut.push({
    id: it.id,
    legacy_id: it.legacy_id,
    title: it.title,
    source_url: it.source_url,
    source_name: sourceName,
    source_root_url: sourceRootUrl,
    phrase: it.agent_integrity_phrase,
    flagged_at: it.agent_integrity_flagged_at,
    flagged_days_ago: flaggedDaysAgo !== null ? Math.floor(flaggedDaysAgo) : null,
    issue_type,
    issue_label,
    action,
    rationale,
    auto_action_safe,
    proposed_url,
    missing_regulation,
    needs_human_review_because,
    brief_length: briefLen,
    jurisdiction_iso: it.jurisdiction_iso,
  });
}

// ─── Detection helpers ──────────────────────────────────────────────
function detectOverFlag(phrase, briefLower) {
  // Only the most-permissive phrases can be over-flags. For specific
  // phrases like "replace the source URL" or "do not act on prior brief"
  // we trust the trigger.
  if (phrase !== "should be there" && phrase !== "if x was intended") return false;

  // For "should be there": legitimate uses are followed by an article
  // like "a", "an", "the", "one", or an object-noun pattern (e.g.
  // "exemption notification should be there for items above 50kg").
  // Self-flag uses are introduced with "Note:" or appear at the END of
  // the brief in an admin-aside paragraph.
  if (phrase === "should be there") {
    const m = briefLower.match(/(.{0,80})should be there(.{0,80})/);
    if (!m) return false;
    const before = m[1];
    const after = m[2];
    // If there's an explicit self-flag preamble nearby, trust the trigger.
    if (
      /note:|integrity:|flag:|cannot verify|unable to verify/.test(before) ||
      /\[needs review\]|\[gap\]/.test(before + after)
    ) return false;
    // If the surrounding text talks about a *concrete object that the
    // regulation requires*, it's prose. Heuristic: a verb + object pattern.
    if (/\b(a|an|the|one|some|each|every)\s+\w+\s*$/.test(before)) return true;
    if (/\b(notification|exemption|requirement|provision|filing|certificate|exemption)\b/.test(before)) return true;
    // Fall through: ambiguous — trust the trigger.
    return false;
  }

  // For "if X was intended": legitimate uses describe conditional rules
  // ("if a higher tax rate was intended"). Self-flag uses ask the
  // operator a question ("if SB-253 was intended, replace the URL").
  if (phrase === "if x was intended") {
    // If the brief contains an action verb directed at the operator
    // nearby ("replace", "update", "regenerate"), trust the trigger.
    const m = briefLower.match(/if\s+\w[\w\s'-]{0,40}?\s+was\s+intended(.{0,120})/);
    if (m && /\b(replace|update|regenerate|fix|correct)\b/.test(m[1])) return false;
    return true;
  }

  return false;
}

function detectMissingRegulations(brief) {
  if (!brief) return [];
  const stateContext = detectStateContext(brief);
  const found = [];
  const seen = new Set();
  for (const pat of REGULATION_PATTERNS) {
    pat.regex.lastIndex = 0;
    let m;
    while ((m = pat.regex.exec(brief)) !== null) {
      let jurisdictionIso = pat.jurisdiction_iso;
      if (pat.requires_state_context) {
        if (!stateContext) continue; // skip ambiguous state-bill matches
        jurisdictionIso = stateContext;
      }
      const label = pat.label(m);
      const key = `${jurisdictionIso}::${label.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Skip if a row with that title (or close match) already exists.
      const norm = normaliseTitle(label);
      if (titleIndex.has(norm)) continue;

      // Skip if the legacy_id index has a near-match (e.g. "ca-sb-253").
      const slug = norm.replace(/\s+/g, "-");
      let alreadyExists = false;
      for (const lid of legacyIdIndex) {
        if (lid.includes(slug) || slug.includes(lid)) { alreadyExists = true; break; }
      }
      if (alreadyExists) continue;

      found.push({
        label,
        jurisdiction_iso: jurisdictionIso,
        proposed_url: pat.proposed_url(m) || `https://${pat.canonical_host || "example.invalid"}/`,
        item_type: pat.item_type,
        pattern: pat.name,
      });
    }
  }
  return found;
}

function findReplacementUrl(brief) {
  const urls = extractUrls(brief);
  for (const u of urls) {
    const h = extractHost(u);
    if (hostMatchesAny(h, CANONICAL_REGULATOR_HOSTS)) return u;
  }
  return null;
}

// ─── Pattern detection ──────────────────────────────────────────────
const patterns_detected = [];

// Pattern A: source-host clusters
const topHosts = [...sourceHostFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
for (const [host, count] of topHosts) {
  if (count >= 5) {
    patterns_detected.push(`${count} flags pointed at host \`${host}\` — investigate as a single source-quality issue.`);
  }
}

// Pattern B: jurisdiction clusters
const topJurisdictions = [...jurisdictionFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
for (const [iso, count] of topJurisdictions) {
  if (count >= 5) {
    patterns_detected.push(`${count} flags clustered in jurisdiction \`${iso}\` — possible coverage gap or stale lane.`);
  }
}

// Pattern C: missing-regulation clusters by jurisdiction
const missingByJurisdiction = new Map();
for (const it of itemsOut) {
  if (it.issue_type === "c" && it.missing_regulation?.jurisdiction_iso) {
    const j = it.missing_regulation.jurisdiction_iso;
    missingByJurisdiction.set(j, (missingByJurisdiction.get(j) || 0) + 1);
  }
}
for (const [iso, count] of [...missingByJurisdiction.entries()].sort((a, b) => b[1] - a[1])) {
  if (count >= 2) {
    patterns_detected.push(`${count} flags identified missing regulations in jurisdiction \`${iso}\`.`);
  }
}

// Pattern D: phrase concentration
const topPhrases = [...phraseFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
for (const [phrase, count] of topPhrases) {
  if (count >= 10) {
    patterns_detected.push(`${count} flags share phrase "${phrase}" — review trigger sensitivity for that pattern.`);
  }
}

// ─── Cost estimate ──────────────────────────────────────────────────
const regenerateCount = itemsOut.filter((i) => i.action === "regenerate").length;
const estimatedCostUsd = +(regenerateCount * COST_PER_REGENERATE_USD).toFixed(2);

// ─── Plan + report output ───────────────────────────────────────────
const plan = {
  ran_at: new Date().toISOString(),
  total_flagged: flagged.length,
  classifications,
  cost_estimate: {
    regenerate_count: regenerateCount,
    cost_per_regenerate_usd: COST_PER_REGENERATE_USD,
    estimated_total_usd: estimatedCostUsd,
  },
  patterns_detected,
  items: itemsOut,
};

const docsDir = resolve(__dirname, "..", "..", "..", "docs");
mkdirSync(docsDir, { recursive: true });
const planPath = resolve(docsDir, "INTEGRITY-TRIAGE-PLAN.json");
const reportPath = resolve(docsDir, "INTEGRITY-TRIAGE-REPORT.md");

writeFileSync(planPath, JSON.stringify(plan, null, 2), "utf8");
writeFileSync(reportPath, renderMarkdown(plan), "utf8");

function renderMarkdown(p) {
  const lines = [];
  lines.push("# Integrity-flag triage report");
  lines.push("");
  lines.push(`Generated: ${p.ran_at}`);
  lines.push("");
  lines.push("Source: integrity trigger from migration `035_agent_integrity_flags.sql`. Read-only triage — no DB writes.");
  lines.push("");
  lines.push("## Totals");
  lines.push("");
  lines.push(`- total flagged-and-unresolved: **${p.total_flagged}**`);
  lines.push("");
  lines.push("| Issue | Count | Action default |");
  lines.push("|---|---|---|");
  lines.push(`| (a) source-url-broken | ${p.classifications.source_url_broken} | replace_url / manual_review |`);
  lines.push(`| (b) factual-gap | ${p.classifications.factual_gap} | regenerate |`);
  lines.push(`| (c) missing-regulation | ${p.classifications.missing_regulation} | insert_new_item |`);
  lines.push(`| (d) stale-info | ${p.classifications.stale_info} | regenerate |`);
  lines.push(`| (e) over-flag | ${p.classifications.over_flag} | clear_flag |`);
  lines.push(`| (f) other | ${p.classifications.other} | human_review |`);
  lines.push("");
  lines.push("## Cost estimate (worst case)");
  lines.push("");
  lines.push(`If every \`regenerate\`-class item is re-run via Claude API:`);
  lines.push("");
  lines.push(`- regenerate-class items: **${p.cost_estimate.regenerate_count}**`);
  lines.push(`- per-call estimate: $${p.cost_estimate.cost_per_regenerate_usd.toFixed(2)}`);
  lines.push(`- **estimated total: $${p.cost_estimate.estimated_total_usd.toFixed(2)}**`);
  lines.push("");
  if (p.patterns_detected.length) {
    lines.push("## Patterns detected");
    lines.push("");
    for (const pt of p.patterns_detected) lines.push(`- ${pt}`);
    lines.push("");
  } else {
    lines.push("## Patterns detected");
    lines.push("");
    lines.push("_No notable cross-item clusters detected._");
    lines.push("");
  }

  // Per-item table
  lines.push("## Per-item triage");
  lines.push("");
  lines.push("| legacy_id | title | issue | action | auto-safe | rationale |");
  lines.push("|---|---|---|---|---|---|");
  for (const it of p.items) {
    const lid = it.legacy_id || it.id.slice(0, 8);
    const title = (it.title || "").replace(/\|/g, "\\|").slice(0, 80);
    const rat = (it.rationale || "").replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 140);
    lines.push(`| \`${lid}\` | ${title} | ${it.issue_label} | \`${it.action}\` | ${it.auto_action_safe ? "yes" : "no"} | ${rat} |`);
  }
  lines.push("");

  // Items needing human review
  const humanReview = p.items.filter((i) => i.action === "human_review" || i.action === "manual_review");
  if (humanReview.length) {
    lines.push("## Items requiring human review");
    lines.push("");
    for (const it of humanReview) {
      const lid = it.legacy_id || it.id.slice(0, 8);
      lines.push(`### \`${lid}\` — ${it.title}`);
      lines.push("");
      lines.push(`- source_url: ${it.source_url || "_(none)_"}`);
      lines.push(`- phrase: "${it.phrase}"`);
      lines.push(`- reason: ${it.needs_human_review_because || "(see rationale)"}`);
      lines.push(`- rationale: ${it.rationale}`);
      lines.push("");
    }
  }

  // Insert-new-item proposals
  const newItems = p.items.filter((i) => i.action === "insert_new_item");
  if (newItems.length) {
    lines.push("## Proposed new intelligence_items rows");
    lines.push("");
    lines.push("| Source flag | Proposed title | jurisdiction | source_url | item_type |");
    lines.push("|---|---|---|---|---|");
    for (const it of newItems) {
      const mr = it.missing_regulation;
      const lid = it.legacy_id || it.id.slice(0, 8);
      lines.push(`| \`${lid}\` | ${mr.name} | ${mr.jurisdiction_iso || "(none)"} | ${mr.source_url} | ${mr.item_type} |`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("Machine-readable plan: `docs/INTEGRITY-TRIAGE-PLAN.json`");
  lines.push("Procedure: `docs/INTEGRITY-TRIAGE-PROCEDURE.md`");
  lines.push("");
  return lines.join("\n");
}

// ─── Console summary ────────────────────────────────────────────────
console.log("\n=== Integrity-flag triage ===");
console.log(`Total flagged: ${plan.total_flagged}`);
console.log(`  (a) source-url-broken:  ${plan.classifications.source_url_broken}`);
console.log(`  (b) factual-gap:        ${plan.classifications.factual_gap}`);
console.log(`  (c) missing-regulation: ${plan.classifications.missing_regulation}`);
console.log(`  (d) stale-info:         ${plan.classifications.stale_info}`);
console.log(`  (e) over-flag:          ${plan.classifications.over_flag}`);
console.log(`  (f) other:              ${plan.classifications.other}`);
console.log(`\nRegenerate-class items: ${plan.cost_estimate.regenerate_count}`);
console.log(`Worst-case regen cost:  $${plan.cost_estimate.estimated_total_usd.toFixed(2)}`);
if (plan.patterns_detected.length) {
  console.log("\nPatterns:");
  for (const pt of plan.patterns_detected) console.log(`  - ${pt}`);
}
console.log(`\nPlan written:   ${planPath}`);
console.log(`Report written: ${reportPath}`);
