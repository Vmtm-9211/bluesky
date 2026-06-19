import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import {
  BarChart3, Building2, ClipboardList,
  Eye, EyeOff, LockKeyhole, LogIn,
  Mail, ShieldAlert, ShieldCheck, Users,
} from "lucide-react";
import { getErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";

const FEATURES = [
  { icon: Users,         text: "Full user & role management" },
  { icon: Building2,     text: "Department & budget oversight" },
  { icon: BarChart3,     text: "Advanced financial reporting" },
  { icon: ClipboardList, text: "Complete audit trail" },
];

const STATS = [
  { value: "100%", label: "Visibility" },
  { value: "RBAC", label: "Access control" },
  { value: "Live", label: "Audit trail" },
];

export default function AdminLogin() {
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShow] = useState(false);
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  if (user) return <Navigate to={user.role === "ADMIN" ? "/admin" : "/portal"} replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const signedIn = await login(email, password);
      if (signedIn.role !== "ADMIN") {
        logout();
        setError("This portal is for administrators only. Please use the Employee Portal.");
        return;
      }
      navigate("/admin", { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-bg-admin relative flex min-h-dvh w-full overflow-hidden">
      {/* ── Blobs ── */}
      <div className="login-blob login-blob-a1" aria-hidden="true" />
      <div className="login-blob login-blob-a2" aria-hidden="true" />
      <div className="login-blob login-blob-a3" aria-hidden="true" />

      {/* ── Floating geo shapes ── */}
      <div className="lp-geo" style={{ width: 58, height: 58, top: "10%",  right: "7%",  color: "#c084fc", animationDelay: "0s"   }} aria-hidden="true" />
      <div className="lp-geo" style={{ width: 34, height: 34, top: "72%",  right: "9%",  color: "#c084fc", animationDelay: "-6s"  }} aria-hidden="true" />
      <div className="lp-geo" style={{ width: 74, height: 74, top: "32%",  left: "4%",   color: "#c084fc", animationDelay: "-11s" }} aria-hidden="true" />
      <div className="lp-geo" style={{ width: 26, height: 26, bottom: "16%", left: "17%", color: "#c084fc", animationDelay: "-4s"  }} aria-hidden="true" />

      {/* ── Grid overlay (dimmer for admin) ── */}
      <div className="blue-grid pointer-events-none absolute inset-x-0 top-0 h-[28rem] opacity-20" aria-hidden="true" />

      {/* ── Content layout ── */}
      <div className="relative z-10 flex w-full items-center justify-center px-4 py-10
                      lg:grid lg:grid-cols-[1fr_480px] lg:gap-12 lg:px-14
                      xl:grid-cols-[1fr_500px] xl:gap-16 xl:px-20">

        {/* ══ LEFT: Feature showcase (desktop only) ══ */}
        <aside className="hidden lg:flex flex-col justify-center py-8 pr-4">

          {/* Logo + branding */}
          <div className="mb-9">
            <div className="relative mb-5 w-fit">
              <div className="logo-pulse-purple flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-2xl border border-purple-400/25 bg-purple-400/10 text-purple-300">
                <ShieldCheck size={32} />
              </div>
              <div className="ping-ring ping-ring-purple" />
              <div className="ping-ring ping-ring-purple ping-ring-delay" />
            </div>

            {/* Restricted badge */}
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-red-300/80">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
              Restricted Access
            </div>

            <h1 className="text-5xl font-extrabold leading-[1.1] tracking-tight xl:text-[3.5rem]">
              <span className="login-title-purple">Admin</span>
              <br />Console
            </h1>
            <p className="mt-3 max-w-[280px] text-sm leading-relaxed text-white/45">
              Manage users, approve expenses, and oversee company-wide financial operations.
            </p>
          </div>

          {/* Feature list */}
          <div className="mb-8 space-y-2.5">
            {FEATURES.map(({ icon: Icon, text }) => (
              <div key={text} className="lf-item lf-item-purple">
                <Icon size={15} className="shrink-0 text-purple-400/70" />
                <span className="text-sm text-white/60">{text}</span>
              </div>
            ))}
          </div>

          {/* Stat badges */}
          <div className="flex gap-3">
            {STATS.map(({ value, label }) => (
              <div key={label} className="lf-stat lf-stat-purple">
                <span className="text-base font-bold text-white">{value}</span>
                <span className="text-[11px] text-white/40">{label}</span>
              </div>
            ))}
          </div>
        </aside>

        {/* ══ RIGHT: Form card ══ */}
        <div className="login-card login-card-lift relative w-full max-w-[420px] overflow-hidden p-8 sm:p-10">

          {/* Scan line animation */}
          <div className="admin-scan-line" aria-hidden="true" />

          {/* Mobile logo (hidden lg+) */}
          <div className="mb-5 flex items-center gap-3 lg:hidden">
            <div className="logo-pulse-purple flex h-10 w-10 items-center justify-center rounded-xl border border-purple-400/25 bg-purple-400/10 text-purple-300">
              <ShieldCheck size={20} />
            </div>
            <span className="text-sm font-semibold text-white/60">Admin Console</span>
          </div>

          {/* Header */}
          <div className="mb-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-purple-400/70">Admin Login</p>
            <h2 className="mt-1.5 text-2xl font-bold text-white">Admin Portal</h2>
            <p className="mt-0.5 text-sm text-white/40">Restricted — administrators only</p>
          </div>

          {/* Security notice */}
          <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-purple-400/20 bg-purple-400/8 px-4 py-2.5 text-xs text-purple-200/75">
            <ShieldCheck size={14} className="shrink-0 text-purple-400" />
            This login is exclusively for admin accounts.
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
              <label className="label mb-1.5 block">Admin email</label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35"
                  size={16}
                  aria-hidden="true"
                />
                <input
                  className="login-field login-field-purple"
                  type="email"
                  placeholder="admin@bilvantis.com"
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
                  className="text-xs text-purple-400/65 transition-colors hover:text-purple-300"
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
                  className="login-field login-field-purple"
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
                  className="eye-btn-purple absolute right-3.5 top-1/2 -translate-y-1/2 text-white/35 transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              className="login-btn login-btn-admin login-btn-shimmer"
              disabled={loading}
              type="submit"
            >
              <LogIn size={17} aria-hidden="true" />
              {loading ? "Verifying…" : "Admin Sign in"}
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
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-left text-xs transition-all duration-200 hover:border-purple-400/25 hover:bg-purple-400/5 active:scale-[0.99]"
              type="button"
              onClick={() => { setEmail("admin@bilvantis.com"); setPassword("Admin@123"); }}
            >
              <span className="block font-semibold text-white/75">Admin demo</span>
              <span className="text-white/40">admin@bilvantis.com</span>
            </button>
          </div>

          {/* Switch to employee */}
          <p className="mt-6 text-center text-xs text-white/30">
            Not an admin?{" "}
            <Link
              to="/login"
              className="font-semibold text-cyan-300/75 transition-colors hover:text-cyan-300"
            >
              Employee Portal →
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
