/**
 * record-grade-fixture.ts (lane w10-actioncard-b, 2026-09-22, addendum: the production
 * record-grade regulation page rendered 4 fact cards with ZERO `[data-part="item-group"]`).
 *
 * Frozen from the exact record the finding named: `intelligence_items.id =
 * f8268063-0e07-4562-82da-a1373d6dd797`, "REGULATION (EC) No 391/2009 ... on common rules and
 * standards for ship inspection and survey organisations (Recast)", via a read-only SELECT
 * against `intelligence_item_sections` (project kwrsbpiseruzbfwjpvsp), 2026-09-22. The
 * `content_md` below is the row's `record_facts` section verbatim, byte-for-byte; nothing here is
 * invented (operator ruling: "fixtures read from a frozen real record, never invented strings").
 * Parsed through the same production parser (`parseRecordSections`/`splitKeyDateFacts`) the real
 * page uses, not hand-built RecordFactRow objects, so a change to slot classification or claim-line
 * parsing shows up here too.
 */

import { parseRecordSections, splitKeyDateFacts, type RecordSectionRowLike } from "@/lib/agent/parse-record-sections";

export const RECORD_GRADE_FIXTURE_ITEM_ID = "f8268063-0e07-4562-82da-a1373d6dd797";
export const RECORD_GRADE_FIXTURE_TITLE =
  "REGULATION (EC) No 391/2009 OF THE EUROPEAN PARLIAMENT AND OF THE COUNCIL of 23 April 2009 on common rules and standards for ship inspection and survey organisations (Recast) (Text with EEA relevance) ANNEX I ANNEX II";

// Source of record: EUR-Lex, CELEX 32009R0391 (see this file's header). The smoke spec below needs
// only the `record_facts` claim rows, so no `sources_and_citations` row is frozen here. That keeps
// this reference-data file from naming the eur-lex.europa.eu host as a URL literal outside its one
// home module (F46, src/lib/sources/identifier-variants.mjs).
const RECORD_GRADE_FIXTURE_SECTIONS: RecordSectionRowLike[] = [
  {
    section_key: "record_facts",
    content_md:
      "[effective_date] The captured source states, verbatim: «shall enter into force on the 20th day following its publication in the Official Journal of the European Union»\n" +
      "[jurisdictional_scope] The captured source states, verbatim: «Member States and the Commission should promote the development by the IMO of an international code for»\n" +
      "[penalty_summary] The captured source states, verbatim: «penalty payments as coercive measures»\n" +
      "[primary_deadline] The captured source states, verbatim: «no later than 72 hours after the event that gave rise to the obligation to communicate the information»",
  },
];

const PARSED = parseRecordSections(RECORD_GRADE_FIXTURE_SECTIONS);
if (!PARSED) throw new Error("record-grade-fixture.ts: frozen fixture failed to parse, check the frozen content_md above");

const SPLIT = splitKeyDateFacts(PARSED.facts);

/** 2 rows: effective_date, primary_deadline (KEY_DATE_SLOTS membership). */
export const RECORD_GRADE_FIXTURE_DATE_FACTS = SPLIT.dateFacts;
/** 2 rows: jurisdictional_scope, penalty_summary. */
export const RECORD_GRADE_FIXTURE_OTHER_FACTS = SPLIT.otherFacts;
export const RECORD_GRADE_FIXTURE_PARSED = PARSED;
