> **Historical:** 2026-05-09 to 2026-05-11 wave decision-snapshot. Kept for cross-reference. Not a current-architecture spec.

# Auth architecture audit, 2026-05-10

## TL;DR

The fsi-app authenticates browser sessions through `@supabase/ssr` 0.8.0, which stores the access and refresh tokens in two httpOnly cookies under the project ref `kwrsbpiseruzbfwjpvsp`, not in localStorage or sessionStorage, which is why the operator's browser storage came back empty even while signed in. The `/api/agent/run` route hits `requireAuth(request)` in `src/lib/api/auth.ts`, which accepts only an `Authorization: Bearer <jwt>` header, calls `supabase.auth.getUser(token)` against the anon project URL, and returns 401 on any other shape, with no service-role bypass and no cookie fallback. There is no Vercel password protection or repo-level basic-auth middleware, so a 401 from the deployment is a Supabase JWT failure, not a deploy gate. The cleanest way to mint a Bearer JWT from outside the browser is option C, a direct POST to `https://kwrsbpiseruzbfwjpvsp.supabase.co/auth/v1/token?grant_type=password` using the operator email and a known password, returning an `access_token` ready to drop into the Authorization header. The orchestrator should run that one fetch from a Node script seeded by `.env.local`, then issue the smoke POST against `/api/agent/run` carrying that bearer.

## 1. Auth library in use

Two Supabase packages are in `package.json`:

- `@supabase/ssr` 0.8.0 (line 17)
- `@supabase/supabase-js` 2.98.0 (line 18)

`@supabase/ssr` is the cookie-aware Next.js helper that has replaced `@supabase/auth-helpers-nextjs`. There is no NextAuth, no Iron Session, and no custom session library in the dependency graph.

Client-setup files:

- `src/lib/supabase-browser.ts`, exports `createSupabaseBrowserClient()`, which wraps `createBrowserClient` from `@supabase/ssr`. This is the client used by login, AuthProvider, the admin-attention hook, and every "use client" caller.
- `src/lib/supabase.ts`, defines a duplicate `createClient()` that also wraps `createBrowserClient`, plus `getServiceSupabase()` that builds a raw `@supabase/supabase-js` client with `SUPABASE_SERVICE_ROLE_KEY` and `auth.persistSession: false`. The service client is server-only and bypasses RLS for paths the anon RPC cannot serve.
- `src/lib/supabase-server-client.ts`, exports `createSupabaseServerClient()`, which wraps `createServerClient` from `@supabase/ssr` and binds it to the Next.js `cookies()` store with `getAll` and `setAll` adapters.
- `src/lib/supabase-server.ts`, an older alias for the same server pattern, present alongside `supabase-server-client.ts`.

The login surface is a single page at `src/app/login/page.tsx`. It is a client component that builds a browser client and calls `supabase.auth.signInWithPassword({ email, password })`. There is no separate `(auth)` route group. The auth callback at `src/app/auth/callback/route.ts` exists for email-confirmation and magic-link flows and uses `createServerClient` plus `exchangeCodeForSession(code)` to set cookies on the response. There is no `middleware.ts` at the project root or in `src/`.

## 2. Session storage client-side

Mechanism: `@supabase/ssr` writes the session to **httpOnly cookies**, not to localStorage or sessionStorage. With `createServerClient` bound to Next.js `cookies()`, the cookies are httpOnly and SameSite=Lax by default, which means client-side JavaScript cannot read them and the Application tab in DevTools shows them under Cookies, not under Local Storage. `createBrowserClient` from `@supabase/ssr` reads and writes the same cookie names so client and server agree on the session.

Exact identifier: the project ref in `.env.local` is `kwrsbpiseruzbfwjpvsp`, so the cookies follow the `@supabase/ssr` convention `sb-kwrsbpiseruzbfwjpvsp-auth-token` (and a chunked sibling `sb-kwrsbpiseruzbfwjpvsp-auth-token.0`, `.1` when the JWT is large enough that the underlying base64 payload is split). These cookies are httpOnly, so:

- DevTools, Application, Cookies, will show them.
- DevTools, Application, Local Storage, will be empty for this origin.
- DevTools, Application, Session Storage, will also be empty.
- `document.cookie` from the JS console will not return them, because the httpOnly flag prevents it.

This is why the operator's empty localStorage and sessionStorage are not a "not signed in" signal. The operator is signed in, the session simply lives in cookies the browser is keeping out of script reach.

In-tab JS still reaches the access token through `supabase.auth.getSession()`, which `@supabase/ssr` resolves by parsing the cookies it can see at request time and by communicating with its own internal store. The codebase exploits exactly this when it wants to attach a Bearer header, see the next section.

