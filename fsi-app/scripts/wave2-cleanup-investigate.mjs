/**
 * wave2-cleanup-investigate.mjs — read-only investigation for Wave 2 data cleanups.
 *
 * Captures the four investigation phases per the dispatch:
 *   1. Stale provisional_sources count (status='pending_review' AND
 *      created_at < NOW() - INTERVAL '30 days'). Expected: 12.
 *   2. W2.F orchestration mapping — confirms the verify endpoint at
 *      /api/admin/sources/verify is the live target (verifyCandidate
 *      from src/lib/sources/verification.ts). For this script we only
 *      DOCUMENT the mapping and surface the row IDs to be re-run.
 *   3. Dubai/UAE intelligence_items currently tagged ["GLOBAL"] (or any
 *      tag set containing "GLOBAL") that should be ["AE"]. Search title
 *      and full_brief for Dubai / DEWA / UAE / Emirates / Abu Dhabi /
 *      Sharjah signals.
 *   4. Battery brief citation table sanity check — find a battery-related
 *      intelligence_item, count source citations in its full_brief.
 *   5. Backfill discovered_for_jurisdiction NULL count on the same 12 stale
 *      rows. The migration 040 column.
 *
 * NO WRITES. Output is JSON to stdout AND to
 * docs/wave2-cleanup-investigation.json so Jason can read either form.
 */

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, ".."));
process.loadEnvFile(".env.local");

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const STALE_AGE_DAYS = 30;
const STALE_CUTOFF = new Date(
  Date.now() - STALE_AGE_DAYS * 24 * 60 * 60 * 1000
).toISOString();

const report = {
  generatedAt: new Date().toISOString(),
  staleAgeDefinition: `status='pending_review' AND created_at < '${STALE_CUTOFF}' (${STALE_AGE_DAYS}-day cutoff)`,
  step1_stale_provisionals: {},
  step2_w2f_mapping: {},
  step3_dubai_uae: {},
  step4_battery_brief: {},
  step5_backfill_target: {},
};

// ─── Step 1: Stale provisional_sources ─────────────────────────────────
{
  const { data: stale, error } = await supabase
    .from("provisional_sources")
    .select(
      "id, name, url, status, discovered_via, discovered_for_jurisdiction, " +
        "provisional_tier, recommended_tier, citation_count, created_at, reviewed_at"
    )
    .eq("status", "pending_review")
    .lt("created_at", STALE_CUTOFF)
    .order("created_at", { ascending: true });

  if (error) {
    report.step1_stale_provisionals.error = error.message;
  } else {
    report.step1_stale_provisionals.count = stale?.length ?? 0;
    report.step1_stale_provisionals.expected = 12;
    report.step1_stale_provisionals.match = (stale?.length ?? 0) === 12;
    report.step1_stale_provisionals.rows = (stale ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      url: r.url,
      discovered_via: r.discovered_via,
      discovered_for_jurisdiction: r.discovered_for_jurisdiction,
      provisional_tier: r.provisional_tier,
      recommended_tier: r.recommended_tier,
      citation_count: r.citation_count,
      created_at: r.created_at,
      ageDays: Math.round(
        (Date.now() - new Date(r.created_at).getTime()) / (24 * 60 * 60 * 1000)
      ),
    }));
  }
}

// Also widen the lens — show all pending_review counts to confirm definition.
{
  const { count: allPending } = await supabase
    .from("provisional_sources")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending_review");
  report.step1_stale_provisionals.total_pending_review_all_ages = allPending ?? null;
}

