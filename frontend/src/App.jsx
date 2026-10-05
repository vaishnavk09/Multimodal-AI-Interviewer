import { useState, useEffect } from "react";
import { Routes, Route, Link, Navigate, useNavigate } from "react-router-dom";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Interview from "./pages/Interview.jsx";
import History from "./pages/History.jsx";

function isAuthed() {
  return Boolean(localStorage.getItem("token"));
}

function Protected({ children }) {
  return isAuthed() ? children : <Navigate to="/login" replace />;
}

function NavBar() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) {
      try { setUser(JSON.parse(stored)); } catch {}
    }
  }, []);

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  }

  return (
    <nav className="site-nav flex items-center justify-between px-6 py-4 sticky top-0 z-30">
      <Link to="/" className="flex items-center gap-2 text-slate-900 text-base">
        <span className="brand-mark text-xs font-black" aria-hidden="true">AI</span>
        <span className="brand-name font-bold">InterviewCoach</span>
      </Link>
      <div className="nav-links flex items-center gap-5 text-sm">
        {isAuthed() ? (
          <>
            <Link to="/" className="nav-link">New Practice</Link>
            <Link to="/history" className="nav-link">History</Link>
            {user?.name && (
              <span className="user-chip text-slate-500 text-xs border border-slate-200 px-2.5 py-1 rounded-full bg-white">
                {user.name}
              </span>
            )}
            <button
              onClick={logout}
              className="nav-cta text-xs px-3.5 py-1.5 rounded-lg font-semibold"
            >
              Log out
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className="nav-link">Login</Link>
            <Link to="/signup" className="nav-cta text-xs px-3.5 py-1.5 rounded-lg font-semibold">
              Sign up
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <div className="app-shell">
      <NavBar />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/" element={<Protected><Dashboard /></Protected>} />
        <Route path="/history" element={<Protected><History /></Protected>} />
        <Route path="/interview/:sessionId" element={<Protected><Interview /></Protected>} />
      </Routes>
    </div>
  );
}
