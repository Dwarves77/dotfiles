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
 */

import { useEffect, useRef, useState } from "react";
import { formatNumber } from "@/lib/format";

export interface CommandBarProps {
  /** Total item count for the default placeholder ("Search or ask across N items…"). */
  itemCount: number;
  /** Called as the reader types/submits a plain search (Enter, not Ask). */
  onSearch?: (query: string) => void;
  /** Page name the Ask call is scoped to (assistant context), e.g. "dashboard". */
  scope?: string;
  /** Override the default item-count placeholder with a page-scoped prompt. */
  placeholder?: string;
}

export function CommandBar({ itemCount, onSearch, scope, placeholder }: CommandBarProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

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

  const ask = () => {
    const q = value.trim();
    if (!q) return;
    const rect = inputRef.current?.closest("form")?.getBoundingClientRect();
    const anchor = rect ? { top: rect.bottom, left: rect.left, width: rect.width } : null;
    window.dispatchEvent(
      new CustomEvent("open-ask-assistant", { detail: { question: q, anchor, scope } }),
    );
  };

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch?.(value.trim());
      }}
      className="cl-command-bar"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        height: 40,
        background: "var(--card)",
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius-control)",
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
      <input
        id="cl-command-bar-input"
        ref={inputRef}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          onSearch?.(e.target.value);
        }}
        placeholder={placeholder ?? `Search or ask across ${formatNumber(itemCount)} items…`}
        aria-label="Search or ask across the workspace"
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
        }}
      />
      <span
        aria-hidden="true"
        className="cl-cmdk-hint"
        style={{
          flexShrink: 0,
          fontSize: "var(--fs-105)",
          fontWeight: 700,
          color: "var(--ink-3)",
          border: "1px solid var(--line-1)",
          borderRadius: 4,
          padding: "1px 6px",
        }}
      >
        ⌘K
      </span>
      <button
        type="button"
        onClick={ask}
        style={{
          flexShrink: 0,
          height: 30,
          padding: "0 16px",
          fontFamily: "inherit",
          fontSize: "var(--fs-125)",
          fontWeight: 700,
          color: "#FFFFFF",
          background: "var(--brand)",
          border: "none",
          borderRadius: "var(--radius-control)",
          cursor: "pointer",
        }}
      >
        Ask
      </button>
    </form>
  );
}
