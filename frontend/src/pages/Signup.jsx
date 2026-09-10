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
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.message || "Signup failed");
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-16 bg-white p-8 rounded-xl shadow">
      <h1 className="text-xl font-semibold mb-6">Create account</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input className="w-full border rounded px-3 py-2" placeholder="Name" value={form.name} onChange={update("name")} required />
        <input className="w-full border rounded px-3 py-2" type="email" placeholder="Email" value={form.email} onChange={update("email")} required />
        <input className="w-full border rounded px-3 py-2" type="password" placeholder="Password" value={form.password} onChange={update("password")} required />
        <select className="w-full border rounded px-3 py-2" value={form.domain} onChange={update("domain")}>
          <option>Software Engineering</option>
          <option>Data Science</option>
          <option>General</option>
        </select>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button className="w-full bg-slate-900 text-white rounded py-2">Sign up</button>
      </form>
      <p className="text-sm text-slate-500 mt-4">
        Already have an account? <Link to="/login" className="underline">Log in</Link>
      </p>
    </div>
  );
}
