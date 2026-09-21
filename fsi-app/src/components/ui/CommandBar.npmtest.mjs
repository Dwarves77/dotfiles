// Structural regression test for CommandBar.tsx (fix58-tokens, 2026-09-07, design audit B88-B94).
// Text-level, same convention as Chips.npmtest.mjs's own header explains.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "CommandBar.tsx"),
  "utf8"
);

test("outer form border is rgba(0,0,0,.25) at radius 8px (dc.html p1), not the --line-1/6px token pair", () => {
  assert.match(SOURCE, /border:\s*"1px solid rgba\(0,0,0,\.25\)"/);
  assert.match(SOURCE, /borderRadius:\s*8,/);
});

test("cmd-K hint is 10px monospace (dc.html p1), not 10.5px sans", () => {
  assert.match(SOURCE, /className="cl-cmdk-hint"[\s\S]{0,300}fontSize:\s*"var\(--fs-10\)"/);
  assert.match(SOURCE, /className="cl-cmdk-hint"[\s\S]{0,300}fontFamily:\s*"ui-monospace/);
});

test("Ask button is full-bar height (40px) with 14px horizontal padding (dc.html p1), not a fixed 30px/16px", () => {
  assert.match(SOURCE, /height:\s*40,\s*\n\s*padding:\s*"0 14px"/);
});

test("the part root carries data-part=\"command-bar\" (lane W10-CommandBar, 2026-09-21)", () => {
  assert.match(SOURCE, /data-part="command-bar"/);
});

// ── one bar, no toggle (lane W10-CommandBar, 2026-09-21, ruling 2 of 2026-09-20) ────────────────
//
// No JSX render harness exists in this repo (see workspace/tags/route.npmtest.mjs's own header for
// why — the component tests here are structural/source-level, same convention as every test above).
// The CMDSEARCH lane's 2026-09-09 Search/Ask mode toggle is gone; these assert the STRUCTURE that
// produces the one-bar behaviour instead: the Ask button disables with a reason while the
// assistant is unavailable, but the input itself is NEVER disabled: search always works.

test("assistantEnabled comes from the ONE existing server-to-client flag path (useWorkspaceBootstrap), never a second mechanism", () => {
  assert.match(SOURCE, /import \{ useWorkspaceBootstrap \} from "@\/lib\/hooks\/useWorkspaceBootstrap"/);
  assert.match(SOURCE, /bootstrap\.data\?\.assistantEnabled === true/);
  // Fail-closed default: `=== true` (not a truthy check) means undefined/absent reads as disabled,
  // matching the server route's own exact-string ASSISTANT_ENABLED === "true" gate.
});

test("the Ask button disables with a reason while the assistant is unavailable; the input itself carries no disabled prop at all, search always works", () => {
  assert.match(SOURCE, /const askDisabled = !assistantEnabled;/);
  assert.match(SOURCE, /"The Assistant is currently unavailable\."/);
  assert.match(SOURCE, /<button[\s\S]{0,200}disabled=\{askDisabled\}/);
  assert.doesNotMatch(SOURCE, /<input[\s\S]{0,600}disabled=\{askDisabled\}/, "the input must never be disabled, search still works while Ask is down");
});

test("the Ask button's onClick calls ask() directly and is always labeled \"Ask\", no mode-dependent label or handler", () => {
  assert.match(SOURCE, /<button[\s\S]{0,200}onClick=\{ask\}/);
  assert.match(SOURCE, />\s*\n\s*Ask\s*\n\s*<\/button>/);
});

test("the placeholder always carries \"Search or ask\" and is never replaced by an unavailability message, the bar's copy never implies the whole control is down", () => {
  assert.match(SOURCE, /placeholder=\{placeholder \?\? `Search or ask across \$\{formatNumber\(itemCount\)\} items…`\}/);
  assert.doesNotMatch(SOURCE, /"Ask a question…"/);
});

test("ask() itself refuses to dispatch while the flag is off — belt-and-suspenders beyond the disabled DOM attribute", () => {
  assert.match(SOURCE, /const ask = \(\) => \{\s*\n\s*if \(!assistantEnabled\) return;/);
});

test("no fetch to /api/ask lives in this file — Ask still dispatches via the pre-existing open-ask-assistant CustomEvent, never a second call path", () => {
  assert.doesNotMatch(SOURCE, /fetch\(.*\/api\/ask/);
  assert.match(SOURCE, /"open-ask-assistant"/);
});

test("Standard Search calls the new bounded /api/search route through authedFetch (F40), never a hand-rolled fetch", () => {
  assert.match(SOURCE, /authedFetch\(`\/api\/search\?q=/);
});

test("empty/short query shows no results dropdown (client-side mirror of the route's own MIN_QUERY_LEN gate)", () => {
  assert.match(SOURCE, /value\.trim\(\)\.length < MIN_QUERY_LEN/);
});

// ── one bar, no toggle: Enter's three-way split (lane W10-CommandBar, 2026-09-21) ────────────────
//
// Superseded SEARCHFIX's single submit() dispatcher (2026-09-11, which distinguished Search mode
// from Ask mode, the mode itself is now gone). The form's plain-Enter fallback now opens the
// results page; ⌘↵/Ctrl+Enter and the Ask button both call ask() directly; an active dropdown
// option takes precedence over both, via the pure `resolveEnterKeyAction` decision.

test("the form's onSubmit (plain Enter, not intercepted above) opens the results page via openResultsPage(), never a bare onSearch() re-call", () => {
  assert.match(
    SOURCE,
    /onSubmit=\{\(e\) => \{[\s\S]{0,600}e\.preventDefault\(\);\s*\n\s*openResultsPage\(\);\s*\n\s*\}\}/
  );
  assert.match(SOURCE, /const openResultsPage = \(\) => \{\s*\n\s*const q = value\.trim\(\);\s*\n\s*if \(!q\) return;\s*\n\s*window\.location\.href = searchResultsHref\(q\);\s*\n\s*\};/);
});

test("⌘↵/Ctrl+Enter resolves to \"ask\" via resolveEnterKeyAction and calls ask(), taking precedence over an active dropdown option", () => {
  assert.match(SOURCE, /const action = resolveEnterKeyAction\(e\.metaKey \|\| e\.ctrlKey, activeIndex\);/);
  assert.match(SOURCE, /if \(action === "ask"\) \{\s*\n\s*e\.preventDefault\(\);\s*\n\s*ask\(\);/);
});

// ── SEARCHKEYS (2026-09-11): Escape / click-outside / arrow-key nav for the results listbox ─────
//
// Closes docs/tech-debt-log.md's 2026-09-11 entry. Structural/source-level, same convention as
// every test above; these assert the code SHAPE that produces the required behaviour.

test("keyboard/dismissal helpers come from the one sibling module commandBarKeyboard.ts, never a second implementation inline", () => {
  // Lane W10-CommandBar added two more named imports (searchResultsHref/resolveEnterKeyAction)
  // from the SAME sibling module to the same import statement, still the one and only import site.
  assert.match(
    SOURCE,
    /import \{\s*\n\s*moveActiveIndex,\s*\n\s*isOutsidePointerDown,\s*\n\s*optionId,\s*\n\s*activeDescendantId,\s*\n\s*clearButtonVisible,\s*\n\s*clearButtonLabel,\s*\n\s*searchResultsHref,\s*\n\s*resolveEnterKeyAction,\s*\n\s*\} from "@\/components\/ui\/commandBarKeyboard";/
  );
});

test("Escape closes the dropdown via a `dismissed` flag, not by clearing `results`; the typed query and fetched rows survive", () => {
  assert.match(SOURCE, /const \[dismissed, setDismissed\] = useState\(false\);/);
  assert.match(SOURCE, /if \(e\.key === "Escape"\) \{[\s\S]{0,200}if \(!showDropdown\) return;\s*\n\s*e\.preventDefault\(\);\s*\n\s*setDismissed\(true\);/);
  // showDropdown itself gates on !dismissed, unconditional on any mode (one bar, no toggle).
  assert.match(SOURCE, /const showDropdown = !dismissed && value\.trim\(\)\.length >= MIN_QUERY_LEN/);
});

test("typing and re-focusing both un-dismiss; the dropdown can reopen without a second Escape-specific escape hatch", () => {
  assert.match(SOURCE, /onChange=\{\(e\) => \{[\s\S]{0,200}setDismissed\(false\);/);
  assert.match(SOURCE, /onFocus=\{\(\) => \{[\s\S]{0,200}setDismissed\(false\);/);
});

test("a pointerdown outside both the bar and the portaled listbox dismisses the dropdown; pointerdown (not click) so touch is covered without a second listener", () => {
  assert.match(SOURCE, /document\.addEventListener\("pointerdown", onPointerDown, true\)/);
  assert.match(SOURCE, /isOutsidePointerDown\(withinBar, withinListbox\)/);
  // Two separate refs; the listbox is portaled outside the bar's own DOM subtree (SEARCHCLIP).
  assert.match(SOURCE, /const listboxRef = useRef<HTMLDivElement>\(null\);/);
});

test("ArrowDown/ArrowUp move a roving activeIndex through moveActiveIndex (clamped, not wraparound); a \"navigate-active\" Enter action calls selectRow", () => {
  assert.match(SOURCE, /if \(e\.key === "ArrowDown"\) \{\s*\n\s*e\.preventDefault\(\);\s*\n\s*setActiveIndex\(\(i\) => moveActiveIndex\(i, 1, searchRows\.length\)\);/);
  assert.match(SOURCE, /if \(e\.key === "ArrowUp"\) \{\s*\n\s*e\.preventDefault\(\);\s*\n\s*setActiveIndex\(\(i\) => moveActiveIndex\(i, -1, searchRows\.length\)\);/);
  assert.match(SOURCE, /if \(action === "navigate-active"\) \{\s*\n\s*e\.preventDefault\(\);\s*\n\s*selectRow\(activeIndex\);/);
});

test("Enter-on-an-active-option navigates by clicking the row's own Link anchor, never a second (next/navigation router) navigation path", () => {
  assert.match(SOURCE, /option\?\.querySelector<HTMLAnchorElement>\("a\.cl-row-link"\)\?\.click\(\);/);
  assert.doesNotMatch(SOURCE, /from "next\/navigation"/, "must not depend on useRouter(), which throws outside an App Router tree");
});

test("the input carries the WAI-ARIA combobox attributes: role, aria-autocomplete, aria-controls, aria-expanded, aria-activedescendant", () => {
  assert.match(SOURCE, /role="combobox"/);
  assert.match(SOURCE, /aria-autocomplete="list"/);
  assert.match(SOURCE, /aria-controls=\{listboxId\}/);
  assert.match(SOURCE, /aria-expanded=\{showDropdown\}/);
  assert.match(SOURCE, /aria-activedescendant=\{showDropdown \? activeDescendantId\(listboxId, activeIndex\) : undefined\}/);
});

test("each result row is wrapped as role=\"option\" with a stable id and aria-selected on the active one, highlighted with the existing --row-hover token (no raw hex)", () => {
  assert.match(SOURCE, /id=\{optionId\(listboxId, index\)\}\s*\n\s*role="option"\s*\n\s*aria-selected=\{active\}/);
  assert.match(SOURCE, /background: active \? "var\(--row-hover\)" : undefined/);
});

// ── Review finding (2026-09-11): the listbox id is instance-scoped, not a bare module constant ──
//
// No JSX render harness exists in this repo (see this file's own header note above and
// workspace/tags/route.npmtest.mjs's), so a literal "mount two CommandBars, read two DOM ids"
// assertion cannot live in THIS file; it lives instead as an executable, real-DOM proof in the
// rendering guard's own smoke suite (command-bar-search-portal-smoke.mjs mounts two bars side by
// side and asserts their listbox ids differ, see that file). This test asserts the CODE SHAPE that
// makes two distinct ids possible in the first place: `useId()` feeds every id-bearing attribute,
// and the old bare string constant is gone, so nothing in the file can silently reintroduce a fixed,
// collision-prone id.
test("the listbox id is instance-scoped via React's useId(), not a fixed module-level string", () => {
  assert.match(SOURCE, /const listboxId = `cl-command-bar-listbox-\$\{useId\(\)\}`;/);
  assert.doesNotMatch(SOURCE, /const LISTBOX_ID = "cl-command-bar-listbox";/, "the old fixed-id constant must be gone, not merely unused");
  assert.match(SOURCE, /\bimport \{[\s\S]{0,120}useId,/, "useId must be imported from react");
});

// ── SEARCHKEYS-B (task 4.1b, 2026-09-11): visible close controls on every viewport ───────────────
//
// Operator report closed: "there needs to be a way to click it shut", ruled to cover desktop too:
// "I want it fixed for desktop as well. Hitting esc is not a clear fix." Task 4.1 gave every
// viewport Escape + click-outside dismissal but no VISIBLE control; this lane adds two: a trailing
// clear/close icon button inside the bar, and a "Close" row at the top of the portaled panel.

// (The import-shape assertion for clearButtonVisible/clearButtonLabel lives in the pre-existing
// "keyboard/dismissal helpers come from the one sibling module" test above, updated for this lane
// rather than duplicated here.)

test("lucide's X icon is reused for the close affordance, matching AskAssistant/ArchiveDialog/GroupModals' existing close-icon convention rather than a new glyph", () => {
  assert.match(SOURCE, /import \{ X \} from "lucide-react";/);
});

test("a trailing clear/close button sits in the bar, 44x44 CSS px (law 2), hidden unless there is text or the dropdown is open", () => {
  assert.match(SOURCE, /className="cl-command-bar-clear"/);
  assert.match(SOURCE, /width:\s*44,\s*\n\s*height:\s*44,/);
  assert.match(SOURCE, /showClearButton\s*&&/);
  assert.match(SOURCE, /const showClearButton = clearButtonVisible\(hasQueryText, showDropdown\);/);
});

test("the clear/close button's accessible name switches between the two named states, never a fixed label", () => {
  assert.match(SOURCE, /const clearLabel = clearButtonLabel\(hasQueryText\);/);
  assert.match(SOURCE, /aria-label=\{clearLabel\}/);
});

test("activating the clear/close button focuses the input BEFORE dismissing (not after); the input's own onFocus un-dismisses, so focusing after setDismissed(true) would silently reopen what this button just closed", () => {
  assert.match(SOURCE, /const handleClearOrClose = \(\) => \{\s*\n\s*inputRef\.current\?\.focus\(\);/);
  assert.match(SOURCE, /if \(hasQueryText\) \{\s*\n\s*setValue\(""\);/);
  assert.match(SOURCE, /inputRef\.current\?\.focus\(\);\s*\n\s*if \(hasQueryText\)[\s\S]{0,120}setDismissed\(true\);\s*\n\s*\};/);
});

test("the portaled panel carries a visible Close row at its top, 44px tall, same accessible name convention (its own visible text IS its accessible name)", () => {
  assert.match(SOURCE, /className="cl-command-bar-panel-close"/);
  assert.match(SOURCE, /height:\s*44,/);
  assert.match(SOURCE, />\s*\n\s*Close\s*\n\s*<\/button>/);
});

test("the panel's Close row also focuses the input BEFORE dismissing, same ordering fix as the trailing button", () => {
  assert.match(SOURCE, /inputRef\.current\?\.focus\(\);\s*\n\s*setDismissed\(true\);\s*\n\s*\}\}\s*\n\s*className="cl-command-bar-panel-close"/);
});

test("the Close row is NOT role=option and is not counted by moveActiveIndex/searchRows; it must not break aria-activedescendant", () => {
  // The close row's own JSX lives OUTSIDE the searchRows.map that produces role="option" rows; use
  // the LAST role="option" occurrence, since the file's own header prose mentions the phrase twice
  // before any JSX at all.
  const closeRowIdx = SOURCE.indexOf('className="cl-command-bar-panel-close"');
  const roleOptionIdx = SOURCE.lastIndexOf('role="option"');
  assert.ok(closeRowIdx > -1 && roleOptionIdx > -1 && closeRowIdx < roleOptionIdx, "the close row must render before (outside) the role=option row map");
});

test("the listbox id/role stay on the actual options container, not the outer panel, so aria-controls still points at the right element", () => {
  assert.match(SOURCE, /id=\{listboxId\}\s*\n\s*role="listbox"/);
});
