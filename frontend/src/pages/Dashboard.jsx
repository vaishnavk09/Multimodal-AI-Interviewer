import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../api.js";

export default function Dashboard() {
  const [domain, setDomain] = useState("Software Engineering");
  const [targetRole, setTargetRole] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("Fresher");
  const [jobDescription, setJobDescription] = useState("");
  const [resumeFile, setResumeFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState(null);
  const [recentSessions, setRecentSessions] = useState([]);
  const navigate = useNavigate();

  // Load profile on mount from localStorage first (instant), then refresh from server
  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) {
      try {
        const u = JSON.parse(stored);
        setProfile(u);
        if (u.domain) setDomain(u.domain);
        if (u.targetRole) setTargetRole(u.targetRole);
        if (u.experienceLevel) setExperienceLevel(u.experienceLevel);
      } catch {}
    }
    // Fetch full profile + recent sessions from server
    fetchProfile();
    fetchRecentSessions();
  }, []);

  async function fetchProfile() {
    try {
      const { data } = await api.get("/auth/me");
      setProfile(data);
      localStorage.setItem("user", JSON.stringify(data));
      if (data.domain) setDomain(data.domain);
      if (data.targetRole) setTargetRole(data.targetRole);
      if (data.experienceLevel) setExperienceLevel(data.experienceLevel);
    } catch (err) {
      console.warn("[Dashboard] Failed to fetch profile:", err.message);
    }
  }

  async function fetchRecentSessions() {
    try {
      const { data } = await api.get("/interview/history");
      setRecentSessions((data.history || []).slice(0, 3));
    } catch {}
  }

  async function startInterview(e) {
    e.preventDefault();
    setLoading(true);
    setUploadStatus("");
    try {
      if (resumeFile) {
        setUploadStatus("Uploading & parsing resume...");
        const formData = new FormData();
        formData.append("resume", resumeFile);
        await api.post("/interview/resume", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }

      setUploadStatus("Generating your first question with AI...");
      const { data } = await api.post("/interview/start", {
        domain,
        targetRole,
        experienceLevel,
        jobDescription,
      });

      navigate(`/interview/${data.sessionId}`, {
        state: { firstQuestion: data.question, maxQuestions: data.maxQuestions },
      });
    } catch (err) {
      console.error(err);
      setUploadStatus("Failed to start session. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const scoreColor = (s) => {
    if (s >= 75) return "text-emerald-600";
    if (s >= 50) return "text-amber-600";
    return "text-red-500";
  };

  return (
    <div className="dashboard-page max-w-5xl mx-auto px-4 py-10 space-y-8">
      {/* Personalized Greeting Banner */}
      {profile && (
        <div className="dashboard-welcome text-white rounded-2xl p-6 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">
              Welcome back, {profile.name?.split(" ")[0] || "there"} 👋
            </h1>
            <p className="text-slate-300 text-sm mt-1">
              {profile.targetRole
                ? `Preparing for: ${profile.targetRole} · ${profile.experienceLevel || "Fresher"}`
                : "Set up your practice session below to get started"}
            </p>
            {profile.resume?.skills?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {profile.resume.skills.slice(0, 6).map((skill) => (
                  <span
                    key={skill}
                    className="bg-white/15 text-white text-xs px-2.5 py-0.5 rounded-full"
                  >
                    {skill}
                  </span>
                ))}
                {profile.resume.skills.length > 6 && (
                    <span className="text-slate-300 text-xs self-center">
                    +{profile.resume.skills.length - 6} more
                  </span>
                )}
              </div>
            )}
          </div>
          {recentSessions.length > 0 && (
            <div className="text-right shrink-0">
              <p className="text-4xl font-black">{recentSessions[0].overallScore}/100</p>
              <p className="text-slate-300 text-xs mt-1">Last session score</p>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Setup Form */}
        <div className="lg:col-span-3 bg-white p-7 rounded-2xl shadow-md border border-slate-100 space-y-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Setup New Practice Session</h2>
            <p className="text-slate-500 text-sm mt-1">
              Questions are dynamically generated by AI based on your background and role.
            </p>
          </div>

          <form onSubmit={startInterview} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Target Role <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. Backend Engineer, Data Scientist"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Domain</label>
                <select
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                >
                  <option>Software Engineering</option>
                  <option>Data Science</option>
                  <option>General</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Experience</label>
                <select
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={experienceLevel}
                  onChange={(e) => setExperienceLevel(e.target.value)}
                >
                  <option value="Fresher">Fresher (5 Q)</option>
                  <option value="1-3 yrs">1–3 yrs (6 Q)</option>
                  <option value="3+ yrs">3+ yrs (8 Q)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Upload / Update Resume (PDF / DOCX)
              </label>
              <input
                type="file"
                accept=".pdf,.docx,.doc"
                className="w-full text-sm text-amber-900 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-amber-100 file:text-amber-800 hover:file:bg-amber-200"
                onChange={(e) => setResumeFile(e.target.files[0])}
              />
              {profile?.resume?.updatedAt && !resumeFile && (
                <p className="text-xs text-slate-400 mt-1">
                  ✓ Resume on file ({profile.resume.skills?.length || 0} skills detected) — leave blank to reuse
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Job Description{" "}
                <span className="text-slate-400 font-normal">(optional — improves question targeting)</span>
              </label>
              <textarea
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm h-24 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                placeholder="Paste the target job description to match key requirements..."
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
              />
            </div>

            {uploadStatus && (
              <p className="status-note text-xs px-3 py-2 rounded-lg animate-pulse">
                {uploadStatus}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white rounded-xl py-3 font-semibold text-sm disabled:opacity-50 hover:bg-indigo-700 transition"
            >
              {loading ? "Preparing AI Interview..." : "🚀 Start AI Mock Interview"}
            </button>
          </form>
        </div>

        {/* Sidebar: Recent Sessions */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-900">Recent Sessions</h2>
            <Link to="/history" className="text-xs text-indigo-600 hover:underline font-medium">
              View all →
            </Link>
          </div>

          {recentSessions.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-6 text-center">
              <p className="text-slate-400 text-sm">No sessions yet.</p>
              <p className="text-slate-400 text-xs mt-1">Complete your first interview to track progress.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentSessions.map((s) => (
                <div
                  key={s.sessionId}
                  className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm space-y-2"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-slate-900 text-sm">
                        {s.targetRole || s.domain}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {s.experienceLevel} ·{" "}
                        {new Date(s.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    </div>
                    <span className={`text-xl font-black ${scoreColor(s.overallScore)}`}>
                      {s.overallScore}
                      <span className="text-xs text-slate-400 font-normal">/100</span>
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-center text-xs">
                    <div className="bg-blue-50 text-blue-700 rounded-lg py-1">
                      <div className="font-bold">{s.averages.facial}</div>
                      <div className="text-blue-400">Facial</div>
                    </div>
                    <div className="bg-emerald-50 text-emerald-700 rounded-lg py-1">
                      <div className="font-bold">{s.averages.speech}</div>
                      <div className="text-emerald-400">Speech</div>
                    </div>
                    <div className="bg-purple-50 text-purple-700 rounded-lg py-1">
                      <div className="font-bold">{s.averages.nlp}</div>
                      <div className="text-purple-400">NLP</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Resume summary card */}
          {profile?.resume?.skills?.length > 0 && (
            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-700 mb-2">📄 Resume on File</p>
              <div className="flex flex-wrap gap-1.5">
                {profile.resume.skills.map((sk) => (
                  <span key={sk} className="bg-slate-100 text-slate-700 text-xs px-2 py-0.5 rounded-full">
                    {sk}
                  </span>
                ))}
              </div>
              {profile.resume.yearsExperience > 0 && (
                <p className="text-xs text-slate-400 mt-2">
                  {profile.resume.yearsExperience} year(s) of experience detected
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
