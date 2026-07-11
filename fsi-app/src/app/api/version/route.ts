import { NextResponse } from "next/server";

/**
 * GET /api/version — deployed build identity (V-09, 2026-07-11).
 *
 * PUBLIC / UNAUTHENTICATED BY DESIGN. Justification (per the API Security Policy's
 * "unauthenticated public routes require explicit justification"): this returns only the
 * deployed git commit SHA + ref — non-sensitive build metadata that is already embedded in the
 * shipped client bundle. It exposes no user, workspace, or database data. Its purpose is to let
 * audits and smoke checks anchor a live deployment to a git ref (e.g. confirm prod == 71bcbd4)
 * without guessing from the dashboard. Reads only Vercel's build-time env vars.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    ref: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    repo: process.env.VERCEL_GIT_REPO_SLUG ?? null,
    env: process.env.VERCEL_ENV ?? null,
  });
}
