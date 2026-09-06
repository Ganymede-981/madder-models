import type { SDFDocument, SDFNode, Vec3 } from "@madder/sdf-dsl";
import { evaluateSDFWithMaterial, computeSDFNormal, computeTightAABB, autoResolution } from "./sdf-evaluator.js";
import { EDGE_TABLE, TRI_TABLE } from "./marching-cubes-tables.js";

export interface WorkerInputMessage {
  jobId?: number;
  docOrNode: SDFDocument | SDFNode;
  resolution?: number;
  bounds?: { min: Vec3; max: Vec3 };
  isoLevel?: number;
}

export interface WorkerOutputMessage {
  jobId?: number;
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  triangleCount: number;
  elapsedMs: number;
  resolution: number;
  bounds: { min: Vec3; max: Vec3 };
  wasUpscaled: boolean;
}

self.onmessage = (e: MessageEvent<WorkerInputMessage>) => {
  const start = performance.now();
  const { jobId, docOrNode, resolution = 64, bounds: inputBounds, isoLevel = 0.0 } = e.data;
  
  try {
    if (!docOrNode) {
      throw new Error("No SDF Document provided to worker");
    }
    const rootNode: SDFNode = typeof docOrNode === "object" && "root" in docOrNode && (docOrNode as any).root
      ? (docOrNode as any).root
      : (docOrNode as SDFNode);

    // WS1.2 — Auto-fit bounding box: compute tight AABB analytically, add 0.35-unit margin
    const rawAABB = computeTightAABB(rootNode);
    const isAABBValid = isFinite(rawAABB.min[0]) && isFinite(rawAABB.max[0]) && rawAABB.min[0] < 1e8 && rawAABB.max[0] > -1e8;
    const MARGIN = 0.35;
    const autoMin: Vec3 = isAABBValid
      ? [
          Math.max(rawAABB.min[0] - MARGIN, -8),
          Math.max(rawAABB.min[1] - MARGIN, -8),
          Math.max(rawAABB.min[2] - MARGIN, -8),
        ]
      : inputBounds?.min ?? [-3.5, -3.5, -3.5];
    const autoMax: Vec3 = isAABBValid
      ? [
          Math.min(rawAABB.max[0] + MARGIN, 8),
          Math.min(rawAABB.max[1] + MARGIN, 8),
          Math.min(rawAABB.max[2] + MARGIN, 8),
        ]
      : inputBounds?.max ?? [3.5, 3.5, 3.5];
    const effectiveBounds = { min: autoMin, max: autoMax };

  // WS1.1 — Auto-raise resolution for thin features (≥ 2.5 voxels per feature, capped at 88)
  const baseRes = Math.min(Math.max(resolution, 64), 72);
  const { resolution: N, wasUpscaled } = autoResolution(rootNode, effectiveBounds, baseRes, 2.5, 88);
  if (wasUpscaled) {
    console.warn(`[MarchingCubes] Resolution auto-raised to ${N} to resolve thin features.`);
  }

  const min = effectiveBounds.min;
  const max = effectiveBounds.max;
  const stepX = (max[0] - min[0]) / (N - 1);
  const stepY = (max[1] - min[1]) / (N - 1);
  const stepZ = (max[2] - min[2]) / (N - 1);

  const grid = new Float32Array(N * N * N);
  const colorGrid = new Float32Array(N * N * N * 3);
  let idx = 0;
  let colorIdx = 0;

  for (let z = 0; z < N; z++) {
    const pz = min[2] + z * stepZ;
    for (let y = 0; y < N; y++) {
      const py = min[1] + y * stepY;
      for (let x = 0; x < N; x++) {
        const px = min[0] + x * stepX;
        const evalRes = evaluateSDFWithMaterial(rootNode, [px, py, pz]);
        grid[idx++] = evalRes.distance;
        colorGrid[colorIdx++] = evalRes.color[0];
        colorGrid[colorIdx++] = evalRes.color[1];
        colorGrid[colorIdx++] = evalRes.color[2];
      }
    }
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];

  const cornerOffsets: [number, number, number][] = [
    [0, 0, 0],
    [1, 0, 0],
    [1, 1, 0],
    [0, 1, 0],
    [0, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
    [0, 1, 1],
  ];

  const vertList: [number, number, number][] = new Array(12);
  const colorList: [number, number, number][] = new Array(12);

  function getGridValue(x: number, y: number, z: number): number {
    return grid[x + y * N + z * N * N];
  }

  function getGridColor(x: number, y: number, z: number): [number, number, number] {
    const base = (x + y * N + z * N * N) * 3;
    return [colorGrid[base], colorGrid[base + 1], colorGrid[base + 2]];
  }

  function interpolateVertex(
    p1: Vec3,
    p2: Vec3,
    c1: [number, number, number],
    c2: [number, number, number],
    val1: number,
    val2: number
  ): { pos: [number, number, number]; color: [number, number, number] } {
    if (Math.abs(isoLevel - val1) < 0.00001) return { pos: [p1[0], p1[1], p1[2]], color: c1 };
    if (Math.abs(isoLevel - val2) < 0.00001) return { pos: [p2[0], p2[1], p2[2]], color: c2 };
    if (Math.abs(val1 - val2) < 0.00001) return { pos: [p1[0], p1[1], p1[2]], color: c1 };
    const mu = (isoLevel - val1) / (val2 - val1);
    const pos: [number, number, number] = [
      p1[0] + mu * (p2[0] - p1[0]),
      p1[1] + mu * (p2[1] - p1[1]),
      p1[2] + mu * (p2[2] - p1[2]),
    ];
    const color: [number, number, number] = [
      c1[0] + mu * (c2[0] - c1[0]),
      c1[1] + mu * (c2[1] - c1[1]),
      c1[2] + mu * (c2[2] - c1[2]),
    ];
    return { pos, color };
  }

  for (let z = 0; z < N - 1; z++) {
    for (let y = 0; y < N - 1; y++) {
      for (let x = 0; x < N - 1; x++) {
        let cubeIndex = 0;
        const cellVals: number[] = [];
        const cellPos: Vec3[] = [];
        const cellColors: [number, number, number][] = [];

        for (let i = 0; i < 8; i++) {
          const cx = x + cornerOffsets[i][0];
          const cy = y + cornerOffsets[i][1];
          const cz = z + cornerOffsets[i][2];
          const val = getGridValue(cx, cy, cz);
          cellVals.push(val);
          cellPos.push([min[0] + cx * stepX, min[1] + cy * stepY, min[2] + cz * stepZ]);
          cellColors.push(getGridColor(cx, cy, cz));
          if (val < isoLevel) {
            cubeIndex |= 1 << i;
          }
        }

        const edgeMask = EDGE_TABLE[cubeIndex];
        if (edgeMask === 0) continue;

        const setEdge = (edgeIdx: number, i1: number, i2: number) => {
          const res = interpolateVertex(cellPos[i1], cellPos[i2], cellColors[i1], cellColors[i2], cellVals[i1], cellVals[i2]);
          vertList[edgeIdx] = res.pos;
          colorList[edgeIdx] = res.color;
        };

        if (edgeMask & 1) setEdge(0, 0, 1);
        if (edgeMask & 2) setEdge(1, 1, 2);
        if (edgeMask & 4) setEdge(2, 2, 3);
        if (edgeMask & 8) setEdge(3, 3, 0);
        if (edgeMask & 16) setEdge(4, 4, 5);
        if (edgeMask & 32) setEdge(5, 5, 6);
        if (edgeMask & 64) setEdge(6, 6, 7);
        if (edgeMask & 128) setEdge(7, 7, 4);
        if (edgeMask & 256) setEdge(8, 0, 4);
        if (edgeMask & 512) setEdge(9, 1, 5);
        if (edgeMask & 1024) setEdge(10, 2, 6);
        if (edgeMask & 2048) setEdge(11, 3, 7);

        for (let i = 0; TRI_TABLE[cubeIndex * 16 + i] !== -1; i += 3) {
          const idx0 = TRI_TABLE[cubeIndex * 16 + i];
          const idx1 = TRI_TABLE[cubeIndex * 16 + i + 1];
          const idx2 = TRI_TABLE[cubeIndex * 16 + i + 2];

          const v0 = vertList[idx0];
          const v1 = vertList[idx1];
          const v2 = vertList[idx2];

          positions.push(v0[0], v0[1], v0[2]);
          positions.push(v1[0], v1[1], v1[2]);
          positions.push(v2[0], v2[1], v2[2]);

          const c0 = colorList[idx0];
          const c1 = colorList[idx1];
          const c2 = colorList[idx2];

          colors.push(c0[0], c0[1], c0[2]);
          colors.push(c1[0], c1[1], c1[2]);
          colors.push(c2[0], c2[1], c2[2]);

          const n0 = computeSDFNormal(rootNode, v0);
          const n1 = computeSDFNormal(rootNode, v1);
          const n2 = computeSDFNormal(rootNode, v2);

          normals.push(n0[0], n0[1], n0[2]);
          normals.push(n1[0], n1[1], n1[2]);
          normals.push(n2[0], n2[1], n2[2]);
        }
      }
    }
  }

  const posArray = new Float32Array(positions);
  const normArray = new Float32Array(normals);
  const colArray = new Float32Array(colors);
  const elapsed = performance.now() - start;

  const output: WorkerOutputMessage = {
    jobId,
    positions: posArray,
    normals: normArray,
    colors: colArray,
    triangleCount: Math.floor(positions.length / 9),
    elapsedMs: elapsed,
    resolution: N,
    bounds: effectiveBounds,
    wasUpscaled,
  };

  // Transfer memory buffers without cloning
  self.postMessage(output, [posArray.buffer, normArray.buffer, colArray.buffer] as any);
} catch (err: any) {
  console.error("[MarchingCubesWorker] Fatal evaluation error:", err);
  // Post safe fallback geometry so main thread is never blocked
  const fallbackOutput: WorkerOutputMessage = {
    jobId,
    positions: new Float32Array(0),
    normals: new Float32Array(0),
    colors: new Float32Array(0),
    triangleCount: 0,
    elapsedMs: performance.now() - start,
    resolution: 32,
    bounds: { min: [-3.5, -3.5, -3.5], max: [3.5, 3.5, 3.5] },
    wasUpscaled: false,
  };
  self.postMessage(fallbackOutput);
}
};
