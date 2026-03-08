import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Verify the request is from an authenticated admin user.
 * Checks the Authorization: Bearer <token> header against Supabase Auth,
 * then confirms the user has role='admin' in the profiles table.
 *
 * Returns the admin user ID on success, or a NextResponse error to return.
 */
export async function requireAdmin(
  request: NextRequest
): Promise<{ userId: string } | NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: "Server not configured for auth" },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Missing Authorization header" },
      { status: 401 }
    );
  }

  const token = authHeader.slice(7);
  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  return { userId: user.id };
}

/**
 * Verify the request has a valid API key (for worker/machine-to-machine calls).
 * Checks X-API-Key header against WORKER_API_KEY env var.
 */
export async function requireApiKey(
  request: NextRequest
): Promise<true | NextResponse> {
  const apiKey = process.env.WORKER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server not configured for API key auth" },
      { status: 500 }
    );
  }

  const provided = request.headers.get("x-api-key");
  if (!provided || provided !== apiKey) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  return true;
}
