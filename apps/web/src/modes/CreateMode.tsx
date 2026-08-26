import React, { useState } from "react";
import { Sparkles, ArrowRight, Lightbulb, Compass, Rocket } from "lucide-react";
import type { SDFDocument } from "@madder/sdf-dsl";
import { validateSDFDocument } from "@madder/sdf-dsl";

interface CreateModeProps {
  onModelCreated: (doc: SDFDocument) => void;
  onSendToRefine: (doc: SDFDocument) => void;
}

const INSPIRATION_PRESETS = [
  {
    title: "Honeycomb Sanctuary",
    prompt: "An organic biomimetic house with smooth curved sandstone dome, amber carved hexagonal cells, and a slate blue foundation.",
    tag: "Architecture",
  },
  {
    title: "Bioluminescent Jelly-Pod",
    prompt: "A deep-sea bioluminescent organism with glowing translucent cyan umbrella dome, rose pink tentacles, and emerald floating orbs.",
    tag: "Creature",
  },
  {
    title: "Cybernetic Twisted Monolith",
    prompt: "A futuristic tower with dark carbon twisted spire, radiant gold energy rings, and cyan illuminated interior windows.",
    tag: "Sci-Fi",
  },
  {
    title: "Crimson Mushroom Temple",
    prompt: "An organic bio-pod with curved crimson cap, creamy ivory stalk, and smooth moss green root base.",
    tag: "Flora",
  },
  {
    title: "Aerodynamic Stealth Starship",
    prompt: "A symmetrical sci-fi spacecraft with dark matte hull, golden cockpit dome, and dual glowing cyan plasma thrusters.",
    tag: "Vehicle",
  },
];

export function CreateMode({ onModelCreated, onSendToRefine }: CreateModeProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCreated, setLastCreated] = useState<SDFDocument | null>(null);

  const handleCreate = async (queryText?: string) => {
    const q = (queryText || prompt).trim();
    if (!q || loading) return;

    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: q }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `Server error (${response.status})`);
      }

      const data = await response.json();
      const validation = validateSDFDocument(data.document);

      if (!validation.success || !validation.data) {
        throw new Error(`SDF validation failed: ${validation.error}`);
      }

      setLastCreated(validation.data);
      onModelCreated(validation.data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to create 3D model.");
    } finally {
      setLoading(false);
    }
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
              background: "var(--accent-gradient)",
              color: "#ffffff",
              boxShadow: "var(--shadow-glow)",
            }}
          >
            <Sparkles size={18} />
          </div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Create Studio (From Scratch)</div>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4 }}>
          Generate vivid, organic 3D models with painted semantic colors directly from natural language prompts in &lt;200ms.
        </div>
      </div>

      {/* Input Area */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
        <label style={{ fontSize: 13, fontWeight: 600 }}>Describe Your 3D Concept</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleCreate();
            }
          }}
          placeholder="e.g. A futuristic honeycomb house with sandstone dome, amber hexagonal cutouts, and slate base..."
          style={{
            width: "100%",
            minHeight: 95,
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
          onClick={() => handleCreate()}
          disabled={loading || !prompt.trim()}
          className="btn btn-primary"
          style={{
            padding: "12px 16px",
            fontWeight: 600,
          }}
          id="btn-create-model"
        >
          {loading ? (
            <>
              <div className="animate-spin" style={{ width: 16, height: 16, border: "2px solid #fff", borderTopColor: "transparent", borderRadius: "50%" }} />
              <span>Synthesizing 3D Geometry with Groq...</span>
            </>
          ) : (
            <>
              <Sparkles size={16} />
              <span>Generate 3D Model</span>
            </>
          )}
        </button>
      </div>

      {/* Inspiration Catalog */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>
          <Lightbulb size={14} color="#f59e0b" />
          <span>Curated Concept Inspirations</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {INSPIRATION_PRESETS.map((p, idx) => (
            <div
              key={idx}
              className="glass-card"
              style={{
                padding: "10px 14px",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
              onClick={() => {
                setPrompt(p.prompt);
                handleCreate(p.prompt);
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#f8fafc" }}>{p.title}</span>
                <span
                  style={{
                    fontSize: 10,
                    padding: "2px 6px",
                    borderRadius: "var(--radius-sm)",
                    background: "rgba(99, 102, 241, 0.15)",
                    color: "var(--accent-primary)",
                  }}
                >
                  {p.tag}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.3 }}>
                {p.prompt}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Error Notice */}
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
          }}
        >
          {error}
        </div>
      )}

      {/* Bridge to Refine Studio */}
      {lastCreated && (
        <div
          className="glass-card"
          style={{
            padding: 16,
            marginTop: "auto",
            background: "linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(168, 85, 247, 0.15) 100%)",
            border: "1px solid rgba(99, 102, 241, 0.4)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <Rocket size={16} color="#c084fc" />
            <div style={{ fontSize: 13, fontWeight: 600 }}>Ready to sculpt & modify?</div>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
            Switch to Refine Studio to carve cavities, add twisting arches, or tweak dimensions conversatively.
          </div>
          <button
            onClick={() => onSendToRefine(lastCreated)}
            className="btn btn-sm btn-primary"
            style={{ width: "100%", justifyContent: "center" }}
            id="btn-bridge-to-refine"
          >
            <span>Open in Refine Studio</span>
            <ArrowRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
