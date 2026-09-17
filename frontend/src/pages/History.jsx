import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api.js";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
} from "recharts";

export default function History() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchHistory();
  }, []);

  async function fetchHistory() {
    try {
      setLoading(true);
      const { data } = await api.get("/interview/history");
      setHistory(data.history || []);
    } catch (err) {
      console.error(err);
      setError("Failed to load interview history.");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto mt-12 text-center py-12">
        <p className="text-slate-500 font-medium">Loading session history...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto mt-12 text-center py-12">
        <p className="text-red-500 font-medium">{error}</p>
        <button
          onClick={fetchHistory}
          className="mt-4 px-4 py-2 bg-slate-800 text-white rounded text-sm hover:bg-slate-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="max-w-md mx-auto mt-16 bg-white p-8 rounded-xl shadow text-center">
        <h2 className="text-xl font-bold text-slate-800 mb-2">No Completed Sessions Yet</h2>
        <p className="text-slate-500 text-sm mb-6">
          Complete your first AI mock interview to view score progression trends and detailed dimension feedback.
        </p>
        <Link
          to="/"
          className="inline-block bg-slate-900 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-800 transition"
        >
          Start an Interview
        </Link>
      </div>
    );
  }

  // Format data for time-series trend line chart (chronological order)
  const trendData = [...history].reverse().map((session, index) => ({
    name: `Session ${index + 1}`,
    date: new Date(session.createdAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    score: session.overallScore,
    role: session.targetRole || session.domain,
  }));

  // Dimension averages comparison data (up to last 5 sessions)
  const dimensionData = history.slice(0, 5).reverse().map((session, index) => ({
    name: `S${index + 1} (${session.targetRole || "Session"})`,
    Facial: session.averages.facial,
    Speech: session.averages.speech,
    NLP: session.averages.nlp,
  }));

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Session History & Analytics</h1>
          <p className="text-slate-500 text-sm mt-1">
            Track your score progression and evaluation breakdowns over time.
          </p>
        </div>
        <Link
          to="/"
          className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 transition"
        >
          New Interview
        </Link>
      </div>

      {/* Analytics Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Overall Score Trend */}
        <div className="bg-white p-6 rounded-xl shadow border border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Overall Score Trend</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
                <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={12} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#0f172a"
                  strokeWidth={3}
                  dot={{ r: 5, fill: "#0f172a" }}
                  activeDot={{ r: 7 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Multimodal Dimension Breakdown */}
        <div className="bg-white p-6 rounded-xl shadow border border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">
            Dimension Breakdown (Facial / Speech / NLP)
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dimensionData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={12} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Facial" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Speech" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="NLP" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Completed Sessions List */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-800">Past Sessions ({history.length})</h2>
        <div className="space-y-4">
          {history.map((session) => (
            <div
              key={session.sessionId}
              className="bg-white p-6 rounded-xl shadow border border-slate-100 text-left space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                <div>
                  <h3 className="font-semibold text-slate-900 text-base">
                    {session.targetRole || session.domain}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {session.domain} • {session.experienceLevel} •{" "}
                    {new Date(session.createdAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <div className="text-right">
                  <span className="inline-block bg-slate-900 text-white font-bold px-3 py-1 rounded-full text-sm">
                    Score: {session.overallScore}/100
                  </span>
                </div>
              </div>

              {/* Dimension pill indicators */}
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="bg-blue-50 text-blue-700 font-medium px-2.5 py-1 rounded">
                  Facial: {session.averages.facial}/100
                </span>
                <span className="bg-emerald-50 text-emerald-700 font-medium px-2.5 py-1 rounded">
                  Speech: {session.averages.speech}/100
                </span>
                <span className="bg-purple-50 text-purple-700 font-medium px-2.5 py-1 rounded">
                  NLP Relevance: {session.averages.nlp}/100
                </span>
              </div>

              {/* Guidance advice */}
              {session.guidance && (
                <div className="bg-slate-50 p-3 rounded-lg text-xs text-slate-700">
                  <span className="font-semibold text-slate-900">Key Recommendation: </span>
                  {session.guidance}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
