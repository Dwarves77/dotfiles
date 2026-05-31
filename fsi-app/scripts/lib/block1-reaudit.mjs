// D3 Acceptance Test 2 — Block-1 re-audit by OUTCOME. READ-ONLY except SENTINEL rows
// it seeds + deletes. The real test: probe Block-1's provenance invariant for an
// UNKNOWN the prior (broken) verification missed — assert the live validate fn + trigger
// by OUTCOME (fresh read-back), not by "it ran".
//
// INTERPRETATION (operator-locked, the intuitive reading is backwards):
//   - D3 finds >=1 real unknown -> D3 WORKING (it surfaced the unasked). A found defect
//     is the PASS, not a failure.
//   - clean -> SUSPECT, never reassuring. Accept clean ONLY if the injected-defect panel
//     (one per requirement class) is ALL caught, AND with the BOUNDED verdict:
//     "clean to D3's probe depth; novel absence still uncovered." NEVER "clean".
//
// Method: seed a SENTINEL CRITICAL item, then violate ONE criterion, attempt the
// verified-flip, and assert it does NOT reach 'verified'. A violation that flips =
// a criterion silently unenforced = an UNKNOWN surfaced. A positive control (fully
// valid, all FACT claims ticked) MUST reach 'verified' — else the probe is vacuous.
import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { assertReadBack, findRawSourceFetch, VERDICT } from "./verify.mjs";
import { evalPredicate, DRIFT } from "./drift-check.mjs";
import { classifyPath } from "./surface-registry.mjs";
import { crossProduct } from "./exclusion-audit.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const REF = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const POOL = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const CONN = POOL.replace(`postgres.${REF}@`, `postgres.${REF}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);
const MARK = "SPRINT4_D3_TEST2";

const SLOTS = ["effective_date 2026-01-01", "primary_deadline 2026-06-30", "jurisdictional_scope European Union", "penalty_summary fines up to EUR 50000"];
const EXCERPT = "The regulation enters force on effective_date 2026-01-01. The headline primary_deadline 2026-06-30 governs. " +
  "The jurisdictional_scope European Union applies. The penalty_summary fines up to EUR 50000 may be levied.";

async function cleanup(c) {
  await c.query("DELETE FROM public.intelligence_items WHERE legacy_id LIKE $1", [`${MARK}%`]);
  await c.query("DELETE FROM public.sources WHERE name LIKE $1", [`${MARK}%`]);
}

// Seed a CRITICAL item. opts: { sourceStatus, sourceTier, groundingTier, slots, tick }.
async function seed(c, key, opts) {
  const o = { sourceStatus: "active", sourceTier: 1, groundingTier: 1, slots: SLOTS, tick: false, ...opts };
  const sid = `${MARK}_${key}_S`;
  const src = (await c.query(
    `INSERT INTO public.sources (name,url,description,tier,tier_at_creation,base_tier,effective_tier,status)
     VALUES ($1,$2,'t2 probe source',$3,$3,$3,$3,$4) RETURNING id`,
    [sid, `https://test2.example.gov/${key}`, o.sourceTier, o.sourceStatus])).rows[0].id;
  const url = `https://test2.example.gov/${key}`;
  const iid = (await c.query(
    `INSERT INTO public.intelligence_items (legacy_id,title,summary,domain,item_type,source_id,source_url,priority,status)
     VALUES ($1,$1,'t2 probe',1,'regulation',$2,$3,'CRITICAL','monitoring') RETURNING id`,
    [`${MARK}_${key}`, src, url])).rows[0].id;
  const sec = (await c.query(
    `INSERT INTO public.intelligence_item_sections (item_id,section_key,section_order,content_md,source_ids)
     VALUES ($1,'key_obligations',1,$2,$3) RETURNING id`,
    [iid, `Facts grounded. ${o.slots.join("; ")}. See ${url}.`, [src]])).rows[0].id;
  const srch = (await c.query(
    `INSERT INTO public.agent_run_searches (intelligence_item_id,search_query,result_url,result_title,result_index,result_content_excerpt,searched_at)
     VALUES ($1,'q',$2,'r',0,$3,NOW()) RETURNING id`, [iid, url, EXCERPT])).rows[0].id;
  for (const f of o.slots) {
    await c.query(
      `INSERT INTO public.section_claim_provenance (section_row_id,intelligence_item_id,claim_text,claim_kind,source_span,source_id,search_result_id,source_tier_at_grounding,verified_at)
       VALUES ($1,$2,$3,'FACT',$4,$5,$6,$7,$8)`,
      [sec, iid, f, f, src, srch, o.groundingTier, o.tick ? new Date().toISOString() : null]);
  }
  return iid;
}
const readStatus = async (c, iid) => (await c.query("SELECT provenance_status::text s FROM public.intelligence_items WHERE id=$1", [iid])).rows[0]?.s;

// One probe: seed (violating a criterion), attempt verified-flip, read back.
async function probe(c, key, opts, { mustReach }) {
  const iid = await seed(c, key, opts);
  await c.query("UPDATE public.intelligence_items SET provenance_status='verified' WHERE id=$1", [iid]);
  const after = await readStatus(c, iid);
  const reached = after === "verified";
  return { key, after, reached, mustReach };
}

