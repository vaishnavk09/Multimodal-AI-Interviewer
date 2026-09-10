import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api.js";

export default function Dashboard() {
  const [domain, setDomain] = useState("Software Engineering");
  const [targetRole, setTargetRole] = useState("Software Engineer");
  const [experienceLevel, setExperienceLevel] = useState("Fresher");
  const [jobDescription, setJobDescription] = useState("");
  const [resumeFile, setResumeFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

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

      setUploadStatus("Generating initial question...");
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

  return (
    <div className="max-w-lg mx-auto mt-12 bg-white p-8 rounded-xl shadow">
      <h1 className="text-2xl font-bold text-slate-900 mb-2 text-center">Setup Your Mock Interview</h1>
      <p className="text-slate-500 mb-6 text-center text-sm">
        Provide your details and CV so questions can be tailored to your real background.
      </p>

      <form onSubmit={startInterview} className="space-y-4 text-left">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Target Role</label>
          <input
            type="text"
            className="w-full border rounded px-3 py-2 text-sm"
            placeholder="e.g. Backend Engineer, Data Scientist"
            value={targetRole}
            onChange={(e) => setTargetRole(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Primary Domain</label>
          <select
            className="w-full border rounded px-3 py-2 text-sm"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
          >
            <option>Software Engineering</option>
            <option>Data Science</option>
            <option>General</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Experience Level</label>
          <select
            className="w-full border rounded px-3 py-2 text-sm"
            value={experienceLevel}
            onChange={(e) => setExperienceLevel(e.target.value)}
          >
            <option value="Fresher">Fresher (Entry Level — 5 questions)</option>
            <option value="1-3 yrs">1-3 yrs (Mid Level — 6 questions)</option>
            <option value="3+ yrs">3+ yrs (Senior Level — 8 questions)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Upload Resume (PDF / DOCX)
          </label>
          <input
            type="file"
            accept=".pdf,.docx,.doc"
            className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
            onChange={(e) => setResumeFile(e.target.files[0])}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Job Description (Optional)
          </label>
          <textarea
            className="w-full border rounded px-3 py-2 text-sm h-24"
            placeholder="Paste target job description to match key requirements..."
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
          />
        </div>

        {uploadStatus && <p className="text-xs text-slate-500 text-center">{uploadStatus}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-slate-900 text-white rounded py-2.5 font-medium disabled:opacity-50 hover:bg-slate-800 transition"
        >
          {loading ? "Preparing Interview..." : "Start Interview"}
        </button>
      </form>
    </div>
  );
}

