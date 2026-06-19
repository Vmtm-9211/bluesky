import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle, Eye, EyeOff, KeyRound, LockKeyhole, Mail, RefreshCw, ShieldCheck, WalletCards } from "lucide-react";
import { api, getErrorMessage } from "../api/client";

function Requirement({ met, text }) {
  return (
    <div className={`flex items-center gap-1.5 text-xs transition-colors duration-150 ${met ? "text-emerald-400" : "text-white/35"}`}>
      <span className="w-3 text-center">{met ? "✓" : "○"}</span>
      {text}
    </div>
  );
}

function checkPassword(pwd) {
  return {
    minLength: pwd.length >= 8,
    hasLetter: /[A-Za-z]/.test(pwd),
    hasNumber: /\d/.test(pwd),
    hasSpecial: /[!@#$%^&*()\-_=+[\]{};:'",.<>/?\\|`~]/.test(pwd),
  };
}

function strengthLabel(checks) {
  const count = Object.values(checks).filter(Boolean).length;
  if (count <= 1) return { label: "Weak", color: "bg-rose-500" };
  if (count === 2) return { label: "Fair", color: "bg-amber-500" };
  if (count === 3) return { label: "Good", color: "bg-yellow-400" };
  return { label: "Strong", color: "bg-emerald-500" };
}

export default function ForgotPassword() {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const checks = checkPassword(newPassword);
  const allChecksMet = Object.values(checks).every(Boolean);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const { label: strengthText, color: strengthColor } = strengthLabel(checks);
  const strengthPercent = (Object.values(checks).filter(Boolean).length / 4) * 100;

  async function handleRequestOtp(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/password-reset/request", { email });
      setStep(2);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function resendOtp() {
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/password-reset/request", { email });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e) {
    e.preventDefault();
    if (!allChecksMet) {
      setError("Password does not meet all requirements.");
      return;
    }
    if (!passwordsMatch) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/password-reset/confirm", {
        email,
        otp_code: otp,
        new_password: newPassword,
      });
      setSuccess(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen" style={{ background: "#050505" }}>
      {/* ── Left branding panel (hidden on mobile) ── */}
      <div
        className="hidden lg:flex lg:w-[42%] xl:w-[45%] flex-col justify-between p-12 xl:p-16"
        style={{
          background: "linear-gradient(135deg, rgba(0,140,149,0.12), rgba(8,145,178,0.08), rgba(109,40,217,0.06))",
          borderRight: "1px solid rgba(0,212,255,0.1)",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl text-cyan-400"
            style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.25)", boxShadow: "0 0 16px rgba(0,212,255,0.15)" }}
          >
            <WalletCards size={21} aria-hidden="true" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#00d4ff" }}>Bilvantis</p>
            <p className="text-base font-bold text-white leading-tight">Finance Command Center</p>
          </div>
        </div>

        <div>
          <h2 className="text-3xl xl:text-4xl font-bold text-white leading-snug">
            Secure account<br />recovery
          </h2>
          <p className="mt-4 text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
            We'll send a one-time code to your registered email so you can securely reset your password.
          </p>
          <div className="mt-8 space-y-3">
            {[
              "OTP expires in 10 minutes",
              "Passwords must meet complexity rules",
              "Previous passwords cannot be reused",
            ].map((tip) => (
              <div key={tip} className="flex items-center gap-3">
                <ShieldCheck size={15} style={{ color: "#22d3ee" }} />
                <span className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>{tip}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>© 2026 Bilvantis. All rights reserved.</p>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
      <div className="w-full max-w-[440px] mx-auto">
        {success ? (
          /* ── Success state ── */
          <div className="py-4 text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/10 text-emerald-400">
              <CheckCircle size={32} />
            </div>
            <h2 className="text-2xl font-bold text-white">Password reset!</h2>
            <p className="mt-2 text-sm text-white/45">Your password has been updated successfully. You can now sign in with your new password.</p>
            <Link
              to="/login"
              className="login-btn login-btn-user mt-6 block"
            >
              Back to Sign in
            </Link>
          </div>
        ) : step === 1 ? (
          /* ── Step 1: Request OTP ── */
          <>
            <Link
              to="/login"
              className="mb-6 inline-flex items-center gap-1.5 text-xs text-white/40 transition-colors hover:text-white/70"
            >
              <ArrowLeft size={13} /> Back to sign in
            </Link>

            <div className="mb-7">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300">
                <KeyRound size={22} />
              </div>
              <h2 className="text-2xl font-bold text-white">Forgot password?</h2>
              <p className="mt-1 text-sm text-white/40">
                Enter your email and we'll send a one-time code to reset your password.
              </p>
            </div>

            {error && (
              <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                <span className="text-rose-400">⚠</span> {error}
              </div>
            )}

            <form onSubmit={handleRequestOtp} className="space-y-5">
              <div>
                <label className="label mb-1.5 block">Email address</label>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35"
                    size={16}
                    aria-hidden="true"
                  />
                  <input
                    className="login-field"
                    type="email"
                    placeholder="you@company.com"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>
              <button className="login-btn login-btn-user" disabled={loading} type="submit">
                <Mail size={16} aria-hidden="true" />
                {loading ? "Sending OTP…" : "Send OTP"}
              </button>
            </form>
          </>
        ) : (
          /* ── Step 2: Enter OTP + new password ── */
          <>
            <button
              type="button"
              onClick={() => { setStep(1); setError(""); setOtp(""); setNewPassword(""); setConfirmPassword(""); }}
              className="mb-6 inline-flex items-center gap-1.5 text-xs text-white/40 transition-colors hover:text-white/70"
            >
              <ArrowLeft size={13} /> Change email
            </button>

            <div className="mb-6">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300">
                <LockKeyhole size={22} />
              </div>
              <h2 className="text-2xl font-bold text-white">Reset password</h2>
              <p className="mt-1 text-sm text-white/40">
                OTP sent to{" "}
                <span className="text-cyan-400/80 font-medium">{email}</span>
              </p>
            </div>

            {error && (
              <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                <span className="text-rose-400">⚠</span> {error}
              </div>
            )}

            <form onSubmit={handleReset} className="space-y-4">
              {/* OTP */}
              <div>
                <label className="label mb-1.5 block">6-digit OTP</label>
                <input
                  className="login-field font-mono text-lg tracking-[0.35em]"
                  type="text"
                  inputMode="numeric"
                  placeholder="000000"
                  maxLength={6}
                  required
                  style={{ paddingLeft: "0.875rem", textAlign: "center" }}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
              </div>

              {/* New password */}
              <div>
                <label className="label mb-1.5 block">New password</label>
                <div className="relative">
                  <LockKeyhole
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35"
                    size={16}
                    aria-hidden="true"
                  />
                  <input
                    className="login-field"
                    type={showNew ? "text" : "password"}
                    placeholder="Create a strong password"
                    autoComplete="new-password"
                    required
                    style={{ paddingRight: "3rem" }}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew((s) => !s)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/35 transition-colors hover:text-white/70"
                    aria-label={showNew ? "Hide password" : "Show password"}
                  >
                    {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>

                {/* Strength bar + requirements */}
                {newPassword.length > 0 && (
                  <div className="mt-2.5">
                    <div className="mb-1.5 flex items-center justify-between">
                      <div className="h-1.5 flex-1 rounded-full bg-white/10 overflow-hidden mr-3">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${strengthColor}`}
                          style={{ width: `${strengthPercent}%` }}
                        />
                      </div>
                      <span className={`text-xs font-semibold ${strengthPercent === 100 ? "text-emerald-400" : strengthPercent >= 75 ? "text-yellow-400" : strengthPercent >= 50 ? "text-amber-500" : "text-rose-400"}`}>
                        {strengthText}
                      </span>
                    </div>
                    <div className="rounded-xl border border-white/8 bg-white/3 p-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      <Requirement met={checks.minLength} text="8+ characters" />
                      <Requirement met={checks.hasLetter} text="Letters (a–z, A–Z)" />
                      <Requirement met={checks.hasNumber} text="Numbers (0–9)" />
                      <Requirement met={checks.hasSpecial} text="Special chars (!@#...)" />
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm password */}
              <div>
                <label className="label mb-1.5 block">Confirm new password</label>
                <div className="relative">
                  <LockKeyhole
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35"
                    size={16}
                    aria-hidden="true"
                  />
                  <input
                    className="login-field"
                    type={showConfirm ? "text" : "password"}
                    placeholder="Repeat your password"
                    autoComplete="new-password"
                    required
                    style={{ paddingRight: "3rem" }}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((s) => !s)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/35 transition-colors hover:text-white/70"
                    aria-label={showConfirm ? "Hide" : "Show"}
                  >
                    {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {confirmPassword.length > 0 && (
                  <p className={`mt-1.5 text-xs ${passwordsMatch ? "text-emerald-400" : "text-rose-400"}`}>
                    {passwordsMatch ? "✓ Passwords match" : "✗ Passwords do not match"}
                  </p>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={loading}
                  onClick={resendOtp}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-white/12 bg-white/5 px-4 py-3 text-sm text-white/55 transition-colors hover:bg-white/10 hover:text-white/80 disabled:opacity-40"
                >
                  <RefreshCw size={14} aria-hidden="true" />
                  Resend
                </button>
                <button
                  className="login-btn login-btn-user flex-1"
                  disabled={loading || !allChecksMet || !passwordsMatch || otp.length !== 6}
                  type="submit"
                >
                  <LockKeyhole size={16} aria-hidden="true" />
                  {loading ? "Resetting…" : "Reset password"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
      </div>
    </div>
  );
}
