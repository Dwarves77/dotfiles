/** Tests for scripts/proof/steps/verdict-fixture.mjs (lane PROOF-3). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildVerdictBatch, STALE_PROMPT_VERSION, FIXTURE_SIZE, USABLE_ENTRIES } from "./verdict-fixture.mjs";
import { validateVerdictsFile, partitionVerdictsByPromptVersion } from "../../turns/run-ledger-consume.mjs";

const LIVE = "sha256:1ceca92ff0dfae68";
const rows = Array.from({ length: 7 }, (_, i) => ({
  candidate_id: `00000000-0000-4000-8000-00000000000${i}`,
  url: `https://example.org/doc/${i}`,
  anchor_text: i === 1 ? "  A   spaced \n anchor " : i === 2 ? null : `Doc ${i}`,
}));
const now = () => new Date("2026-10-07T12:00:00.000Z");

test("the fixture is five verdicts over the first five rows and passes the real verdict schema", () => {
  const b = buildVerdictBatch({ rows, promptVersion: LIVE, now });
  assert.equal(b.entries.length, FIXTURE_SIZE);
  assert.deepEqual(b.entries.map((e) => e.url), rows.slice(0, FIXTURE_SIZE).map((r) => r.url));
  assert.deepEqual(validateVerdictsFile(b), []);
  assert.equal(b.generated_at, "2026-10-07T12:00:00.000Z");
});

test("four entries carry the live prompt version (usable) and one is stale, so promotion has input and the split is exercised", () => {
  const b = buildVerdictBatch({ rows, promptVersion: LIVE, now });
  const { current, stale } = partitionVerdictsByPromptVersion(b.entries, LIVE);
  assert.equal(current.length, USABLE_ENTRIES);
  assert.equal(stale.length, 1);
  assert.equal(stale[0].prompt_version, STALE_PROMPT_VERSION);
  for (const e of current) {
    assert.equal(e.entity_verdict, "specific_document");
    assert.ok(e.item_type && e.domain >= 1 && e.title_candidate.length > 0);
  }
});

test("the committed verdict batches are all stale against a live version the fixture would use, which is why a fixture is needed", () => {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "turns", "ledger-verdicts");
  for (const f of ["ledger-verdicts-001.json", "ledger-verdicts-002.json"]) {
    const j = JSON.parse(readFileSync(join(dir, f), "utf8"));
    const { current } = partitionVerdictsByPromptVersion(j.entries, LIVE);
    assert.equal(current.length, 0, `${f} unexpectedly matches ${LIVE}`);
  }
});

test("titles come from the anchor text with whitespace collapsed, else the url", () => {
  const b = buildVerdictBatch({ rows, promptVersion: LIVE, now });
  assert.equal(b.entries[1].title_candidate, "A spaced anchor");
  assert.equal(b.entries[2].title_candidate, rows[2].url);
});

test("ATTACK: fewer than five candidate rows is refused with the count, not padded", () => {
  assert.throws(() => buildVerdictBatch({ rows: rows.slice(0, 4), promptVersion: LIVE, now }), /needs 5 candidate rows .* has 4/);
  assert.throws(() => buildVerdictBatch({ rows: [], promptVersion: LIVE, now }), /has 0/);
});

test("ATTACK: a malformed or stale-marker prompt version is refused", () => {
  assert.throws(() => buildVerdictBatch({ rows, promptVersion: "sha256:xyz", now }), /does not match/);
  assert.throws(() => buildVerdictBatch({ rows, promptVersion: STALE_PROMPT_VERSION, now }), /equals the stale marker/);
});

test("ATTACK: a row with no url or id is refused", () => {
  const bad = rows.map((r, i) => (i === 3 ? { ...r, url: "" } : r));
  assert.throws(() => buildVerdictBatch({ rows: bad, promptVersion: LIVE, now }), /candidate row 3 has no id or url/);
});

test("the validator the fixture relies on does reject a broken entry (so the check above is not vacuous)", () => {
  const b = buildVerdictBatch({ rows, promptVersion: LIVE, now });
  const broken = { ...b, entries: b.entries.map((e, i) => (i === 0 ? { ...e, severity: "" } : e)) };
  assert.ok(validateVerdictsFile(broken).length > 0);
});
