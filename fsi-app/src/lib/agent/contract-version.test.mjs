// @ts-check
// DRIFT GUARD (operator ruling 2026-07-13, flag-system item 2): the contract version has ≥3 homes — this
// SSOT, the system prompt's YAML template the model copies, and the prose line that tells it the value. They
// drifted once (auditor/b2-progress at 2026-04-29 while the generator stamped 2026-05-27). This test binds the
// SSOT to what the generator actually emits: if the prompt advances the stamped version without advancing the
// SSOT (or vice-versa), the build FAILS here, naming the drift — no silent re-drift, the "two-homes" class fix.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CURRENT_SKILL_CONTRACT_VERSION as VER } from "./contract-version.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const prompt = readFileSync(resolve(HERE, "system-prompt.ts"), "utf8");

test("SSOT matches the version the generator stamps (system-prompt YAML template)", () => {
  assert.match(
    prompt,
    new RegExp(`regeneration_skill_version:\\s*"${VER.replace(/[-]/g, "\\-")}"`),
    `system-prompt.ts must stamp regeneration_skill_version: "${VER}" (the SSOT). If the contract advanced, bump BOTH contract-version.mjs AND system-prompt.ts together.`
  );
});

test("no OTHER regeneration_skill_version literal drifts in the prompt", () => {
  const stamped = [...prompt.matchAll(/regeneration_skill_version:\s*"(\d{4}-\d{2}-\d{2})"/g)].map((m) => m[1]);
  for (const v of stamped) {
    assert.equal(v, VER, `system-prompt.ts stamps "${v}" but the SSOT is "${VER}" — drift; reconcile both homes.`);
  }
  assert.ok(stamped.length >= 1, "expected at least one regeneration_skill_version stamp in the prompt");
});
