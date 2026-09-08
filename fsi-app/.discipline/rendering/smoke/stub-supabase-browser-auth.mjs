// Auth-page-composition-only stub for @/lib/supabase-browser (lane compose-other, 2026-09-08).
// /login and /signup both want a SIGNED-OUT steady state (the form itself is the artboard's
// content) — the opposite of the generic stub-supabase-browser.mjs, which is deliberately
// "fake-but-authenticated" for click-fires-callback smoke proofs elsewhere. SignupPage.tsx calls
// `supabase.auth.getUser()` on mount to redirect an already-signed-in visitor away; a signed-in
// stub here would immediately router.replace("/login") and never render the form this mount exists
// to capture. auth.signInWithPassword / signInWithOtp are present as no-op-resolving stubs only so
// a stray render-path call never throws — this mount never submits the form.
export function createSupabaseBrowserClient() {
  return {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
      signInWithPassword: async () => ({ data: {}, error: null }),
      signInWithOtp: async () => ({ data: {}, error: null }),
      signUp: async () => ({ data: {}, error: null }),
    },
  };
}
