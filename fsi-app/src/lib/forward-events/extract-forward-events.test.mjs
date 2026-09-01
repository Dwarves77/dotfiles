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
import { extractForwardEvents, EXTRACTOR_VERSION } from './extract-forward-events.mjs';

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
