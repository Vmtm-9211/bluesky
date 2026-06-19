import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";

const AuthContext = createContext(null);

function readStoredUser() {
  try {
    const raw = localStorage.getItem("expense_user");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    clearStoredSession();
    return null;
  }
}

function hasStoredToken() {
  try {
    return Boolean(localStorage.getItem("expense_token"));
  } catch {
    return false;
  }
}

function clearStoredSession() {
  try {
    localStorage.removeItem("expense_user");
    localStorage.removeItem("expense_token");
  } catch {
    // Browser storage can be disabled; the in-memory auth state still resets.
  }
}

function writeStoredSession(token, user) {
  try {
    localStorage.setItem("expense_token", token);
    localStorage.setItem("expense_user", JSON.stringify(user));
  } catch {
    // Keep the app usable even when localStorage is unavailable.
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser);
  const [loading, setLoading] = useState(hasStoredToken);

  useEffect(() => {
    let token = null;
    try {
      token = localStorage.getItem("expense_token");
    } catch {
      token = null;
    }
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get("/auth/me")
      .then((res) => {
        setUser(res.data);
        writeStoredSession(token, res.data);
      })
      .catch(() => logout())
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const body = new URLSearchParams();
    body.append("username", email);
    body.append("password", password);
    const res = await api.post("/auth/login", body, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    writeStoredSession(res.data.access_token, res.data.user);
    setUser(res.data.user);
    return res.data.user;
  }

  function logout() {
    clearStoredSession();
    setUser(null);
  }

  function updateUser(newUser) {
    const token = localStorage.getItem("expense_token");
    if (token) writeStoredSession(token, newUser);
    setUser(newUser);
  }

  const value = useMemo(() => ({ user, loading, login, logout, updateUser }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
