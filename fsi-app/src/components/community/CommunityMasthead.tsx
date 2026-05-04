"use client";

/**
 * CommunityMasthead — editorial masthead + search bar for /community/*.
 *
 * Layers:
 *   1. <EditorialMasthead> renders the eyebrow / title / meta — same
 *      pattern as every other landing page, so the visual treatment
 *      stays consistent.
 *   2. Below it, a pill-shaped search input with a Cmd+K kbd hint and
 *      a Search button. Scope chips (All / Posts / Groups / People).
 *
 * Phase C constraint:
 *   The form submit fires onSearchSubmit. The parent (CommunityShell)
 *   wires that to a "Search rolling out — Phase D" toast. No real
 *   Postgres FTS query is wired up yet — that's deferred to Phase D
 *   along with the search results drawer.
 */

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { EditorialMasthead } from "@/components/ui/EditorialMasthead";

const SCOPES = ["All", "Posts", "Groups", "People"] as const;
type Scope = (typeof SCOPES)[number];

interface CommunityMastheadProps {
  /** Called on form submit. Use this to fire the Phase-D toast. */
  onSearchSubmit?: (query: string, scope: Scope) => void;
}

export function CommunityMasthead({ onSearchSubmit }: CommunityMastheadProps) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("All");
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Cmd+K / Ctrl+K focuses the search input — matches the kbd hint shown
  // inside the pill. We register on the document so any nested focus
  // can be reached.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isCombo = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (isCombo) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <EditorialMasthead
      title="Community"
      meta="Regional working groups · public forums — connect with peers across the industry"
      belowSlot={
        <form
          role="search"
          aria-label="Community search"
          onSubmit={(e) => {
            e.preventDefault();
            onSearchSubmit?.(query.trim(), scope);
          }}
          style={{ marginTop: 18, maxWidth: 880 }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "var(--color-bg-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 999,
              padding: "6px 8px 6px 18px",
            }}
          >
            <Search size={18} style={{ color: "var(--color-primary)" }} aria-hidden="true" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search posts, groups, members, regulations cited in discussions…"
              aria-label="Search"
              style={{
                flex: 1,
                minWidth: 0,
                border: 0,
                outline: 0,
                background: "transparent",
                fontFamily: "inherit",
                fontSize: 14,
                color: "var(--color-text-primary)",
                padding: "9px 0",
              }}
            />
            <kbd
              aria-hidden="true"
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "var(--color-text-muted)",
                padding: "2px 7px",
                border: "1px solid var(--color-border)",
                borderRadius: 4,
                background: "var(--color-bg-base)",
                flexShrink: 0,
                letterSpacing: "0.04em",
              }}
            >
              ⌘K
            </kbd>
            <button
              type="submit"
              style={{
                background: "var(--color-primary)",
                color: "#fff",
                border: 0,
                borderRadius: 999,
                fontFamily: "inherit",
                fontWeight: 700,
                fontSize: 12,
                padding: "8px 16px",
                cursor: "pointer",
                flexShrink: 0,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              Search
            </button>
          </div>

          {/* Scope chips */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              marginTop: 10,
              paddingLeft: 6,
              alignItems: "center",
            }}
          >
            {SCOPES.map((s) => {
              const on = scope === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScope(s)}
                  aria-pressed={on}
                  style={{
                    fontFamily: "inherit",
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "4px 11px",
                    borderRadius: 999,
                    border: on
                      ? "1px solid var(--color-primary)"
                      : "1px solid var(--color-border)",
                    background: on ? "var(--color-primary)" : "var(--color-bg-surface)",
                    color: on ? "#fff" : "var(--color-text-secondary)",
                    cursor: "pointer",
                  }}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </form>
      }
    />
  );
}
