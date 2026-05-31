// D3 section 3 — full decision-log audit LAYER 3 (real run over the live log). READ-ONLY.
//
// Runs every decision-log anchor against live code + DB. Acceptance (operator):
//   - EVERY row (1..47) anchored + a verdict (no row unaccounted).
//   - the no-glyph anchor (#1) now reports IMPLEMENTED — the caught->fixed->re-clean
//     loop closed (its L3 is a GENUINE in-the-wild catch, stronger than synthetic).
//   - PENDING obligations QUIET now (triggers not met) AND wired: forcing the trigger
//     with the anchor still absent -> PENDING_VIOLATION (loud). Confirms #43 (Phase-2
//     binding) and #38 (HC3 cap) go loud at the right moment, not forgotten.
//   - the only LOUD verdicts are the expected UNCONFIRMABLE rows (#2/#39/#41); any
//     unexpected DRIFTED is surfaced for review (real drift or a predicate to fix).
import pg from "pg";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { VERDICT, LOUD, ANCHORS, loadContext, evaluateAll, evaluateAnchor, resolveVerdict } from "./decision-anchors.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const REF = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const POOL = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const CONN = POOL.replace(`postgres.${REF}@`, `postgres.${REF}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);
const BRANCH = execSync("git rev-parse --abbrev-ref HEAD", { cwd: ROOT }).toString().trim();

let fails = 0;
const ok = (label, cond, detail = "") => { console.log(`  [${cond ? "OK" : "FAIL"}] ${label}${detail ? " — " + detail : ""}`); if (!cond) fails++; };

console.log(`=== section 3 decision-log audit L3 — all ${new Set(ANCHORS.map(a => a.row)).size} rows, live (branch: ${BRANCH}) ===\n`);

const c = new pg.Client({ connectionString: CONN });
await c.connect();
let results, ctx;
try {
  ctx = await loadContext(c, ROOT, BRANCH);
  results = await evaluateAll(ctx);

  // verdict distribution
  const dist = {};
  for (const r of results) dist[r.verdict] = (dist[r.verdict] || 0) + 1;
  console.log("VERDICT DISTRIBUTION:", JSON.stringify(dist));
  console.log(`(observables: flipped=${ctx.signals.flippedCount} gatedGen=${ctx.signals.gatedGenCount} scp=${ctx.signals.scpCount} glyphInNewCode=${ctx.signals.glyphInNewCode} integrityFlags=${ctx.signals.integrityFlagCount})\n`);

  // LOUD verdicts (what a reader must look at)
  const loud = results.filter((r) => r.loud);
  console.log(`LOUD verdicts (${loud.length}):`);
  for (const r of loud) console.log(`  ! row ${r.row} [${r.verdict}] ${r.short}${r.why ? " — " + r.why : ""}`);

  // PENDING (quiet now)
  const pend = results.filter((r) => r.verdict === VERDICT.PENDING);
  console.log(`\nPENDING (quiet — correctly absent, trigger not met) (${pend.length}):`);
  for (const r of pend) console.log(`  ~ row ${r.row} [trigger=${r.trigger}] ${r.short}`);

  // ── acceptance assertions ──
  console.log("");
  // 1. coverage: every doc row 1..47 anchored
  const rowsCovered = new Set(results.map((r) => r.row));
  const missing = Array.from({ length: 47 }, (_, i) => i + 1).filter((n) => !rowsCovered.has(n));
  ok("coverage: every decision-log row 1..47 has an anchor + verdict", missing.length === 0, missing.length ? `missing rows: ${missing.join(",")}` : "47/47");

  // 2. no-glyph loop closed
  const r1 = results.find((r) => r.row === 1);
  ok("no-glyph anchor (#1) now IMPLEMENTED (caught->fixed->re-clean loop closed)", r1.verdict === VERDICT.IMPLEMENTED, `glyphInNewCode=${ctx.signals.glyphInNewCode}`);

  // 3. no evaluation errors
  ok("no anchor evaluation errors", !(ctx._errs && ctx._errs.length), ctx._errs ? ctx._errs.join(" | ") : "");

  // 4. PENDING anchors quiet now (all four)
  const pendingAnchors = ANCHORS.filter((a) => a.kind === "pending");
  ok("all PENDING obligations quiet now (triggers not met)", pend.length === pendingAnchors.length, `${pend.length}/${pendingAnchors.length}`);

  // 5. wiring: each PENDING goes LOUD (PENDING_VIOLATION) if its trigger fires while still absent
  let wired = 0;
  for (const a of pendingAnchors) {
    const present = await a.present(ctx);            // actual (false now)
    const forced = resolveVerdict({ kind: "pending", triggerMet: true, present });
    const goesLoud = present ? forced === VERDICT.IMPLEMENTED : forced === VERDICT.PENDING_VIOLATION && LOUD.has(forced);
    if (goesLoud) wired++;
    console.log(`  wiring: row ${a.row} [${a.trigger}] present=${present} -> on-trigger=${forced}`);
  }
  ok("every PENDING is WIRED — fires loud (or implemented) the moment its trigger is met", wired === pendingAnchors.length, `${wired}/${pendingAnchors.length}`);
  // spotlight the two operator-critical ones
  const phase2Binding = pendingAnchors.find((a) => a.row === 43);
  const hc3Cap = pendingAnchors.find((a) => a.row === 38);
  ok("#43 Phase-2 service-role binding will go LOUD at Phase-2 (not forgotten)", resolveVerdict({ kind: "pending", triggerMet: true, present: await phase2Binding.present(ctx) }) === VERDICT.PENDING_VIOLATION);
  ok("#38 HC3 spend-cap reconstitution will go LOUD at Phase-4 (not forgotten)", resolveVerdict({ kind: "pending", triggerMet: true, present: await hc3Cap.present(ctx) }) === VERDICT.PENDING_VIOLATION);

  // 6. only-expected LOUD: UNCONFIRMABLE on #2/#39/#41; no unexpected DRIFTED
  const drifted = results.filter((r) => r.verdict === VERDICT.DRIFTED);
  ok("no unexpected DRIFTED code/schema anchors (Block-1 decisions hold)", drifted.length === 0, drifted.map((r) => `row ${r.row}:${r.short}`).join(" | "));
  const unconf = new Set(results.filter((r) => r.verdict === VERDICT.UNCONFIRMABLE).map((r) => r.row));
  ok("UNCONFIRMABLE is exactly the expected set {2,39,41}", unconf.size === 3 && [2, 39, 41].every((n) => unconf.has(n)), [...unconf].join(","));
} finally {
  await c.end();
}

console.log(`\n${fails === 0
  ? "section 3 decision-log audit L3 PASS — 47/47 anchored; #1 caught->fixed->IMPLEMENTED; 4 PENDINGs quiet + wired to fire loud at Phase-2/Phase-4; only the expected UNCONFIRMABLE rows are loud; no unexpected drift."
  : fails + " section 3 L3 FAILURE(S)"}`);
process.exitCode = fails === 0 ? 0 : 1;
