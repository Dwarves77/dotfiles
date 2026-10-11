export function hostFromUrl(urlOrHost) {
  const raw = String(urlOrHost || "").trim();
  if (!raw) return "";
  try {
    const u = raw.includes("://") ? new URL(raw) : new URL(`https://${raw}`);
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}
