import React, { useRef, useState, useMemo, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Center, Grid, TransformControls } from "@react-three/drei";
import * as THREE from "three";
import { OBJLoader } from "three-stdlib";
import { 
  Camera, 
  RotateCw, 
  Layers, 
  Download, 
  Box,
  Palette,
  Move,
  Maximize2,
  MousePointer,
  Sparkles
} from "lucide-react";
import type { SDFDocument, Vec3 } from "@madder/sdf-dsl";
import type { SceneObject } from "../engine/scene-tree.js";
import { extractSceneObjects, updateObjectTransform } from "../engine/scene-tree.js";
import { exportToSTL, exportToOBJ, exportToGLB } from "../engine/exporter.js";

export type TransformMode = "translate" | "rotate" | "scale" | "orbit";

interface ThreeViewportProps {
  geometry: THREE.BufferGeometry | null;
  objText?: string | null;
  loading?: boolean;
  meshStats?: { triangles: number; timeMs: number; resolution: number };
  document?: SDFDocument;
  selectedObjectId?: string | null;
  onSelectObject?: (id: string | null) => void;
  onUpdateDocument?: (doc: SDFDocument) => void;
  transformMode?: TransformMode;
  onTransformModeChange?: (mode: TransformMode) => void;
  qualityScore?: number | null;
}

function ModelMesh({
  geometry,
  objText,
  wireframe,
}: {
  geometry: THREE.BufferGeometry | null;
  objText?: string | null;
  wireframe: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  const parsedOBJGeometry = useMemo(() => {
    if (!objText) return null;
    try {
      const loader = new OBJLoader();
      const group = loader.parse(objText);
      let geom: THREE.BufferGeometry | null = null;
      group.traverse((child) => {
        if ((child as THREE.Mesh).isMesh && !geom) {
          geom = (child as THREE.Mesh).geometry;
        }
      });
      if (geom) {
        (geom as THREE.BufferGeometry).computeVertexNormals();
        return geom as THREE.BufferGeometry;
      }
    } catch (e) {
      console.error("Failed to parse OBJ string:", e);
    }
    return null;
  }, [objText]);

  const activeGeometry = geometry || parsedOBJGeometry;
  const hasColors = Boolean(activeGeometry?.getAttribute("color"));

  // Always display model painted colors with full opacity, double-sided rendering, and clear visibility
  const material = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      vertexColors: hasColors,
      color: hasColors ? "#ffffff" : "#818cf8",
      roughness: 0.35,
      metalness: 0.08,
      side: THREE.DoubleSide,
      shadowSide: THREE.DoubleSide,
      wireframe,
    });
  }, [hasColors, wireframe]);

  if (!activeGeometry) return null;

  return (
    <Center top key={activeGeometry.id}>
      <mesh ref={meshRef} geometry={activeGeometry} material={material} castShadow receiveShadow />
    </Center>
  );
}

function SceneLights() {
  return (
    <>
      <ambientLight intensity={1.1} />
      <directionalLight position={[10, 18, 12]} intensity={1.6} castShadow />
      <directionalLight position={[-12, 10, -10]} intensity={1.0} color="#e0e7ff" />
      <directionalLight position={[0, -10, 5]} intensity={0.6} color="#cbd5e1" />
      <pointLight position={[6, 8, 6]} intensity={0.7} />
      <hemisphereLight intensity={0.4} groundColor="#0f172a" color="#ffffff" />
    </>
  );
}

/**
 * 3D Interactive Transform Gizmo attached to active object position
 */
