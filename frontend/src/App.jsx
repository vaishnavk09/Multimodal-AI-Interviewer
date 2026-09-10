import { Routes, Route, Link, Navigate } from "react-router-dom";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Interview from "./pages/Interview.jsx";

function isAuthed() {
  return Boolean(localStorage.getItem("token"));
}

function Protected({ children }) {
  return isAuthed() ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="flex items-center justify-between px-6 py-4 bg-white shadow-sm">
        <Link to="/" className="font-semibold text-slate-800">
          Multimodal AI Interviewer
        </Link>
        <div className="space-x-4 text-sm">
          <Link to="/login" className="text-slate-600 hover:text-slate-900">
            Login
          </Link>
          <Link to="/signup" className="text-slate-600 hover:text-slate-900">
            Sign up
          </Link>
        </div>
      </nav>

      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route
          path="/"
          element={
            <Protected>
              <Dashboard />
            </Protected>
          }
        />
        <Route
          path="/interview/:sessionId"
          element={
            <Protected>
              <Interview />
            </Protected>
          }
        />
      </Routes>
    </div>
  );
}
