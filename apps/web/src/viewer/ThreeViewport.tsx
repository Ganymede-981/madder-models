import React, { useRef, useState, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Center, Grid } from "@react-three/drei";
import * as THREE from "three";
import { OBJLoader } from "three-stdlib";
import { 
  Camera, 
  RotateCw, 
  Layers, 
  Download, 
  Box,
  Palette
} from "lucide-react";
import { exportToSTL, exportToOBJ, exportToGLB } from "../engine/exporter.js";

export type MaterialTheme = "semantic" | "clay" | "chrome" | "hologram" | "gold" | "normal" | "wireframe";

interface ThreeViewportProps {
  geometry: THREE.BufferGeometry | null;
  objText?: string | null;
  loading?: boolean;
  meshStats?: { triangles: number; timeMs: number; resolution: number };
}

function ModelMesh({
  geometry,
  objText,
  materialTheme,
  wireframe,
}: {
  geometry: THREE.BufferGeometry | null;
  objText?: string | null;
  materialTheme: MaterialTheme;
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

  // Material selection
  const material = useMemo(() => {
    switch (materialTheme) {
      case "semantic":
        return new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.5,
          metalness: 0.15,
          wireframe,
        });
      case "clay":
        return new THREE.MeshStandardMaterial({
          color: "#e2d9cc",
          roughness: 0.65,
          metalness: 0.05,
          wireframe,
        });
      case "chrome":
        return new THREE.MeshStandardMaterial({
          color: "#1e1b4b",
          roughness: 0.15,
          metalness: 0.9,
          wireframe,
        });
      case "hologram":
        return new THREE.MeshPhysicalMaterial({
          color: "#818cf8",
          emissive: "#4338ca",
          emissiveIntensity: 0.35,
          roughness: 0.1,
          metalness: 0.1,
          transmission: 0.6,
          thickness: 1.2,
          wireframe,
        });
      case "gold":
        return new THREE.MeshStandardMaterial({
          color: "#fbbf24",
          roughness: 0.3,
          metalness: 0.85,
          wireframe,
        });
      case "normal":
        return new THREE.MeshNormalMaterial({ wireframe });
      case "wireframe":
        return new THREE.MeshBasicMaterial({ color: "#a855f7", wireframe: true });
      default:
        return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, wireframe });
    }
  }, [materialTheme, wireframe]);

  if (!activeGeometry) return null;

  return (
    <Center top>
      <mesh ref={meshRef} geometry={activeGeometry} material={material} castShadow receiveShadow />
    </Center>
  );
}

function SceneLights() {
  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[10, 15, 10]} intensity={1.2} castShadow />
      <directionalLight position={[-10, 10, -10]} intensity={0.6} color="#818cf8" />
      <pointLight position={[0, -5, 5]} intensity={0.4} color="#ec4899" />
    </>
  );
}

export function ThreeViewport({ geometry, objText, loading, meshStats }: ThreeViewportProps) {
  const [materialTheme, setMaterialTheme] = useState<MaterialTheme>("semantic");
  const [wireframe, setWireframe] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const controlsRef = useRef<any>(null);

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
          materialTheme={materialTheme}
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
        <OrbitControls
          ref={controlsRef}
          enableDamping
          dampingFactor={0.05}
          autoRotate={autoRotate}
          autoRotateSpeed={1.5}
          maxDistance={25}
          minDistance={1.5}
        />
      </Canvas>

      {/* Loading Overlay */}
      {loading && (
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
            Computing Organic Surface & Vertex Colors...
          </div>
        </div>
      )}

      {/* Floating Viewport Toolbars */}
      <div className="viewport-toolbar glass-panel" style={{ borderRadius: "var(--radius-lg)", padding: 6 }}>
        {/* Material Selector */}
        <select
          value={materialTheme}
          onChange={(e) => setMaterialTheme(e.target.value as MaterialTheme)}
          className="btn btn-sm"
          style={{ background: "rgba(0,0,0,0.3)", border: "none", outline: "none", cursor: "pointer" }}
        >
          <option value="semantic">🎨 Model Painted Colors</option>
          <option value="clay">🏺 Matte Sculpt Clay</option>
          <option value="chrome">🔮 Cyber Chrome</option>
          <option value="hologram">✨ Hologram Glass</option>
          <option value="gold">🏆 Pure Gold</option>
          <option value="normal">🌈 Normal Vector</option>
          <option value="wireframe">📐 Wireframe Mesh</option>
        </select>

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
                top: "110%",
                right: 0,
                width: 160,
                padding: 6,
                borderRadius: "var(--radius-md)",
                display: "flex",
                flexDirection: "column",
                gap: 4,
                zIndex: 30,
                boxShadow: "var(--shadow-lg)",
              }}
            >
              <button
                className="btn btn-sm"
                style={{ justifyContent: "flex-start" }}
                onClick={() => {
                  if (geometry) exportToSTL(geometry, "organic_model.stl");
                  setShowExportMenu(false);
                }}
              >
                💾 STL (3D Print)
              </button>
              <button
                className="btn btn-sm"
                style={{ justifyContent: "flex-start" }}
                onClick={() => {
                  if (geometry) exportToOBJ(geometry, "organic_model.obj");
                  setShowExportMenu(false);
                }}
              >
                📄 OBJ Mesh
              </button>
              <button
                className="btn btn-sm"
                style={{ justifyContent: "flex-start" }}
                onClick={() => {
                  if (geometry) exportToGLB(geometry, "organic_model.glb");
                  setShowExportMenu(false);
                }}
              >
                🌐 GLTF / GLB
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Info Status Card */}
      {meshStats && (
        <div className="viewport-info-card glass-panel" style={{ borderRadius: "var(--radius-md)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Box size={14} color="#6366f1" />
            <span>Triangles: <strong>{meshStats.triangles.toLocaleString()}</strong></span>
          </div>
          <div>•</div>
          <div>Grid: <strong>{meshStats.resolution}³</strong></div>
          <div>•</div>
          <div>Time: <strong>{meshStats.timeMs.toFixed(0)} ms</strong></div>
        </div>
      )}
    </div>
  );
}
