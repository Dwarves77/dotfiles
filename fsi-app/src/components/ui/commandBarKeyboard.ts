export function moveActiveIndex(current: number, direction: 1 | -1, count: number): number {
  if (count === 0) return -1;
  if (current < 0) return direction === 1 ? 0 : count - 1;
  const next = current + direction;
  if (next < 0) return 0;
  if (next >= count) return count - 1;
  return next;
}

/**
 * True when a pointerdown landed outside BOTH the command bar form and the portaled listbox, and
 * the dropdown should close. Takes plain booleans (not DOM nodes) so it stays a pure, no-DOM
 * function the same way tagPopoverKeyboard.ts's helpers do; the caller does the
 * `ref.current?.contains(event.target)` containment check (it needs two separate refs, because
 * SEARCHCLIP portals the listbox out from under the bar's own DOM subtree into document.body, so
 * a single "is it inside this one ref" check cannot cover both boxes).
 */
export function isOutsidePointerDown(withinBar: boolean, withinListbox: boolean): boolean {
  return !withinBar && !withinListbox;
}

/**
 * VISIBLE CLOSE CONTROLS (lane SEARCHKEYS-B, task 4.1b, 2026-09-11). Operator report closed:
 * "When you click off the search bar it needs to close or there needs to be a way to click it
 * shut", ruled the same day to apply to desktop too: "I want it fixed for desktop as well.
 * Hitting esc is not a clear fix." Task 4.1's Escape/click-outside handling gave every user a way
 * to DISMISS the dropdown, but none of it is a control the reader can SEE; this pair of pure
 * decisions drives the trailing icon button CommandBar.tsx renders inside the bar. Kept here
 * (not inlined) for the same reason `isOutsidePointerDown` is: a plain boolean/string decision,
 * independently testable with no DOM.
 */

/** True once there is something to clear or close: either the input holds text, or the listbox is
 *  open (only reachable today with text present too, since MIN_QUERY_LEN gates the dropdown, but
 *  the two conditions are kept separate rather than collapsed into one so the button's visibility
 *  stays correct if that gate ever changes). False (hidden) only when both are false, matching the
 *  brief's own wording verbatim: "hidden when the input is empty and the listbox is closed". */
export function clearButtonVisible(hasQueryText: boolean, dropdownOpen: boolean): boolean {
  return hasQueryText || dropdownOpen;
}

/** "Clear search" when there is text to wipe; "Close search" when the button's only job left is
 *  dismissing an open listbox over an already-empty input (the brief's own two named states). */
export function clearButtonLabel(hasQueryText: boolean): "Clear search" | "Close search" {
  return hasQueryText ? "Clear search" : "Close search";
}

/** The DOM id one listbox option gets, derived from the listbox's own id + its index. */
export function optionId(listboxId: string, index: number): string {
  return `${listboxId}-option-${index}`;
}

/** The input's `aria-activedescendant` value: the active option's id, or undefined when nothing
 *  is active (index -1, tagPopoverKeyboard's own "nothing highlighted" sentinel); an `undefined`
 *  aria-activedescendant is the correct way to say "no option is active" (omitting the attribute),
 *  never an id that points at nothing. */
export function activeDescendantId(listboxId: string, activeIndex: number): string | undefined {
  return activeIndex >= 0 ? optionId(listboxId, activeIndex) : undefined;
}

/**
 * ONE BAR, NO TOGGLE (lane W10-CommandBar, 2026-09-21, undrawn-cases ruling 2 of 2026-09-20,
 * verbatim: "Typing searches ... Enter opens the results page; the Ask button (or ⌘↵) sends the
 * same text to the assistant scoped to the page."). These two pure decisions replace the removed
 * Search/Ask mode toggle's branching in CommandBar.tsx.
 */

/** What a plain `Enter` keystroke on the command bar input resolves to, in priority order:
 *  1. `metaOrCtrl` (⌘↵ / Ctrl+Enter) always asks the assistant, regardless of any active dropdown
 *     option, the reader's explicit "ask" gesture wins over an incidentally-highlighted row.
 *  2. Otherwise, an active option (`activeIndex >= 0`) navigates to it, the same behaviour Enter
 *     had before this lane.
 *  3. Otherwise, Enter opens the results page: the bar never silently swallows a plain Enter. */
export type CommandBarEnterAction = "ask" | "navigate-active" | "open-results";

export function resolveEnterKeyAction(metaOrCtrl: boolean, activeIndex: number): CommandBarEnterAction {
  if (metaOrCtrl) return "ask";
  if (activeIndex >= 0) return "navigate-active";
  return "open-results";
}

/** The results-page URL Enter-with-no-active-option (or a submit button pressed the same way)
 *  navigates to. One builder so the query param name/encoding can never drift between the bar and
 *  the page that reads it (`src/app/search/page.tsx`). */
export function searchResultsHref(query: string): string {
  return `/search?q=${encodeURIComponent(query)}`;
}
