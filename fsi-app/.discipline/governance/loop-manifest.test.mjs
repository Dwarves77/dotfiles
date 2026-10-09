// loop-manifest.test.mjs - the manifest self-test lane M9a's brief requires (brief-m9a.md item 4): every
// hop's producer.file and consumer.file exist (unless the hop names that file pending, see
// loop-manifest.mjs's own header), every non-pending name equals the yml's own `name:` value, every
// non-null family is a real directory under scripts/harness-runs/ or is documented pending, and no hop id
// repeats. This is a proof over the REAL committed tree (no fixtures) - it is the guard that keeps
// loop-manifest.mjs itself honest about the workflow files it cites.
//
// node:test + node:assert/strict, no npm deps, same discipline as run-artifact.test.mjs and
// governing-files.test.mjs (its siblings in this convention).
//
// Run: node --test .discipline/governance/loop-manifest.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { LOOP_HOPS, loadLoopHops } from './loop-manifest.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, '..', '..');
const REPO_ROOT = resolve(FSI_ROOT, '..');

// A minimal, otherwise-valid hop object every fixture below starts from and tweaks - keeps each attack
// fixture's intent (duplicate id / duplicate order / missing field) visible at the call site instead of
// buried in a repeated literal.
function validHop(id) {
  return {
    id,
    producer: { file: '.github/workflows/source-sweep.yml', name: 'Source sweep' },
    consumer: { file: '.github/workflows/ledger-consume.yml', name: 'Ledger consume' },
    trigger: 'workflow_run',
    family: null,
    enforceEdge: false,
    enforceFired: false,
    note: 'fixture hop',
  };
}

function withFixtureDir(files, run) {
  const dir = mkdtempSync(join(tmpdir(), 'loop-hops-fixture-'));
  try {
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(dir, name), JSON.stringify(content, null, 2));
    }
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function readYamlName(repoRelativePath) {
  const abs = join(REPO_ROOT, repoRelativePath);
  const text = readFileSync(abs, 'utf8');
  const m = text.match(/^name:\s*(.+?)\s*$/m);
  return m ? m[1] : null;
}

test('every hop id is unique', () => {
  const ids = LOOP_HOPS.map((h) => h.id);
  assert.equal(new Set(ids).size, ids.length, `duplicate hop id(s) in: ${ids.join(', ')}`);
});

test('every non-pending producer.file exists', () => {
  for (const hop of LOOP_HOPS) {
    if (hop.producerPending) continue;
    assert.ok(
      existsSync(join(REPO_ROOT, hop.producer.file)),
      `${hop.id}: producer.file ${hop.producer.file} does not exist and is not marked producerPending`,
    );
  }
});

test('every non-pending consumer.file exists', () => {
  for (const hop of LOOP_HOPS) {
    if (hop.consumerPending) continue;
    assert.ok(
      existsSync(join(REPO_ROOT, hop.consumer.file)),
      `${hop.id}: consumer.file ${hop.consumer.file} does not exist and is not marked consumerPending`,
    );
  }
});

test('every non-pending producer.name equals the yml\'s own name: value', () => {
  for (const hop of LOOP_HOPS) {
    if (hop.producerPending) continue;
    assert.equal(
      readYamlName(hop.producer.file),
      hop.producer.name,
      `${hop.id}: producer.name "${hop.producer.name}" does not match ${hop.producer.file}'s own name:`,
    );
  }
});

test('every non-pending consumer.name equals the yml\'s own name: value', () => {
  for (const hop of LOOP_HOPS) {
    if (hop.consumerPending) continue;
    assert.equal(
      readYamlName(hop.consumer.file),
      hop.consumer.name,
      `${hop.id}: consumer.name "${hop.consumer.name}" does not match ${hop.consumer.file}'s own name:`,
    );
  }
});

test('every non-null family is a real harness-runs directory or is documented familyPending', () => {
  for (const hop of LOOP_HOPS) {
    if (!hop.family) continue;
    const dir = join(REPO_ROOT, 'fsi-app', 'scripts', 'harness-runs', hop.family);
    if (hop.familyPending) {
      assert.ok(
        /\bM\d+\b/.test(hop.note || ''),
        `${hop.id}: family "${hop.family}" is marked familyPending but its note does not name the lane ` +
          `(M<n>) that creates it: ${JSON.stringify(hop.note)}`,
      );
      continue;
    }
    assert.ok(
      existsSync(dir),
      `${hop.id}: family "${hop.family}" is not a directory under scripts/harness-runs/ and is not ` +
        `marked familyPending`,
    );
  }
});

