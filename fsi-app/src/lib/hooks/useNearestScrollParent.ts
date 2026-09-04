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

function isScrollable(el: Element): boolean {
  const style = window.getComputedStyle(el);
  return style.overflowY === "auto" || style.overflowY === "scroll";
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
