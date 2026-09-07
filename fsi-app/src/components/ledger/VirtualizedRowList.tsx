"use client";

/**
 * VirtualizedRowList — PERF-12 (2026-09-04, ADR-027 §2: "on every listing ledger ... through ONE
 * shared ledger-list component if the four ledgers share a row shape").
 *
 * The shared windowing primitive: TanStack Virtual's `useVirtualizer`/`useWindowVirtualizer`
 * (tanstack.com/virtual/latest/docs/introduction), generic over any row type — the four listing
 * ledgers (regulations, market, operations, research) all render `Resource[]` rows, but
 * RegulationsLedger's bands + drag-order, MarketIntelLedger's severity/signal bands, ResearchLedger's
 * theme groups, and OperationsLedger's region/dimension accordion (not an item-row list at all — see
 * its own header) each build a DIFFERENT row card and grouping shell around that shared row shape.
 * This component owns ONLY the windowing mechanism (measure, position, overscan, "getting close to
 * the end" signal) — never the row markup itself — so it is the ONE shared mechanism the four
 * ledgers can each mount around their own row renderer, rather than four independent hand-rolled
 * windowing implementations.
 *
 * Wired into RegulationsLedger.tsx this lane (the surface docs/audits/perf-waterfall-2026-09-04.md
 * §1 confirmed renders up to 713 unwindowed DOM rows in one band). Market/Research/Operations are
 * NOT wired to it this lane — PERF-11 (2026-09-04) confirmed their live corpora (55/39/25 items)
 * are under the first-page threshold, so today they cost nothing extra to leave unvirtualized; this
 * component is the ready-made adoption path the moment any of their corpora crosses that line,
 * without inventing a second windowing mechanism when that day comes.
 *
 * SCROLL CONTAINER — TWO SHAPES, TWO TANSTACK VIRTUAL HOOKS: this app's page scroll happens in an
 * ANCESTOR (AppShell.tsx's `<main overflow-y-auto>`, several component-tree levels up, outside this
 * lane's write set) — `useNearestScrollParent` resolves that ancestor at mount and this component
 * mounts `<ElementVirtualized>` (`useVirtualizer` against the found element), the shape this app
 * actually uses in production today. If NO scrollable ancestor is ever found (a future layout where
 * the page itself scrolls), this component mounts `<WindowVirtualized>` (`useWindowVirtualizer`)
 * instead — NOT `useVirtualizer` pointed at `document.documentElement`, which measures the wrong
 * range against a real browser (reproduced and root-caused this lane; see
 * useNearestScrollParent.ts's own header for the full reasoning and the isolated measurement that
 * proved it: 713 of 713 rows rendered instead of a ~28-row window). Until the ancestor search
 * resolves (first paint, one effect tick), this component renders every row PLAINLY (no windowing,
 * nothing hidden) rather than nothing — a page must never render blank/empty while a scroll
 * container is still being found (docs/design/ux-laws.md: no surface renders empty or false while
 * loading).
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useVirtualizer, useWindowVirtualizer } from "@tanstack/react-virtual";
import { useNearestScrollParent } from "@/lib/hooks/useNearestScrollParent";

export interface VirtualizedRowListProps<T> {
  rows: T[];
  /** Estimated row height in px — react-virtual re-measures the REAL rendered height per row via
   *  `measureElement` (a title can clamp to 1-3 lines), this is only the initial layout guess. */
  rowHeight: number;
  overscan?: number;
  getRowId: (row: T) => string;
  renderRow: (row: T, index: number) => ReactNode;
  /** Called (at most once per rows.length change) once the rendered/overscanned range reaches
   *  within `endThreshold` rows of the end — the mechanism `RegulationsLedger` uses to call
   *  `fetchNextPage()` BEFORE the user physically scrolls past the last rendered row, matching
   *  `useInfiniteQuery`'s own documented "load more near the end" pattern. */
  onEndReached?: () => void;
  /** Default 6 — roughly one row-height screen of lookahead relative to LIST_PAGE_SIZE=30/26
   *  (list-pagination.ts's own derivation), so the next page is typically already resident by the
   *  time the user's scroll position would otherwise catch up to the loading edge. */
  endThreshold?: number;
}

interface InnerProps<T> extends VirtualizedRowListProps<T> {
  containerRef: React.RefObject<HTMLDivElement | null>;
}

