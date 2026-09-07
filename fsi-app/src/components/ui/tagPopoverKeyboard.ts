/**
 * TagPopover — pure keyboard model (lane uitags, 2026-09-07, README
 * "Workspace tags" / ruling R6). Split out of TagPopover.tsx so the
 * ↑ ↓ / Enter / Esc / Backspace behaviour can be unit tested without a DOM
 * (this repo's *.npmtest.mjs convention has no jsdom/testing-library
 * dependency — every component-adjacent test in the tree exercises a pure
 * sibling module via jiti instead, e.g. src/app/api/watchlist/logic.ts).
 * TagPopover.tsx imports these functions and owns only the DOM/React glue.
 *
 * Row order (fixed, matches the rendered list): the filtered existing tags,
 * in the order the API returned them, followed by ONE optional "Create
 * ⟨typed⟩" row when the query is non-empty and matches no existing tag
 * name exactly (case-insensitive — the DB's own uniqueness key).
 */

export interface TagOption {
  id: string;
  name: string;
  itemCount: number;
}

/** Existing tags matching the current query (case-insensitive substring;
 *  empty query matches everything). */
export function visibleRows(tags: TagOption[], query: string): TagOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return tags;
  return tags.filter((t) => t.name.toLowerCase().includes(q));
}

/** True when some existing tag's name equals the query exactly,
 *  case-insensitively — the same comparison the DB's generated name_key
 *  column makes (migration 313), so this never disagrees with the server
 *  about what counts as "already exists". */
export function hasExactMatch(tags: TagOption[], query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return tags.some((t) => t.name.trim().toLowerCase() === q);
}

/** Whether the footer "Create "<typed>"" row is shown. */
export function showCreateRow(tags: TagOption[], query: string): boolean {
  return query.trim().length > 0 && !hasExactMatch(tags, query);
}

/** Total selectable rows: filtered tags + the create row, if shown. */
export function rowCount(tags: TagOption[], query: string): number {
  return visibleRows(tags, query).length + (showCreateRow(tags, query) ? 1 : 0);
}

/** ↑ (direction -1) / ↓ (direction 1) with wraparound; -1 = nothing
 *  highlighted (the initial state, and the state once the list is empty). */
export function moveHighlight(current: number, direction: 1 | -1, count: number): number {
  if (count === 0) return -1;
  if (current < 0) return direction === 1 ? 0 : count - 1;
  const next = current + direction;
  if (next < 0) return count - 1;
  if (next >= count) return 0;
  return next;
}

/** Clamp a highlight index after the row list changes shape (typing
 *  narrows/widens the filtered set) — keeps it in range rather than
 *  pointing past the end, and resets to -1 when the list becomes empty. */
export function clampHighlight(current: number, count: number): number {
  if (count === 0) return -1;
  if (current < 0) return -1;
  return Math.min(current, count - 1);
}

export type EnterAction =
  | { type: "none" }
  | { type: "toggle"; tagId: string }
  | { type: "create"; name: string };

/** Enter applies/removes the highlighted existing tag (toggle — R6:
 *  multi-select, popover stays open), or creates+applies the typed name
 *  when the highlighted row is the footer "Create" row. Nothing
 *  highlighted (-1) is a no-op — Enter never applies a random row. */
export function resolveEnterAction(tags: TagOption[], query: string, highlightIndex: number): EnterAction {
  if (highlightIndex < 0) return { type: "none" };
  const visible = visibleRows(tags, query);
  if (highlightIndex < visible.length) {
    return { type: "toggle", tagId: visible[highlightIndex].id };
  }
  if (showCreateRow(tags, query) && highlightIndex === visible.length) {
    return { type: "create", name: query.trim() };
  }
  return { type: "none" };
}

export type BackspaceAction = { type: "none" } | { type: "removeLast"; tagId: string };

/** Backspace on an EMPTY input removes the most-recently-applied tag (R6).
 *  A non-empty input's Backspace is left to the input element itself
 *  (normal text editing) — this only fires the removal when `query` is
 *  already empty. `appliedTagIdsInOrder` is applied-order oldest→newest;
 *  the last element is "most recently applied". */
export function resolveBackspaceAction(query: string, appliedTagIdsInOrder: string[]): BackspaceAction {
  if (query.length > 0) return { type: "none" };
  if (appliedTagIdsInOrder.length === 0) return { type: "none" };
  return { type: "removeLast", tagId: appliedTagIdsInOrder[appliedTagIdsInOrder.length - 1] };
}
