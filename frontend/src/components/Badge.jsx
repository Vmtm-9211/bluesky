export default function Badge({ children, tone = "slate" }) {
  const tones = {
    slate: { background: "rgba(100,116,139,0.2)", color: "#94a3b8", border: "1px solid rgba(100,116,139,0.3)" },
    green: { background: "rgba(16,185,129,0.1)", color: "#34d399", border: "1px solid rgba(16,185,129,0.3)" },
    red:   { background: "rgba(239,68,68,0.1)",  color: "#f87171", border: "1px solid rgba(239,68,68,0.3)" },
    amber: { background: "rgba(245,158,11,0.1)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.3)" },
    blue:  { background: "rgba(14,165,233,0.1)", color: "#38bdf8", border: "1px solid rgba(14,165,233,0.3)" },
  };

  const s = tones[tone] || tones.slate;

  return (
    <span
      className="inline-block rounded-md px-2 py-0.5 text-xs font-semibold"
      style={s}
    >
      {children}
    </span>
  );
}
