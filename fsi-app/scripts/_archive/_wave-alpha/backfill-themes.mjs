// @ts-check
// Wave-α C3 THEME BACKFILL (AUTHORED for the orchestrator to run — not executed by the authoring agent).
//
// Backfills intelligence_items.theme ONLY where it is DETERMINISTICALLY derivable: the row's banked
// theme_candidate (the legacy topic-tag value the pre-C3 parser accepted and toDbTheme() nulled) has an
// EXACT entry in THEME_CANDIDATE_DETERMINISTIC_MAP (metadata-vocab.ts — name-level 1:1 mappings only:
// fuels -> fuels_saf, packaging -> packaging_circular). Ambiguous candidates (emissions, reporting,
// transport, corridors, research) are DELIBERATELY not mapped — they stay banked in theme_candidate for
// the Emergence-Capture follow-on; guessing on a customer-routing column is forbidden.
//
// Live-corpus expectation at authoring time (read-only SELECT 2026-07-11): research_summary rows with
// theme IS NULL and a banked candidate = transport(7) research(3) emissions(3) fuels(2) reporting(1)
// -> this script will backfill ~2 rows (the `fuels` pair) and leave the rest banked. Scope is
// format_type='research_summary' (theme is only valid there — parser rule + /research routing).
//
// USAGE (orchestrator):
//   node fsi-app/scripts/_wave-alpha/backfill-themes.mjs           # DRY RUN (default): report only
//   node fsi-app/scripts/_wave-alpha/backfill-themes.mjs --live    # apply, with per-row read-back verify
//
// Env: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (service client — RLS-independent write).
// Writes route through the GUARDED path (scripts/lib/db.mjs guardedUpdate — rule 015): prior-value
// snapshot (reversible) + governing-skill cite on every mutation.

import { createClient } from "@supabase/supabase-js";
import { guardedUpdate } from "../lib/db.mjs";
import { THEME_CANDIDATE_DETERMINISTIC_MAP } from "../../src/lib/agent/metadata-vocab.ts";

const LIVE = process.argv.includes("--live");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("backfill-themes: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required");
  process.exit(2);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const mappableCandidates = Object.keys(THEME_CANDIDATE_DETERMINISTIC_MAP);
const CITE = {
  skill: "environmental-policy-and-innovation",
  reason: "Wave-α C3 theme backfill — promote a banked theme_candidate to theme ONLY on an exact deterministic vocab-map hit (fuels->fuels_saf, packaging->packaging_circular); ambiguous candidates stay banked",
};

async function main() {
  // Fail-closed read: an error here aborts — never "backfill what we could read".
  const { data: rows, error } = await sb
    .from("intelligence_items")
    .select("id, title, format_type, theme, theme_candidate")
    .eq("format_type", "research_summary")
    .is("theme", null)
    .in("theme_candidate", mappableCandidates);
  if (error) {
    console.error(`backfill-themes: candidate read FAILED (${error.message}) — aborting, nothing written`);
    process.exit(1);
  }
  const targets = rows ?? [];
  console.log(`backfill-themes: ${targets.length} deterministically-derivable row(s) (map: ${mappableCandidates.map((k) => `${k}->${THEME_CANDIDATE_DETERMINISTIC_MAP[k]}`).join(", ")})`);
  for (const r of targets) console.log(`  - ${r.id} "${String(r.title).slice(0, 60)}" candidate=${r.theme_candidate} -> theme=${THEME_CANDIDATE_DETERMINISTIC_MAP[r.theme_candidate]}`);
  if (!targets.length) { console.log("backfill-themes: nothing to do."); return; }
  if (!LIVE) { console.log("backfill-themes: DRY RUN — pass --live to apply."); return; }

  let applied = 0;
  for (const r of targets) {
    const theme = THEME_CANDIDATE_DETERMINISTIC_MAP[r.theme_candidate];
    // Guarded update (rule 015): prior-value snapshot + cite; the match pins the exact
    // (theme IS NULL, same candidate) state we planned against, so a raced row is skipped, not clobbered.
    const res = await guardedUpdate(
      "intelligence_items",
      (q) => q.eq("id", r.id).is("theme", null).eq("theme_candidate", r.theme_candidate),
      { theme, theme_candidate: null, updated_at: new Date().toISOString() },
      { cite: CITE, select: "id, theme, theme_candidate" },
    );
    if (res.updated !== 1) { console.error(`  FAIL ${r.id}: guardedUpdate touched ${res.updated} rows (expected 1) — halting (per-step verification)`); process.exit(1); }
    // Read-back verification (dispatch discipline: per-step, halt on divergence).
    const { data: check, error: ckErr } = await sb.from("intelligence_items").select("theme, theme_candidate").eq("id", r.id).single();
    if (ckErr || check?.theme !== theme || check?.theme_candidate !== null) {
      console.error(`  VERIFY FAIL ${r.id}: read-back theme=${check?.theme} candidate=${check?.theme_candidate} (${ckErr?.message ?? "mismatch"}) — halting`);
      process.exit(1);
    }
    applied += 1;
    console.log(`  OK ${r.id} theme=${theme} (snapshot ${res.snapshot}; verified by read-back)`);
  }
  console.log(`backfill-themes: ${applied}/${targets.length} applied + verified.`);
}

main().catch((e) => { console.error(`backfill-themes: ${e?.message ?? e}`); process.exit(1); });
