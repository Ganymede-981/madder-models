import React, { useState } from "react";
import { 
  Send, 
  Sparkles, 
  RotateCcw, 
  RotateCw, 
  AlertCircle
} from "lucide-react";
import type { SDFDocument } from "@madder/sdf-dsl";
import { PRESETS, validateSDFDocument } from "@madder/sdf-dsl";

interface Message {
  id: string;
  sender: "user" | "assistant" | "system";
  text: string;
  timestamp: string;
}

interface RefineModeProps {
  currentDocument: SDFDocument;
  onUpdateDocument: (doc: SDFDocument) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

const PROMPT_SUGGESTIONS = [
  "Make the honeycomb openings deeper and round the edges",
  "Add twisting organic branches rising from the top",
  "Carve hollow interior living spaces with smooth arched openings",
  "Blend a rippling grounding skirt at the base",
  "Apply an organic surface ripple displacement",
];

export function RefineMode({
  currentDocument,
  onUpdateDocument,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: RefineModeProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      sender: "assistant",
      text: "👋 Welcome to Refine Mode. You have full organic control via AI-native Signed Distance Functions. Type a prompt like 'make it like a honeycomb pod with a curved dome' or pick a preset below!",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);

  const handleSubmitPrompt = async (textToSend?: string) => {
    const query = (textToSend || prompt).trim();
    if (!query || loading) return;

    setError(null);
    setLoading(true);

    const userMsg: Message = {
      id: String(Date.now()),
      sender: "user",
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages((prev) => [...prev, userMsg]);
    setPrompt("");

    try {
      // Call backend API which reads GROQ_API_KEY from .env
      const response = await fetch("/api/refine", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: query,
          currentDocument,
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error("Groq rate limit reached. Please wait a few seconds and try again.");
        }
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || errData.error?.message || `Refine API error (${response.status})`);
      }

      const data = await response.json();
      const rawDoc = data.document;
      if (!rawDoc) throw new Error("No document received from API");

      const validation = validateSDFDocument(rawDoc);

      if (!validation.success || !validation.data) {
        throw new Error(`SDF-DSL schema validation error: ${validation.error}`);
      }

      onUpdateDocument(validation.data);

      const assistantMsg: Message = {
        id: String(Date.now() + 1),
        sender: "assistant",
        text: `✨ Refined: ${validation.data.name || "Geometry updated"}! ${validation.data.description || "Applied smooth organic transformations."}`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to refine model");
      const errAssistantMsg: Message = {
        id: String(Date.now() + 1),
        sender: "assistant",
        text: `⚠️ Error: ${err.message || "Failed to parse model."}`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errAssistantMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPreset = (key: string) => {
    const preset = PRESETS[key];
    if (!preset) return;
    onUpdateDocument(preset);
    const msg: Message = {
      id: String(Date.now()),
      sender: "assistant",
      text: `🎨 Loaded preset: **${preset.name}** — ${preset.description}`,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages((prev) => [...prev, msg]);
  };

  return (
    <div className="sidebar-panel glass-panel" style={{ height: "100%", overflow: "hidden" }}>
      {/* Top Bar: History & Preset Chips */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Sparkles size={16} color="#c084fc" />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Refine Studio</span>
        </div>

        {/* Undo / Redo */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="btn btn-sm btn-icon"
            title="Undo Refinement"
          >
            <RotateCcw size={14} />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className="btn btn-sm btn-icon"
            title="Redo Refinement"
          >
            <RotateCw size={14} />
          </button>
        </div>
      </div>

      {/* Preset Selector Bar */}
      <div
        style={{
          padding: "10px 16px",
          background: "rgba(0,0,0,0.2)",
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>
          ORGANIC PRESETS
        </div>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
          <button
            onClick={() => handleSelectPreset("honeycombHouse")}
            className="btn btn-sm"
            style={{ fontSize: 11, padding: "4px 8px", whiteSpace: "nowrap" }}
          >
            🐝 Honeycomb House
          </button>
          <button
            onClick={() => handleSelectPreset("organicCoral")}
            className="btn btn-sm"
            style={{ fontSize: 11, padding: "4px 8px", whiteSpace: "nowrap" }}
          >
            🪸 Coral Reef
          </button>
          <button
            onClick={() => handleSelectPreset("twistedSpire")}
            className="btn btn-sm"
            style={{ fontSize: 11, padding: "4px 8px", whiteSpace: "nowrap" }}
          >
            🌀 Twisted Spire
          </button>
          <button
            onClick={() => handleSelectPreset("mushroomPod")}
            className="btn btn-sm"
            style={{ fontSize: 11, padding: "4px 8px", whiteSpace: "nowrap" }}
          >
            🍄 Mushroom Pod
          </button>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="chat-container">
        <div className="messages-list">
          {messages.map((m) => (
            <div key={m.id} className={`message-bubble ${m.sender}`}>
              <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
              <div
                style={{
                  fontSize: 10,
                  color: "rgba(255,255,255,0.4)",
                  marginTop: 6,
                  textAlign: m.sender === "user" ? "right" : "left",
                }}
              >
                {m.timestamp}
              </div>
            </div>
          ))}

          {loading && (
            <div className="message-bubble assistant animate-pulse-glow" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className="animate-spin" style={{ width: 16, height: 16, border: "2px solid #6366f1", borderTopColor: "transparent", borderRadius: "50%" }} />
              <span style={{ fontSize: 13, color: "#a5b4fc" }}>AI generating SDF-DSL mesh patch with Groq (.env)...</span>
            </div>
          )}
        </div>

        {/* Suggestion Chips */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 4 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>
            IDEAS & REFINEMENTS
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {PROMPT_SUGGESTIONS.slice(0, 3).map((s, idx) => (
              <button
                key={idx}
                onClick={() => handleSubmitPrompt(s)}
                disabled={loading}
                className="btn btn-sm"
                style={{ fontSize: 11, padding: "4px 8px", background: "rgba(255,255,255,0.03)", textAlign: "left" }}
              >
                + {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div
          style={{
            margin: "0 16px 8px 16px",
            padding: "8px 12px",
            background: "rgba(244, 63, 94, 0.15)",
            border: "1px solid rgba(244, 63, 94, 0.3)",
            borderRadius: "var(--radius-sm)",
            color: "#fb7185",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {/* Input Prompt Box */}
      <div className="prompt-input-wrapper">
        <div className="prompt-input-box">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmitPrompt();
              }
            }}
            placeholder="Describe your organic refinement (e.g. 'add twisted arches to the front')..."
            className="prompt-textarea"
            rows={2}
            disabled={loading}
          />
          <button
            onClick={() => handleSubmitPrompt()}
            disabled={loading || !prompt.trim()}
            className="prompt-send-btn"
            id="btn-refine-send"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
