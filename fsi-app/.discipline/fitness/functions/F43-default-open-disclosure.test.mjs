// @ts-check
// Red-then-green for F43 (default-open-disclosure). CLAUDE.md rule 15: a guard is proven by attack,
// not by presence. Every RED case below is a real shape this repo carried or could carry, starting
// with the two the sweep of 2026-09-08 actually found.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fitnessFunction, findDefaultOpenSites, isAllowed, lineOf } from "./F43-default-open-disclosure.mjs";

const FILE = "fsi-app/src/components/resource/IntelligenceBrief.tsx";

test("RED: the exact source found on 2026-09-08, IntelligenceBrief's table of contents", () => {
  const src = [
    "export function IntelligenceBrief({ markdown }) {",
    "  const [tocOpen, setTocOpen] = useState(true);",
    "  return <div>{tocOpen && <nav />}</div>;",
    "}",
  ].join("\n");
  const v = fitnessFunction.check(FILE, src);
  assert.equal(v.length, 1);
  assert.equal(v[0].line, 2, "the violation points at the initialiser, not at the file");
  assert.match(v[0].message, /`tocOpen` starts `true`/);
  assert.match(v[0].message, /no items expanded when first navigtaing to a page/);
});

test("RED: the other one, a nav group section whose `open` starts true", () => {
  const v = fitnessFunction.check(FILE, "  const [open, setOpen] = useState(true);");
  assert.equal(v.length, 1);
});

test("RED: the inverted spelling, `collapsed` starting false is the same first render", () => {
  const v = fitnessFunction.check(FILE, "const [collapsed, setCollapsed] = useState(false);");
  assert.equal(v.length, 1);
  assert.match(v[0].message, /starts `false`, which is OPEN for that name/);
});

test("RED: a typed initialiser is not a hiding place", () => {
  assert.equal(fitnessFunction.check(FILE, "const [isExpanded, set] = useState<boolean>(true);").length, 1);
});

test("RED: a defaultOpen / defaultExpanded / defaultIndex prop that defaults truthy", () => {
  assert.equal(fitnessFunction.check(FILE, "function C({ defaultOpen = true }) {}").length, 1);
  assert.equal(fitnessFunction.check(FILE, "function C({ defaultExpanded = true }) {}").length, 1);
  assert.equal(fitnessFunction.check(FILE, "function C({ defaultIndex = 0 }) {}").length, 1);
  assert.equal(fitnessFunction.check(FILE, "function C({ expandedByDefault = true }) {}").length, 1);
});

test("RED: a JSX call site passing it, with a value or bare", () => {
  assert.equal(fitnessFunction.check(FILE, "<Accordion defaultOpen={true} />").length, 1);
  assert.equal(fitnessFunction.check(FILE, "<Accordion defaultOpen />").length, 1);
});

test("RED: a native <details open>", () => {
  const v = fitnessFunction.check(FILE, '<details open className="x"><summary>S</summary></details>');
  assert.equal(v.length, 1);
  assert.match(v[0].message, /`<details open>`/);
});

test("GREEN: the fix, the same disclosures start closed", () => {
  const src = [
    "const [tocOpen, setTocOpen] = useState(false);",
    "const [open, setOpen] = useState(false);",
    "const [collapsed, setCollapsed] = useState(true);",
    "function C({ defaultOpen = false }) {}",
    "<details><summary>S</summary></details>",
  ].join("\n");
  assert.deepEqual(fitnessFunction.check(FILE, src), []);
});

test("GREEN: a `loading` / `busy` / `autoVerify` boolean is not a disclosure", () => {
  const src = [
    "const [loading, setLoading] = useState(true);",
    "const [checkingSession, setCheckingSession] = useState(true);",
    "const [autoVerify, setAutoVerify] = useState(true);",
  ].join("\n");
  assert.deepEqual(fitnessFunction.check(FILE, src), []);
});

test("GREEN: an explicit `fitness-allow: F43` marker above the initialiser exempts that site", () => {
  const src = [
    "// fitness-allow: F43 (R3, the FILTERS rail's stated 'first two groups open' default)",
    "const [open, setOpen] = useState(true);",
  ].join("\n");
  assert.deepEqual(fitnessFunction.check(FILE, src), []);
});

test("the allow marker reaches five lines, and no further", () => {
  const lines = ["// fitness-allow: F43 (x)", "", "", "", "", "", "const [open] = useState(true);"];
  assert.equal(isAllowed(lines, 6), true, "five lines above is inside the window");
  assert.equal(isAllowed(lines, 7), false, "six lines above is outside it");
});

test("lineOf counts from 1 and findDefaultOpenSites deduplicates a line", () => {
  assert.equal(lineOf("a\nb\nc", 4), 3);
  const sites = findDefaultOpenSites("const [open, setOpen] = useState(true);");
  assert.equal(sites.length, 1);
  assert.equal(sites[0].line, 1);
});

test("the function declares its id, its scope and the operator's own words as its source", () => {
  assert.equal(fitnessFunction.id, "F43");
  assert.equal(fitnessFunction.name, "default-open-disclosure");
  assert.match(fitnessFunction.source, /no items expanded when first navigtaing to a page/);
  assert.ok(fitnessFunction.enumerate().every((f) => f.startsWith("fsi-app/src/components/")));
});

test("GREEN: a substring hit that is not disclosure state stays green (camelCase word boundaries)", () => {
  const src = [
    "const [reopenQueue, setReopenQueue] = useState(true);",
    "const [openingHours, setOpeningHours] = useState(true);",
  ].join("\n");
  assert.deepEqual(fitnessFunction.check(FILE, src), []);
});
