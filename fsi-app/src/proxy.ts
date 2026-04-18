import { NextResponse, type NextRequest } from "next/server";

// TEMP: password gate disabled — all routes pass straight through to the app.
// Restore the Supabase auth check + /login redirect when re-enabling.
export async function proxy(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
