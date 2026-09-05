// src/lib/forward-events/extract-forward-events.test.mjs
//
// Runnable with: node --test src/lib/forward-events/extract-forward-events.test.mjs
// (or: node --test src/lib/forward-events/  to run every *.test.mjs in the directory)
//
// MOVED HERE (lane FIX, 2026-09-01) alongside extract-forward-events.mjs — see that file's header for
// why. WIRED into .discipline/run-test-suite.sh's src/lib/forward-events/*.test.mjs glob in the same
// commit as the move (Wave MH-5's own note about scripts/forward-events/*.test.mjs not being globbed no
// longer applies to this file post-move — it applies to run-extraction.test.mjs, which stays put and
// stays covered by that existing glob). Zero dependencies beyond node:test and the module under test —
// no `npm ci` required to run it.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  extractForwardEvents,
  EXTRACTOR_VERSION,
  isDueDateSlotClaim,
  slotDatePrecision,
  finerDuePrecision,
  normalizeObligationText,
  selectDateCell,
  sameObligationContent,
  dedupeEvents,
  unwrapRecordFactsTemplate,
  rescueSlotDateWithContext,
} from './extract-forward-events.mjs';

const KIND_VOCAB = new Set([
  'entry_into_force',
  'compliance_deadline',
  'review_or_report',
  'phase_step',
  'consultation_close',
  'other',
]);

function oneClaim(text, overrides = {}) {
  return {
    claims: [{ claim_id: 'c1', kind: 'FACT', text, span: text, ...overrides }],
    sections: [],
  };
}

function oneSection(md, overrides = {}) {
  return {
    claims: [],
    sections: [{ section_id: 's1', key: 'body', md, ...overrides }],
  };
}

