export function canonicalizeCitationUrl(u) {
  let s = String(u ?? "").trim().toLowerCase();
  s = s.replace(/[*`]+$/, "");
  s = s.replace(/^(https?:\/\/)www\./, "$1");
  s = s.replace(/[/.,;:]+$/, "");
  return s;
}
