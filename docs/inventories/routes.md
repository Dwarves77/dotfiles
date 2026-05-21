# API Routes Inventory

**Generated 2026-05-21** (Layer 4 cross-skill consistency dispatch).

## Routes

| Path | File | Auth |
|---|---|---|
| /api/admin/attention | fsi-app/src/app/api/admin/attention/route.ts | isPlatformAdmin |
| /api/admin/b2-progress | fsi-app/src/app/api/admin/b2-progress/route.ts | isPlatformAdmin |
| /api/admin/canonical-sources/bulk-approve | fsi-app/src/app/api/admin/canonical-sources/bulk-approve/route.ts | isPlatformAdmin |
| /api/admin/canonical-sources/bulk-classify | fsi-app/src/app/api/admin/canonical-sources/bulk-classify/route.ts | isPlatformAdmin |
| /api/admin/canonical-sources/decide | fsi-app/src/app/api/admin/canonical-sources/decide/route.ts | isPlatformAdmin |
| /api/admin/canonical-sources/pending | fsi-app/src/app/api/admin/canonical-sources/pending/route.ts | isPlatformAdmin |
| /api/admin/canonical-sources/recommend-classification | fsi-app/src/app/api/admin/canonical-sources/recommend-classification/route.ts | isPlatformAdmin |
| /api/admin/coverage | fsi-app/src/app/api/admin/coverage/route.ts | isPlatformAdmin |
| /api/admin/integrity-flags | fsi-app/src/app/api/admin/integrity-flags/route.ts | isPlatformAdmin |
| /api/admin/integrity-flags/[id]/regenerate | fsi-app/src/app/api/admin/integrity-flags/[id]/regenerate/route.ts | isPlatformAdmin |
| /api/admin/integrity-flags/[id]/resolve | fsi-app/src/app/api/admin/integrity-flags/[id]/resolve/route.ts | isPlatformAdmin |
| /api/admin/intersections | fsi-app/src/app/api/admin/intersections/route.ts | isPlatformAdmin |
| /api/admin/q7-daily-recompute | fsi-app/src/app/api/admin/q7-daily-recompute/route.ts | isPlatformAdmin |
| /api/admin/recompute-trust | fsi-app/src/app/api/admin/recompute-trust/route.ts | WORKER_SECRET |
| /api/admin/scan | fsi-app/src/app/api/admin/scan/route.ts | isPlatformAdmin |
| /api/admin/sources/all | fsi-app/src/app/api/admin/sources/all/route.ts | isPlatformAdmin |
| /api/admin/sources/bulk-import | fsi-app/src/app/api/admin/sources/bulk-import/route.ts | isPlatformAdmin |
| /api/admin/sources/discover | fsi-app/src/app/api/admin/sources/discover/route.ts | isPlatformAdmin |
| /api/admin/sources/pause-global | fsi-app/src/app/api/admin/sources/pause-global/route.ts | isPlatformAdmin |
| /api/admin/sources/promote | fsi-app/src/app/api/admin/sources/promote/route.ts | isPlatformAdmin |
| /api/admin/sources/recently-auto-approved | fsi-app/src/app/api/admin/sources/recently-auto-approved/route.ts | isPlatformAdmin |
| /api/admin/sources/recommend-classification | fsi-app/src/app/api/admin/sources/recommend-classification/route.ts | isPlatformAdmin |
| /api/admin/sources/verify | fsi-app/src/app/api/admin/sources/verify/route.ts | isPlatformAdmin |
| /api/admin/sources/[id]/fetch-now | fsi-app/src/app/api/admin/sources/[id]/fetch-now/route.ts | isPlatformAdmin |
| /api/admin/sources/[id]/pause | fsi-app/src/app/api/admin/sources/[id]/pause/route.ts | isPlatformAdmin |
| /api/admin/sources/[id]/regenerate-brief | fsi-app/src/app/api/admin/sources/[id]/regenerate-brief/route.ts | isPlatformAdmin |
| /api/admin/sources/[id]/tier-override | fsi-app/src/app/api/admin/sources/[id]/tier-override/route.ts | isPlatformAdmin |
| /api/admin/sources/[id]/visibility | fsi-app/src/app/api/admin/sources/[id]/visibility/route.ts | isPlatformAdmin |
| /api/admin/spot-check/recurring | fsi-app/src/app/api/admin/spot-check/recurring/route.ts | WORKER_SECRET |
| /api/admin/users | fsi-app/src/app/api/admin/users/route.ts | isPlatformAdmin |
| /api/agent/run | fsi-app/src/app/api/agent/run/route.ts | requireAuth |
| /api/ask | fsi-app/src/app/api/ask/route.ts | requireAuth |
| /api/community/groups/[id]/invite | fsi-app/src/app/api/community/groups/[id]/invite/route.ts | public |
| /api/community/groups/[id]/join | fsi-app/src/app/api/community/groups/[id]/join/route.ts | public |
| /api/community/groups/[id]/star | fsi-app/src/app/api/community/groups/[id]/star/route.ts | public |
| /api/community/invitations/[id]/accept | fsi-app/src/app/api/community/invitations/[id]/accept/route.ts | public |
| /api/community/invitations/[id]/decline | fsi-app/src/app/api/community/invitations/[id]/decline/route.ts | public |
| /api/community/invitations/[id]/revoke | fsi-app/src/app/api/community/invitations/[id]/revoke/route.ts | public |
| /api/community/moderation/reports | fsi-app/src/app/api/community/moderation/reports/route.ts | public |
| /api/community/moderation/reports/[id] | fsi-app/src/app/api/community/moderation/reports/[id]/route.ts | public |
| /api/community/notifications/preferences | fsi-app/src/app/api/community/notifications/preferences/route.ts | public |
| /api/community/notifications | fsi-app/src/app/api/community/notifications/route.ts | public |
| /api/community/notifications/[id] | fsi-app/src/app/api/community/notifications/[id]/route.ts | public |
| /api/community/posts | fsi-app/src/app/api/community/posts/route.ts | public |
| /api/community/posts/[id]/promote | fsi-app/src/app/api/community/posts/[id]/promote/route.ts | public |
| /api/community/posts/[id]/reactions | fsi-app/src/app/api/community/posts/[id]/reactions/route.ts | public |
| /api/community/posts/[id]/replies | fsi-app/src/app/api/community/posts/[id]/replies/route.ts | public |
| /api/community/posts/[id] | fsi-app/src/app/api/community/posts/[id]/route.ts | public |
| /api/data/fetch-source | fsi-app/src/app/api/data/fetch-source/route.ts | requireAuth |
| /api/data/scan-all | fsi-app/src/app/api/data/scan-all/route.ts | requireAuth |
| /api/intelligence-items/[id]/metadata | fsi-app/src/app/api/intelligence-items/[id]/metadata/route.ts | requireAuth |
| /api/invitations/mine | fsi-app/src/app/api/invitations/mine/route.ts | public |
| /api/invitations/[token]/accept | fsi-app/src/app/api/invitations/[token]/accept/route.ts | public |
| /api/invitations/[token]/decline | fsi-app/src/app/api/invitations/[token]/decline/route.ts | public |
| /api/invitations/[token] | fsi-app/src/app/api/invitations/[token]/route.ts | public |
| /api/notifications/trigger | fsi-app/src/app/api/notifications/trigger/route.ts | WORKER_SECRET |
| /api/orgs | fsi-app/src/app/api/orgs/route.ts | public |
| /api/orgs/[org_id]/invitations | fsi-app/src/app/api/orgs/[org_id]/invitations/route.ts | public |
| /api/orgs/[org_id]/invitations/[id] | fsi-app/src/app/api/orgs/[org_id]/invitations/[id]/route.ts | public |
| /api/sources | fsi-app/src/app/api/sources/route.ts | requireAuth |
| /api/staged-updates | fsi-app/src/app/api/staged-updates/route.ts | requireAuth |
| /api/worker/check-sources | fsi-app/src/app/api/worker/check-sources/route.ts | WORKER_SECRET |
| /api/worker/drain-first-fetch | fsi-app/src/app/api/worker/drain-first-fetch/route.ts | WORKER_SECRET |
| /api/workspace/overrides | fsi-app/src/app/api/workspace/overrides/route.ts | requireAuth |
| /api/workspace/regulations-defaults | fsi-app/src/app/api/workspace/regulations-defaults/route.ts | requireAuth |

## Maintenance trigger

Per the 11th binding rule (Inventory-artifact emission): any commit that adds, removes, or changes the auth pattern of a route MUST update this inventory + emit `Inventory-emission:` line.

## Source files

- API routes: `fsi-app/src/app/api/**/route.ts`
- Auth patterns: `isPlatformAdmin` (admin), `WORKER_SECRET` (cron/internal), `requireAuth` (general), `public` (no gate)
