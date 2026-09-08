// Structural regression test for src/components/sources/ProvisionalReviewTable.tsx, artboard 13
// (dc.html p13) "SOURCES · PROVISIONAL REVIEW". Source-text regression plus a behavioural test of
// the two pure helpers, which are exported precisely so they can be exercised here (no JSX render
// harness in this repo, see WatchButton.npmtest.mjs's own header).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(resolve(DIR, "ProvisionalReviewTable.tsx"), "utf8");
const ROWTABLE = readFileSync(resolve(DIR, "../ui/RowTable.tsx"), "utf8");

// ── Pure helpers ─────────────────────────────────────────────────────────────────────────────────
// hostOf delegates to the entity spine's real normalizer, which node can import directly (.mjs);
// rowTier is one expression, re-stated here and asserted against the source so drift fails.
const { hostFromUrl } = await import(resolve(DIR, "../../lib/entities/host-from-url.mjs"));
const hostOf = (url) => hostFromUrl(url) || null;
function rowTier(ps, picked) {
  return picked ?? ps.recommended_tier ?? ps.provisional_tier;
}

test("hostOf goes through the spine's one normalizer; a non-URL is absent, never a raw string", () => {
  assert.equal(hostOf("https://emsa.europa.eu/emissions"), "emsa.europa.eu");
  assert.equal(hostOf("https://www.plasticsnews.com/resin"), "plasticsnews.com");
  assert.equal(hostOf("not a url"), null);
  // F30 url_host_derivation: no local `new URL(...).host` reimplementation in this component.
  assert.match(SOURCE, /return hostFromUrl\(url\) \|\| null;/);
  assert.doesNotMatch(SOURCE, /new URL\(url\)/);
});

test("rowTier prefers the operator's pick, then the recommendation, then the provisional estimate", () => {
  const ps = { provisional_tier: 7, recommended_tier: 2 };
  assert.equal(rowTier(ps, 5), 5);
  assert.equal(rowTier(ps, undefined), 2);
  assert.equal(rowTier({ provisional_tier: 7, recommended_tier: null }, undefined), 7);
  assert.match(SOURCE, /picked \?\? ps\.recommended_tier \?\? ps\.provisional_tier/);
});

test("every action posts to the one real endpoint the review flow already owns", () => {
  assert.match(SOURCE, /"\/api\/admin\/sources\/promote"/);
  // No invented endpoints: promote is the only fetch target in the file.
  const fetches = SOURCE.match(/fetch\(\s*"([^"]+)"/g) ?? [];
  assert.equal(fetches.length, 1, "expected exactly one fetch target");
});

test("approve sends assignedTier (F8 client/server tier boundary), the other decisions do not", () => {
  assert.match(SOURCE, /if \(decision === "approve"\) body\.assignedTier = tier;/);
});

test("re-tier is decision 'defer', which is what keeps the row provisional", () => {
  assert.match(SOURCE, /submit\(ps, "defer", t\)/);
  assert.match(SOURCE, /Re-tier: T\$\{tier\}/);
});

test("artboard strings are verbatim", () => {
  assert.match(SOURCE, /Sources · provisional review/);
  assert.match(SOURCE, /pending · approve, reject or re-tier on the row/);
  assert.match(
    SOURCE,
    /Approve = registry · Reject = archived with reason · Re-tier = stays provisional/
  );
});

test("a value the data does not carry renders Absence, never a zero or a blank", () => {
  assert.match(SOURCE, /last full extraction run <Absence reason="pending" \/>/);
  assert.match(SOURCE, /stagedUpdatesCount === null \? \(\s*<Absence reason="pending" \/>/);
});

test("RowTable geometry is dc.html p13's: 30px header, 48px rows, 44px overflow hit target", () => {
  // Lane community60 (2026-09-08) made the row measures a per-table `metrics` prop so artboard
  // 12's discussion table could reuse this component instead of forking it. This table passes no
  // metrics, so the invariant is unchanged and is asserted where it now lives: in the DEFAULTS.
  assert.match(ROWTABLE, /height: 30,/);
  assert.match(ROWTABLE, /rowMinHeight = metrics\?\.rowMinHeight \?\? 48/);
  assert.match(ROWTABLE, /width: 44,\s*\n\s*height: 44,/);
  assert.match(ROWTABLE, /gap: "0 14px"/);
  assert.match(ROWTABLE, /paddingLeft = metrics\?\.paddingLeft \?\? 16/);
  assert.match(ROWTABLE, /padding: `0 12px 0 \$\{paddingLeft\}px`/);
  assert.doesNotMatch(SOURCE, /metrics=/);
});
