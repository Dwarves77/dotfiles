/** DATA-AUDIT LANE runner (CI-with-secrets / nightly). GOVERNING: remediation-discipline.
 *  Runs every live-data audit in sequence, captures pass/fail/error per audit, and exits non-zero if ANY
 *  HARD audit failed (so the scheduled job notifies). Each audit is its own process (isolation: one audit's
 *  DB hiccup or process.exit does not abort the lane). Honest reporting: prints each audit's verdict and a
 *  final summary. Secrets come from the environment (never echoed). Run locally with .env.local present.
 *
 *  AUDITS is DERIVED (plan 6.8, Rule A: a registry is a directory, never a list), not a hand-appended
 *  array: every audit script declares itself with a `// data-audit: label=<label> hard=<true|false>`
 *  marker as its first non-shebang comment line, and deriveAudits() scans scripts/verify/*.mjs plus the
 *  two audits that live directly under scripts/ (skill-conformance, holdings-audit, which are outside
 *  scripts/verify/, so a plan-6.8-literal scan of scripts/verify/ alone would silently drop them) for that
 *  marker. Two lanes adding an audit now add two files instead of both appending to this one array.
 *  isMainModule() gates the actual run (spawn every audit, reflect, exit) so importing deriveAudits() for
 *  a test does not spawn 34 child processes as a side effect. */
import { readdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { readClient, guardedUpdate, guardedInsert } from "../lib/db.mjs";
import { loadLocalEnvFile } from "../lib/env-file.mjs";
import { isMainModule } from "../lib/is-main.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");

// LAYER C — the data-audit BLOCK row convention (MUST match src/lib/agent/audit-gate.ts DATA_AUDIT_BLOCK).
// On RED the lane ensures ONE open integrity_flags row of this shape; on GREEN it resolves any open one.
// Generation preflight HALTS while an open block lacks a current dated waiver — so corpus red is cleared
// only by a fix (green here -> resolved) or an explicit waiver, NEVER by waiting. See docs/data-audit-dispositions.md.
const BLOCK = { category: "data_integrity", subject_type: "system", subject_ref: "data-audit-lane", created_by: "data-audit-lane" };
const BLOCK_CITE = { skill: "remediation-discipline", reason: "data-audit lane block-next-run reflect (Layer C teeth)" };
const blockDesc = (labels) =>
  `Data-audit lane RED (block-next-run): ${labels}. Generation is HALTED until this is dispositioned ` +
  `(fix -> green, or a dated waiver in docs/data-audit-dispositions.md + recommended_actions).`;

// Reflect the lane verdict into the block row. Idempotent: never opens a duplicate while one is open;
// resolves all open blocks on green. Writes go through the guarded db.mjs path (rule 015 + reversibility).
// Best-effort — a reflect failure (incl. no DB creds) must not change the lane's own verdict.
async function reflectBlockState(hardFailures) {
  let sb;
  try { sb = readClient(); } catch { console.log("[block-state] no DB creds — skipping integrity_flags reflect (verdict unaffected)."); return; }
  const { data: open, error } = await sb.from("integrity_flags").select("id")
    .eq("category", BLOCK.category).eq("subject_ref", BLOCK.subject_ref).eq("status", "open");
  if (error) { console.warn(`[block-state] read failed: ${error.message}`); return; }
  if (hardFailures.length) {
    const labels = hardFailures.map((r) => r.label).join(", ");
    if (open && open.length) {
      await guardedUpdate("integrity_flags", (qb) => qb.eq("id", open[0].id), { description: blockDesc(labels) }, { cite: BLOCK_CITE });
      console.log(`[block-state] RED — refreshed existing block ${open[0].id} (${labels}).`);
    } else {
      const ins = await guardedInsert("integrity_flags", {
        ...BLOCK, description: blockDesc(labels),
        recommended_actions: [{ action: "fix_then_green", rationale: `resolve the failing checks: ${labels}` }],
        status: "open",
      }, { cite: BLOCK_CITE });
      console.log(`[block-state] RED — opened block ${ins.inserted?.id ?? "?"} (${labels}).`);
    }
  } else if (open && open.length) {
    // fitness-allow: F39 (open is a singleton block-state row keyed by fixed (category, subject_ref) — 0-1 rows in practice)
    await guardedUpdate("integrity_flags", (qb) => qb.in("id", open.map((r) => r.id)), { status: "resolved" }, { cite: BLOCK_CITE });
    console.log(`[block-state] GREEN — resolved ${open.length} stale block(s); generation unblocked.`);
  } else {
    console.log("[block-state] GREEN — no open block; nothing to resolve.");
  }
}

