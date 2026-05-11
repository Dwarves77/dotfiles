/**
 * backfill-classify-batch.mjs — Caro's Ledge source 5-axis classification backfill.
 *
 * Reads the intermediary classifier output at scripts/tmp/_backfill-classify-out.json
 * (produced by the offline classification pass) and writes the framework-derived
 * fields onto the public.sources rows in supabase.
 *
 * Parameterized so batches 2..N can reuse the same script.
 *
 * Usage:
 *   node scripts/backfill-classify-batch.mjs --batch=1 --size=100
 *   node scripts/backfill-classify-batch.mjs --batch=2 --size=100
 *   node scripts/backfill-classify-batch.mjs --start=110 --size=2
 *
 * Or:
 *   BATCH=1 SIZE=100 node scripts/backfill-classify-batch.mjs
 *
 * Flags:
 *   --batch=N   1-based batch number (back-compat). Computes start = (N-1)*size.
 *   --start=N   0-based explicit row-index start into the filtered+sorted list.
 *   --size=N    window size (rows per invocation).
 *   --log=PATH  override the markdown log output path.
 *
 * Precedence:
 *   If both --batch and --start are passed, --start wins (a single-line
 *   warning is logged to stderr noting the conflict and which value won).
 *   If only --batch is passed, start = (batch-1) * size (preserves existing
 *   batch 1/2/3 invocations).
 *
 * Selection:
 *   1. Drop rows where confidence === "AMBIGUOUS"
 *   2. Drop rows whose rationale flags URL-split-needed (substrings:
 *      "split", "url pattern", "multi-org" — case-insensitive)
 *   3. Sort remaining rows by item_count DESC
 *   4. Slice window: rows[start .. start + size)
 *
 * Per-row write:
 *   UPDATE sources
 *      SET source_role = $role,
 *          secondary_roles = $secondary,
 *          jurisdictions = $juris,
 *          scope_topics = $topics,
 *          scope_modes = $modes,
 *          scope_verticals = $verticals,
 *          expected_output = $expected,
 *          classification_assigned_at = now(),
 *          classification_confidence = $confidence,
 *          classification_rationale = $rationale,
 *          tier = $tier            -- framework default from JSON
 *    WHERE id = $id AND source_role IS NULL
 *
 *   Migration 067 (applied 2026-05-10) added classification_confidence and
 *   classification_rationale to public.sources. They are now written
 *   atomically alongside the other 10 fields in the same UPDATE.
 *
 * Atomicity:
 *   supabase-js cannot wrap multiple PostgREST calls in a single transaction;
 *   the existing scripts in this repo use per-row writes with read-back
 *   verification and halt-on-first-error semantics. Same approach here.
 *
 * Idempotency:
 *   The WHERE source_role IS NULL guard means re-running the same batch is a
 *   no-op for rows that already have a role.
 *
 * Halt-on-error:
 *   First UPDATE failure stops further writes. The transaction wording in the
 *   spec is approximated by this fail-fast behavior.
 *
 * Authorization:
 *   Operator-approved 2026-05-10 (Jason). Do NOT proceed to batch 2 without
 *   a fresh operator approval.
 */

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, ".."));
process.loadEnvFile(".env.local");

// ── Args ─────────────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  })
);
const SIZE = Number(args.size ?? process.env.SIZE ?? 100);

if (!Number.isInteger(SIZE) || SIZE < 1) {
  console.error("ERR: --size must be a positive integer");
  process.exit(1);
}

// --start=N takes precedence over --batch when both are passed.
const startArgRaw = args.start ?? process.env.START;
const startProvided = startArgRaw !== undefined;
const batchProvided =
  args.batch !== undefined || process.env.BATCH !== undefined;

if (!startProvided && !batchProvided) {
  console.error(
    "ERR: must pass either --batch=N or --start=N (or set BATCH / START env)"
  );
  process.exit(1);
}

const BATCH_RAW = Number(args.batch ?? process.env.BATCH ?? 1);
if (batchProvided && (!Number.isInteger(BATCH_RAW) || BATCH_RAW < 1)) {
  console.error("ERR: --batch must be a positive integer");
  process.exit(1);
}

