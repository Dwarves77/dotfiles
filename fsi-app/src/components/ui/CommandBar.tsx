"use client";

/**
 * CommandBar — the one command bar (UI system handoff 2026-09-06, README
 * §0.3): replaces every per-page ask panel. 40px tall, ⌕ glyph,
 * placeholder "Search or ask across N items…", ⌘K hint, dark Ask button.
 * Below 768 (mobile spec, MASTHEAD: "drop the Cmd-K hint"): the ⌘K chip is
 * hidden via `.cl-cmdk-hint { display: none }` at max-width 767.98px —
 * README breakpoint token, see theme.css's own comment.
 * Typing searches (onSearch); Ask sends the same text to the assistant
 * scoped to the current page — via the SAME `open-ask-assistant`
 * CustomEvent contract AskAssistant.tsx already listens for (see
 * DashboardAskBar.tsx, the panel this component supersedes on the
 * dashboard), never a second assistant call path.
 *
 * Wiring every other page's ask panel through this one component is
 * later-lane scope (README: 17 page artboards, this lane ships the
 * system + one page) — logged in docs/design/handoff-2026-09-06/
 * DEVIATION-LOG.md so a later lane does not reintroduce a per-page panel
 * instead of reusing this.
 *
 * `placeholder` (additive extension, admin/account/settings lane
 * 2026-09-06): the artboards for those three surfaces scope the prompt to
 * what the page actually holds — "Search sources, workspaces, flags — or
 * ask…", "Search settings — or ask…" — rather than the generic item-count
 * copy. Optional; the generic placeholder always carries "or ask" (ruling
 * 2 of 2026-09-20, see ONE BAR below); a caller overriding it keeps the
 * words "or ask" in its own copy.
 *
 * ONE BAR, NO TOGGLE (lane W10-CommandBar, 2026-09-21, undrawn-cases ruling
 * 2 of 2026-09-20, verbatim: "One bar, no toggle. Typing searches (GET
 * /api/search, results inline below the bar as you type); Enter opens the
 * results page; the Ask button (or ⌘↵) sends the same text to the
 * assistant scoped to the page. Search is not dropped, the toggle is."
 * This supersedes the CMDSEARCH lane's 2026-09-09 Search/Ask mode toggle
 * (two tabs inside the bar) below, and only the toggle: the search it
 * gated stays:
 *   - Typing (2+ characters, debounced, stale requests cancelled) always
 *     calls the bounded workspace read at GET /api/search and renders a
 *     small results dropdown using the SAME shared ListRow every list
 *     surface already uses, never a second row anatomy. `onSearch` (the
 *     pre-existing per-page instant-filter callback some list surfaces
 *     pass) still fires on every keystroke, unchanged; the dropdown is
 *     additive, not a replacement of that page-local filter.
 *   - Enter with an active option in the dropdown follows that option's
 *     href (unchanged, SEARCHKEYS below). Enter with no active option
 *     opens the results page at `/search?q=<text>` (searchResultsHref,
 *     commandBarKeyboard.ts) rather than silently doing nothing; the bar
 *     always has somewhere for a plain Enter to go.
 *   - ⌘↵ / Ctrl+Enter, or clicking the (always-visible, always labelled
 *     "Ask") button, dispatches the unchanged `open-ask-assistant` event,
 *     gated on ASSISTANT_ENABLED. The flag reaches this client component
 *     the ONE existing way a server-only flag reaches the client in this
 *     app, useWorkspaceBootstrap()'s `assistantEnabled` field (see
 *     workspace/bootstrap/route.ts's own header), never a second
 *     flag-plumbing mechanism, and never by exposing the env var or the
 *     model key. While disabled, the Ask button carries the disabled state
 *     and a title naming the reason, and ask() itself refuses to dispatch
 *     as a second guard, but SEARCH STILL WORKS: the input is NEVER
 *     disabled, so a reader can always search even while Ask is down.
 *     Flipping ASSISTANT_ENABLED to true needs no code change here — the
 *     gate reads live bootstrap data on every render.
 *
 * DISMISSAL + KEYBOARD NAVIGATION (lane SEARCHKEYS, 2026-09-11, closing the tech-debt entry
 * SEARCHCLIP logged the same day: "CommandBar Standard Search listbox has no Escape/click-
 * outside/arrow-key handling"). The WAI-ARIA combobox pattern
 * (https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) is followed for the results listbox:
 *   - The input carries role="combobox"/aria-autocomplete="list", plus the pre-existing
 *     aria-controls/aria-expanded; each option carries role="option" + a stable id, and the
 *     active one carries aria-selected; the input's aria-activedescendant points at it.
 *   - Escape closes the dropdown WITHOUT clearing the typed query. Re-typing or re-focusing the
 *     input (while results are still held) reopens it; the underlying `results` state is never
 *     thrown away, only a `dismissed` flag hides the dropdown until one of those two things
 *     un-sets it. Escape while already closed is a no-op (nothing to intercept).
 *   - A pointerdown outside BOTH the bar (`formRef`) and the portaled listbox (`listboxRef`)
 *     dismisses it the same way; one `isOutsidePointerDown` decision
 *     (`commandBarKeyboard.ts`) drives both paths, so "closed, query kept, reopens on
 *     type/focus" is a single behaviour, not two similar ones. `pointerdown` (not `click`) is
 *     used because the Pointer Events spec unifies mouse/pen/touch into one event type, so touch
 *     is covered for free rather than needing a second `touchstart` listener.
 *   - ArrowDown/ArrowUp move a roving `activeIndex` through the results, CLAMPING at either end;
 *     dispatch brief for this lane, verbatim: "ArrowUp/Down clamp (not wrap)"; via
 *     `commandBarKeyboard.ts`'s own `moveActiveIndex` (see that file's header for why this is NOT
 *     a reuse of `TagPopover`'s wrapping `moveHighlight`: same shape, different, deliberately
 *     non-wrapping behaviour this control needs). Enter with an active option navigates to it; the
 *     SAME href a click on that row would follow; taking precedence over the bar's own Enter
 *     fallback below. Enter with no active option (activeIndex -1, the initial state, or after the
 *     result set changes and resets it) opens the results page (ruling 2, 2026-09-20).
 *
 * VISIBLE CLOSE CONTROLS (lane SEARCHKEYS-B, task 4.1b, 2026-09-11). Operator report, verbatim:
 * "When you click off the search bar it needs to close or there needs to be a way to click it
 * shut. On mobile you can't hit esc and it's not clear what you need to do to close it." Ruled the
 * same day to cover desktop too: "I want it fixed for desktop as well. Hitting esc is not a clear
 * fix." Task 4.1's Escape/click-outside dismissal gives every user a way to CLOSE the dropdown but
 * gives no one a VISIBLE control to close it with; this lane adds two, on every viewport (desktop
 * included), reusing the existing lucide `X` glyph every other close affordance in this app already
 * uses (AskAssistant.tsx, ArchiveDialog.tsx, GroupModals.tsx, EntityPicker.tsx):
 *   - A trailing icon button inside the bar, at the input's own trailing edge, 44x44 CSS px (law 2);
 *     `clearButtonVisible`/`clearButtonLabel` (commandBarKeyboard.ts) decide its visibility and
 *     accessible name ("Clear search" with text present, "Close search" otherwise); activating it
 *     clears the query, dismisses the dropdown, and returns focus to the input.
 *   - A "Close" row at the TOP of the portaled results panel (`.cl-command-bar-panel-close`, 44px
 *     tall), so a reader who cannot see anything outside the panel still has a control to dismiss
 *     it with. It lives OUTSIDE the `role="listbox"` element (a sibling above it inside the same
 *     panel), not inside it: a listbox's children are options per the WAI-ARIA combobox pattern,
 *     and this row is neither role="option" nor counted by `moveActiveIndex`/`searchRows`, so
 *     `aria-activedescendant` is unaffected.
 * Click-outside-to-close itself (task 4.1) was re-verified, not changed: a scripted repro against
 * this exact Masthead/CommandBar composition (page-body click, a click on the Masthead title
 * outside the bar, both at 1280px and 375px) closes the dropdown correctly in both cases; seeing
 * the operator's reported desktop failure would need the full production route (AskAssistant panel,
 * sidebar, other document-level listeners) this isolated harness does not mount; see this lane's
 * REPORT for the full transcript. The visible controls below are the fix either way: they give a
 * deterministic, discoverable close path that never depends on where else on the page a click
 * lands.
 */

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { authedFetch } from "@/lib/api/authed-fetch";
import { useWorkspaceBootstrap } from "@/lib/hooks/useWorkspaceBootstrap";
import { ListRow } from "@/components/ui/ListRow";
import { StateNote } from "@/components/ui/StateNote";
import { SkeletonListRow } from "@/components/ui/Skeleton";
import { bandFromPriority } from "@/lib/urgency/bands";
import { itemDetailHref } from "@/lib/item-links";
import { jurisdictionCode, metaLine } from "@/lib/dashboard/row-fields";
import {
  moveActiveIndex,
  isOutsidePointerDown,
  optionId,
  activeDescendantId,
  clearButtonVisible,
  clearButtonLabel,
  searchResultsHref,
  resolveEnterKeyAction,
} from "@/components/ui/commandBarKeyboard";

