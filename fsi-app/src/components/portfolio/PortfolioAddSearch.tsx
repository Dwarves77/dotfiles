"use client";

/**
 * PortfolioAddSearch: add a HELD item to the open portfolio by finding it (lane S8-D, 2026-10-07).
 *
 * It reuses the existing Standard Search route (GET /api/search, the same retrieval the command bar and
 * /search use, customer read gate included), so only items the platform holds can be found and therefore
 * added; the server checks again on add. Nothing typed here is analysed or stored: the text is only a
 * search query, and the thing that is saved is the chosen item's id.
 *
 * Reader's goal: put one more item in this portfolio. Path: type two or more letters, press Add on the
 * result. One primary action per result: Add. Feedback: the button reads "Adding..." while in flight, then
 * the row reads "In portfolio" and the page refreshes its roll-ups; a failure shows an inline banner and
 * leaves the search and the results where they were.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { StateNote } from "@/components/ui/StateNote";
import { InlineErrorBanner } from "@/components/ui/InlineErrorBanner";
import { authedFetch } from "@/lib/api/authed-fetch";
import { addMemberRequest } from "@/lib/portfolio/client";

interface SearchHit {
  id: string;
  title: string;
  item_type: string | null;
}

const MIN_QUERY = 2;

export function PortfolioAddSearch({ portfolioId, memberItemIds }: { portfolioId: string; memberItemIds: string[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing results when the query is too short to search
      setHits([]);
      setSearched(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      const res = await authedFetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (cancelled) return;
      if (res.ok) {
        const body = (await res.json()) as { results?: SearchHit[] };
        if (!cancelled) setHits(body.results ?? []);
      } else {
        setHits([]);
        setError("Search is not available right now. Try again in a moment.");
      }
      setSearching(false);
      setSearched(true);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const already = new Set([...memberItemIds, ...added]);

  async function add(hit: SearchHit) {
    if (pendingId) return;
    setPendingId(hit.id);
    setError(null);
    const res = await addMemberRequest(portfolioId, { itemId: hit.id });
    setPendingId(null);
    if (!res.ok) {
      setError(res.error ?? "That did not go through. Try again.");
      return;
    }
    setAdded((prev) => new Set(prev).add(hit.id));
    router.refresh();
  }

  return (
    <div style={{ padding: "0 16px 16px" }}>
      <input
        id="portfolio-add-search"
        aria-label="Search for an item to add"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search the platform for an item to add"
        autoComplete="off"
        style={{
          width: "100%",
          minHeight: 44,
          padding: "0 12px",
          fontSize: "var(--fs-13)",
          border: "1px solid var(--line-1)",
          borderRadius: 6,
          background: "var(--card)",
          color: "var(--ink)",
          boxSizing: "border-box",
        }}
      />
      {error && (
        <div style={{ marginTop: 10 }}>
          <InlineErrorBanner message={error} />
        </div>
      )}
      {searching && <p style={{ fontSize: "var(--fs-12)", color: "var(--ink-3)", margin: "10px 0 0" }}>Searching...</p>}
      {!searching && searched && hits.length === 0 && !error && (
        <div style={{ marginTop: 10 }}>
          <StateNote>The platform holds nothing matching that search. Try a different word.</StateNote>
        </div>
      )}
      {hits.length > 0 && (
        <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0 }}>
          {hits.map((hit) => {
            const isIn = already.has(hit.id);
            return (
              <li
                key={hit.id}
                style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 52, borderTop: "1px solid var(--line-3)", padding: "4px 0" }}
              >
                <span style={{ flex: 1, minWidth: 0, fontSize: "var(--fs-13)", color: "var(--ink)", overflowWrap: "anywhere" }}>{hit.title}</span>
                <Button
                  type="button"
                  variant={isIn ? "ghost" : "secondary"}
                  disabled={isIn || pendingId !== null}
                  onClick={() => void add(hit)}
                  aria-label={isIn ? `${hit.title} is in this portfolio` : `Add ${hit.title} to this portfolio`}
                  style={{ minHeight: 44, minWidth: 96, flexShrink: 0 }}
                >
                  {isIn ? "In portfolio" : pendingId === hit.id ? "Adding..." : "Add"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
