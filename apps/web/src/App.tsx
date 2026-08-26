import React, { useState, useEffect, useCallback, useRef } from "react";
import * as THREE from "three";
import type { SDFDocument } from "@madder/sdf-dsl";
import { PRESETS } from "@madder/sdf-dsl";
import { Header } from "./components/Header.js";
import { ThreeViewport } from "./viewer/ThreeViewport.js";
import { RefineMode } from "./modes/RefineMode.js";
import { CreateMode } from "./modes/CreateMode.js";
import { CodeInspector } from "./components/CodeInspector.js";
import type { WorkerOutputMessage } from "./engine/marching-cubes-worker.js";

export function App() {
  const [activeMode, setActiveMode] = useState<"create" | "refine">("refine");
  
  // SDF History stack for Undo/Redo
  const [history, setHistory] = useState<SDFDocument[]>([PRESETS.honeycombHouse]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const currentDocument = history[historyIndex] || PRESETS.honeycombHouse;

  // Viewport Geometry & Stats
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [loadingMesh, setLoadingMesh] = useState(false);
  const [meshStats, setMeshStats] = useState<{ triangles: number; timeMs: number; resolution: number } | undefined>();

  // Modals
  const [isCodeInspectorOpen, setIsCodeInspectorOpen] = useState(false);

  // Background Web Worker reference to keep UI thread at 60 FPS
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    // Instantiate background worker
    try {
      workerRef.current = new Worker(
        new URL("./engine/marching-cubes-worker.ts", import.meta.url),
        { type: "module" }
      );

      workerRef.current.onmessage = (e: MessageEvent<WorkerOutputMessage>) => {
        const { positions, normals, colors, triangleCount, elapsedMs, resolution } = e.data;
        const geom = new THREE.BufferGeometry();
        geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geom.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
        geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));

        setGeometry(geom);
        setMeshStats({
          triangles: triangleCount,
          timeMs: elapsedMs,
          resolution,
        });
        setLoadingMesh(false);
      };

      workerRef.current.onerror = (err) => {
        console.error("Marching Cubes Worker error:", err);
        setLoadingMesh(false);
      };
    } catch (err) {
      console.warn("Web Worker initialization failed, will fallback to sync:", err);
    }

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  // Compute mesh asynchronously on background thread
  const computeMesh = useCallback((doc: SDFDocument) => {
    setLoadingMesh(true);

    if (workerRef.current) {
      workerRef.current.postMessage({
        docOrNode: doc,
        resolution: doc.resolution || 64,
        bounds: doc.bounds,
      });
    }
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
        {activeMode === "create" ? (
          <CreateMode
            onModelCreated={handleUpdateDocument}
            onSendToRefine={handleSendToRefine}
          />
        ) : (
          <RefineMode
            currentDocument={currentDocument}
            onUpdateDocument={handleUpdateDocument}
            canUndo={historyIndex > 0}
            canRedo={historyIndex < history.length - 1}
            onUndo={handleUndo}
            onRedo={handleRedo}
          />
        )}

        {/* 3D Interactive Viewport */}
        <ThreeViewport
          geometry={geometry}
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