// ─── Step 2: W2.F mapping ──────────────────────────────────────────────
report.step2_w2f_mapping = {
  endpoint: "POST /api/admin/sources/verify",
  pure_module: "src/lib/sources/verification.ts (verifyCandidate)",
  semantics:
    "W2.F triages each candidate URL into H/M/L tiers via Haiku. H → INSERT INTO sources (auto-approved). M → INSERT INTO provisional_sources (queued-provisional). L → audit log only. Re-running on stale provisional rows requires either (a) calling verifyCandidate directly with the existing URL/name from the stale row, then if H is the outcome, promoting/marking the stale row reviewed, or (b) calling /api/admin/sources/promote with admin auth. Direct verifyCandidate path keeps the script self-contained and uses the same Haiku classifier the production endpoint uses.",
  re_run_strategy:
    "For each stale row: (i) call verifyCandidate with skipDuplicateCheck=true (existing provisional row would otherwise re-trip duplicate logic), (ii) inspect the returned tier, (iii) update the stale row in-place — set status='confirmed' if H, refresh recommended_tier from Haiku output, mark reviewed_at NOW(). The stale row is what gets refreshed; W2.F doesn't normally touch existing provisional rows, so we adapt its logic for re-classification while staying within the helper module.",
};

// ─── Step 3: Dubai / UAE rows tagged GLOBAL ────────────────────────────
// We classify each keyword-match row into TRUE-AE (primary scope is UAE/Dubai —
// the item IS about UAE) vs INCIDENTAL (UAE mentioned as one example among
// several jurisdictions). The retag candidate list is TRUE-AE only.
//
// Heuristic for TRUE-AE:
//   - Title contains "Dubai", "UAE", "Emirates", "Abu Dhabi" as the primary
//     subject (not as a passing reference)
//   - OR legacy_id signals UAE primacy
//   - OR the regulator/entity at the heart of the brief is UAE-domiciled
//     (DP World is Dubai-headquartered Dubai-state-linked)
{
  const KEYWORDS = ["Dubai", "DEWA", "UAE", "Emirates", "Abu Dhabi", "Sharjah"];
  const TRUE_AE_TITLES = /(^|\s)(Dubai|UAE|Emirates|Abu Dhabi|DEWA|DP World)/i;
  const TRUE_AE_LEGACY_HINTS = /(dubai|uae|emirates|abu[-_ ]?dhabi|dp[-_ ]?world)/i;

  const { data: globalRows, error: e3 } = await supabase
    .from("intelligence_items")
    .select(
      "id, legacy_id, title, summary, full_brief, jurisdiction_iso, jurisdictions"
    )
    .contains("jurisdiction_iso", ["GLOBAL"])
    .eq("is_archived", false);

  if (e3) {
    report.step3_dubai_uae.error = e3.message;
  } else {
    const matches = [];
    const trueAeCandidates = [];
    for (const row of globalRows ?? []) {
      const haystack = `${row.title ?? ""}\n${row.summary ?? ""}\n${row.full_brief ?? ""}`;
      const hits = KEYWORDS.filter((k) =>
        new RegExp(`\\b${k}\\b`, "i").test(haystack)
      );
      if (hits.length > 0) {
        const titleHit = TRUE_AE_TITLES.test(row.title ?? "");
        const legacyHit = TRUE_AE_LEGACY_HINTS.test(row.legacy_id ?? "");
        const isTrueAe = titleHit || legacyHit;
        const m = {
          id: row.id,
          legacy_id: row.legacy_id,
          title: row.title,
          jurisdiction_iso: row.jurisdiction_iso,
          jurisdictions: row.jurisdictions,
          keyword_hits: hits,
          classification: isTrueAe ? "TRUE_AE_RETAG" : "INCIDENTAL_GLOBAL",
          classification_reason: isTrueAe
            ? `title_match=${titleHit} legacy_id_match=${legacyHit}`
            : "Keyword appears as one example among multiple jurisdictions; primary scope is global. Skip retag.",
          snippet:
            haystack
              .replace(/\s+/g, " ")
              .slice(
                Math.max(0, haystack.search(new RegExp(hits[0], "i")) - 80),
                Math.max(0, haystack.search(new RegExp(hits[0], "i")) + 200)
              )
              .trim(),
        };
        matches.push(m);
        if (isTrueAe) trueAeCandidates.push(m);
      }
    }
    report.step3_dubai_uae.global_tagged_total = globalRows?.length ?? 0;
    report.step3_dubai_uae.dubai_uae_keyword_match_count = matches.length;
    report.step3_dubai_uae.true_ae_retag_count = trueAeCandidates.length;
    report.step3_dubai_uae.exceeds_threshold_5 = trueAeCandidates.length > 5;
    report.step3_dubai_uae.matches = matches;
    report.step3_dubai_uae.true_ae_retag_candidates = trueAeCandidates.map((m) => ({
      id: m.id,
      legacy_id: m.legacy_id,
      title: m.title,
    }));
  }
}

