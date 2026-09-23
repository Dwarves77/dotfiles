"use client";

/**
 * CommunitySearchBar, the scoped posts/groups/people/all search control for /community/*,
 * extracted from the former CommunityMasthead (lane W10-Masthead, amendment 1 ruling 2,
 * 2026-09-22) when the masthead chrome above it (eyebrow/Anton title/dek) moved onto the shared
 * `Masthead` part.
 *
 * NOT migrated onto the shared `CommandBar` part. Ruling 2, verbatim: "the search element
 * Community shows today is the shared CommandBar part (lane #769) passed through the same prop
 * every other surface uses; if Community needs a behaviour CommandBar does not have, STOP and
 * name it, do not build a second bar." Investigated and named (not silently built around):
 * CommandBar's own search is hard-wired to `GET /api/search` over `intelligence_items` (its
 * `SearchResultRow` shape is item_type/domain/priority/jurisdictions, rendered through the shared
 * `ListRow`), with no scope parameter. Community search hits `GET /api/community/search` over
 * posts/groups/people with a visible four-way scope toggle (All/Posts/Groups/People,
 * `CommunitySearchResults`'s own contract), a different endpoint, a different result shape, and
 * a control CommandBar does not expose. Forcing this through CommandBar would mean either losing
 * the scope toggle (a real capability regression) or extending CommandBar with an endpoint/shape
 * switch used by exactly one caller (out of this lane's write set, and a second bar in spirit
 * even if not in file). Per the ruling this is a STOP-and-name case, not a build: this component
 * keeps the pre-existing, working search behaviour unchanged, relocated out of the masthead file
 * now that the masthead chrome itself is shared. Flagged in the session log for an operator
 * ruling on whether CommandBar should grow a scope/endpoint extension point.
 */

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { NotificationsBell } from "./NotificationsBell";

const SCOPES = ["All", "Posts", "Groups", "People"] as const;
type Scope = (typeof SCOPES)[number];

interface CommunitySearchBarProps {
  /** Called on form submit. Use this to fire the Phase-D toast. */
  onSearchSubmit?: (query: string, scope: Scope) => void;
}

export function CommunitySearchBar({ onSearchSubmit }: CommunitySearchBarProps) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("All");
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Cmd+K / Ctrl+K focuses the search input, matches the kbd hint shown
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
        }}
      >
      <div
        style={{
          flex: 1,
          minWidth: 0,
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
      <NotificationsBell />
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
  );
}
