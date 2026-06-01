// Discrimination proof for the read-side type-consumer probe: flags index-then-deref without a
// guard; passes optional-chained, ??-defaulted, and direct-render forms.
import { test } from "node:test";
import assert from "node:assert/strict";
import { findUnguardedTypeConsumers } from "./type-consumer-probe.mjs";

const corrupt = (hits) => hits.filter((h) => h.verdict === "CANDIDATE_CORRUPT");

test("BAD: assign then unguarded deref is flagged (the DashboardAwaitingReview shape)", () => {
  const bad = `const chip = TYPE_TO_CHIP[it.type];\nreturn <span className={chip.cls}>{chip.label}</span>;`;
  assert.ok(corrupt(findUnguardedTypeConsumers(bad, "bad.tsx")).length >= 1);
});
test("BAD: inline deref MAP[x.type].prop is flagged", () => {
  const bad = `const cls = TYPE_COLORS[item.type].border;`;
  assert.ok(corrupt(findUnguardedTypeConsumers(bad, "bad.tsx")).length >= 1);
});
test("GOOD: optional-chain on the assigned result passes", () => {
  const good = `const chip = TYPE_TO_CHIP[it.type];\nreturn <span className={chip?.cls}>{chip?.label}</span>;`;
  assert.equal(corrupt(findUnguardedTypeConsumers(good, "good.tsx")).length, 0);
});
test("GOOD: ?? fallback right after the lookup passes", () => {
  const good = `const label = TYPE_LABEL[item.type] ?? "Unknown";`;
  assert.equal(corrupt(findUnguardedTypeConsumers(good, "good.tsx")).length, 0);
});
test("GOOD: direct render of the bare lookup (undefined -> empty, no crash) is not flagged corrupt", () => {
  const good = `<span className="tag">{TYPE_LABEL[item.type]}</span>`;
  assert.equal(corrupt(findUnguardedTypeConsumers(good, "good.tsx")).length, 0);
});
test("GOOD: inline optional-chain MAP[x.type]?.prop passes", () => {
  const good = `const cls = TYPE_COLORS[item.type]?.border;`;
  assert.equal(corrupt(findUnguardedTypeConsumers(good, "good.tsx")).length, 0);
});
