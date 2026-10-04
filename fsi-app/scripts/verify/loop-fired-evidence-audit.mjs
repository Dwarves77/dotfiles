// data-audit: label=loop-fired-evidence hard=true
// loop-fired-evidence-audit.mjs (lane GATES-1, 2026-10-04). GOVERNING SKILL: remediation-discipline (CLAUDE.md
// rule 15: a guard is proven by attack, not by presence).
//
// F50 now accepts fsi-app/.discipline/governance/loop-fired-evidence.json as proof that a loop hop fired. A
// committed file is only as honest as its author, so this audit is the attack on it: EVERY entry must match a
// real `harness_runs` row (same run id, same trigger, same family, same github run id, same upstream run id,
// same started_at). A forged entry (a hop claimed fired with no row), a stale entry (a row since removed) or an
// edited field fails the lane. An empty evidence file proves nothing and passes without touching the database.
//
// Exit 0 = every entry matches a live row (or there are no entries). Exit 1 = at least one entry does not.
// Exit 2 = cannot verify (no credentials, read error), diagnosable and never a false green.
// The DB client is loaded with a dynamic import inside runAudit(); the exporter it imports for the shared
// column list reaches scripts/lib/db.mjs, which resolves supabase lazily, so the no-npm suite still imports this.
import { readFileSync } from "node:fs";
import { loadLocalEnvFile } from "../lib/env-file.mjs";
import { isMainModule } from "../lib/is-main.mjs";
import { HARNESS_RUN_COLUMNS } from "./export-loop-fired-evidence.mjs"; // the one column list both read
import { LOOP_FIRED_EVIDENCE_FILE, FIRED_TRIGGERS } from "../../.discipline/governance/loop-manifest.mjs";

const text = (v) => (v === null || v === undefined ? null : String(v));

/**
 * Compare committed entries to live rows. PURE.
 * @param {object[]} entries @param {object[]} rows harness_runs rows (any superset of the entries' run ids)
 * @returns {{ok: boolean, failures: string[]}}
 */
export function auditEntries(entries, rows) {
  const failures = [];
  const byRunId = new Map((rows || []).map((r) => [String(r.run_id), r]));
  for (const e of entries) {
    const label = `${e?.hop ?? "?"} (${e?.run_id ?? "?"})`;
    if (!FIRED_TRIGGERS.includes(e?.trigger)) {
      failures.push(`${label}: trigger "${e?.trigger}" is not a fired trigger (${FIRED_TRIGGERS.join(", ")})`);
      continue;
    }
    const row = byRunId.get(String(e.run_id));
    if (!row) {
      failures.push(`${label}: no harness_runs row with run_id ${e.run_id} (forged or stale entry)`);
      continue;
    }
    const checks = [
      ["trigger", row.trigger, e.trigger],
      ["family", row.harness_family, e.family],
      ["github_run_id", text(row.github_run_id), text(e.github_run_id)],
      ["upstream_run_id", text(row.upstream_run_id), text(e.upstream_run_id)],
    ];
    for (const [field, live, claimed] of checks) {
      if (live !== claimed) failures.push(`${label}: ${field} is ${JSON.stringify(live)} in harness_runs, entry claims ${JSON.stringify(claimed)}`);
    }
    if (Date.parse(row.started_at) !== Date.parse(e.started_at)) {
      failures.push(`${label}: started_at is ${row.started_at} in harness_runs, entry claims ${e.started_at}`);
    }
  }
  return { ok: failures.length === 0, failures };
}

/** Read the committed evidence file. Returns {entries} or {error}. @param {(p: string, enc: string) => string} [readFn] */
export function readEvidenceFile(path = LOOP_FIRED_EVIDENCE_FILE, readFn = readFileSync) {
  try {
    const parsed = JSON.parse(readFn(path, "utf8"));
    if (!Array.isArray(parsed?.entries)) return { error: "evidence file has no entries array" };
    return { entries: parsed.entries };
  } catch (e) {
    return { error: `could not read/parse the evidence file: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * @param {{log?: Function, errorLog?: Function, loadEnv?: Function, readAllFn?: Function, readFn?: Function,
 *   hasCreds?: () => boolean, path?: string}} [deps]
 * @returns {Promise<number>}
 */
export async function runAudit(deps = {}) {
  const {
    log = (m) => console.log(m),
    errorLog = (m) => console.error(m),
    loadEnv = loadLocalEnvFile,
    readAllFn = null,
    readFn = readFileSync,
    hasCreds = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    path = LOOP_FIRED_EVIDENCE_FILE,
  } = deps;
  const file = readEvidenceFile(path, readFn);
  if (file.error) {
    errorLog(`loop-fired-evidence-audit: ${file.error}`);
    return 1; // a corrupt committed file is a real failure, never a skip
  }
  if (file.entries.length === 0) {
    log("loop-fired-evidence-audit: no entries, nothing to verify. PASS");
    return 0;
  }
  loadEnv();
  if (!hasCreds()) {
    errorLog("loop-fired-evidence-audit: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set -- self-skip (rule 15).");
    return 2;
  }
  let rows;
  try {
    const read = readAllFn ?? (await import("../lib/db.mjs")).readAll;
    rows = await read("harness_runs", HARNESS_RUN_COLUMNS);
  } catch (e) {
    errorLog(`loop-fired-evidence-audit: read failed: ${e instanceof Error ? e.message : String(e)}`);
    return 2;
  }
  const { ok, failures } = auditEntries(file.entries, rows);
  log(`loop-fired-evidence-audit: ${file.entries.length} entr${file.entries.length === 1 ? "y" : "ies"} checked against ${rows.length} harness_runs row(s).`);
  for (const f of failures) log(`  FAIL ${f}`);
  log(ok ? "loop-fired-evidence-audit: PASS" : "loop-fired-evidence-audit: FAIL");
  return ok ? 0 : 1;
}

if (isMainModule(import.meta.url)) {
  runAudit().then((code) => process.exit(code));
}
