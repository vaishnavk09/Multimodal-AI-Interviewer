import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api.js";

export default function Dashboard() {
  const [domain, setDomain] = useState("Software Engineering");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function startInterview() {
    setLoading(true);
    try {
      const { data } = await api.post("/interview/start", { domain });
      navigate(`/interview/${data.sessionId}`, { state: { firstQuestion: data.question } });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto mt-16 bg-white p-8 rounded-xl shadow text-center">
      <h1 className="text-xl font-semibold mb-2">Start a mock interview</h1>
      <p className="text-slate-500 mb-6">Pick a domain and begin your session.</p>
      <select
        className="w-full border rounded px-3 py-2 mb-4"
        value={domain}
        onChange={(e) => setDomain(e.target.value)}
      >
        <option>Software Engineering</option>
        <option>Data Science</option>
        <option>General</option>
      </select>
      <button
        onClick={startInterview}
        disabled={loading}
        className="w-full bg-slate-900 text-white rounded py-2 disabled:opacity-50"
      >
        {loading ? "Starting..." : "Start interview"}
      </button>
    </div>
  );
}
