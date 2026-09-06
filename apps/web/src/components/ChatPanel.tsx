import React, { useState, useRef, useEffect } from "react";
import { 
  Send, 
  Sparkles, 
  RotateCcw, 
  RotateCw, 
  Sliders, 
  MessageSquare, 
  Plus, 
  Layers,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import type { SDFDocument } from "@madder/sdf-dsl";
import { TransformControlsPanel } from "./TransformControlsPanel.js";
import type { ChatMessage } from "./ChatHistory.js";

interface ChatPanelProps {
  currentDocument: SDFDocument;
  onUpdateDocument: (doc: SDFDocument, score?: number | null) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  selectedObjectId?: string | null;
  onSelectObject?: (id: string | null) => void;
  sessionId: string;
  messages: ChatMessage[];
  onSendMessage: (text: string) => Promise<void>;
  onNewModel: () => void;
  loading: boolean;
  loadingPhase: "planning" | "sculpting" | "critic" | null;
  qualityScore?: number | null;
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
    title: "Cybernetic Monolith",
    prompt: "A futuristic tower with dark carbon twisted spire, radiant gold energy rings, and cyan illuminated interior windows.",
    tag: "Sci-Fi",
  },
  {
    title: "Crimson Mushroom",
    prompt: "An organic bio-pod with curved crimson cap, creamy ivory stalk, and smooth moss green root base.",
    tag: "Flora",
  },
  {
    title: "Stealth Starship",
    prompt: "A symmetrical sci-fi spacecraft with dark matte hull, golden cockpit dome, and dual glowing cyan plasma thrusters.",
    tag: "Vehicle",
  },
];

const REFINEMENT_SUGGESTIONS = [
  "Make the openings deeper and round the edges smoothly",
  "Add twisting organic branches rising from the top",
  "Carve hollow interior living spaces with arched openings",
  "Increase the organic smooth blending radius between parts",
  "Shift the color palette to vivid glowing cyan and emerald",
];