async function main() {
  const c = new pg.Client({ connectionString: CONN });
  await c.connect();
  const findings = [];
  let positiveOk = false;
  try {
    await cleanup(c);
    console.log("=== Test 2 — Block-1 re-audit by OUTCOME (live validate fn + trigger) ===\n");

    // POSITIVE CONTROL — fully valid, all FACT claims ticked -> MUST reach verified.
    const pos = await probe(c, "valid", { tick: true }, { mustReach: true });
    positiveOk = pos.reached === true;
    console.log(`  [${positiveOk ? "OK" : "VACUOUS-FAIL"}] positive control (valid+ticked) -> ${pos.after} (must be verified)`);

    // CRITERION PROBES — each violates ONE criterion; a flip to verified = UNKNOWN found.
    const probes = [
      { key: "c6-unticked", opts: { tick: false }, crit: "C6 verification-aware (un-ticked FACT claims)" },
      { key: "c3-lowtier", opts: { tick: true, groundingTier: 5 }, crit: "C3 CRITICAL tier floor (grounded at tier 5, not 1/2)" },
      { key: "c1-inactive", opts: { tick: true, sourceStatus: "suspended" }, crit: "C1 validated source (source status=suspended)" },
      { key: "c5-missingslot", opts: { tick: true, slots: SLOTS.slice(0, 3) }, crit: "C5 required slots (only 3 of 4 slots)" },
    ];
    for (const p of probes) {
      const r = await probe(c, p.key, p.opts, { mustReach: false });
      const enforced = r.reached === false; // violation correctly blocked
      console.log(`  [${enforced ? "blocked" : "FLIPPED!"}] ${p.crit} -> ${r.after}`);
      if (!enforced) findings.push({ crit: p.crit, status: r.after, note: "violation reached 'verified' — criterion silently unenforced (UNKNOWN surfaced)" });
    }
  } finally {
    await cleanup(c);
    await c.end();
  }
  return { findings, positiveOk };
}

// INJECTED-DEFECT PANEL — only meaningful when criterion probes are clean. Inject one
// defect per requirement class; D3's general check for that class MUST catch it. This
// proves a clean result is real PROBE DEPTH, not blindness. If a class is NOT caught,
// that's a real gap -> living set, not papered over.
export async function injectedDefectPanel() {
  const r = {};
  // (a) proxy-pass: a mutation that reports success but persists a different value.
  r.proxyPass = (await assertReadBack("inj", async () => "pending_human_verify", "verified")).verdict === VERDICT.FAIL;
  // (b) un-enumerated surface: a defect in a worker path is enumerated (not invisible).
  r.surface = classifyPath("src/app/api/worker/injected/route.ts").includes("workers");
  // (c) exclusion-by-unreliable-method.
  r.exclusion = crossProduct([{ surface: "x", method: "plain-fetch-reachability", count: 1 }]).flagged.length === 1;
  // (drift) behavioral: a token in a comment, not actually called.
  r.behavioralDrift = evalPredicate("// browserlessRender here\nasync function f(){ return fetch(u); }", { kind: "calls", callee: "browserlessRender" }).verdict === DRIFT.DRIFTED;
  // negative control across the panel: a clean instance is NOT flagged (non-vacuous).
  r.negClean = findRawSourceFetch("const r = await browserlessRender(u);", { canonicalToken: "browserlessRender" }).length === 0;
  r.allCaught = r.proxyPass && r.surface && r.exclusion && r.behavioralDrift && r.negClean;
  // KNOWN class D3 does NOT catch (living set entry 1) — named, not hidden.
  r.uncaughtClasses = ["silent error-swallow (.select() drops error) — no general check; living-set entry 1"];
  return r;
}

export async function runBlock1Reaudit() {
  const res = await main();
  if (res.positiveOk && res.findings.length === 0) res.panel = await injectedDefectPanel();
  return res;
}

if (process.argv[1]?.endsWith("block1-reaudit.mjs")) {
  const res = await runBlock1Reaudit();
  console.log("");
  if (!res.positiveOk) { console.log("Test 2 ABORTED — positive control did not verify; probe vacuous, fix before trusting any 'blocked'."); process.exitCode = 1; }
  else if (res.findings.length > 0) {
    console.log(`Test 2 RESULT — D3 SURFACED ${res.findings.length} UNKNOWN(S) in Block 1 (each a WIN — the prior verification missed it):`);
    for (const f of res.findings) console.log(`   * ${f.crit}: ${f.note} (read-back: ${f.status})`);
    console.log("\nLocked interpretation: a found defect = D3 working. Real findings to triage, not test failures.");
    process.exitCode = 0;
  } else {
    const p = res.panel;
    console.log("Test 2 — criterion probes all BLOCKED (clean). Clean = SUSPECT, NOT reassuring. Running the probe-depth panel:");
    console.log(`   proxy-pass(a)=${p.proxyPass}  surface(b)=${p.surface}  exclusion(c)=${p.exclusion}  behavioral-drift=${p.behavioralDrift}  neg-control=${p.negClean}`);
    console.log(`   panel all-caught = ${p.allCaught}`);
    console.log(`   D3 does NOT catch: ${p.uncaughtClasses.join("; ")}`);
    if (!p.allCaught) { console.log("\nA requirement class is NOT caught -> real gap (living set), clean cannot be accepted."); process.exitCode = 1; }
    else {
      console.log("\nBOUNDED VERDICT: clean to D3's probe depth — provenance criteria C1/C3/C5/C6 enforced by OUTCOME");
      console.log("(positive control verifies; each violation blocked), and all 4 requirement-class injected defects caught.");
      console.log("RESIDUAL (uncovered): C2 citation + C4 labeling + the human-verify tick-flow runtime were NOT outcome-probed;");
      console.log("the silent error-swallow class (living-set entry 1) is uncaught; novel absence-shapes remain uncoverable.");
      console.log("This does NOT certify Block 1. It certifies: D3 looked THIS hard, found nothing, here is how hard, here is what it still cannot see.");
      process.exitCode = 0;
    }
  }
}
