// workflow-pr-concurrency.test.mjs (lane CI-MIN-0, 2026-10-10; ADR-047, docs/plans/ci-minutes-plan-2026-10-10.md).
// One CI run per pull request. GitHub Actions minutes are metered (2,000 per month, spending limit 0), so a
// superseded pull_request run is pure waste. Every workflow with a pull_request trigger MUST carry a top-level
// `concurrency` block whose group embeds the PR number and whose cancel-in-progress is true for pull_request
// events. A workflow that also runs on another event (push to master, a dispatch) keeps the "never cancel a
// master validation" behaviour: its cancel-in-progress must then be CONDITIONAL on the pull_request event, never
// a bare true (a bare true would let a second merge cancel the first merge's validation).
// Pure text scan, comments ignored, no npm import (the required no-npm suite runs this file).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKFLOWS = resolve(HERE, "..", "..", "..", ".github", "workflows");

/** Lines of a workflow with full-line comments removed and trailing comments stripped. */
function codeLines(text) {
  return text.split(/\r?\n/).filter((l) => !/^\s*#/.test(l)).map((l) => l.replace(/\s+#.*$/, ""));
}

/** The lines of the top-level block `key:` (the key line's remainder first), up to the next top-level key. */
function topBlock(lines, key) {
  const start = lines.findIndex((l) => new RegExp(`^${key}:`).test(l));
  if (start === -1) return null;
  const body = [lines[start].replace(new RegExp(`^${key}:`), "")];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\S/.test(lines[i])) break;
    body.push(lines[i]);
  }
  return body;
}

/** The set of events a workflow triggers on: block form, inline list form or scalar form. */
export function triggerEvents(text) {
  const on = topBlock(codeLines(text), "on");
  if (!on) return new Set();
  const events = new Set();
  const first = on[0].trim();
  if (first) for (const e of first.replace(/[\[\]]/g, "").split(",").map((s) => s.trim()).filter(Boolean)) events.add(e);
  for (const l of on.slice(1)) {
    const m = /^ {2}([a-z_]+):/.exec(l);
    if (m) events.add(m[1]);
  }
  return events;
}

/** Violations of the one-run-per-PR rule in one workflow's text. PURE. */
export function findConcurrencyViolations(name, text) {
  const events = triggerEvents(text);
  if (!events.has("pull_request") && !events.has("pull_request_target")) return [];
  const block = topBlock(codeLines(text), "concurrency");
  if (!block) return [`${name}: pull_request workflow has no top-level concurrency block`];
  const joined = block.join("\n");
  const out = [];
  const group = /group:\s*(.+)/.exec(joined);
  if (!group || !/github\.event\.pull_request\.number/.test(group[1])) {
    out.push(`${name}: concurrency group does not embed github.event.pull_request.number (a per-PR group)`);
  }
  const cancel = /cancel-in-progress:\s*(.+)/.exec(joined);
  const value = cancel ? cancel[1].trim() : "";
  const conditional = /github\.event_name\s*==\s*['"]pull_request['"]/.test(value);
  if (!cancel) out.push(`${name}: concurrency has no cancel-in-progress`);
  else if (value !== "true" && !conditional) out.push(`${name}: cancel-in-progress is not true for pull_request events: ${value}`);
  const otherEvents = [...events].filter((e) => e !== "pull_request" && e !== "pull_request_target");
  if (cancel && value === "true" && otherEvents.length > 0) {
    out.push(`${name}: cancel-in-progress is a bare true but the workflow also runs on ${otherEvents.join(", ")}; make it conditional on the pull_request event so a master validation is never cancelled`);
  }
  return out;
}

const GOOD_PR_ONLY = [
  "on:", "  pull_request:", "    branches: [master]", "concurrency:",
  "  group: ${{ github.workflow }}-${{ github.event.pull_request.number }}", "  cancel-in-progress: true", "jobs:", "  a:", "    runs-on: x",
].join("\n");
const GOOD_MIXED = [
  "on:", "  push:", "    branches: [master]", "  pull_request:", "    branches: [master]", "concurrency:",
  "  group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}",
  "  cancel-in-progress: ${{ github.event_name == 'pull_request' }}", "jobs:", "  a:", "    runs-on: x",
].join("\n");

test("every pull_request workflow carries a per-PR concurrency group with cancel-in-progress for pull_request events", () => {
  const files = readdirSync(WORKFLOWS).filter((f) => f.endsWith(".yml"));
  assert.ok(files.length >= 20, `expected to scan the real workflows directory, found ${files.length} file(s)`);
  const prWorkflows = files.filter((f) => triggerEvents(readFileSync(join(WORKFLOWS, f), "utf8")).has("pull_request"));
  assert.ok(prWorkflows.length >= 6, `expected the known pull_request workflows, found ${prWorkflows.length}`);
  const violations = files.flatMap((f) => findConcurrencyViolations(f, readFileSync(join(WORKFLOWS, f), "utf8")));
  assert.deepEqual(violations, [], "add concurrency: group per PR number and cancel-in-progress for pull_request events (ADR-047)");
});

test("ATTACK: a pull_request workflow without concurrency, without a per-PR group or without cancel-in-progress FAILS", () => {
  const none = ["on:", "  pull_request:", "    branches: [master]", "jobs:", "  a:", "    runs-on: x"].join("\n");
  assert.equal(findConcurrencyViolations("none.yml", none).length, 1);
  const noGroupNumber = GOOD_PR_ONLY.replace("github.event.pull_request.number", "github.ref");
  assert.match(findConcurrencyViolations("g.yml", noGroupNumber).join(), /per-PR group/);
  const noCancel = GOOD_PR_ONLY.replace("  cancel-in-progress: true\n", "");
  assert.match(findConcurrencyViolations("c.yml", noCancel).join(), /no cancel-in-progress/);
  const falseCancel = GOOD_PR_ONLY.replace("cancel-in-progress: true", "cancel-in-progress: false");
  assert.match(findConcurrencyViolations("f.yml", falseCancel).join(), /not true for pull_request/);
});

test("ATTACK: a bare true on a workflow that also runs on push FAILS (a master validation must never be cancelled)", () => {
  const bare = GOOD_MIXED.replace("${{ github.event_name == 'pull_request' }}", "true");
  assert.match(findConcurrencyViolations("m.yml", bare).join(), /bare true/);
});

test("ATTACK: the inline and scalar trigger forms are recognised; a comment cannot supply the block", () => {
  const inline = ["on: [push, pull_request]", "jobs:", "  a:", "    runs-on: x"].join("\n");
  assert.equal(findConcurrencyViolations("i.yml", inline).length, 1);
  const scalar = ["on: pull_request", "jobs:", "  a:", "    runs-on: x"].join("\n");
  assert.equal(findConcurrencyViolations("s.yml", scalar).length, 1);
  const commented = GOOD_PR_ONLY.split("\n").map((l) => (/^(concurrency:|  group:|  cancel-in-progress:)/.test(l) ? `# ${l}` : l)).join("\n");
  assert.equal(findConcurrencyViolations("k.yml", commented).length, 1);
});

test("compliant fixtures pass; a workflow with no pull_request trigger is out of scope", () => {
  assert.deepEqual(findConcurrencyViolations("ok1.yml", GOOD_PR_ONLY), []);
  assert.deepEqual(findConcurrencyViolations("ok2.yml", GOOD_MIXED), []);
  const cron = ["on:", "  schedule:", "    - cron: '0 0 * * *'", "jobs:", "  a:", "    runs-on: x"].join("\n");
  assert.deepEqual(findConcurrencyViolations("cron.yml", cron), []);
});