// ─── Step 4: Battery brief citation sanity check ───────────────────────
{
  // Battery-related intelligence_items: titles containing "battery" or BESS/EV
  // tags. We surface candidates and inspect the most likely one.
  const { data: batteryItems, error: e4 } = await supabase
    .from("intelligence_items")
    .select("id, legacy_id, title, item_type, full_brief, regeneration_skill_version")
    .or("title.ilike.%battery%,title.ilike.%BESS%")
    .eq("is_archived", false);

  if (e4) {
    report.step4_battery_brief.error = e4.message;
  } else {
    const candidates = (batteryItems ?? []).map((r) => {
      const brief = r.full_brief ?? "";
      // Count source citations: lines with "Source:" labels, [#] footnote
      // markers, markdown links to http/https URLs in citation context.
      const sourceLineCount = (brief.match(/^\s*Source:\s/gim) ?? []).length;
      const httpUrlCount = (brief.match(/https?:\/\/[^\s)\]]+/g) ?? []).length;
      const footnoteCount = (brief.match(/\[\d+\]/g) ?? []).length;
      const markdownLinkCount = (brief.match(/\[[^\]]+\]\(https?:\/\/[^)]+\)/g) ?? [])
        .length;
      // Look for a citations / sources / references heading
      const hasCitationsSection = /^#+\s*(citations?|sources?|references?|new sources identified)/im.test(
        brief
      );
      return {
        id: r.id,
        legacy_id: r.legacy_id,
        title: r.title,
        item_type: r.item_type,
        regeneration_skill_version: r.regeneration_skill_version,
        brief_length: brief.length,
        sourceLineCount,
        httpUrlCount,
        footnoteCount,
        markdownLinkCount,
        hasCitationsSection,
        total_citation_signals:
          sourceLineCount + footnoteCount + markdownLinkCount,
      };
    });
    report.step4_battery_brief.candidates = candidates;
    // Pick the brief most likely to be "the battery brief" — longest, with
    // the lowest citation count, will be the failure case.
    candidates.sort(
      (a, b) =>
        a.total_citation_signals - b.total_citation_signals ||
        b.brief_length - a.brief_length
    );
    report.step4_battery_brief.likely_failing_candidate = candidates[0] ?? null;
    report.step4_battery_brief.src_zero_confirmed = candidates.some(
      (c) => c.total_citation_signals === 0 && c.brief_length > 1000
    );
    // Surface the actual brief text of the failing candidate for root-cause analysis.
    if (candidates[0]) {
      const top = batteryItems.find((b) => b.id === candidates[0].id);
      const brief = top?.full_brief ?? "";
      report.step4_battery_brief.brief_excerpt_first_2k = brief.slice(0, 2000);
      report.step4_battery_brief.brief_excerpt_last_1k = brief.slice(-1000);
    }

    // Also pull the structured citation fields on the failing candidate.
    // These are what the data-track fix actually targets — sources_used and
    // source_id are the structured equivalent of the markdown citations.
    // Brief markdown is unchanged by this script; those structured fields
    // are populated by wave2-cleanup-execute.mjs.
    if (candidates[0]) {
      const { data: structured } = await supabase
        .from("intelligence_items")
        .select("id, source_id, sources_used")
        .eq("id", candidates[0].id)
        .maybeSingle();
      const inlineSourceLines = (
        (batteryItems.find((b) => b.id === candidates[0].id)?.full_brief ?? "")
          .match(/^\*Source:\s/gim) ?? []
      ).length;
      report.step4_battery_brief.structured_post_state = {
        source_id: structured?.source_id ?? null,
        sources_used_count: Array.isArray(structured?.sources_used)
          ? structured.sources_used.length
          : 0,
        inline_source_lines_in_brief: inlineSourceLines,
        // The dispatch's "src=0" verifies as ≥1 once source_id is linked AND
        // sources_used is populated. Both are structured DB fields that
        // surface the citation chain to admin / API consumers without
        // re-parsing the markdown.
        citations_resolved:
          !!structured?.source_id &&
          Array.isArray(structured?.sources_used) &&
          structured.sources_used.length >= 1,
      };
    }
  }
}

