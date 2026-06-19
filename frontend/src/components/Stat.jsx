export default function Stat({ label, value, tone = "lagoon", icon: Icon }) {
  const tones = {
    lagoon: {
      icon: { background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.22)", color: "#22d3ee" },
      glow: "rgba(0,212,255,0.08)",
    },
    coral: {
      icon: { background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.22)", color: "#f87171" },
      glow: "rgba(239,68,68,0.06)",
    },
    amber: {
      icon: { background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.22)", color: "#fbbf24" },
      glow: "rgba(245,158,11,0.06)",
    },
    ink: {
      icon: { background: "rgba(100,116,139,0.15)", border: "1px solid rgba(100,116,139,0.25)", color: "#94a3b8" },
      glow: "rgba(100,116,139,0.05)",
    },
  };

  const t = tones[tone] || tones.lagoon;

  return (
    <section
      className="panel p-3 sm:p-4 transition-all duration-200"
      style={{ boxShadow: `0 4px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06), 0 8px 32px ${t.glow}` }}
    >
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0">
          <p
            className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest truncate"
            style={{ color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em" }}
          >
            {label}
          </p>
          <p className="stat-value mt-1.5 sm:mt-2 leading-tight text-white">{value}</p>
        </div>
        {Icon && (
          <span
            className="flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl"
            style={t.icon}
          >
            <Icon size={18} aria-hidden="true" />
          </span>
        )}
      </div>
    </section>
  );
}
