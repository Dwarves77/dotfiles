// Structural regression test for CredibilityChipAuthority.tsx and CredibilityChipEvidence.tsx,
// absence rule (2026-09-25 close): "a value that exists is shown; one that cannot exist yet names
// the data it needs"; the literal words "pending", "unscored" and "not scored" never render (see
// src/components/ui/Absence.tsx NEEDS_PHRASE). Both chips previously rendered the literal string
// "Not scored"; this lane (W2-C, 2026-09-29) replaced it with a specific needs-phrase per chip,
// derived from each file's own documented data requirement. Source-text regression, same convention
// as StateNote.npmtest.mjs's own header (no JSX render harness in this repo).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const AUTHORITY = readFileSync(resolve(DIR, "CredibilityChipAuthority.tsx"), "utf8");
const EVIDENCE = readFileSync(resolve(DIR, "CredibilityChipEvidence.tsx"), "utf8");

test("CredibilityChipAuthority never renders the literal 'Not scored'; renders a specific needs-phrase instead", () => {
  assert.doesNotMatch(AUTHORITY, /:\s*"Not scored"/);
  assert.match(AUTHORITY, /:\s*"needs role-class data"/);
});

test("CredibilityChipEvidence never renders the literal 'Not scored'; renders a specific needs-phrase instead", () => {
  assert.doesNotMatch(EVIDENCE, /:\s*"Not scored"/);
  assert.match(EVIDENCE, /:\s*"needs evidence-synthesis data"/);
});

test("neither chip's short label spells the banned words 'pending', 'unscored' or 'not scored'", () => {
  for (const [name, source] of [["CredibilityChipAuthority", AUTHORITY], ["CredibilityChipEvidence", EVIDENCE]]) {
    const labelLine = source.match(/label = scored[\s\S]*?;|Evidence × agreement:.*$/m);
    // Fall back to scanning the whole file for the exact banned literal forms if the label
    // extraction regex doesn't match a future refactor; still catches the regression.
    const scope = labelLine ? labelLine[0] : source;
    assert.doesNotMatch(scope, /"Not scored"/, `${name} must not render the literal "Not scored"`);
  }
});
