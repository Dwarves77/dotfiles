// RD-73: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-73',
    skill: 'remediation-discipline',
    section: "Section 4 - category 47: a page does not retype a part's literal styles (parts, not pages)",
    text: "A route's page.tsx under fsi-app/src/app/** does not contain the literal styles that define a shared part (an Anton title, a card border plus radius 10, a 3px rule, a fact card edge or band, chip padding, a state note edge); it imports the part instead. [CONFIRMED, lane w10a, 2026-09-18, by the gate's own run against master 3da30b22]: two auth pages and six CommunityShell sub-routes hand-typed an Anton title through the CSS variable var(--font-display), a site the parts inventory's own literal sweep (docs/design/parts-inventory.md) did not find because it grepped the word \"Anton\", not the variable; no card-radius-10, 3px-rule, fact-card-edge, chip-padding or state-note-edge literal was found anywhere in page.tsx on that tree. The one allowlist condition is the site-wide parts brief's own: no existing part renders the same result, marked at the site and never a path allowlist.",
    anchor: "### Section 4 - category 47: a page does not retype a part's literal styles (parts, not pages)",
    enforcedBy: [
      'fitness:F49',
      'selftest:fsi-app/.discipline/fitness/functions/F49-parts-not-pages.test.mjs',
    ],
    residual: 'F49 is a LEXICAL scanner over fsi-app/src/app/**/page.tsx only (test files excluded by the glob itself, which matches no *.test.tsx): a literal built from a template string, a variable, or composed across two spread style objects is invisible to it, and it says nothing about src/components/** retyping the same literal (that half is category 42\'s F42 for the card shell, and is otherwise unmeasured for the other five patterns until each part\'s own lane lands, per the brief\'s lane order). It also cannot judge whether a marked "no matching part" site is correctly marked; eight sites (two auth pages, six community sub-routes) are marked this way as of 2026-09-18, discovered by this gate rather than by the inventory\'s own hand sweep, and are owed a SectionHeader-lane or operator ruling before the marker is removed.',
  };