function ViewportTransformGizmo({
  activeObject,
  transformMode,
  onTransformChange,
  setIsDragging,
}: {
  activeObject: SceneObject | null;
  transformMode: TransformMode;
  onTransformChange: (t: { translate?: Vec3; rotate?: Vec3; scale?: Vec3 }) => void;
  setIsDragging: (dragging: boolean) => void;
}) {
  const dummyMeshRef = useRef<THREE.Mesh>(null);
  const gizmoRef = useRef<any>(null);

  useEffect(() => {
    if (dummyMeshRef.current && activeObject) {
      dummyMeshRef.current.position.set(
        activeObject.translate[0],
        activeObject.translate[1],
        activeObject.translate[2]
      );
      dummyMeshRef.current.rotation.set(
        (activeObject.rotate[0] * Math.PI) / 180,
        (activeObject.rotate[1] * Math.PI) / 180,
        (activeObject.rotate[2] * Math.PI) / 180
      );
      dummyMeshRef.current.scale.set(
        activeObject.scale[0],
        activeObject.scale[1],
        activeObject.scale[2]
      );
    }
  }, [activeObject]);

  if (!activeObject || transformMode === "orbit") return null;

  return (
    <>
      <mesh ref={dummyMeshRef} position={activeObject.translate} visible={false}>
        <boxGeometry args={[0.2, 0.2, 0.2]} />
      </mesh>
      {dummyMeshRef.current && (
        <TransformControls
          ref={gizmoRef}
          object={dummyMeshRef.current}
          mode={transformMode}
          size={0.65}
          space="world"
          onMouseDown={() => setIsDragging(true)}
          onMouseUp={() => {
            setIsDragging(false);
            if (dummyMeshRef.current) {
              const pos = dummyMeshRef.current.position;
              const rot = dummyMeshRef.current.rotation;
              const sc = dummyMeshRef.current.scale;
              onTransformChange({
                translate: [
                  Math.round(pos.x * 100) / 100,
                  Math.round(pos.y * 100) / 100,
                  Math.round(pos.z * 100) / 100,
                ],
                rotate: [
                  Math.round((rot.x * 180) / Math.PI),
                  Math.round((rot.y * 180) / Math.PI),
                  Math.round((rot.z * 180) / Math.PI),
                ],
                scale: [
                  Math.round(sc.x * 100) / 100,
                  Math.round(sc.y * 100) / 100,
                  Math.round(sc.z * 100) / 100,
                ],
              });
            }
          }}
        />
      )}
    </>
  );
}

