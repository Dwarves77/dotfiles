// Fire-test: registerSource must give every new source a source_role at birth.
// Run: node --test fsi-app/scripts/lib/db-register-source-role.test.mjs
//
// WHY THIS TEST EXISTS (2026-08-11). classify-source-role.ts declares its own contract in its
// header: "Called at onboarding (promote/decide) and in the backfill so a source is never created
// with a NULL role + placeholder content-type." That contract was TRUE for the three admin
// onboarding routes and FALSE for scripts/lib/db.mjs registerSource() — the guarded path every
// script-created source is born through. Nothing enforced it, so the gap was invisible.
//
// What the gap cost, measured live: 1,719 of 2,549 registry rows with source_role IS NULL. A
// 2026-08-10 triage then treated "no role" as "inert" and demoted 869 sources to provisional —
// among them the US SEC, eCFR, ESMA, NYS DEC, China's Ministry of Ecology and Environment, and
// Australia's Clean Energy Regulator (independently probed 2026-08-11: live, last updated 6 Aug
// 2026). Provisional is gated out of every scrape/AI/index job, so the demotion would have made
// them permanently invisible. A NULL role is not a cosmetic gap; it is read downstream as evidence
// of worthlessness.
//
// RED-TEST PROOF (rule 15): delete the `source_role:` line from registerSource's row literal in
// db.mjs and `test 1` fails. Break the classifier's determinism and `test 2` fails.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classifySourceRole } from "../../src/lib/sources/classify-source-role.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const DB_MJS = resolve(HERE, "db.mjs");

// Content-verifiable, in the style of discipline rules 012/015/016: read the actual bytes of the
// guarded path and assert the wiring is present. registerSource performs network + DB work, so a
// behavioural unit test would need a live client; the byte check is the honest enforceable form.
test("registerSource sets source_role on the inserted row (classifier is wired into the guarded path)", () => {
  const src = readFileSync(DB_MJS, "utf8");

  assert.match(
    src,
    /import\s*\{\s*classifySourceRole\s*\}\s*from\s*["'][^"']*classify-source-role\.ts["']/,
    "db.mjs must import classifySourceRole — without it no script-created source gets a role at birth."
  );

  // Isolate registerSource's body so a stray mention elsewhere cannot satisfy this test.
  const start = src.indexOf("export async function registerSource");
  assert.ok(start !== -1, "registerSource not found in db.mjs");
  const body = src.slice(start, start + 2600);

  assert.match(
    body,
    /source_role:\s*source\.source_role\s*\?\?\s*classifySourceRole\(/,
    "registerSource's inserted row must set source_role via classifySourceRole, with an explicit " +
      "source.source_role still taking precedence. A row born with a NULL role is later read as 'inert'."
  );
});

// The wiring is only worth anything if the classifier actually resolves the institutions that were
// wrongly demoted. These are real rows from the 2026-08-10 demotion cohort.
test("classifier resolves the institutions the NULL-role gap caused to be demoted", () => {
  const cases = [
    ["US Securities and Exchange Commission (SEC)", "https://sec.gov/"],
    ["eCFR - Title 40 Part 63 Subpart DDDD", "https://www.ecfr.gov/current/title-40"],
    ["NYS Department of Environmental Conservation — Official Portal", "https://www.dec.ny.gov/"],
    ["Ministry of Ecology and Environment (MEE), People's Republic of China", "https://www.mee.gov.cn"],
    ["Australia Clean Energy Regulator — NGER Safeguard Mechanism", "https://cer.gov.au/schemes/safeguard-mechanism"],
  ];
  for (const [name, url] of cases) {
    const role = classifySourceRole(name, url);
    assert.ok(role, `classifySourceRole returned null for a canonical regulator: ${name}`);
    assert.equal(typeof role, "string");
  }
});

// Determinable-but-unset is the failure mode that mattered; genuinely undeterminable must stay null
// (flagged, never guessed) so the "no guess" property of the classifier is not eroded by this fix.
test("classifier still returns null rather than guessing when the entity is undeterminable", () => {
  assert.equal(classifySourceRole("", ""), null);
});