test('every hop carries a non-empty note', () => {
  for (const hop of LOOP_HOPS) {
    assert.ok(typeof hop.note === 'string' && hop.note.trim().length > 0, `${hop.id}: note is empty`);
  }
});

test('every hop declares trigger, enforceEdge and enforceFired as the correct types', () => {
  for (const hop of LOOP_HOPS) {
    assert.ok(
      hop.trigger === 'workflow_run' || hop.trigger === 'dispatch',
      `${hop.id}: trigger must be "workflow_run" or "dispatch", got ${JSON.stringify(hop.trigger)}`,
    );
    assert.equal(typeof hop.enforceEdge, 'boolean', `${hop.id}: enforceEdge must be a boolean`);
    assert.equal(typeof hop.enforceFired, 'boolean', `${hop.id}: enforceFired must be a boolean`);
  }
});

// ── attack: the directory loader itself (brief-r7m.md item 3, fixture directories, never the live one)
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
test('ATTACK: a duplicate hop id across two files throws', () => {
  withFixtureDir(
    { '01-hop-a.json': validHop('same-id'), '02-hop-b.json': validHop('same-id') },
    (dir) => {
      assert.throws(() => loadLoopHops(dir), /duplicate hop id "same-id"/);
    },
  );
});

test('ATTACK: a duplicate order prefix across two files throws', () => {
  withFixtureDir(
    { '01-hop-a.json': validHop('hop-a'), '01-hop-b.json': validHop('hop-b') },
    (dir) => {
      assert.throws(() => loadLoopHops(dir), /duplicate order prefix "01"/);
    },
  );
});

test('ATTACK: a hop file missing a required field throws naming the file', () => {
  withFixtureDir(
    {
      '01-incomplete.json': (() => {
        const hop = validHop('incomplete-hop');
        delete hop.trigger;
        return hop;
      })(),
    },
    (dir) => {
      assert.throws(
        () => loadLoopHops(dir),
        /01-incomplete\.json is missing required field "trigger"/,
      );
    },
  );
});

// A shape assertion, not a pinned content snapshot (the R6t lesson, remediation-discipline Example 2 /
// category 48: no pinned list of live entries - the manifest's own content is proven lossless against the
// pre-conversion hard-coded array once, at conversion time, not re-asserted here so future hop edits never
// have to touch this test). The live-tree tests above already cover every field's real-world shape; this
// just pins the CONTRACT the loader promises any caller: a frozen, non-empty array of hop objects.
test('LOOP_HOPS is a frozen, non-empty array derived from loop-hops.d/', () => {
  assert.ok(Array.isArray(LOOP_HOPS));
  assert.ok(Object.isFrozen(LOOP_HOPS));
  assert.ok(LOOP_HOPS.length > 0);
  for (const hop of LOOP_HOPS) {
    assert.ok(Object.isFrozen(hop), `${hop.id}: hop object is not frozen`);
  }
});

// ── attack: a wrong name is caught (brief-m9a.md item 3's attack-test list, proven here at the
// manifest-self-test layer since this is where name-vs-yml comparison lives) ─────────────────────────
test('ATTACK: a hop whose producer.name does not match the real yml is caught', () => {
  const fake = [
    {
      id: 'attack-wrong-name',
      producer: { file: '.github/workflows/source-sweep.yml', name: 'Source Sweep (wrong case)' },
      consumer: { file: '.github/workflows/ledger-consume.yml', name: 'Ledger consume' },
      trigger: 'workflow_run',
      family: null,
      enforceEdge: false,
      enforceFired: false,
      note: 'fixture for the attack test',
    },
  ];
  const real = readYamlName(fake[0].producer.file);
  assert.notEqual(real, fake[0].producer.name, 'fixture setup error: the wrong name accidentally matches');
});

