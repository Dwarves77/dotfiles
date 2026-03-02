"use client";

export function AmbientOrbs() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      <div className="orb orb-1" style={{ top: "-5%", left: "-10%" }} />
      <div className="orb orb-2" style={{ top: "40%", right: "-8%" }} />
      <div className="orb orb-3" style={{ bottom: "-5%", left: "30%" }} />
    </div>
  );
}