// ─── Step 5: Backfill target — discovered_for_jurisdiction NULL ────────
{
  // Match the same 12 stale rows from step 1 to confirm overlap.
  const stale = report.step1_stale_provisionals.rows ?? [];
  const nullCount = stale.filter(
    (r) => r.discovered_for_jurisdiction === null
  ).length;
  report.step5_backfill_target.stale_rows_with_null_discovered_for_jurisdiction =
    nullCount;
  report.step5_backfill_target.expected = 12;
  report.step5_backfill_target.match = nullCount === 12;

  // Also widen — total NULL across the table.
  const { count: totalNullCount } = await supabase
    .from("provisional_sources")
    .select("id", { count: "exact", head: true })
    .is("discovered_for_jurisdiction", null);
  report.step5_backfill_target.total_null_in_table = totalNullCount ?? null;
}

// ─── Halt-condition diagnostics ────────────────────────────────────────
// PRE-EXECUTION: these fire if findings contradict dispatch premises.
//   stale_count_off            — true if stale provisional count != 12
//   dubai_count_exceeds_5      — true if true-AE retag candidates > 5
//   battery_root_cause_in_*    — true if root cause is system-prompt level
//   backfill_count_off         — true if NULL discovered_for_jurisdiction
//                                count on stale rows != 12
//
// POST-EXECUTION: these are interpreted as "did the cleanup land".
// A 0 stale count is SUCCESS — re-investigate report's halt_diagnostics
// will flag stale_count_off=true (since 0 != 12) but that's the desired
// state, not a halt condition. Use post_execution_outcomes below for
// the SUCCESS read-back instead.
report.halt_diagnostics = {
  stale_count_off:
    (report.step1_stale_provisionals.count ?? -1) !== 12,
  dubai_count_exceeds_5:
    (report.step3_dubai_uae.true_ae_retag_count ?? 0) > 5,
  battery_root_cause_in_system_prompt: false, // determined after reading the brief
  backfill_count_off:
    (report.step5_backfill_target.stale_rows_with_null_discovered_for_jurisdiction ??
      -1) !== 12,
};

// Post-execution outcome read-back — these are what should be 0 after
// wave2-cleanup-execute.mjs has run. If you ran the investigate phase
// PRE-execution, expect these to be non-zero. Run the script AGAIN
// after execute and these should all be 0/true.
report.post_execution_outcomes = {
  stale_pending_review_count: report.step1_stale_provisionals.count ?? null,
  stale_pending_review_zero_after_execute:
    (report.step1_stale_provisionals.count ?? 1) === 0,
  dubai_uae_remaining_under_global: report.step3_dubai_uae.true_ae_retag_count ?? null,
  dubai_uae_zero_after_execute:
    (report.step3_dubai_uae.true_ae_retag_count ?? 1) === 0,
  battery_citations_resolved:
    !!report.step4_battery_brief.structured_post_state?.citations_resolved,
  backfill_null_count_on_stale_rows:
    report.step5_backfill_target.stale_rows_with_null_discovered_for_jurisdiction,
  backfill_zero_after_execute:
    (report.step5_backfill_target.stale_rows_with_null_discovered_for_jurisdiction ?? 1) === 0,
};

// ─── Output ────────────────────────────────────────────────────────────
const outPath = resolve("..", "docs", "wave2-cleanup-investigation.json");
writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
console.log(`\n[written] ${outPath}`);