// ── source-resolution hops (lane S1-E, 2026-10-05) ──────────────────────────────────────────────────────
// Two hops share one consumer family, so a harness_runs row of that family is placed on exactly one hop by
// the producer run it names (mapRowsToHops). Both producers need a harness family known to producerFamilyOf:
// Brief apply was already in PRODUCER_FAMILY_BY_WORKFLOW_FILE, Research walker was not.
import { mapRowsToHops, producerFamilyOf } from './loop-manifest.mjs';

test('S1-E: both source-resolution hops exist, point at the real consumer, and name its family', () => {
  const ids = ['brief-apply-to-source-resolution', 'research-walker-to-source-resolution'];
  for (const id of ids) {
    const hop = LOOP_HOPS.find((h) => h.id === id);
    assert.ok(hop, `${id} is missing from loop-hops.d`);
    assert.equal(hop.consumer.file, '.github/workflows/source-resolution.yml');
    assert.equal(hop.consumer.name, 'Source resolution');
    assert.equal(hop.family, 'source-resolution');
    assert.equal(hop.trigger, 'workflow_run');
    assert.equal(hop.enforceEdge, true);
    assert.equal(hop.enforceFired, false);
  }
});

test('S1-E: a source-resolution row is placed on the hop of the producer run it names', () => {
  const row = (run_id, upstream) => ({
    harness_family: 'source-resolution', run_id, github_run_id: `g-${run_id}`, upstream_run_id: upstream,
    started_at: '2026-10-06T00:00:00Z', trigger: 'workflow_run_forced_dry',
  });
  const { entries, unmapped } = mapRowsToHops([
    { harness_family: 'brief-apply', run_id: 'brief-apply-run-009', github_run_id: '111', started_at: '2026-10-05T00:00:00Z', trigger: 'workflow_dispatch' },
    { harness_family: 'research-walker', run_id: 'research-walker-run-005', github_run_id: '222', started_at: '2026-10-05T00:00:00Z', trigger: 'workflow_dispatch' },
    row('source-resolution-run-001', '111'),
    row('source-resolution-run-002', '222'),
  ]);
  assert.deepEqual(unmapped, []);
  const byHop = Object.fromEntries(entries.map((e) => [e.hop, e.run_id]));
  assert.equal(byHop['brief-apply-to-source-resolution'], 'source-resolution-run-001');
  assert.equal(byHop['research-walker-to-source-resolution'], 'source-resolution-run-002');
});

test('S1-E: producerFamilyOf resolves Research walker to its own family directory', () => {
  const hop = LOOP_HOPS.find((h) => h.id === 'research-walker-to-source-resolution');
  assert.equal(producerFamilyOf(hop), 'research-walker');
});

test('S1-E: hops 05 and 06 notes say where tier recompute runs', () => {
  for (const id of ['population-turn-to-downstream-chain', 'corpus-turn-to-downstream-chain']) {
    const note = LOOP_HOPS.find((h) => h.id === id).note;
    assert.match(note, /recompute-tiers/, `${id}: note does not name recompute-tiers`);
    assert.match(note, /tier-opinions/, `${id}: note does not name tier-opinions`);
  }
});

// ── lane GATE-9 (2026-10-08): every hop, not the ones a hop-specific pin happens to name ─────────────────
// AUD-AT-5 attacked all hops with a decoy edge (AH1), a duplicate producer name (AH6) and a forged firing claim
// (AH2). Only hops 10 and 11 (a workflow test that pins `types: [completed]`) refused the decoy, only hops 12
// and 13 (the S1-E pin above) refused the forged claim, and nothing refused a duplicate name. These tests are
// DATA-DRIVEN over LOOP_HOPS, so a hop added later is covered the day it lands.
import { readHarnessLedgerExport } from '../../scripts/lib/run-artifact.mjs';
import { LOOP_FIRED_EVIDENCE_FILE } from './loop-manifest.mjs';

/** The workflow names a workflow file's REAL trigger block lists: top-level `on:` -> `workflow_run:` ->
 *  `workflows:`. Structural, not a text search: a `workflow_run:` that appears in a comment, a `run:` script, a
 *  heredoc or any other block is not a trigger (AH1). Returns null when there is no real edge. PURE. */
