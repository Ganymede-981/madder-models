import type { SDFDocument, SDFNode, Vec3 } from "@madder/sdf-dsl";
import { evaluateSDF, computeSDFNormal } from "./sdf-evaluator.js";
import { EDGE_TABLE, TRI_TABLE } from "./marching-cubes-tables.js";

export interface WorkerInputMessage {
  docOrNode: SDFDocument | SDFNode;
  resolution?: number;
  bounds?: { min: Vec3; max: Vec3 };
  isoLevel?: number;
}

export interface WorkerOutputMessage {
  positions: Float32Array;
  normals: Float32Array;
  triangleCount: number;
  elapsedMs: number;
}

self.onmessage = (e: MessageEvent<WorkerInputMessage>) => {
  const start = performance.now();
  const { docOrNode, resolution = 96, bounds = { min: [-3, -3, -3], max: [3, 3, 3] }, isoLevel = 0.0 } = e.data;
  const rootNode: SDFNode = "version" in docOrNode ? docOrNode.root : docOrNode;

  const N = resolution;
  const min = bounds.min;
  const max = bounds.max;
  const stepX = (max[0] - min[0]) / (N - 1);
  const stepY = (max[1] - min[1]) / (N - 1);
  const stepZ = (max[2] - min[2]) / (N - 1);

  const grid = new Float32Array(N * N * N);
  let idx = 0;
  for (let z = 0; z < N; z++) {
    const pz = min[2] + z * stepZ;
    for (let y = 0; y < N; y++) {
      const py = min[1] + y * stepY;
      for (let x = 0; x < N; x++) {
        const px = min[0] + x * stepX;
        grid[idx++] = evaluateSDF(rootNode, [px, py, pz]);
      }
    }
  }

  const positions: number[] = [];
  const normals: number[] = [];

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

  function getGridValue(x: number, y: number, z: number): number {
    return grid[x + y * N + z * N * N];
  }

  function interpolateVertex(
    p1: Vec3,
    p2: Vec3,
    val1: number,
    val2: number
  ): [number, number, number] {
    if (Math.abs(isoLevel - val1) < 0.00001) return [p1[0], p1[1], p1[2]];
    if (Math.abs(isoLevel - val2) < 0.00001) return [p2[0], p2[1], p2[2]];
    if (Math.abs(val1 - val2) < 0.00001) return [p1[0], p1[1], p1[2]];
    const mu = (isoLevel - val1) / (val2 - val1);
    return [
      p1[0] + mu * (p2[0] - p1[0]),
      p1[1] + mu * (p2[1] - p1[1]),
      p1[2] + mu * (p2[2] - p1[2]),
    ];
  }

  for (let z = 0; z < N - 1; z++) {
    for (let y = 0; y < N - 1; y++) {
      for (let x = 0; x < N - 1; x++) {
        let cubeIndex = 0;
        const cellVals: number[] = [];
        const cellPos: Vec3[] = [];

        for (let i = 0; i < 8; i++) {
          const cx = x + cornerOffsets[i][0];
          const cy = y + cornerOffsets[i][1];
          const cz = z + cornerOffsets[i][2];
          const val = getGridValue(cx, cy, cz);
          cellVals.push(val);
          cellPos.push([min[0] + cx * stepX, min[1] + cy * stepY, min[2] + cz * stepZ]);
          if (val < isoLevel) {
            cubeIndex |= 1 << i;
          }
        }

        const edgeMask = EDGE_TABLE[cubeIndex];
        if (edgeMask === 0) continue;

        if (edgeMask & 1) vertList[0] = interpolateVertex(cellPos[0], cellPos[1], cellVals[0], cellVals[1]);
        if (edgeMask & 2) vertList[1] = interpolateVertex(cellPos[1], cellPos[2], cellVals[1], cellVals[2]);
        if (edgeMask & 4) vertList[2] = interpolateVertex(cellPos[2], cellPos[3], cellVals[2], cellVals[3]);
        if (edgeMask & 8) vertList[3] = interpolateVertex(cellPos[3], cellPos[0], cellVals[3], cellVals[0]);
        if (edgeMask & 16) vertList[4] = interpolateVertex(cellPos[4], cellPos[5], cellVals[4], cellVals[5]);
        if (edgeMask & 32) vertList[5] = interpolateVertex(cellPos[5], cellPos[6], cellVals[5], cellVals[6]);
        if (edgeMask & 64) vertList[6] = interpolateVertex(cellPos[6], cellPos[7], cellVals[6], cellVals[7]);
        if (edgeMask & 128) vertList[7] = interpolateVertex(cellPos[7], cellPos[4], cellVals[7], cellVals[4]);
        if (edgeMask & 256) vertList[8] = interpolateVertex(cellPos[0], cellPos[4], cellVals[0], cellVals[4]);
        if (edgeMask & 512) vertList[9] = interpolateVertex(cellPos[1], cellPos[5], cellVals[1], cellVals[5]);
        if (edgeMask & 1024) vertList[10] = interpolateVertex(cellPos[2], cellPos[6], cellVals[2], cellVals[6]);
        if (edgeMask & 2048) vertList[11] = interpolateVertex(cellPos[3], cellPos[7], cellVals[3], cellVals[7]);

        for (let i = 0; TRI_TABLE[cubeIndex * 16 + i] !== -1; i += 3) {
          const v0 = vertList[TRI_TABLE[cubeIndex * 16 + i]];
          const v1 = vertList[TRI_TABLE[cubeIndex * 16 + i + 1]];
          const v2 = vertList[TRI_TABLE[cubeIndex * 16 + i + 2]];

          positions.push(v0[0], v0[1], v0[2]);
          positions.push(v1[0], v1[1], v1[2]);
          positions.push(v2[0], v2[1], v2[2]);

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
  const elapsedMs = performance.now() - start;

  const result: WorkerOutputMessage = {
    positions: posArray,
    normals: normArray,
    triangleCount: positions.length / 9,
    elapsedMs,
  };

  // Post message to main thread
  (postMessage as any)(result, [posArray.buffer, normArray.buffer]);
};
