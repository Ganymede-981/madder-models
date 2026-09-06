import React, { useState, useEffect, useCallback, useRef } from "react";
import * as THREE from "three";
import type { SDFDocument } from "@madder/sdf-dsl";
import 
{ PRESETS } from "@madder/sdf-dsl";
import { Header } from "./components/Header.js";
import { ThreeViewport, type TransformMode } from "./viewer/ThreeViewport.js";
import { ChatPanel } from "./components/ChatPanel.js";
import { ChatHistory, type ChatSession, type ChatMessage } from "./components/ChatHistory.js";
import { CodeInspector } from "./components/CodeInspector.js";
import type { WorkerOutputMessage } from "./engine/marching-cubes-worker.js";

const LOCAL_STORAGE_SESSIONS_KEY = "madder_chat_sessions_v2";

function createInitialSession(id?: string): ChatSession {
  const sessionId = id || `session_${Date.now()}`;
  return {
    id: sessionId,
    title: "New 3D Model",
    timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    promptPreview: "Ready for your 3D prompt...",
    document: PRESETS.honeycombHouse,
    score: null,
    messages: [
      {
        id: "welcome",
        sender: "assistant",
        text: "👋 Welcome to Madder Models! Describe any 3D concept to create a model with closed-loop critic verification, or ask follow-up questions to refine it conversational-style.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ],
  };
}

export function App() {
  // Chat Sessions
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_SESSIONS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn("Failed to load sessions from localStorage:", e);
    }
    return [createInitialSession()];
  });

  const [activeSessionId, setActiveSessionId] = useState<string>(() => sessions[0]?.id || `session_${Date.now()}`);
  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0] || createInitialSession();

  // Save sessions to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_SESSIONS_KEY, JSON.stringify(sessions));
    } catch (e) {
      console.warn("Failed to save sessions to localStorage:", e);
    }
  }, [sessions]);

  // History stack for Undo/Redo inside active model
  const [history, setHistory] = useState<SDFDocument[]>([activeSession.document || PRESETS.honeycombHouse]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const currentDocument = history[historyIndex] || activeSession.document || PRESETS.honeycombHouse;
  const currentScore = activeSession.score;

  // Sync activeSession document changes when switching sessions
  useEffect(() => {
    if (activeSession && activeSession.document) {
      setHistory([activeSession.document]);
      setHistoryIndex(0);
    }
  }, [activeSessionId]);

  // Viewport 3D Transform Mode & Selection
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [transformMode, setTransformMode] = useState<TransformMode>("translate");

  // Viewport Geometry & Stats
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [loadingMesh, setLoadingMesh] = useState(false);
  const [meshStats, setMeshStats] = useState<{ triangles: number; timeMs: number; resolution: number } | undefined>();

  // Modals & Drawers
  const [isCodeInspectorOpen, setIsCodeInspectorOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Request & Generation State
  const [loadingRequest, setLoadingRequest] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<"planning" | "sculpting" | "critic" | null>(null);

  // Background Web Worker reference
  const workerRef = useRef<Worker | null>(null);
  const activeJobId = useRef(0);
  const latestProcessedJobId = useRef(0);
  const debounceTimerRef = useRef<any>(null);

  const initWorker = useCallback(() => {
    try {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
      const worker = new Worker(
        new URL("./engine/marching-cubes-worker.ts", import.meta.url),
        { type: "module" }
      );

      worker.onmessage = (e: MessageEvent<WorkerOutputMessage>) => {
        if (e.data.jobId !== undefined && e.data.jobId < latestProcessedJobId.current) {
          return;
        }
        if (e.data.jobId !== undefined) {
          latestProcessedJobId.current = e.data.jobId;
        }

        const { positions, normals, colors, triangleCount, elapsedMs, resolution } = e.data;
        if (positions && positions.length > 0) {
          const geom = new THREE.BufferGeometry();
          geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
          if (normals && normals.length > 0) {
            geom.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
          } else {
            geom.computeVertexNormals();
          }
          if (colors && colors.length > 0) {
            geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
          }
          geom.computeBoundingBox();
          geom.computeBoundingSphere();
          setGeometry(geom);
        }

        setMeshStats({
          triangles: triangleCount,
          timeMs: elapsedMs,
          resolution,
        });
        setLoadingMesh(false);
      };

      worker.onerror = (err) => {
        console.error("Marching Cubes Worker error:", err);
        setLoadingMesh(false);
        // Automatically restart worker so the studio stays responsive
        setTimeout(() => initWorker(), 150);
      };

      workerRef.current = worker;
    } catch (err) {
      console.warn("Web Worker initialization failed, fallback:", err);
    }
  }, []);

  useEffect(() => {
    initWorker();
    return () => {
      workerRef.current?.terminate();
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [initWorker]);

  // Compute mesh asynchronously on background thread
  const computeMesh = useCallback((doc: SDFDocument) => {
    if (!doc) return;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(() => {
      const jobId = ++activeJobId.current;
      setLoadingMesh(true);

      if (!workerRef.current) {
        initWorker();
      }

      if (workerRef.current) {
        workerRef.current.postMessage({
          jobId,
          docOrNode: doc,
          resolution: doc.resolution || 64,
          bounds: doc.bounds,
        });
      }
    }, 40);
  }, [initWorker]);

  useEffect(() => {
    computeMesh(currentDocument);
  }, [currentDocument, computeMesh]);

  // Document update handler (pushes to history and updates active session)
  const handleUpdateDocument = (newDoc: SDFDocument, newScore?: number | null) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newDoc);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);

    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSessionId
          ? {
              ...s,
              document: newDoc,
              score: newScore !== undefined ? newScore : s.score,
              title: newDoc.name || s.title,
            }
          : s
      )
    );
  };

  const handleUndo = () => {
    if (historyIndex > 0) setHistoryIndex(historyIndex - 1);
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) setHistoryIndex(historyIndex + 1);
  };

  // Switch active session and recompute mesh for selected model
  const handleSelectSession = (sessionId: string) => {
    setActiveSessionId(sessionId);
    const targetSession = sessions.find((s) => s.id === sessionId);
    if (targetSession?.document) {
      setHistory([targetSession.document]);
      setHistoryIndex(0);
      computeMesh(targetSession.document);
    }
  };

  // Start a fresh 3D Model session
  const handleNewModel = () => {
    const newSession = createInitialSession();
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
  };

  // Delete a session
  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessions((prev) => {
      const filtered = prev.filter((s) => s.id !== sessionId);
      if (filtered.length === 0) {
        const fresh = createInitialSession();
        setActiveSessionId(fresh.id);
        return [fresh];
      }
      if (activeSessionId === sessionId) {
        setActiveSessionId(filtered[0].id);
      }
      return filtered;
    });
  };

  // Conversational Send Message Handler (/api/chat)
  const handleSendMessage = async (text: string) => {
    const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const userMsg: ChatMessage = {
      id: String(Date.now()),
      sender: "user",
      text,
      timestamp: timeStr,
    };

    // Optimistically append user message
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSessionId
          ? {
              ...s,
              messages: [...s.messages, userMsg],
              promptPreview: text,
            }
          : s
      )
    );

    setLoadingRequest(true);
    const isNew = activeSession.messages.length <= 1;
    setLoadingPhase(isNew ? "planning" : "sculpting");

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL ?? ""}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: activeSessionId,
          message: text,
          max_rounds: 3,
          new_model: isNew,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `Server error (${response.status})`);
      }

      const data = await response.json();
      const assistantText = data.message || "Model updated successfully.";
      const finalDoc: SDFDocument = data.document;
      const finalScore: number | null = data.final_score !== undefined ? data.final_score : null;

      const assistantMsg: ChatMessage = {
        id: String(Date.now() + 1),
        sender: "assistant",
        text: assistantText,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        score: finalScore,
      };

      if (finalDoc) {
        handleUpdateDocument(finalDoc, finalScore);
      }

      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId
            ? {
                ...s,
                title: finalDoc?.name || s.title,
                document: finalDoc || s.document,
                score: finalScore,
                messages: [...s.messages, assistantMsg],
              }
            : s
        )
      );
    } catch (err: any) {
      console.error("API Chat Error:", err);
      const errorMsg: ChatMessage = {
        id: String(Date.now() + 1),
        sender: "assistant",
        text: `⚠️ Error: ${err.message || "Could not generate or refine model."}`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId
            ? { ...s, messages: [...s.messages, errorMsg] }
            : s
        )
      );
    } finally {
      setLoadingRequest(false);
      setLoadingPhase(null);
    }
  };

  return (
    <div className="app-container">
      {/* Top Header */}
      <Header
        onNewModel={handleNewModel}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onOpenJsonEditor={() => setIsCodeInspectorOpen(true)}
        sessionCount={sessions.length}
      />

      {/* Main Studio Workspace */}
      <main className="app-main">
        {/* Unified Conversational Chat & Refine Panel */}
        <ChatPanel
          currentDocument={currentDocument}
          onUpdateDocument={handleUpdateDocument}
          canUndo={historyIndex > 0}
          canRedo={historyIndex < history.length - 1}
          onUndo={handleUndo}
          onRedo={handleRedo}
          selectedObjectId={selectedObjectId}
          onSelectObject={setSelectedObjectId}
          sessionId={activeSessionId}
          messages={activeSession.messages}
          onSendMessage={handleSendMessage}
          onNewModel={handleNewModel}
          loading={loadingRequest}
          loadingPhase={loadingPhase}
          qualityScore={currentScore}
        />

        {/* 3D Interactive Viewport */}
        <ThreeViewport
          geometry={geometry}
          loading={loadingMesh}
          meshStats={meshStats}
          document={currentDocument}
          selectedObjectId={selectedObjectId}
          onSelectObject={setSelectedObjectId}
          onUpdateDocument={handleUpdateDocument}
          transformMode={transformMode}
          onTransformModeChange={setTransformMode}
          qualityScore={currentScore}
        />
      </main>

      {/* Sessions History Drawer */}
      <ChatHistory
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewModel}
        onDeleteSession={handleDeleteSession}
      />

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
