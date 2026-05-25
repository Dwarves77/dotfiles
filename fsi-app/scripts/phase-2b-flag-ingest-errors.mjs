/**
 * phase-2b-flag-ingest-errors.mjs — Phase 2B writes (2026-05-25).
 *
 * Scope authorized by operator on 2026-05-25:
 *
 *   Flag intelligence_items rows whose full_brief contains fetch-error
 *   signatures (403/404/Access Blocked/Source returned/etc.) that landed
 *   BEFORE commit 6dd26a2 which added the checkBriefContent post-classify
 *   gate. Sets agent_integrity_flag = true with phrase = ingest_error so
 *   the rows surface at /admin -> Integrity flags for human triage.
 *
 *   Per-row verification before moving on. Idempotent: re-running skips
 *   rows already flagged. Brief body is preserved (not stripped) so the
 *   admin reviewer can see the content and decide regen / strip / accept.
 *
 * Pre-state (verified 2026-05-25): 7 rows match the fetch-error pattern
 * regex; none are currently flagged. Post-state target: 7 flagged, 0
 * unflagged matching the same regex.
 */

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";

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

const LOG_DIR = resolve("..", "docs", "audits");
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
const LOG_PATH = resolve(LOG_DIR, "phase-2b-flag-ingest-errors-log.json");

const log = [];
function step(name, ok, detail) {
  const line = `[${ok ? "OK" : "FAIL"}] ${name} — ${detail}`;
  console.log(line);
  log.push({ name, ok, detail, at: new Date().toISOString() });
  if (!ok) {
    writeFileSync(LOG_PATH, JSON.stringify({ aborted_at: name, log }, null, 2), "utf8");
    process.exit(1);
  }
}

// Patterns to match. Mirrors src/lib/sources/fetch-quality.ts BRIEF_FAILURE_PATTERNS
// but expressed as a single PG regex for the SQL-level scan.
const PG_FETCH_ERROR_REGEX =
  "(403|401|404|429|502|503).*forbidden|access (blocked|denied)|content unavailable|source returned|could not be accessed|unable to fetch|fetch failed";

// ─── Pre-state ──────────────────────────────────────────────────────
console.log(`\n=== Phase 2B: flag rows with fetch-error briefs ===\n`);

// Identify candidate rows. Use head=false because we need ids back.
const { data: candidates, error: scanErr } = await supabase
  .from("intelligence_items")
  .select("id, title, full_brief, agent_integrity_flag")
  .not("full_brief", "is", null);
if (scanErr) {
  step("scan_candidates", false, scanErr.message);
}

// Filter client-side using the same regex shape (case-insensitive).
const re = new RegExp(
  "(403|401|404|429|502|503).*forbidden|access (blocked|denied)|content unavailable|source returned|could not be accessed|unable to fetch|fetch failed",
  "i"
);
const matches = (candidates ?? []).filter((r) => r.full_brief && re.test(r.full_brief));

step(
  "scan_candidates",
  true,
  `${matches.length} rows match fetch-error regex out of ${(candidates ?? []).length} non-null briefs`
);

const toFlag = matches.filter((r) => !r.agent_integrity_flag);
const alreadyFlagged = matches.length - toFlag.length;
step(
  "filter_unflagged",
  true,
  `${toFlag.length} to flag, ${alreadyFlagged} already flagged (idempotent skip)`
);

// ─── Per-row flag ───────────────────────────────────────────────────
const now = new Date().toISOString();
const PHRASE =
  "ingest_error: brief body contains fetch-error signature (pre-checkBriefContent gate)";

let flagged = 0;
for (const row of toFlag) {
  const { error: updErr } = await supabase
    .from("intelligence_items")
    .update({
      agent_integrity_flag: true,
      agent_integrity_phrase: PHRASE,
      agent_integrity_flagged_at: now,
    })
    .eq("id", row.id);
  if (updErr) {
    step(`flag.${row.id}`, false, updErr.message);
  }

  // Verify
  const { data: verify, error: verErr } = await supabase
    .from("intelligence_items")
    .select("agent_integrity_flag, agent_integrity_phrase")
    .eq("id", row.id)
    .single();
  if (verErr || !verify) {
    step(`verify.${row.id}`, false, verErr?.message || "no row");
  }
  if (!verify.agent_integrity_flag || verify.agent_integrity_phrase !== PHRASE) {
    step(
      `verify.${row.id}`,
      false,
      `flag=${verify.agent_integrity_flag} phrase="${(verify.agent_integrity_phrase ?? "").slice(0, 60)}"`
    );
  }
  flagged++;
  step(`flag.${row.id}`, true, `"${row.title.slice(0, 60)}" flagged`);
}

// ─── Post-state ─────────────────────────────────────────────────────
const { count: residualUnflagged, error: postErr } = await supabase
  .from("intelligence_items")
  .select("id", { count: "exact", head: true })
  .not("full_brief", "is", null)
  .eq("agent_integrity_flag", false);
if (postErr) {
  step("post_state", false, postErr.message);
}

// More important: verify no rows match the regex AND are unflagged.
const { data: postCandidates } = await supabase
  .from("intelligence_items")
  .select("id, agent_integrity_flag, full_brief")
  .not("full_brief", "is", null);
const residualMatchingUnflagged = (postCandidates ?? []).filter(
  (r) => r.full_brief && re.test(r.full_brief) && !r.agent_integrity_flag
);
if (residualMatchingUnflagged.length > 0) {
  step(
    "post_state_matching_unflagged",
    false,
    `expected 0 unflagged fetch-error rows, found ${residualMatchingUnflagged.length}`
  );
}
step(
  "post_state_matching_unflagged",
  true,
  `0 unflagged rows with fetch-error briefs remain`
);

writeFileSync(
  LOG_PATH,
  JSON.stringify(
    {
      completed: true,
      flagged,
      already_flagged_skipped: alreadyFlagged,
      total_matching: matches.length,
      log,
    },
    null,
    2
  ),
  "utf8"
);

console.log(`\n=== Phase 2B complete: ${flagged} new flags, ${alreadyFlagged} already flagged ===`);
console.log(`Log: ${LOG_PATH}`);
