import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../api.js";

export default function Signup() {
  const [form, setForm] = useState({ name: "", email: "", password: "", domain: "Software Engineering" });
  const [error, setError] = useState("");
  const navigate = useNavigate();

  function update(key) {
    return (e) => setForm({ ...form, [key]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      const { data } = await api.post("/auth/signup", form);
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.message || "Signup failed");
    }
  }

  return (
    <div className="auth-layout">
      <div className="auth-card surface-card">
      <div className="mb-7 text-center">
        <span className="brand-mark w-10 h-10 text-sm font-black mx-auto mb-4">AI</span>
        <p className="auth-kicker mb-2">Your next strong answer</p>
        <h1 className="page-title text-2xl font-bold text-slate-900">Create account</h1>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input className="form-control w-full px-3.5 py-3 text-sm" placeholder="Full name" value={form.name} onChange={update("name")} required />
        <input className="form-control w-full px-3.5 py-3 text-sm" type="email" placeholder="Email address" value={form.email} onChange={update("email")} required />
        <input className="form-control w-full px-3.5 py-3 text-sm" type="password" placeholder="Password" value={form.password} onChange={update("password")} required />
        <select className="form-control w-full px-3.5 py-3 text-sm" value={form.domain} onChange={update("domain")}>
          <option>Software Engineering</option>
          <option>Data Science</option>
          <option>General</option>
        </select>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button className="primary-action w-full rounded-xl py-3 font-semibold text-sm">Sign up</button>
      </form>
      <p className="text-sm text-slate-500 mt-4">
        Already have an account? <Link to="/login" className="underline">Log in</Link>
      </p>
      </div>
    </div>
  );
}
