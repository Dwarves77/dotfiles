// stub-auth-provider.mjs — audit-harness alias target for `@/components/auth/AuthProvider`.
// Same rationale as smoke/stub-supabase-browser.mjs and smoke/stub-next-navigation.mjs (read those
// headers): the real provider resolves a Supabase session and an org id over the network, which the
// audit mount has none of, and `useAuth()` outside a real provider tree throws.
//
// The stub returns a RESOLVED signed-in state (`user` truthy, `orgId` a string) deliberately, not an
// empty one: AppShell renders `{user && <AskAssistant />}`, so a signed-out stub would make the
// floating-Ask-AI forbid check pass by never mounting the control it is looking for — a false MATCH,
// the exact failure class this harness exists to stop.

export function useAuth() {
  return {
    user: { id: 'audit-user', email: 'audit@smoke-guard.internal' },
    orgId: 'audit-org',
    loading: false,
    session: null,
  };
}

export function AuthProvider({ children }) {
  return children;
}
