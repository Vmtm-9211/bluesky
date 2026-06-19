import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import {
  BarChart3, CheckCircle2, Eye, EyeOff,
  LockKeyhole, LogIn, Mail, ScanLine,
  ShieldAlert, TrendingUp, WalletCards,
} from "lucide-react";
import { getErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";

const FEATURES = [
  { icon: WalletCards,  text: "Submit and track expense claims" },
  { icon: ScanLine,     text: "AI-powered receipt scanning" },
  { icon: TrendingUp,   text: "Real-time budget visibility" },
  { icon: CheckCircle2, text: "Fast multi-level approvals" },
];

const STATS = [
  { value: "500+", label: "Employees" },
  { value: "12",   label: "Departments" },
  { value: "24/7", label: "Access" },
];

export default function UserLogin() {
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [showPassword, setShow]     = useState(false);
  const [error, setError]           = useState("");
  const [loading, setLoading]       = useState(false);

  if (user) return <Navigate to={user.role === "ADMIN" ? "/admin" : "/portal"} replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const signedIn = await login(email, password);
      if (signedIn.role === "ADMIN") {
        logout();
        setError("Admin accounts must use the Admin Portal, not the Employee Portal.");
        return;
      }
      navigate("/portal", { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-bg relative flex min-h-dvh w-full overflow-hidden">
      {/* ── Blobs ── */}
      <div className="login-blob login-blob-1" aria-hidden="true" />
      <div className="login-blob login-blob-2" aria-hidden="true" />
      <div className="login-blob login-blob-3" aria-hidden="true" />

      {/* ── Floating geo shapes ── */}
      <div className="lp-geo" style={{ width: 62, height: 62, top: "14%", left: "7%",  color: "#00d4ff", animationDelay: "0s"   }} aria-hidden="true" />
      <div className="lp-geo" style={{ width: 38, height: 38, top: "68%", left: "11%", color: "#00d4ff", animationDelay: "-5s"  }} aria-hidden="true" />
      <div className="lp-geo" style={{ width: 82, height: 82, top: "28%", right: "5%", color: "#00d4ff", animationDelay: "-9s"  }} aria-hidden="true" />
      <div className="lp-geo" style={{ width: 28, height: 28, bottom: "18%", right: "13%", color: "#00d4ff", animationDelay: "-3s" }} aria-hidden="true" />

      {/* ── Grid overlay ── */}
      <div className="blue-grid pointer-events-none absolute inset-x-0 top-0 h-[28rem] opacity-40" aria-hidden="true" />

      {/* ── Content layout ── */}
      <div className="relative z-10 flex w-full items-center justify-center px-4 py-10
                      lg:grid lg:grid-cols-[1fr_480px] lg:gap-12 lg:px-14
                      xl:grid-cols-[1fr_500px] xl:gap-16 xl:px-20">

        {/* ══ LEFT: Feature showcase (desktop only) ══ */}
        <aside className="hidden lg:flex flex-col justify-center py-8 pr-4">

          {/* Logo + branding */}
          <div className="mb-9">
            <div className="relative mb-5 w-fit">
              <div className="logo-pulse-cyan flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-400/10 text-cyan-300">
                <WalletCards size={32} />
              </div>
              <div className="ping-ring ping-ring-cyan" />
              <div className="ping-ring ping-ring-cyan ping-ring-delay" />
            </div>

            <h1 className="text-5xl font-extrabold leading-[1.1] tracking-tight xl:text-[3.5rem]">
              <span className="login-title-cyan">Employee</span>
              <br />Portal
            </h1>
            <p className="mt-3 max-w-[280px] text-sm leading-relaxed text-white/45">
              Access your expense dashboard, submit claims, and track approvals in real time.
            </p>
          </div>

          {/* Feature list */}
          <div className="mb-8 space-y-2.5">
            {FEATURES.map(({ icon: Icon, text }) => (
              <div key={text} className="lf-item lf-item-cyan">
                <Icon size={15} className="shrink-0 text-cyan-400/70" />
                <span className="text-sm text-white/60">{text}</span>
              </div>
            ))}
          </div>

          {/* Stat badges */}
          <div className="flex gap-3">
            {STATS.map(({ value, label }) => (
              <div key={label} className="lf-stat lf-stat-cyan">
                <span className="text-lg font-bold text-white">{value}</span>
                <span className="text-[11px] text-white/40">{label}</span>
              </div>
            ))}
          </div>
        </aside>

        {/* ══ RIGHT: Form card ══ */}
        <div className="login-card login-card-lift relative w-full max-w-[420px] overflow-hidden p-8 sm:p-10">

          {/* Mobile logo (hidden lg+) */}
          <div className="mb-5 flex items-center gap-3 lg:hidden">
            <div className="logo-pulse-cyan flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/25 bg-cyan-400/10 text-cyan-300">
              <WalletCards size={20} />
            </div>
            <span className="text-sm font-semibold text-white/60">Employee Portal</span>
          </div>

          {/* Header */}
          <div className="mb-7">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-400/70">Employee Login</p>
            <h2 className="mt-1.5 text-2xl font-bold text-white">Sign in</h2>
            <p className="mt-0.5 text-sm text-white/40">Access your expense workspace</p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              <ShieldAlert size={15} className="shrink-0 text-rose-400" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label className="label mb-1.5 block">Email address</label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35"
                  size={16}
                  aria-hidden="true"
                />
                <input
                  className="login-field login-field-cyan"
                  type="email"
                  placeholder="you@bilvantis.com"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="label">Password</label>
                <Link
                  to="/forgot-password"
                  className="text-xs text-cyan-400/65 transition-colors hover:text-cyan-300"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <LockKeyhole
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35"
                  size={16}
                  aria-hidden="true"
                />
                <input
                  className="login-field login-field-cyan"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  style={{ paddingRight: "3rem" }}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="eye-btn-cyan absolute right-3.5 top-1/2 -translate-y-1/2 text-white/35 transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              className="login-btn login-btn-user login-btn-shimmer"
              disabled={loading}
              type="submit"
            >
              <LogIn size={17} aria-hidden="true" />
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          {/* Demo access */}
          <div className="mt-6">
            <div className="mb-3 flex items-center gap-3">
              <div className="h-px flex-1 bg-white/8" />
              <span className="text-[10px] uppercase tracking-widest text-white/25">Quick demo</span>
              <div className="h-px flex-1 bg-white/8" />
            </div>
            <button
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-left text-xs transition-all duration-200 hover:border-cyan-400/25 hover:bg-cyan-400/5 active:scale-[0.99]"
              type="button"
              onClick={() => { setEmail("employee@bilvantis.com"); setPassword("User@123"); }}
            >
              <span className="block font-semibold text-white/75">Employee demo</span>
              <span className="text-white/40">employee@bilvantis.com</span>
            </button>
          </div>

          {/* Switch to admin */}
          <p className="mt-6 text-center text-xs text-white/30">
            Are you an administrator?{" "}
            <Link
              to="/admin-login"
              className="font-semibold text-purple-300/75 transition-colors hover:text-purple-300"
            >
              Admin Portal →
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
