// stub-next-navigation-account.mjs — same as stub-next-navigation.mjs, pathname fixed to /profile
// (the real route UserProfilePage mounts at — Sidebar.tsx's own nav entry is `{ href: "/profile",
// label: "Account" }`) so the composition mount's Sidebar/TopBar active-item highlight matches the
// real page (lane compose-other, 2026-09-08). See stub-next-navigation.mjs for the full rationale.
export function useRouter() {
  return { push() {}, replace() {}, back() {}, forward() {}, refresh() {}, prefetch() {} };
}
export function usePathname() {
  return "/profile";
}
export function useSearchParams() {
  return new URLSearchParams();
}
