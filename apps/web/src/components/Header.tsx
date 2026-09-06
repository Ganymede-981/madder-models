import React from "react";
import { Sparkles, Plus, History, Code, Settings } from "lucide-react";

interface HeaderProps {
  onNewModel: () => void;
  onOpenHistory: () => void;
  onOpenJsonEditor: () => void;
  sessionCount?: number;
}

export function Header({
  onNewModel,
  onOpenHistory,
  onOpenJsonEditor,
  sessionCount = 0,
}: HeaderProps) {
  return (
    <header className="app-header glass-panel">
      {/* Brand */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "var(--radius-md)",
            background: "var(--accent-gradient)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "var(--shadow-glow)",
          }}
        >
          <Sparkles size={20} color="#ffffff" />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.02em" }}>
            MADDER <span className="text-gradient">MODELS</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: -2 }}>
            Conversational AI 3D Sculptor Studio
          </div>
        </div>
      </div>

      {/* Center Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          className="btn btn-primary"
          onClick={onNewModel}
          id="btn-header-new-model"
          style={{ padding: "7px 14px", gap: 6 }}
        >
          <Plus size={15} />
          <span>New 3D Model</span>
        </button>

        <button
          className="btn"
          onClick={onOpenHistory}
          id="btn-header-history"
          style={{ padding: "7px 12px", gap: 6 }}
          title="Past Chat Sessions"
        >
          <History size={15} />
          <span>Sessions</span>
          {sessionCount > 0 && (
            <span
              style={{
                fontSize: 10,
                background: "rgba(255,255,255,0.15)",
                padding: "1px 6px",
                borderRadius: "var(--radius-full)",
              }}
            >
              {sessionCount}
            </span>
          )}
        </button>
      </div>

      {/* Right Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={onOpenJsonEditor}
          className="btn btn-sm"
          title="Inspect / Edit SDF-DSL JSON"
          id="btn-inspect-dsl"
        >
          <Code size={14} />
          <span>DSL Inspector</span>
        </button>
      </div>
    </header>
  );
}