let START;
let BATCH;
if (startProvided) {
  START = Number(startArgRaw);
  if (!Number.isInteger(START) || START < 0) {
    console.error("ERR: --start must be a non-negative integer");
    process.exit(1);
  }
  if (batchProvided) {
    const batchDerivedStart = (BATCH_RAW - 1) * SIZE;
    console.error(
      `WARN: both --batch=${BATCH_RAW} (implies start=${batchDerivedStart}) and ` +
        `--start=${START} were passed; --start wins (using start=${START}).`
    );
    // When both are passed, --start wins for the window, but the explicitly
    // passed --batch wins for the batch label (operator intent).
    BATCH = BATCH_RAW;
  } else {
    // Synthesize batch label from --start / --size so [INIT], HOLD, and the
    // log filename report the right batch number even when only --start was
    // passed.
    BATCH = Math.floor(START / SIZE) + 1;
  }
} else {
  BATCH = BATCH_RAW;
  START = (BATCH - 1) * SIZE;
}

// Log filename date is America/New_York local date, not UTC.
// en-CA already produces ISO order (YYYY-MM-DD).
const LOG_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const LOG_PATH =
  args.log ??
  process.env.LOG ??
  resolve(
    "..",
    "docs",
    `source-classification-batch-${BATCH}-log-${LOG_DATE}.md`
  );

console.log(
  `[INIT] batch=${BATCH} start=${START} size=${SIZE} log=${LOG_PATH}`
);

// ── Supabase ─────────────────────────────────────────────────────────────────
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

// ── Load intermediary JSON ───────────────────────────────────────────────────
const JSON_PATH = resolve("scripts", "tmp", "_backfill-classify-out.json");
const intermediary = JSON.parse(readFileSync(JSON_PATH, "utf8"));
const all = intermediary.classified ?? [];
console.log(`[LOAD] ${all.length} classified rows from ${JSON_PATH}`);

// ── Selection ────────────────────────────────────────────────────────────────
const SPLIT_HINTS = ["split", "url pattern", "multi-org"];
function isSplitFlagged(row) {
  const blob = `${row.rationale ?? ""} ${row.notes ?? ""}`.toLowerCase();
  return SPLIT_HINTS.some((h) => blob.includes(h));
}

const ambiguous = all.filter((r) => r.confidence === "AMBIGUOUS").length;
const splitFlagged = all.filter(isSplitFlagged).length;

const candidates = all
  .filter((r) => r.confidence !== "AMBIGUOUS" && !isSplitFlagged(r))
  .sort((a, b) => (b.item_count ?? 0) - (a.item_count ?? 0));

console.log(
  `[FILTER] all=${all.length}  ambiguous_dropped=${ambiguous}  ` +
    `split_flagged_dropped=${splitFlagged}  candidates=${candidates.length}`
);

const start = START;
const end = Math.min(start + SIZE, candidates.length);
const window = candidates.slice(start, end);
console.log(
  `[SELECT] batch=${BATCH} start=${start} window=[${start}..${end}) selected=${window.length}`
);

if (window.length === 0) {
  console.log("[HALT] no rows in window — exiting without writes.");
  process.exit(0);
}

// ── Per-row update ───────────────────────────────────────────────────────────
const log = [];
const summary = {
  batch: BATCH,
  size: SIZE,
  total_rows: all.length,
  ambiguous_dropped: ambiguous,
  split_flagged_dropped: splitFlagged,
  candidates_after_filter: candidates.length,
  selected_for_batch: window.length,
  updated: 0,
  skipped_already_classified: 0,
  skipped_other: 0,
  tier_overrides: 0,
  override_directions: {}, // e.g. "T4→T2": 23
  role_distribution: {},
  errors: [],
  conf_distribution: {},
  // Schema notes
  notes: [
    "Migration 067 (2026-05-10) added classification_confidence and classification_rationale to public.sources. Per-row UPDATE now writes 12 fields atomically.",
  ],
};

let halted = false;