export function ThreeViewport({ 
  geometry, 
  objText, 
  loading, 
  meshStats,
  document,
  selectedObjectId,
  onSelectObject,
  onUpdateDocument,
  transformMode: externalTransformMode,
  onTransformModeChange,
  qualityScore,
}: ThreeViewportProps) {
  const [wireframe, setWireframe] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [internalTransformMode, setInternalTransformMode] = useState<TransformMode>("translate");
  const [isDraggingGizmo, setIsDraggingGizmo] = useState(false);
  const controlsRef = useRef<any>(null);

  const activeTransformMode = externalTransformMode ?? internalTransformMode;

  const setTransformMode = (mode: TransformMode) => {
    if (onTransformModeChange) {
      onTransformModeChange(mode);
    } else {
      setInternalTransformMode(mode);
    }
  };

  const objects = useMemo(() => (document ? extractSceneObjects(document) : []), [document]);
  const activeObject = objects.find((o) => o.id === selectedObjectId) || objects[0] || null;

  // Keyboard shortcut listener for W, E, R, Q
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;

      if (e.key === "w" || e.key === "W") setTransformMode("translate");
      if (e.key === "e" || e.key === "E") setTransformMode("rotate");
      if (e.key === "r" || e.key === "R") setTransformMode("scale");
      if (e.key === "q" || e.key === "Q" || e.key === "Escape") setTransformMode("orbit");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleGizmoTransformChange = (t: { translate?: Vec3; rotate?: Vec3; scale?: Vec3 }) => {
    if (!document || !activeObject || !onUpdateDocument) return;
    const updated = updateObjectTransform(document, activeObject.id, t);
    onUpdateDocument(updated);
  };

  const resetCamera = () => {
    if (controlsRef.current) {
      controlsRef.current.reset();
    }
  };

  return (
    <div className="viewport-panel" style={{ width: "100%", height: "100%", position: "relative" }}>
      {/* 3D Canvas */}
      <Canvas
        shadows
        camera={{ position: [5, 4, 6], fov: 45 }}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
      >
        <SceneLights />
        <ModelMesh
          geometry={geometry}
          objText={objText}
          wireframe={wireframe}
        />
        <Grid
          position={[0, -0.01, 0]}
          args={[20, 20]}
          cellSize={0.5}
          cellThickness={0.6}
          cellColor="#334155"
          sectionSize={2.0}
          sectionThickness={1.2}
          sectionColor="#6366f1"
          fadeDistance={15}
          fadeStrength={1}
        />
        <ViewportTransformGizmo
          activeObject={activeObject}
          transformMode={activeTransformMode}
          onTransformChange={handleGizmoTransformChange}
          setIsDragging={setIsDraggingGizmo}
        />
        <OrbitControls
          ref={controlsRef}
          enabled={!isDraggingGizmo}
          enableDamping
          dampingFactor={0.05}
          autoRotate={autoRotate}
          autoRotateSpeed={1.5}
          maxDistance={25}
          minDistance={1.5}
        />
      </Canvas>

      {/* Top Part Quick-Select Bar */}
      {objects.length > 0 && onSelectObject && (
        <div
          style={{
            position: "absolute",
            top: 14,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "rgba(15, 23, 42, 0.75)",
            backdropFilter: "blur(12px)",
            padding: "4px 8px",
            borderRadius: "var(--radius-lg)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            zIndex: 10,
            maxWidth: "90%",
            overflowX: "auto",
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginRight: 4, whiteSpace: "nowrap" }}>
            PARTS:
          </span>
          {objects.map((obj) => {
            const isSelected = activeObject?.id === obj.id;
            return (
              <button
                key={obj.id}
                onClick={() => onSelectObject(obj.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 10px",
                  borderRadius: "var(--radius-md)",
                  background: isSelected ? "rgba(99, 102, 241, 0.3)" : "rgba(255, 255, 255, 0.05)",
                  border: isSelected ? "1px solid rgba(99, 102, 241, 0.8)" : "1px solid rgba(255, 255, 255, 0.08)",
                  color: isSelected ? "#ffffff" : "#94a3b8",
                  fontSize: 11,
                  fontWeight: isSelected ? 700 : 500,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  transition: "all 0.15s ease",
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: obj.color || "#818cf8",
                  }}
                />
                <span>{obj.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Floating 3D Transform Mode Switcher (Left Side) */}
      <div
        style={{
          position: "absolute",
          top: 14,
          left: 14,
          display: "flex",
          flexDirection: "column",
          gap: 4,
          background: "rgba(15, 23, 42, 0.8)",
          backdropFilter: "blur(12px)",
          padding: 4,
          borderRadius: "var(--radius-md)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          zIndex: 10,
        }}
      >
        <button
          onClick={() => setTransformMode("orbit")}
          className={`btn btn-sm btn-icon ${activeTransformMode === "orbit" ? "btn-primary" : ""}`}
          title="Orbit / View Mode (Q)"
        >
          <MousePointer size={14} />
        </button>
        <button
          onClick={() => setTransformMode("translate")}
          className={`btn btn-sm btn-icon ${activeTransformMode === "translate" ? "btn-primary" : ""}`}
          title="Translate / Move Object (W)"
        >
          <Move size={14} />
        </button>
        <button
          onClick={() => setTransformMode("rotate")}
          className={`btn btn-sm btn-icon ${activeTransformMode === "rotate" ? "btn-primary" : ""}`}
          title="Rotate Object (E)"
        >
          <RotateCw size={14} />
        </button>
        <button
          onClick={() => setTransformMode("scale")}
          className={`btn btn-sm btn-icon ${activeTransformMode === "scale" ? "btn-primary" : ""}`}
          title="Scale Object (R)"
        >
          <Maximize2 size={14} />
        </button>
      </div>

      {/* Quality Score Badge */}
      {qualityScore !== undefined && qualityScore !== null && (
        <div
          style={{
            position: "absolute",
            top: 14,
            left: 14,
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "rgba(15, 23, 42, 0.85)",
            backdropFilter: "blur(12px)",
            padding: "6px 14px",
            borderRadius: "var(--radius-full)",
            border: "1px solid rgba(245, 158, 11, 0.4)",
            boxShadow: "0 4px 14px rgba(0,0,0,0.3)",
            zIndex: 15,
          }}
          id="quality-score-badge"
        >
          <Sparkles size={14} color="#fbbf24" />
          <span style={{ fontSize: 12, fontWeight: 700, color: "#fef3c7", letterSpacing: "0.02em" }}>
            Quality: {qualityScore.toFixed(1)}/10
          </span>
        </div>
      )}

      {/* Loading Feedback: Subtle badge when updating, Full overlay on initial load */}
      {loading && !geometry && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(8, 11, 17, 0.7)",
            backdropFilter: "blur(6px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            zIndex: 15,
          }}
        >
          <div className="animate-spin" style={{ width: 44, height: 44, border: "3px solid rgba(99, 102, 241, 0.2)", borderTopColor: "#6366f1", borderRadius: "50%" }} />
          <div style={{ fontSize: 14, fontWeight: 500, color: "#f8fafc" }}>
            Computing Organic Surface &amp; Vertex Colors...
          </div>
        </div>
      )}

      {loading && geometry && (
        <div
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(15, 23, 42, 0.85)",
            backdropFilter: "blur(12px)",
            padding: "6px 12px",
            borderRadius: "var(--radius-md)",
            border: "1px solid rgba(99, 102, 241, 0.4)",
            zIndex: 15,
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          }}
        >
          <div className="animate-spin" style={{ width: 14, height: 14, border: "2px solid rgba(99, 102, 241, 0.3)", borderTopColor: "#818cf8", borderRadius: "50%" }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: "#cbd5e1" }}>Updating 3D Mesh...</span>
        </div>
      )}

      {/* Floating Viewport Toolbars (Bottom/Right) */}
      <div className="viewport-toolbar glass-panel" style={{ borderRadius: "var(--radius-lg)", padding: 6 }}>
        {/* Toggle Wireframe overlay */}
        <button
          onClick={() => setWireframe(!wireframe)}
          className={`btn btn-sm ${wireframe ? "btn-primary" : ""}`}
          title="Toggle Wireframe Overlay"
        >
          <Layers size={14} />
        </button>

        {/* Auto Rotate Toggle */}
        <button
          onClick={() => setAutoRotate(!autoRotate)}
          className={`btn btn-sm ${autoRotate ? "btn-primary" : ""}`}
          title="Toggle Auto Rotation"
        >
          <RotateCw size={14} />
        </button>

        {/* Reset Camera */}
        <button onClick={resetCamera} className="btn btn-sm" title="Reset Viewport Camera">
          <Camera size={14} />
        </button>

        {/* Export Dropdown */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            className="btn btn-sm btn-primary"
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <Download size={14} />
            <span>Export</span>
          </button>

          {showExportMenu && (
            <div
              className="glass-panel"
              style={{
                position: "absolute",
                bottom: "100%",
                right: 0,
                marginBottom: 8,
                borderRadius: "var(--radius-md)",
                padding: 6,
                display: "flex",
                flexDirection: "column",
                gap: 4,
                width: 140,
                zIndex: 20,
              }}
            >
              <button
                onClick={() => {
                  if (geometry) exportToSTL(geometry, "madder-model");
                  setShowExportMenu(false);
                }}
                disabled={!geometry}
                className="btn btn-sm"
                style={{ width: "100%", justifyContent: "flex-start" }}
              >
                STL (.stl)
              </button>
              <button
                onClick={() => {
                  if (geometry) exportToOBJ(geometry, "madder-model");
                  setShowExportMenu(false);
                }}
                disabled={!geometry}
                className="btn btn-sm"
                style={{ width: "100%", justifyContent: "flex-start" }}
              >
                OBJ (.obj)
              </button>
              <button
                onClick={() => {
                  if (geometry) exportToGLB(geometry, "madder-model");
                  setShowExportMenu(false);
                }}
                disabled={!geometry}
                className="btn btn-sm"
                style={{ width: "100%", justifyContent: "flex-start" }}
              >
                GLB (.glb)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
