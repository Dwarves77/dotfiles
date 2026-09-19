// Proves generate-migrations-inventory.mjs's pure core (plan 6.8, Rule A, lane N5, coordinator
// amendment 1 item 3): parseSubjectLine well-formedness, escapeForTableCell round-tripping, buildRows
// sorting/malformed-detection, extractFooter/extractGapRows preservation, and buildInventoryPage
// assembly. Fixture-driven throughout; never touches the real fsi-app/supabase/migrations tree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseSubjectLine,
  escapeForTableCell,
  buildRows,
  extractFooter,
  extractGapRows,
  buildInventoryPage,
} from './generate-migrations-inventory.mjs';

test('parseSubjectLine: a plain "-- subject:" first line is well-formed', () => {
  assert.deepEqual(parseSubjectLine('-- subject: Hello world\nCREATE TABLE x();\n'), { subject: 'Hello world' });
});

test('parseSubjectLine: a leading "/* fitness-allow */" line is skipped first', () => {
  const text = '/* fitness-allow: F6 (reason) */\n-- subject: With a fitness-allow line\nSELECT 1;\n';
  assert.deepEqual(parseSubjectLine(text), { subject: 'With a fitness-allow line' });
});

test('parseSubjectLine: NEGATIVE, no subject line at all is malformed (null)', () => {
  assert.equal(parseSubjectLine('-- just a regular comment\nCREATE TABLE x();\n'), null);
});

test('parseSubjectLine: NEGATIVE, a subject line after something OTHER than a fitness-allow block is malformed', () => {
  assert.equal(parseSubjectLine('-- some other comment\n-- subject: too late\n'), null);
});

test('parseSubjectLine: an empty subject text is still well-formed (subject: "")', () => {
  assert.deepEqual(parseSubjectLine('-- subject: \n'), { subject: '' });
});

test('parseSubjectLine: a trailing " [glyph:verbatim]" tag is stripped, recovering the exact original subject', () => {
  assert.deepEqual(
    parseSubjectLine('-- subject: Migration X (a dash) [glyph:verbatim]\nSELECT 1;\n'),
    { subject: 'Migration X (a dash)' },
  );
});

test('parseSubjectLine: the tag is only stripped from the END of the line, not a mid-sentence mention of it', () => {
  assert.deepEqual(
    parseSubjectLine('-- subject: mentions [glyph:verbatim] mid-sentence, not at the end\n'),
    { subject: 'mentions [glyph:verbatim] mid-sentence, not at the end' },
  );
});

test('escapeForTableCell: round-trips a literal pipe both ways', () => {
  const subject = "CHECK ('off'|'weekly'|'monthly')";
  const escaped = escapeForTableCell(subject);
  assert.equal(escaped, "CHECK ('off'\\|'weekly'\\|'monthly')");
});

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'n5-mig-gen-test-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('buildRows: sorts by number ascending, then filename ascending for ties', () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, '007_full_brief.sql'), '-- subject: Full brief\nSELECT 1;\n');
    writeFileSync(join(dir, '007_community_layer.sql'), '-- subject: Community layer\nSELECT 1;\n');
    writeFileSync(join(dir, '001_schema.sql'), '-- subject: Schema\nSELECT 1;\n');
    const { rows, malformed } = buildRows(dir);
    assert.deepEqual(malformed, []);
    assert.deepEqual(rows.map((r) => r.file), ['001_schema.sql', '007_community_layer.sql', '007_full_brief.sql']);
  });
});

test('buildRows: NEGATIVE, a migration file with no subject line is reported malformed, not silently dropped', () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, '001_ok.sql'), '-- subject: Fine\nSELECT 1;\n');
    writeFileSync(join(dir, '002_bad.sql'), '-- no subject line here\nSELECT 1;\n');
    const { rows, malformed } = buildRows(dir);
    assert.deepEqual(malformed, ['002_bad.sql']);
    assert.equal(rows.length, 1);
  });
});

test('buildRows: a filename with no leading number is reported malformed', () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, 'not_numbered.sql'), '-- subject: x\n');
    const { rows, malformed } = buildRows(dir);
    assert.deepEqual(malformed, ['not_numbered.sql']);
    assert.equal(rows.length, 0);
  });
});

