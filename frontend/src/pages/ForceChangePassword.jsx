import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { CheckCircle2, KeyRound, LockKeyhole, ShieldAlert } from "lucide-react";
import { api, getErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import Layout from "../components/Layout";

function checkPassword(v) {
  return {
    minLength: v.length >= 8,
    hasLetter: /[A-Za-z]/.test(v),
    hasNumber: /\d/.test(v),
    hasSpecial: /[!@#$%^&*()\-_=+[\]{};:'",.<>/?\\|`~]/.test(v),
  };
}

function Requirement({ ok, label }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span style={{ color: ok ? "#34d399" : "rgba(255,255,255,0.3)" }}>
        {ok ? "✓" : "○"}
      </span>
      <span style={{ color: ok ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.3)" }}>{label}</span>
    </div>
  );
}

export default function ForceChangePassword() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();

  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  if (!user) return <Navigate to="/login" replace />;
  if (!user.must_change_password) return <Navigate to={user.role === "ADMIN" ? "/admin" : "/portal"} replace />;

  const reqs = checkPassword(newPwd);
  const allReqsMet = Object.values(reqs).every(Boolean);
  const matches = newPwd && newPwd === confirmPwd;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!allReqsMet || !matches) return;
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/change-password", {
        current_password: currentPwd,
        new_password: newPwd,
      });
      const meRes = await api.get("/auth/me");
      updateUser(meRes.data);
      setDone(true);
      setTimeout(() => navigate(user.role === "ADMIN" ? "/admin" : "/portal", { replace: true }), 1800);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout title="Set Your Password">
      <div className="flex min-h-[calc(100vh-64px)] items-center justify-center px-4 py-10">
        <div
          className="w-full max-w-md rounded-2xl p-5 sm:p-8"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(16px)" }}
        >
          {done ? (
            <div className="flex flex-col items-center py-6 text-center">
              <CheckCircle2 size={48} style={{ color: "#34d399" }} className="mb-4" />
              <h2 className="text-xl font-bold text-white">Password Updated</h2>
              <p className="mt-2 text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
                Redirecting you to your dashboard…
              </p>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <div
                  className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl"
                  style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.2)" }}
                >
                  <KeyRound size={22} style={{ color: "#22d3ee" }} />
                </div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: "rgba(0,212,255,0.7)" }}>
                  Required Action
                </p>
                <h2 className="mt-1 text-2xl font-bold text-white">Set Your Password</h2>
                <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
                  You must change your temporary password before continuing.
                </p>
              </div>

              {error && (
                <div
                  className="mb-4 flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm"
                  style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}
                >
                  <ShieldAlert size={15} className="shrink-0" />
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label mb-1.5 block">Current (temporary) password</label>
                  <div className="relative">
                    <LockKeyhole
                      size={15}
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"
                      style={{ color: "rgba(255,255,255,0.35)" }}
                      aria-hidden="true"
                    />
                    <input
                      className="field"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={currentPwd}
                      onChange={(e) => setCurrentPwd(e.target.value)}
                      placeholder="Your temporary password"
                      style={{ paddingLeft: "2.5rem" }}
                    />
                  </div>
                </div>

                <div>
                  <label className="label mb-1.5 block">New password</label>
                  <div className="relative">
                    <LockKeyhole
                      size={15}
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"
                      style={{ color: "rgba(255,255,255,0.35)" }}
                      aria-hidden="true"
                    />
                    <input
                      className="field"
                      type="password"
                      autoComplete="new-password"
                      required
                      value={newPwd}
                      onChange={(e) => setNewPwd(e.target.value)}
                      placeholder="Minimum 8 characters"
                      style={{ paddingLeft: "2.5rem" }}
                    />
                  </div>
                  {newPwd && (
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1 rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <Requirement ok={reqs.minLength} label="8+ characters" />
                      <Requirement ok={reqs.hasLetter} label="Letter" />
                      <Requirement ok={reqs.hasNumber} label="Number" />
                      <Requirement ok={reqs.hasSpecial} label="Special character" />
                    </div>
                  )}
                </div>

                <div>
                  <label className="label mb-1.5 block">Confirm new password</label>
                  <div className="relative">
                    <LockKeyhole
                      size={15}
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"
                      style={{ color: "rgba(255,255,255,0.35)" }}
                      aria-hidden="true"
                    />
                    <input
                      className="field"
                      type="password"
                      autoComplete="new-password"
                      required
                      value={confirmPwd}
                      onChange={(e) => setConfirmPwd(e.target.value)}
                      placeholder="Repeat new password"
                      style={{
                        paddingLeft: "2.5rem",
                        borderColor: confirmPwd
                          ? matches
                            ? "rgba(52,211,153,0.4)"
                            : "rgba(239,68,68,0.4)"
                          : undefined,
                      }}
                    />
                  </div>
                  {confirmPwd && !matches && (
                    <p className="mt-1 text-xs" style={{ color: "#f87171" }}>Passwords do not match</p>
                  )}
                </div>

                <button
                  className="btn-primary w-full mt-2"
                  disabled={loading || !allReqsMet || !matches}
                  type="submit"
                >
                  <KeyRound size={17} aria-hidden="true" />
                  {loading ? "Saving…" : "Set new password"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
