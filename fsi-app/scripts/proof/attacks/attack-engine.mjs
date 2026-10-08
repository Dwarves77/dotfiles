// attack-engine.mjs -- the SQL attack engine of the chain-proof attack suite (lane PROOF-4, 2026-10-07; CLAUDE.md
// rule 15: a guard is proven by attack, not by presence; template scripts/verify/prov-guard-adversarial-audit.mjs).
//
// An attack is a list of steps run inside ONE transaction that is ALWAYS rolled back. Each step runs in its own
// savepoint, optionally as an impersonated role, and carries an expectation about what the database must do:
//   kind "setup"    prepares state; if its expectation fails the attack is NOT EXERCISED and stops (a guard that was
//                   never attacked is not proven, so this is a failure, never a skip);
//   kind "attack"   the forbidden action; its expectation is the refusal (an SQLSTATE, an empty RLS result, a refused
//                   payload). If the forbidden action goes through, the expectation fails and the attack is RED;
//   kind "control"  the legitimate path, which must still work (the both-directions proof: a guard that also kills
//                   the legitimate path is not a proof).
//
// Roles: "owner" (the connection role, no impersonation), "service" (service_role), "anon", "user:<fixture key>"
// (authenticated, with that fixture user as the JWT subject). Impersonation is SET LOCAL ROLE plus the
// request.jwt.claims setting, the pattern spec09-org-rls-adversarial-audit.mjs and the SEC-1 audits already use.
//
// PUBLIC REPOSITORY RULE: the report is uploaded as a workflow artifact on a public repository and the database holds
// a subset of production. Nothing here ever records a value read from the database: observed text is an SQLSTATE,
// counts, and boolean or numeric facts only. A text column compared by `equals` or `includes` reports a mismatch by
// column name, never by value.
//
// No pg import: the client is injected (a pg.Client in the runner, a scripted fake in the tests).

export const DENIED = "42501"; // insufficient_privilege, the SQLSTATE of a refused grant, policy or guard
export const STEP_KINDS = Object.freeze(["setup", "attack", "control"]);
export const EXPECT_KEYS = Object.freeze([
  "ok", "error", "message_includes", "denied_or_rows", "rows", "rows_min", "row_count", "equals", "includes",
]);

const firstLine = (s, max = 110) => String(s ?? "").split("\n")[0].slice(0, max);

/** "@name" resolves from the context; anything else is a literal. Throws on an unknown name. PURE. */
export function resolveRef(value, ctx) {
  if (typeof value !== "string" || !value.startsWith("@")) return value;
  const name = value.slice(1);
  if (!Object.prototype.hasOwnProperty.call(ctx, name) || ctx[name] === undefined) throw new Error(`unknown reference @${name}`);
  return ctx[name];
}

/** Resolve a params array against the context. PURE. */
export function resolveParams(params, ctx) {
  return (params ?? []).map((p) => resolveRef(p, ctx));
}

/** Parse a step's `as`. PURE. */
export function parseRole(as) {
  if (as === undefined || as === null || as === "owner") return { kind: "owner" };
  if (as === "service") return { kind: "service" };
  if (as === "anon") return { kind: "anon" };
  if (typeof as === "string" && as.startsWith("user:")) {
    const key = as.slice(5);
    if (!key) throw new Error(`role "${as}" names no fixture user`);
    return { kind: "user", key };
  }
  throw new Error(`unknown role "${as}" (expected owner, service, anon or user:<fixture key>)`);
}

/** The statements that impersonate a role inside the current transaction. PURE. */
export function roleStatements(role, ctx) {
  const claims = (obj) => ({ sql: "SELECT set_config('request.jwt.claims', $1, true)", params: [JSON.stringify(obj)] });
  if (role.kind === "owner") return [];
  if (role.kind === "anon") return [{ sql: "SET LOCAL ROLE anon", params: [] }, claims({ role: "anon" })];
  if (role.kind === "service") return [{ sql: "SET LOCAL ROLE service_role", params: [] }, claims({ role: "service_role" })];
  const sub = ctx[role.key];
  if (!sub) throw new Error(`unknown fixture user "${role.key}"`);
  return [{ sql: "SET LOCAL ROLE authenticated", params: [] }, claims({ sub, role: "authenticated" })];
}

const scalarFacts = (row) =>
  Object.entries(row ?? {})
    .filter(([, v]) => typeof v === "boolean" || typeof v === "number")
    .slice(0, 6)
    .map(([k, v]) => `${k}=${v}`);

/** One short description of what a step observed: codes, counts and boolean or numeric facts only. PURE. */
export function describeObserved(o) {
  if (o.errored) return `error ${o.code ?? "no-code"}${o.message ? ` (${firstLine(o.message, 90)})` : ""}`;
  const parts = [`ok rows=${(o.rows ?? []).length}`, `row_count=${o.rowCount ?? "n/a"}`, ...scalarFacts(o.rows?.[0])];
  return parts.join(" ");
}

const asList = (v) => (Array.isArray(v) ? v : [v]);

