// Structural regression test for theme.css (fix58-tokens, 2026-09-07, design audit B1/chips.json,
// filterchipgroup.json). A prior legacy-alias line redeclared `--radius-pill` in terms of itself
// (`--radius-pill: var(--radius-pill);`), which the CSS spec treats as guaranteed-invalid and broke
// every pill-radius chip sitewide — the later, invalid declaration wins over the earlier valid one
// within one `:root{}` rule. Source-text regression (no CSS-cascade harness in this repo).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "theme.css"),
  "utf8"
);

test("--radius-pill is declared exactly once (999px), never redeclared in terms of itself", () => {
  // Real CSS declarations only — excludes the doc-comment lines above, which quote the historical
  // bug's exact broken syntax in backticks for the record.
  const codeLines = SOURCE.split("\n").filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("/*"));
  const declLines = codeLines.filter((l) => /--radius-pill:\s*[^;]+;/.test(l));
  assert.equal(declLines.length, 1, "a second declaration would risk reintroducing the self-reference bug");
  assert.doesNotMatch(declLines[0], /var\(--radius-pill\)/);
  assert.match(declLines[0], /--radius-pill:\s*999px;/);
});

test("each band carries a tinted border token, matching the dc.html #sys 'Chips' band-chip border colours", () => {
  assert.match(SOURCE, /--immediate-border:\s*#FECACA;/);
  assert.match(SOURCE, /--action-border:\s*#FED7AA;/);
  assert.match(SOURCE, /--monitor-border:\s*#BFDBFE;/);
  assert.match(SOURCE, /--awareness-border:\s*#BBF7D0;/);
});
