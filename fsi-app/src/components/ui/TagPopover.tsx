"use client";

/**
 * TagPopover — the "+ Tag" trigger and its popover (lane uitags,
 * 2026-09-07, README "Workspace tags" / ruling R6, Claude Design's
 * provisional spec — operator ruled "build it; a restyle later is cheap").
 *
 * 280px wide, anchored below the trigger, left edges aligned. White,
 * radius 10, 1px solid rgba(0,0,0,.12), card shadow, NO band rule. 40px
 * search input row (⌕ 15px #7A6E6C, 13px text, bottom border
 * rgba(0,0,0,.08) — the same input treatment as Settings fields). 40px
 * rows, 12px horizontal padding, pill + right-aligned muted 11px count;
 * hover #FAFAF8; an applied tag shows a check instead of the count. Max
 * height 320px, scrolls. Footer "Create "<typed>"" row (12.5px/600, pill
 * preview, top border rgba(0,0,0,.08)) when the query has no exact match.
 * Multi-select, stays open; the keyboard model (↑ ↓ / Enter / Esc /
 * Backspace) is tagPopoverKeyboard.ts, unit tested there.
 *
 * ATTRIBUTION (migration 360, lane s8b-tag-attribution): an applied row carries a second, muted
 * line "applied by <name> on <date>" (truncated with the full text in its title), so a workspace
 * member sees who tagged the item and when without leaving the list.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WorkspaceTagPill } from "@/components/ui/Chips";
import {
  visibleRows,
  showCreateRow,
  rowCount,
  moveHighlight,
  clampHighlight,
  resolveEnterAction,
  resolveBackspaceAction,
  type TagOption,
} from "@/components/ui/tagPopoverKeyboard";
import {
  fetchItemWorkspaceTags,
  applyWorkspaceTag,
  removeWorkspaceTag,
  createWorkspaceTag,
} from "@/lib/tags/client";
import { attributionText, type TagApplication } from "@/lib/tags/attribution";

const PANEL_WIDTH = 280;
const PANEL_BORDER = 2;
const VIEWPORT_MARGIN = 8;

export interface TagPopoverProps {
  /** The item (legacy_id or uuid) tags are being applied to/removed from. */
  itemId: string;
  /** Called after every apply/remove/create so the caller (the detail tag
   *  row, a rail facet group) can re-render off its own tag list. */
  onChange?: () => void;
  /**
   * Controlled open state (lane uiactions integration, 2026-09-07; DEFECT-FIX
   * item 3.2, 2026-09-07): the ActionRow's own "+ Tag" trigger (README
   * "Detail action row") drives ONE popover with ONE open/closed state. When
   * `open` is supplied (every one of the four detail surfaces does this) this
   * component does NOT render its own "+ Tag" trigger button at all — the
   * action row's trigger is the only one, per the audit ("the action-row
   * + Tag is the only trigger opening the one popover"). Omit both for the
   * uncontrolled default (internal state, own trigger rendered) — unchanged
   * behaviour for any caller that does not need the shared-state wiring.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function TagPopover({ itemId, onChange, open: openProp, onOpenChange }: TagPopoverProps) {
  const [openState, setOpenState] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? (openProp as boolean) : openState;
  const setOpen = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      const resolved = typeof next === "function" ? (next as (prev: boolean) => boolean)(open) : next;
      if (controlled) onOpenChange?.(resolved);
      else setOpenState(resolved);
    },
    [controlled, onOpenChange, open]
  );
  const [tags, setTags] = useState<TagOption[]>([]);
  const [appliedOrder, setAppliedOrder] = useState<string[]>([]); // oldest -> newest
  const [applications, setApplications] = useState<TagApplication[]>([]);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(-1);
  const [busy, setBusy] = useState(false);
  // Horizontal shift (px, <= 0) that keeps the 280px panel inside the viewport. The anchor sits after
  // the applied tag chips, so at phone width its left edge can be past x=95 and the fixed-width panel
  // ran off the right edge (measured at 375: panel right edge at 523). Recomputed on open and resize.
  const [shiftX, setShiftX] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const applied = useMemo(() => new Set(appliedOrder), [appliedOrder]);
  const rows = useMemo(() => visibleRows(tags, query), [tags, query]);
  const showCreate = useMemo(() => showCreateRow(tags, query), [tags, query]);
  const total = useMemo(() => rowCount(tags, query), [tags, query]);

  useEffect(() => {
    setHighlight((h) => clampHighlight(h, total));
  }, [total]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { tags: allTags, appliedTagIds, applications: apps } = await fetchItemWorkspaceTags(itemId);
      if (cancelled) return;
      setTags(allTags.map((t) => ({ id: t.id, name: t.name, itemCount: t.itemCount })));
      setAppliedOrder(appliedTagIds);
      setApplications(apps);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, itemId]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open, setOpen]);

  useEffect(() => {
    if (open) {
      // Focus trap: the input is the only focusable element besides the
      // rows themselves, so parking focus here on open and returning it to
      // the trigger on close is sufficient (no tab-cycling surface beyond
      // the input + Esc/close).
      inputRef.current?.focus();
    } else {
      triggerRef.current?.focus();
    }
  }, [open]);

  // After an apply the server holds the author and date; read them back so the new row shows
  // "applied by <name> on <date>" now rather than only after the popover is reopened.
  async function refreshApplications() {
    const { applications: apps } = await fetchItemWorkspaceTags(itemId);
    setApplications(apps);
  }

  useEffect(() => {
    if (!open) return;
    function fit() {
      const anchor = containerRef.current;
      if (!anchor) return;
      const left = anchor.getBoundingClientRect().left;
      const overflow = left + PANEL_WIDTH + PANEL_BORDER + VIEWPORT_MARGIN - window.innerWidth;
      setShiftX(overflow > 0 ? -Math.min(overflow, Math.max(0, left - VIEWPORT_MARGIN)) : 0);
    }
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [open]);

  async function toggle(tagId: string) {
    if (busy) return;
    setBusy(true);
    try {
      if (applied.has(tagId)) {
        const ok = await removeWorkspaceTag(tagId, itemId);
        if (ok) setAppliedOrder((prev) => prev.filter((id) => id !== tagId));
      } else {
        const ok = await applyWorkspaceTag(tagId, itemId);
        if (ok) {
          setAppliedOrder((prev) => [...prev, tagId]);
          await refreshApplications();
        }
      }
      onChange?.();
    } finally {
      setBusy(false);
    }
  }

  async function createAndApply(name: string) {
    if (busy || !name) return;
    setBusy(true);
    try {
      const created = await createWorkspaceTag(name);
      if (!created) return;
      setTags((prev) => (prev.some((t) => t.id === created.id) ? prev : [...prev, { id: created.id, name: created.name, itemCount: created.itemCount }]));
      const ok = await applyWorkspaceTag(created.id, itemId);
      if (ok) {
        setAppliedOrder((prev) => (prev.includes(created.id) ? prev : [...prev, created.id]));
        setQuery("");
        await refreshApplications();
      }
      onChange?.();
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => moveHighlight(h, 1, total));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => moveHighlight(h, -1, total));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const action = resolveEnterAction(tags, query, highlight);
      if (action.type === "toggle") void toggle(action.tagId);
      else if (action.type === "create") void createAndApply(action.name);
      return;
    }
    if (e.key === "Backspace") {
      const action = resolveBackspaceAction(query, appliedOrder);
      if (action.type === "removeLast") {
        e.preventDefault();
        void toggle(action.tagId);
      }
      return;
    }
  }

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-block" }}>
      {/* DEFECT-FIX (item 3.2, 2026-09-07): when `open` is controlled (a caller — every detail
          surface's ActionRow "+ Tag" — already drives visibility), this component must not render
          its OWN second "+ Tag" trigger: DetailTagRow renders applied tags only, and the action row's
          own "+ Tag" is the one trigger that opens this popover. Uncontrolled callers (none exist in
          this repo today, but the prop stays optional for any future one) keep their own trigger
          exactly as before — this is additive, not a breaking change to TagPopover's contract. The
          wrapping div still anchors the popover's `position: absolute` panel when the trigger is
          hidden, so the panel still opens in the same place (directly under the applied-tags row). */}
      {!controlled && (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            minHeight: 44,
            minWidth: 44,
            padding: "8px 14px",
            fontSize: "var(--fs-12)",
            fontWeight: 600,
            color: "var(--ink-2)",
            background: "#FFFFFF",
            border: "1px dashed rgba(0,0,0,.28)",
            borderRadius: 6,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          + Tag
        </button>
      )}

      {open && (
        <div
          role="listbox"
          aria-label="Workspace tags"
          onKeyDown={onKeyDown}
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: shiftX,
            width: PANEL_WIDTH,
            maxWidth: `calc(100vw - ${VIEWPORT_MARGIN * 2}px)`,
            background: "#FFFFFF",
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,.12)",
            boxShadow: "var(--shadow-card)",
            zIndex: 50,
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 12px", borderBottom: "1px solid rgba(0,0,0,.08)" }}>
            <span aria-hidden="true" style={{ fontSize: 15, color: "#7A6E6C" }}>⌕</span>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find or create a tag"
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                fontSize: 13,
                fontFamily: "inherit",
                color: "var(--ink)",
                background: "transparent",
              }}
              aria-autocomplete="list"
            />
          </div>

          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {rows.map((tag, i) => {
              const isApplied = applied.has(tag.id);
              const attribution = isApplied ? attributionText(applications.find((a) => a.tagId === tag.id)) : null;
              return (
                <div
                  key={tag.id}
                  role="option"
                  aria-selected={isApplied}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => void toggle(tag.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    minHeight: 40,
                    padding: attribution ? "6px 12px" : "0 12px",
                    gap: 8,
                    cursor: "pointer",
                    background: highlight === i ? "#FAFAF8" : "transparent",
                  }}
                >
                  <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, minWidth: 0 }}>
                    <WorkspaceTagPill name={tag.name} />
                    {attribution && (
                      <span
                        data-part="tag-attribution"
                        title={attribution}
                        style={{
                          maxWidth: "100%",
                          fontSize: 11,
                          color: "var(--ink-3)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {attribution}
                      </span>
                    )}
                  </span>
                  {isApplied ? (
                    <span aria-hidden="true" style={{ color: "var(--ink)", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>✓</span>
                  ) : (
                    <span style={{ fontSize: 11, color: "var(--ink-3)", flexShrink: 0 }}>{tag.itemCount}</span>
                  )}
                </div>
              );
            })}
            {showCreate && (
              <div
                role="option"
                aria-selected={false}
                onMouseEnter={() => setHighlight(rows.length)}
                onClick={() => void createAndApply(query.trim())}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  height: 40,
                  padding: "0 12px",
                  cursor: "pointer",
                  borderTop: "1px solid rgba(0,0,0,.08)",
                  background: highlight === rows.length ? "#FAFAF8" : "transparent",
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "var(--ink)",
                }}
              >
                <span>Create &ldquo;{query.trim()}&rdquo;</span>
                <WorkspaceTagPill name={query.trim()} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
