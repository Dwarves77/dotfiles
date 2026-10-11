export function isServiceSupabaseConfigured(): boolean {
  return !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}
