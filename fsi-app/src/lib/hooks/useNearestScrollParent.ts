"use client";

// useNearestScrollParent — PERF-12 (2026-09-04, ADR-027 §2).
//
// TanStack Virtual's `useVirtualizer` needs the DOM node that actually scrolls
// (`getScrollElement`). This app's page-level scroll container is AppShell.tsx's
// `<main className="... overflow-y-auto ...">`, an ANCESTOR several component-tree levels above
// any ledger component — not `window` (AppShell.tsx is outside this lane's write set; not touched
// here) and not something a listing component can receive as a prop without threading it through
// every intermediate layer. This is the standard technique for that shape: walk up from a ref
// until an ancestor with a real scrollable overflow is found, exactly what react-virtual's own
// docs show for "virtualizing inside a scrollable div you don't directly control the ref of"
// (tanstack.com/virtual/latest/docs/introduction — "Custom Scroll" recipes use the identical
// `getScrollElement` + externally-resolved-node shape).
//
// WINDOW FALLBACK, AND WHY IT IS A SEPARATE RESULT KIND (not "just use document.documentElement as
// the scroll element"): reproduced empirically while building this lane (rendering-smoke gate, this
// lane's own REPORT) — `useVirtualizer({ getScrollElement: () => document.documentElement })`
// measures the WRONG range against a real browser and renders every row instead of a window of
// them, because TanStack Virtual's custom-scroll-element path assumes the virtualized container
// starts at scrollTop 0 of the given scroll element, and does not itself know the container's own
// offset within `document.documentElement`'s full (unclipped) content height the way it does for a
// bounded `overflow:auto` div. TanStack Virtual ships a DEDICATED hook for exactly this "the whole
// document/window scrolls" shape — `useWindowVirtualizer` (tanstack.com/virtual/latest/docs/
// framework/react/examples/window) — which takes a `scrollMargin` (the container's own
// `offsetTop`) instead of a `getScrollElement`, and is verified (this lane's own isolated
// measurement) to correctly window a 713-row list down to ~28 rendered DOM rows against a real
// `window`. VirtualizedRowList.tsx switches which TanStack Virtual hook it calls based on this
// hook's result `kind` — never reproduces its own offset math against `document.documentElement`.
import { useEffect, useState, type RefObject } from "react";

// PERF-13 (2026-09-04, docs/audits/perf-clickthrough-2026-09-04.md §(f), root cause): checking the
// computed `overflow-y` value ALONE is not sufficient — it is true the moment the CSS class is
// present, regardless of whether the element is actually height-constrained enough to overflow.
// [CONFIRMED, this lane, isolated CSS reproduction]: AppShell.tsx's real ancestor chain is
// `<div className="flex min-h-screen">` (a MINIMUM height, not a fixed `h-screen`) wrapping
// `<main className="flex-1 overflow-y-auto ...">`. Because no ancestor between `<main>` and the
// viewport has a BOUNDED height, `<main>` auto-grows to fit all of its content — `overflow-y: auto`
// is a real computed style on it, but it never actually overflows (`scrollHeight === clientHeight`
// in the reproduction, both before and after attempting to set `scrollTop` on it directly), so it
// never becomes a real scrolling box: the browser scrolls `window`/`document.documentElement`
// instead, and `<main>`'s own `scrollTop` stays pinned at 0 regardless of how far the page is
// actually scrolled. This hook used to select `<main>` anyway (matching only the CSS property),
// handing `VirtualizedRowList`'s `useVirtualizer({ getScrollElement: () => main })` a scroll
// element whose `scrollTop` never changes — the virtualizer can never advance its rendered range
// past its initial viewport-sized window for any band with more rows than that, no matter how far
// the real page is scrolled, and any other logic keyed off "did this element scroll" (a
// programmatic `main.scrollTop = ...`, a scroll-position query) is silently inert. Requiring ACTUAL
// overflow (`scrollHeight` strictly greater than `clientHeight`, the standard "does this box really
// scroll" check) in addition to the CSS property correctly falls through to the `WINDOW_RESULT`
// case below for this exact shape — the case `VirtualizedRowList`'s own header already documents as
// a legitimate, supported configuration ("a future layout where the page itself scrolls"), which
// this fix recognizes AppShell's CURRENT layout actually is.
function isScrollable(el: Element): boolean {
  const style = window.getComputedStyle(el);
  const overflowsY = style.overflowY === "auto" || style.overflowY === "scroll";
  if (!overflowsY) return false;
  return el.scrollHeight > el.clientHeight + 1; // +1: sub-pixel layout rounding, never a real page's worth
}

export type ScrollParentResult =
  | { kind: "pending" }
  | { kind: "element"; el: HTMLElement }
  | { kind: "window" };

const PENDING: ScrollParentResult = { kind: "pending" };
const WINDOW_RESULT: ScrollParentResult = { kind: "window" };

export function useNearestScrollParent(ref: RefObject<HTMLElement | null>): ScrollParentResult {
  const [result, setResult] = useState<ScrollParentResult>(PENDING);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let node: HTMLElement | null = el.parentElement;
    while (node && node !== document.body && node !== document.documentElement) {
      if (isScrollable(node)) {
        setResult({ kind: "element", el: node });
        return;
      }
      node = node.parentElement;
    }
    // No scrollable ANCESTOR ELEMENT found — the document/window itself is the scroller (see this
    // module's own header for why that is `useWindowVirtualizer`'s case, not
    // `document.documentElement` handed to `useVirtualizer` as if it were an ordinary element).
    setResult(WINDOW_RESULT);
    // Re-resolve only if the ref's own current node identity changes (mount/unmount) — the DOM
    // tree between a mounted ledger and its scroll ancestor does not itself change shape at
    // runtime in this app (no ledger ever moves between AppShell's `<main>` and elsewhere).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref.current]);

  return result;
}
