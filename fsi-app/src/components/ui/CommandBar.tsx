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
 * copy. Optional; the generic placeholder is unchanged when omitted.
 *
 * MODE TOGGLE (CMDSEARCH lane, 2026-09-09, operator verbatim: "we need a
 * simple search function for the site as well as an AI agent" then "a
 * toggel between standard search and AI question in that bar"). The bar's
 * own geometry (40px, border, radius — the artboard's ratified box) is
 * untouched; the toggle is two small tabs living INSIDE that same box,
 * between the glyph and the input. Search is the default mode:
 *   - Search mode: typing calls the bounded workspace read at GET
 *     /api/search (debounced) and renders a small results dropdown using
 *     the SAME shared ListRow every list surface already uses — never a
 *     second row anatomy. `onSearch` (the pre-existing per-page
 *     instant-filter callback some list surfaces pass) still fires on
 *     every keystroke in this mode, unchanged — the dropdown is additive,
 *     not a replacement of that page-local filter.
 *   - Ask mode: unchanged `open-ask-assistant` dispatch, gated on
 *     ASSISTANT_ENABLED. The flag reaches this client component the ONE
 *     existing way a server-only flag reaches the client in this app —
 *     useWorkspaceBootstrap()'s `assistantEnabled` field (see
 *     workspace/bootstrap/route.ts's own header) — never a second
 *     flag-plumbing mechanism, and never by exposing the env var or the
 *     model key. While disabled, Ask mode's input is itself disabled and
 *     its placeholder states the reason BEFORE the reader can type
 *     anything; the Ask button carries the same disabled state so no
 *     request to /api/ask (and no raw 503 body) ever reaches the UI.
 *     Flipping ASSISTANT_ENABLED to true needs no code change here — the
 *     gate reads live bootstrap data on every render.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { formatNumber } from "@/lib/format";
import { authedFetch } from "@/lib/api/authed-fetch";
import { useWorkspaceBootstrap } from "@/lib/hooks/useWorkspaceBootstrap";
import { ListRow } from "@/components/ui/ListRow";
import { StateNote } from "@/components/ui/StateNote";
import { SkeletonListRow } from "@/components/ui/Skeleton";
import { bandFromPriority } from "@/lib/urgency/bands";
import { itemDetailHref } from "@/lib/item-links";
import { jurisdictionCode, metaLine } from "@/lib/dashboard/row-fields";

type CommandBarMode = "search" | "ask";

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
  /** Total item count for the default placeholder ("Search across N items…"). */
  itemCount: number;
  /** Called as the reader types/submits a plain search (Enter, not Ask) — the pre-existing
   *  page-local instant filter over already-loaded rows. Unaffected by the mode toggle's new
   *  cross-workspace dropdown, which fires from this component's own state. */
  onSearch?: (query: string) => void;
  /** Page name the Ask call is scoped to (assistant context), e.g. "dashboard". */
  scope?: string;
  /** Override the default item-count placeholder with a page-scoped prompt (Search mode only). */
  placeholder?: string;
}

export function CommandBar({ itemCount, onSearch, scope, placeholder }: CommandBarProps) {
  const [mode, setMode] = useState<CommandBarMode>("search");
  const [value, setValue] = useState("");
  const [results, setResults] = useState<SearchResultRow[] | null>(null);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
  // call, no spend: unconditional on ASSISTANT_ENABLED, unlike Ask below.
  useEffect(() => {
    if (mode !== "search" || value.trim().length < MIN_QUERY_LEN) {
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
  }, [mode, value]);

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

  // Runs the mode's own action — the SAME thing Enter does in the form's onSubmit below, so the
  // submit button and the keyboard both go through one path, never two. Search mode's fetch is
  // already debounced on every keystroke (the useEffect above); this call is what makes Enter/the
  // button ACT immediately rather than only ever firing implicitly, matching the operator's report
  // (2026-09-10, verbatim: "i hit ask and nothing happens when trying standard search") — the
  // submit control used to be hard-wired to `ask()` regardless of `mode`, so pressing it while in
  // Search mode silently asked the assistant (or did nothing at all when the assistant was
  // disabled) instead of running a search.
  const submit = () => {
    if (mode === "ask") ask();
    else onSearch?.(value.trim());
  };

  // `askDisabled` is already scoped to Ask mode (`mode === "ask" && !assistantEnabled` is always
  // false in Search mode, by construction) — Search mode's submit control is never disabled,
  // matching this component's own header ("unconditional on ASSISTANT_ENABLED, unlike Ask").
  const askDisabled = mode === "ask" && !assistantEnabled;
  const showDropdown =
    mode === "search" && value.trim().length >= MIN_QUERY_LEN && (searching || results !== null);

  // L9 (site-wide layout guard, operator's own numbers: ">= 44px in one dimension and >= 28px in
  // the other; adjacent targets do not overlap") caught two rounds here, both fixed rather than
  // exempted:
  //   (1) A first pass at `padding: "4px 10px"` with no explicit height measured ~23.8px tall — the
  //       short axis needs >=28px, not >=24px. `height: 30` (below, 2px of margin above the
  //       28px floor so sub-pixel font-metric rounding never lands exactly on the boundary) fixes
  //       it outright.
  //   (2) With height fixed, the "Ask" tab's own text (~4 fewer characters than "Search") measured
  //       only 42px WIDE — under the required 44px on at least one dimension, since the bar's 40px
  //       height means neither tab can ever reach 44 tall. `minWidth: 44` makes BOTH tabs clear 44
  //       on the width axis regardless of label length, so the floor holds by construction rather
  //       than by each label happening to be long enough.
  // The group's own 8px gap (was 2) also clears the neighbor-clearance half between the two tabs;
  // the form's own 10px flex gap already clears the glyph and input on either side.
  const modeTabStyle = (active: boolean): CSSProperties => ({
    height: 30,
    minWidth: 44,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 10px",
    fontSize: "var(--fs-105)",
    fontWeight: 700,
    letterSpacing: "0.02em",
    borderRadius: 5,
    border: "none",
    background: active ? "var(--card)" : "transparent",
    color: active ? "var(--ink)" : "var(--ink-3)",
    cursor: "pointer",
    fontFamily: "inherit",
  });

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
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
      `}</style>
      <span aria-hidden="true" className="cl-search-glyph" style={{ fontSize: 14, color: "var(--ink-3)" }}>
        ⌕
      </span>
      {/* Mode toggle (CMDSEARCH lane, 2026-09-09) — two plain buttons INSIDE the bar's existing box,
          between the glyph and the input. Keyboard-reachable by construction (Tab to focus,
          Enter/Space to activate) with no extra mechanism needed. `role="group"` names the pair for
          assistive tech WITHOUT claiming the ARIA tablist/tab pattern — this is a two-state toggle,
          not a tabbed panel set, and `role="tablist"` would also collide with the admin page's own
          unrelated sub-tab row (compose-13-admin.json asserts exactly one `[role="tablist"]` on that
          page; this bar mounts on every route, admin included). `aria-pressed` is the toggle-button
          state ARIA names for exactly this shape; the CSS active background carries it visually. */}
      <div
        role="group"
        aria-label="Search mode"
        className="cl-command-bar-modes"
        style={{
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
          gap: 8,
          background: "var(--tag, #F0EDE9)",
          borderRadius: 6,
          padding: 2,
        }}
      >
        <button
          type="button"
          aria-pressed={mode === "search"}
          className="cl-command-bar-mode-search"
          onClick={() => setMode("search")}
          style={modeTabStyle(mode === "search")}
        >
          Search
        </button>
        <button
          type="button"
          aria-pressed={mode === "ask"}
          className="cl-command-bar-mode-ask"
          onClick={() => setMode("ask")}
          style={modeTabStyle(mode === "ask")}
        >
          Ask
        </button>
      </div>
      <input
        id="cl-command-bar-input"
        ref={inputRef}
        value={value}
        disabled={askDisabled}
        onChange={(e) => {
          setValue(e.target.value);
          if (mode === "search") onSearch?.(e.target.value);
        }}
        placeholder={
          mode === "ask"
            ? assistantEnabled
              ? "Ask a question…"
              : "The Assistant is currently unavailable"
            : (placeholder ?? `Search across ${formatNumber(itemCount)} items…`)
        }
        aria-label={mode === "ask" ? "Ask the Intelligence Assistant" : "Search across the workspace"}
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
          cursor: askDisabled ? "not-allowed" : "text",
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
      {/* Submit control — one element, one handler, labeled for whichever mode is active (SEARCHFIX,
          2026-09-11, operator verbatim: "i hit ask and nothing happens when trying standard
          search"). It used to read "Ask" and call `ask()` unconditionally, so pressing it in
          Search mode silently asked the assistant (or, with the assistant disabled, did nothing
          visible at all) instead of running a search. `.cl-command-bar-ask-submit` — the
          selector masthead.json's audit spec already names — is kept as-is: it is still the ONE
          submit button in the bar, mode-toggle tabs excluded, same element the spec row means. */}
      <button
        type="button"
        className="cl-command-bar-ask-submit"
        onClick={submit}
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
        {mode === "ask" ? "Ask" : "Search"}
      </button>

      {/* Standard Search results dropdown — the shared ListRow, never a second row anatomy. Absence
          convention (StateNote) for "no results", matching every list surface's own empty state. */}
      {showDropdown && (
        <div
          role="listbox"
          aria-label="Search results"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            background: "var(--card)",
            border: "1px solid var(--line-1)",
            borderRadius: 8,
            boxShadow: "var(--shadow-card-hover, 0 8px 24px rgba(0,0,0,.12))",
            maxHeight: 360,
            overflowY: "auto",
            zIndex: 50,
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
            searchRows.map((row) => {
              const { key, ...rowProps } = row;
              return <ListRow key={key} {...rowProps} />;
            })
          )}
        </div>
      )}
    </form>
  );
}
