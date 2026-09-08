// stub-next-navigation-map.mjs — same as stub-next-navigation.mjs, pathname fixed to /map so the
// composition mount's Sidebar/TopBar active-item highlight and page title match the real page
// (lane compose-other, 2026-09-08). See stub-next-navigation.mjs for the full rationale.
export function useRouter() {
  return { push() {}, replace() {}, back() {}, forward() {}, refresh() {}, prefetch() {} };
}
export function usePathname() {
  return "/map";
}
export function useSearchParams() {
  return new URLSearchParams();
}
