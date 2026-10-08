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
 *
 * COVERAGE AT ADD TIME (lane COV-1, 2026-10-08; spec 00 section 4: "coverage shown at portfolio-add time, so
 * expectations are set at commitment rather than at disappointment"). Each result carries one quiet line, "Coverage
 * for this: N of M catalogued <surface> instruments are dual-verified", linking to that surface's cell on /dashboard/coverage.
 * The numbers come from the generated matrix (GET /api/dashboard/coverage/matrix?summary=1), fetched once when the first result
 * appears. If that read fails the reader sees the coverage "error" state with a retry; the Add control never waits
 * on it.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { StateNote } from "@/components/ui/StateNote";
import { InlineErrorBanner } from "@/components/ui/InlineErrorBanner";
import { authedFetch } from "@/lib/api/authed-fetch";
import { addMemberRequest } from "@/lib/portfolio/client";
import { CoverageState } from "@/components/ui/CoverageState";
import { fetchCoverageSummary } from "@/lib/coverage/client";
import { coverageHref, formatPortfolioCoverageLine } from "@/lib/coverage/coverage-matrix.mjs";
import { surfaceOf } from "@/lib/surface-of.mjs";

interface SearchHit {
  id: string;
  title: string;
  item_type: string | null;
}

const MIN_QUERY = 2;

/** The census names the Market Intel surface "market_intel"; surfaceOf() names it "market". */
const CENSUS_CLASS_OF_SURFACE: Record<string, string> = { regulations: "regulations", operations: "operations", research: "research", market: "market_intel" };

interface CoverageClass {
  code: string;
  label: string;
  numerator: number;
  denominator: number;
}

export function PortfolioAddSearch({ portfolioId, memberItemIds }: { portfolioId: string; memberItemIds: string[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<{ phase: "idle" | "loading" | "ready" | "failed"; classes: CoverageClass[] }>({ phase: "idle", classes: [] });

  async function loadCoverage() {
    setCoverage((c) => ({ ...c, phase: "loading" }));
    const res = await fetchCoverageSummary();
    setCoverage(res.ok ? { phase: "ready", classes: res.dataClasses } : { phase: "failed", classes: [] });
  }

  // Fetch the matrix summary once, when the first result appears.
  useEffect(() => {
    if (hits.length > 0 && coverage.phase === "idle") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one lazy fetch, the first time results exist
      void loadCoverage();
    }
  }, [hits.length, coverage.phase]);

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
      {hits.length > 0 && coverage.phase === "failed" && (
        <div style={{ marginTop: 10 }}>
          <CoverageState state="error" variant="inline" subject="The coverage for these results" onRetry={() => void loadCoverage()} />
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
                <div style={{ flex: 1, minWidth: 0, fontSize: "var(--fs-13)", color: "var(--ink)", overflowWrap: "anywhere" }}>
                  {hit.title}
                  {coverage.phase === "ready" && <PortfolioCoverageLine itemType={hit.item_type} classes={coverage.classes} />}
                </div>
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

/** The one coverage line under a result: the numerator and denominator of the cell this item sits in, linked. */
export function PortfolioCoverageLine({ itemType, classes }: { itemType: string | null; classes: CoverageClass[] }) {
  const surface = surfaceOf(itemType, null);
  const code = CENSUS_CLASS_OF_SURFACE[surface];
  const lineStyle = { display: "flex", flexWrap: "wrap" as const, alignItems: "center", gap: "0 8px", margin: "2px 0 0", fontSize: "var(--fs-11)", color: "var(--ink-2)" };
  // An item that belongs to no census surface: the question does not apply, and the dash says so on hover.
  if (!code) {
    return (
      <div data-part="portfolio-coverage" style={{ ...lineStyle, display: "flex" }}>
        Coverage for this: <CoverageState state="not_applicable" variant="cell" subject="Coverage for this item" reason="No discovery census covers this kind of item." />
      </div>
    );
  }
  const cls = classes.find((c) => c.code === code);
  if (!cls || cls.denominator === 0) {
    return (
      <div data-part="portfolio-coverage" style={{ ...lineStyle, display: "flex" }}>
        <CoverageState state="not_covered" variant="inline" subject="Catalogue coverage for this" requestRef={coverageHref({ dataClass: code })} />
      </div>
    );
  }
  return (
    <div data-part="portfolio-coverage" style={{ ...lineStyle, display: "flex" }}>
      <span>{formatPortfolioCoverageLine(cls)}</span>
      <Link href={coverageHref({ dataClass: code })} style={{ display: "inline-flex", alignItems: "center", minHeight: 28, padding: "8px 0", fontWeight: 600, color: "var(--ink)" }}>
        See coverage
      </Link>
    </div>
  );
}