test('extractFooter: takes everything from the first non-"Migrations" heading onward, whatever it is', () => {
  const doc =
    '# Migrations Inventory\n\nheader\n\n## Migrations\n\n| # | File | Subject (from header comment) |\n' +
    '|---|---|---|\n| 001 | 001_x.sql | X |\n\n## Maintenance trigger\n\nsome prose\n\n## Related\n\n- a link\n';
  assert.equal(extractFooter(doc), '## Maintenance trigger\n\nsome prose\n\n## Related\n\n- a link\n');
});

test('extractFooter: a stub when the doc does not exist yet', () => {
  assert.equal(extractFooter(null), '## Related\n\n');
});

test('extractFooter: a stub when the doc exists but has no heading after "## Migrations"', () => {
  assert.equal(extractFooter('# Migrations Inventory\n\n## Migrations\n\n| # | File | Subject |\n|---|---|---|\n'), '## Related\n\n');
});

test('extractGapRows: a non-numeric row inside the table is preserved and sorts by its own "number NNN"', () => {
  const doc =
    '# Migrations Inventory\n\n## Migrations\n\n| # | File | Subject (from header comment) |\n|---|---|---|\n' +
    '| 306 | 306_x.sql | X |\n| — | (number 307 first drafted, withdrawn) | notes |\n| 308 | 308_y.sql | Y |\n\n## Related\n\n';  // glyph:verbatim (the doc's real gap-row placeholder character)
  const gapRows = extractGapRows(doc);
  assert.equal(gapRows.length, 1);
  assert.equal(gapRows[0].number, '307');
  assert.ok(gapRows[0].rawLine.includes('number 307 first drafted'));
});

test('extractGapRows: [] when the doc does not exist or has no gap row', () => {
  assert.deepEqual(extractGapRows(null), []);
  assert.deepEqual(extractGapRows('# Migrations Inventory\n\n## Migrations\n\n| 001 | 001_x.sql | X |\n\n## Related\n\n'), []);
});

test('extractGapRows: NEGATIVE, a non-numeric row with no "number NNN" to sort by throws rather than guessing', () => {
  const doc =
    '# Migrations Inventory\n\n## Migrations\n\n| — | (no number mentioned here at all) | notes |\n\n## Related\n\n';  // glyph:verbatim (the doc's real gap-row placeholder character)
  assert.throws(() => extractGapRows(doc), /has no "number NNN" to sort by/);
});

test('buildInventoryPage: a subject carrying a banned dash glyph gets the [glyph:verbatim] disclosure tag in its table cell (rule 022, added lines from a full regeneration)', () => {
  const rows = [{ number: '1', file: '001_a.sql', subject: 'Migration A (Wave-alpha em-dash test) done' }];
  const withDash = [{ number: '1', file: '001_a.sql', subject: `Migration A ${String.fromCharCode(0x2014)} done` }];
  const plain = buildInventoryPage(rows, [], '## Related\n\n');
  const dashed = buildInventoryPage(withDash, [], '## Related\n\n');
  assert.ok(!plain.includes('[glyph:verbatim]'), 'a plain subject must not get the tag');
  assert.ok(dashed.includes('[glyph:verbatim]'), 'a subject with a banned glyph must get the tag');
});

test('buildInventoryPage: merges file rows and gap rows into one number-sorted table', () => {
  const rows = [
    { number: '1', file: '001_a.sql', subject: 'A' },
    { number: '3', file: '003_c.sql', subject: 'C' },
  ];
  const gapRows = [{ number: '2', file: '\0gap:x', rawLine: '| — | (number 2 gap) | notes |' }];  // glyph:verbatim (the doc's real gap-row placeholder character)
  const page = buildInventoryPage(rows, gapRows, '## Related\n\n');
  const tableLines = page.split('\n').filter((l) => l.startsWith('| '));
  assert.deepEqual(tableLines, [
    '| # | File | Subject (from header comment) |',
    '| 1 | 001_a.sql | A |',
    '| — | (number 2 gap) | notes |',  // glyph:verbatim (the doc's real gap-row placeholder character)
    '| 3 | 003_c.sql | C |',
  ]);
});