function useEndReachedEffect(lastIndex: number, rowsLength: number, endThreshold: number, onEndReached?: () => void) {
  useEffect(() => {
    if (!onEndReached || rowsLength === 0) return;
    if (lastIndex >= rowsLength - 1 - endThreshold) onEndReached();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastIndex, rowsLength, endThreshold]);
}

/** The production shape: a real scrollable ANCESTOR element was found. */
function ElementVirtualized<T>({
  rows,
  rowHeight,
  overscan = 8,
  getRowId,
  renderRow,
  onEndReached,
  endThreshold = 6,
  containerRef,
  scrollElement,
}: InnerProps<T> & { scrollElement: HTMLElement }) {
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => rowHeight,
    overscan,
    getItemKey: (index) => getRowId(rows[index]),
  });
  const virtualItems = virtualizer.getVirtualItems();
  const lastIndex = virtualItems.length ? virtualItems[virtualItems.length - 1].index : -1;
  useEndReachedEffect(lastIndex, rows.length, endThreshold, onEndReached);

  return (
    <div ref={containerRef} style={{ position: "relative", height: virtualizer.getTotalSize(), width: "100%" }}>
      {virtualItems.map((vi) => (
        <div
          key={vi.key}
          data-index={vi.index}
          ref={virtualizer.measureElement}
          style={{ position: "absolute", top: 0, left: 0, right: 0, transform: `translateY(${vi.start}px)` }}
        >
          {renderRow(rows[vi.index], vi.index)}
        </div>
      ))}
    </div>
  );
}

/** The fallback shape: no scrollable ancestor — the document/window itself scrolls. Uses
 *  `useWindowVirtualizer`'s own `scrollMargin` (the container's measured `offsetTop`) so it
 *  correctly accounts for whatever content (masthead, tiles, other bands) sits above this list in
 *  the document, rather than assuming the list starts at scrollTop 0 — see this file's own header. */
function WindowVirtualized<T>({
  rows,
  rowHeight,
  overscan = 8,
  getRowId,
  renderRow,
  onEndReached,
  endThreshold = 6,
  containerRef,
}: InnerProps<T>) {
  // STATE, not a ref: `useWindowVirtualizer`'s `scrollMargin` option is read fresh from THIS
  // component's own render body on every render, so the corrected value (the container's real
  // `offsetTop` — everything rendered above this list in the document, e.g. the masthead/tiles/ask
  // bar) must itself trigger a re-render once measured, or the virtualizer would go on using its
  // initial guess of 0 forever. `useLayoutEffect` (not `useEffect`) so the corrected measurement
  // lands before the browser paints the first virtualized frame, avoiding a visible jump.
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    setScrollMargin(containerRef.current?.offsetTop ?? 0);
  }, [containerRef]);

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => rowHeight,
    overscan,
    getItemKey: (index) => getRowId(rows[index]),
    scrollMargin,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const lastIndex = virtualItems.length ? virtualItems[virtualItems.length - 1].index : -1;
  useEndReachedEffect(lastIndex, rows.length, endThreshold, onEndReached);

  return (
    <div ref={containerRef} style={{ position: "relative", height: virtualizer.getTotalSize(), width: "100%" }}>
      {virtualItems.map((vi) => (
        <div
          key={vi.key}
          data-index={vi.index}
          ref={virtualizer.measureElement}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            transform: `translateY(${vi.start - scrollMargin}px)`,
          }}
        >
          {renderRow(rows[vi.index], vi.index)}
        </div>
      ))}
    </div>
  );
}

export function VirtualizedRowList<T>(props: VirtualizedRowListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollParent = useNearestScrollParent(containerRef);

  if (scrollParent.kind === "pending") {
    // Scroll ancestor not resolved yet (first paint) — plain, unwindowed render. Correct, never
    // empty; simply not yet DOM-cheap. Resolves within one effect tick after mount in practice.
    return (
      <div ref={containerRef}>
        {props.rows.map((r, i) => (
          <div key={props.getRowId(r)}>{props.renderRow(r, i)}</div>
        ))}
      </div>
    );
  }

  if (scrollParent.kind === "element") {
    return <ElementVirtualized {...props} containerRef={containerRef} scrollElement={scrollParent.el} />;
  }

  return <WindowVirtualized {...props} containerRef={containerRef} />;
}
