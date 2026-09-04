// Tests for run-extraction.mjs — the forward-events family's canonical, self-emitting entry point
// (Wave MH-5). node:test + node:assert/strict, no npm deps, same discipline as
// extract-forward-events.test.mjs in this directory.
//
// Run: node --test scripts/forward-events/run-extraction.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadCorpus,
  itemId,
  runExtraction,
  buildRunArtifact,
  FORWARD_EVENTS_GOVERNING_FILES,
} from "./run-extraction.mjs";
import { validateRunArtifact } from "../lib/run-artifact.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNNER_PATH = join(HERE, "run-extraction.mjs");

function tmpDir() {
  return mkdtempSync(join(tmpdir(), "run-extraction-test-"));
}

// A minimal claim carrying a real, extractable obligation-binding date — same shape
// extract-forward-events.test.mjs's oneClaim() fixtures use.
function itemWithOneEvent(id) {
  const text = "This Regulation shall enter into force on 1 January 2027.";
  return {
    id,
    claims: [{ claim_id: `${id}-c1`, kind: "FACT", text, span: text }],
    sections: [],
  };
}

function itemWithNoEvent(id) {
  return {
    id,
    claims: [{ claim_id: `${id}-c1`, kind: "FACT", text: "no dates here", span: "no dates here" }],
    sections: [],
  };
}

// ── loadCorpus ───────────────────────────────────────────────────────────────────────────────────

