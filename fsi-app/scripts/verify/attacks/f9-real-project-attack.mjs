#!/usr/bin/env node
// f9-real-project-attack.mjs -- F9 (build-compiles) attacked on the REAL app project (lane TESTS-2, 2026-10-10; AUD-AT-4
// "Owed legs": a full tsc over the app needs the installed dependencies and was not run).
//
// F9 runs `tsc --noEmit` over fsi-app and reports a violation when it fails. This script proves that on the real project:
//   CONTROL  the clean checkout passes F9 (no violation).
//   ATTACK   one new source file with a type error (`const n: number = "x"`) makes the same F9 call return a violation that
//            names the compiler failure. If F9 still passes, the compiler half of the gate is not gating.
// The two static guards (a tsconfig exclude, a @ts-nocheck directive) are attacked on the real tree by
// .discipline/fitness/functions/F9-real-project.test.mjs without needing the compiler.
//
// It WRITES one file into fsi-app/src and removes it afterwards (finally), so it runs only in a disposable checkout:
// it refuses (exit 2) unless GATE_ATTACK_DISPOSABLE_CHECKOUT=1, which only the CI workflow sets. Needs `npm ci` first
// (typescript resolves from fsi-app); without it F9 reports a SKIP, and this script treats a SKIP as "cannot verify" (exit 2),
// never as a pass.
//
// Exit: 0 control passed and the attack was refused; 1 the control failed or the attack got through; 2 cannot run.

import { writeFileSync, rmSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isMainModule } from "../../lib/is-main.mjs";

const FSI_APP = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const SENTINEL = "fsi-app/tsconfig.json";
export const ATTACK_FILE = "src/lib/__f9_attack_type_error.ts";
export const ATTACK_SOURCE = 'export const f9AttackNumber: number = "this is a string, not a number";\n';

/** Run the control then the attack against an F9 `check(filepath, content, deps)`. Returns { code, lines }. */
export async function runAttack({ check, write = (rel, text) => writeFileSync(join(FSI_APP, rel), text), remove = (rel) => rmSync(join(FSI_APP, rel), { force: true }), log = () => {} }) {
  const lines = [];
  const say = (m) => { lines.push(m); log(m); };
  const skipped = [];
  const deps = { log: (m) => { skipped.push(String(m)); } };
  const control = check(SENTINEL, "", deps);
  if (skipped.some((m) => /SKIP/.test(m))) { say("f9-real-project-attack: F9 reported SKIP (typescript does not resolve). Cannot verify, exit 2."); return { code: 2, lines }; }
  if (control.length !== 0) { say(`CONTROL FAILED: F9 reports ${control.length} violation(s) on the clean checkout: ${String(control[0]?.message).split("\n")[0]}`); return { code: 1, lines }; }
  say("CONTROL held: F9 passes on the clean checkout.");
  try {
    write(ATTACK_FILE, ATTACK_SOURCE);
    const attacked = check(SENTINEL, "", { log: () => {} });
    if (attacked.length === 0) { say("ATTACK NOT REFUSED: F9 passes with a type error in a source file, so the compiler half of the gate does not gate."); return { code: 1, lines }; }
    if (!attacked.some((v) => /TypeScript compilation failed/.test(String(v.message)))) {
      say(`ATTACK refused for another reason: ${String(attacked[0].message).split("\n")[0]}`);
      return { code: 1, lines };
    }
    say("ATTACK refused: F9 names the TypeScript compilation failure.");
  } finally {
    remove(ATTACK_FILE);
  }
  return { code: 0, lines };
}

export async function cliMain({ env = process.env, log = console.log, loadF9 = async () => (await import("../../../.discipline/fitness/functions/F9-build-compiles.mjs")).fitnessFunction, exists = (rel) => existsSync(join(FSI_APP, rel)), ...rest } = {}) {
  if (env.GATE_ATTACK_DISPOSABLE_CHECKOUT !== "1") { log("f9-real-project-attack: REFUSED, this writes a file into fsi-app/src; set GATE_ATTACK_DISPOSABLE_CHECKOUT=1 in a disposable checkout (the CI workflow does). Exit 2."); return 2; }
  if (exists(ATTACK_FILE)) { log(`f9-real-project-attack: ${ATTACK_FILE} already exists; refusing to overwrite it. Exit 2.`); return 2; }
  const f9 = await loadF9();
  const { code } = await runAttack({ check: (p, c, d) => f9.check(p, c, d), log, ...rest });
  return code;
}

if (isMainModule(import.meta.url)) {
  process.exit(await cliMain({}));
}
