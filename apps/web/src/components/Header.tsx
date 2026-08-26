import React from "react";
import { Sparkles, Wand2, Code } from "lucide-react";

interface HeaderProps {
  activeMode: "create" | "refine";
  setActiveMode: (mode: "create" | "refine") => void;
  onOpenJsonEditor: () => void;
}

export function Header({
  activeMode,
  setActiveMode,
  onOpenJsonEditor,
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
            Organic AI-Native 3D Studio
          </div>
        </div>
      </div>

      {/* Mode Switcher */}
      <div className="mode-switcher">
        <button
          className={`mode-tab ${activeMode === "create" ? "active generate" : ""}`}
          onClick={() => setActiveMode("create")}
          id="mode-tab-create"
        >
          <Wand2 size={16} />
          <span>Create (From Scratch)</span>
        </button>

        <button
          className={`mode-tab ${activeMode === "refine" ? "active refine" : ""}`}
          onClick={() => setActiveMode("refine")}
          id="mode-tab-refine"
        >
          <Sparkles size={16} />
          <span>Refine (Sculpt & Modify)</span>
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