## 3. requireAuth validation

The full implementation is `src/lib/api/auth.ts`. The relevant lines:

```
const authHeader = request.headers.get("authorization");
if (!authHeader || !authHeader.startsWith("Bearer ")) {
  return NextResponse.json(
    { error: "Authentication required" },
    { status: 401 }
  );
}

const token = authHeader.slice(7);

try {
  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 401 }
    );
  }

  return { userId: user.id };
}
```

What it accepts: a single header, `Authorization: Bearer <jwt>`, validated against the Supabase anon URL via `supabase.auth.getUser(token)`. The user id from the verified JWT is returned to the caller.

What it rejects: anything missing the header, anything that does not start with `Bearer `, anything where `auth.getUser` returns an error or no user. Each rejection path returns `NextResponse.json({ error: "..." }, { status: 401 })`. There is no `try/finally` cookie fallback, no `createServerClient` cookie path, no service-role bypass, no `x-worker-secret` shortcut, and no environment-based "skip in dev" flag.

Service-role and worker-secret bypasses do exist on other routes, just not this one. `src/app/api/worker/check-sources/route.ts` uses an `x-worker-secret` header against `process.env.WORKER_SECRET`. `src/app/api/admin/users/route.ts` uses `requireAuth` then constructs a service-role client for privileged work. The agent run route inherits only the bearer gate and then independently builds its own service-role client at line 182 of `src/app/api/agent/run/route.ts`.

The deployed app reaches its own routes by minting the bearer at call time. Callers like `src/lib/hooks/useAdminAttention.ts` lines 95-110, `src/components/admin/AdminDashboard.tsx` lines 206-211 and 238-243, and the other 16 files surfaced by `Authorization.*Bearer` all follow the same pattern: build a browser client, call `supabase.auth.getSession()`, read `session.access_token`, set `Authorization: Bearer ${session.access_token}` on the fetch. So even though the session is in httpOnly cookies, the browser SDK exposes the token to in-tab JS through the `getSession()` call, and that token is what the API route gate validates. This explains the architecture, the cookies are the source of truth, the SDK exposes the token to first-party in-tab code, and the API gate stays a pure header check.

## 4. Deployment-level gate

No. There is no Vercel password protection, no basic-auth middleware, and no IP allowlist in the repo.

- `next.config.ts` contains only the Turbopack root setting and two 308 redirects for the IA refactor. No middleware configuration, no headers block, no rewrites guarding routes.
- `vercel.json` contains exactly four lines, framework, regions, and the schema URL. No password protection block, no deployment protection settings.
- There is no `middleware.ts` at the project root or under `src/`. `Glob` for both paths returned nothing.
- Repository search for `password.protection`, `VERCEL_PROTECT`, `basicAuth`, and `basic-auth` returned no matches.

Vercel's deployment-protection password feature is configured on the Vercel dashboard, not in the repo, but if it were active the deployment would return a 401 with a Vercel HTML challenge page rather than the JSON-shaped 401 from `requireAuth`. The earlier orchestrator probe getting a Supabase-shaped 401 confirms the request reached the route. So the 401 is a Supabase JWT failure path, not a deploy gate.

## 5. Bearer JWT minting paths

### a. `auth.admin.createUser` plus `signInWithPassword`

A Node script using `@supabase/supabase-js` and the service-role key can call `supabase.auth.admin.createUser({ email, password, email_confirm: true })`, then `supabase.auth.signInWithPassword({ email, password })` to obtain `data.session.access_token`. Feasibility, high. Side effect, creates a real `auth.users` row plus, depending on the org bootstrap path, an `org_memberships` insert may be expected. The new user is not the operator and has no membership, so `requireAuth` will pass on the bearer but downstream RLS or org-resolution logic in `/api/agent/run` will see a stranger. For the agent run route specifically that may be acceptable because the route itself does not check membership, only that the bearer is valid, but it pollutes `auth.users` with a synthetic test account that would need cleanup.

### b. Service-role key as bearer

The service-role JWT is itself a signed JWT with the `service_role` claim. `requireAuth` passes the token to `supabase.auth.getUser(token)`. In current Supabase Auth versions, `getUser(serviceRoleKey)` returns no `user` because service-role tokens are not user tokens, they are project-wide keys. The route would reject with `Invalid or expired token`. Feasibility, low. Not viable without changing requireAuth.

### c. Direct POST to `/auth/v1/token?grant_type=password`

