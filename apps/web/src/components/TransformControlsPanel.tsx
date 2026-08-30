import React, { useState } from "react";
import { 
  Move, 
  RotateCw, 
  Maximize2, 
  Layers, 
  Check, 
  RefreshCw, 
  ChevronRight,
  Palette,
  Eye,
  Sliders,
  Compass,
  ArrowUp,
  ArrowDown
} from "lucide-react";
import type { SDFDocument, Vec3 } from "@madder/sdf-dsl";
import type { SceneObject } from "../engine/scene-tree.js";
import { 
  extractSceneObjects, 
  updateObjectTransform, 
  updateObjectColor 
} from "../engine/scene-tree.js";

interface TransformControlsPanelProps {
  document: SDFDocument;
  selectedObjectId: string | null;
  onSelectObject: (id: string | null) => void;
  onUpdateDocument: (doc: SDFDocument) => void;
}

const QUICK_COLORS = [
  "#f87171", "#fb923c", "#fbbf24", "#34d399", 
  "#38bdf8", "#818cf8", "#c084fc", "#f472b6", 
  "#e2e8f0", "#475569", "#d97706", "#059669"
];

export function TransformControlsPanel({
  document,
  selectedObjectId,
  onSelectObject,
  onUpdateDocument,
}: TransformControlsPanelProps) {
  const objects = extractSceneObjects(document);
  const activeObject = objects.find((o) => o.id === selectedObjectId) || objects[0] || null;

  const [uniformScale, setUniformScale] = useState(true);
  const [activeTab, setActiveTab] = useState<"translate" | "rotate" | "scale">("translate");

  if (!activeObject && objects.length > 0) {
    onSelectObject(objects[0].id);
  }

  const handleTranslateChange = (axis: 0 | 1 | 2, val: number) => {
    if (!activeObject) return;
    const newT: Vec3 = [...activeObject.translate];
    newT[axis] = Math.round(val * 100) / 100;
    const updated = updateObjectTransform(document, activeObject.id, { translate: newT });
    onUpdateDocument(updated);
  };

  const handleRotateChange = (axis: 0 | 1 | 2, val: number) => {
    if (!activeObject) return;
    const newR: Vec3 = [...activeObject.rotate];
    newR[axis] = Math.round(val);
    const updated = updateObjectTransform(document, activeObject.id, { rotate: newR });
    onUpdateDocument(updated);
  };

  const handleScaleChange = (axis: 0 | 1 | 2, val: number) => {
    if (!activeObject) return;
    const clamped = Math.max(0.05, Math.min(5.0, val));
    if (uniformScale) {
      const updated = updateObjectTransform(document, activeObject.id, { scale: clamped });
      onUpdateDocument(updated);
    } else {
      const newS: Vec3 = [...activeObject.scale];
      newS[axis] = Math.round(clamped * 100) / 100;
      const updated = updateObjectTransform(document, activeObject.id, { scale: newS });
      onUpdateDocument(updated);
    }
  };

  const handleResetTransforms = () => {
    if (!activeObject) return;
    const updated = updateObjectTransform(document, activeObject.id, {
      translate: [0, 0, 0],
      rotate: [0, 0, 0],
      scale: [1, 1, 1],
    });
    onUpdateDocument(updated);
  };

  const handleGroundObject = () => {
    if (!activeObject) return;
    const newT: Vec3 = [activeObject.translate[0], 0, activeObject.translate[2]];
    const updated = updateObjectTransform(document, activeObject.id, { translate: newT });
    onUpdateDocument(updated);
  };

  const handleColorChange = (color: string) => {
    if (!activeObject) return;
    const updated = updateObjectColor(document, activeObject.id, color);
    onUpdateDocument(updated);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Object Selector / Outliner */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
            <Layers size={14} color="#818cf8" />
            <span>Scene Objects ({objects.length})</span>
          </div>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Select to manipulate</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 180, overflowY: "auto", paddingRight: 4 }}>
          {objects.map((obj) => {
            const isSelected = activeObject?.id === obj.id;
            return (
              <button
                key={obj.id}
                onClick={() => onSelectObject(obj.id)}
                className={`glass-card ${isSelected ? "selected-part" : ""}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  borderRadius: "var(--radius-md)",
                  background: isSelected ? "rgba(99, 102, 241, 0.2)" : "rgba(255, 255, 255, 0.03)",
                  border: isSelected ? "1px solid rgba(99, 102, 241, 0.6)" : "1px solid rgba(255, 255, 255, 0.06)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      background: obj.color || "#818cf8",
                      boxShadow: `0 0 8px ${obj.color || "#818cf8"}`,
                    }}
                  />
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontSize: 12, fontWeight: isSelected ? 700 : 500, color: "#f8fafc" }}>
                      {obj.name}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                      {obj.op}
                    </span>
                  </div>
                </div>
                {isSelected && <ChevronRight size={14} color="#818cf8" />}
              </button>
            );
          })}
        </div>
      </div>

      {activeObject && (
        <div className="glass-card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14, background: "rgba(15, 23, 42, 0.5)" }}>
          {/* Header of Active Object */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: activeObject.color || "#818cf8",
                }}
              />
              <span style={{ fontSize: 13, fontWeight: 700, color: "#f8fafc" }}>
                {activeObject.name}
              </span>
            </div>
            <button
              onClick={handleResetTransforms}
              className="btn btn-sm"
              style={{ fontSize: 11, padding: "4px 8px", gap: 4 }}
              title="Reset position, rotation, and scale to default"
            >
              <RefreshCw size={12} />
              <span>Reset</span>
            </button>
          </div>

          {/* Transform Tab Switcher */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, background: "rgba(0,0,0,0.3)", padding: 3, borderRadius: "var(--radius-md)" }}>
            <button
              onClick={() => setActiveTab("translate")}
              className={`btn btn-sm ${activeTab === "translate" ? "btn-primary" : ""}`}
              style={{ fontSize: 11, padding: "6px 8px", justifyContent: "center", gap: 4 }}
            >
              <Move size={13} />
              <span>Move (W)</span>
            </button>
            <button
              onClick={() => setActiveTab("rotate")}
              className={`btn btn-sm ${activeTab === "rotate" ? "btn-primary" : ""}`}
              style={{ fontSize: 11, padding: "6px 8px", justifyContent: "center", gap: 4 }}
            >
              <RotateCw size={13} />
              <span>Rotate (E)</span>
            </button>
            <button
              onClick={() => setActiveTab("scale")}
              className={`btn btn-sm ${activeTab === "scale" ? "btn-primary" : ""}`}
              style={{ fontSize: 11, padding: "6px 8px", justifyContent: "center", gap: 4 }}
            >
              <Maximize2 size={13} />
              <span>Scale (R)</span>
            </button>
          </div>

          {/* 1. TRANSLATION CONTROLS */}
          {activeTab === "translate" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>
                  World Position Coordinates
                </span>
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    onClick={() => handleTranslateChange(0, 0)}
                    className="btn btn-sm"
                    style={{ fontSize: 10, padding: "2px 6px" }}
                  >
                    Center X
                  </button>
                  <button
                    onClick={handleGroundObject}
                    className="btn btn-sm"
                    style={{ fontSize: 10, padding: "2px 6px" }}
                  >
                    Ground Y=0
                  </button>
                </div>
              </div>

              {/* X Axis */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                  <span style={{ color: "#f87171", fontWeight: 700 }}>X (Left / Right)</span>
                  <span style={{ fontFamily: "monospace", color: "#cbd5e1" }}>{activeObject.translate[0].toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="range"
                    min="-4.0"
                    max="4.0"
                    step="0.05"
                    value={activeObject.translate[0]}
                    onChange={(e) => handleTranslateChange(0, parseFloat(e.target.value))}
                    style={{ flex: 1, accentColor: "#f87171" }}
                  />
                  <input
                    type="number"
                    step="0.1"
                    value={activeObject.translate[0]}
                    onChange={(e) => handleTranslateChange(0, parseFloat(e.target.value) || 0)}
                    style={{ width: 56, padding: "4px 6px", borderRadius: 4, background: "rgba(0,0,0,0.4)", border: "1px solid var(--border-subtle)", color: "#fff", fontSize: 11, textAlign: "right" }}
                  />
                </div>
              </div>

              {/* Y Axis */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                  <span style={{ color: "#34d399", fontWeight: 700 }}>Y (Up / Down)</span>
                  <span style={{ fontFamily: "monospace", color: "#cbd5e1" }}>{activeObject.translate[1].toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="range"
                    min="-4.0"
                    max="4.0"
                    step="0.05"
                    value={activeObject.translate[1]}
                    onChange={(e) => handleTranslateChange(1, parseFloat(e.target.value))}
                    style={{ flex: 1, accentColor: "#34d399" }}
                  />
                  <input
                    type="number"
                    step="0.1"
                    value={activeObject.translate[1]}
                    onChange={(e) => handleTranslateChange(1, parseFloat(e.target.value) || 0)}
                    style={{ width: 56, padding: "4px 6px", borderRadius: 4, background: "rgba(0,0,0,0.4)", border: "1px solid var(--border-subtle)", color: "#fff", fontSize: 11, textAlign: "right" }}
                  />
                </div>
              </div>

              {/* Z Axis */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                  <span style={{ color: "#38bdf8", fontWeight: 700 }}>Z (Forward / Backward)</span>
                  <span style={{ fontFamily: "monospace", color: "#cbd5e1" }}>{activeObject.translate[2].toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="range"
                    min="-4.0"
                    max="4.0"
                    step="0.05"
                    value={activeObject.translate[2]}
                    onChange={(e) => handleTranslateChange(2, parseFloat(e.target.value))}
                    style={{ flex: 1, accentColor: "#38bdf8" }}
                  />
                  <input
                    type="number"
                    step="0.1"
                    value={activeObject.translate[2]}
                    onChange={(e) => handleTranslateChange(2, parseFloat(e.target.value) || 0)}
                    style={{ width: 56, padding: "4px 6px", borderRadius: 4, background: "rgba(0,0,0,0.4)", border: "1px solid var(--border-subtle)", color: "#fff", fontSize: 11, textAlign: "right" }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 2. ROTATION CONTROLS */}
          {activeTab === "rotate" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>
                  Rotation Angles (Degrees)
                </span>
                <button
                  onClick={() => {
                    handleRotateChange(0, 0);
                    handleRotateChange(1, 0);
                    handleRotateChange(2, 0);
                  }}
                  className="btn btn-sm"
                  style={{ fontSize: 10, padding: "2px 6px" }}
                >
                  Reset Angles
                </button>
              </div>

              {/* Pitch X */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                  <span style={{ color: "#f87171", fontWeight: 700 }}>Pitch X</span>
                  <span style={{ fontFamily: "monospace", color: "#cbd5e1" }}>{activeObject.rotate[0]}°</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    step="5"
                    value={activeObject.rotate[0]}
                    onChange={(e) => handleRotateChange(0, parseFloat(e.target.value))}
                    style={{ flex: 1, accentColor: "#f87171" }}
                  />
                  <button
                    onClick={() => handleRotateChange(0, (activeObject.rotate[0] + 90) % 360)}
                    className="btn btn-sm"
                    style={{ fontSize: 10, padding: "3px 6px" }}
                  >
                    +90°
                  </button>
                </div>
              </div>

              {/* Yaw Y */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                  <span style={{ color: "#34d399", fontWeight: 700 }}>Yaw Y (Turn)</span>
                  <span style={{ fontFamily: "monospace", color: "#cbd5e1" }}>{activeObject.rotate[1]}°</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    step="5"
                    value={activeObject.rotate[1]}
                    onChange={(e) => handleRotateChange(1, parseFloat(e.target.value))}
                    style={{ flex: 1, accentColor: "#34d399" }}
                  />
                  <button
                    onClick={() => handleRotateChange(1, (activeObject.rotate[1] + 90) % 360)}
                    className="btn btn-sm"
                    style={{ fontSize: 10, padding: "3px 6px" }}
                  >
                    +90°
                  </button>
                </div>
              </div>

              {/* Roll Z */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                  <span style={{ color: "#38bdf8", fontWeight: 700 }}>Roll Z (Tilt)</span>
                  <span style={{ fontFamily: "monospace", color: "#cbd5e1" }}>{activeObject.rotate[2]}°</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    step="5"
                    value={activeObject.rotate[2]}
                    onChange={(e) => handleRotateChange(2, parseFloat(e.target.value))}
                    style={{ flex: 1, accentColor: "#38bdf8" }}
                  />
                  <button
                    onClick={() => handleRotateChange(2, (activeObject.rotate[2] + 90) % 360)}
                    className="btn btn-sm"
                    style={{ fontSize: 10, padding: "3px 6px" }}
                  >
                    +90°
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 3. SCALE CONTROLS */}
          {activeTab === "scale" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    id="chk-uniform-scale"
                    checked={uniformScale}
                    onChange={(e) => setUniformScale(e.target.checked)}
                    style={{ cursor: "pointer" }}
                  />
                  <label htmlFor="chk-uniform-scale" style={{ fontSize: 11, fontWeight: 600, cursor: "pointer", color: "var(--text-secondary)" }}>
                    Uniform Proportions
                  </label>
                </div>

                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    onClick={() => handleScaleChange(0, 0.5)}
                    className="btn btn-sm"
                    style={{ fontSize: 10, padding: "2px 5px" }}
                  >
                    0.5x
                  </button>
                  <button
                    onClick={() => handleScaleChange(0, 1.0)}
                    className="btn btn-sm"
                    style={{ fontSize: 10, padding: "2px 5px" }}
                  >
                    1.0x
                  </button>
                  <button
                    onClick={() => handleScaleChange(0, 1.5)}
                    className="btn btn-sm"
                    style={{ fontSize: 10, padding: "2px 5px" }}
                  >
                    1.5x
                  </button>
                  <button
                    onClick={() => handleScaleChange(0, 2.0)}
                    className="btn btn-sm"
                    style={{ fontSize: 10, padding: "2px 5px" }}
                  >
                    2.0x
                  </button>
                </div>
              </div>

              {uniformScale ? (
                /* Uniform Scale Slider */
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                    <span style={{ color: "#a855f7", fontWeight: 700 }}>Uniform Scale Multiplier</span>
                    <span style={{ fontFamily: "monospace", color: "#cbd5e1" }}>{activeObject.scale[0].toFixed(2)}x</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="range"
                      min="0.1"
                      max="3.0"
                      step="0.05"
                      value={activeObject.scale[0]}
                      onChange={(e) => handleScaleChange(0, parseFloat(e.target.value))}
                      style={{ flex: 1, accentColor: "#a855f7" }}
                    />
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      max="5.0"
                      value={activeObject.scale[0]}
                      onChange={(e) => handleScaleChange(0, parseFloat(e.target.value) || 1.0)}
                      style={{ width: 56, padding: "4px 6px", borderRadius: 4, background: "rgba(0,0,0,0.4)", border: "1px solid var(--border-subtle)", color: "#fff", fontSize: 11, textAlign: "right" }}
                    />
                  </div>
                </div>
              ) : (
                /* Independent X, Y, Z Scale */
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                      <span style={{ color: "#f87171", fontWeight: 700 }}>Width Scale X</span>
                      <span style={{ fontFamily: "monospace", color: "#cbd5e1" }}>{activeObject.scale[0].toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="3.0"
                      step="0.05"
                      value={activeObject.scale[0]}
                      onChange={(e) => handleScaleChange(0, parseFloat(e.target.value))}
                      style={{ accentColor: "#f87171" }}
                    />
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                      <span style={{ color: "#34d399", fontWeight: 700 }}>Height Scale Y</span>
                      <span style={{ fontFamily: "monospace", color: "#cbd5e1" }}>{activeObject.scale[1].toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="3.0"
                      step="0.05"
                      value={activeObject.scale[1]}
                      onChange={(e) => handleScaleChange(1, parseFloat(e.target.value))}
                      style={{ accentColor: "#34d399" }}
                    />
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                      <span style={{ color: "#38bdf8", fontWeight: 700 }}>Depth Scale Z</span>
                      <span style={{ fontFamily: "monospace", color: "#cbd5e1" }}>{activeObject.scale[2].toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="3.0"
                      step="0.05"
                      value={activeObject.scale[2]}
                      onChange={(e) => handleScaleChange(2, parseFloat(e.target.value))}
                      style={{ accentColor: "#38bdf8" }}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Color Swatches */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>
              <Palette size={13} color="#f472b6" />
              <span>Part Material Color</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {QUICK_COLORS.map((col) => (
                <button
                  key={col}
                  onClick={() => handleColorChange(col)}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: col,
                    border: activeObject.color === col ? "2px solid #ffffff" : "1px solid rgba(255,255,255,0.2)",
                    boxShadow: activeObject.color === col ? `0 0 10px ${col}` : "none",
                    cursor: "pointer",
                    padding: 0,
                    transition: "transform 0.1s ease",
                  }}
                  title={col}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
