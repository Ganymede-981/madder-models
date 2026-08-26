import React, { useState, useEffect, useCallback } from "react";
import * as THREE from "three";
import type { SDFDocument } from "@madder/sdf-dsl";
import { PRESETS } from "@madder/sdf-dsl";
import { generateSDFMesh } from "./engine/marching-cubes.js";
import { Header } from "./components/Header.js";
import { ThreeViewport } from "./viewer/ThreeViewport.js";
import { RefineMode } from "./modes/RefineMode.js";
import { GenerateMode } from "./modes/GenerateMode.js";
import { CodeInspector } from "./components/CodeInspector.js";

export function App() {
  const [activeMode, setActiveMode] = useState<"generate" | "refine">("refine");
  
  // SDF History stack for Undo/Redo
  const [history, setHistory] = useState<SDFDocument[]>([PRESETS.honeycombHouse]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const currentDocument = history[historyIndex] || PRESETS.honeycombHouse;

  // Viewport Geometry & Stats
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [objText, setObjText] = useState<string | null>(null);
  const [loadingMesh, setLoadingMesh] = useState(false);
  const [meshStats, setMeshStats] = useState<{ triangles: number; timeMs: number; resolution: number } | undefined>();

  // Modals
  const [isCodeInspectorOpen, setIsCodeInspectorOpen] = useState(false);

  // Compute mesh when currentDocument changes
  const computeMesh = useCallback((doc: SDFDocument) => {
    setLoadingMesh(true);
    const start = performance.now();

    requestAnimationFrame(() => {
      try {
        const geom = generateSDFMesh(doc, {
          resolution: doc.resolution || 96,
          bounds: doc.bounds,
        });
        const elapsed = performance.now() - start;
        const triCount = (geom.getAttribute("position")?.count || 0) / 3;

        setGeometry(geom);
        setObjText(null); // Clear raw OBJ when using active SDF
        setMeshStats({
          triangles: triCount,
          timeMs: elapsed,
          resolution: doc.resolution || 96,
        });
      } catch (err) {
        console.error("Failed to generate SDF mesh:", err);
      } finally {
        setLoadingMesh(false);
      }
    });
  }, []);

  useEffect(() => {
    computeMesh(currentDocument);
  }, [currentDocument, computeMesh]);

  // Document update handler (pushes to history)
  const handleUpdateDocument = (newDoc: SDFDocument) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newDoc);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
    }
  };

  const handleGeneratedOBJ = (rawObj: string) => {
    setObjText(rawObj);
    setGeometry(null);
    setMeshStats({
      triangles: 25000,
      timeMs: 12,
      resolution: 0,
    });
  };

  const handleSendToRefine = (doc: SDFDocument) => {
    handleUpdateDocument(doc);
    setActiveMode("refine");
  };

  return (
    <div className="app-container">
      {/* Top Header */}
      <Header
        activeMode={activeMode}
        setActiveMode={setActiveMode}
        onOpenJsonEditor={() => setIsCodeInspectorOpen(true)}
      />

      {/* Main Workspace */}
      <main className="app-main">
        {activeMode === "refine" ? (
          <RefineMode
            currentDocument={currentDocument}
            onUpdateDocument={handleUpdateDocument}
            canUndo={historyIndex > 0}
            canRedo={historyIndex < history.length - 1}
            onUndo={handleUndo}
            onRedo={handleRedo}
          />
        ) : (
          <GenerateMode
            onGeneratedOBJ={handleGeneratedOBJ}
            onSendToRefine={handleSendToRefine}
          />
        )}

        {/* 3D Interactive Viewport */}
        <ThreeViewport
          geometry={geometry}
          objText={objText}
          loading={loadingMesh}
          meshStats={meshStats}
        />
      </main>

      {/* SDF-DSL Inspector Modal */}
      <CodeInspector
        isOpen={isCodeInspectorOpen}
        onClose={() => setIsCodeInspectorOpen(false)}
        document={currentDocument}
        onApplyChanges={handleUpdateDocument}
      />
    </div>
  );
}
