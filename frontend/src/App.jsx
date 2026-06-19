import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { CurrencyProvider } from "./context/CurrencyContext";
import AdminDashboard from "./pages/AdminDashboard";
import AdminLogin from "./pages/AdminLogin";
import ForgotPassword from "./pages/ForgotPassword";
import ForceChangePassword from "./pages/ForceChangePassword";
import UserDashboard from "./pages/UserDashboard";
import UserLogin from "./pages/UserLogin";

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-sm text-slate-500">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.must_change_password) return <Navigate to="/change-password" replace />;
  return <Navigate to={user.role === "ADMIN" ? "/admin" : "/portal"} replace />;
}

function ProtectedRoute({ role, children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-sm text-slate-500">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.must_change_password) return <Navigate to="/change-password" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <CurrencyProvider>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/login" element={<UserLogin />} />
        <Route path="/admin-login" element={<AdminLogin />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/change-password" element={<ForceChangePassword />} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute role="ADMIN">
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal"
          element={
            <ProtectedRoute role="USER">
              <UserDashboard />
            </ProtectedRoute>
          }
        />
      </Routes>
    </CurrencyProvider>
  );
}
