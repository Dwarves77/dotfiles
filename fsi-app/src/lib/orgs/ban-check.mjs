/**
 * @param {{ from: (t: string) => any }} service  service-role Supabase client
 * @param {string} orgId
 * @param {string} userId
 * @returns {Promise<{status:"ok"}|{status:"banned"}|{status:"error",message:string}>}
 */

export async function checkOrgBan(service, orgId, userId) {
  const { data, error } = await service
    .from("org_member_bans")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { status: "error", message: error.message };
  return data ? { status: "banned" } : { status: "ok" };
}
