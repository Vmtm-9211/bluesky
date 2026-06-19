import { Bell, Building2, LogOut, WalletCards } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";

export default function Layout({ children, title, actions }) {
  const { user, logout } = useAuth();
  const { currencyMode, toggleCurrency } = useCurrency();

  return (
    <div className="min-h-screen" style={{ background: "#050505" }}>
      {/* ── Top navigation bar ── */}
      <header
        className="sticky top-0 z-40 border-b border-white/5 backdrop-blur-xl"
        style={{ background: "rgba(5,5,5,0.85)" }}
      >
        <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-4 py-2.5 sm:px-5 lg:px-6">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl text-cyan-400"
              style={{
                background: "rgba(0,212,255,0.08)",
                border: "1px solid rgba(0,212,255,0.25)",
                boxShadow: "0 0 16px rgba(0,212,255,0.15)",
              }}
            >
              <WalletCards size={21} aria-hidden="true" />
            </div>
            <div>
              <p
                className="text-[10px] font-bold uppercase tracking-widest"
                style={{ color: "#00d4ff", letterSpacing: "0.15em" }}
              >
                Bilvantis
              </p>
              <h1 className="text-base font-bold text-white leading-tight">{title}</h1>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {actions}

            {/* Currency toggle */}
            <button
              className="flex h-9 items-center justify-center rounded-xl px-2 sm:px-2.5 text-xs font-bold tracking-wide transition"
              style={{
                background: currencyMode === "USD" ? "rgba(0,212,255,0.12)" : "rgba(255,255,255,0.05)",
                border: currencyMode === "USD" ? "1px solid rgba(0,212,255,0.3)" : "1px solid rgba(255,255,255,0.1)",
                color: currencyMode === "USD" ? "#22d3ee" : "rgba(255,255,255,0.6)",
              }}
              title={currencyMode === "INR" ? "Switch to USD" : "Switch to INR"}
              type="button"
              onClick={toggleCurrency}
            >
              <span className="hidden sm:inline">{currencyMode === "INR" ? "₹ INR" : "$ USD"}</span>
              <span className="sm:hidden">{currencyMode === "INR" ? "₹" : "$"}</span>
            </button>

            <button
              className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = ""; }}
              title="Alerts"
              type="button"
            >
              <Bell size={17} aria-hidden="true" />
            </button>

            <div
              className="hidden items-center gap-2 rounded-xl px-3 py-1.5 text-sm text-slate-300 sm:flex"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <Building2 size={15} className="text-cyan-400" aria-hidden="true" />
              <span>{user?.role === "ADMIN" ? "Admin" : user?.department?.name || user?.role}</span>
            </div>

            <button
              className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.1)"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.3)"; e.currentTarget.style.color = "#f87171"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = ""; }}
              title="Sign out"
              type="button"
              onClick={logout}
            >
              <LogOut size={17} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] px-4 py-4 sm:px-5 sm:py-5 lg:px-6">{children}</main>
    </div>
  );
}
