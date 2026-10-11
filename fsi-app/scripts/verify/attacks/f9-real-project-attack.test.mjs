// f9-real-project-attack.test.mjs -- unit tests of the CI-side F9 attack (lane TESTS-2, 2026-10-10), against a scripted F9.
// The compiler itself runs in CI; here the verdict logic is proven, including an attack on the attacker: an F9 that passes
// whatever it is given turns the run red, a control that fails stops the run before the attack, and the attack file is
// removed on every path.

import { test } from "node:test";
import assert from "node:assert/strict";
import { runAttack, cliMain, ATTACK_FILE, ATTACK_SOURCE, SENTINEL } from "./f9-real-project-attack.mjs";

const VIOLATION = [{ line: 1, message: "TypeScript compilation failed (tsc --noEmit exit code 2).\nFirst 1 error(s):" }];

/** A scripted F9: red exactly while the attack file exists. */
function scriptedF9({ blind = false, brokenControl = false, skip = false, otherViolation = false } = {}) {
  const fs = new Set();
  return {
    fs,
    write: (rel, text) => { assert.equal(text, ATTACK_SOURCE); fs.add(rel); },
    remove: (rel) => { fs.delete(rel); },
    check: (path, _content, deps) => {
      assert.equal(path, SENTINEL);
      if (skip) { deps.log("  [F9] SKIP: typescript does not resolve"); return []; }
      if (brokenControl && !fs.has(ATTACK_FILE)) return VIOLATION;
      if (fs.has(ATTACK_FILE) && !blind) return otherViolation ? [{ line: 1, message: "fsi-app/tsconfig.json excludes something" }] : VIOLATION;
      return [];
    },
  };
}

test("a gating F9 holds: the control passes, the attack is refused naming the compilation failure, the file is removed", async () => {
  const f9 = scriptedF9();
  const out = await runAttack(f9);
  assert.equal(out.code, 0, out.lines.join("\n"));
  assert.equal(f9.fs.size, 0);
  assert.ok(out.lines.some((l) => /CONTROL held/.test(l)) && out.lines.some((l) => /ATTACK refused/.test(l)));
});

test("ATTACK ON THE ATTACKER: an F9 that passes a type-broken file turns the run red, and the file is still removed", async () => {
  const f9 = scriptedF9({ blind: true });
  const out = await runAttack(f9);
  assert.equal(out.code, 1);
  assert.match(out.lines.join("\n"), /ATTACK NOT REFUSED/);
  assert.equal(f9.fs.size, 0);
});

test("a red clean checkout stops at the control: the attack file is never written", async () => {
  const f9 = scriptedF9({ brokenControl: true });
  const out = await runAttack(f9);
  assert.equal(out.code, 1);
  assert.match(out.lines.join("\n"), /CONTROL FAILED/);
  assert.equal(f9.fs.size, 0);
});

test("a refusal for another reason is not taken as the compiler gating", async () => {
  const out = await runAttack(scriptedF9({ otherViolation: true }));
  assert.equal(out.code, 1);
  assert.match(out.lines.join("\n"), /another reason/);
});

test("an F9 that skips because typescript does not resolve is exit 2, never a pass", async () => {
  const out = await runAttack(scriptedF9({ skip: true }));
  assert.equal(out.code, 2);
});

test("the attack file is removed even when the check throws", async () => {
  const f9 = scriptedF9();
  let n = 0;
  const check = (p, c, d) => { n += 1; if (n === 2) throw new Error("boom"); return f9.check(p, c, d); };
  await assert.rejects(() => runAttack({ ...f9, check }), /boom/);
  assert.equal(f9.fs.size, 0);
});

test("cliMain refuses outside a disposable checkout and when the attack file already exists", async () => {
  const logs = [];
  assert.equal(await cliMain({ env: {}, log: (m) => logs.push(m), loadF9: async () => ({ check: () => [] }) }), 2);
  assert.match(logs.at(-1), /disposable checkout/);
  assert.equal(await cliMain({ env: { GATE_ATTACK_DISPOSABLE_CHECKOUT: "1" }, log: (m) => logs.push(m), exists: () => true, loadF9: async () => ({ check: () => [] }) }), 2);
  assert.match(logs.at(-1), /already exists/);
  const f9 = scriptedF9();
  assert.equal(await cliMain({ env: { GATE_ATTACK_DISPOSABLE_CHECKOUT: "1" }, log: () => {}, exists: () => false, loadF9: async () => ({ check: f9.check }), write: f9.write, remove: f9.remove }), 0);
});
