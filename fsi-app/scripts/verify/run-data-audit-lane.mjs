/** DATA-AUDIT LANE runner (CI-with-secrets / nightly). GOVERNING: remediation-discipline.
 *  Runs every live-data audit in sequence, captures pass/fail/error per audit, and exits non-zero if ANY
 *  HARD audit failed (so the scheduled job notifies). Each audit is its own process (isolation: one audit's
 *  DB hiccup or process.exit does not abort the lane). Honest reporting: prints each audit's verdict and a
 *  final summary. Secrets come from the environment (never echoed). Run locally with .env.local present. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { readClient, guardedUpdate, guardedInsert } from "../lib/db.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
// Load env for the block-state reflect (Layer C). In CI the secrets are injected into the env; locally
// they live in .env.local. The child audits load it themselves; the runner needs it for the reflect.
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env already populated */ }

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

// each: [label, scriptPath relative to fsi-app, hard?] — hard audits fail the lane; soft are informational
const AUDITS = [
  ["one-tier-per-host", "scripts/verify/one-tier-per-host-audit.mjs", true],
  ["claims-tier", "scripts/verify/claims-tier-audit.mjs", true],
  ["substrate-agreement", "scripts/verify/substrate-agreement-audit.mjs", true],
  ["ledger-onepass", "scripts/verify/ledger-onepass-audit.mjs", true],
  ["vocab-sync", "scripts/verify/vocab-sync-audit.mjs", true],
  ["orphan-source", "scripts/verify/orphan-source-audit.mjs", true],
  ["quarantine-disposition", "scripts/verify/quarantine-disposition-audit.mjs", true],
  ["unregistered-span-host", "scripts/verify/unregistered-span-host-audit.mjs", true],
  ["schema-drift", "scripts/verify/schema-drift-audit.mjs", true],
  // ADVERSARIAL PROOFS — attack a security-critical invariant and require the attack to fail.
  // (Class-4 fix, 2026-08-09: presence checks passed on the mig-118 guard that was one set_config
  // call from defeat; a security invariant is proven by attacking it, not by asserting it exists.)
  ["prov-guard-adversarial", "scripts/verify/prov-guard-adversarial-audit.mjs", true],
  // Spec09 org-scope cross-org RLS proof (lane MIG311-FIX, 2026-09-05): the adversarial proof migration
  // 311 could not run inline (its fixture inserts violate live FKs added since — org_memberships_user_id_
  // fkey -> profiles(id), migration 075; surcharge_audits FKs -> entities(entity_id), migration 296) now
  // runs here instead, against live orgs/entities, re-attacked on every lane pass. See that file's header.
  ["spec09-org-rls-adversarial", "scripts/verify/spec09-org-rls-adversarial-audit.mjs", true],
  // REGISTRY-CITED AUDITS previously ABSENT from this lane (2026-08-09 wiring-truth sweep, Decision 2):
  // each is an `audit:` enforcer of a live invariant in .discipline/governance/invariants.mjs but was
  // never in the run list — cited-as-enforcement yet never executed. Now wired. Each self-skips (exit 2)
  // without DB creds and runs for real in the secrets lane (this job does `npm ci` + injects the three
  // secrets). CORRECTION (2026-08-11, lane diagnosis): "runs for real in the secrets lane" was FALSE for
  // the five pg-direct audits from the day they were wired — their connection logic wanted local
  // `supabase link` artifacts or env vars the workflow never supplied, so they exited 2 on every run.
  // Fixed by scripts/lib/pg-conn.mjs (shared resolver: the lane's own secrets now yield a connection);
  // an exit 2 here is once again an honest cannot-verify, not a standing wiring hole.
  // A red here is a genuine corpus/schema violation to fix — the mechanism working — not a wiring error.
  ["canonical-key-uniqueness", "scripts/verify/canonical-key-uniqueness.mjs", true],
  ["column-existence-parity", "scripts/verify/column-existence-parity.mjs", true],
  ["deferral-hygiene", "scripts/verify/deferral-hygiene-audit.mjs", true],
  ["flag-age", "scripts/verify/flag-age-audit.mjs", true],
  ["format-structure", "scripts/verify/format-structure.mjs", true],
  ["no-generic-source", "scripts/verify/no-generic-source-audit.mjs", true],
  ["no-names", "scripts/verify/no-names.mjs", true],
  ["pause-flag-guard-proof", "scripts/verify/pause-flag-guard-proof.mjs", true],
  ["rls-credential-parity", "scripts/verify/rls-credential-parity.mjs", true],
  ["routing", "scripts/verify/routing.mjs", true],
  ["source-link", "scripts/verify/source-link-audit.mjs", true],
  ["source-vs-item", "scripts/verify/source-vs-item.mjs", true],
  ["staged-transit", "scripts/verify/staged-transit-audit.mjs", true],
  ["skill-conformance", "scripts/audit-skill-conformance.mjs", false],
  // ADR-014 wave-acceptance sampling, wired here 2026-09-05 (lane W71-A) resolving the ADR's own
  // "not wired" status note — SOFT (informational): the escalation threshold it computes (§4, >10%
  // accuracy-defect) requires the LIVE L2/L3 Chrome pass this mechanical pre-scan cannot perform, so a
  // red here is a signal for operator review, never a build-blocking verdict on its own. Self-skips
  // (exit 2) without SUPABASE_URL/SERVICE_ROLE_KEY, same convention as every other audit above.
  ["wave-acceptance", "scripts/verify/wave-acceptance-audit.mjs", false],
  // Lane ONESHOTS (2026-09-06, F25 expiry-52 disposition): holdings-audit.mjs — read-only classification
  // of every stored capture (operator dispatch 2026-07-14), $0, no LLM/Browserless. Had NO dispatch root
  // anywhere (hand-run only); shared-dataset-ownership.md's own line already flags the 2026-07-14
  // dispatch's write TO-VERIFY (the idempotent-once guard on holdings_quality makes absence of a prior
  // run ambiguous, not disprovable). Wired here SOFT/informational — this registration runs the script's
  // own default DRY/report path only (never --write from this lane, same "report, never auto-persist"
  // posture as wave-acceptance above): a red here is a corpus-quality signal for operator review, not a
  // build-blocking verdict. Self-skips (exit 2) without SUPABASE_URL/SERVICE_ROLE_KEY, same convention as
  // every other audit above.
  ["holdings-audit", "scripts/holdings-audit.mjs", false],
  // P6 (2026-09-06, lane UX-FIX): Map mode-tag (transport_modes) editorial coverage tracking.
  // SOFT — a human editorial backlog (no deterministic classifier exists to auto-tag these; see
  // that file's header), never a build-blocking verdict. Self-skips (exit 2) without creds.
  ["mode-tag-coverage", "scripts/verify/mode-tag-coverage-audit.mjs", false],
  // Lane F25-WAVE52 (2026-09-07): three scripts/verify/ files carried an F25 module-liveness expiry
  // (wave52) with zero dispatch root anywhere. Disposition per docs/audits/f25-wave52-dispositions-2026-09-07.md
  // — all three are recurring live-corpus checks (a fresh item can trip any of them at any time), not
  // closed one-shots, so they are WIRED here rather than deleted.
  //
  // admin-phrase-scan.mjs — SOFT review signal (Unit 0c Part 4, operator ruling 2026-07-13): admin/
  // profile JSX can re-introduce human-gate framing (RD-20) any time a new component is added. Always
  // exits 0 (own header: "SOFT — never fails the build"), no DB creds needed — filesystem only.
  ["admin-phrase-scan", "scripts/verify/admin-phrase-scan.mjs", false],
  // defect-signature-scan.mjs — heuristic S-CONFLATE/S-NUMERIC triage (ground-truth verification unit,
  // 2026-07-15/ADR-014) over FACT claims. Bare invocation now defaults its frame to `--since 24h ago`
  // (this lane's own fix, resolveFrame()'s new default branch) — the same practical wave-boundary proxy
  // wave-acceptance-audit.mjs already uses two lines above. SOFT: a hit means "hold for live
  // verification", never a build-blocking verdict on its own (own header). Self-skips (exit 2) without
  // SUPABASE_URL/SERVICE_ROLE_KEY.
  ["defect-signature-scan", "scripts/verify/defect-signature-scan.mjs", false],
  // surface-visibility-audit.mjs — the "verified item hidden from its surface" invariant (PPWR
  // incident, 2026-07-08): a live item can be minted with a null/mis-set domain at any time, so this is
  // a standing net, not a discharged one-shot (full-read-2026-08-31/L13-scripts-A.md finding #5 flagged
  // it as the one write-capable audit in scripts/verify/ with no automated caller). SOFT — opens
  // integrity_flags rows for operator review, never fails the lane on its own. Self-skips (exit 2)
  // without NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY.
  ["surface-visibility", "scripts/verify/surface-visibility-audit.mjs", false],
];