/** Evaluate an expectation against an observation. PURE. Returns { ok, notes }; notes never carry a database value. */
export function evaluateExpect(expect, o) {
  const notes = [];
  const rows = o.rows ?? [];
  const first = rows[0];

  if (expect.error !== undefined) {
    const want = asList(expect.error);
    if (!o.errored) notes.push(`expected an error ${want.join(" or ")} but the statement succeeded`);
    else if (!want.includes(o.code)) notes.push(`expected error ${want.join(" or ")}, got ${o.code ?? "no code"}`);
    if (expect.message_includes !== undefined) {
      if (!o.errored || !String(o.message ?? "").toLowerCase().includes(String(expect.message_includes).toLowerCase())) {
        notes.push(`the error message does not include "${expect.message_includes}"`);
      }
    }
  } else if (expect.message_includes !== undefined) {
    notes.push("message_includes needs an error expectation");
  }

  if (expect.ok === true && o.errored) notes.push(`expected success, got error ${o.code ?? "no code"}`);

  if (expect.denied_or_rows !== undefined) {
    if (o.errored) {
      if (o.code !== DENIED) notes.push(`expected a ${DENIED} refusal or ${expect.denied_or_rows} rows, got error ${o.code ?? "no code"}`);
    } else {
      const n = Math.max(rows.length, o.rowCount ?? 0);
      if (n !== expect.denied_or_rows) notes.push(`expected a ${DENIED} refusal or ${expect.denied_or_rows} rows, got ${n}`);
    }
  }

  const needsResult = ["rows", "rows_min", "row_count", "equals", "includes"].some((k) => expect[k] !== undefined);
  if (needsResult && o.errored) {
    notes.push(`the statement raised ${o.code ?? "an error"} instead of returning a result`);
  } else {
    if (expect.rows !== undefined && rows.length !== expect.rows) notes.push(`expected ${expect.rows} rows, got ${rows.length}`);
    if (expect.rows_min !== undefined && rows.length < expect.rows_min) notes.push(`expected at least ${expect.rows_min} rows, got ${rows.length}`);
    if (expect.row_count !== undefined && o.rowCount !== expect.row_count) notes.push(`expected row_count ${expect.row_count}, got ${o.rowCount ?? "n/a"}`);
    for (const [kind, wants] of [["equals", expect.equals], ["includes", expect.includes]]) {
      if (!wants) continue;
      if (!first) { notes.push(`no row to compare for ${kind}`); continue; }
      for (const [col, want] of Object.entries(wants)) {
        if (!(col in first)) { notes.push(`column ${col} is absent from the result`); continue; }
        const got = String(first[col]);
        const good = kind === "equals" ? got === String(want) : got.includes(String(want));
        if (!good) notes.push(`column ${col} ${kind === "equals" ? "differs from" : "does not include"} the expected value`);
      }
    }
  }
  return { ok: notes.length === 0, notes };
}

/** Run one step inside its own savepoint. Returns the observation. */
async function runStep(client, step, ctx, n) {
  const params = resolveParams(step.params, ctx);
  const role = parseRole(step.as);
  const setup = roleStatements(role, ctx);
  const sp = `p4_s${n}`;
  await client.query(`SAVEPOINT ${sp}`);
  try {
    for (const s of setup) await client.query(s.sql, s.params);
    const res = await client.query(step.sql, params);
    if (setup.length) await client.query("RESET ROLE");
    await client.query(`RELEASE SAVEPOINT ${sp}`);
    return { errored: false, rows: res?.rows ?? [], rowCount: res?.rowCount ?? null };
  } catch (e) {
    await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
    await client.query(`RELEASE SAVEPOINT ${sp}`);
    return { errored: true, code: e.code, message: firstLine(e.message), rows: [], rowCount: null };
  }
}

/**
 * Run one SQL attack. Always rolled back. Returns { status: "pass" | "fail", observed, steps }.
 * "pass" means the invariant HELD: every attack step was refused and every control step succeeded.
 */
export async function runSqlAttack(client, attack, ctx0) {
  const ctx = { ...ctx0 };
  const steps = [];
  let notExercised = null;
  await client.query("BEGIN");
  try {
    let n = 0;
    for (const step of attack.steps) {
      n += 1;
      const rec = { label: step.label, kind: step.kind, as: step.as ?? "owner", expect: step.expect };
      let observed;
      try {
        observed = await runStep(client, step, ctx, n);
      } catch (e) {
        steps.push({ ...rec, ok: false, observed: `engine: ${firstLine(e.message)}`, notes: [firstLine(e.message)] });
        if (step.kind === "setup") notExercised = step.label;
        break;
      }
      const verdict = evaluateExpect(step.expect, observed);
      steps.push({ ...rec, ok: verdict.ok, observed: describeObserved(observed), notes: verdict.notes });
      if (verdict.ok && step.save && observed.rows[0]) {
        for (const [name, col] of Object.entries(step.save)) ctx[name] = observed.rows[0][col];
      }
      if (!verdict.ok && step.kind === "setup") { notExercised = step.label; break; }
    }
  } finally {
    await client.query("ROLLBACK");
  }

  const failing = steps.filter((s) => !s.ok);
  if (notExercised) {
    return { status: "fail", observed: `not exercised: setup step "${notExercised}" failed (${failing.at(-1)?.notes.join("; ") || "no detail"})`, steps };
  }
  if (failing.length) {
    return { status: "fail", observed: failing.map((s) => `${s.label}: ${s.observed} (${s.notes.join("; ")})`).join(" | "), steps };
  }
  return { status: "pass", observed: steps.filter((s) => s.kind !== "setup").map((s) => `${s.label}: ${s.observed}`).join(" | "), steps };
}
