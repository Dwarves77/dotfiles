// stub-next-navigation.mjs — smoke-harness alias target for `next/navigation`'s client hooks
// (useRouter, usePathname, useSearchParams). Same rationale as harness.mjs's own
// stub-next-link.mjs/stub-supabase-browser.mjs (see that file's header): the real hooks read a
// React context tree (`next/dist/client/components/app-router`) this bundle has none of, and throw
// ("invariant expected app router to be mounted") the moment a mounted component calls them.
// PostComposer.tsx (mounted transitively via PostList.tsx, this lane's community-smoke.mjs) calls
// `useRouter`/`usePathname`/`useSearchParams` for its EntityPicker search round-trip
// (`router.push` to widen the candidate list); PromotePostDialog.tsx (mounted transitively via
// Post.tsx) calls `useRouter` on promotion success.
//
// The stub is a no-op: `useRouter().push` records nothing and does nothing observable (a live
// round-trip on that path needs a real App Router, out of scope for a smoke mount — this lane's
// entity-search proof instead asserts the composer's own state, not a URL change). `usePathname`
// returns a fixed smoke-origin path. `useSearchParams` returns a real (empty) `URLSearchParams` —
// the exact object shape (including a working `.toString()`) PostComposer calls on it.

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
  return "/community/smoke-test";
}

export function useSearchParams() {
  return new URLSearchParams();
}