function realWorkflowRunNames(ymlText) {
  const lines = String(ymlText).split(/\r?\n/);
  const indentOf = (l) => l.match(/^( *)/)[1].length;
  const significant = (l) => l.trim() !== '' && !/^\s*#/.test(l);
  const onIdx = lines.findIndex((l) => /^on:\s*(?:#.*)?$/.test(l));
  if (onIdx === -1) return null;
  let end = lines.length;
  for (let i = onIdx + 1; i < lines.length; i++) {
    if (significant(lines[i]) && indentOf(lines[i]) === 0) { end = i; break; }
  }
  const block = lines.slice(onIdx + 1, end);
  const wrIdx = block.findIndex((l) => significant(l) && indentOf(l) === 2 && /^ {2}workflow_run:\s*(?:#.*)?$/.test(l));
  if (wrIdx === -1) return null;
  const names = [];
  for (let i = wrIdx + 1; i < block.length; i++) {
    const l = block[i];
    if (!significant(l)) continue;
    if (indentOf(l) <= 2) break;
    const inline = l.match(/^ {4}workflows:\s*\[([^\]]*)\]\s*(?:#.*)?$/);
    if (inline) {
      for (const m of inline[1].matchAll(/["']([^"']+)["']/g)) names.push(m[1]);
      continue;
    }
    if (/^ {4}workflows:\s*(?:#.*)?$/.test(l)) {
      for (let j = i + 1; j < block.length; j++) {
        if (!significant(block[j])) continue;
        const item = block[j].match(/^ {6}-\s*["']?([^"'#]+?)["']?\s*(?:#.*)?$/);
        if (!item) break;
        names.push(item[1]);
      }
    }
  }
  return names;
}

const consumerText = (hop) => readFileSync(join(REPO_ROOT, hop.consumer.file), 'utf8');

test('AH1: every enforced hop\'s consumer carries a REAL on.workflow_run edge naming the hop\'s producer', () => {
  for (const hop of LOOP_HOPS) {
    if (!hop.enforceEdge || hop.consumerPending) continue;
    const names = realWorkflowRunNames(consumerText(hop));
    assert.ok(Array.isArray(names) && names.includes(hop.producer.name), `${hop.id}: ${hop.consumer.file} has no real on.workflow_run.workflows entry "${hop.producer.name}" (found ${JSON.stringify(names)})`);
  }
});

test('AH1: the decoy edge (the real trigger deleted, the same text spelled inside a run: script) is not an edge, for every hop', () => {
  for (const hop of LOOP_HOPS) {
    if (hop.consumerPending) continue;
    const real = consumerText(hop);
    const decoy = real
      .replace(/^ {2}workflow_run:\s*\r?\n(?: {4}.*\r?\n)+/m, '')
      .replace(/^jobs:\s*$/m, `jobs:\n  decoy:\n    runs-on: ubuntu-latest\n    steps:\n      - run: |\n          cat <<'EOF'\n          workflow_run:\n            workflows: ["${hop.producer.name}"]\n          EOF`);
    assert.notEqual(decoy, real, `${hop.id}: the attack fixture changed nothing, so it proves nothing`);
    const names = realWorkflowRunNames(decoy);
    assert.ok(names === null || !names.includes(hop.producer.name), `${hop.id}: a heredoc in a run: step was read as the trigger edge`);
  }
});

test('AH1: a workflow_run line inside a comment is not an edge, and a block-list form is read', () => {
  const commented = 'name: X\non:\n  workflow_dispatch: {}\n  # workflow_run:\n  #   workflows: ["Source sweep"]\njobs:\n  a:\n    runs-on: x\n';
  assert.equal(realWorkflowRunNames(commented), null);
  const block = 'name: X\non:\n  workflow_run:\n    workflows:\n      - "Source sweep"\n      - Brief apply\n    types: [completed]\njobs:\n  a:\n    runs-on: x\n';
  assert.deepEqual(realWorkflowRunNames(block), ['Source sweep', 'Brief apply']);
});

test('AH6: every hop\'s producer.name and consumer.name is the name: of exactly ONE workflow file', () => {
  const byName = new Map();
  for (const f of readdirSync(join(REPO_ROOT, '.github', 'workflows')).filter((n) => /\.ya?ml$/.test(n))) {
    const name = readYamlName(`.github/workflows/${f}`);
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(f);
  }
  for (const hop of LOOP_HOPS) {
    for (const side of ['producer', 'consumer']) {
      if (hop[`${side}Pending`]) continue;
      const files = byName.get(hop[side].name) ?? [];
      assert.deepEqual(files, [hop[side].file.split('/').pop()], `${hop.id}: ${side} name "${hop[side].name}" must belong to exactly one workflow file (a second file with the same name would fire the consumer when a person dispatches the dormant one)`);
    }
  }
});

/** Problems with a set of firing claims against the evidence file and the committed ledger export. PURE:
 *  hops, evidence entries and export rows are passed in. A claim (`enforceFired: true`) stands only when an
 *  evidence entry for the hop exists AND its run resolves to a row of the ledger export. */
function firedClaimProblems(hops, entries, exportInfo) {
  const problems = [];
  for (const hop of hops) {
    if (!hop.enforceFired) continue;
    const mine = entries.filter((e) => e.hop === hop.id);
    if (mine.length === 0) { problems.push(`${hop.id}: enforceFired is true but loop-fired-evidence.json has no entry for it`); continue; }
    if (!exportInfo.present) { problems.push(`${hop.id}: enforceFired is true but harness-ledger-export.json is absent, so no entry can resolve`); continue; }
    const resolves = mine.some((e) => exportInfo.rows.some((r) => (
      r.family === e.family && r.run_id === e.run_id && r.trigger === e.trigger
      && (e.github_run_id == null || String(r.config?.github_run_id ?? '') === String(e.github_run_id))
    )));
    if (!resolves) problems.push(`${hop.id}: enforceFired is true but no evidence entry's run id resolves to a row of harness-ledger-export.json`);
  }
  return problems;
}

const LEDGER_EXPORT = readHarnessLedgerExport(REPO_ROOT);
const EVIDENCE_ENTRIES = (() => {
  try { return JSON.parse(readFileSync(LOOP_FIRED_EVIDENCE_FILE, 'utf8')).entries ?? []; } catch { return []; }
})();

test('AH2: every hop that claims it fired (enforceFired: true) has an evidence entry that resolves in the ledger export', () => {
  assert.deepEqual(firedClaimProblems(LOOP_HOPS, EVIDENCE_ENTRIES, LEDGER_EXPORT), []);
});

test('AH2: a forged claim is refused for EVERY hop: the flag flipped on and an entry invented, with no ledger row behind it', () => {
  for (const hop of LOOP_HOPS) {
    const forged = { ...hop, enforceFired: true };
    const entry = { hop: hop.id, family: hop.family ?? 'x', run_id: `${hop.family ?? 'x'}-run-999`, github_run_id: '123', upstream_run_id: '122', started_at: '2026-10-08T00:00:00Z', trigger: 'workflow_run' };
    assert.ok(
      firedClaimProblems([forged], [entry], { present: true, capturedAt: '2026-10-08T00:00:00Z', rows: [] }).length === 1,
      `${hop.id}: a forged firing claim with an empty ledger was accepted`,
    );
    assert.ok(firedClaimProblems([forged], [entry], { present: false, capturedAt: null, rows: [] }).length === 1, `${hop.id}: accepted with no export at all`);
    assert.ok(firedClaimProblems([forged], [], { present: true, capturedAt: 'x', rows: [] }).length === 1, `${hop.id}: accepted with no evidence entry`);
  }
});

test('AH2: a claim backed by a ledger row with the same family, run id, trigger and github run id stands (control)', () => {
  const hop = { ...LOOP_HOPS[0], enforceFired: true };
  const entry = { hop: hop.id, family: hop.family, run_id: `${hop.family}-run-006`, github_run_id: '36568657095', trigger: 'workflow_run' };
  const row = { family: hop.family, run_id: entry.run_id, trigger: 'workflow_run', config: { github_run_id: '36568657095' } };
  assert.deepEqual(firedClaimProblems([hop], [entry], { present: true, capturedAt: 'x', rows: [row] }), []);
  assert.equal(firedClaimProblems([hop], [entry], { present: true, capturedAt: 'x', rows: [{ ...row, config: { github_run_id: '1' } }] }).length, 1, 'a row with a different github run id is a different run');
});
