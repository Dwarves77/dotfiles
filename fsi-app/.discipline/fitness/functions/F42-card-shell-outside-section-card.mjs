// F42: card-shell-outside-SectionCard (lane cardrule, 2026-09-08).
//
// THE DEFECT CLASS, CONFIRMED BY THE OPERATOR. Item A1 of the 2026-09-08 UI fix round, verbatim:
// "The 3px graduated rule at the top of every card is MISSING on all pages except the band blocks.
// It is part of the card component, not a decoration". The cause was structural rather than
// per page: there was NO card component. The same five declarations
//
//     background: var(--card); border: 1px solid var(--line-1);
//     border-radius: var(--radius-card); box-shadow: var(--shadow-card); overflow: hidden
//
// were retyped in fifteen files and each caller then mounted `<SectionRule/>` by hand. What that
// bought, measured on train/wave61-2026-09-08 before this lane:
//
//   - CommunityRooms.tsx's local `CARD` object: border-radius **8** (design says 10) and **no
//     box-shadow at all**, on the Global room card, the New post card and three rail cards.
//   - AccountPrimitives.tsx's `AccountCard`, ProvisionalReviewTable.tsx and two AdminDashboard
//     cards: **no box-shadow**.
//   - UserProfilePage.tsx's stat card: the shadow typed out as a literal instead of the token, and
//     **no rule**.
//   - MarketSignalDetailSurface.tsx's notes card and OperationsLedger.tsx's by-state card: **no
//     rule**.
//
// None of that is visible to tsc, to the rendering guard, or to a source read: every one of those
// files "looks" like it draws a card. The fix is to make the card a component (SectionCard.tsx,
// which mounts the rule unconditionally) and to close the class here, so a card assembled by hand
// again is RED rather than silently ruleless.
//
// WHAT THIS GATE DOES. For every .tsx under src/, it looks for a style object that carries all
// three of a card BACKGROUND (`var(--card)` / `var(--surface)`), a card BORDER
// (`1px solid var(--line-1)` / `var(--color-border)` / the literal `rgba(0,0,0,.12)`) and a card
// RADIUS (`var(--radius-card)` / a bare `10`) inside one nine-line window. That combination is a
// card shell and belongs to SectionCard.
//
// THE EXEMPTIONS ARE NAMED, NEVER GLOBAL. Three things in this product share the card's border and
// radius without being a section card, and each carries a `// fitness-allow: F42 (reason)` marker
// at its own site rather than a whole-file pass:
//   - the NAV CARD (Sidebar.tsx), whose 3px cap is the BAND-coloured rule — one of ruling 5.2's
//     three sanctioned places for it — so it must NOT carry SectionRule;
//   - SKELETONS (Skeleton.tsx), which hold a card's geometry open while it loads and draw no rule;
//   - undesigned OVERLAYS (the two "create" modals), which ruling R7 and the operator's own
//     overlays list say are not to be invented, and the auth frame's inner note panels, which
//     artboard 16 does not draw as cards.
//
// NO ALLOWLIST, NO EXPIRY: a new card is a `SectionCard` or it names, at its own site, why it is
// not a card.

import { violation } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { isTestFile } from './F25-module-liveness.mjs';

const SCOPE_GLOBS = ['fsi-app/src/**/*.tsx'];

/** The one file allowed to declare the card shell: the card component itself. */
const CARD_COMPONENT = 'src/components/ui/SectionCard.tsx';

/** How many lines a single style object may span and still be recognised as one shell. Nine covers
 *  every formatting this repo uses (the five card declarations plus up to four layout ones). */
export const WINDOW = 9;

const CARD_BACKGROUND = /background:\s*"var\(--(?:card|surface)\)"/;
const CARD_BORDER =
  /border:\s*"1px solid var\(--(?:line-1|color-border)\)"|border:\s*"1px solid rgba\(0,\s*0,\s*0,\s*\.12\)"/;
// The `\b` belongs to the NUMERIC alternative only: after `"var(--radius-card)"` the next character
// is a comma, and `"` → `,` is not a word boundary, so a trailing `\b` on the whole group silently
// matched nothing but the bare `10` form. Caught by attack (the gate found 2 of 9 known shells).
const CARD_RADIUS = /borderRadius:\s*(?:"var\(--radius-card\)"|10\b)/;

/** Every line index (0-based) at which a card shell starts. Exported for the test. */
export function cardShellLines(content) {
  const lines = content.split(/\r?\n/);
  const hits = [];
  for (let i = 0; i < lines.length; i += 1) {
    const win = lines.slice(i, i + WINDOW).join('\n');
    if (CARD_BACKGROUND.test(win) && CARD_BORDER.test(win) && CARD_RADIUS.test(win)) {
      hits.push(i);
      i += WINDOW - 1;
    }
  }
  return hits;
}

/** The marker may sit anywhere in the shell's own window or in the WINDOW lines above it. Above,
 *  not only adjacent: the reader looks for the reason at the top of the style object or in the JSX
 *  comment over the opening tag, and a card shell's own five declarations are frequently preceded
 *  by several layout ones (the nav card's `alignSelf`/`margin` block is six lines deep). */
export function isMarked(lines, start) {
  const from = Math.max(0, start - WINDOW);
  return lines
    .slice(from, start + WINDOW)
    .some((l) => /fitness-allow:\s*F42\b/.test(l));
}

export const fitnessFunction = {
  id: 'F42',
  name: 'card-shell-outside-SectionCard',
  description:
    'A style object carrying a card background + card border + card radius is a card shell, and ' +
    'the card shell lives in exactly one place: src/components/ui/SectionCard.tsx, which mounts ' +
    'the 3px graduated rule unconditionally. A shell assembled anywhere else is a card that can be ' +
    'built without the rule, the shadow or the right radius — the defect the operator found on ' +
    'eighteen card types on 2026-09-08. Use `<SectionCard>`, or mark the site ' +
    '`// fitness-allow: F42 (reason)` naming why it is not a section card. No allowlist, no expiry.',
  source:
    'Operator item A1, UI fix round 2026-09-08 ("The 3px graduated rule at the top of every card ' +
    'is MISSING on all pages except the band blocks. It is part of the card component, not a ' +
    'decoration"); coordinator note N3 ("Prove the class is closed")',

  enumerate() {
    return globFiles(SCOPE_GLOBS).filter((f) => !isTestFile(f) && !f.includes('/_archive/'));
  },

  check(filepath, content) {
    if (filepath.endsWith(CARD_COMPONENT)) return [];
    const lines = content.split(/\r?\n/);
    const out = [];
    for (const start of cardShellLines(content)) {
      if (isMarked(lines, start)) continue;
      out.push(
        violation(
          start + 1,
          'Card shell assembled by hand (card background + card border + card radius in one style ' +
            'object). The card shell is `SectionCard` (src/components/ui/SectionCard.tsx), which ' +
            'owns the border, the radius, the shadow and the 3px graduated rule — a shell typed ' +
            'here can be built without any of them, which is exactly how eighteen card types ' +
            'shipped with no rule (operator item A1, 2026-09-08). Render `<SectionCard>`, or mark ' +
            'this site `// fitness-allow: F42 (reason)` if it is genuinely not a section card ' +
            '(the nav card carries the BAND rule per ruling 5.2; skeletons draw no rule; ' +
            'undesigned overlays are not cards).'
        )
      );
    }
    return out;
  },
};
