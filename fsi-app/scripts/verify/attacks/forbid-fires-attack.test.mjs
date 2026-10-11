// forbid-fires-attack.test.mjs -- unit tests of the D-M4 forbid attack (lane TESTS-2, 2026-10-10). The browser half runs in the
// design-audit job; here the judging logic is proven with a scripted matcher (an attack on the attacker: a vacuous forbid, a
// blanket forbid and a half-covering forbid each turn it red), the real specs are read, and the fixture markup is pinned to the
// component that renders it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CASES, CELLS, collectForbids, fixtureHtml, judge, cliMain } from "./forbid-fires-attack.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_APP = resolve(HERE, "..", "..", "..");
const ROOT = resolve(FSI_APP, "..");

const FORBIDS = [{ file: "a.json", selector: "S" }, { file: "b.json", selector: "S" }];
const ids = (pred) => CASES.filter(pred).map((c) => c.id);

test("the cases cover every subset of the three cells; two or more tokens is the defect", () => {
  assert.equal(CASES.length, 8);
  assert.equal(CASES.filter((c) => c.shouldFire).length, 4);
  assert.deepEqual(CASES.find((c) => c.id === "none").reasons, []);
  assert.ok(CASES.every((c) => c.shouldFire === (c.reasons.length >= 2)));
});

test("a correct forbid (fires on exactly the two-or-more rows) passes", async () => {
  const r = await judge({ forbids: FORBIDS, matchedCaseIds: () => ids((c) => c.shouldFire) });
  assert.deepEqual(r.violations, []);
  assert.match(r.lines[0], /fired on 4 of 4 defect rows, matched 0 legitimate rows/);
});

test("ATTACK ON THE ATTACKER: a vacuous forbid (matches nothing) is red for every defect row", async () => {
  const r = await judge({ forbids: FORBIDS, matchedCaseIds: () => [] });
  assert.equal(r.violations.length, 4);
  assert.ok(r.violations.every((v) => v.startsWith("ATTACK not caught")));
});

test("ATTACK ON THE ATTACKER: a blanket forbid (matches every row) is red for every legitimate row", async () => {
  const r = await judge({ forbids: FORBIDS, matchedCaseIds: () => CASES.map((c) => c.id) });
  assert.equal(r.violations.length, 4);
  assert.ok(r.violations.every((v) => v.startsWith("CONTROL tripped")));
});

test("ATTACK ON THE ATTACKER: a forbid that covers only one of the three pairs is red", async () => {
  const r = await judge({ forbids: FORBIDS, matchedCaseIds: () => ids((c) => c.id === "impact+due" || c.id === "impact+due+tier") });
  assert.equal(r.violations.length, 2);
  assert.ok(r.violations.some((v) => v.includes("impact and tier")));
  assert.ok(r.violations.some((v) => v.includes("due and tier")));
});

test("no D-M4 forbid at all is red (nothing to attack is not a pass), and two different selectors are red", async () => {
  const none = await judge({ forbids: [], matchedCaseIds: () => [] });
  assert.ok(none.violations.some((v) => /nothing to attack/.test(v)));
  const split = await judge({ forbids: [{ file: "a.json", selector: "S1" }, { file: "b.json", selector: "S2" }], matchedCaseIds: () => ids((c) => c.shouldFire) });
  assert.ok(split.violations.some((v) => /2 different selectors/.test(v)));
});

test("the real specs: every D-M4 forbid is one selector, and it names all three pairs of cells", () => {
  const forbids = collectForbids();
  assert.equal(forbids.length, 14, forbids.map((f) => f.file).join(","));
  const selectors = [...new Set(forbids.map((f) => f.selector))];
  assert.equal(selectors.length, 1);
  for (const [a, b] of [["impact", "due"], ["impact", "tier"], ["due", "tier"]]) {
    assert.ok(selectors[0].includes(`:has(.cl-row-${a} [data-part-variant="reason"]):has(.cl-row-${b} [data-part-variant="reason"])`), `${a}+${b}`);
  }
});

test("the fixture markup uses the class names and the part variant ListRow.tsx renders", () => {
  const src = readFileSync(resolve(FSI_APP, "src", "components", "ui", "ListRow.tsx"), "utf8");
  for (const c of CELLS) assert.ok(src.includes(`cl-row-${c}"`), `ListRow.tsx has no cl-row-${c}`);
  assert.ok(src.includes("cl-list-row"), "ListRow.tsx has no cl-list-row");
  const absence = readFileSync(resolve(FSI_APP, "src", "components", "ui", "Absence.tsx"), "utf8");
  assert.ok(src.includes("<Absence") && absence.includes("data-part-variant={variant}") && absence.includes("\"reason\""), "the reason variant is not rendered by Absence from ListRow");
  const html = fixtureHtml();
  assert.equal((html.match(/class="cl-list-row"/g) ?? []).length, 8);
});

test("the CI workflow runs the attack in the app job after the upload step, in fsi-app, with no swallowed failure", () => {
  const text = readFileSync(resolve(ROOT, ".github", "workflows", "ci.yml"), "utf8");
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l === "  app:");
  assert.ok(start >= 0, "ci.yml has no app job");
  const end = lines.findIndex((l, i) => i > start && /^ {2}[A-Za-z0-9_-]+:\s*$/.test(l));
  const steps = lines.slice(start, end < 0 ? undefined : end).join("\n").split(/^\s{6}- name: /m).slice(1);
  const at = steps.findIndex((s) => /forbid/i.test(s.split("\n")[0]));
  assert.ok(at >= 0, "no step names the forbid attack");
  const upload = steps.findIndex((s) => /^Upload the audit result/.test(s));
  assert.ok(at > upload, "the attack step must follow the upload so a red attack never loses the audit artifact");
  const body = steps[at].split(/\n\n {2}# /)[0];
  assert.match(body, /working-directory: fsi-app/);
  assert.match(body, /node scripts\/verify\/attacks\/forbid-fires-attack\.mjs/);
  assert.doesNotMatch(body, /\|\|\s*true|continue-on-error/);
});

test("cliMain: exit 2 without playwright or without a browser, 1 on a vacuous forbid, 0 on a firing one", async () => {
  const log = () => {};
  const specDir = resolve(FSI_APP, ".discipline", "rendering", "audit", "spec");
  assert.equal(await cliMain({ specDir, log, loadPlaywright: () => { throw new Error("Cannot find module 'playwright'"); } }), 2);
  assert.equal(await cliMain({ specDir, log, loadPlaywright: () => ({ chromium: { launch: async () => { throw new Error("no chromium"); } } }) }), 2);
  const withMatches = (matcher) => ({ chromium: { launch: async () => ({ newPage: async () => ({ setContent: async () => {}, evaluate: async () => matcher() }), close: async () => {} }) } });
  assert.equal(await cliMain({ specDir, log, loadPlaywright: () => withMatches(() => []) }), 1);
  assert.equal(await cliMain({ specDir, log, loadPlaywright: () => withMatches(() => ids((c) => c.shouldFire)) }), 0);
  assert.equal(await cliMain({ specDir: "/nonexistent-spec-dir", log, loadPlaywright: () => withMatches(() => []) }), 2);
});
