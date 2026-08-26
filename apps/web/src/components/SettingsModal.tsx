import React, { useState } from "react";
import { X, KeyRound, Sparkles, Server, Check, HelpCircle } from "lucide-react";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  groqKey: string;
  onSaveGroqKey: (key: string) => void;
  hfEndpoint: string;
  onSaveHfEndpoint: (endpoint: string) => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  groqKey,
  onSaveGroqKey,
  hfEndpoint,
  onSaveHfEndpoint,
}: SettingsModalProps) {
  const [localGroqKey, setLocalGroqKey] = useState(groqKey);
  const [localHfEndpoint, setLocalHfEndpoint] = useState(hfEndpoint);
  const [saved, setSaved] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveGroqKey(localGroqKey.trim());
    onSaveHfEndpoint(localHfEndpoint.trim());
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 600);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: 24,
      }}
    >
      <div
        className="glass-panel"
        style={{
          width: "100%",
          maxWidth: 540,
          borderRadius: "var(--radius-lg)",
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
          border: "1px solid var(--border-medium)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <KeyRound size={20} color="#6366f1" />
            <div style={{ fontWeight: 600, fontSize: 16 }}>AI Provider & API Configuration</div>
          </div>
          <button onClick={onClose} className="btn btn-icon" style={{ background: "transparent" }}>
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Groq Key */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#f8fafc" }}>
                Groq API Key (Free Tier)
              </label>
              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 11, color: "var(--accent-primary)", textDecoration: "none" }}
              >
                Get Free Groq Key ↗
              </a>
            </div>
            <input
              type="password"
              value={localGroqKey}
              onChange={(e) => setLocalGroqKey(e.target.value)}
              placeholder="gsk_..."
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "var(--radius-md)",
                background: "rgba(0,0,0,0.3)",
                border: "1px solid var(--border-subtle)",
                fontSize: 13,
                fontFamily: "var(--font-mono)",
                color: "#f8fafc",
                outline: "none",
              }}
            />
            <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4 }}>
              Used for <strong>Refine Mode</strong>. Powers lightning-fast (&lt;150ms) organic SDF-DSL JSON generation with <code>qwen/qwen3.6-27b</code>.
            </div>
          </div>

          {/* HF ZeroGPU / Backend Endpoint */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#f8fafc" }}>
                HuggingFace Space / Backend URL (Generate Mode)
              </label>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Optional</span>
            </div>
            <input
              type="text"
              value={localHfEndpoint}
              onChange={(e) => setLocalHfEndpoint(e.target.value)}
              placeholder="https://your-hf-space.hf.space or http://localhost:8000"
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "var(--radius-md)",
                background: "rgba(0,0,0,0.3)",
                border: "1px solid var(--border-subtle)",
                fontSize: 13,
                fontFamily: "var(--font-mono)",
                color: "#f8fafc",
                outline: "none",
              }}
            />
            <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4 }}>
              Used for <strong>Generate Mode (Shap-E text-to-3D)</strong>. Point this to your HuggingFace ZeroGPU Space or local FastAPI server.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 20px",
            borderTop: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 10,
          }}
        >
          <button onClick={onClose} className="btn btn-sm">
            Cancel
          </button>
          <button onClick={handleSave} className="btn btn-sm btn-primary">
            {saved ? <Check size={14} /> : null}
            <span>{saved ? "Saved!" : "Save Settings"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