for (let i = 0; i < window.length; i++) {
  const row = window[i];
  const tierExisting = row.tier_existing;
  const tierNew = row.tier;
  const tierFromJsonValid =
    Number.isInteger(tierNew) && tierNew >= 1 && tierNew <= 7;

  // Pre-read for accurate before-state (and to defend the idempotent guard).
  const { data: cur, error: eRead } = await supabase
    .from("sources")
    .select("id, name, source_role, tier")
    .eq("id", row.id)
    .maybeSingle();

  if (eRead || !cur) {
    summary.skipped_other++;
    log.push({
      id: row.id,
      name: row.name,
      action: "READ_FAIL",
      detail: eRead?.message ?? "row not found",
    });
    console.warn(`[READ_FAIL] ${row.id} ${row.name}: ${eRead?.message ?? "not found"}`);
    continue;
  }

  if (cur.source_role !== null) {
    summary.skipped_already_classified++;
    log.push({
      id: row.id,
      name: row.name,
      item_count: row.item_count,
      action: "SKIP_ALREADY_CLASSIFIED",
      existing_role: cur.source_role,
      tier_existing_db: cur.tier,
    });
    console.log(
      `[SKIP] ${row.name} — already classified as ${cur.source_role}`
    );
    continue;
  }

  // Build the update patch.
  const patch = {
    source_role: row.source_role,
    secondary_roles: row.secondary_roles ?? [],
    jurisdictions: row.jurisdictions ?? [],
    scope_topics: row.scope_topics ?? [],
    scope_modes: row.scope_modes ?? [],
    scope_verticals: row.scope_verticals ?? [],
    expected_output: row.expected_output ?? null,
    classification_assigned_at: new Date().toISOString(),
    classification_confidence: row.confidence ?? null,
    classification_rationale: row.rationale ?? null,
  };
  if (tierFromJsonValid) {
    patch.tier = tierNew;
  }
  // If JSON tier is null/missing, leave existing tier intact (per spec).

  const { data: updated, error: eUpd } = await supabase
    .from("sources")
    .update(patch)
    .eq("id", row.id)
    .is("source_role", null) // idempotent guard, also a race-defense
    .select("id, source_role, tier")
    .maybeSingle();

  if (eUpd) {
    halted = true;
    summary.errors.push({
      id: row.id,
      name: row.name,
      message: eUpd.message,
      details: eUpd.details ?? null,
    });
    log.push({
      id: row.id,
      name: row.name,
      action: "UPDATE_FAIL",
      detail: eUpd.message,
    });
    console.error(
      `\n[HALT] update failed at row ${i + 1}/${window.length} ${row.id} ${row.name}: ` +
        eUpd.message
    );
    break;
  }

  if (!updated) {
    // Guard fired between read and write (rare). Treat as already-classified.
    summary.skipped_already_classified++;
    log.push({
      id: row.id,
      name: row.name,
      action: "SKIP_GUARD_FIRED",
      detail: "source_role became non-null between read and write",
    });
    continue;
  }

  // Tier override accounting.
  let overrideDirection = "keep";
  if (tierFromJsonValid && tierExisting !== tierNew) {
    summary.tier_overrides++;
    overrideDirection = `T${tierExisting}→T${tierNew}`;
    summary.override_directions[overrideDirection] =
      (summary.override_directions[overrideDirection] ?? 0) + 1;
  }

  // Role distribution.
  summary.role_distribution[row.source_role] =
    (summary.role_distribution[row.source_role] ?? 0) + 1;

  summary.updated++;
  const tierNote = tierFromJsonValid
    ? `T${tierExisting}→T${tierNew}${tierExisting === tierNew ? " (keep)" : " OVERRIDE"}`
    : `T${tierExisting} (json null, kept)`;

  // Confidence distribution accounting.
  const confKey = row.confidence ?? "null";
  summary.conf_distribution[confKey] =
    (summary.conf_distribution[confKey] ?? 0) + 1;

  log.push({
    id: row.id,
    name: row.name,
    item_count: row.item_count,
    action: "UPDATED",
    role: row.source_role,
    tier_existing: tierExisting,
    tier_new: tierFromJsonValid ? tierNew : tierExisting,
    override: overrideDirection,
    confidence: row.confidence ?? null,
  });

  console.log(
    `[UPD ${String(i + 1).padStart(3)}/${window.length}] ${row.id} | ` +
      `${row.name.slice(0, 50).padEnd(50)} | items=${String(row.item_count).padStart(4)} | ` +
      `${row.source_role.padEnd(28)} | ${tierNote} | conf=${confKey}`
  );
}