// Directories scanned for the marker. scripts/verify/ per plan 6.8's own wording; scripts/ (top level
// only, readdirSync is not recursive) is ALSO scanned because two live audits (skill-conformance,
// holdings-audit) are not under scripts/verify/, so a scan of scripts/verify/ alone would silently drop
// them and break the "derived list equals today's list" proof this same plan requires.
const AUDIT_SCAN_DIRS = ["scripts/verify", "scripts"];
const MARKER_RE = /^\/\/ data-audit: label=(\S+) hard=(true|false)$/;

// absDir/displayPrefix split lets the test seam point at a temp fixture directory (an absolute path,
// reported under a fixture-chosen display prefix) without touching the real scripts/ tree; production
// always calls this with absDir = resolve(ROOT, dir) and displayPrefix = dir.
function scanDirForAudits(absDir, displayPrefix) {
  const out = [];
  let names;
  try { names = readdirSync(absDir); } catch { return out; }
  for (const name of names) {
    if (!name.endsWith(".mjs") || name.endsWith(".test.mjs")) continue;
    const rel = `${displayPrefix}/${name}`;
    let text;
    try { text = readFileSync(resolve(absDir, name), "utf8"); } catch { continue; }
    const markerLine = text.split("\n").find((l) => l.startsWith("// data-audit:"));
    if (!markerLine) continue;
    const m = markerLine.match(MARKER_RE);
    if (!m) throw new Error(`data-audit: malformed marker in ${rel}: "${markerLine}"`);
    out.push([m[1], rel, m[2] === "true"]);
  }
  return out;
}

/** Derive the AUDITS list (label, path relative to fsi-app, hard?) from every scanned script's own
 *  `// data-audit:` marker, sorted by label. Pure filesystem read, no spawn, safe to call from a test.
 *  `dirs` overrides the scan set for the test seam: an array of { abs, prefix } pairs; production omits
 *  it and scans AUDIT_SCAN_DIRS under the real repo root. */
export function deriveAudits(dirs = AUDIT_SCAN_DIRS.map((d) => ({ abs: resolve(ROOT, d), prefix: d }))) {
  const entries = dirs.flatMap(({ abs, prefix }) => scanDirForAudits(abs, prefix));
  const byLabel = new Map();
  for (const [label, rel] of entries) {
    if (byLabel.has(label)) {
      throw new Error(`data-audit: duplicate label "${label}" (${byLabel.get(label)} and ${rel})`);
    }
    byLabel.set(label, rel);
  }
  return entries.sort((a, b) => a[0].localeCompare(b[0]));
}

async function runLane() {
  // Load env for the block-state reflect (Layer C). In CI the secrets are injected into the env; locally
  // they live in .env.local. The child audits load it themselves; the runner needs it for the reflect.
  loadLocalEnvFile();
  const AUDITS = deriveAudits();
  const results = [];
  for (const [label, rel, hard] of AUDITS) {
    process.stdout.write(`\n-------- ${label} --------\n`);
    const r = spawnSync(process.execPath, [resolve(ROOT, rel)], { stdio: "inherit", env: process.env });
    const code = r.status == null ? 2 : r.status; // null => signal/crash
    results.push({ label, hard, code, verdict: code === 0 ? "PASS" : code === 1 ? "FAIL" : "ERROR" });
  }

  console.log("\n======== DATA-AUDIT LANE SUMMARY ========");
  for (const r of results) console.log(`  ${r.verdict.padEnd(5)} ${r.hard ? "[hard]" : "[soft]"} ${r.label}`);
  const hardFailures = results.filter((r) => r.hard && r.code !== 0);
  const softFailures = results.filter((r) => !r.hard && r.code !== 0);
  console.log(`\nhard failures/errors: ${hardFailures.length} | soft (informational): ${softFailures.length}`);

  // LAYER C teeth, reflecting the verdict into the block row so generation preflight can HALT on undisposed red.
  await reflectBlockState(hardFailures);

  if (hardFailures.length) { console.log(`LANE FAIL: ${hardFailures.map((r) => r.label).join(", ")}`); process.exit(1); }
  console.log("LANE GREEN: every hard data-audit passed.");
  process.exit(0);
}

// isMainModule() gate (plan 6.8, lane N1): only a direct `node run-data-audit-lane.mjs` invocation spawns
// the 34 audits; importing deriveAudits() from a test does not run the lane as a side effect.
if (isMainModule(import.meta.url)) {
  await runLane();
}
