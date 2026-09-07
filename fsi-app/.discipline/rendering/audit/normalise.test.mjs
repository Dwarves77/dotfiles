// node --test proof for the design-audit normaliser (lane uxaudit-harness, 2026-09-07). Wired into
// fsi-app/.discipline/run-test-suite.sh's list via the `rendering/audit/*.test.mjs` glob — an
// executed proof, not a present one (CLAUDE.md rule 15).

import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseColours, normaliseNumbers, emToPx, collapse, compareValue } from './normalise.mjs';

test('hex colours canonicalise to the CSSOM rgb() form', () => {
  assert.equal(normaliseColours('#DC2626'), 'rgb(220,38,38)');
  assert.equal(normaliseColours('#1A1A1A'), 'rgb(26,26,26)');
  assert.equal(normaliseColours('#fff'), 'rgb(255,255,255)');
});

test('rgba spellings canonicalise identically from both sides', () => {
  assert.equal(normaliseColours('rgba(0,0,0,.12)'), 'rgba(0,0,0,0.12)');
  assert.equal(normaliseColours('rgba(0, 0, 0, 0.12)'), 'rgba(0,0,0,0.12)');
  // alpha 1 collapses to rgb(), which is what Chrome reports
  assert.equal(normaliseColours('rgba(26,26,26,1)'), 'rgb(26,26,26)');
});

test('colours inside a gradient are rewritten in place', () => {
  assert.equal(
    normaliseColours('linear-gradient(90deg,#5A5552,#5A5552 22%,rgba(90,85,82,.18))'),
    'linear-gradient(90deg,rgb(90,85,82),rgb(90,85,82) 22%,rgba(90,85,82,0.18))',
  );
});

test('numbers round to 2dp and keep their unit', () => {
  assert.equal(normaliseNumbers('12.000px'), '12px');
  assert.equal(normaliseNumbers('0.5600px'), '0.56px');
});

test('em converts against the element font-size', () => {
  assert.equal(emToPx('0.04em', 14), 0.56);
  assert.equal(emToPx('12px', 14), null);
});

test('collapse squashes whitespace runs', () => {
  assert.equal(collapse('  a   b \n c '), 'a b c');
});

test('compareValue matches a design hex against a computed rgb()', () => {
  assert.equal(compareValue('#DC2626', 'rgb(220, 38, 38)').ok, true);
  assert.equal(compareValue('#DC2626', 'rgb(37, 99, 235)').ok, false);
});

test('compareValue matches a shorthand token by token', () => {
  assert.equal(compareValue('2px solid #1A1A1A', '2px solid rgb(26, 26, 26)').ok, true);
  assert.equal(compareValue('2px solid #1A1A1A', '1px solid rgb(26, 26, 26)').ok, false);
});

test('compareValue converts an em expectation with the element font-size', () => {
  assert.equal(compareValue('0.04em', '0.56px', { fontSizePx: 14 }).ok, true);
  assert.equal(compareValue('0.04em', '0.28px', { fontSizePx: 14 }).ok, false);
});

test('compareValue tolerates sub-pixel layout rounding but not a real difference', () => {
  assert.equal(compareValue('56px', '55.9688px').ok, true);
  assert.equal(compareValue('56px', '55px').ok, false);
});

test('the * token matches exactly one token and nothing else relaxes', () => {
  const grid = '3px 56px * 88px 84px 76px 40px 44px';
  assert.equal(compareValue(grid, '3px 56px 594px 88px 84px 76px 40px 44px').ok, true);
  assert.equal(compareValue(grid, '3px 56px 594px 88px 84px 76px 40px 40px').ok, false);
  assert.equal(compareValue('*', 'anything at all').ok, true);
});

test('unitless zero in the design source matches the CSSOM 0px serialisation', () => {
  assert.equal(compareValue('0 8px 8px 0', '0px 8px 8px 0px').ok, true);
  assert.equal(compareValue('0 8px 8px 0', '6px 6px 6px 6px').ok, false);
});

test('contains: matches a face inside a fallback stack and nothing else', () => {
  assert.equal(compareValue('contains:Anton', 'Anton, system-ui, sans-serif').ok, true);
  assert.equal(compareValue('contains:Anton', 'Plus Jakarta Sans, sans-serif').ok, false);
});

test('a differing token count falls back to a whole-string canonical compare', () => {
  assert.equal(compareValue('#FFFFFF', 'rgb(255, 255, 255)').ok, true);
  assert.equal(compareValue('0 8px 8px 0', '6px').ok, false);
});

test('a gradient with explicit 0%/100% stops matches CSSOM omitting the defaults (train 58, 2026-09-07)', () => {
  assert.equal(
    compareValue(
      'linear-gradient(90deg,#5A5552,#5A5552 22%,rgba(90,85,82,.18))',
      'linear-gradient(90deg, rgb(90, 85, 82) 0%, rgb(90, 85, 82) 22%, rgba(90, 85, 82, 0.18) 100%)',
    ).ok,
    true,
  );
  assert.equal(
    compareValue(
      'linear-gradient(90deg,#5A5552,#5A5552 22%,rgba(90,85,82,.18))',
      'linear-gradient(90deg, rgb(90, 85, 82) 0%, rgb(90, 85, 82) 22%, rgba(90, 85, 82, 0.18))',
    ).ok,
    true,
  );
  assert.equal(
    compareValue(
      'linear-gradient(90deg,#5A5552,#5A5552 22%,rgba(90,85,82,.18))',
      'linear-gradient(90deg, rgb(22, 163, 74) 0%, rgb(90, 85, 82) 22%, rgba(90, 85, 82, 0.18) 100%)',
    ).ok,
    false,
  );
});
