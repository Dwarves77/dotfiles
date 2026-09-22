// full-brief-fixture.ts (lane w10-sectionheader, 2026-09-22, item 1 verification build).
//
// content_md for the full-brief (FactBlocks) path, built from the SAME frozen real record
// record-grade-fixture.ts already carries (intelligence_items.id =
// f8268063-0e07-4562-82da-a1373d6dd797, "REGULATION (EC) No 391/2009 ... on common rules and
// standards for ship inspection and survey organisations (Recast)", EUR-Lex, CELEX 32009R0391,
// frozen 2026-09-22, read-only SELECT). Every claim sentence below is the verbatim span
// record-grade-fixture.ts already quotes (`f.text`, "The captured source states, verbatim: «...»"),
// re-shaped into the pipeline's own FACT-paragraph citation form
// (`fact-paragraphs.ts`'s "*Source: [Title], [Issuing Body], [Date].*" convention, URL segment
// omitted) so `parseFactParagraphs`/`FactBlocks` classify it as a real FACT block, exactly like a
// synthesized full_brief section would. Nothing here is invented text: the claim body is copied
// from the already-frozen fixture, only the citation wrapper (title/issuer/date, no URL) is added.
// No `eur-lex.europa.eu` URL literal here, same reason `record-grade-fixture.ts`'s own header
// gives for omitting one: that host's URL is built in exactly one home module
// (`src/lib/sources/identifier-variants.mjs`, F46), never a second literal elsewhere in the repo.

import {
  RECORD_GRADE_FIXTURE_DATE_FACTS,
  RECORD_GRADE_FIXTURE_OTHER_FACTS,
  RECORD_GRADE_FIXTURE_TITLE,
} from "@/components/ui/__fixtures__/record-grade-fixture";

const SOURCE_CITATION = "*Source: " + RECORD_GRADE_FIXTURE_TITLE.slice(0, 60) + ", EUR-Lex, 23 April 2009.*";

function factParagraph(claimText: string): string {
  return `${claimText} ${SOURCE_CITATION}`;
}

/** One FACT paragraph per verbatim slot the frozen record carries, blank-line separated so
 *  `parseFactParagraphs` (blank-line-delimited paragraphs) reads each as its own block, and
 *  therefore one consecutive run -> one `ItemGroup` per `FactBlocks.tsx`'s own grouping rule. */
export const FULL_BRIEF_FIXTURE_MARKDOWN = [...RECORD_GRADE_FIXTURE_DATE_FACTS, ...RECORD_GRADE_FIXTURE_OTHER_FACTS]
  .map((f) => factParagraph(f.text || ""))
  .join("\n\n");
