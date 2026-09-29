// harness-run-number.mjs -- the ONE home for "what's the next run_id NUMBER for this harness family,
// and how do I get a write-capable client for the harness_runs insert." Extracted (lane STATUTORY-WRITER,
// 2026-09-28) from two near-identical copies F45 (duplicate-code) flagged as a regression the moment a
// second harness-record-writing script (write-statutory.mjs) copied the shape
// plan-quarantine-disposition.mjs's own `nextRunNumberFromHarnessRuns`/`buildHarnessRunsClient` had
// already established (lane QUARANTINE-DISPOSITION, same day). Per the lane-common-contract's "no
// duplication of an existing module" rule and F45's own remediation ("wire or remove"): one shared home,
// both callers import it.
//
// THIRD CALLER (lane HARNESS-RUN-NUMBER, 2026-09-29, coordinator finding from GitHub run 36610847827):
// record-harness-run.mjs -- the single chokepoint every family's landing now funnels through since PR
// #824 removed artifact-branch commits -- imports `nextRunNumberFromHarnessRuns`/`formatRunId` to
// RENUMBER an artifact's `run_id` at land time against harness_runs' own max, rather than trusting
// whatever number the family's own runner claimed locally (`claimRunId` in run-artifact.mjs, a
// filesystem scan of the family's own `scripts/harness-runs/<family>/*.json` directory -- correct only
// when every prior artifact for that family is still on disk at claim time, which stopped being true the
// moment artifacts stopped being committed back to the tree). harness_runs is the durable record (rule
// 15); the local scan is now only ever a fallback for when the DB itself is unreachable at land time.
// This keeps F28's family-sequence semantics (`<family>-run-NNN`, monotonic per family, one row per
// number) intact -- the AUTHORITY for "what number is next" simply moves from a stale local directory
// listing to the table that is the actual gate that will reject a duplicate.
//
// $0, no I/O side effects on import -- same discipline as every other scripts/lib/*.mjs module.

/**
 * The next run_id NUMBER for `family`, derived from `harness_runs` (the durable record since #813 --
 * lane HARNESS-LANDING), never from scanning git branches or maintenance-artifact/* checkouts (a second,
 * soon-retired source of truth a git-scan-only `claimRunId` default can't see -- see
 * plan-quarantine-disposition.mjs's own header for the live collision history that motivated reading
 * harness_runs directly). Pure over the rows `readAllFn` returns: parses the trailing `-run-NNN` integer
 * off every `run_id` for this family and returns max+1, or 1 when none exist yet. A malformed/
 * foreign-shaped run_id (should not happen; every family's own writer always uses the
 * `<family>-run-NNN` pattern) is skipped rather than thrown on, so one bad row can't crash planning.
 * @param {(table: string, columns: string, opts?: object) => Promise<any[]>} readAllFn
 * @param {string} family
 * @returns {Promise<number>}
 */
export async function nextRunNumberFromHarnessRuns(readAllFn, family) {
  // orderBy: "run_id" -- readAll's own default ("id") does not exist on harness_runs (its PK is run_id),
  // confirmed live (run 36461564054): "column harness_runs.id does not exist". A fake readAllFn in a test
  // that ignores orderBy entirely will not catch this class of bug -- only the real DB does.
  const rows = await readAllFn("harness_runs", "run_id", { match: (q) => q.eq("harness_family", family), orderBy: "run_id" });
  const re = new RegExp(`^${family}-run-(\\d+)$`);
  let max = 0;
  for (const r of rows || []) {
    const m = re.exec(String(r?.run_id ?? ""));
    if (m) max = Math.max(max, Number.parseInt(m[1], 10));
  }
  return max + 1;
}

/**
 * Formats a family + number into the CONVENTION.md `run_id` shape (`<family>-run-NNN`, zero-padded 3
 * digits) -- the one place that padding rule is written, so `nextRunNumberFromHarnessRuns`'s callers
 * never hand-roll `String(n).padStart(3, "0")` themselves (record-harness-run.mjs and
 * plan-quarantine-disposition.mjs/write-statutory.mjs all need this exact shape; F28's own
 * `runIdRegExpFor`-style pattern is what this must match).
 * @param {string} family
 * @param {number} n
 * @returns {string}
 */
export function formatRunId(family, n) {
  return `${family}-run-${String(n).padStart(3, "0")}`;
}

/**
 * A fresh, genuine write-capable Supabase client for the `harness_runs` insert. NEVER built from
 * `scripts/lib/db.mjs`'s `readClient()` (a guard proxy whose `.from(table).insert` throws by design,
 * rule 015) -- `harness_runs` is exempt from that rule (an INSERT is additive, never a mutation --
 * `scripts/lib/record-harness-run.mjs`'s own header), so every caller of this function builds its own
 * real client rather than routing through the guard.
 * @param {string} callerLabel used only in the thrown error message, so a caller's failure names itself.
 * @returns {Promise<import("@supabase/supabase-js").SupabaseClient>}
 */
export async function buildHarnessRunsClient(callerLabel) {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(`${callerLabel}: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set; cannot record to harness_runs.`);
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
