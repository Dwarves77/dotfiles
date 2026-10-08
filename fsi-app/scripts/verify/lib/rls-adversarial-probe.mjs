// rls-adversarial-probe.mjs -- the ONE home for the transactional attack-probe primitives every
// per-table RLS adversarial audit uses (rule 15: a guard is proven by attack, not presence). Extracted
// (lane HARNESS-LANDING, 2026-09-27, F45 duplicate-code ratchet) from
// derivation-edges-rls-adversarial-audit.mjs (the SEC-1 template) once harness-runs-rls-adversarial-
// audit.mjs copied its `probe`/`classifyProbe` bodies near-verbatim and F45's live ratchet caught the
// duplication landing on the branch -- extract-the-shared-home-and-import-it, not a second copy.
//
// Each per-table audit still owns its own fixture setup, its own probe call list (the columns/SQL are
// table-specific), and its own CLI bootstrap message -- only the mechanical "run this inside
// BEGIN..ROLLBACK and classify the outcome" primitive is shared.

const DENY_SQLSTATE = "42501"; // insufficient_privilege

/** The binding assertion for a single probe: 'deny' expects SQLSTATE 42501 (insufficient_privilege);
 *  'allow' expects no error. Returns {ok, note}. Pure. */
function classifyProbe(expect, { errored, code }) {
  if (expect === "deny") {
    if (errored && code === DENY_SQLSTATE) return { ok: true, note: "" };
    if (errored) return { ok: false, note: `denied for the wrong reason (SQLSTATE ${code || "?"}), expected ${DENY_SQLSTATE}` };
    return { ok: false, note: "expected denial, write was allowed" };
  }
  if (!errored) return { ok: true, note: "" };
  return { ok: false, note: `unexpected denial: ${code || "?"}` };
}

/** The both-directions read assertion: service_role must see the fixture row it inserted (count === 1);
 *  anything else means the legitimate path is also broken, not merely the attack denied. */
export function classifyServiceRoleRead(count) {
  if (count === 1) return { ok: true, note: "" };
  return { ok: false, note: `service_role fixture read returned ${count} row(s), expected 1, legitimate path broken` };
}

/** Runs one probe inside BEGIN..ROLLBACK against `client`. `expect` is 'deny' | 'allow'. `pre` are
 *  statements (role/GUC setup) run inside the same transaction before `sql`. Always rolls back, no
 *  probe write persists regardless of verdict. Pushes {label, verdict, note} onto `results`. */
export async function probe(client, label, expect, sql, params, pre, results) {
  await client.query("BEGIN");
  try {
    for (const p of pre) await client.query(p);
    await client.query(sql, params);
    const verdict = classifyProbe(expect, { errored: false, code: null });
    results.push({ label, verdict: verdict.ok ? "PASS" : "FAIL", note: verdict.note });
  } catch (e) {
    if (e.code === DENY_SQLSTATE) {
      const verdict = classifyProbe(expect, { errored: true, code: e.code });
      results.push({ label, verdict: verdict.ok ? "PASS" : "FAIL", note: verdict.note });
    } else {
      results.push({ label, verdict: "ERROR", note: `${e.code || "?"}: ${(e.message || "").split("\n")[0]}` });
    }
  } finally {
    await client.query("ROLLBACK");
  }
}

/** The shared CLI bootstrap every per-table adversarial audit's `isMain` block runs: connect via
 *  pg-conn.mjs, call `runAudit(client)`, print results, map the outcome to the right exit code, always
 *  close the client. `runAudit` returns `{skip: true, reason}` or `{results, allPass}`, same shape every
 *  audit's own `runAudit` already produces. Exit 0 = every unauthorized probe denied and the legitimate
 *  path intact; exit 1 = a probe misbehaved; exit 2 = cannot verify (no creds, or self-skip reason). */
export async function runAdversarialCli({ title, runAudit }) {
  const { connectPg } = await import("../../lib/pg-conn.mjs");
  const client = await connectPg();
  if (!client) {
    console.error(`${title}: no direct-Postgres connection (SUPABASE_DB_URL/DATABASE_URL, local supabase link + SUPABASE_DB_PASSWORD, or NEXT_PUBLIC_SUPABASE_URL-derived pooler). Cannot verify, exit 2.`);
    process.exit(2);
  }
  try {
    const outcome = await runAudit(client);
    console.log(`──────── ${title} ────────`);
    if (outcome.skip) {
      console.log(`SKIP  ${outcome.reason}`);
      process.exit(2);
    }
    for (const r of outcome.results) console.log(`  ${r.verdict.padEnd(5)} ${r.label}${r.note ? "  -- " + r.note : ""}`);
    if (!outcome.allPass) {
      const failed = outcome.results.filter((r) => r.verdict !== "PASS").map((r) => r.label);
      console.log(`\n${title.toUpperCase()} FAIL: ${failed.join("; ")}`);
      process.exit(1);
    }
    console.log(`\n${title.toUpperCase()} GREEN: every unauthorized attack denied, service_role path intact.`);
    process.exit(0);
  } catch (e) {
    console.error(`${title}: engine error, ${e.message}`);
    process.exit(2);
  } finally {
    await client.end();
  }
}