Supabase Auth exposes the GoTrue REST endpoint at `${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`. A Node script can POST `{ email, password }` with the anon key in `apikey` and `Authorization` headers and the response body returns `access_token`, `refresh_token`, `expires_in`, and `user`. The access token is a real user JWT, signed by the project, accepted by `supabase.auth.getUser(token)`, accepted by `requireAuth`, and downstream org-resolution sees the real operator. Feasibility, high. Side effect, none beyond a normal sign-in event. Requires only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, the operator email, and the operator password. The first three are already in `.env.local`. The operator email is `jasonlosh@gmail.com` per the global preferences. The password is the only missing input and the operator already knows it because they are the one signing in to the live app.

### d. Magic-link OTP relay

A service-role script can call `supabase.auth.admin.generateLink({ type: 'magiclink', email })` to mint a one-time URL. The operator clicks it, the `/auth/callback` route exchanges the code for a session and sets cookies, and the access token would be readable in the browser through `await supabase.auth.getSession()`. The orchestrator would need the operator to manually copy the token back. Feasibility, medium. Side effects, creates an audit-log entry for each link issued, requires human-in-the-loop, slower than path c. Not recommended when path c is available.

### e. Admin REST session creation

`supabase.auth.admin.createUser` can return `session: null`, and Supabase has been adding admin REST session-issuance endpoints in newer GoTrue releases. The currently installed `@supabase/supabase-js` 2.98.0 exposes `admin.generateLink`, `admin.inviteUserByEmail`, `admin.listUsers`, `admin.deleteUser`, and `admin.updateUserById`. There is no `admin.createSession` or equivalent on this client version that issues a ready-to-use access token without a follow-up sign-in. So this collapses back into either path a or path d. Feasibility, none as a standalone option.

**Recommended path, c.** It uses only credentials the operator already controls, requires no migrations, no test-account pollution, and produces a JWT that any other API route under the same auth contract will also accept. It is one HTTP call.

## Recommended smoke-run procedure

1. Confirm the orchestrator can read `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from `fsi-app/.env.local`. Both are present per the audit. The operator's email is `jasonlosh@gmail.com`. The operator must supply their current Supabase password through a prompt or an `OPERATOR_PASSWORD` env var that the orchestrator reads at runtime and does not log.

2. Mint the bearer with one POST. From a Node or shell context:
   ```
   curl -s -X POST "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/token?grant_type=password" \
     -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
     -H "Content-Type: application/json" \
     -d '{"email":"jasonlosh@gmail.com","password":"'"$OPERATOR_PASSWORD"'"}'
   ```
   The JSON response contains `access_token`. Capture it into `BEARER` without echoing the whole token to logs. Tokens expire after `expires_in` seconds, default 3600.

3. Smoke the deployed agent run route:
   ```
   curl -s -X POST "https://carosledge.vercel.app/api/agent/run" \
     -H "Authorization: Bearer $BEARER" \
     -H "Content-Type: application/json" \
     -d '{"sourceUrl":"<known-good-source-url>","bypassPause":false}'
   ```
   Use a `sourceUrl` known to be present in `sources` and to have an `intelligence_items` row, otherwise the route returns 404 from the inner gate at `targetItem` resolution rather than from `requireAuth`.

4. Interpret the result. 200 with the job summary means auth, fetch, Claude call, and DB update all succeeded. 401 means the bearer is wrong, expired, or rejected by `supabase.auth.getUser`, refresh by repeating step 2. 403, 404, 409, 412, 429, 502 are downstream business-logic outcomes, not auth, and `statusToTelemetry` in the route maps each to a terminal `agent_runs.status`.

5. After the smoke, optionally call `POST $NEXT_PUBLIC_SUPABASE_URL/auth/v1/logout` with the same bearer to invalidate the token. This is cosmetic, the token expires in an hour anyway, but it keeps the GoTrue session table tidy.

The orchestrator should run steps 2 through 4 in the same process, never persist `OPERATOR_PASSWORD` or `BEARER` to disk, and treat any 401 from step 4 as a signal to re-mint rather than to retry the same bearer.

## Related

- [[ADR-004-auth-pattern-split]] — same auth subsystem; audit of the admin-route auth architecture this ADR formalizes
- [[WORKER-ACTIVATION-AUDIT-2026-05-08]] — Contrasts the worker-secret auth on /api/worker/* against the bearer gate on /api/agent/run — the exact reason the cron worker cannot invoke the…
- [[caros-ledge-supabase-schema-audit-2026-05-15]] — Both cover the authorization model; the schema audit's headline is the SECURITY DEFINER page RPCs accepting p_org_id with no auth.uid() membership…
