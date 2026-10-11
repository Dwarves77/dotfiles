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
