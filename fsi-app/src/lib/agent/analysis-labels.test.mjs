// @ts-check
// ANALYSIS-LABEL DRIFT GUARD (Wave-α C2) — the 3-home vocabulary guarantee, url-canon.test.mjs pattern
// (assert the OTHER homes' literal text against the ONE constant module). The homes:
//   1. the synthesis SYSTEM prompt (system-prompt.ts — the emit contract the agent follows),
//   2. the grounding LEDGER prompt + the kept-claims filter (canonical-pipeline.ts),
//   3. the 4c relabel module (relabel-unlabeled.mjs).
// THE RULING under test (recorded in analysis-labels.mjs): the 4th label "Per the workspace's
// reading:" is STOP-EMITTING (live corpus ~clean: 0 claims, 4 briefs) — it must appear in NO
// emit-side home. The LIVE validator (migration 143 c_label_re) tolerates it for the legacy corpus
// only; migration 143's file is asserted to still carry the THREE canonical labels so the DB and
// the emit vocabulary can never silently diverge on those.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  ANALYSIS_LABEL_TOKENS,
  ANALYSIS_LABELS,
  ANALYSIS_LABELS_BY_KEY,
  LEGACY_ANALYSIS_LABEL,
} from "./analysis-labels.mjs";
import { ANALYSIS_LABELS as RELABEL_LABELS } from "./relabel-unlabeled.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(resolve(HERE, p), "utf8");

const systemPrompt = read("./system-prompt.ts");
const pipeline = read("./canonical-pipeline.ts");
const migration143 = read("../../../supabase/migrations/143_label_variant_tolerance.sql");

// Strip comment lines so a docstring MENTIONING the legacy label (history) never false-fails.
// Deliberately does NOT strip lines starting with a bare `*`: the prompt's markdown-emphasis label
// lines (`*Per the workspace's reading:*`) start exactly like that and are CODE, not JSDoc.
const codeLines = (src) =>
  src
    .split(/\r?\n/)
    .filter((l) => {
      const t = l.trim();
      return !(t.startsWith("//") || t.startsWith("/*") || t.startsWith("--"));
    })
    .join("\n");

test("constant module: exactly THREE canonical labels, internally consistent forms", () => {
  assert.equal(ANALYSIS_LABEL_TOKENS.length, 3);
  assert.deepEqual(
    [...ANALYSIS_LABELS],
    ["analytical inference", "industry interpretation", "operational implication"],
  );
  assert.deepEqual(Object.values(ANALYSIS_LABELS_BY_KEY).sort(), [
    "Analytical inference:",
    "Industry interpretation:",
    "Operational implication:",
  ]);
  assert.equal(LEGACY_ANALYSIS_LABEL, "Per the workspace's reading:");
});

test("HOME 1 — system prompt: carries each canonical token, never the legacy 4th", () => {
  for (const token of ANALYSIS_LABEL_TOKENS) {
    assert.ok(systemPrompt.includes(token), `system-prompt.ts must carry the label token ${token}`);
  }
  assert.ok(
    !codeLines(systemPrompt).toLowerCase().includes(LEGACY_ANALYSIS_LABEL.toLowerCase()),
    `system-prompt.ts must NOT emit the retired label "${LEGACY_ANALYSIS_LABEL}" (stop-emitting ruling 2026-07-11)`,
  );
});

test("HOME 2 — canonical-pipeline: kept-filter + ledger prompt import the constant, never the legacy 4th", () => {
  // NB: assert via includes() (not a `from "@/..."` regex) so the glob-portability guard doesn't read this
  // test's own assertion text as a non-portable import.
  assert.ok(
    pipeline.includes("analysis-labels.mjs") && pipeline.includes("ANALYSIS_LABELS_BY_KEY"),
    "canonical-pipeline.ts must import the label vocabulary from analysis-labels.mjs (no local hand-list)",
  );
  // No re-declared local vocabulary: the old inline hand-list is gone.
  assert.ok(
    !/const ANALYSIS_LABELS\s*=\s*\[/.test(pipeline),
    "canonical-pipeline.ts must not hand-list ANALYSIS_LABELS locally",
  );
  assert.ok(
    !codeLines(pipeline).toLowerCase().includes(LEGACY_ANALYSIS_LABEL.toLowerCase()),
    `canonical-pipeline.ts (ledger prompt) must NOT authorize the retired label "${LEGACY_ANALYSIS_LABEL}"`,
  );
});

test("HOME 3 — 4c relabel module agrees with the constant module", () => {
  assert.deepEqual(
    Object.values(RELABEL_LABELS).sort(),
    Object.values(ANALYSIS_LABELS_BY_KEY).sort(),
    "relabel-unlabeled.mjs labels must equal the constant module's bare-label forms",
  );
});

test("DB SIDE — migration 143 (live validator base) still recognizes each canonical label", () => {
  for (const label of Object.values(ANALYSIS_LABELS_BY_KEY)) {
    const sqlForm = label.replace(/'/g, "''");
    assert.ok(
      migration143.includes(sqlForm) || migration143.toLowerCase().includes(label.toLowerCase().replace(/:$/, "")),
      `migration 143 must recognize "${label}"`,
    );
  }
});
