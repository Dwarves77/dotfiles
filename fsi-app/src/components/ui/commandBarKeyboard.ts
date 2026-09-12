/**
 * CommandBar Standard Search listbox; pure keyboard/dismissal helpers (lane SEARCHKEYS,
 * 2026-09-11). Closes the gap docs/tech-debt-log.md logged on 2026-09-11 ("CommandBar Standard
 * Search listbox has no Escape/click-outside/arrow-key handling"): the results dropdown
 * (`role="listbox"`, portaled to document.body by SEARCHCLIP) had no keydown handler beyond
 * Cmd/Ctrl+K, and no document-level pointerdown listener, so the only way to close it was
 * clicking a result.
 *
 * Reuse-before-construction (CLAUDE.md) was checked against `tagPopoverKeyboard.ts` before writing
 * `moveActiveIndex` below: its `moveHighlight` is the right SHAPE (current index, direction, option
 * count) but the wrong BEHAVIOUR for this control; it wraps past either end, and this lane's own
 * dispatch brief is explicit: "ArrowUp/Down clamp (not wrap)". TagPopover's popover and this
 * combobox listbox are visually similar but navigate differently on purpose (the tag popover is a
 * short, cyclic pick-list; the search listbox is a result set where "past the last row" should stop,
 * not jump back to row 1), so reusing the wrapping mover would have shipped the wrong keyboard
 * behaviour rather than saved a few lines; this file carries its own small clamp-only mover
 * instead of importing the wrapping one. Its `clampHighlight` (re-clamp a stale index after the
 * list SHRINKS) is a different job again; CommandBar.tsx resets `activeIndex` to -1 outright
 * whenever a new result set lands (see CommandBar.tsx's own effect), so that "shrunk list" case
 * never reaches this module and clampHighlight is not needed here either.
 *
 * This file carries only what tagPopoverKeyboard.ts does NOT have: clamped (not wraparound)
 * active-option movement, the outside-pointerdown dismissal decision, and the DOM-id builders
 * `aria-activedescendant`/`aria-selected` need (the WAI-ARIA combobox pattern:
 * https://www.w3.org/WAI/ARIA/apg/patterns/combobox/).
 */

/** ArrowUp (direction -1) / ArrowDown (direction 1) move the roving active-option index, CLAMPING
 *  at either end; index 0 stays put on a further ArrowUp, the last index stays put on a further
 *  ArrowDown, never wrapping to the opposite end (dispatch brief for this lane, verbatim: "ArrowUp/
 *  Down clamp (not wrap)"). -1 = nothing active (the initial state, and the state after a fresh
 *  result set lands; see CommandBar.tsx's own reset effect); the first ArrowDown from -1 lands on
 *  row 0, the first ArrowUp from -1 lands on the last row, matching the roving-tabindex starting
 *  behaviour every other listbox in this file's family uses. */
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
