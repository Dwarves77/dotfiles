// logic.ts for GET /api/dashboard/coverage/matrix (lane COV-1, 2026-10-08). Route files export only handlers (F34), so the
// handler body lives here and takes its collaborators as arguments: the route test drives it with stubs.
//
// WHAT THE ROUTE SERVES. The generated Coverage matrix, three ways, all from the one loader:
//   ?format=csv              the export, a CSV with provenance as columns (Blob download convention client side)
//   ?summary=1               totals and the per-data-class numerators and denominators only (the portfolio-add line)
//   (default)                the whole matrix as JSON
// Axes ride as ?mode=&data_class=&geography= and only shape the CSV rows.
//
// AGGREGATES ONLY: counts per cell. No catalogue entry (title, identifier, URL) is reachable here (operator ruling
// 2026-07-29 keeps those admin-only). Authenticated like every route; the caller is rate-limited by the guard.

import { NextRequest, NextResponse } from "next/server";
import { requireUserRoute, isRefusal, type UserRouteDeps } from "@/lib/api/route-guard";
import { rateLimitHeaders } from "@/lib/api/rate-limit";
import { csvFilename, matrixToCsv, parseCoverageQuery } from "@/lib/coverage/coverage-matrix.mjs";

export interface MatrixRouteDeps extends UserRouteDeps {
  loadMatrix: () => Promise<{ matrix: Parameters<typeof matrixToCsv>[0]; error: string | null }>;
}

export async function handleMatrixRequest(request: NextRequest, deps: MatrixRouteDeps): Promise<NextResponse> {
  const user = await requireUserRoute(request, deps);
  if (isRefusal(user)) return user;
  const headers = rateLimitHeaders(user.userId);

  const { matrix, error } = await deps.loadMatrix();
  if (error) {
    // An outage is a 503 the client can retry, never an empty matrix that reads as "nothing catalogued".
    return NextResponse.json({ error }, { status: 503, headers });
  }

  const params = request.nextUrl.searchParams;
  const query = parseCoverageQuery(params);

  if (params.get("format") === "csv") {
    return new NextResponse(matrixToCsv(matrix, query), {
      status: 200,
      headers: {
        ...headers,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${csvFilename(matrix, query)}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  }

  if (params.get("summary") === "1") {
    return NextResponse.json(
      {
        version: matrix.version,
        generatedAt: matrix.generatedAt,
        dataAsOf: matrix.dataAsOf,
        totals: matrix.totals,
        verifiedBriefs: matrix.verifiedBriefs,
        dataClasses: matrix.dataClasses,
      },
      { headers: { ...headers, "Cache-Control": "private, max-age=60" } }
    );
  }

  return NextResponse.json({ matrix }, { headers: { ...headers, "Cache-Control": "private, max-age=60" } });
}
