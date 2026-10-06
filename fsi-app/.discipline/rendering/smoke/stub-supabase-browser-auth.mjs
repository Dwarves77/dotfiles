// Auth/onboarding-page-composition-only stub for @/lib/supabase-browser (lane compose-other,
// 2026-09-08). /login and /signup both want a SIGNED-OUT steady state (the form itself is the
// artboard's content) — the opposite of the generic stub-supabase-browser.mjs, which is
// deliberately "fake-but-authenticated" for click-fires-callback smoke proofs elsewhere.
// SignupPage.tsx calls `supabase.auth.getUser()` on mount to redirect an already-signed-in visitor
// away; a signed-in stub here would immediately router.replace("/login") and never render the form
// this mount exists to capture. auth.signInWithPassword / signInWithOtp are present as no-op-
// resolving stubs only so a stray render-path call never throws — these mounts never submit a form.
//
// `.from()` (added alongside compose-onboarding): OnboardingWizard.tsx's own profile-prefill effect
// awaits `supabase.from("profiles").select(...).eq(...).maybeSingle()` unconditionally on mount —
// without a `.from` at all here, that call throws synchronously inside the effect's async IIFE
// before `setLoadingProfile(false)` is ever reached, so `loadingProfile` stays true forever and the
// step-2 preview tiles render their loading skeleton indefinitely instead of the fixture counts
// passed via the `aggregates` prop. Same empty-row/no-error shape as the generic stub's `.from`.
export function createSupabaseBrowserClient() {
  return {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
      signInWithPassword: async () => ({ data: {}, error: null }),
      signInWithOtp: async () => ({ data: {}, error: null }),
      // A smoke leg may set window.__SIGNUP_FIXTURE__ to the exact response signUp should return
      // (lane AUTH-1: the already-registered shape, a user with an empty identities array). Unset,
      // it keeps the original empty success the composition mounts rely on.
      signUp: async () =>
        (typeof window !== "undefined" && window.__SIGNUP_FIXTURE__) || { data: {}, error: null },
    },
    from() {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: null, error: null }),
        upsert: async () => ({ error: null }),
      };
      return chain;
    },
  };
}
