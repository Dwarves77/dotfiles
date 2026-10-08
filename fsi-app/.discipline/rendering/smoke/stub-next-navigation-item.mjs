// stub-next-navigation-item.mjs: smoke-harness alias target for `next/navigation` (lane S8-A, 2026-10-07).
// Same no-op hooks as stub-next-navigation.mjs, except `usePathname` answers a real detail-route path
// (/regulations/smoke-item) so DetailShell's item collaboration slot can read an item id off it and mount the
// notes and assignment blocks through the real shell. The community stub's fixed /community/smoke-test path
// is deliberately not a detail route, which is why this is a sibling and not a change to that file.

export function useRouter() {
  return {
    push() {},
    replace() {},
    back() {},
    forward() {},
    refresh() {},
    prefetch() {},
  };
}

export function usePathname() {
  return "/regulations/smoke-item";
}

export function useSearchParams() {
  return new URLSearchParams();
}