// A single well-formed event should always satisfy the contract regardless
// of which rule produced it — checked by every positive-case test below.
function assertWellFormedEvent(event, sourceText) {
  assert.equal(typeof event.event_date, 'string');
  assert.match(event.event_date, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(['day', 'month', 'year'].includes(event.date_precision));
  assert.ok(KIND_VOCAB.has(event.event_kind), `unexpected event_kind: ${event.event_kind}`);
  assert.ok(['claim', 'section'].includes(event.source_kind));
  assert.ok(['high', 'medium'].includes(event.confidence));
  assert.equal(
    event.confidence,
    event.source_kind === 'claim' ? 'high' : 'medium',
    'confidence must track source_kind exactly'
  );
  assert.equal(event.extractor_version, EXTRACTOR_VERSION);
  assert.equal(typeof event.source_span, 'string');
  assert.ok(event.source_span.length > 0);
  assert.ok(sourceText.includes(event.source_span), 'source_span must be a verbatim substring');
  assert.equal(typeof event.obligation_text, 'string');
  assert.ok(event.obligation_text.length > 0);
  if (event.source_kind === 'claim') {
    assert.equal(event.source_section_id, null);
    assert.ok(event.source_claim_id);
  } else {
    assert.equal(event.source_claim_id, null);
    assert.ok(event.source_section_id);
  }
}

// ---------------------------------------------------------------------------
// Date forms
// ---------------------------------------------------------------------------

describe('date forms', () => {
  test('ISO date (YYYY-MM-DD) via entry-into-force-style trigger', () => {
    const text = 'The rule entered into force on 2026-01-01.';
    const { events } = extractForwardEvents(oneClaim(text));
    assert.equal(events.length, 1);
    assert.equal(events[0].event_date, '2026-01-01');
    assert.equal(events[0].date_precision, 'day');
    assertWellFormedEvent(events[0], text);
  });

  test('full English day-month-year: "1 January 2026"', () => {
    const text = 'This Decision shall apply from 1 January 2026 to 31 December 2029.';
    const { events } = extractForwardEvents(oneClaim(text));
    const start = events.find((e) => e.source_span === '1 January 2026');
    assert.ok(start);
    assert.equal(start.event_date, '2026-01-01');
    assert.equal(start.date_precision, 'day');
    assertWellFormedEvent(start, text);
  });

  test('full English day-month-year: "16 November 2010"', () => {
    const text = 'The Convention entered into force on 16 November 2010.';
    const { events } = extractForwardEvents(oneClaim(text));
    assert.equal(events.length, 1);
    assert.equal(events[0].event_date, '2010-11-16');
    assert.equal(events[0].date_precision, 'day');
  });

  test('"31 December 2027" via "no later than"', () => {
    const text = 'Member States shall transpose this Directive no later than 31 December 2027.';
    const { events } = extractForwardEvents(oneClaim(text));
    assert.equal(events.length, 1);
    assert.equal(events[0].event_date, '2027-12-31');
    assert.equal(events[0].event_kind, 'compliance_deadline');
  });

  test('"by 1 July 2015" deadline phrasing', () => {
    const text = 'Operators shall obtain certification by 1 July 2015.';
    const { events } = extractForwardEvents(oneClaim(text));
    assert.equal(events.length, 1);
    assert.equal(events[0].event_date, '2015-07-01');
    assert.equal(events[0].event_kind, 'compliance_deadline');
  });

  test('bare year "from 2026" with deontic language is extracted, year precision', () => {
    const text = 'From 2026, operators shall report emissions annually.';
    const { events } = extractForwardEvents(oneClaim(text));
    assert.equal(events.length, 1);
    assert.equal(events[0].event_date, '2026-01-01');
    assert.equal(events[0].date_precision, 'year');
  });

  test('bare year "as of 2030" with deontic language is extracted', () => {
    const text = 'As of 2030, all vessels shall comply with the emissions cap.';
    const { events } = extractForwardEvents(oneClaim(text));
    assert.equal(events.length, 1);
    assert.equal(events[0].event_date, '2030-01-01');
    assert.equal(events[0].date_precision, 'year');
  });

  test('"no later than 31 December 2027" (explicit minimum-support form)', () => {
    const text = 'The report is due no later than 31 December 2027.';
    const { events } = extractForwardEvents(oneClaim(text));
    assert.equal(events.length, 1);
    assert.equal(events[0].event_date, '2027-12-31');
  });

  test('"with effect from 1 January 2026" deontic clause', () => {
    const text = 'With effect from 1 January 2026, national authorities shall enforce the limit.';
    const { events } = extractForwardEvents(oneClaim(text));
    assert.equal(events.length, 1);
    assert.equal(events[0].event_date, '2026-01-01');
    assert.equal(events[0].event_kind, 'compliance_deadline');
  });

  test('ISO form standalone', () => {
    const text = 'Applicable from 2026-06-15 for new registrations, shall apply as stated.';
    const { events } = extractForwardEvents(oneClaim(text));
    // "Applicable from" is not itself a wired trigger phrase, but "shall"
    // later in the sentence makes the bare "from"-rule window pick it up.
    assert.ok(events.some((e) => e.event_date === '2026-06-15'));
  });

  test('month-year, no day: "May 2026"', () => {
    const text = 'By May 2026, the Commission shall publish updated guidance.';
    const { events } = extractForwardEvents(oneClaim(text));
    assert.equal(events.length, 1);
    assert.equal(events[0].event_date, '2026-05-01');
    assert.equal(events[0].date_precision, 'month');
  });

  test('Portuguese full date: "1º de janeiro de 2027"', () => {
    const text = 'a partir de 1º de janeiro de 2027, reduce emissions.';
    const { events } = extractForwardEvents(oneClaim(text));
    assert.equal(events.length, 1);
    assert.equal(events[0].event_date, '2027-01-01');
    assert.equal(events[0].date_precision, 'day');
    assert.equal(events[0].event_kind, 'phase_step');
  });

  test('Portuguese "até" (until) form', () => {
    const text = 'ciclo do poço à roda até 31 de dezembro de 2031';
    const { events } = extractForwardEvents(oneClaim(text));
    assert.equal(events.length, 1);
    assert.equal(events[0].event_date, '2031-12-31');
    assert.equal(events[0].event_kind, 'phase_step');
  });

  test('weekday-prefixed date does not pollute source_span', () => {
    const text = 'The new deadline for submissions is Monday, 6 April 2026 at 5:00 PM (CET).';
    const { events } = extractForwardEvents(oneClaim(text));
    assert.equal(events.length, 1);
    assert.equal(events[0].source_span, '6 April 2026');
    assert.equal(events[0].event_date, '2026-04-06');
  });

  test('non-breaking-space separated date ("1&nbsp;January 2026")', () => {
    const text = 'This Decision shall apply from 1 January 2026 to 31 December 2029.';
    const { events } = extractForwardEvents(oneClaim(text));
    const start = events.find((e) => e.event_kind === 'entry_into_force');
    assert.ok(start);
    assert.equal(start.event_date, '2026-01-01');
  });

  test('invalid calendar date (30 February) is not emitted', () => {
    const text = 'Operators shall comply by 30 February 2026.';
    const { events, skipped } = extractForwardEvents(oneClaim(text));
    assert.equal(events.length, 0);
    // Not a recognised date fragment at all, so it never becomes a
    // "candidate" either — nothing to report as skipped for it specifically.
    assert.equal(skipped.length, 0);
  });
});

// ---------------------------------------------------------------------------
// event_kind coverage
// ---------------------------------------------------------------------------

describe('event_kind vocabulary', () => {
  test('entry_into_force: "entered into force on"', () => {
    const text = 'MARPOL Annex VI entered into force on 1 November 2022.';
    const { events } = extractForwardEvents(oneClaim(text));
    assert.equal(events.length, 1);
    assert.equal(events[0].event_kind, 'entry_into_force');
  });

  test('compliance_deadline: "By <date>, <party> shall <verb>"', () => {
    const text = 'By 1 September 2030, Member States shall ensure charging infrastructure is available.';
    const { events } = extractForwardEvents(oneClaim(text));
    assert.equal(events.length, 1);
    assert.equal(events[0].event_kind, 'compliance_deadline');
  });

  test('review_or_report: "review shall be completed by <date>"', () => {
    const text = 'A review shall be completed by 1 January 2026 by the Organization to assess effectiveness.';
    const { events } = extractForwardEvents(oneClaim(text));
    assert.equal(events.length, 1);
    assert.equal(events[0].event_kind, 'review_or_report');
  });

  test('review_or_report: "By <date>, the Commission shall submit ... a report"', () => {
    const text =
      'By 31 December 2027, the Commission shall submit to the European Parliament a report on battery durability.';
    const { events } = extractForwardEvents(oneClaim(text));
    assert.equal(events.length, 1);
    assert.equal(events[0].event_kind, 'review_or_report');
  });

  test('phase_step: "shall apply from <date> for <segment>"', () => {
    const text = 'It shall apply from 29 November 2026 for new types of vehicles of categories M1 and N1.';
    const { events } = extractForwardEvents(oneClaim(text));
    assert.equal(events.length, 1);
    assert.equal(events[0].event_kind, 'phase_step');
  });

  test('phase_step: tiered "by <date> for <class>, by <date> for <class>" list', () => {
    const text =
      'Where uniform provisions are not adopted by 1 July 2026 for C1 class tyres, by 1 April 2028 for C2 class tyres, the Commission shall act.';
    const { events } = extractForwardEvents(oneClaim(text));
    const dates = events.map((e) => e.event_date).sort();
    assert.deepEqual(dates, ['2026-07-01', '2028-04-01']);
    for (const e of events) assert.equal(e.event_kind, 'phase_step');
  });

  test('consultation_close: "public consultation ending on <date>"', () => {
    const text = 'The Commission opened a 4-week public consultation ending on 10 June 2026.';
    const { events } = extractForwardEvents(oneClaim(text));
    assert.equal(events.length, 1);
    assert.equal(events[0].event_kind, 'consultation_close');
  });

  test('consultation_close: "consultation closed <date>"', () => {
    const text = 'Status: Public consultation closed 10 June 2026.';
    const { events } = extractForwardEvents(oneClaim(text));
    assert.equal(events.length, 1);
    assert.equal(events[0].event_kind, 'consultation_close');
  });

  test('other: repeal date of a superseded instrument', () => {
    const text = 'Regulation (EC) No 715/2007 is repealed with effect from 1 July 2030.';
    const { events } = extractForwardEvents(oneClaim(text));
    assert.equal(events.length, 1);
    assert.equal(events[0].event_kind, 'other');
  });

  test('other: window-end date of a "shall apply from X to Y" validity period', () => {
    const text = 'This Decision shall apply from 1 January 2026 to 31 December 2029.';
    const { events } = extractForwardEvents(oneClaim(text));
    assert.equal(events.length, 2);
    const start = events.find((e) => e.event_date === '2026-01-01');
    const end = events.find((e) => e.event_date === '2029-12-31');
    assert.equal(start.event_kind, 'entry_into_force');
    assert.equal(end.event_kind, 'other');
  });

  test('other: aim/target language without a deontic party obligation', () => {
    const text = 'We are committed to reduce our absolute emissions by 90% by 2050 from a 2018 base year.';
    const { events } = extractForwardEvents(oneClaim(text));
    assert.equal(events.length, 1);
    assert.equal(events[0].event_kind, 'other');
    assert.equal(events[0].event_date, '2050-01-01');
  });
});

// ---------------------------------------------------------------------------
// Anti-pattern: citations, historical narration, non-events (RED-first)
// ---------------------------------------------------------------------------

describe('non-extraction: citations and historical narration', () => {
  test('a bare directive/regulation citation number is not a date', () => {
    const text = 'This provision amends Directive 2005/35/EC on ship-source pollution.';
    const { events } = extractForwardEvents(oneClaim(text));
    assert.equal(events.length, 0);
  });

  test('a citation number is not a date even with a nearby "by" elsewhere', () => {
    const text = 'Compliance is assessed by reference to Regulation (EU) 2023/1805 and its annexes.';
    const { events } = extractForwardEvents(oneClaim(text));
    assert.equal(events.length, 0);
  });

  test('"as amended in <year>" revision history is not an event', () => {
    const text = 'The framework, adopted in 2006, as amended in 2019, continues to apply.';
    const { events } = extractForwardEvents(oneClaim(text));
    assert.equal(events.length, 0);
  });

  test('narrative "In <year>, ... " scene-setting is not an event', () => {
    const text = 'In 2024, the Port saw record container throughput, up sharply from prior years.';
    const { events } = extractForwardEvents(oneClaim(text));
    assert.equal(events.length, 0);
  });

  test('a market-forecast statistic bound to a year is not an event', () => {
    const text = 'EV battery demand is expected to triple by 2030 to reach more than 8% of the market.';
    const { events, skipped } = extractForwardEvents(oneClaim(text));
    assert.equal(events.length, 0);
    // This case IS a live candidate (a "by <year>" trigger fired) that was
    // deliberately rejected for lacking obligation-binding language — it
    // must show up in skipped with a reason, not vanish silently.
    assert.equal(skipped.length, 1);
    assert.match(skipped[0].reason, /deontic|aim/i);
  });

  test('an "as of <date>" status snapshot on a GAP claim is not an event', () => {
    const text = '[coverage_gap] Penalty schedule not available from primary sources as of 2025-06-05.';
    const { events, skipped } = extractForwardEvents(oneClaim(text, { kind: 'GAP' }));
    assert.equal(events.length, 0);
    assert.equal(skipped.length, 1);
    assert.match(skipped[0].reason, /unavailability/i);
  });

  test('an "as of <date>" narrative status count is not an event', () => {
    const text = 'As of April 2025, 384 NEVI-funded charging stations were operational nationwide.';
    const { events, skipped } = extractForwardEvents(oneClaim(text));
    assert.equal(events.length, 0);
    assert.equal(skipped.length, 1);
    assert.match(skipped[0].reason, /snapshot/i);
  });

  test('a historical entry-into-force date IS extracted (forward-vs-past is not the filter)', () => {
    // Per the module's inclusion rule: obligation-binding language is what
    // matters, not whether the date is in the future relative to "now".
    const text = 'MARPOL Annex VI entered into force on 1 November 2022.';
    const { events } = extractForwardEvents(oneClaim(text));
    assert.equal(events.length, 1);
    assert.equal(events[0].event_kind, 'entry_into_force');
  });
});

// ---------------------------------------------------------------------------
// Precision tagging
// ---------------------------------------------------------------------------

describe('precision tagging', () => {
  test('day precision when a full date is given', () => {
    const { events } = extractForwardEvents(oneClaim('The rule entered into force on 2026-03-15.'));
    assert.equal(events[0].date_precision, 'day');
  });

  test('month precision when only month+year is given, normalised to day 01', () => {
    const text = 'By March 2026, the Commission shall issue guidance.';
    const { events } = extractForwardEvents(oneClaim(text));
    assert.equal(events[0].date_precision, 'month');
    assert.equal(events[0].event_date, '2026-03-01');
  });

  test('year precision when only a bare year is given, normalised to Jan 1', () => {
    const text = 'From 2027 onwards, operators shall comply with the new limit.';
    const { events } = extractForwardEvents(oneClaim(text));
    assert.equal(events[0].date_precision, 'year');
    assert.equal(events[0].event_date, '2027-01-01');
  });

  test('never invents a day that was not given', () => {
    const text = 'By March 2026, operators must file their returns.';
    const { events } = extractForwardEvents(oneClaim(text));
    assert.equal(events.length, 1);
    // The source text names no day — date_precision honestly says so, and
    // the day component is the documented 01 normalisation, not a guess.
    assert.equal(events[0].date_precision, 'month');
  });
});

// ---------------------------------------------------------------------------
// Verbatim span
// ---------------------------------------------------------------------------

describe('verbatim source_span', () => {
  test('source_span is always an exact substring of the originating claim span', () => {
    const text =
      'By 31 December 2027, the Commission shall submit a report; it shall enter into force on 1 January 2026.';
    const { events } = extractForwardEvents(oneClaim(text));
    assert.ok(events.length >= 2);
    for (const e of events) {
      assert.ok(text.includes(e.source_span), `"${e.source_span}" not found verbatim in source text`);
    }
  });

  test('source_span is always an exact substring of the originating section md', () => {
    const md = 'Status: Public consultation closed 10 June 2026. Effective from 1 January 2026, obligors shall comply.';
    const { events } = extractForwardEvents(oneSection(md));
    assert.ok(events.length >= 1);
    for (const e of events) {
      assert.ok(md.includes(e.source_span));
    }
  });

  test('source_span never includes trailing punctuation past the date itself', () => {
    const text = 'The rule entered into force on 1 November 2022.';
    const { events } = extractForwardEvents(oneClaim(text));
    assert.equal(events[0].source_span, '1 November 2022');
  });
});

// ---------------------------------------------------------------------------
// Confidence / source wiring
// ---------------------------------------------------------------------------

describe('confidence and source wiring', () => {
  test('claim-sourced events are confidence "high" with source_claim_id set', () => {
    const text = 'The Regulation entered into force on 1 January 2026.';
    const { events } = extractForwardEvents(oneClaim(text));
    assert.equal(events[0].confidence, 'high');
    assert.equal(events[0].source_kind, 'claim');
    assert.equal(events[0].source_claim_id, 'c1');
    assert.equal(events[0].source_section_id, null);
  });

  test('section-sourced events are confidence "medium" with source_section_id set', () => {
    const md = 'The Regulation entered into force on 1 January 2026.';
    const { events } = extractForwardEvents(oneSection(md));
    assert.equal(events[0].confidence, 'medium');
    assert.equal(events[0].source_kind, 'section');
    assert.equal(events[0].source_section_id, 's1');
    assert.equal(events[0].source_claim_id, null);
  });

  test('every emitted event carries the current extractor_version', () => {
    const text = 'It entered into force on 1 January 2026.';
    const { events } = extractForwardEvents(oneClaim(text));
    for (const e of events) assert.equal(e.extractor_version, EXTRACTOR_VERSION);
  });

  test('GAP claims are scanned exactly like FACT claims when they carry a span', () => {
    const text = '[gap] A review shall be completed by 1 January 2026 by the Organization.';
    const { events } = extractForwardEvents(oneClaim(text, { kind: 'GAP' }));
    assert.equal(events.length, 1);
    assert.equal(events[0].confidence, 'high');
  });
});

// ---------------------------------------------------------------------------
// Empty / degenerate input
// ---------------------------------------------------------------------------

describe('empty and degenerate input', () => {
  test('no claims, no sections', () => {
    const { events, skipped } = extractForwardEvents({ claims: [], sections: [] });
    assert.deepEqual(events, []);
    assert.deepEqual(skipped, []);
  });

  test('missing claims/sections keys entirely', () => {
    const { events, skipped } = extractForwardEvents({});
    assert.deepEqual(events, []);
    assert.deepEqual(skipped, []);
  });

  test('null/undefined input does not throw', () => {
    assert.doesNotThrow(() => extractForwardEvents(null));
    assert.doesNotThrow(() => extractForwardEvents(undefined));
    const { events } = extractForwardEvents(undefined);
    assert.deepEqual(events, []);
  });

  test('a claim with span: null is skipped wholesale (no ungrounded fallback to text)', () => {
    const input = {
      claims: [
        {
          claim_id: 'c1',
          kind: 'GAP',
          text: '[penalty_summary] Not available as of date of generation.',
          span: null,
        },
      ],
      sections: [],
    };
    const { events, skipped } = extractForwardEvents(input);
    assert.deepEqual(events, []);
    assert.deepEqual(skipped, []);
  });

  test('a claim with empty-string span is skipped wholesale', () => {
    const input = { claims: [{ claim_id: 'c1', kind: 'FACT', text: 'x', span: '' }], sections: [] };
    const { events } = extractForwardEvents(input);
    assert.deepEqual(events, []);
  });

  test('a non-FACT/GAP claim kind is ignored', () => {
    const input = {
      claims: [{ claim_id: 'c1', kind: 'OTHER', text: 'x', span: 'entered into force on 1 January 2026.' }],
      sections: [],
    };
    const { events } = extractForwardEvents(input);
    assert.deepEqual(events, []);
  });

  test('a section with empty/missing md is ignored without throwing', () => {
    const input = {
      claims: [],
      sections: [
        { section_id: 's1', key: 'body', md: '' },
        { section_id: 's2', key: 'body', md: null },
        { section_id: 's3', key: 'body' },
      ],
    };
    assert.doesNotThrow(() => extractForwardEvents(input));
    const { events } = extractForwardEvents(input);
    assert.deepEqual(events, []);
  });

  test('text with no date-shaped tokens at all yields nothing', () => {
    const text = 'Operators shall comply with best available techniques at all times.';
    const { events, skipped } = extractForwardEvents(oneClaim(text));
    assert.deepEqual(events, []);
    assert.deepEqual(skipped, []);
  });

  test('is a pure function: same input twice yields deep-equal output', () => {
    const input = {
      claims: [
        { claim_id: 'c1', kind: 'FACT', text: 'x', span: 'By 1 September 2030, Member States shall comply.' },
      ],
      sections: [{ section_id: 's1', key: 'body', md: 'Entered into force on 1 January 2026.' }],
    };
    const r1 = extractForwardEvents(input);
    const r2 = extractForwardEvents(input);
    assert.deepEqual(r1, r2);
  });
});

// ---------------------------------------------------------------------------
// Fixture-shaped integration smoke test (no filesystem read of the real
// fixture — extract-forward-events.mjs takes no I/O — but this exercises a
// realistic multi-claim, multi-section item shape end to end).
// ---------------------------------------------------------------------------

describe('multi-claim item shape', () => {
  test('extracts distinct events across multiple claims and sections in one item, well-formed throughout', () => {
    const input = {
      claims: [
        { claim_id: 'c1', kind: 'FACT', text: 't', span: 'MARPOL Annex VI entered into force on 1 November 2022.' },
        {
          claim_id: 'c2',
          kind: 'FACT',
          text: 't',
          span: 'By 31 December 2027, the Commission shall submit a report on implementation.',
        },
        { claim_id: 'c3', kind: 'GAP', text: 't', span: null },
        { claim_id: 'c4', kind: 'FACT', text: 't', span: 'This provision cites Directive 2005/35/EC.' },
      ],
      sections: [
        {
          section_id: 's1',
          key: 'deadlines',
          md: 'A 4-week public consultation ending on 10 June 2026 was opened.',
        },
      ],
    };
    const { events, skipped } = extractForwardEvents(input);
    assert.equal(events.length, 3);
    assert.deepEqual(skipped, []);
    const byKind = Object.fromEntries(events.map((e) => [e.event_kind, e]));
    assert.ok(byKind.entry_into_force);
    assert.ok(byKind.review_or_report);
    assert.ok(byKind.consultation_close);
    for (const e of events) {
      const src = e.source_kind === 'claim' ? input.claims.find((c) => c.claim_id === e.source_claim_id).span : input.sections[0].md;
      assertWellFormedEvent(e, src);
    }
  });
});

// ---------------------------------------------------------------------------
// Record-grade due_date slot claims (lane FE-SLOT, 2026-09-03)
// ---------------------------------------------------------------------------
// The record-grade mint (src/lib/intake/record-facts.mjs) grounds its due_date slot as a FACT claim
// whose claim_text carries a fixed "[due_date] " prefix and, when resolved, a "(date_precision: X)"
// marker — section_claim_provenance has no slot_key column, so this prefix is the only surviving marker
// once the claim round-trips through the DB (see write-item.ts's buildClaimRows, which drops slot_key).

function dueDateClaim({ span, precision = null, claimId = 'due1', kind = 'FACT', context }) {
  const precisionPart = precision ? ` (date_precision: ${precision})` : '';
  const claim = {
    claim_id: claimId,
    kind,
    text: `[due_date] The captured source states a due date${precisionPart}, verbatim: «${span}»`,
    span,
  };
  if (context !== undefined) claim.context = context;
  return claim;
}

describe('isDueDateSlotClaim / slotDatePrecision (pure helpers)', () => {
  test('true only for a FACT claim whose text carries the [due_date] template prefix', () => {
    assert.equal(isDueDateSlotClaim(dueDateClaim({ span: 'By 1 January 2027, X shall notify.' })), true);
    assert.equal(isDueDateSlotClaim({ kind: 'FACT', text: 'no marker here', span: 'x' }), false);
    assert.equal(isDueDateSlotClaim(dueDateClaim({ span: 'x', kind: 'GAP' })), false);
    assert.equal(isDueDateSlotClaim({ kind: 'FACT', text: undefined, span: 'x' }), false);
  });

  test('slotDatePrecision reads the marker back, or null when absent / not a due_date slot claim', () => {
    assert.equal(slotDatePrecision(dueDateClaim({ span: 'x', precision: 'month' })), 'month');
    assert.equal(slotDatePrecision(dueDateClaim({ span: 'x', precision: null })), null);
    assert.equal(slotDatePrecision({ kind: 'FACT', text: 'ordinary claim', span: 'x' }), null);
  });
});

describe('finerDuePrecision (pure helper)', () => {
  test('day beats month beats year', () => {
    assert.equal(finerDuePrecision('month', 'day'), 'day');
    assert.equal(finerDuePrecision('year', 'month'), 'month');
    assert.equal(finerDuePrecision('day', 'year'), 'day');
  });

  test('never returns the coarser of the two, and a tie is stable', () => {
    assert.equal(finerDuePrecision('day', 'month'), 'day');
    assert.equal(finerDuePrecision('month', 'month'), 'month');
  });

  test('a slot precision this module cannot represent (quarter, null, unrecognised) never overrides', () => {
    assert.equal(finerDuePrecision('year', 'quarter'), 'year');
    assert.equal(finerDuePrecision('day', 'quarter'), 'day');
    assert.equal(finerDuePrecision('month', null), 'month');
    assert.equal(finerDuePrecision('month', 'nonsense'), 'month');
  });

  test('an unrecognised extractor precision is returned unchanged rather than promoted', () => {
    assert.equal(finerDuePrecision('quarter', 'day'), 'quarter');
  });
});

describe('extractForwardEvents: due_date slot claim integration', () => {
  test('a slot claim whose span already classifies keeps its own (finer) precision unchanged', () => {
    // Real corpus example (population-33749140151, item 32008L0098): the extractor's own day-precision
    // match is already finer than what a coarser slot marker would supply.
    const span = 'By 31 December 2014 at the latest, the Commission shall examine the measures and the targ';
    const claim = dueDateClaim({ span, precision: 'month' }); // deliberately coarser than the real 'day'
    const { events, skipped } = extractForwardEvents({ claims: [claim], sections: [] });
    assert.equal(events.length, 1);
    assert.equal(events[0].event_kind, 'compliance_deadline');
    assert.equal(events[0].date_precision, 'day'); // extractor's own finer precision wins
    assert.deepEqual(skipped, []); // classified — no slot_date_unclassified skip
  });

  test('a slot claim whose own match is coarser than the slot marker is upgraded to the finer precision', () => {
    const span = 'shall comply by 2027';
    const claim = dueDateClaim({ span, precision: 'month' }); // synthetic: isolates the blend mechanism
    const { events } = extractForwardEvents({ claims: [claim], sections: [] });
    assert.equal(events.length, 1);
    assert.equal(events[0].event_kind, 'compliance_deadline');
    assert.equal(events[0].date_precision, 'month'); // slot's finer precision replaces the bare-year match
    assert.equal(events[0].event_date, '2027-01-01'); // ISO itself is never invented past what was parsed
  });

  // lane FE-SLOT-2 (2026-09-04) retired the single 'slot_date_unclassified' bucket into three named
  // reasons — see extract-forward-events.mjs's own "DUE-DATE SLOT CONTEXT RESCUE" header note.

  test('a slot claim with no parseable calendar date at all is relative_deadline_no_calendar_date, never silently dropped', () => {
    const span = 'within 15 days of the effective date of disapproval';
    const claim = dueDateClaim({ span, precision: null }); // record-facts.mjs found the span but no precision
    const { events, skipped } = extractForwardEvents({ claims: [claim], sections: [] });
    assert.equal(events.length, 0);
    assert.equal(skipped.length, 1);
    assert.equal(skipped[0].reason, 'relative_deadline_no_calendar_date');
    assert.equal(skipped[0].source_claim_id, claim.claim_id);
    assert.equal(skipped[0].source_kind, 'claim');
    assert.equal(skipped[0].text, span);
  });

  test('a slot claim with a parseable date but no classifiable kind and NO context is calendar_date_deontic_context_unavailable, alongside the generic scanText skip', () => {
    const span = 'by 1 May 2021, notify the Commission of those rules'; // deontic verb truncated away upstream
    const claim = dueDateClaim({ span, precision: 'day' }); // no `context` — reader found no capture for this span
    const { events, skipped } = extractForwardEvents({ claims: [claim], sections: [] });
    assert.equal(events.length, 0);
    assert.equal(skipped.length, 2);
    // push order: the generic scanText skip (from the span-only scan) is recorded first, then the
    // due_date-slot-specific reason — never sorted, so this asserts actual push order, not just membership.
    assert.deepEqual(skipped.map((s) => s.reason), [
      "date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation",
      'calendar_date_deontic_context_unavailable',
    ]);
  });

  test('same span, WITH context that genuinely carries no deontic/aim nearby either: calendar_date_no_deontic_in_context', () => {
    const span = 'by 1 May 2021, notify the Commission of those rules';
    const claim = dueDateClaim({
      span,
      precision: 'day',
      context: { before: 'This is a purely narrative sentence with no legal force. ', after: ' The end of the paragraph.' },
    });
    const { events, skipped } = extractForwardEvents({ claims: [claim], sections: [] });
    assert.equal(events.length, 0);
    assert.deepEqual(skipped.map((s) => s.reason), [
      "date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation",
      'calendar_date_no_deontic_in_context',
    ]);
  });

  test('same span, WITH context that DOES carry a deontic verb nearby: rescued into a real event, kind never assumed from the slot', () => {
    const span = 'by 1 May 2021, notify the Commission of those rules';
    const claim = dueDateClaim({
      span,
      precision: 'day',
      context: { before: 'Member States shall ensure that the operator, ', after: ' as set out in Annex III.' },
    });
    const { events, skipped } = extractForwardEvents({ claims: [claim], sections: [] });
    assert.equal(events.length, 1);
    assert.equal(events[0].event_date, '2021-05-01');
    assert.equal(events[0].event_kind, 'compliance_deadline'); // by-year-target's own DEONTIC-window promotion, never a slot-assumed kind
    assert.equal(events[0].confidence, 'high');
    assert.equal(events[0].source_kind, 'claim');
    assert.equal(events[0].source_claim_id, claim.claim_id);
    assert.equal(events[0].source_span, '1 May 2021'); // the matched date substring, same as any other claim-origin hit — never claim.span itself
    assert.ok(events[0].obligation_text.includes('notify the Commission'));
    // the generic scanText skip (from the span-only scan) still fires — the rescue is IN ADDITION to it,
    // never a silent replacement.
    assert.equal(skipped.length, 1);
    assert.match(skipped[0].reason, /no deontic/);
  });

  test('the rescue never substitutes a DIFFERENT date found only in before/after — it can only confirm the slot\'s own date', () => {
    // `before` carries its own unrelated, fully-formed deadline sentence with a real deontic verb; the
    // slot's own span date (1 May 2021) still has no deontic language of its own nearby within the rule's
    // window once the two clauses are far enough apart — this must never be promoted using the WRONG date's
    // deontic language.
    const span = 'by 1 May 2021, notify the Commission of those rules';
    const claim = dueDateClaim({
      span,
      precision: 'day',
      context: {
        before: 'The Commission shall report by 1 June 2019. Completely separate paragraph text here that pads the distance well past any deontic window boundary so the two clauses cannot be confused for one sentence, ',
        after: ' No further obligation language follows this clause at all.',
      },
    });
    const { events } = extractForwardEvents({ claims: [claim], sections: [] });
    assert.equal(events.length, 0, 'must never borrow deontic language from an unrelated, distant date');
  });

  test('never invents a kind: a due_date slot claim never gets an event the RULES table itself would not have produced for an ordinary claim with the same span', () => {
    const span = 'within 15 days of the effective date of disapproval';
    const plain = { claim_id: 'c1', kind: 'FACT', text: 'an ordinary claim, no slot marker', span };
    const slot = dueDateClaim({ span, claimId: 'c2' });
    const plainResult = extractForwardEvents({ claims: [plain], sections: [] });
    const slotResult = extractForwardEvents({ claims: [slot], sections: [] });
    assert.deepEqual(plainResult.events, []);
    assert.deepEqual(slotResult.events, []); // same: no event invented just because this is a slot claim
  });

  test('an ordinary (non-slot) claim with no hit is completely unaffected: no slot_date_unclassified noise', () => {
    const span = 'no dates or triggers in this text at all';
    const claim = { claim_id: 'c1', kind: 'FACT', text: 'plain claim', span };
    const { events, skipped } = extractForwardEvents({ claims: [claim], sections: [] });
    assert.equal(events.length, 0);
    assert.deepEqual(skipped, []);
  });
});

// ---------------------------------------------------------------------------
// rescueSlotDateWithContext (pure helper, direct) — lane FE-SLOT-2, 2026-09-04. See extract-forward-
// events.mjs's own "DUE-DATE SLOT CONTEXT RESCUE" header for the full mechanism.
// ---------------------------------------------------------------------------

describe('rescueSlotDateWithContext (pure helper, direct)', () => {
  test('null when context is missing, malformed, or claimSpan is empty', () => {
    assert.equal(rescueSlotDateWithContext('by 1 May 2021, notify', null), null);
    assert.equal(rescueSlotDateWithContext('by 1 May 2021, notify', undefined), null);
    assert.equal(rescueSlotDateWithContext('by 1 May 2021, notify', { before: 'x' }), null); // no `after`
    assert.equal(rescueSlotDateWithContext('', { before: 'x', after: 'y' }), null);
    assert.equal(rescueSlotDateWithContext(null, { before: 'x', after: 'y' }), null);
  });

  test('finds a hit whose matched date lies within the slot span itself, kind computed by the wider scan', () => {
    const span = 'by 1 May 2021, notify the Commission of those rules';
    const context = { before: 'Member States shall ensure that the operator, ', after: ' as set out in Annex III.' };
    const hit = rescueSlotDateWithContext(span, context);
    assert.ok(hit, 'expected a rescued hit');
    assert.equal(hit.iso, '2021-05-01');
    assert.equal(hit.kind, 'compliance_deadline');
    assert.equal(hit.dateSpan, '1 May 2021');
  });

  test('null when the context genuinely carries no deontic/aim language near the date', () => {
    const span = 'by 1 May 2021, notify the Commission of those rules';
    const context = { before: 'This is narrative text with no legal force. ', after: ' The paragraph ends here.' };
    assert.equal(rescueSlotDateWithContext(span, context), null);
  });

  test('rejects a hit whose matched date falls OUTSIDE the slot span range (a date only in before/after)', () => {
    // `before` alone, scanned on its own, contains a perfectly good rescuable date+deontic pair -- but it
    // is not the slot's own date, so it must never be returned as a rescue for THIS claim.
    const span = 'no forward-obligation language or date pattern in this fragment';
    const context = { before: 'The Commission shall report by 1 June 2019. ', after: '' };
    assert.equal(rescueSlotDateWithContext(span, context), null);
  });
});

// ---------------------------------------------------------------------------
// GARBLED obligation_text — lane FWD-TEXT, 2026-09-04. Fixtures below are built from rows read LIVE
// against the production DB (project kwrsbpiseruzbfwjpvsp) this session, per the coordinator's evidence
// captured on https://carosledge.com/regulations ("Upcoming obligations" strip, 2026-09-04 ~08:15 UTC):
//   select ... from item_forward_events e join intelligence_items i on i.id = e.intelligence_item_id
//   where i.title ilike '%euro 7%' or i.title ilike '%net-zero industry act%' order by ...
// `NZIA_CLAIM_SPAN` is `section_claim_provenance.source_span` VERBATIM for claim id
// 9e819545-2e22-41aa-93af-afe53764feaa (EU Net-Zero Industry Act). `EURO7_SECTION_*` are VERBATIM
// `intelligence_item_sections.content_md` substrings (250 chars before + 250 after the matched date) for
// section ids 67f883dc-ccfc-46d0-9d28-d08e324acf69 and 5ba16763-cafe-47bf-b5d5-bf18fa53b2c5 (Euro 7
// Standard), read via `select substr(content_md, position('29 November 2026' in content_md)-250, 500)`.
// ---------------------------------------------------------------------------

describe('clauseStart / normalizeObligationText: the garbled-rendering fix', () => {
  const NZIA_CLAIM_SPAN =
    'venues generated from fines. By 25 September 2026, and every five years thereafter, Member States shall make public';

  const EURO7_SECTION_A =
    '...published 8 May 2024, placing entry into force at **28 May 2024**. *Source: Regulation (EU) 2024/1257, ' +
    'Article 21. https://eur-lex.europa.eu/eli/reg/2024/1257/oj/eng\n\n**Primary headline compliance deadline — ' +
    'FACT:** "It shall apply from 29 November 2026 for new types of vehicles of categories M₁ and N₁ and ' +
    'components, systems and separate technical units intended for vehicles of categories M₁ or N₁ ' +
    'type-approved under this Regulation and from 29 November 2027 for new vehicles of cat';

  const EURO7_SECTION_B =
    '...strategy for road emissions reporting should treat current carrier data formats as transitional.\n\n' +
    '**Re-check window:** 29 May 2025.\n\n### B — Commission Implementing Acts for Heavy-Duty Vehicles (M₂, M₃, ' +
    'N₂, N₃) | MONITORING\n\n**FACT — deadline:** "By 29 November 2026, the Commission shall adopt, for ' +
    'vehicles of categories M₂, M₃, N₂ and N₃… and their engines, as well as for trailers of categories O₃ ' +
    'and O₄," implementing acts covering the same categories of methodologies as for light-duty. *Sourc';

  test('claim-sourced: no longer starts mid-word ("re|venues") — this specific case is inherited FROM the claim.span, not this module\'s own windowing, and the sentence-boundary snap incidentally excludes the already-truncated leading fragment by starting at the next real sentence', () => {
    const claim = { claim_id: 'c1', kind: 'FACT', text: '[gate-a-backfill] ' + NZIA_CLAIM_SPAN, span: NZIA_CLAIM_SPAN };
    const { events } = extractForwardEvents({ claims: [claim], sections: [] });
    assert.equal(events.length, 1);
    // lane FWD-TEXT-2, 2026-09-04: the claim.span itself ends abruptly at "public" (no terminal
    // punctuation -- the source grounding pass truncated it there, upstream of this module). The
    // trailing edge no longer pretends that is a complete sentence: normalizeObligationText appends an
    // honest "…" rather than a bare, silently-incomplete stop.
    assert.equal(
      events[0].obligation_text,
      'By 25 September 2026, and every five years thereafter, Member States shall make public…'
    );
    assert.ok(!events[0].obligation_text.startsWith('venues'), 'must not start mid-word');
    // source_span stays byte-exact regardless — the verbatim-span law is untouched by any of this.
    assert.equal(events[0].source_span, '25 September 2026');
    assert.ok(NZIA_CLAIM_SPAN.includes(events[0].source_span));
  });

  test('section-sourced (phase_step): no longer starts mid-word AND drops the leaked URL tail + bold markdown label', () => {
    const { events } = extractForwardEvents({ claims: [], sections: [{ section_id: 's1', key: '2', md: EURO7_SECTION_A }] });
    assert.equal(events.length, 1);
    const text = events[0].obligation_text;
    assert.ok(!text.startsWith('7/oj/eng'), `must not carry the leaked URL tail, got: ${text}`);
    assert.ok(!text.includes('**'), `must not carry a markdown bold label, got: ${text}`);
    assert.ok(text.startsWith('"It shall apply from 29 November 2026'), `unexpected start: ${text}`);
  });

  test('section-sourced (compliance_deadline): no longer starts mid-word ("Ve|hicles") AND drops the leading table-pipe cell + bold markdown label', () => {
    const { events } = extractForwardEvents({ claims: [], sections: [{ section_id: 's2', key: '6', md: EURO7_SECTION_B }] });
    assert.equal(events.length, 1);
    const text = events[0].obligation_text;
    assert.ok(!text.startsWith('hicles'), `must not start mid-word, got: ${text}`);
    assert.ok(!text.includes('|'), `must not carry a markdown table pipe, got: ${text}`);
    assert.ok(!text.includes('**'), `must not carry a markdown bold label, got: ${text}`);
    assert.ok(text.startsWith('"By 29 November 2026'), `unexpected start: ${text}`);
  });

  test('regression guard: a span shorter than maxBefore is NEVER trimmed at its own true start (the bug this fix\'s first cut introduced and this test catches)', () => {
    // "shall enter into force on" begins at char 16 of this 59-char span -- well within the 60-char
    // maxBefore bound, so the window's true start (index 0) is the text's own start, not a truncation
    // point. Advancing past "This " here would silently change every existing obligation_text this short
    // (and, concretely, broke the migration-275 dedupe-key match in
    // apply-staged-update-forward-participation.npmtest.mjs before this guard was added).
    const span = 'This Regulation shall enter into force on 1 January 2027.';
    const { events } = extractForwardEvents({ claims: [{ claim_id: 'c1', kind: 'FACT', text: span, span }], sections: [] });
    assert.equal(events.length, 1);
    assert.equal(events[0].obligation_text, span);
  });

  test('normalizeObligationText is idempotent on already-clean text with no false-positive stripping (lane FWD-TEXT-2: this fixture carries no terminal punctuation, so it now gets an honest "…" suffix -- see the trailing-edge rule -- but nothing else about it changes, and a second call is a true no-op)', () => {
    const clean = 'By 1 September 2030, Member States shall inform the Commission of the application of this Regulation';
    const once = normalizeObligationText(clean);
    assert.equal(once, clean + '…');
    assert.equal(normalizeObligationText(once), once);
  });

  test('normalizeObligationText strips a trailing stray table-pipe fragment (lane FWD-TEXT-2: the sentence itself has no terminal punctuation in this fixture, so the honest "…" suffix still applies once the pipe cell is gone)', () => {
    const raw = 'The Commission shall publish the assessment by 1 January 2028 | NEXT STEPS';
    assert.equal(normalizeObligationText(raw), 'The Commission shall publish the assessment by 1 January 2028…');
  });
});

// ---------------------------------------------------------------------------
// WITHIN-EXTRACTION DEDUPE — lane FWD-TEXT, 2026-09-04.
// ---------------------------------------------------------------------------

describe('sameObligationContent (pure helper)', () => {
  test('the SAME sentence, one plain (claim-style) and one markdown-wrapped (section-style), compares equal', () => {
    const a =
      'It shall apply from 29 November 2026 for new types of vehicles of categories M 1 and N 1 and components, ' +
      'systems and separate technical units intended for vehicles of categories M 1 or N 1 type-ap';
    const b =
      '"It shall apply from 29 November 2026 for new types of vehicles of categories M₁ and N₁ and components, ' +
      'systems and separate technical units intended for vehicles of categories M₁ or N₁ type-approv';
    assert.equal(sameObligationContent(a, b), true);
  });

  test('the SAME sentence where the section renders a trailing clause as an ellipsis abbreviation still compares equal (long shared prefix)', () => {
    const a =
      'By 29 November 2026, the Commission shall adopt, for vehicles of categories M 2 , M 3 , N 2 and N 3, as ' +
      'referred to in paragraph 3, points (b) and (c), respectively, and their eng';
    const b =
      '"By 29 November 2026, the Commission shall adopt, for vehicles of categories M₂, M₃, N₂ and N₃… and their ' +
      'engines, as well as for trailers of categories O₃ and O₄," implementing ac';
    assert.equal(sameObligationContent(a, b), true);
  });

  test('two genuinely DIFFERENT obligations sharing a date are never treated as the same sentence, even at similar length', () => {
    const a = 'With effect from 29 November 2026, Member States shall prohibit the sale or installation of a system';
    const b = 'With effect from 29 November 2026, approval authorities shall, in the case of new types of vehicles';
    assert.equal(sameObligationContent(a, b), false);
  });

  test('two DIFFERENT section obligations that merely mention the same underlying fact in different words never match (the NZIA counter-example, measured live 2026-09-04: a blind (event_date,event_kind) collapse would have deleted these)', () => {
    const a =
      "The NZIA's 50 Mt/year CO2 injection capacity target by 2030, combined with Strategic Project designation " +
      'for CO2 capture and transport infrastructure, will generate new cargo flows';
    const b =
      "The regulation's 50 Mt CO2 injection capacity target by 2030 is the most specific quantified output that " +
      'creates a new logistics cargo category';
    assert.equal(sameObligationContent(a, b), false);
  });

  test('too short a shared prefix is never treated as a match (avoids false positives on a coincidental shared opening phrase)', () => {
    assert.equal(sameObligationContent('By 1 January 2030, X shall do A.', 'By 1 January 2030, Y shall do B.'), false);
  });

  // SHORT-TEXT EXACT-DUPLICATE FIX (lane FE-DEDUP, 2026-09-04) — see this file's own header note above.
  // The 40-char floor above exists to stop a coincidental SHORT SHARED PREFIX between two DIFFERENT
  // sentences from being mistaken for a duplicate; it must never also block an EXACT full-string match,
  // which carries no such coincidence risk at any length.
  test('the coordinator\'s own live pair — item 02470d94, events a4ad1ce7 (section) / ca126684 (claim), ' +
    'obligation_text "…entered into force on 14 April 1967…" both sides, 37 chars — compares equal ' +
    '[CONFIRMED, live SQL, project kwrsbpiseruzbfwjpvsp, 2026-09-04]', () => {
    const claimText = '…entered into force on 14 April 1967…';
    const sectionText = '…entered into force on 14 April 1967…';
    assert.equal(claimText.length, 37, 'sanity: this pair sits under DEDUPE_MIN_COMPARE_LEN (40), the exact case this fix closes');
    assert.equal(sameObligationContent(claimText, sectionText), true);
  });

  test('a synthetic exact match under the 40-char floor compares equal (pre-fix this returned false and left the twin live)', () => {
    const a = 'It shall apply from 2 December 2030.'; // 37 chars, live corpus text (item cd1083c9)
    const b = 'It shall apply from 2 December 2030.';
    assert.equal(a.length < 40, true);
    assert.equal(sameObligationContent(a, b), true);
  });

  test('an EXACT match at any length still short-circuits even when it would also pass the length-gated fuzzy check (no regression to the long-text path)', () => {
    const a = 'By 29 November 2026, the Commission shall adopt implementing acts specifying the format';
    assert.equal(sameObligationContent(a, a), true);
  });

  test('two DIFFERENT short texts under the floor still do not match (the floor still guards the fuzzy/prefix path — this fix only adds an EXACT-match short-circuit, it does not remove the floor)', () => {
    assert.equal(sameObligationContent('It shall apply from 2 December 2030.', 'It shall apply from 3 December 2030.'), false);
  });
});

describe('dedupeEvents (pure helper)', () => {
  function ev(overrides) {
    return {
      event_date: '2026-11-29',
      event_kind: 'compliance_deadline',
      obligation_text: 'By 29 November 2026, the Commission shall adopt implementing acts',
      source_kind: 'claim',
      confidence: 'high',
      ...overrides,
    };
  }

  test('a claim-backed hit is kept over a content-duplicate section-backed hit; the drop is recorded, not silent', () => {
    const claimHit = ev({ source_kind: 'claim', confidence: 'high' });
    const sectionHit = ev({
      source_kind: 'section',
      confidence: 'medium',
      obligation_text: '"By 29 November 2026, the Commission shall adopt implementing acts" — see Article 12.',
    });
    const { events, dropped } = dedupeEvents([sectionHit, claimHit]); // order-independent: section pushed first
    assert.equal(events.length, 1);
    assert.equal(events[0].source_kind, 'claim');
    assert.equal(dropped.length, 1);
    assert.equal(dropped[0].source_kind, 'section');
    assert.equal(dropped[0].reason, 'claim_backed_preferred_over_section_backed');
  });

  test('two content-duplicate section-backed hits: the first is kept, the later one dropped', () => {
    const first = ev({ source_kind: 'section', confidence: 'medium' });
    const second = ev({ source_kind: 'section', confidence: 'medium', obligation_text: first.obligation_text + ' (Article 12).' });
    const { events, dropped } = dedupeEvents([first, second]);
    assert.equal(events.length, 1);
    assert.equal(events[0], first);
    assert.equal(dropped.length, 1);
    assert.equal(dropped[0].reason, 'duplicate_same_confidence_kept_first');
  });

  test('two hits sharing (event_date, event_kind) but NOT the same sentence content are both kept — never a blind date+kind collapse', () => {
    const a = ev({ obligation_text: 'With effect from 29 November 2026, Member States shall prohibit the sale of X' });
    const b = ev({ obligation_text: 'With effect from 29 November 2026, approval authorities shall refuse to grant Y' });
    const { events, dropped } = dedupeEvents([a, b]);
    assert.equal(events.length, 2);
    assert.equal(dropped.length, 0);
  });

  test('hits in different (event_date, event_kind) groups are never compared to each other', () => {
    const a = ev({ event_date: '2026-11-29' });
    const b = ev({ event_date: '2027-01-01' }); // identical obligation_text, different date
    const { events, dropped } = dedupeEvents([a, b]);
    assert.equal(events.length, 2);
    assert.equal(dropped.length, 0);
  });

  test('counts.dedupe_dropped / dedupe_dropped_detail on extractForwardEvents itself, end to end', () => {
    const spanClaim =
      'It shall apply from 29 November 2026 for new types of vehicles of categories M 1 and N 1 and components';
    const mdSection =
      '**Primary headline — FACT:** "It shall apply from 29 November 2026 for new types of vehicles of categories M₁ and N₁ and components';
    const claims = [{ claim_id: 'c1', kind: 'FACT', text: spanClaim, span: spanClaim }];
    const sections = [{ section_id: 's1', key: 'x', md: mdSection }];
    const { events, counts } = extractForwardEvents({ claims, sections });
    assert.equal(events.length, 1, 'the section-sourced duplicate must be collapsed away');
    assert.equal(counts.dedupe_dropped, 1);
    assert.equal(counts.dedupe_dropped_detail.length, 1);
    assert.equal(counts.dedupe_dropped_detail[0].source_kind, 'section');
    assert.equal(counts.dedupe_dropped_detail[0].kept_source_kind, 'claim');
  });
});

// ---------------------------------------------------------------------------
// selectDateCell (pure helper) — lane FWD-TEXT-2, 2026-09-04
// ---------------------------------------------------------------------------

describe('selectDateCell (pure helper)', () => {
  test('a short date-only cell is treated as a table COLUMN — the cell after it (the description) is kept', () => {
    const row = 'By 2030 | Potential methanol demand at Port of Singapore to potentially exceed 1 MTPA (subject to supply chain and regulatory development) | Indicative';
    assert.equal(
      selectDateCell(row, '2030'),
      'Potential methanol demand at Port of Singapore to potentially exceed 1 MTPA (subject to supply chain and regulatory development)'
    );
  });

  test('a LONG date-bearing cell (a heading fragment | the real sentence) is kept as-is, not the cell after it (there is none)', () => {
    const row = 'hicles (M₂, M₃, N₂, N₃) | MONITORING **FACT — deadline:** "By 29 November 2026, the Commission shall adopt" implementing acts';
    const chosen = selectDateCell(row, '29 November 2026');
    assert.ok(chosen.startsWith('MONITORING'));
    assert.ok(chosen.includes('29 November 2026'));
  });

  test('a full sentence with the date inline, plus a short trailing label cell, keeps the sentence and drops the label', () => {
    const row = 'The Commission shall publish the assessment by 1 January 2028 | NEXT STEPS';
    assert.equal(selectDateCell(row, '1 January 2028'), 'The Commission shall publish the assessment by 1 January 2028');
  });

  test('no dateSpan supplied: falls back to this module\'s own date grammar to find the date-shaped cell', () => {
    const row = 'By 2040 | IMO checkpoint: cut GHG emissions by at least 70%, striving for 80% | Target | MPA media release Apr 2024';
    assert.equal(selectDateCell(row), 'IMO checkpoint: cut GHG emissions by at least 70%, striving for 80%');
  });

  test('a chosen cell that is a bare URL falls back to the single longest cell instead', () => {
    const row = 'Regulator announcement (Tier 2) | European Commission DG TAXUD | 14 January 2026 | https://taxation-customs.example';
    const chosen = selectDateCell(row, '14 January 2026');
    assert.ok(!chosen.startsWith('http'));
    assert.equal(chosen, 'Regulator announcement (Tier 2)');
  });

  test('no pipe at all: returns the text unchanged', () => {
    assert.equal(selectDateCell('no table here', '2030'), 'no table here');
  });
});

// ---------------------------------------------------------------------------
// OBLIGATION-TEXT REBUILD — corpus-wide idempotence + property tests, lane FWD-TEXT-2, 2026-09-04.
//
// The coordinator's own dry-run summary of Maintenance #32 (`forward-events-retext` dry, master 2f110fea
// = FWD-TEXT's landed fe1-2026-09-04.1 code, run 33856356721) is `scripts/_snapshots/retext32.json` — 654
// `retext_targets[]`, each `{ id, intelligence_item_id, event_date, event_kind, source_kind, before, after,
// defect_classes }`. `_snapshots/` is gitignored scratch (CLAUDE.md standing rule 5) and is NOT part of
// this repo's tracked tree, so these two tests self-skip (never fail) when the file is absent — e.g. a
// fresh clone, or CI without this lane's working directory — same "diagnosable, never a false red"
// convention CLAUDE.md standing rule 15 states for a verifier missing its credentials. Run inside THIS
// lane's worktree (where the coordinator placed the file as evidence), both run for real against the full
// 654 rows and print the measured counts the dispatch asked for.
// ---------------------------------------------------------------------------

const RETEXT32_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'scripts', '_snapshots', 'retext32.json');

