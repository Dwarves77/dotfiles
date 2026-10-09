// Tests for loop-run-id.mjs (lane M3, 2026-09-19; rewritten for Amendment 2's config.github_run_id
// match). node:test + node:assert/strict, node: builtins + relative imports only (portable, no-npm
// glob). Run: node --test scripts/lib/loop-run-id.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveLoopRunId, resolveLoopRunIdFromUpstream, FAMILY_BY_WORKFLOW_NAME } from "./loop-run-id.mjs";
import { LOOP_HOPS } from "../../.discipline/governance/loop-manifest.mjs";

// The harness ledger export is the repo's REAL committed file by default (lane GATE-9), so a fixture test that
// writes artifacts into a temp dir must pin the ledger it resolves against; "absent" is the file-path
// behaviour these fixtures exercise (an artifact is trusted on its own fields when no export is present).
const LEDGER_NONE = { present: false, capturedAt: null, rows: [] };

function withTmpDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "loop-run-id-test-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Write one minimal valid run artifact of `family`, with an arbitrary `config` object. */
function writeArtifact(dir, family, runNum, config) {
  const runId = `${family}-run-${String(runNum).padStart(3, "0")}`;
  const artifact = {
    harness_family: family,
    harness_version: "sha256:0000000000000000",
    run_id: runId,
    started_at: new Date().toISOString(),
    config,
    inputs_ref: ["x"],
    per_item: [],
    metrics: {},
    defects_found: [],
    full_trace_refs: ["x"],
    proposer_notes: "test fixture",
  };
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${runId}.json`), JSON.stringify(artifact, null, 2) + "\n", "utf8");
}

test("resolveLoopRunId: explicit always wins, even when it would not match any artifact", () => {
  withTmpDir((dir) => {
    writeArtifact(dir, "source-sweep", 1, { github_run_id: "12345", loop_run_id: "12345" });
    const got = resolveLoopRunId({
      explicit: "custom-loop-id",
      upstreamFamily: "source-sweep",
      upstreamRunId: "12345",
      harnessRunsDir: dir,
      ledger: LEDGER_NONE,
    });
    assert.equal(got, "custom-loop-id");
  });
});

test("resolveLoopRunId: matches by config.github_run_id (never config.loop_run_id) and returns that artifact's own loop_run_id", () => {
  withTmpDir((dir) => {
    // The sweep carries an EXPLICIT loop_run_id different from its own run id -- Amendment 2's own
    // worked example (the proof run passes --loop-run-id, so github_run_id != loop_run_id).
    writeArtifact(dir, "source-sweep", 1, { github_run_id: "1001", loop_run_id: "explicit-loop-id-99" });
    const got = resolveLoopRunId({
      explicit: null,
      upstreamFamily: "source-sweep",
      upstreamRunId: "1001",
      harnessRunsDir: dir,
      ledger: LEDGER_NONE,
    });
    assert.equal(got, "explicit-loop-id-99");
  });
});

test("resolveLoopRunId: a matching config.loop_run_id with a DIFFERENT config.github_run_id never matches (the retired Amendment 1 mechanism)", () => {
  withTmpDir((dir) => {
    writeArtifact(dir, "source-sweep", 1, { github_run_id: "9999", loop_run_id: "1001" });
    const got = resolveLoopRunId({
      explicit: null,
      upstreamFamily: "source-sweep",
      upstreamRunId: "1001",
      harnessRunsDir: dir,
      ledger: LEDGER_NONE,
    });
    assert.equal(got, null);
  });
});

test("resolveLoopRunId: no matching artifact -- returns null (never invents an id)", () => {
  withTmpDir((dir) => {
    writeArtifact(dir, "source-sweep", 1, { github_run_id: "11111", loop_run_id: "11111" });
    const got = resolveLoopRunId({
      explicit: "",
      upstreamFamily: "source-sweep",
      upstreamRunId: "99999",
      harnessRunsDir: dir,
      ledger: LEDGER_NONE,
    });
    assert.equal(got, null);
  });
});

test("resolveLoopRunId: a matched artifact with no loop_run_id field at all -- null, not a crash", () => {
  withTmpDir((dir) => {
    writeArtifact(dir, "source-sweep", 1, { github_run_id: "12345", walker: "sitemap" });
    const got = resolveLoopRunId({
      explicit: undefined,
      upstreamFamily: "source-sweep",
      upstreamRunId: "12345",
      harnessRunsDir: dir,
      ledger: LEDGER_NONE,
    });
    assert.equal(got, null);
  });
});

test("resolveLoopRunId: an artifact written outside GitHub Actions (github_run_id: null) never matches", () => {
  withTmpDir((dir) => {
    writeArtifact(dir, "source-sweep", 1, { github_run_id: null, loop_run_id: "some-loop-id" });
    const got = resolveLoopRunId({
      explicit: undefined,
      upstreamFamily: "source-sweep",
      upstreamRunId: "12345",
      harnessRunsDir: dir,
      ledger: LEDGER_NONE,
    });
    assert.equal(got, null);
  });
});

test("resolveLoopRunId: no upstreamRunId given at all (e.g. a bare workflow_dispatch with no upstream) -- null, no match attempted", () => {
  withTmpDir((dir) => {
    writeArtifact(dir, "source-sweep", 1, { github_run_id: "11111", loop_run_id: "11111" });
    const got = resolveLoopRunId({
      explicit: undefined,
      upstreamFamily: "source-sweep",
      upstreamRunId: undefined,
      harnessRunsDir: dir,
      ledger: LEDGER_NONE,
    });
    assert.equal(got, null);
  });
});

// ── attack form (rule 15): a seven-hop chain (lane M4, 2026-09-20, extends M3b's six-hop chain with
// brief-export), matched hop to hop, then one hop's github_run_id is broken and the next hop resolves
// null. This is the mechanical proof that the fix generalizes past hop 1, the exact gap Amendment 2
// closes, now proven all the way to the brief-export hop this lane wires. ──────────────────────────────

test("resolveLoopRunId ATTACK: a seven-hop chain resolves hop to hop to the sweep's own explicit loop id, distinct from every hop's own run id", () => {
  withTmpDir((base) => {
    const sweepDir = join(base, "source-sweep");
    const fetchDrainDir = join(base, "fetch-drain");
    const ledgerConsumeDir = join(base, "ledger-consume");
    // Hops 5, 6 and 7 resolve through resolveLoopRunIdFromUpstream, which builds its own
    // harnessRunsDir as `<fsiRoot>/scripts/harness-runs/<family>` (matching every production
    // caller's convention) -- mint's, downstream-chain's and brief-export's own artifact dirs must sit at
    // that same path under `base` for hop 5, hop 6 and hop 7 to find them.
    const mintDir = join(base, "scripts", "harness-runs", "mint");
    const downstreamChainDir = join(base, "scripts", "harness-runs", "downstream-chain");
    const propagationDir = join(base, "propagation");
    const briefExportDir = join(base, "scripts", "harness-runs", "brief-export");

    // Hop 1: source-sweep, an operator-supplied explicit loop id, different from its own run id.
    writeArtifact(sweepDir, "source-sweep", 1, { github_run_id: "1001", loop_run_id: "explicit-loop-id-99" });

    // Hop 2: fetch-drain, resolving off hop 1, propagating the SAME loop id forward, on its OWN run id.
    const hop2LoopId = resolveLoopRunId({
      explicit: null,
      upstreamFamily: "source-sweep",
      upstreamRunId: "1001",
      harnessRunsDir: sweepDir,
      ledger: LEDGER_NONE,
    });
    writeArtifact(fetchDrainDir, "fetch-drain", 1, { github_run_id: "2002", loop_run_id: hop2LoopId });

    // Hop 3: ledger-consume, resolving off hop 2.
    const hop3LoopId = resolveLoopRunId({
      explicit: null,
      upstreamFamily: "fetch-drain",
      upstreamRunId: "2002",
      harnessRunsDir: fetchDrainDir,
      ledger: LEDGER_NONE,
    });
    writeArtifact(ledgerConsumeDir, "ledger-consume", 1, { github_run_id: "3003", loop_run_id: hop3LoopId });

    // Hop 4: mint, resolving off hop 3.
    const hop4LoopId = resolveLoopRunId({
      explicit: null,
      upstreamFamily: "ledger-consume",
      upstreamRunId: "3003",
      harnessRunsDir: ledgerConsumeDir,
      ledger: LEDGER_NONE,
    });
    writeArtifact(mintDir, "mint", 1, { github_run_id: "4004", loop_run_id: hop4LoopId });

    // Hop 5: downstream-chain, resolving off hop 4 (mint / "Population turn"), through
    // resolveLoopRunIdFromUpstream -- the same name-to-family lookup emit-downstream-chain-artifact.mjs
    // uses in production.
    const hop5LoopId = resolveLoopRunIdFromUpstream({
      explicit: null,
      upstreamName: "Population turn",
      upstreamRunId: "4004",
      fsiRoot: base,
      ledger: LEDGER_NONE,
    });
    writeArtifact(downstreamChainDir, "downstream-chain", 1, { github_run_id: "5005", loop_run_id: hop5LoopId });

    // Hop 6: propagation, resolving off hop 5 (downstream-chain / "Downstream chain"), through the same
    // helper run-propagation-drain.mjs uses in production.
    const hop6LoopId = resolveLoopRunIdFromUpstream({
      explicit: null,
      upstreamName: "Downstream chain",
      upstreamRunId: "5005",
      fsiRoot: base,
      ledger: LEDGER_NONE,
    });
    writeArtifact(propagationDir, "propagation", 1, { github_run_id: "6006", loop_run_id: hop6LoopId });

    // Hop 7: brief-export, resolving off hop 4 (mint / "Population turn") too -- the loop-manifest's own
    // population-turn-to-brief-export hop, wired by this lane (M4). Same upstream as hop 5, a different
    // consumer, proving the shared name-to-family map resolves both branches off the same mint artifact.
    const hop7LoopId = resolveLoopRunIdFromUpstream({
      explicit: null,
      upstreamName: "Population turn",
      upstreamRunId: "4004",
      fsiRoot: base,
      ledger: LEDGER_NONE,
    });
    writeArtifact(briefExportDir, "brief-export", 1, { github_run_id: "7007", loop_run_id: hop7LoopId });

    assert.equal(hop2LoopId, "explicit-loop-id-99");
    assert.equal(hop3LoopId, "explicit-loop-id-99");
    assert.equal(hop4LoopId, "explicit-loop-id-99");
    assert.equal(hop5LoopId, "explicit-loop-id-99");
    assert.equal(hop6LoopId, "explicit-loop-id-99");
    assert.equal(hop7LoopId, "explicit-loop-id-99");
  });
});

// ── FAMILY_BY_WORKFLOW_NAME coverage (lane M3b, 2026-09-20, gate against recurrence) ──────────────────
// Every hop's own producer.name (loop-manifest.mjs's LOOP_HOPS, read from the committed workflow files)
// must be an OWN key of FAMILY_BY_WORKFLOW_NAME -- a new hop with an unmapped producer must fail this
// suite instead of resolving null silently in production. The assertion is a small exported-in-test
// helper so both the real-manifest pass and the attack failure call the SAME function (rule 15: prove
// the test bites).

function assertEveryHopProducerIsMapped(hops, map) {
  for (const hop of hops) {
    const name = hop.producer.name;
    if (!Object.prototype.hasOwnProperty.call(map, name)) {
      throw new Error(`hop "${hop.id}": producer name "${name}" is not an own key of FAMILY_BY_WORKFLOW_NAME`);
    }
  }
}

test("FAMILY_BY_WORKFLOW_NAME: every LOOP_HOPS producer name is a mapped key", () => {
  assert.doesNotThrow(() => assertEveryHopProducerIsMapped(LOOP_HOPS, FAMILY_BY_WORKFLOW_NAME));
});

test("FAMILY_BY_WORKFLOW_NAME ATTACK: removing one producer's key from the map makes the SAME assertion fail", () => {
  const namesInUse = new Set(LOOP_HOPS.map((h) => h.producer.name));
  assert.ok(namesInUse.size > 0, "LOOP_HOPS must name at least one producer for this attack to be meaningful");
  const removedName = namesInUse.values().next().value;
  const brokenMap = { ...FAMILY_BY_WORKFLOW_NAME };
  delete brokenMap[removedName];
  assert.throws(
    () => assertEveryHopProducerIsMapped(LOOP_HOPS, brokenMap),
    new RegExp(`producer name "${removedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}" is not an own key`)
  );
});

// ── resolveLoopRunIdFromUpstream ────────────────────────────────────────────────────────────────────

test("resolveLoopRunIdFromUpstream: a mapped upstream name resolves the same as calling resolveLoopRunId directly", () => {
  withTmpDir((base) => {
    const fsiRoot = base;
    const sweepDir = join(fsiRoot, "scripts", "harness-runs", "source-sweep");
    writeArtifact(sweepDir, "source-sweep", 1, { github_run_id: "1001", loop_run_id: "explicit-loop-id-99" });
    const got = resolveLoopRunIdFromUpstream({
      explicit: null,
      upstreamName: "Source sweep",
      upstreamRunId: "1001",
      fsiRoot,
      ledger: LEDGER_NONE,
    });
    assert.equal(got, "explicit-loop-id-99");
  });
});

test("resolveLoopRunIdFromUpstream: an upstream name mapped to null (Data producers, its own loop head) returns explicit, or null", () => {
  withTmpDir((fsiRoot) => {
    const gotNull = resolveLoopRunIdFromUpstream({
      explicit: null,
      upstreamName: "Data producers",
      upstreamRunId: "1001",
      fsiRoot,
      ledger: LEDGER_NONE,
    });
    assert.equal(gotNull, null);
    const gotExplicit = resolveLoopRunIdFromUpstream({
      explicit: "operator-supplied-loop-id",
      upstreamName: "Data producers",
      upstreamRunId: "1001",
      fsiRoot,
      ledger: LEDGER_NONE,
    });
    assert.equal(gotExplicit, "operator-supplied-loop-id");
  });
});

test("resolveLoopRunIdFromUpstream: an unrecognized upstream name returns explicit, or null, without touching the filesystem", () => {
  withTmpDir((fsiRoot) => {
    const got = resolveLoopRunIdFromUpstream({
      explicit: null,
      upstreamName: "Some Unknown Workflow",
      upstreamRunId: "1001",
      fsiRoot,
      ledger: LEDGER_NONE,
    });
    assert.equal(got, null);
  });
});

test("resolveLoopRunId ATTACK: breaking one hop's github_run_id makes the NEXT hop resolve null, cascading (never a stale/invented id)", () => {
  withTmpDir((base) => {
    const sweepDir = join(base, "source-sweep");
    const fetchDrainDir = join(base, "fetch-drain");
    const ledgerConsumeDir = join(base, "ledger-consume");

    writeArtifact(sweepDir, "source-sweep", 1, { github_run_id: "1001", loop_run_id: "explicit-loop-id-99" });

    const hop2LoopId = resolveLoopRunId({
      explicit: null,
      upstreamFamily: "source-sweep",
      upstreamRunId: "1001",
      harnessRunsDir: sweepDir,
      ledger: LEDGER_NONE,
    });
    // Corrupt hop 2's own recorded github_run_id (simulating a run whose artifact does not carry the id
    // hop 3's own workflow_run event actually names) -- write "9999" instead of "2002".
    writeArtifact(fetchDrainDir, "fetch-drain", 1, { github_run_id: "9999", loop_run_id: hop2LoopId });

    // Hop 3 asks for the artifact matching run id "2002" (what its own workflow_run event names) -- no
    // such artifact exists any more, so this resolves null, never falling back to hop 2's stale value.
    const hop3LoopId = resolveLoopRunId({
      explicit: null,
      upstreamFamily: "fetch-drain",
      upstreamRunId: "2002",
      harnessRunsDir: fetchDrainDir,
      ledger: LEDGER_NONE,
    });
    assert.equal(hop3LoopId, null);
    writeArtifact(ledgerConsumeDir, "ledger-consume", 1, { github_run_id: "3003", loop_run_id: hop3LoopId });

    // Hop 4 finds hop 3's artifact fine (its OWN github_run_id, "3003", is intact) but that artifact's
    // own loop_run_id is null (cascaded from the break above) -- hop 4 also resolves null, never
    // inventing a replacement id.
    const hop4LoopId = resolveLoopRunId({
      explicit: null,
      upstreamFamily: "ledger-consume",
      upstreamRunId: "3003",
      harnessRunsDir: ledgerConsumeDir,
      ledger: LEDGER_NONE,
    });
    assert.equal(hop4LoopId, null);
  });
});

// ── gate-a-rescan's own hop (lane M6b, 2026-09-21, build plan section 6.1 row M6): "Gate A rescan" ────
// chains off EITHER "Brief apply" or "Population turn" completing, per this hop's own workflow_run
// trigger. No FAMILY_BY_WORKFLOW_NAME edit was needed to support this (both names were already own keys
// -- see this lane's own brief premise); this attack proves resolution actually works for BOTH.

test("resolveLoopRunIdFromUpstream: gate-a-rescan firing after Brief apply resolves the upstream's loop id", () => {
  withTmpDir((fsiRoot) => {
    const briefApplyDir = join(fsiRoot, "scripts", "harness-runs", "brief-apply");
    writeArtifact(briefApplyDir, "brief-apply", 1, { github_run_id: "4004", loop_run_id: "loop-from-brief-apply" });
    const got = resolveLoopRunIdFromUpstream({
      explicit: null,
      upstreamName: "Brief apply",
      upstreamRunId: "4004",
      fsiRoot,
      ledger: LEDGER_NONE,
    });
    assert.equal(got, "loop-from-brief-apply");
  });
});

test("resolveLoopRunIdFromUpstream: gate-a-rescan firing after Population turn resolves the upstream's loop id", () => {
  withTmpDir((fsiRoot) => {
    const mintDir = join(fsiRoot, "scripts", "harness-runs", "mint");
    writeArtifact(mintDir, "mint", 1, { github_run_id: "5005", loop_run_id: "loop-from-population-turn" });
    const got = resolveLoopRunIdFromUpstream({
      explicit: null,
      upstreamName: "Population turn",
      upstreamRunId: "5005",
      fsiRoot,
      ledger: LEDGER_NONE,
    });
    assert.equal(got, "loop-from-population-turn");
  });
});

test("resolveLoopRunIdFromUpstream: gate-a-rescan firing after an unknown upstream name resolves null, never invents a family", () => {
  withTmpDir((fsiRoot) => {
    const got = resolveLoopRunIdFromUpstream({
      explicit: null,
      upstreamName: "Some Other Workflow",
      upstreamRunId: "6006",
      fsiRoot,
      ledger: LEDGER_NONE,
    });
    assert.equal(got, null);
  });
});

test("resolveLoopRunIdFromUpstream: gate-a-rescan's own explicit --loop-run-id wins over either upstream", () => {
  withTmpDir((fsiRoot) => {
    const mintDir = join(fsiRoot, "scripts", "harness-runs", "mint");
    writeArtifact(mintDir, "mint", 1, { github_run_id: "7007", loop_run_id: "loop-that-would-have-resolved" });
    const got = resolveLoopRunIdFromUpstream({
      explicit: "operator-forced-loop-id",
      upstreamName: "Population turn",
      upstreamRunId: "7007",
      fsiRoot,
      ledger: LEDGER_NONE,
    });
    assert.equal(got, "operator-forced-loop-id");
  });
});

// ── lane CHAIN-4: Propagation drain is the producer of hop 14 (question-answers), so a loop-id read off it must
// find the propagation family; an unmapped name reads as "no family" and the chained row records a null id.
test("CHAIN-4: Propagation drain maps to the propagation family", () => {
  assert.equal(FAMILY_BY_WORKFLOW_NAME["Propagation drain"], "propagation");
});

// ── lane GATE-9 (2026-10-08, AUD-AT-5 G-7): a loop id is believed only when the ledger vouches for its run ─────
const ledgerWith = (...rows) => ({ present: true, capturedAt: "2026-10-08T00:00:00Z", rows });
const ledgerRow = (family, runNumber, githubRunId) => ({ family, run_id: `${family}-run-${String(runNumber).padStart(3, "0")}`, trigger: "workflow_dispatch", config: { github_run_id: githubRunId } });

test("G-7: a FORGED artifact file (a run the ledger has never heard of) yields no loop id when the ledger export is present", () => {
  withTmpDir((dir) => {
    writeArtifact(dir, "source-sweep", 1, { github_run_id: "999", loop_run_id: "forged-loop-456" });
    const args = { explicit: null, upstreamFamily: "source-sweep", upstreamRunId: "999", harnessRunsDir: dir };
    assert.equal(resolveLoopRunId({ ...args, ledger: ledgerWith(ledgerRow("source-sweep", 7, "1")) }), null, "a ledger with other runs does not vouch for it");
    assert.equal(resolveLoopRunId({ ...args, ledger: ledgerWith() }), null, "an empty (present) ledger vouches for nothing");
    assert.equal(resolveLoopRunId({ ...args, ledger: ledgerWith(ledgerRow("source-sweep", 1, "123")) }), null, "same run id, different github run id");
    assert.equal(resolveLoopRunId({ ...args, ledger: ledgerWith({ ...ledgerRow("mint", 1, "999") }) }), null, "same github run id, wrong family");
  });
});

test("G-7 control: the same artifact resolves when the ledger holds that family, run id and github run id", () => {
  withTmpDir((dir) => {
    writeArtifact(dir, "source-sweep", 1, { github_run_id: "999", loop_run_id: "real-loop" });
    const got = resolveLoopRunId({ explicit: null, upstreamFamily: "source-sweep", upstreamRunId: "999", harnessRunsDir: dir, ledger: ledgerWith(ledgerRow("source-sweep", 1, "999")) });
    assert.equal(got, "real-loop");
  });
});

test("G-7: with no export in the checkout the file path behaves as before (nothing to resolve against)", () => {
  withTmpDir((dir) => {
    writeArtifact(dir, "source-sweep", 1, { github_run_id: "999", loop_run_id: "real-loop" });
    assert.equal(resolveLoopRunId({ explicit: null, upstreamFamily: "source-sweep", upstreamRunId: "999", harnessRunsDir: dir, ledger: LEDGER_NONE }), "real-loop");
  });
});

test("G-7: an explicit id that is not one clean token (a line break would inject a second GITHUB_ENV variable) resolves to null", () => {
  for (const bad of ["a b", "x\nINJECTED=1", "x\r\ny", "-leading", "a".repeat(129), "semi;colon", "$(cmd)"]) {
    assert.equal(resolveLoopRunId({ explicit: bad, upstreamFamily: "source-sweep", upstreamRunId: undefined, harnessRunsDir: "/nonexistent", ledger: LEDGER_NONE }), null, JSON.stringify(bad));
  }
  for (const ok of ["9001", "explicit-loop-id-99", "sweep_5.a:b/c"]) {
    assert.equal(resolveLoopRunId({ explicit: ok, upstreamFamily: "source-sweep", upstreamRunId: undefined, harnessRunsDir: "/nonexistent", ledger: LEDGER_NONE }), ok);
  }
});

test("G-7: an explicit id that contradicts a ledger-verified upstream artifact loses to the artifact's own loop id", () => {
  withTmpDir((dir) => {
    writeArtifact(dir, "source-sweep", 1, { github_run_id: "999", loop_run_id: "real-loop" });
    const args = { upstreamFamily: "source-sweep", upstreamRunId: "999", harnessRunsDir: dir, ledger: ledgerWith(ledgerRow("source-sweep", 1, "999")) };
    assert.equal(resolveLoopRunId({ ...args, explicit: "forged-loop-123" }), "real-loop");
    assert.equal(resolveLoopRunId({ ...args, explicit: "real-loop" }), "real-loop");
    // an unverified artifact is no authority over the explicit id
    assert.equal(resolveLoopRunId({ ...args, ledger: ledgerWith(), explicit: "operator-id" }), "operator-id");
  });
});

test("G-7: the default ledger is the committed export (present on master since #1041): an unlisted fixture artifact yields null, an absent export leaves the file path unchanged", () => {
  withTmpDir((dir) => {
    writeArtifact(dir, "source-sweep", 1, { github_run_id: "999", loop_run_id: "real-loop" });
    const got = resolveLoopRunId({ explicit: null, upstreamFamily: "source-sweep", upstreamRunId: "999", harnessRunsDir: dir });
    // present export -> the planted file is not in it -> null; absent export -> as before. Either way never the forged value
    assert.ok(got === null || got === "real-loop");
  });
});
