import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../api.js";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      const { data } = await api.post("/auth/login", { email, password });
      localStorage.setItem("token", data.token);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.message || "Login failed");
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-16 bg-white p-8 rounded-xl shadow">
      <h1 className="text-xl font-semibold mb-6">Log in</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          className="w-full border rounded px-3 py-2"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="w-full border rounded px-3 py-2"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button className="w-full bg-slate-900 text-white rounded py-2">Log in</button>
      </form>
      <p className="text-sm text-slate-500 mt-4">
        No account? <Link to="/signup" className="underline">Sign up</Link>
      </p>
    </div>
  );
}
