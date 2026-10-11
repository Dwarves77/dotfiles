const ELI_MAP = { reg: "R", dir: "L", dec: "D" };

export function deriveKey(instr, src) {
  const i = instr || "";
  const u = src || "";
  let m;
  // (1) CELEX in instrument_identifier — WITH optional OJ sequence suffix '(NN)' (migration 255)
  m = i.match(/([1-9]\d{4}[A-Z]\d{4})\((\d{1,2})\)/);
  if (m) return m[1].toUpperCase() + "(" + m[2].padStart(2, "0") + ")";
  m = i.match(/([1-9]\d{4}[A-Z]\d{4})/);
  if (m) return m[1].toUpperCase();
  // (2) ELI path in instrument_identifier
  m = i.match(/^eli\/(reg|dir|dec)\/(\d{4})\/(\d+)/);
  if (m) return "3" + m[2] + ELI_MAP[m[1]] + m[3].padStart(4, "0");
  // (3) CELEX in source_url — parens may be literal or URL-encoded %28/%29 (migration 255)
  m = u.match(/CELEX(?::|%3[Aa])?([1-9]\d{4}[A-Z]\d{4})(?:\(|%28)(\d{1,2})(?:\)|%29)/);
  if (m) return m[1].toUpperCase() + "(" + m[2].padStart(2, "0") + ")";
  m = u.match(/CELEX(?::|%3[Aa])?([1-9]\d{4}[A-Z]\d{4})/);
  if (m) return m[1].toUpperCase();
  // (4) ELI path in source_url
  m = u.match(/\/eli\/(reg|dir|dec)\/(\d{4})\/(\d+)/);
  if (m) return "3" + m[2] + ELI_MAP[m[1]] + m[3].padStart(4, "0");
  return null;
}
