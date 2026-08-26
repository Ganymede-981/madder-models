import React, { useState, useEffect } from "react";
import { X, Check, Copy, AlertCircle, RefreshCw } from "lucide-react";
import { validateSDFDocument } from "@madder/sdf-dsl";
import type { SDFDocument } from "@madder/sdf-dsl";

interface CodeInspectorProps {
  isOpen: boolean;
  onClose: () => void;
  document: SDFDocument;
  onApplyChanges: (doc: SDFDocument) => void;
}

export function CodeInspector({ isOpen, onClose, document, onApplyChanges }: CodeInspectorProps) {
  const [jsonText, setJsonText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setJsonText(JSON.stringify(document, null, 2));
      setError(null);
    }
  }, [isOpen, document]);

  if (!isOpen) return null;

  const handleApply = () => {
    try {
      const parsed = JSON.parse(jsonText);
      const val = validateSDFDocument(parsed);
      if (!val.success || !val.data) {
        setError(val.error || "Invalid SDF-DSL Schema");
        return;
      }
      onApplyChanges(val.data);
      onClose();
    } catch (e: any) {
      setError(e.message || "Invalid JSON syntax");
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          maxWidth: 720,
          maxHeight: "85vh",
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
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>SDF-DSL Document Inspector</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Inspect, modify, or export the live Signed Distance Function JSON tree
            </div>
          </div>
          <button onClick={onClose} className="btn btn-icon" style={{ background: "transparent" }}>
            <X size={18} />
          </button>
        </div>

        {/* Editor Area */}
        <div style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 12, overflow: "hidden" }}>
          {error && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: "var(--radius-md)",
                background: "rgba(244, 63, 94, 0.15)",
                border: "1px solid rgba(244, 63, 94, 0.3)",
                color: "#fb7185",
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <textarea
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value);
              setError(null);
            }}
            style={{
              flex: 1,
              minHeight: 380,
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              lineHeight: 1.5,
              background: "rgba(0, 0, 0, 0.4)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              padding: 16,
              color: "#a5b4fc",
              resize: "none",
              outline: "none",
            }}
            spellCheck={false}
          />
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 20px",
            borderTop: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <button onClick={handleCopy} className="btn btn-sm">
            {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
            <span>{copied ? "Copied!" : "Copy JSON"}</span>
          </button>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} className="btn btn-sm">
              Cancel
            </button>
            <button onClick={handleApply} className="btn btn-sm btn-primary">
              <RefreshCw size={14} />
              <span>Apply to 3D Viewport</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
