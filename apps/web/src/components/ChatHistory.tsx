import React from "react";
import { X, Plus, Trash2, Clock, Sparkles, MessageSquare } from "lucide-react";
import type { SDFDocument } from "@madder/sdf-dsl";

export interface ChatMessage {
  id: string;
  sender: "user" | "assistant" | "system";
  text: string;
  timestamp: string;
  score?: number | null;
}

export interface ChatSession {
  id: string;
  title: string;
  timestamp: string;
  promptPreview: string;
  document: SDFDocument;
  score?: number | null;
  messages: ChatMessage[];
}

interface ChatHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: ChatSession[];
  activeSessionId: string;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onDeleteSession: (sessionId: string, e: React.MouseEvent) => void;
}

export function ChatHistory({
  isOpen,
  onClose,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
}: ChatHistoryProps) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(6px)",
        display: "flex",
        justifyContent: "flex-end",
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        className="glass-panel"
        style={{
          width: "100%",
          maxWidth: 380,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          borderRadius: "0",
          borderLeft: "1px solid var(--border-subtle)",
          boxShadow: "var(--shadow-xl)",
          animation: "slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
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
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <MessageSquare size={18} color="var(--accent-primary)" />
            <span style={{ fontWeight: 700, fontSize: 15 }}>Chat &amp; Model Sessions</span>
          </div>
          <button
            onClick={onClose}
            className="btn btn-icon btn-sm"
            style={{ borderRadius: "50%" }}
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* New Session Button */}
        <div style={{ padding: "14px 20px" }}>
          <button
            onClick={() => {
              onNewSession();
              onClose();
            }}
            className="btn btn-primary"
            style={{ width: "100%", justifyContent: "center", gap: 8, padding: "10px 16px" }}
          >
            <Plus size={16} />
            <span>+ Start New 3D Model Chat</span>
          </button>
        </div>

        {/* Sessions List */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "0 16px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {sessions.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "40px 20px",
                color: "var(--text-muted)",
                fontSize: 13,
              }}
            >
              No past sessions yet. Start a new model chat!
            </div>
          ) : (
            sessions.map((session) => {
              const isActive = session.id === activeSessionId;
              return (
                <div
                  key={session.id}
                  onClick={() => {
                    onSelectSession(session.id);
                    onClose();
                  }}
                  style={{
                    padding: "12px 14px",
                    borderRadius: "var(--radius-md)",
                    background: isActive ? "rgba(99, 102, 241, 0.15)" : "rgba(255, 255, 255, 0.03)",
                    border: `1px solid ${isActive ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                  className="chat-session-item"
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: isActive ? "#ffffff" : "#e2e8f0" }}>
                      {session.title || "Untitled Model"}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {session.score !== undefined && session.score !== null && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: "var(--radius-full)",
                            background: "rgba(245, 158, 11, 0.2)",
                            color: "#fbbf24",
                            border: "1px solid rgba(245, 158, 11, 0.4)",
                          }}
                        >
                          ⭐ {session.score.toFixed(1)}
                        </span>
                      )}
                      <button
                        onClick={(e) => onDeleteSession(session.id, e)}
                        className="btn btn-icon btn-sm"
                        style={{ padding: 4, opacity: 0.6 }}
                        title="Delete Session"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {session.promptPreview || "No prompt history"}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--text-subtle)" }}>
                    <Clock size={10} />
                    <span>{session.timestamp}</span>
                    <span style={{ margin: "0 2px" }}>•</span>
                    <span>{session.messages.length} message{session.messages.length !== 1 ? "s" : ""}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