interface SearchResultRow {
  id: string;
  title: string;
  item_type: string | null;
  domain: number | null;
  priority: string | null;
  jurisdictions: string[] | null;
  transport_modes: string[] | null;
  topic: string | null;
}

const SEARCH_DEBOUNCE_MS = 250;
const MIN_QUERY_LEN = 2;

export interface CommandBarProps {
  /** Total item count for the default placeholder ("Search or ask across N items…"). */
  itemCount: number;
  /** Called on every keystroke: the pre-existing page-local instant filter over already-loaded
   *  rows. Unaffected by the bar's own cross-workspace dropdown, which fires from this component's
   *  own state. */
  onSearch?: (query: string) => void;
  /** Page name the Ask call is scoped to (assistant context), e.g. "dashboard". */
  scope?: string;
  /** Override the default item-count placeholder with a page-scoped prompt. Callers keep the
   *  words "or ask" in their own copy (ruling 2, 2026-09-20). */
  placeholder?: string;
}

export function CommandBar({ itemCount, onSearch, scope, placeholder }: CommandBarProps) {
  // Instance-scoped listbox id (review finding, 2026-09-11): a bare module-level constant would
  // collide if two CommandBars are ever mounted at once (e.g. a future split view, or today's own
  // rendering-guard smoke tests exercising more than one instance per page); React's useId()
  // returns a stable, unique-per-mount id, so aria-controls / aria-activedescendant / each option's
  // id all stay correct with no coordination between instances.
  const listboxId = `cl-command-bar-listbox-${useId()}`;
  const [value, setValue] = useState("");
  const [results, setResults] = useState<SearchResultRow[] | null>(null);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // Portaled listbox's own ref (SEARCHKEYS, 2026-09-11); click-outside containment has to check
  // this SEPARATELY from formRef, because SEARCHCLIP portals the listbox out of the bar's own DOM
  // subtree into document.body; a single ref covering both boxes is not possible.
  const listboxRef = useRef<HTMLDivElement>(null);
  // True once Escape or an outside pointerdown has dismissed an OPEN dropdown; re-typing or
  // re-focusing the input un-sets it. Deliberately separate from `results` (which stays populated)
  // so dismissal never throws away the fetched rows; see this file's own header.
  const [dismissed, setDismissed] = useState(false);
  // Roving active option for ArrowUp/ArrowDown (-1 = none active, commandBarKeyboard.ts's own
  // sentinel; same "-1 means nothing highlighted" convention tagPopoverKeyboard.ts uses, kept
  // consistent across the app's two roving-index controls even though the movement itself differs,
  // clamped here vs wraparound there). Reset to -1 whenever a new result set lands (effect below),
  // so a stale index never survives past the rows it pointed at.
  const [activeIndex, setActiveIndex] = useState(-1);
  // Portal target for the results listbox (SEARCHCLIP, 2026-09-11). The bar mounts inside
  // Masthead's SectionCard, and SectionCard's `overflow: hidden` (the shell property that keeps
  // the 3px top rule inside the card's own radius — see SectionCard.tsx's header, ratified by F42
  // and the design audit) clips ANY child that would render outside the card's box, the listbox
  // included. Removing that overflow is out of scope (a shared part 84 callers depend on) and a
  // masthead-only override would make the masthead a different kind of card than every other
  // SectionCard. The listbox itself is the thing that needs to escape, so it is portaled to
  // `document.body` and repositioned from the bar's own measured rect, same box as before, just
  // mounted outside the clipping ancestor. `document.body` is only read inside effects (client-
  // only), so this stays safe under SSR.
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [barRect, setBarRect] = useState<{ top: number; left: number; width: number } | null>(null);

  // The ONE server-to-client path this app already uses for a per-user flag (see this file's own
  // header). `assistantEnabled` is undefined until the bootstrap fetch settles and false whenever
  // ASSISTANT_ENABLED isn't the exact string "true" — fail-closed on the client mirrors the
  // server's own fail-closed default, so Ask never reads as available before the flag is known.
  const bootstrap = useWorkspaceBootstrap();
  const assistantEnabled = bootstrap.data?.assistantEnabled === true;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Standard Search — bounded workspace read, debounced, cancels its own stale requests. No model
  // call, no spend: unconditional on ASSISTANT_ENABLED, unlike Ask below. One bar, no toggle
  // (ruling 2, 2026-09-20): search runs unconditionally, never gated on a mode.
  useEffect(() => {
    if (value.trim().length < MIN_QUERY_LEN) {
      setResults(null);
      setSearching(false);
      return;
    }
    const q = value.trim();
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      authedFetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : { results: [] }))
        .then((body: { results?: SearchResultRow[] }) => {
          if (!controller.signal.aborted) setResults(body.results ?? []);
        })
        .catch(() => {
          if (!controller.signal.aborted) setResults([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  // `!dismissed` (SEARCHKEYS, 2026-09-11): Escape and an outside pointerdown set `dismissed`
  // without touching `results`, so the dropdown hides while the fetched rows stay held; typing
  // (onChange below) or re-focusing the input (onFocus below) un-sets it, reopening the SAME
  // results rather than re-fetching. Unconditional (one bar, no toggle) rather than gated on a mode.
  const showDropdown = !dismissed && value.trim().length >= MIN_QUERY_LEN && (searching || results !== null);

  // Visible close controls (SEARCHKEYS-B, task 4.1b): `hasQueryText` reads the RAW value (not
  // trimmed) so the button's hidden/visible state matches the brief's own wording literally
  // ("hidden when the input is empty") rather than the trimmed length MIN_QUERY_LEN gates search
  // on.
  const hasQueryText = value.length > 0;
  const showClearButton = clearButtonVisible(hasQueryText, showDropdown);
  const clearLabel = clearButtonLabel(hasQueryText);
  // Focus BEFORE dismissing, not after (caught by the panel-Close-row smoke check while diagnosing
  // this task: refocusing the input fires its OWN onFocus handler, which un-dismisses per task 4.1's
  // "re-focusing the input un-dismisses" rule, set up for the reader clicking back into the box, not
  // for THIS control's own imperative refocus. Calling `setDismissed(true)` AFTER `.focus()` means
  // React's same-tick batching applies both `setDismissed` calls (onFocus's `false`, then this `true`)
  // in order, so the final state is the intended `true`; reversing the order would let onFocus's
  // `false` land last and silently reopen what this button just closed.
  const handleClearOrClose = () => {
    inputRef.current?.focus();
    if (hasQueryText) {
      setValue("");
      onSearch?.("");
    }
    setDismissed(true);
  };

  // A fresh result set invalidates any previously active option; reset to "none active" rather
  // than carry an index that may now point at a different row or past the new end. Not reset on
  // `dismissed`/`showDropdown` changes: a re-opened (not re-fetched) dropdown may reasonably keep
  // its prior active row.
  useEffect(() => {
    setActiveIndex(-1);
  }, [results]);

  // `document.body` is not defined during SSR; set it once mounted (matches every other
  // client-only DOM read in this file — the ⌘K listener above does the same window-only pattern).
  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  // Re-measure the bar's box whenever the dropdown is (or becomes) visible, and on every
  // scroll/resize while it's open, so the portal tracks the SAME position:relative box the
  // dropdown used to render against (top: calc(100% + 6px), left 0, right 0 — this just moves the
  // measurement from CSS layout to JS because the portal target has no layout relationship to the
  // bar). useLayoutEffect (not useEffect) so the first paint after `showDropdown` flips true
  // already has a rect — no one-frame flash at (0,0).
  useLayoutEffect(() => {
    if (!showDropdown) {
      setBarRect(null);
      return;
    }
    const measure = () => {
      const rect = formRef.current?.getBoundingClientRect();
      if (rect) setBarRect({ top: rect.bottom + 6, left: rect.left, width: rect.width });
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [showDropdown]);

  // Click/tap-outside dismissal (SEARCHKEYS, 2026-09-11). Listens only while the dropdown is
  // actually open. `pointerdown` (capture phase, matching the scroll listener above so an inner
  // scroller/stopPropagation handler can't swallow it first) fires for mouse, pen AND touch alike;
  // one listener covers the brief's "touch included" requirement with no second touchstart
  // handler. The containment check itself is the pure `isOutsidePointerDown` decision
  // (commandBarKeyboard.ts): two refs because the listbox is portaled outside the bar's own DOM
  // subtree (SEARCHCLIP), so neither ref alone can answer "is this outside the whole widget".
  useEffect(() => {
    if (!showDropdown) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      const withinBar = !!(target && formRef.current?.contains(target));
      const withinListbox = !!(target && listboxRef.current?.contains(target));
      if (isOutsidePointerDown(withinBar, withinListbox)) setDismissed(true);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [showDropdown]);

  const searchRows = useMemo(
    () =>
      (results ?? []).map((r) => ({
        key: r.id,
        href: itemDetailHref({ id: r.id, type: r.item_type, domain: r.domain }),
        band: bandFromPriority(r.priority),
        jurisdiction: jurisdictionCode({ jurisdiction: r.jurisdictions?.[0] ?? undefined }),
        title: r.title,
        meta: metaLine({ type: r.item_type ?? undefined, modes: r.transport_modes ?? undefined, topic: r.topic ?? undefined }),
      })),
    [results],
  );

  // Cmd+Enter / Ctrl+Enter or the Ask button (one bar, no toggle, ruling 2, 2026-09-20). Still refuses
  // to dispatch while the assistant is unavailable, belt-and-suspenders beyond the button's own
  // `disabled` DOM attribute and the keyboard shortcut's own gate below.
  const ask = () => {
    if (!assistantEnabled) return;
    const q = value.trim();
    if (!q) return;
    const rect = inputRef.current?.closest("form")?.getBoundingClientRect();
    const anchor = rect ? { top: rect.bottom, left: rect.left, width: rect.width } : null;
    window.dispatchEvent(
      new CustomEvent("open-ask-assistant", { detail: { question: q, anchor, scope } }),
    );
  };

  // Plain Enter with no active dropdown option: open the results page rather than doing nothing.
  // The SAME action the form's native submit (Enter, not intercepted by onInputKeyDown below)
  // resolves to; see the form's onSubmit.
  const openResultsPage = () => {
    const q = value.trim();
    if (!q) return;
    window.location.href = searchResultsHref(q);
  };

  const askDisabled = !assistantEnabled;

  // Navigates to a result row for Enter-on-the-active-option (onInputKeyDown below) by clicking
  // the row's OWN Link anchor (`.cl-row-link`, ListRow's whole-row click target) rather than
  // calling next/navigation's router directly; this is genuinely "the same navigation as clicking
  // it" (the identical DOM element and event path a mouse click would use), not a second,
  // divergent navigation mechanism next to next/link's own. It also sidesteps next/navigation's
  // useRouter(), which throws outside an App Router tree (this component has no reason to require
  // one just to move focus through a listbox); Link's own click handler reads router from
  // useContext directly and is a no-op with no provider, so this stays safe wherever CommandBar
  // is exercised standalone (e.g. this file's own rendering-guard smoke mount).
  const selectRow = (index: number) => {
    const option = document.getElementById(optionId(listboxId, index));
    option?.querySelector<HTMLAnchorElement>("a.cl-row-link")?.click();
  };

  // Escape / ArrowUp / ArrowDown / Enter (SEARCHKEYS, 2026-09-11; Enter's three-way split and
  // ⌘↵/Ctrl+Enter added lane W10-CommandBar, 2026-09-21, ruling 2). Lives on the input's onKeyDown
  // rather than the form's: Enter with an active option, or ⌘↵/Ctrl+Enter, calls
  // `e.preventDefault()` here, which stops the browser from also firing the form's implicit submit
  // for that keystroke. Plain Enter with no active option is left alone and falls through to the
  // form's own onSubmit (openResultsPage); `resolveEnterKeyAction` (commandBarKeyboard.ts) is the
  // pure decision the three Enter branches below and the form's fallback both agree with.
  const onInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      // "Escape with the dropdown already closed does nothing special"; only intercept while open.
      if (!showDropdown) return;
      e.preventDefault();
      setDismissed(true);
      return;
    }
    if (e.key === "Enter") {
      const action = resolveEnterKeyAction(e.metaKey || e.ctrlKey, activeIndex);
      if (action === "ask") {
        e.preventDefault();
        ask();
        return;
      }
      if (action === "navigate-active") {
        e.preventDefault();
        selectRow(activeIndex);
        return;
      }
      // "open-results": left alone, falls through to the form's own onSubmit.
      return;
    }
    if (!showDropdown || searchRows.length === 0) return; // arrows below only act on an open, non-empty listbox
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => moveActiveIndex(i, 1, searchRows.length));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => moveActiveIndex(i, -1, searchRows.length));
    }
  };

  return (
    <form
      ref={formRef}
      role="search"
      data-part="command-bar"
      onSubmit={(e) => {
        // Plain Enter, not intercepted above (no active dropdown option, no Cmd/Ctrl): open the
        // results page (ruling 2, 2026-09-20). The bar's other two actions (navigate to an active
        // option, ask the assistant) both call e.preventDefault() in onInputKeyDown, so this branch
        // only ever runs for the "open-results" case.
        e.preventDefault();
        openResultsPage();
      }}
      className="cl-command-bar"
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 10,
        height: 40,
        background: "var(--card)",
        border: "1px solid rgba(0,0,0,.25)",
        borderRadius: 8,
        padding: "0 6px 0 12px",
      }}
    >
      {/* Mobile spec (MASTHEAD): command bar height 44px, glyph 15px, drop
          the ⌘K hint — below 768 (theme.css's documented --bp-mobile). */}
      <style>{`
        @media (max-width: 767px) {
          .cl-command-bar { height: 44px !important; }
          .cl-command-bar .cl-cmdk-hint { display: none; }
          .cl-command-bar .cl-search-glyph { font-size: 15px !important; }
        }
        .cl-command-bar-clear:hover, .cl-command-bar-panel-close:hover {
          background: var(--tag, #F0EDE9);
        }
      `}</style>
      <span aria-hidden="true" className="cl-search-glyph" style={{ fontSize: 14, color: "var(--ink-3)" }}>
        ⌕
      </span>
      <input
        id="cl-command-bar-input"
        ref={inputRef}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          onSearch?.(e.target.value);
          // Re-typing un-dismisses (SEARCHKEYS); "reopen when the user types again".
          setDismissed(false);
        }}
        onFocus={() => {
          // Re-focusing with results already held un-dismisses too ("...or re-focuses the input
          // with results present"); harmless no-op when there is nothing to show yet.
          setDismissed(false);
        }}
        onKeyDown={onInputKeyDown}
        // One bar, no toggle (ruling 2, 2026-09-20): the input is NEVER disabled, search always
        // works, even while the Ask button is disabled for an unavailable assistant, so the
        // placeholder is always the search-or-ask copy, never a "the assistant is unavailable"
        // message that would suggest the whole bar is down.
        placeholder={placeholder ?? `Search or ask across ${formatNumber(itemCount)} items…`}
        aria-label="Search or ask across the workspace"
        // WAI-ARIA combobox pattern (SEARCHKEYS, 2026-09-11).
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={showDropdown}
        aria-activedescendant={showDropdown ? activeDescendantId(listboxId, activeIndex) : undefined}
        style={{
          flex: 1,
          minWidth: 0,
          height: "100%",
          border: "none",
          outline: "none",
          background: "transparent",
          fontFamily: "inherit",
          fontSize: "var(--fs-13)",
          color: "var(--ink)",
          cursor: "text",
          // L12 (site-wide layout guard, lane layoutguard 2026-09-08) [CONFIRMED by measurement on
          // 13 of the 17 routes at 1440 and 1024]: the placeholder is 339-546px of text in a 283px
          // input, so on every one of them a native <input> cut it mid-word with no sign that
          // anything was missing - "Search or ask across 1,434 item", "Search sources, workspaces,
          // fla". The ARTBOARD draws this same prompt with `white-space:nowrap;overflow:hidden;
          // text-overflow:ellipsis` (dc.html, every masthead), so trailing off is designed; cutting
          // a character silently is the defect, and it is the same rule L11 holds every other text
          // run to. One declaration, in the one command bar.
          textOverflow: "ellipsis",
        }}
      />
      {/* Trailing clear/close button (SEARCHKEYS-B, task 4.1b): the visible control the operator's
          report asked for, at the input's own trailing edge, on every viewport including desktop.
          44x44 CSS px meets the law-2 floor outright rather than the 24px+8px-clearance alternative;
          the bar's own row is 40px tall on desktop (44px below 768 via the existing mobile media
          query above), so this button is centered on that row and can overflow it by up to 2px on
          desktop; harmless, since neither the form nor its parent clips (SectionCard's own
          overflow:hidden, per this file's header, is far outside this box). */}
      {showClearButton && (
        <button
          type="button"
          onClick={handleClearOrClose}
          aria-label={clearLabel}
          className="cl-command-bar-clear"
          style={{
            flexShrink: 0,
            width: 44,
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "transparent",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            color: "var(--ink-3)",
          }}
        >
          <X size={16} aria-hidden="true" />
        </button>
      )}
      <span
        aria-hidden="true"
        className="cl-cmdk-hint"
        style={{
          flexShrink: 0,
          fontSize: "var(--fs-10)",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontWeight: 700,
          color: "var(--ink-3)",
          border: "1px solid var(--line-1)",
          borderRadius: 4,
          padding: "1px 6px",
        }}
      >
        ⌘K
      </span>
      {/* The Ask button: one bar, no toggle (ruling 2, 2026-09-20), always labeled "Ask", always
          dispatches `ask()` on click, disabled with a reason only while the assistant itself is
          unavailable. Search is never gated on this control; typing and Enter (no active option,
          via the form's own onSubmit) work regardless of its disabled state.
          `.cl-command-bar-ask-submit`, the selector masthead.json's audit spec names, is kept as
          the class, still the one dark submit-shaped button in the bar. */}
      <button
        type="button"
        className="cl-command-bar-ask-submit"
        onClick={ask}
        disabled={askDisabled}
        aria-disabled={askDisabled}
        title={askDisabled ? "The Assistant is currently unavailable." : undefined}
        style={{
          flexShrink: 0,
          height: 40,
          padding: "0 14px",
          fontFamily: "inherit",
          fontSize: "var(--fs-125)",
          fontWeight: 700,
          color: "#FFFFFF",
          background: "var(--brand)",
          border: "none",
          borderRadius: "var(--radius-control)",
          cursor: askDisabled ? "not-allowed" : "pointer",
          opacity: askDisabled ? 0.45 : 1,
        }}
      >
        Ask
      </button>

      {/* Standard Search results dropdown — the shared ListRow, never a second row anatomy. Absence
          convention (StateNote) for "no results", matching every list surface's own empty state.
          SEARCHCLIP (2026-09-11): portaled to document.body (see the barRect/portalTarget state
          above) instead of rendering here in the tree, because HERE is inside Masthead's
          SectionCard, whose `overflow: hidden` clips it — measured on production (wave 67,
          73e8c8b1): listbox top 173px against a masthead bottom edge of 189px, 344 of the box's
          360px clipped, elementFromPoint at the listbox centre resolving to the rail card
          underneath. Same box as before (var(--card), 1px var(--line-1), radius 8, the card-hover
          shadow, maxHeight 360, overflow-y auto) — only WHERE it mounts changes; `position: fixed`
          (not `absolute`) is what makes an element portaled outside its old offset parent land in
          the right place using a plain viewport-relative rect, and it is also the one position
          value the rendering guard's own clipped-overflow detector explicitly skips (ux-assert.mjs:
          `if (cs.position === 'fixed' ...) continue`), so this is not fighting that guard, it is
          the shape the guard already exempts. */}
      {showDropdown &&
        portalTarget &&
        barRect &&
        createPortal(
          // SEARCHKEYS-B (task 4.1b): the panel is now a two-part box: a visible "Close" row on
          // top, then the actual `role="listbox"` options container below it. The row lives OUTSIDE
          // role="listbox" (a sibling, not a child) because a listbox's children are its options per
          // the WAI-ARIA combobox pattern; nesting a plain button inside it would be a non-option
          // child of a listbox, which is exactly what this file avoids everywhere else (see the
          // per-row comment below on why each result is its own thin option wrapper rather than a
          // prop bolted onto ListRow). `listboxRef` moves to this OUTER div so a pointerdown on the
          // Close row itself still reads as "inside the widget" for the outside-click check, same as
          // a pointerdown on any result row already does.
          <div
            ref={listboxRef}
            className="cl-command-bar-panel"
            style={{
              position: "fixed",
              top: barRect.top,
              left: barRect.left,
              width: barRect.width,
              background: "var(--card)",
              border: "1px solid var(--line-1)",
              borderRadius: 8,
              boxShadow: "var(--shadow-card-hover, 0 8px 24px rgba(0,0,0,.12))",
              maxHeight: 360,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              zIndex: 600,
            }}
          >
            {/* Visible "Close" row (task 4.1b interface 2): so a reader who cannot see anything
                "outside" the panel (the panel can fill most of a narrow viewport) still has a
                control that dismisses it. Its own visible text IS its accessible name (no aria-label
                needed); refocuses the input, same as the trailing clear/close button above, so
                closing the search results always returns focus to the control that opened them. */}
            <button
              type="button"
              onClick={() => {
                // Focus before setDismissed(true), same ordering fix as handleClearOrClose above
                // and for the same reason: the input's own onFocus handler un-dismisses, so
                // refocusing AFTER would silently reopen what this click just closed.
                inputRef.current?.focus();
                setDismissed(true);
              }}
              className="cl-command-bar-panel-close"
              style={{
                flexShrink: 0,
                height: 44,
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "0 14px",
                border: "none",
                borderBottom: "1px solid var(--line-1)",
                background: "transparent",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: "var(--fs-13)",
                fontWeight: 600,
                color: "var(--ink-2)",
              }}
            >
              <X size={16} aria-hidden="true" />
              Close
            </button>
            <div
              id={listboxId}
              role="listbox"
              aria-label="Search results"
              style={{
                // Lane searchrow, 2026-09-11, operator screenshot: rows rendered jurisdiction-code-
                // then-dashes with no title and no type. [CONFIRMED, .discipline/rendering harness,
                // real ListRow mounted at this exact 330px-in-1175px box]: ListRow's shared grid
                // (ListRow.tsx GRID) needs 489px of fixed columns before its 1fr title column gets
                // any width, and its only narrow-reflow rule was a viewport `@media (max-width:
                // 767px)` query, which never fires here because the VIEWPORT stays wide even though
                // this BOX is ~330px, so the title column collapsed to 0 and painted nothing. This
                // listbox is the first ListRow caller whose box is narrow independent of the
                // viewport, so it now opts into CSS containment; ListRow.tsx's RESPONSIVE_CSS gained
                // an unnamed `@container (max-width: 489px)` query that reuses the exact same
                // reflow rules the mobile `@media` block already applies (LIST_ROW_NARROW_REFLOW_CSS,
                // one template, two triggers) rather than a second row anatomy. No other ListRow
                // caller sets `containerType`, so none of them are affected.
                containerType: "inline-size",
                // 316 = the panel's own 360 maxHeight minus the 44px Close row above it (task
                // 4.1b), so the total footprint is unchanged from before this row was added.
                maxHeight: 316,
                overflowY: "auto",
              }}
            >
              {searching && results === null ? (
                <>
                  <SkeletonListRow />
                  <SkeletonListRow />
                  <SkeletonListRow />
                </>
              ) : searchRows.length === 0 ? (
                <div style={{ padding: 16 }}>
                  <StateNote>No results for “{value.trim()}”.</StateNote>
                </div>
              ) : (
                searchRows.map((row, index) => {
                  const { key, ...rowProps } = row;
                  const active = index === activeIndex;
                  return (
                    // WAI-ARIA combobox pattern: each row is the "option", a thin wrapper around the
                    // shared ListRow rather than adding role/id props to ListRow itself (which is a
                    // shared part with unrelated callers; see this file's own header on reuse). The
                    // active highlight reuses `--row-hover`, the SAME token `.cl-list-row:hover`
                    // already paints, so keyboard-active and mouse-hover read as one visual state
                    // (law 16, pattern consistency), not two different treatments for "selected".
                    // `onMouseMove` keeps the roving index in sync with the pointer so the two
                    // selection mechanisms (keyboard, mouse) never show two different rows
                    // highlighted at once.
                    <div
                      key={key}
                      id={optionId(listboxId, index)}
                      role="option"
                      aria-selected={active}
                      onMouseMove={() => {
                        if (activeIndex !== index) setActiveIndex(index);
                      }}
                      style={{ background: active ? "var(--row-hover)" : undefined }}
                    >
                      <ListRow {...rowProps} />
                    </div>
                  );
                })
              )}
            </div>
          </div>,
          portalTarget,
        )}
    </form>
  );
}
