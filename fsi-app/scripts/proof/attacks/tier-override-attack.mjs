// tier-override-attack.mjs -- the automatic-writer attack on sources.tier_override (lane PROOF-4, 2026-10-07).
//
// Operator ruling (lane G7-TIER, 2026-10-05): an automatic writer never writes over an admin tier override. The
// unit-level proof (scripts/maintenance/tier-override-attack.npmtest.mjs) uses a fake PostgREST. This is the same
// invariant against the REAL schema and the REAL writer: recompute-tiers.mjs is run in apply mode against the local
// stack, over two real sources that carry identical evidence strong enough to move a tier, one with an admin
// override and one without.
//
//   control source   (no override)  MUST move: otherwise the evidence proves nothing and the attack is NOT EXERCISED;
//   overridden source               MUST keep base_tier, effective_tier and tier_override exactly as seeded, MUST have
//                                   been seen by the planner as held (summary counts.override_held >= 1), and MUST have
//                                   no audit event written for a move that did not happen.
//
// This attack persists writes to the local database (the writer commits through PostgREST, so a rollback cannot wrap
// it): the two sources are snapshotted before seeding and restored from the snapshot afterwards, also on failure.
// Other sources the run moves are left as the writer left them: the stack is disposable.
// Evidence used (the same fixture the unit proof asserts moves a base tier 4 source): conflict_count 3 of conflict_total
// 5 fires the high_conflict_rate demotion trigger; every promotion input is zeroed so nothing pulls the other way.

import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const NODE = process.execPath;
const RUNNER = "scripts/maintenance/recompute-tiers.mjs";

/** Column -> SQL expression for the seeding statement. The same list drives the restore. */
const SEED = Object.freeze({
  base_tier: "4",
  effective_tier: "NULL",
  status: "'active'",
  processing_paused: "false",
  confirmation_count: "0",
  conflict_count: "3",
  conflict_total: "5",
  accuracy_rate: "1",
  accessibility_rate: "1",
  total_checks: "3",
  successful_checks: "3",
  lead_time_samples: "0",
  avg_lead_time_days: "0",
  independent_citers: "0",
  highest_citing_tier: "NULL",
  total_citations: "0",
  self_citation_count: "0",
  last_checked: "now() - interval '1 day'",
  last_accessible: "now() - interval '1 day'",
  last_substantive_change: "now() - interval '1 day'",
  update_frequency: "'ad-hoc'",
  tier_override: "CASE WHEN id = $2::uuid THEN 2 ELSE NULL END",
  override_reason: "CASE WHEN id = $2::uuid THEN 'proof4 attack fixture' ELSE NULL END",
  override_date: "CASE WHEN id = $2::uuid THEN now() ELSE NULL END",
});

const SEED_SQL = `UPDATE public.sources SET ${Object.entries(SEED).map(([c, e]) => `${c} = ${e}`).join(", ")} WHERE id = ANY(ARRAY[$1::uuid, $2::uuid])`;
const RESTORE_SQL = `UPDATE public.sources s SET ${Object.keys(SEED).map((c) => `${c} = r.${c}`).join(", ")} FROM jsonb_populate_record(NULL::public.sources, $2::jsonb) r WHERE s.id = $1::uuid`;
const READBACK_SQL = "SELECT id, base_tier, effective_tier, tier_override FROM public.sources WHERE id = ANY($1::uuid[])";

const byId = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]));
const same = (a, b) => ["base_tier", "effective_tier", "tier_override"].every((k) => a[k] === b[k]);

/** Run the attack. Returns { status, observed }. Every dependency is injectable. */
export async function runTierOverrideAttack({
  client, cwd, env,
  spawn = spawnSync,
  readJson = (p) => JSON.parse(readFileSync(p, "utf8")),
  makeTempDir = () => mkdtempSync(join(tmpdir(), "proof4-tier-")),
  echo = (s) => process.stdout.write(s),
}) {
  const pick = await client.query(
    "SELECT id FROM public.sources WHERE status = 'active' AND tier_override IS NULL AND processing_paused = false ORDER BY id LIMIT 2",
  );
  if (pick.rows.length < 2) {
    return { status: "fail", observed: `not exercised: ${pick.rows.length} usable active source(s) without an override, two are needed` };
  }
  const [control, overridden] = pick.rows.map((r) => r.id);
  const ids = [control, overridden];

  const snap = await client.query("SELECT id, to_jsonb(s) AS snapshot FROM public.sources s WHERE id = ANY($1::uuid[])", [ids]);
  const snapshots = byId(snap.rows);

  const startedAt = new Date(Date.now() - 60_000).toISOString();
  let result;
  try {
    await client.query(SEED_SQL, [control, overridden]);
    const before = byId((await client.query(READBACK_SQL, [ids])).rows);

    const outDir = makeTempDir();
    const run = spawn(NODE, [RUNNER, "--mode", "apply", "--out", outDir], { cwd, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    if (run.stdout) echo(String(run.stdout));
    if (run.error || run.status !== 0) {
      result = { status: "fail", observed: `recompute-tiers did not complete: exit=${run.error ? "could-not-start" : run.status}` };
    } else {
      const summary = readJson(join(outDir, "summary.json"));
      const after = byId((await client.query(READBACK_SQL, [ids])).rows);
      const events = (await client.query(
        "SELECT count(*)::int AS n FROM public.source_trust_events WHERE source_id = $1::uuid AND created_at >= $2::timestamptz",
        [overridden, startedAt],
      )).rows[0]?.n ?? 0;

      const problems = [];
      const moved = after[control]?.effective_tier != null && after[control].effective_tier !== before[control]?.effective_tier;
      if (!moved) problems.push("not exercised: the control source (same evidence, no override) did not move, so the attack proves nothing");
      if (!after[overridden] || !same(before[overridden], after[overridden])) problems.push("override source changed (base_tier, effective_tier or tier_override differs from the seeded values)");
      if (events !== 0) problems.push(`${events} audit event(s) written for the override source`);
      if (!((summary?.counts?.override_held ?? 0) >= 1)) problems.push("the planner reported override_held 0: the run never saw the override");
      result = problems.length
        ? { status: "fail", observed: problems.join("; ") }
        : { status: "pass", observed: `control moved; override source unchanged; override_held=${summary.counts.override_held}; override_skipped=${summary.read_back?.override_skipped ?? 0}; events for the override source=0` };
    }
  } catch (e) {
    result = { status: "fail", observed: `engine error: ${String(e.message).split("\n")[0].slice(0, 120)}` };
  } finally {
    for (const id of ids) {
      if (!snapshots[id]) continue; // never restore from nothing: that would null the columns
      try { await client.query(RESTORE_SQL, [id, JSON.stringify(snapshots[id].snapshot)]); } catch { /* the stack is disposable */ }
    }
  }
  return result;
}