const results = [];
for (const [label, rel, hard] of AUDITS) {
  process.stdout.write(`\n──────── ${label} ────────\n`);
  const r = spawnSync(process.execPath, [resolve(ROOT, rel)], { stdio: "inherit", env: process.env });
  const code = r.status == null ? 2 : r.status; // null => signal/crash
  results.push({ label, hard, code, verdict: code === 0 ? "PASS" : code === 1 ? "FAIL" : "ERROR" });
}

console.log("\n════════ DATA-AUDIT LANE SUMMARY ════════");
for (const r of results) console.log(`  ${r.verdict.padEnd(5)} ${r.hard ? "[hard]" : "[soft]"} ${r.label}`);
const hardFailures = results.filter((r) => r.hard && r.code !== 0);
const softFailures = results.filter((r) => !r.hard && r.code !== 0);
console.log(`\nhard failures/errors: ${hardFailures.length} | soft (informational): ${softFailures.length}`);

// LAYER C teeth — reflect the verdict into the block row so generation preflight can HALT on undisposed red.
await reflectBlockState(hardFailures);

if (hardFailures.length) { console.log(`LANE FAIL: ${hardFailures.map((r) => r.label).join(", ")}`); process.exit(1); }
console.log("LANE GREEN: every hard data-audit passed.");
process.exit(0);