test("loadCorpus: accepts a bare JSON array of items", () => {
  const dir = tmpDir();
  try {
    const path = join(dir, "corpus.json");
    const items = [itemWithOneEvent("a")];
    writeFileSync(path, JSON.stringify(items));
    assert.deepEqual(loadCorpus(path), items);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadCorpus: accepts { "items": [...] }', () => {
  const dir = tmpDir();
  try {
    const path = join(dir, "corpus.json");
    const items = [itemWithOneEvent("a")];
    writeFileSync(path, JSON.stringify({ items }));
    assert.deepEqual(loadCorpus(path), items);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadCorpus RED: neither shape throws a named usage error", () => {
  const dir = tmpDir();
  try {
    const path = join(dir, "corpus.json");
    writeFileSync(path, JSON.stringify({ not_items: [] }));
    assert.throws(() => loadCorpus(path), /must be a JSON array of items/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── itemId ───────────────────────────────────────────────────────────────────────────────────────

test("itemId: prefers item.id", () => {
  assert.equal(itemId({ id: "abc" }, 0), "abc");
});

test("itemId: falls back to a positional label when nothing identifies the item", () => {
  assert.equal(itemId({}, 2), "corpus-index-2");
});

// ── runExtraction: pure, drives the family's REAL extractForwardEvents ────────────────────────────

test("runExtraction: an item with a real obligation-binding date produces one event, tagged with the item id", () => {
  const result = runExtraction([itemWithOneEvent("item-1")]);
  assert.equal(result.metrics.items_processed, 1);
  assert.equal(result.metrics.items_with_events, 1);
  assert.equal(result.metrics.events_emitted, 1);
  assert.equal(result.perItem[0].outcome, "extracted");
  assert.equal(result.allEvents.length, 1);
  assert.equal(result.allEvents[0].item_id, "item-1");
  assert.equal(result.allEvents[0].event_kind, "entry_into_force");
  assert.equal(result.metrics.by_kind.entry_into_force, 1);
});

test("runExtraction: an item with no extractable date produces zero events, outcome no_events, never thrown", () => {
  const result = runExtraction([itemWithNoEvent("item-2")]);
  assert.equal(result.metrics.items_with_events, 0);
  assert.equal(result.metrics.events_emitted, 0);
  assert.equal(result.perItem[0].outcome, "no_events");
});

test("runExtraction: mixed corpus — counts and allEvents/allSkips both reflect every item, tagged correctly", () => {
  const result = runExtraction([itemWithOneEvent("has-event"), itemWithNoEvent("no-event")]);
  assert.equal(result.metrics.items_processed, 2);
  assert.equal(result.metrics.items_with_events, 1);
  assert.deepEqual(
    result.allEvents.map((e) => e.item_id),
    ["has-event"],
  );
});

test("runExtraction: an empty corpus is a legitimate (if useless) run — no crash", () => {
  const result = runExtraction([]);
  assert.equal(result.metrics.items_processed, 0);
  assert.equal(result.metrics.events_emitted, 0);
  assert.deepEqual(result.perItem, []);
});

test("runExtraction: a malformed item (missing claims/sections entirely) is tolerated, never thrown", () => {
  const result = runExtraction([{ id: "malformed" }]);
  assert.equal(result.metrics.items_processed, 1);
  assert.equal(result.perItem[0].outcome, "no_events");
});

// ── by_skip_reason (LAST-PROPOSER-PASS.md proposal 1, 2026-09-01; landed lane FE-SLOT, 2026-09-03) ─

test("runExtraction: metrics.by_skip_reason histograms every skip's reason across the corpus", () => {
  const ambiguousText = "By 2030 nothing else is said.";
  const dueDateText = "within 15 days of the effective date of disapproval";
  const items = [
    {
      id: "ambiguous",
      claims: [{ claim_id: "c1", kind: "FACT", text: ambiguousText, span: ambiguousText }],
      sections: [],
    },
    {
      id: "slot-due-date",
      claims: [
        {
          claim_id: "c2",
          kind: "FACT",
          text: `[due_date] The captured source states a due date, verbatim: «${dueDateText}»`,
          span: dueDateText,
        },
      ],
      sections: [],
    },
    itemWithNoEvent("plain-no-event"),
  ];
  const result = runExtraction(items);
  assert.equal(
    result.metrics.by_skip_reason["date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation"],
    1,
  );
  // dueDateText is a relative/recurring deadline ("within 15 days...") with no calendar date at all —
  // lane FE-SLOT-2 (2026-09-04) split the old single slot_date_unclassified bucket into three named
  // reasons; this claim's span has no parseable calendar date, so it lands in the first one.
  assert.equal(result.metrics.by_skip_reason.relative_deadline_no_calendar_date, 1);
  // plain-no-event's "no dates here" claim never trips a trigger, so it contributes zero skips —
  // by_skip_reason's total must equal metrics.skips exactly, not over- or under-count.
  const totalBySkipReason = Object.values(result.metrics.by_skip_reason).reduce((a, b) => a + b, 0);
  assert.equal(totalBySkipReason, result.metrics.skips);
});

// ── buildRunArtifact: shape + schema ────────────────────────────────────────────────────────────

test("buildRunArtifact: a successful run's artifact validates against CONVENTION.md's schema (validateRunArtifact — what F28 checks)", () => {
  const result = runExtraction([itemWithOneEvent("item-1")]);
  const artifact = buildRunArtifact({
    runId: "forward-events-run-002",
    harnessVersion: "sha256:aaaaaaaaaaaaaaaa",
    startedAt: "2026-09-01T00:00:00Z",
    finishedAt: "2026-09-01T00:00:05Z",
    inputPath: "/tmp/corpus.json",
    outDir: "/tmp/out",
    execute: true,
    result,
    runError: null,
    eventsPath: "/tmp/out/corpus.events.json",
    skipsPath: "/tmp/out/corpus.skipped.json",
  });
  assert.deepEqual(validateRunArtifact(artifact), []);
  assert.equal(artifact.harness_family, "forward-events");
  assert.equal(artifact.defects_found.length, 0);
});

test("buildRunArtifact: a thrown-failure run still produces a SCHEMA-VALID artifact — full_trace_refs falls back to the input path, defects_found records the error", () => {
  const artifact = buildRunArtifact({
    runId: "forward-events-run-003",
    harnessVersion: "sha256:aaaaaaaaaaaaaaaa",
    startedAt: "2026-09-01T00:00:00Z",
    finishedAt: "2026-09-01T00:00:01Z",
    inputPath: "/tmp/bad-corpus.json",
    outDir: "/tmp/out",
    execute: true,
    result: null,
    runError: new Error("--input must be a JSON array of items; got object"),
    eventsPath: null,
    skipsPath: null,
  });
  assert.deepEqual(validateRunArtifact(artifact), []);
  assert.deepEqual(artifact.per_item, []);
  assert.deepEqual(artifact.metrics, {});
  assert.equal(artifact.defects_found.length, 1);
  assert.match(artifact.defects_found[0].description, /threw during an --execute run/);
  assert.equal(artifact.defects_found[0].fix_ref, null);
  assert.deepEqual(artifact.full_trace_refs, ["/tmp/bad-corpus.json"]);
});

// ── subprocess integration: the real CLI, end to end ────────────────────────────────────────────

function run(args) {
  try {
    const stdout = execFileSync(process.execPath, [RUNNER_PATH, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stdout };
  } catch (err) {
    return { status: err.status, stdout: err.stdout, stderr: err.stderr };
  }
}

test("CLI: --dry-run (the default, no --execute) writes NOTHING to disk", () => {
  const dir = tmpDir();
  try {
    const inputPath = join(dir, "corpus.json");
    writeFileSync(inputPath, JSON.stringify([itemWithOneEvent("item-1")]));
    const harnessRunsDir = join(dir, "harness-runs", "forward-events");
    const res = run(["--input", inputPath, "--harness-runs-dir", harnessRunsDir]);
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /\[dry-run\]/);
    assert.equal(existsSync(harnessRunsDir), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI --execute: artifact written on SUCCESS — a real corpus produces forward-events-run-001.json that validates against CONVENTION.md's schema", () => {
  const dir = tmpDir();
  try {
    const inputPath = join(dir, "corpus.json");
    writeFileSync(inputPath, JSON.stringify([itemWithOneEvent("item-1"), itemWithNoEvent("item-2")]));
    const harnessRunsDir = join(dir, "harness-runs", "forward-events");
    const res = run(["--input", inputPath, "--execute", "--harness-runs-dir", harnessRunsDir, "--out-dir", dir]);
    assert.equal(res.status, 0, res.stderr);

    const artifactPath = join(harnessRunsDir, "forward-events-run-001.json");
    assert.ok(existsSync(artifactPath));
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
    assert.deepEqual(validateRunArtifact(artifact), [], "the written artifact must validate against F28's own schema check");
    assert.equal(artifact.metrics.items_processed, 2);
    assert.equal(artifact.metrics.events_emitted, 1);
    assert.equal(artifact.defects_found.length, 0);
    assert.ok(existsSync(join(dir, "corpus.events.json")));
    assert.ok(existsSync(join(dir, "corpus.skipped.json")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI --execute: artifact written on THROWN FAILURE — an unparseable corpus file still produces a schema-valid artifact recording the error", () => {
  const dir = tmpDir();
  try {
    const inputPath = join(dir, "corpus.json");
    writeFileSync(inputPath, "{ this is not valid json");
    const harnessRunsDir = join(dir, "harness-runs", "forward-events");
    const res = run(["--input", inputPath, "--execute", "--harness-runs-dir", harnessRunsDir]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /run-extraction: FAILED/);

    const artifactPath = join(harnessRunsDir, "forward-events-run-001.json");
    assert.ok(existsSync(artifactPath), "even a thrown failure must leave a run artifact — no run escapes recording");
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
    assert.deepEqual(validateRunArtifact(artifact), []);
    assert.equal(artifact.defects_found.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI --execute: two consecutive real runs claim distinct, incrementing run ids", () => {
  const dir = tmpDir();
  try {
    const inputPath = join(dir, "corpus.json");
    writeFileSync(inputPath, JSON.stringify([itemWithOneEvent("item-1")]));
    const harnessRunsDir = join(dir, "harness-runs", "forward-events");
    run(["--input", inputPath, "--execute", "--harness-runs-dir", harnessRunsDir, "--out-dir", dir]);
    run(["--input", inputPath, "--execute", "--harness-runs-dir", harnessRunsDir, "--out-dir", dir, "--out-basename", "corpus2"]);
    const artifacts = readdirSync(harnessRunsDir).filter((f) => f.endsWith(".json")).sort();
    assert.deepEqual(artifacts, ["forward-events-run-001.json", "forward-events-run-002.json"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("FORWARD_EVENTS_GOVERNING_FILES matches CONVENTION.md's / F28's forward-events entry exactly", async () => {
  const conventionMd = readFileSync(join(HERE, "..", "harness-runs", "CONVENTION.md"), "utf8");
  assert.ok(conventionMd.includes("extract-forward-events.mjs"), "CONVENTION.md must still name the extractor");
  assert.ok(conventionMd.includes("forward-events/PROTOCOL.md"), "CONVENTION.md must still name PROTOCOL.md");
  const f28Src = readFileSync(
    join(HERE, "..", "..", ".discipline", "fitness", "functions", "F28-harness-run-integrity.mjs"),
    "utf8",
  );
  for (const f of FORWARD_EVENTS_GOVERNING_FILES) {
    assert.ok(f28Src.includes(`'${f}'`), `F28's GOVERNING_FILES['forward-events'] must still list ${f}`);
  }
});

// ── DEDUPE-PLUMB (2026-09-04, PROPOSER-5 finding): the extractor's dedupe counts reach the artifact ──

test("runExtraction: dedupe drops the extractor records reach metrics.dedupe_dropped and result.dedupeDropped, tagged by item", () => {
  const text = "This Regulation shall enter into force on 1 January 2027.";
  // The same sentence once as a FACT claim and once as section prose: FWD-TEXT's content-gated dedupe
  // keeps the claim-backed event and records the section-backed drop.
  const item = {
    id: "dup",
    claims: [{ claim_id: "dup-c1", kind: "FACT", text, span: text }],
    sections: [{ section_id: "dup-s1", md: text }],
  };
  const result = runExtraction([item, itemWithOneEvent("single")]);
  assert.equal(typeof result.metrics.dedupe_dropped, "number");
  assert.ok(result.metrics.dedupe_dropped >= 1, `expected at least one recorded drop, got ${result.metrics.dedupe_dropped}`);
  assert.equal(result.dedupeDropped.length, result.metrics.dedupe_dropped);
  assert.ok(result.dedupeDropped.every((d) => d.item_id === "dup"), "every drop is tagged with its item");
  assert.equal(result.metrics.events_emitted, 2, "one event per item survives");
});