function loadRetext32Before() {
  let raw;
  try {
    raw = readFileSync(RETEXT32_PATH, 'utf8');
  } catch {
    return null;
  }
  const parsed = JSON.parse(raw);
  const before = (parsed.retext_targets ?? []).map((t) => t.before);
  return before.length ? before : null;
}

describe('OBLIGATION-TEXT REBUILD: corpus-wide idempotence + property tests (retext32.json, 654 rows)', () => {
  const beforeTexts = loadRetext32Before();

  test('normalizeObligationText is idempotent over every row (skips if retext32.json is not present in this checkout)', (t) => {
    if (!beforeTexts) {
      t.skip('scripts/_snapshots/retext32.json not present in this checkout (gitignored scratch) — see this describe block\'s header');
      return;
    }
    let failures = 0;
    const examples = [];
    for (const raw of beforeTexts) {
      const once = normalizeObligationText(raw);
      const twice = normalizeObligationText(once);
      if (once !== twice) {
        failures++;
        if (examples.length < 3) examples.push({ once, twice });
      }
    }
    if (failures > 0) console.log('idempotence failures:', failures, JSON.stringify(examples, null, 2));
    assert.equal(failures, 0, `normalizeObligationText(normalizeObligationText(x)) !== normalizeObligationText(x) for ${failures}/${beforeTexts.length} rows`);
  });

  test('property set over every row: no bad leading char, no *, no pipe-cell, no bare URL, proper trailing punctuation or an honest ellipsis (skips if retext32.json is not present)', (t) => {
    if (!beforeTexts) {
      t.skip('scripts/_snapshots/retext32.json not present in this checkout (gitignored scratch) — see this describe block\'s header');
      return;
    }
    let badLeading = 0;
    let rawLowercaseStart = 0;
    let ellipsisPrefixed = 0;
    let hasStar = 0;
    let hasPipeCell = 0;
    let hasUrl = 0;
    let badTrailing = 0;
    const badLeadingEx = [];
    const badTrailingEx = [];

    for (const raw of beforeTexts) {
      const t2 = normalizeObligationText(raw);
      assert.ok(t2.length > 0, 'obligation_text must never be emptied to nothing');

      if (/^[a-z]/.test(t2)) rawLowercaseStart++; // should be ~0 -- these should now be "…"-prefixed instead
      if (t2.startsWith('…')) ellipsisPrefixed++;
      if (!/^[A-Za-z0-9"'“‘«(…]/.test(t2)) {
        badLeading++;
        if (badLeadingEx.length < 5) badLeadingEx.push(t2.slice(0, 80));
      }
      if (t2.includes('*')) hasStar++;
      if (/\s\|\s|^\S*\|/.test(t2)) hasPipeCell++;
      if (/https?:\/\//i.test(t2)) hasUrl++;
      if (!/[.!?"”»…]$/.test(t2)) {
        badTrailing++;
        if (badTrailingEx.length < 5) badTrailingEx.push(t2.slice(-60));
      }
    }

    console.log(
      `retext32.json property test over ${beforeTexts.length} 'before' rows:`,
      JSON.stringify(
        {
          bad_leading_char: badLeading,
          raw_lowercase_start: rawLowercaseStart,
          ellipsis_prefixed_honest_fragments: ellipsisPrefixed,
          contains_star: hasStar,
          contains_pipe_cell: hasPipeCell,
          contains_bare_url: hasUrl,
          bad_trailing_punctuation: badTrailing,
        },
        null,
        1
      )
    );
    if (badLeadingEx.length) console.log('bad leading examples:', JSON.stringify(badLeadingEx));
    if (badTrailingEx.length) console.log('bad trailing examples:', JSON.stringify(badTrailingEx));

    assert.equal(badLeading, 0, 'every row must start with a letter, quote, digit, "(" or the honest-fragment ellipsis');
    assert.equal(hasStar, 0, 'no row may still carry a markdown emphasis marker');
    assert.equal(hasPipeCell, 0, 'no row may still carry a markdown table pipe cell');
    assert.equal(hasUrl, 0, 'no row may still carry a bare URL');
    assert.equal(badTrailing, 0, 'every row must end in real terminal punctuation or the honest-fragment ellipsis');
    // rawLowercaseStart is reported, not asserted to be exactly 0 by construction (a lowercase start is
    // itself the trigger for the ellipsis prefix, so by the time this loop reads t2 it should already be
    // ~0 -- the assertion above on badLeading is the one that actually enforces it, since a raw lowercase
    // start with no ellipsis would itself be a `badLeading` failure only if lowercase were excluded from
    // the allowed-leading set, which it is not (see LEADING_OK_RE) -- this counter exists purely to
    // surface, per the dispatch's own request, how many rows the ellipsis-prefix branch actually fired on.
  });
});

// ---------------------------------------------------------------------------
// Small ALWAYS-RUN fixture of real corpus text (curated, embedded — no gitignored-file dependency), so the
// property behaviour above is exercised in every environment, not only inside this lane's own worktree.
// Each string below is a verbatim `before` value read from retext32.json this lane, one per defect class.
// ---------------------------------------------------------------------------

describe('OBLIGATION-TEXT REBUILD: embedded real-corpus fixtures (always run, no snapshot dependency)', () => {
  const REAL_BEFORE_SAMPLES = [
    // starts_lowercase
    "iving for 10%, of the energy used by international shipping by 2030.",
    // starts_nonletter (a leaked URL tail before a bold label)
    "L/?uri=CELEX:32023R0956 **Effective date:** The regulation entered into force on 17 May 2023 (the day following publication in the Official Journal).",
    // bold_marker + pipe_cell + starts_lowercase (the Euro 7 heavy-duty case)
    "hicles (M₂, M₃, N₂, N₃) | MONITORING **FACT — deadline:** \"By 29 November 2026, the Commission shall adopt, for vehicles of categories M₂, M₃, N₂ and N₃… and their engines, as well as for trailers of categories O₃ and O₄,\" implementing ac",
    // bare label, no bold
    "FACT: \"To align with the Net Zero Emissions by 2050 (NZE) Scenario, emissions must fall by 15% from 2022 to 2030, declining at roughly 2% pe",
    // pipe_cell, trailing ';'
    "By 2030 | Potential methanol demand at Port of Singapore to potentially exceed 1 MTPA (subject to supply chain and regulatory development) | Indicativ",
    // url_tail trailing, inside a table row
    "Regulator announcement (Tier 2) | European Commission DG TAXUD | 14 January 2026 | https://taxation-customs.",
    // starts with a citation-key-like fragment + stray '*'
    "5(5), Regulation (EU) 2025/40, EUR-Lex, 22.1.2025.* FACT: By 12 August 2030, the Commission shall carry out an evaluation to assess the need to amend or repeal the PFAS restriction in order to avoid overlaps with restrictions under Reg",
    // already-clean (control case: should pass through unchanged, or only ellipsis-suffixed if no terminator)
    "This Decision shall apply from 1 July 2026 until 30 November 2026.",
  ];

  test('idempotent on every embedded real-corpus sample', () => {
    for (const raw of REAL_BEFORE_SAMPLES) {
      const once = normalizeObligationText(raw);
      const twice = normalizeObligationText(once);
      assert.equal(twice, once, `not idempotent for: ${JSON.stringify(raw)}`);
    }
  });

  test('every embedded real-corpus sample satisfies the full property set after normalization', () => {
    for (const raw of REAL_BEFORE_SAMPLES) {
      const t2 = normalizeObligationText(raw);
      assert.ok(t2.length > 0, `emptied: ${JSON.stringify(raw)}`);
      assert.match(t2, /^[A-Za-z0-9"'“‘«(…]/, `bad leading char in: ${JSON.stringify(t2)}`);
      assert.ok(!t2.includes('*'), `still has '*': ${JSON.stringify(t2)}`);
      assert.ok(!/\s\|\s|^\S*\|/.test(t2), `still has a pipe cell: ${JSON.stringify(t2)}`);
      assert.ok(!/https?:\/\//i.test(t2), `still has a bare URL: ${JSON.stringify(t2)}`);
      assert.match(t2, /[.!?"”»…]$/, `bad trailing punctuation in: ${JSON.stringify(t2)}`);
    }
  });

  test('the clean control case keeps its own sentence intact (no false-positive stripping), only gaining the honest "…" suffix it lacked', () => {
    const clean = 'This Decision shall apply from 1 July 2026 until 30 November 2026.';
    assert.equal(normalizeObligationText(clean), clean); // already ends in '.', nothing added
  });
});

// ---------------------------------------------------------------------------
// RECORD-FACTS TEMPLATE UNWRAP — lane FWD-TEXT-3, 2026-09-04. See this module's own header ("RECORD-FACTS
// TEMPLATE UNWRAP") for the full root cause and measurement. Three real rows, verbatim from the coordinator's
// dispatch evidence (item ids below are this lane's own live-SQL re-identification of the same rows,
// 2026-09-04, project kwrsbpiseruzbfwjpvsp — see `unwrapRecordFactsTemplate`'s own describe block below for
// the corpus-wide property test's SQL).
// ---------------------------------------------------------------------------

describe('unwrapRecordFactsTemplate: the three template shapes, direct', () => {
  test('generic slot FACT: passage is the text inside the ONE «…» pair', () => {
    const windowed = '[primary_deadline] The captured source states, verbatim: «By 30 April 2022 and in each subsequent year, the Secretary of State must publish a li»';
    const dateSpan = '30 April 2022';
    const relStart = windowed.indexOf(dateSpan);
    const result = unwrapRecordFactsTemplate(windowed, relStart, relStart + dateSpan.length);
    assert.equal(result.passage, 'By 30 April 2022 and in each subsequent year, the Secretary of State must publish a li');
  });

  test('due_date FACT with a "(date_precision: X)" label: the label never reaches the passage (it sits outside the «…» pair)', () => {
    const windowed =
      '[due_date] The captured source states a due date (date_precision: day), verbatim: «by 31 December 2020" substitute " under Article 8 »';
    const dateSpan = '31 December 2020';
    const relStart = windowed.indexOf(dateSpan);
    const result = unwrapRecordFactsTemplate(windowed, relStart, relStart + dateSpan.length);
    assert.ok(!result.skip, `expected a passage, got skip: ${result.skip}`);
    assert.ok(!result.passage.includes('date_precision'), 'the wrapper label leaked into the passage');
    assert.ok(!result.passage.includes('captured source'));
    assert.equal(result.passage, 'by 31 December 2020" substitute " under Article 8 ');
  });

  test('binding_position FACT: passage is the "from the passage" quote, never the leading «code» quote', () => {
    const windowed =
      "[binding_position] The captured source's own applicability language places this item at «monitoring_only» (Monitor), from the passage: «does not apply to: (a) food as defined in Article 2 of Regulation (EC) No 178/2002»";
    // the event's date lives in a SEPARATE, later claim in the real corpus (binding_position's own quote
    // rarely carries a date) — model that here by putting relDateStart/relDateEnd inside the SECOND quote.
    const secondQuoteStart = windowed.indexOf('does not apply');
    const result = unwrapRecordFactsTemplate(windowed, secondQuoteStart, secondQuoteStart + 10);
    assert.equal(result.passage, 'does not apply to: (a) food as defined in Article 2 of Regulation (EC) No 178/2002');
    assert.ok(!result.passage.startsWith('monitoring_only'), 'must never pick the leading «code» quote');
  });

  test('a nested «…»: keeps the INNERMOST pair that contains the event date, not the outer wrapper', () => {
    const windowed = '[primary_deadline] The captured source states, verbatim: «the notice reads «by 1 January 2030» in the annex»';
    const dateSpan = '1 January 2030';
    const relStart = windowed.indexOf(dateSpan);
    const result = unwrapRecordFactsTemplate(windowed, relStart, relStart + dateSpan.length);
    assert.equal(result.passage, 'by 1 January 2030');
  });

  test('a legacy straight-quote wrapper (pre-guillemet-migration content, still live — 26/1333 record_facts sections, measured live) is unwrapped the same way', () => {
    const windowed =
      '[primary_deadline] The captured source states, verbatim: "No later than 14 February 2004, the Commission shall forward to the Member States a guidance document s"';
    const dateSpan = '14 February 2004';
    const relStart = windowed.indexOf(dateSpan);
    const result = unwrapRecordFactsTemplate(windowed, relStart, relStart + dateSpan.length);
    assert.equal(result.passage, 'No later than 14 February 2004, the Commission shall forward to the Member States a guidance document s');
  });

  test('a GAP wrapper is never unwrapped into a passage — skip with a recorded reason (rule 3)', () => {
    const windowed =
      '[due_date] No verbatim due-date statement was located in the captured source text for this record-grade item. A full-brief regrounding will re-examine this gap when this item upgrades from record to brief.';
    // Defensive-only: a GAP sentence carries no date in real corpus text, so this call is synthetic (there
    // is no genuine relDateStart/relDateEnd for a GAP window) — any offset still routes to skip.
    const result = unwrapRecordFactsTemplate(windowed, 0, 5);
    assert.equal(result.skip, 'record_facts_gap_boilerplate_no_quoted_date');
  });

  test('a binding_position GAP wrapper (different middle clause) is also recognised as GAP, never a FACT shape', () => {
    const windowed =
      '[binding_position] No verbatim applicability language naming a duty-holder class was located in the captured source text for this record-grade item. A full-brief regrounding will re-examine this gap when this item upgrades from record to brief.';
    const result = unwrapRecordFactsTemplate(windowed, 0, 5);
    assert.equal(result.skip, 'record_facts_gap_boilerplate_no_quoted_date');
  });

  test('a FACT-shaped wrapper whose own date is not inside any quote at all is a defensive skip, never emitted raw', () => {
    const windowed = '[primary_deadline] The captured source states, verbatim: «no date in here»';
    // relDateStart/relDateEnd point OUTSIDE the quote entirely -- should not occur in real extraction (the
    // date this module matched always comes from inside `windowed`), but must never crash or emit prose.
    const result = unwrapRecordFactsTemplate(windowed, 0, 3);
    assert.equal(result.skip, 'record_facts_template_date_not_in_quote');
  });

  test('text with no slot marker at all returns null -- ordinary window handling, unchanged', () => {
    assert.equal(unwrapRecordFactsTemplate('The Regulation shall apply from 1 July 2026.', 30, 42), null);
  });

  test('a bracketed citation year like "[2019]" is never mistaken for a slot marker', () => {
    assert.equal(unwrapRecordFactsTemplate('[2019] OJ L 123, entered into force on 1 January 2019.', 0, 5), null);
  });
});

describe('extractForwardEvents: end-to-end over real record-facts section content_md (verbatim from the coordinator\'s dispatch evidence)', () => {
  test('example 1 (due_date after a binding_position quote, item 128b6a2e-cf78-4c9f-b03d-9256a3df5222): section-derived text now matches the due_date quote, never the wrapper', () => {
    const md =
      "[effective_date] The captured source states, verbatim: «shall enter into force on the twentieth day following that of its publication in the Official Journal of the Eur»\n" +
      "[jurisdictional_scope] The captured source states, verbatim: «Member States, and subsequently to the ICAO Secretariat, it is appropriate to establish a preliminary e»\n" +
      "[penalty_summary] The captured source states, verbatim: «penalties to be imposed in the event of fraud which are commensurate with their purpose and which have an adequate dete»\n" +
      "[primary_deadline] The captured source states, verbatim: «by 30 June 2026 on the practical application and levels of uncertainty of the method»\n" +
      "[binding_position] The captured source's own applicability language places this item at «direct_duty» (Your duty), from the passage: «the operator shall provide to the competent authority data on the biomass fraction of the carbon content of»\n" +
      "[due_date] The captured source states a due date (date_precision: day), verbatim: «by 30 June 2026 on the practical application and levels of uncertainty of the method»";
    const { events } = extractForwardEvents(oneSection(md));
    const event = events.find((e) => e.event_date === '2026-06-30' && e.event_kind === 'compliance_deadline');
    assert.ok(event, 'expected a compliance_deadline event on 2026-06-30');
    // the due_date quote's own text starts lowercase ("by 30 June 2026...") -- the honest-fragment leading
    // "…" this module already applies to any lowercase-starting passage (FWD-TEXT-2) fires here too, exactly
    // as it does for a non-template window; this is not a defect, it is the SAME rule applied one level in.
    assert.equal(event.obligation_text, '…by 30 June 2026 on the practical application and levels of uncertainty of the method…');
    for (const forbidden of ['captured source', 'verbatim:', 'date_precision', 'from the passage', 'full-brief regrounding', "[due_date]", "[binding_position]"]) {
      assert.ok(!event.obligation_text.includes(forbidden), `still contains "${forbidden}": ${event.obligation_text}`);
    }
    assertWellFormedEvent(event, md);
  });

  test('example 2 (due_date immediately after a swept-in GAP sentence, item 025e6570-584f-4124-8b69-b69cc534e050): the prior GAP sentence is never swept in', () => {
    const md =
      "[effective_date] No verbatim effective date statement was located in the captured source text for this record-grade item. A full-brief regrounding will re-examine this gap when this item upgrades from record to brief.\n" +
      "[jurisdictional_scope] The captured source states, verbatim: «Member States” substitute “the United Kingdom”»\n" +
      "[penalty_summary] No verbatim penalty summary statement was located in the captured source text for this record-grade item. A full-brief regrounding will re-examine this gap when this item upgrades from record to brief.\n" +
      "[primary_deadline] The captured source states, verbatim: «By 30 April 2022 and in each subsequent year, the Secretary of State must publish a li»\n" +
      "[binding_position] No verbatim applicability language naming a duty-holder class was located in the captured source text for this record-grade item. A full-brief regrounding will re-examine this gap when this item upgrades from record to brief.\n" +
      "[due_date] The captured source states a due date (date_precision: day), verbatim: «By 30 April 2022 and in each subsequent year, the Secretary of State must publish a li»";
    const { events } = extractForwardEvents(oneSection(md));
    const event = events.find((e) => e.event_date === '2022-04-30' && e.event_kind === 'compliance_deadline');
    assert.ok(event, 'expected a compliance_deadline event on 2022-04-30');
    assert.equal(event.obligation_text, 'By 30 April 2022 and in each subsequent year, the Secretary of State must publish a li…');
    assert.ok(!event.obligation_text.startsWith('A full-brief regrounding'), 'swept the previous GAP sentence in');
    assertWellFormedEvent(event, md);
  });

  test('example 3 (legacy straight-quote wrapper, item 10cf4da4-9363-4365-90df-a1dceace1b66): unwrapped the same way as a guillemet wrapper', () => {
    const md =
      '[effective_date] The captured source states, verbatim: "shall enter into force on the day of its publication in the Official Journal of the European Union"\n' +
      '[jurisdictional_scope] The captured source states, verbatim: "addressed to the Member States"\n' +
      '[penalty_summary] No verbatim penalty summary statement was located in the captured source text for this record-grade item. A full-brief regrounding will re-examine this gap when this item upgrades from record to brief.\n' +
      '[primary_deadline] The captured source states, verbatim: "No later than 14 February 2004, the Commission shall forward to the Member States a guidance document s"';
    const { events } = extractForwardEvents(oneSection(md));
    const event = events.find((e) => e.event_date === '2004-02-14' && e.event_kind === 'compliance_deadline');
    assert.ok(event, 'expected a compliance_deadline event on 2004-02-14');
    assert.equal(event.obligation_text, 'No later than 14 February 2004, the Commission shall forward to the Member States a guidance document s…');
    assertWellFormedEvent(event, md);
  });

  test('a GAP-only section (no FACT quote at all) produces no event and no crash', () => {
    const md =
      '[due_date] No verbatim due-date statement was located in the captured source text for this record-grade item. A full-brief regrounding will re-examine this gap when this item upgrades from record to brief.';
    const { events, skipped } = extractForwardEvents(oneSection(md));
    assert.equal(events.length, 0);
    assert.equal(skipped.length, 0); // no date was ever matched inside GAP boilerplate -- nothing to skip either
  });
});

// ---------------------------------------------------------------------------
// FWD-TEXT-4 residue fix, lane FWD-TEXT-4, 2026-09-04 — see this module's own header, "RECORD-FACTS
// TEMPLATE UNWRAP, RESIDUE", for the full measurement. Fixture below is the verbatim live `content_md`
// (`intelligence_item_sections` id c4aae646-47ba-4b56-a6b3-5feca772706d`) read this lane via:
//   SELECT e.*, s.content_md FROM item_forward_events e
//   JOIN intelligence_item_sections s ON s.id = e.source_section_id
//   WHERE e.id = '4ab41812-cfb2-433c-a1be-077fd128d381';
// project kwrsbpiseruzbfwjpvsp, 2026-09-04.
// ---------------------------------------------------------------------------

describe('extractForwardEvents: FWD-TEXT-4 residue fix (marker beyond DEFAULT_MAX_BEFORE)', () => {
  test('the ONE live row still showing the raw template after FWD-TEXT-3 (operative_provision, marker 320 chars before its own date) now unwraps', () => {
    const md =
      '[effective_date] The captured source states, verbatim: «shall enter into force on the day following that of its publication in the Official Journal of the European Unio»\n' +
      '[jurisdictional_scope] The captured source states, verbatim: «applies to situations where an operator, for the purpose of updating benchmark values, has to attrib»\n' +
      '[penalty_summary] The captured source states, verbatim: «fines, fluxes and iron-containing recycling materials with the chemical and physical properties such as the level o»\n' +
      '[primary_deadline] No verbatim primary deadline statement was located in the captured source text for this record-grade item. A full-brief regrounding will re-examine this gap when this item upgrades from record to brief.\n' +
      '[binding_position] The captured source\'s own applicability language places this item at «direct_duty» (Your duty), from the passage: «The operator shall divide the installation concerned in sub-installations in accordance with Article 10»\n' +
      '[due_date] No verbatim due-date statement was located in the captured source text for this record-grade item. A full-brief regrounding will re-examine this gap when this item upgrades from record to brief.\n' +
      '[operative_provision] The captured source states, verbatim: «HAS ADOPTED THIS REGULATION: CHAPTER I General provisions Article 1 Scope This Regulation shall apply to the free allocation of emission allowances under Chapter III (Stationary installations) of Directive 2003/87/EC as regards the allocation periods as from 2021, with the exce»\n' +
      '[addressee] No verbatim addressee statement was located in the captured source text for this record-grade item. A full-brief regrounding will re-examine this gap when this item upgrades from record to brief.\n' +
      '[confirmed_measure] No verbatim confirmed measure statement was located in the captured source text for this record-grade item. A full-brief regrounding will re-examine this gap when this item upgrades from record to brief.\n' +
      '[in_force_status] No EUR-Lex legal-status indicator markup was located in the captured source text for this record-grade item (the deterministic capture pipeline\'s own clean-text/Cellar endpoints do not carry this widget). A full-brief regrounding will re-examine this gap when this item upgrades from record to brief.';

    // Measured: the marker start sits 315 chars before the "from" trigger and 320 before the date itself --
    // past DEFAULT_MAX_BEFORE (300), the exact condition this fix (MAX_BEFORE_FOR_MARKER) exists for.
    const markerIdx = md.indexOf('[operative_provision]');
    const dateIdx = md.indexOf('2021', md.indexOf('as from 2021'));
    assert.ok(dateIdx - markerIdx > 300, 'fixture must reproduce the out-of-range condition this test guards');

    const { events } = extractForwardEvents(oneSection(md));
    const event = events.find((e) => e.event_date === '2021-01-01' && e.source_span === '2021');
    assert.ok(event, 'expected a 2021-01-01 event on the "2021" span');
    assert.equal(event.event_kind, 'compliance_deadline');
    assert.equal(
      event.obligation_text,
      'HAS ADOPTED THIS REGULATION: CHAPTER I General provisions Article 1 Scope This Regulation shall apply to the free allocation of emission allowances under Chapter III (Stationary installations) of Directive 2003/87/EC as regards the allocation periods as from 2021, with the exce…'
    );
    for (const forbidden of ['captured source', 'verbatim:', 'operative_provision', 'full-brief regrounding']) {
      assert.ok(!event.obligation_text.includes(forbidden), `still contains "${forbidden}": ${event.obligation_text}`);
    }
    assertWellFormedEvent(event, md);
  });

  test('negative fixture: a GAP-labelled prose sentence using "captured source" as ordinary language (item_forward_events id 0023163f-b057-419a-a2bf-62fe6b8c4b03) is unaffected -- no marker, so unwrapRecordFactsTemplate never fires, and the obligation_text is unchanged from the live row', () => {
    const md =
      '### Scale of Transition Required: Quantitative Context\n\n' +
      "GAP: A cited peer-reviewed study reportedly finds an alternative-fuel penetration requirement well beyond IMO's 5–10% target by 2030, using WtW lifecycle framing; the specific percentage range could not be independently verified against the captured source text.\n" +
      '*Source: Technical Requirements for 2023 IMO GHG Strategy, MDPI Sustainability, March 2024. https://www.mdpi.com/2071-1050/16/7/2766';
    const { events } = extractForwardEvents(oneSection(md));
    const event = events.find((e) => e.event_date === '2030-01-01');
    assert.ok(event, 'expected the pre-existing 2030-01-01 "other" event, unaffected by this lane\'s fix');
    assert.equal(event.event_kind, 'other');
    assert.equal(
      event.obligation_text,
      "A cited peer-reviewed study reportedly finds an alternative-fuel penetration requirement well beyond IMO's 5–10% target by 2030, using WtW lifecycle framing; the specific percentage range could not be independently verified against the captured source text."
    );
    assertWellFormedEvent(event, md);
  });

  test('negative fixture: a FACT-labelled brief sentence using "captured source" as ordinary language, no date anywhere in it (section_claim_provenance id 3c32b28e-9fb9-4c6a-8c9e-091c41ee86f4) produces no event and no crash', () => {
    const claimText = 'The captured source text states the figure "75%".';
    const { events, skipped } = extractForwardEvents(oneClaim(claimText, { span: '75 %' }));
    assert.equal(events.length, 0);
    assert.equal(skipped.length, 0); // no date-shaped trigger anywhere in this span -- nothing for scanText to skip either
  });

  test('a marker beyond even MAX_BEFORE_FOR_MARKER (3000) still falls back honestly -- never a crash, never a false unwrap', () => {
    const filler = 'x'.repeat(3100);
    const md = `[operative_provision] The captured source states, verbatim: «${filler} shall apply from 2021»`;
    const { events } = extractForwardEvents(oneSection(md));
    const event = events.find((e) => e.event_date === '2021-01-01');
    assert.ok(event, 'expected a 2021-01-01 event');
    // The marker is unreachable even by the widened look-back -- this is the pre-existing (unchanged)
    // fragment fallback, not a new defect: an honest "…"-prefixed window, never the raw template.
    assert.ok(event.obligation_text.startsWith('…'), `expected an honest fragment prefix: ${event.obligation_text}`);
    assert.ok(!event.obligation_text.includes('[operative_provision]'));
  });
});

// ---------------------------------------------------------------------------
// RECORD-FACTS TEMPLATE UNWRAP — corpus-wide property test, lane FWD-TEXT-3, 2026-09-04.
//
// Fixture: `scripts/_snapshots/fwdtext3-live-58.json` — read via read-only SQL, project kwrsbpiseruzbfwjpvsp,
// this lane, 2026-09-04:
//   select json_agg(row_to_json(t)) from (
//     select s.item_id as intelligence_item_id, s.id as section_id, s.section_key, s.content_md,
//       (select json_agg(json_build_object('id',e.id,'event_date',e.event_date,'event_kind',e.event_kind,
//          'obligation_text',e.obligation_text,'confidence',e.confidence,'source_span',e.source_span))
//        from item_forward_events e where e.source_section_id = s.id
//          and e.extractor_version = 'fe1-2026-09-04.2'
//          and e.obligation_text ~ '\[[a-z0-9_]+\]') as residue_rows,
//       (select json_agg(json_build_object('id',e.id,'event_date',e.event_date,'event_kind',e.event_kind,
//          'obligation_text',e.obligation_text,'confidence',e.confidence))
//        from item_forward_events e where e.intelligence_item_id = s.item_id
//          and e.source_kind = 'claim') as claim_rows
//     from intelligence_item_sections s
//     where s.section_key = 'record_facts' and s.id in (
//       select distinct source_section_id from item_forward_events
//       where source_section_id is not null and extractor_version = 'fe1-2026-09-04.2'
//         and obligation_text ~ '\[[a-z0-9_]+\]') ) t;
//
// NAMED "-live-58" after the coordinator's dispatch evidence snapshot (58 rows / 41 items, taken right
// after Maintenance #38's forward-events-retext APPLY); by the time this lane ran the query above, the
// backlog flywheel had minted more record-grade items in between (item_forward_events grew 926/173 ->
// 1071/228 over that window, live-measured) and the SAME residue class was 122 rows / 90 items -- a
// superset, not a different defect, and the larger number this test actually asserts over. `_snapshots/`
// is gitignored scratch (CLAUDE.md standing rule 5), so this test self-skips (never fails) when the file is
// absent, same convention as the OBLIGATION-TEXT REBUILD block above.
// ---------------------------------------------------------------------------

const LIVE58_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'scripts', '_snapshots', 'fwdtext3-live-58.json');
const RECORD_FACTS_FORBIDDEN = ['captured source', 'verbatim:', 'date_precision', 'from the passage', 'full-brief regrounding'];

function loadLive58() {
  let raw;
  try {
    raw = readFileSync(LIVE58_PATH, 'utf8');
  } catch {
    return null;
  }
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) && parsed.length ? parsed : null;
}

describe('RECORD-FACTS TEMPLATE UNWRAP: corpus-wide property test (fwdtext3-live-58.json)', () => {
  const fixture = loadLive58();
  const residueCount = fixture ? fixture.reduce((n, r) => n + (r.residue_rows?.length ?? 0), 0) : 0;

  test('every live residue row, re-extracted from its item\'s current record_facts section, no longer carries any record-facts wrapper token (skips if fwdtext3-live-58.json is not present in this checkout)', (t) => {
    if (!fixture) {
      t.skip('scripts/_snapshots/fwdtext3-live-58.json not present in this checkout (gitignored scratch) — see this describe block\'s header');
      return;
    }

    let tested = 0;
    let clean = 0;
    let matchedTwin = 0;
    let byVariant = {};
    const failures = [];
    const noFresh = [];

    for (const row of fixture) {
      const { events } = extractForwardEvents({
        claims: [],
        sections: [{ section_id: row.section_id, key: row.section_key, md: row.content_md }],
      });
      for (const residue of row.residue_rows ?? []) {
        tested++;
        const fresh = events.find((e) => e.event_date === residue.event_date && e.event_kind === residue.event_kind);
        if (!fresh) {
          noFresh.push({ item: row.intelligence_item_id, id: residue.id });
          continue;
        }
        const text = fresh.obligation_text;
        const hasForbidden =
          RECORD_FACTS_FORBIDDEN.some((f) => text.toLowerCase().includes(f.toLowerCase())) || /\[[a-z][a-z0-9_]*\]/i.test(text);
        if (hasForbidden) {
          failures.push({ item: row.intelligence_item_id, id: residue.id, text });
        } else {
          clean++;
        }
        // idempotence over the fresh output itself -- see the OBLIGATION-TEXT REBUILD block above for the
        // same property tested over the pre-existing (non-record-facts) defect classes.
        assert.equal(normalizeObligationText(text), text, `not idempotent: ${JSON.stringify(text)}`);

        const twin = (row.claim_rows ?? []).find((c) => c.event_date === residue.event_date && c.event_kind === residue.event_kind);
        if (twin && twin.obligation_text === text) matchedTwin++;

        // per-variant counts, reported per the dispatch's own request
        if (/\[due_date\][^]*date_precision/i.test(residue.obligation_text)) byVariant.due_date_with_precision = (byVariant.due_date_with_precision ?? 0) + 1;
        else if (/applicability language places this item at/i.test(residue.obligation_text)) byVariant.binding_position = (byVariant.binding_position ?? 0) + 1;
        else byVariant.plain_slot = (byVariant.plain_slot ?? 0) + 1;
      }
    }

    console.log(
      `fwdtext3-live-58.json property test: ${tested} residue rows, ${clean} clean, ${failures.length} still bad, ` +
        `${noFresh.length} with no fresh match, ${matchedTwin} exact-matched a claim-sourced twin.`,
      JSON.stringify(byVariant)
    );
    if (failures.length) console.log('still-bad examples:', JSON.stringify(failures.slice(0, 5), null, 2));
    if (noFresh.length) console.log('no-fresh-match examples:', JSON.stringify(noFresh.slice(0, 5), null, 2));

    assert.equal(tested, residueCount);
    assert.equal(noFresh.length, 0, 'every residue row must still produce a fresh event at its own (date, kind)');
    assert.equal(failures.length, 0, `${failures.length}/${tested} rows still carry a record-facts wrapper token after re-extraction`);
  });
});

// ---------------------------------------------------------------------------
// DUE-DATE SLOT CONTEXT RESCUE — corpus-wide property test, lane FE-SLOT-2, 2026-09-04.
//
// Fixture: `scripts/_snapshots/feslot2-live-118.json` — every live `section_claim_provenance` due_date
// slot FACT claim whose `source_span` carries a four-digit year (118 rows, read via read-only SQL, project
// kwrsbpiseruzbfwjpvsp, this lane, 2026-09-04), each joined to its FIRST usable `agent_run_searches`
// capture containing the span verbatim (240 chars either side) — the exact shape `buildDueDateContext`
// produces:
//   with due_date_claims as (
//     select scp.id as claim_id, scp.intelligence_item_id, scp.claim_text, scp.source_span
//     from section_claim_provenance scp
//     where scp.claim_kind = 'FACT' and scp.claim_text like '[due_date]%' and scp.source_span ~ '\d{4}'
//   ),
//   ranked as (
//     select dc.claim_id, dc.intelligence_item_id, dc.claim_text, dc.source_span, ars.id as search_id,
//       ars.result_content, ars.result_index, position(dc.source_span in ars.result_content) as pos,
//       row_number() over (partition by dc.claim_id order by ars.result_index) as rn
//     from due_date_claims dc join agent_run_searches ars
//       on ars.intelligence_item_id = dc.intelligence_item_id
//       and length(trim(ars.result_content)) > 200
//       and position(dc.source_span in ars.result_content) > 0
//   ),
//   first_match as (select * from ranked where rn = 1)
//   select dc.claim_id, dc.intelligence_item_id, dc.claim_text, dc.source_span, fm.search_id,
//     case when fm.pos is not null then substring(fm.result_content from greatest(1, fm.pos-240) for
//       least(240, fm.pos-1)) else null end as context_before,
//     case when fm.pos is not null then substring(fm.result_content from fm.pos+length(dc.source_span)
//       for 240) else null end as context_after
//   from due_date_claims dc left join first_match fm on fm.claim_id = dc.claim_id order by dc.claim_id;
//
// MEASURED [CONFIRMED, this fixture, via extractForwardEvents itself — not a SQL heuristic]: baseline
// (span alone, no context) emits an event for 61/118 rows; WITH context attached, 90/118 (79
// compliance_deadline, 6 review_or_report, 3 other, 2 phase_step); 29 of those 90 are events the span
// alone never produced (27 compliance_deadline, 2 other) — the rescue's own net contribution. The
// remaining 28 stay honestly skipped: 15 `calendar_date_no_deontic_in_context` (context checked, genuinely
// no deontic/aim nearby), 13 `relative_deadline_no_calendar_date` (no rule's trigger+date pattern matched
// the span at all — a bare year or relative phrasing this grammar cannot anchor). 0/118 hit
// `calendar_date_deontic_context_unavailable` in this fixture (every row's span was found in a capture) —
// asserted below only as "possible, never a crash", since a future re-capture could change that.
// `scripts/_snapshots/` is gitignored scratch (CLAUDE.md standing rule 5), so this test self-skips (never
// fails) when the file is absent, same convention as the two corpus-wide tests above it.
// ---------------------------------------------------------------------------

const LIVE118_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'scripts', '_snapshots', 'feslot2-live-118.json');

function loadLive118() {
  let raw;
  try {
    raw = readFileSync(LIVE118_PATH, 'utf8');
  } catch {
    return null;
  }
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) && parsed.length ? parsed : null;
}

describe('DUE-DATE SLOT CONTEXT RESCUE: corpus-wide property test (feslot2-live-118.json)', () => {
  const fixture = loadLive118();

  test('measured event/skip counts hold, no crash, every rescued event is honest (skips if feslot2-live-118.json is not present in this checkout)', (t) => {
    if (!fixture) {
      t.skip('scripts/_snapshots/feslot2-live-118.json not present in this checkout (gitignored scratch) — see this describe block\'s header');
      return;
    }

    let baselineEvents = 0;
    let withContextEvents = 0;
    let rescued = 0;
    const byKind = {};
    const rescuedByKind = {};
    const bySkipReason = {};
    const nonIdempotent = [];
    const notVerbatim = [];

    for (const row of fixture) {
      const claimNoCtx = { claim_id: row.claim_id, kind: 'FACT', text: row.claim_text, span: row.source_span };
      const context = row.search_id ? { before: row.context_before ?? '', after: row.context_after ?? '' } : null;
      const claimWithCtx = { ...claimNoCtx, context };

      const base = extractForwardEvents({ claims: [claimNoCtx], sections: [] });
      const withCtx = extractForwardEvents({ claims: [claimWithCtx], sections: [] });

      if (base.events.length > 0) baselineEvents++;
      if (withCtx.events.length > 0) withContextEvents++;
      const wasRescued = base.events.length === 0 && withCtx.events.length > 0;
      if (wasRescued) rescued++;

      for (const e of withCtx.events) {
        byKind[e.event_kind] = (byKind[e.event_kind] ?? 0) + 1;
        if (wasRescued) rescuedByKind[e.event_kind] = (rescuedByKind[e.event_kind] ?? 0) + 1;
        if (normalizeObligationText(e.obligation_text) !== e.obligation_text) nonIdempotent.push({ claim_id: row.claim_id, text: e.obligation_text });
        // every event's context text (when one exists) genuinely contains the matched date substring --
        // re-checked here independently of assertVerbatim's own internal throw, so a regression there
        // shows up as a normal test failure with the offending row named, not a bare thrown error.
        const haystack = context ? context.before + row.source_span + context.after : row.source_span;
        if (!haystack.includes(e.source_span)) notVerbatim.push({ claim_id: row.claim_id, source_span: e.source_span });
      }
      for (const s of withCtx.skipped) bySkipReason[s.reason] = (bySkipReason[s.reason] ?? 0) + 1;
    }

    console.log(
      `feslot2-live-118.json property test: ${fixture.length} rows; baseline ${baselineEvents} events, ` +
        `with-context ${withContextEvents} events, ${rescued} rescued.`,
      'by_kind:', JSON.stringify(byKind),
      'rescued_by_kind:', JSON.stringify(rescuedByKind),
      'by_skip_reason:', JSON.stringify(bySkipReason)
    );

    assert.equal(nonIdempotent.length, 0, `${nonIdempotent.length} rescued obligation_text(s) not idempotent: ${JSON.stringify(nonIdempotent.slice(0, 3))}`);
    assert.equal(notVerbatim.length, 0, `${notVerbatim.length} event source_span(s) not found verbatim in their own context: ${JSON.stringify(notVerbatim.slice(0, 3))}`);
    // measured, exact counts against this fixture — a regression lock, not a tolerance band; a future
    // re-capture that changes these numbers is itself the finding, not a reason to loosen the assertion.
    assert.equal(baselineEvents, 61);
    assert.equal(withContextEvents, 90);
    assert.equal(rescued, 29);
    assert.deepEqual(byKind, { review_or_report: 6, compliance_deadline: 79, phase_step: 2, other: 3 });
    assert.deepEqual(rescuedByKind, { compliance_deadline: 27, other: 2 });
  });
});
