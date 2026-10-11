#!/usr/bin/env node
// forbid-fires-attack.mjs -- the design audit's D-M4 forbid rows attacked in a real browser (lane TESTS-2, 2026-10-10;
// docs/ops/session-log.d/2026-10-08-daudit2-design-audit.md "The vacuous-guard repair ... is not proven by attack"; CLAUDE.md
// rule 15, a guard is proven by attack, not by presence).
//
// DAUDIT-2 repaired 90 vacuous `forbid` entries (14 specs). A forbid that matches nothing reports MATCH forever, so a repair
// only counts if the selector FIRES on the defect it names. The D-M4 forbid ("no list row carries more than one absence token")
// is the same selector in every spec that carries it. This script:
//   1. reads every spec under .discipline/rendering/audit/spec/ and collects each forbid whose name starts with "D-M4";
//      fails when there are none, or when they are not all one selector (a divergent copy would escape the attack);
//   2. loads a fixture page (list rows shaped like ListRow.tsx: .cl-list-row holding .cl-row-impact, .cl-row-due and
//      .cl-row-tier cells, each absence token a [data-part-variant="reason"] element) into chromium;
//   3. ATTACK  rows with a reason token in TWO or THREE cells must each be matched by the selector (the forbid fires);
//      CONTROL rows with a token in ONE cell, or none, must not be matched (the forbid is not a blanket match).
// The harness counts matches with document.querySelectorAll, as run-audit.mjs does; so does this.
//
// Needs playwright and a chromium (the design-audit job's container has both). Exit: 0 every attack fired and every control
// stayed quiet; 1 one did not; 2 cannot run (no playwright, no browser, no spec found).

import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isMainModule } from "../../lib/is-main.mjs";

const FSI_APP = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const SPEC_DIR = join(FSI_APP, ".discipline", "rendering", "audit", "spec");
export const FORBID_NAME_PREFIX = "D-M4";

/** The three value cells of a list row that can each carry an absence token. */
export const CELLS = Object.freeze(["impact", "due", "tier"]);

/** One fixture row. `reasons` names the cells that carry an absence token. */
function rowHtml(id, reasons) {
  const cell = (c) => {
    const inner = reasons.includes(c) ? '<span data-part-variant="reason">NOT SCORED</span>' : "<span>7/12</span>";
    return `<span class="cl-row-${c}">${inner}</span>`;
  };
  return `<div class="cl-list-row" data-case="${id}">${CELLS.map(cell).join("")}</div>`;
}

const SUBSETS = (() => {
  const out = [[]];
  for (const c of CELLS) for (const s of [...out]) out.push([...s, c]);
  return out;
})();

/** Every subset of the three cells: the ones with two or more tokens are the defect, the rest are the controls. */
export const CASES = Object.freeze(SUBSETS.map((reasons) => Object.freeze({
  id: reasons.length === 0 ? "none" : reasons.join("+"),
  reasons: Object.freeze(reasons),
  shouldFire: reasons.length >= 2,
})));

export function fixtureHtml(cases = CASES) {
  return `<!doctype html><html><body>${cases.map((c) => rowHtml(c.id, c.reasons)).join("")}</body></html>`;
}

/** The D-M4 forbids across a spec directory: [{ file, selector }]. Injectable reader for the tests. */
export function collectForbids(dir = SPEC_DIR, { list = readdirSync, read = (p) => readFileSync(p, "utf8") } = {}) {
  const out = [];
  for (const file of list(dir).filter((f) => f.endsWith(".json")).sort()) {
    const spec = JSON.parse(read(join(dir, file)));
    for (const f of spec.forbid ?? []) if (String(f.name ?? "").startsWith(FORBID_NAME_PREFIX)) out.push({ file, selector: f.selector });
  }
  return out;
}

/**
 * Judge a set of forbids against matches. `matchedCaseIds(selector)` returns the ids of the fixture rows the selector
 * matched (the browser in production, a fake in the unit tests). Returns { lines, violations }.
 */
export async function judge({ forbids, matchedCaseIds, cases = CASES }) {
  const violations = [];
  const lines = [];
  if (forbids.length === 0) violations.push(`no spec carries a forbid named ${FORBID_NAME_PREFIX}*; there is nothing to attack`);
  const selectors = [...new Set(forbids.map((f) => f.selector))];
  if (selectors.length > 1) {
    violations.push(`the ${FORBID_NAME_PREFIX} forbids are ${selectors.length} different selectors; only one canonical form is attacked (files: ${forbids.map((f) => f.file).join(", ")})`);
  }
  for (const selector of selectors) {
    const got = new Set(await matchedCaseIds(selector));
    for (const c of cases) {
      const fired = got.has(c.id);
      if (c.shouldFire && !fired) violations.push(`ATTACK not caught: a row with a token in ${c.reasons.join(" and ")} is not matched, so the forbid is vacuous`);
      if (!c.shouldFire && fired) violations.push(`CONTROL tripped: a row with ${c.reasons.length === 0 ? "no token" : `a token in ${c.reasons[0]} only`} is matched, so the forbid refuses a legitimate row`);
    }
    const caught = cases.filter((c) => c.shouldFire && got.has(c.id)).length;
    lines.push(`D-M4 selector (${forbids.filter((f) => f.selector === selector).length} specs): fired on ${caught} of ${cases.filter((c) => c.shouldFire).length} defect rows, matched ${[...got].filter((id) => cases.find((c) => c.id === id && !c.shouldFire)).length} legitimate rows`);
  }
  return { lines, violations };
}

/** The CLI body with every side effect injectable. Returns the exit code. */
export async function cliMain({
  specDir = SPEC_DIR,
  loadPlaywright = () => createRequire(import.meta.url)("playwright"),
  log = console.log,
} = {}) {
  let forbids;
  try { forbids = collectForbids(specDir); } catch (e) { log(`forbid-fires-attack: cannot read the specs (${e.message}). Exit 2.`); return 2; }
  let chromium;
  try { ({ chromium } = loadPlaywright()); } catch (e) { log(`forbid-fires-attack: playwright is not installed (${String(e.message).split("\n")[0]}). Cannot verify, exit 2.`); return 2; }
  let browser;
  try { browser = await chromium.launch(); } catch (e) { log(`forbid-fires-attack: no browser (${String(e.message).split("\n")[0]}). Cannot verify, exit 2.`); return 2; }
  try {
    const page = await browser.newPage();
    await page.setContent(fixtureHtml());
    const { lines, violations } = await judge({
      forbids,
      matchedCaseIds: (selector) => page.evaluate((sel) => [...document.querySelectorAll(sel)].map((el) => el.getAttribute("data-case")), selector),
    });
    lines.forEach((l) => log(l));
    violations.forEach((v) => log(`VIOLATION ${v}`));
    return violations.length === 0 ? 0 : 1;
  } finally {
    await browser.close();
  }
}

if (isMainModule(import.meta.url)) {
  process.exit(await cliMain());
}
