import React, { useState } from "react";
import { Wand2, Sparkles, ArrowRight, Cpu, AlertCircle } from "lucide-react";
import type { SDFDocument } from "@madder/sdf-dsl";
import { PRESETS } from "@madder/sdf-dsl";

interface GenerateModeProps {
  onGeneratedOBJ: (objText: string) => void;
  onSendToRefine: (doc: SDFDocument) => void;
}

const GENERATE_PRESETS = [
  "A futuristic honeycomb house with organic hexagonal cavities and curved domed roof",
  "A biomorphic mushroom palace with spiraling alien balconies",
  "An organic sea coral formation with smooth branching arms",
  "A surreal melting architectural monolith with hollow archways",
];

export function GenerateMode({
  onGeneratedOBJ,
  onSendToRefine,
}: GenerateModeProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async (queryText?: string) => {
    const q = (queryText || prompt).trim();
    if (!q || loading) return;

    setError(null);
    setLoading(true);
    setStatusText("Connecting to ZeroGPU MVDream sidecar...");

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: q }),
      });

      if (!res.ok) {
        throw new Error(
          `MVDream service unreachable (${res.status}). Ensure your HuggingFace ZeroGPU space or backend is configured in .env.`
        );
      }

      setStatusText("Synthesizing multi-view 3D consistency with MVDream...");
      const data = await res.json();
      if (!data.obj) throw new Error("No OBJ data received from MVDream");

      onGeneratedOBJ(data.obj);
      setStatusText("Complete!");
    } catch (err: any) {
      console.warn("API generate failed, offering organic preset fallback:", err);
      setError(
        `${err.message} (Tip: You can use the organic presets or jump directly to Refine Mode).`
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLoadDemoModel = () => {
    onSendToRefine(PRESETS.honeycombHouse);
  };

  return (
    <div className="sidebar-panel glass-panel" style={{ height: "100%", overflowY: "auto", padding: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              padding: 6,
              borderRadius: "var(--radius-md)",
              background: "rgba(6, 182, 212, 0.15)",
              color: "var(--accent-cyan)",
            }}
          >
            <Wand2 size={18} />
          </div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>MVDream Generate Mode</div>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4 }}>
          Generate multi-view consistent 3D meshes directly from text prompts using ByteDance's MVDream diffusion model.
        </div>
      </div>

      {/* Backend Status Card */}
      <div
        className="glass-card"
        style={{
          padding: 14,
          marginBottom: 20,
          background: "rgba(6, 182, 212, 0.05)",
          borderColor: "rgba(6, 182, 212, 0.2)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--accent-cyan)", marginBottom: 4 }}>
          <Cpu size={14} />
          <span>MVDream ZeroGPU Backend (.env)</span>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
          MVDream requests are routed through your backend server and HuggingFace ZeroGPU Space.
        </div>
      </div>

      {/* Input Area */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
        <label style={{ fontSize: 13, fontWeight: 600 }}>Describe 3D Model</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. A futuristic honeycomb house with organic hexagonal cavities..."
          style={{
            width: "100%",
            minHeight: 90,
            padding: 12,
            borderRadius: "var(--radius-md)",
            background: "rgba(0,0,0,0.3)",
            border: "1px solid var(--border-subtle)",
            fontSize: 13,
            color: "#f8fafc",
            outline: "none",
            resize: "none",
          }}
          disabled={loading}
        />

        <button
          onClick={() => handleGenerate()}
          disabled={loading || !prompt.trim()}
          className="btn btn-primary"
          style={{
            padding: "12px 16px",
            background: "linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)",
            fontWeight: 600,
          }}
          id="btn-generate-shape"
        >
          {loading ? (
            <>
              <div className="animate-spin" style={{ width: 16, height: 16, border: "2px solid #fff", borderTopColor: "transparent", borderRadius: "50%" }} />
              <span>{statusText || "Generating with MVDream..."}</span>
            </>
          ) : (
            <>
              <Wand2 size={16} />
              <span>Generate 3D Model (MVDream)</span>
            </>
          )}
        </button>
      </div>

      {/* Prompt Inspirations */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>
          Inspiration Presets
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {GENERATE_PRESETS.map((p, i) => (
            <button
              key={i}
              onClick={() => {
                setPrompt(p);
                handleGenerate(p);
              }}
              disabled={loading}
              className="btn btn-sm glass-card"
              style={{
                fontSize: 12,
                textAlign: "left",
                justifyContent: "flex-start",
                padding: "8px 12px",
                lineHeight: 1.3,
              }}
            >
              🪄 {p}
            </button>
          ))}
        </div>
      </div>

      {/* Error / Fallback Notice */}
      {error && (
        <div
          style={{
            padding: 12,
            borderRadius: "var(--radius-md)",
            background: "rgba(244, 63, 94, 0.12)",
            border: "1px solid rgba(244, 63, 94, 0.25)",
            color: "#fb7185",
            fontSize: 12,
            marginBottom: 16,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
          <button
            onClick={handleLoadDemoModel}
            className="btn btn-sm"
            style={{ alignSelf: "flex-start", background: "rgba(255,255,255,0.1)" }}
          >
            ⚡ Load Organic Honeycomb in Refine Mode
          </button>
        </div>
      )}

      {/* Continue to Refine Mode Bridge */}
      <div
        className="glass-card"
        style={{
          padding: 16,
          marginTop: "auto",
          background: "linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%)",
          border: "1px solid rgba(99, 102, 241, 0.3)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Sparkles size={16} color="#a855f7" />
          <div style={{ fontSize: 13, fontWeight: 600 }}>Ready to modify & sculpt?</div>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12, lineHeight: 1.4 }}>
          Switch to Refine Mode to carve cavities, add twisting arches, and edit shapes freely with SDFs.
        </div>
        <button
          onClick={() => onSendToRefine(PRESETS.honeycombHouse)}
          className="btn btn-sm btn-primary"
          style={{ width: "100%", justifyContent: "center" }}
          id="btn-bridge-to-refine"
        >
          <span>Open in Refine Mode</span>
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}