// ── Render markdown log ──────────────────────────────────────────────────────
function md() {
  const lines = [];
  lines.push(`# Source classification backfill — batch ${BATCH}`);
  lines.push("");
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Halted on error:** ${halted ? "YES (fail-fast)" : "no"}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|---|---|");
  lines.push(`| Total classified rows in JSON | ${summary.total_rows} |`);
  lines.push(`| Dropped (AMBIGUOUS) | ${summary.ambiguous_dropped} |`);
  lines.push(`| Dropped (URL-split flagged) | ${summary.split_flagged_dropped} |`);
  lines.push(`| Candidates after filter | ${summary.candidates_after_filter} |`);
  lines.push(`| Selected for batch ${BATCH} | ${summary.selected_for_batch} |`);
  lines.push(`| UPDATEs issued (success) | ${summary.updated} |`);
  lines.push(`| Skipped — already classified | ${summary.skipped_already_classified} |`);
  lines.push(`| Skipped — read fail / other | ${summary.skipped_other} |`);
  lines.push(`| Tier overrides | ${summary.tier_overrides} |`);
  lines.push(`| Errors | ${summary.errors.length} |`);
  lines.push("");

  lines.push("## Tier overrides by direction");
  lines.push("");
  const dirs = Object.entries(summary.override_directions).sort(
    (a, b) => b[1] - a[1]
  );
  if (dirs.length === 0) {
    lines.push("_none_");
  } else {
    lines.push("| Direction | Count |");
    lines.push("|---|---|");
    for (const [d, n] of dirs) lines.push(`| ${d} | ${n} |`);
  }
  lines.push("");

  lines.push("## Role distribution (this batch)");
  lines.push("");
  const roles = Object.entries(summary.role_distribution).sort(
    (a, b) => b[1] - a[1]
  );
  if (roles.length === 0) {
    lines.push("_none_");
  } else {
    lines.push("| Role | Count |");
    lines.push("|---|---|");
    for (const [r, n] of roles) lines.push(`| ${r} | ${n} |`);
  }
  lines.push("");

  lines.push("## Confidence distribution (this batch)");
  lines.push("");
  const confs = Object.entries(summary.conf_distribution).sort(
    (a, b) => b[1] - a[1]
  );
  if (confs.length === 0) {
    lines.push("_none_");
  } else {
    lines.push("| Confidence | Count |");
    lines.push("|---|---|");
    for (const [c, n] of confs) lines.push(`| ${c} | ${n} |`);
  }
  lines.push("");

  if (summary.notes.length > 0) {
    lines.push("## Notes / schema gaps");
    lines.push("");
    for (const n of summary.notes) lines.push(`- ${n}`);
    lines.push("");
  }

  lines.push("## Per-row log");
  lines.push("");
  lines.push(
    "| # | id | name | items | role | tier (existing → new) | confidence | action |"
  );
  lines.push("|---|---|---|---|---|---|---|---|");
  log.forEach((e, i) => {
    const name = (e.name ?? "").replace(/\|/g, "\\|").slice(0, 60);
    const role = e.role ?? "-";
    const tierE = e.tier_existing ?? "-";
    const tierN = e.tier_new ?? "-";
    const tierCol =
      e.action === "UPDATED"
        ? `T${tierE} → T${tierN}${e.override !== "keep" ? " OVERRIDE" : " keep"}`
        : "-";
    const items = e.item_count ?? "-";
    const conf = e.confidence ?? "-";
    lines.push(
      `| ${i + 1} | \`${e.id}\` | ${name} | ${items} | ${role} | ${tierCol} | ${conf} | ${e.action} |`
    );
  });
  lines.push("");

  if (summary.errors.length > 0) {
    lines.push("## Errors");
    lines.push("");
    for (const e of summary.errors) {
      lines.push(`- \`${e.id}\` (${e.name}): ${e.message}`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push(`HOLD — batch ${BATCH + 1} awaits operator approval`);
  lines.push("");
  return lines.join("\n");
}

mkdirSync(dirname(LOG_PATH), { recursive: true });
writeFileSync(LOG_PATH, md(), "utf8");

console.log("\n══ Batch summary ══");
console.log(JSON.stringify(summary, null, 2));
console.log(`\nFull log → ${LOG_PATH}`);
console.log(`\nHOLD — batch ${BATCH + 1} awaits operator approval`);
