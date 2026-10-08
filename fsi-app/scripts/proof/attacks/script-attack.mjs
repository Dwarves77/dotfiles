// script-attack.mjs -- the two non-SQL-step attack kinds of the chain-proof attack suite (lane PROOF-4, 2026-10-07).
//
//   kind "script"     CALLS an existing adversarial audit or proof (scripts/verify/*-adversarial-audit.mjs,
//                     pause-flag-guard-proof.mjs, prov-guard-adversarial-audit.mjs) as a child process against the
//                     local stack. They are called, never copied. The audit's exit code must be the expected one, every
//                     required verdict line must be present, and no forbidden verdict line may appear. A required line
//                     is how "exit 0 without having run the attack" (every probe SKIPped) is made RED: prov-guard
//                     exits 0 when no quarantined row exists and prints SKIP, which proves nothing.
//   kind "sql-block"  re-runs a self-check DO block that a migration carries (migration 356's correction-layer
//                     self-check) on the LOADED data, inside a transaction that is rolled back. The block attacks the
//                     layer itself and raises on a defect; it skips (NOTICE) any step whose fixture row is absent,
//                     which is why it passed vacuously on an empty replay and has to be re-run after the subset load.
//
// The report records pattern labels, counts and an exit code. It never records an audit's raw output (the audits
// print notes built from database text); the output is echoed to the job log, exactly as in the data-audit lane.

import { spawnSync } from "node:child_process";

const NODE = process.execPath;

/** Run an existing audit as a child process and judge it. `spawn` and `echo` are injectable. */
export function runScriptAttack({ attack, spawn = spawnSync, cwd, env, echo = (s) => process.stdout.write(s) }) {
  const r = spawn(NODE, [attack.script, ...(attack.args ?? [])], { cwd, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.error) return { status: "fail", observed: `could not start ${attack.script}: ${String(r.error.message).split("\n")[0]}` };
  const stdout = String(r.stdout ?? "");
  if (stdout) echo(stdout.endsWith("\n") ? stdout : stdout + "\n");
  if (r.stderr) echo(String(r.stderr));

  const wantExit = attack.expect_exit ?? 0;
  const exitOk = r.status === wantExit;
  const required = attack.require ?? [];
  const forbidden = attack.forbid ?? [];
  const missing = required.filter((q) => !new RegExp(q.pattern, "m").test(stdout)).map((q) => q.label);
  const hit = forbidden.filter((q) => new RegExp(q.pattern, "m").test(stdout)).map((q) => q.label);

  const parts = [`exit=${r.status}`, `required ${required.length - missing.length}/${required.length}`];
  if (missing.length) parts.push(`missing: ${missing.join("; ")}`);
  if (hit.length) parts.push(`forbidden line present: ${hit.join("; ")}`);
  const ok = exitOk && missing.length === 0 && hit.length === 0;
  return { status: ok ? "pass" : "fail", observed: parts.join(", ") };
}

/** The text of one DO block between two markers, inclusive. PURE. Throws when a marker is absent. */
export function extractDoBlock(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  if (start === -1) throw new Error(`start marker not found: ${startMarker}`);
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (end === -1) throw new Error(`end marker not found: ${endMarker}`);
  return text.slice(start, end + endMarker.length);
}

/** Re-run a migration's self-check block on the loaded data, rolled back. `readFile` is injectable. */
export async function runSqlBlockAttack({ client, attack, readFile }) {
  const block = extractDoBlock(readFile(attack.file), attack.start_marker, attack.end_marker);
  const notices = [];
  const onNotice = (n) => notices.push(String(n?.message ?? n));
  client.on?.("notice", onNotice);
  let error = null;
  await client.query("BEGIN");
  try {
    await client.query(block);
  } catch (e) {
    error = e;
  } finally {
    await client.query("ROLLBACK");
    client.removeListener?.("notice", onNotice);
  }
  if (error) return { status: "fail", observed: `the block raised ${error.code ?? "no code"}: ${String(error.message).split("\n")[0].slice(0, 120)}` };
  if (!notices.some((n) => n.includes(attack.require_notice))) {
    return { status: "fail", observed: `the block raised nothing but the pass notice "${attack.require_notice}" was not reported` };
  }
  const skipped = notices.filter((n) => /skipped/i.test(n)).length;
  return { status: "pass", observed: `block ran to its end; ${skipped} step(s) skipped for lack of fixture rows` };
}
