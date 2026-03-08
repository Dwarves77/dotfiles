import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export type AuthResult =
  | { ok: true; userId: string; role: string }
  | { ok: false; response: NextResponse };

// Verify user from Authorization header (Bearer token) or API key
export async function requireAuth(
  req: NextRequest,
  requiredRole: "admin" | "viewer" = "viewer"
): Promise<AuthResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = process.env.FSI_API_KEY;

  // API key auth (for worker/cron calls)
  const reqApiKey = req.headers.get("x-api-key");
  if (apiKey && reqApiKey === apiKey) {
    return { ok: true, userId: "api-key", role: "admin" };
  }

  if (!url || !serviceKey) {
    // When Supabase not configured, allow all (dev mode)
    return { ok: true, userId: "dev", role: "admin" };
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const token = authHeader.slice(7);
  const supabase = createClient(url, serviceKey);

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid token" }, { status: 401 }),
    };
  }

  // Look up role from profiles table
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role || "viewer";

  if (requiredRole === "admin" && role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, userId: user.id, role };
}