export function ChatPanel({
  currentDocument,
  onUpdateDocument,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  selectedObjectId = null,
  onSelectObject = () => {},
  sessionId,
  messages,
  onSendMessage,
  onNewModel,
  loading,
  loadingPhase,
  qualityScore,
}: ChatPanelProps) {
  const [activeTab, setActiveTab] = useState<"chat" | "transforms">("chat");
  const [inputPrompt, setInputPrompt] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = inputPrompt.trim();
    if (!q || loading) return;
    setInputPrompt("");
    await onSendMessage(q);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <aside className="refine-panel glass-panel" style={{ width: 420, minWidth: 380, maxWidth: 460 }}>
      {/* Panel Tabs Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          borderBottom: "1px solid var(--border-subtle)",
          background: "rgba(10, 14, 23, 0.4)",
        }}
      >
        {/* Navigation Tabs */}
        <div style={{ display: "flex", gap: 4, background: "rgba(0,0,0,0.3)", padding: 3, borderRadius: "var(--radius-md)" }}>
          <button
            className={`btn btn-sm ${activeTab === "chat" ? "btn-primary" : ""}`}
            style={{ fontSize: 12, padding: "5px 12px", borderRadius: "var(--radius-sm)" }}
            onClick={() => setActiveTab("chat")}
            id="tab-btn-chat"
          >
            <MessageSquare size={13} />
            <span>AI Sculptor</span>
          </button>
          <button
            className={`btn btn-sm ${activeTab === "transforms" ? "btn-primary" : ""}`}
            style={{ fontSize: 12, padding: "5px 12px", borderRadius: "var(--radius-sm)" }}
            onClick={() => setActiveTab("transforms")}
            id="tab-btn-transforms"
          >
            <Sliders size={13} />
            <span>3D Transforms</span>
          </button>
        </div>

        {/* Quick Actions (Undo/Redo, New Model) */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="btn btn-icon btn-sm"
            title="Undo (Ctrl+Z)"
          >
            <RotateCcw size={13} />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className="btn btn-icon btn-sm"
            title="Redo (Ctrl+Y)"
          >
            <RotateCw size={13} />
          </button>
          <button
            onClick={onNewModel}
            className="btn btn-sm"
            style={{
              padding: "4px 8px",
              fontSize: 11,
              background: "rgba(99, 102, 241, 0.15)",
              color: "var(--accent-primary)",
              border: "1px solid rgba(99, 102, 241, 0.3)",
            }}
            title="Start Fresh Model Chat"
            id="btn-new-model-panel"
          >
            <Plus size={12} />
            <span>New</span>
          </button>
        </div>
      </div>

      {/* Tab 1: AI Sculptor Chat Thread */}
      {activeTab === "chat" ? (
        <div style={{ display: "flex", flexDirection: "column", height: "calc(100% - 50px)", position: "relative" }}>
          {/* Scrollable Message List */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
            className="chat-messages-container"
          >
            {/* Quality Score Highlight if available */}
            {qualityScore !== undefined && qualityScore !== null && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(99, 102, 241, 0.12))",
                  border: "1px solid rgba(245, 158, 11, 0.3)",
                  borderRadius: "var(--radius-md)",
                  padding: "8px 12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <ShieldCheck size={16} color="#fbbf24" />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#fef3c7" }}>
                    Verified by Closed-Loop Critic
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: "#fbbf24",
                    background: "rgba(245, 158, 11, 0.2)",
                    padding: "2px 8px",
                    borderRadius: "var(--radius-full)",
                  }}
                >
                  ⭐ {qualityScore.toFixed(1)} / 10
                </span>
              </div>
            )}

            {/* Conversation Messages */}
            {messages.map((msg) => {
              const isUser = msg.sender === "user";
              return (
                <div
                  key={msg.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: isUser ? "flex-end" : "flex-start",
                    gap: 4,
                  }}
                >
                  <div
                    style={{
                      maxWidth: "88%",
                      padding: "10px 14px",
                      borderRadius: isUser ? "14px 14px 2px 14px" : "14px 14px 14px 2px",
                      background: isUser
                        ? "linear-gradient(135deg, #4f46e5, #6366f1)"
                        : "rgba(22, 27, 39, 0.8)",
                      border: isUser ? "none" : "1px solid var(--border-subtle)",
                      color: "#f8fafc",
                      fontSize: 13,
                      lineHeight: 1.45,
                      boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                    }}
                  >
                    {msg.text}
                  </div>
                  <span style={{ fontSize: 10, color: "var(--text-subtle)", padding: "0 4px" }}>
                    {msg.timestamp}
                  </span>
                </div>
              );
            })}

            {/* Loading / Critic Loop Progress Indicator */}
            {loading && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: "rgba(30, 41, 59, 0.5)",
                  border: "1px solid rgba(99, 102, 241, 0.3)",
                  borderRadius: "var(--radius-md)",
                  padding: "10px 14px",
                  fontSize: 12,
                  color: "#cbd5e1",
                }}
              >
                <div
                  className="animate-spin"
                  style={{
                    width: 14,
                    height: 14,
                    border: "2px solid rgba(99, 102, 241, 0.3)",
                    borderTopColor: "#818cf8",
                    borderRadius: "50%",
                  }}
                />
                <span>
                  {loadingPhase === "planning" && "Architect decomposing semantic parts..."}
                  {loadingPhase === "sculpting" && "Sculptor synthesizing SDF geometry..."}
                  {loadingPhase === "critic" && "Closed-Loop Critic evaluating code & visuals..."}
                  {!loadingPhase && "Processing conversational 3D refinement..."}
                </span>
              </div>
            )}

            {/* If initial conversation, show inspiration presets */}
            {messages.length <= 1 && !loading && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Prompt Inspirations
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {INSPIRATION_PRESETS.map((item) => (
                    <button
                      key={item.title}
                      onClick={() => onSendMessage(item.prompt)}
                      style={{
                        padding: "8px 12px",
                        textAlign: "left",
                        borderRadius: "var(--radius-md)",
                        background: "rgba(255, 255, 255, 0.02)",
                        border: "1px solid var(--border-subtle)",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                      className="suggestion-chip"
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0" }}>{item.title}</span>
                        <span style={{ fontSize: 10, color: "var(--accent-primary)" }}>{item.tag}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {item.prompt}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* If model exists, show follow-up refinement chips */}
            {messages.length > 1 && !loading && (
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>
                  Suggested Refinements
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {REFINEMENT_SUGGESTIONS.map((sug) => (
                    <button
                      key={sug}
                      onClick={() => onSendMessage(sug)}
                      className="suggestion-chip"
                      style={{
                        fontSize: 11,
                        padding: "5px 10px",
                        borderRadius: "var(--radius-full)",
                        background: "rgba(99, 102, 241, 0.08)",
                        border: "1px solid rgba(99, 102, 241, 0.2)",
                        color: "#cbd5e1",
                        cursor: "pointer",
                      }}
                    >
                      + {sug}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Bottom Chat Input Form */}
          <form
            onSubmit={handleSubmit}
            style={{
              padding: "12px 14px",
              borderTop: "1px solid var(--border-subtle)",
              background: "rgba(10, 14, 23, 0.6)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ position: "relative" }}>
              <textarea
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  messages.length <= 1
                    ? "Describe any organic 3D shape (e.g. 'a twisted glowing spire with gold rings')..."
                    : "Describe refinements (e.g. 'make the twist more aggressive', 'hollow out interior')..."
                }
                rows={2}
                disabled={loading}
                style={{
                  width: "100%",
                  resize: "none",
                  padding: "10px 42px 10px 12px",
                  borderRadius: "var(--radius-md)",
                  background: "rgba(15, 23, 42, 0.8)",
                  border: "1px solid var(--border-subtle)",
                  color: "#ffffff",
                  fontSize: 13,
                  lineHeight: 1.4,
                  outline: "none",
                }}
                id="chat-input-textarea"
              />
              <button
                type="submit"
                disabled={loading || !inputPrompt.trim()}
                className="btn btn-primary"
                style={{
                  position: "absolute",
                  right: 8,
                  bottom: 12,
                  width: 30,
                  height: 30,
                  padding: 0,
                  borderRadius: "var(--radius-sm)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                title="Send instruction (Enter)"
                id="btn-chat-send"
              >
                <Send size={14} />
              </button>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, color: "var(--text-subtle)", padding: "0 2px" }}>
              <span>Shift+Enter for newline</span>
              <span>LangGraph Memory Active</span>
            </div>
          </form>
        </div>
      ) : (
        /* Tab 2: 3D Transform Controls Panel */
        <div style={{ flex: 1, overflowY: "auto", height: "calc(100% - 50px)" }}>
          <TransformControlsPanel
            document={currentDocument}
            onUpdateDocument={onUpdateDocument}
            selectedObjectId={selectedObjectId}
            onSelectObject={onSelectObject}
          />
        </div>
      )}
    </aside>
  );
}
