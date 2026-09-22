// Red-then-green proof for the panel21c-accept detector (lane w10-factcard-d, 2026-09-21, build
// item 6). Runs in the no-npm node --test suite. The smoke spec
// (.discipline/rendering/smoke/panel-21c-smoke.mjs, Playwright-driven, does not run in this
// sandbox per operator ruling) feeds this SAME function real measurements, so a detector that
// passes here and fires there cannot disagree with itself.
// Run: node --test fsi-app/.discipline/rendering/panel21c-accept.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPanel21cAcceptance } from './panel21c-accept.mjs';

function goodCard(kindSlug) {
  return { kindSlug, heightPx: 110, claimLineCount: 2, hasLeadColumn: false, hasFigureLead: false, captionAboveCard: false };
}

function goodMeasurements() {
  return {
    groupsTotalHeight: 900,
    groups: [
      {
        hasBandPill: true,
        hasActionStrip: true,
        cards: [goodCard('action-required'), goodCard('legal-confirmation-required')],
      },
      {
        hasBandPill: true,
        hasActionStrip: true,
        cards: [goodCard('baseline-target'), goodCard('national-target'), goodCard('analytical-inference')],
      },
    ],
  };
}

test('GREEN: the operator acceptance list, met exactly, produces zero violations', () => {
  const result = checkPanel21cAcceptance(goodMeasurements());
  assert.deepEqual(result, { ok: true, violations: [] });
});

test('RED: total height over 1100px at 1440 fails', () => {
  const m = goodMeasurements();
  m.groupsTotalHeight = 1200;
  const result = checkPanel21cAcceptance(m);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.includes('1100px')));
});

test('GREEN: exactly 1100px passes (the ceiling is inclusive)', () => {
  const m = goodMeasurements();
  m.groupsTotalHeight = 1100;
  assert.equal(checkPanel21cAcceptance(m).ok, true);
});

test('RED: a card over 140px with a short claim (<=4 lines) fails, the height budget defect', () => {
  const m = goodMeasurements();
  m.groups[0].cards[0].heightPx = 220;
  m.groups[0].cards[0].claimLineCount = 2;
  const result = checkPanel21cAcceptance(m);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.includes('220px')));
});

test('GREEN: a card over 140px is fine when its claim genuinely exceeds 4 lines', () => {
  const m = goodMeasurements();
  m.groups[0].cards[0].heightPx = 220;
  m.groups[0].cards[0].claimLineCount = 5;
  assert.equal(checkPanel21cAcceptance(m).ok, true);
});

// Sign-off 2026-09-22, correction 1: the provenance column is no longer clipped, so a card whose
// PROVENANCE (not only its claim) genuinely needs more than 140px is fine too - the four-line case
// and the two-line-name case (source wraps, org dropped, still up to 4 conceptual rows).
test('GREEN: a card over 140px is fine when its provenance column genuinely needs more than 4 ordinary lines (the four-line / two-line-name cases)', () => {
  const m = goodMeasurements();
  m.groups[0].cards[0].heightPx = 150;
  m.groups[0].cards[0].claimLineCount = 1;
  m.groups[0].cards[0].provenanceLineCount = 5;
  assert.equal(checkPanel21cAcceptance(m).ok, true);
});

test('RED: a card over 140px with a short claim AND a short (<=4-line) provenance still fails - provenanceLineCount is not a blanket exemption', () => {
  const m = goodMeasurements();
  m.groups[0].cards[0].heightPx = 220;
  m.groups[0].cards[0].claimLineCount = 2;
  m.groups[0].cards[0].provenanceLineCount = 4;
  const result = checkPanel21cAcceptance(m);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.includes('220px')));
});

test('GREEN: provenanceLineCount is optional; omitting it never grants an exemption it did not ask for', () => {
  const m = goodMeasurements();
  m.groups[0].cards[0].heightPx = 130; // under 140px regardless
  assert.equal(m.groups[0].cards[0].provenanceLineCount, undefined);
  assert.equal(checkPanel21cAcceptance(m).ok, true);
});

test('RED: two adjacent cards of the same kind fail, the COUNT defect (merge rule not applied)', () => {
  const m = goodMeasurements();
  m.groups[0].cards[1].kindSlug = m.groups[0].cards[0].kindSlug;
  const result = checkPanel21cAcceptance(m);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.includes('adjacent')));
});

test('RED: a card reserving the 132px lead column with no figure lead rendered fails, the empty-column defect', () => {
  const m = goodMeasurements();
  m.groups[1].cards[2].hasLeadColumn = true;
  m.groups[1].cards[2].hasFigureLead = false;
  const result = checkPanel21cAcceptance(m);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.includes('132px lead column')));
});

test('GREEN: a card WITH a lead column AND a rendered lead is fine', () => {
  const m = goodMeasurements();
  m.groups[1].cards[0].hasLeadColumn = true;
  m.groups[1].cards[0].hasFigureLead = true;
  assert.equal(checkPanel21cAcceptance(m).ok, true);
});

test('RED: an external caption above a card fails, the WHITESPACE ABOVE EACH CARD defect', () => {
  const m = goodMeasurements();
  m.groups[0].cards[0].captionAboveCard = true;
  const result = checkPanel21cAcceptance(m);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.includes('caption')));
});

test('RED: a group missing its band pill fails', () => {
  const m = goodMeasurements();
  m.groups[0].hasBandPill = false;
  const result = checkPanel21cAcceptance(m);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.includes('no band pill')));
});

test('RED: a group missing its ACTION strip fails', () => {
  const m = goodMeasurements();
  m.groups[1].hasActionStrip = false;
  const result = checkPanel21cAcceptance(m);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.includes('no ACTION strip')));
});

test('RED: no groups at all fails, does not crash', () => {
  const result = checkPanel21cAcceptance({ groupsTotalHeight: 0, groups: [] });
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.includes('no groups measured')));
});
