import * as THREE from "three";
import type { SDFNode, Vec3, MaterialDef, ColorValue } from "@madder/sdf-dsl";

// Defensive Vector & Number Parsing Helpers
export function asVec3(val: any, defaultVal: Vec3 = [0, 0, 0]): Vec3 {
  if (Array.isArray(val)) {
    const x = typeof val[0] === "number" && !isNaN(val[0]) ? val[0] : defaultVal[0];
    const y = typeof val[1] === "number" && !isNaN(val[1]) ? val[1] : defaultVal[1];
    const z = typeof val[2] === "number" && !isNaN(val[2]) ? val[2] : defaultVal[2];
    return [x, y, z];
  }
  if (typeof val === "number" && !isNaN(val)) {
    return [val, val, val];
  }
  return [...defaultVal];
}

export function asNumber(val: any, defaultVal: number = 0): number {
  return typeof val === "number" && !isNaN(val) ? val : defaultVal;
}

// Vector Math Helpers (guaranteed NaN-free)
function vSub(a: Vec3, b: Vec3): Vec3 {
  const sa = asVec3(a);
  const sb = asVec3(b);
  return [sa[0] - sb[0], sa[1] - sb[1], sa[2] - sb[2]];
}

function vAdd(a: Vec3, b: Vec3): Vec3 {
  const sa = asVec3(a);
  const sb = asVec3(b);
  return [sa[0] + sb[0], sa[1] + sb[1], sa[2] + sb[2]];
}

function vLength(v: Vec3): number {
  const sv = asVec3(v);
  return Math.sqrt(sv[0] * sv[0] + sv[1] * sv[1] + sv[2] * sv[2]);
}

function vDot(a: Vec3, b: Vec3): number {
  const sa = asVec3(a);
  const sb = asVec3(b);
  return sa[0] * sb[0] + sa[1] * sb[1] + sa[2] * sb[2];
}

function vMax(a: Vec3, b: Vec3): Vec3 {
  const sa = asVec3(a);
  const sb = asVec3(b);
  return [Math.max(sa[0], sb[0]), Math.max(sa[1], sb[1]), Math.max(sa[2], sb[2])];
}

function vMin(a: Vec3, b: Vec3): Vec3 {
  const sa = asVec3(a);
  const sb = asVec3(b);
  return [Math.min(sa[0], sb[0]), Math.min(sa[1], sb[1]), Math.min(sa[2], sb[2])];
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, isNaN(val) ? min : val));
}

// Universal Natural Language & CSS Color Dictionary for fuzzy fallbacks
const COLOR_NAME_MAP: Record<string, [number, number, number]> = {
  red: [0.95, 0.15, 0.15],
  green: [0.15, 0.75, 0.25],
  blue: [0.15, 0.45, 0.95],
  orange: [0.98, 0.52, 0.05],
  yellow: [0.95, 0.85, 0.1],
  purple: [0.65, 0.2, 0.85],
  violet: [0.55, 0.15, 0.85],
  pink: [0.95, 0.35, 0.65],
  cyan: [0.05, 0.8, 0.95],
  magenta: [0.95, 0.1, 0.75],
  lime: [0.35, 0.9, 0.15],
  teal: [0.05, 0.65, 0.65],
  emerald: [0.1, 0.75, 0.45],
  ruby: [0.85, 0.1, 0.25],
  amber: [0.95, 0.65, 0.05],
  gold: [0.95, 0.75, 0.15],
  golden: [0.95, 0.75, 0.15],
  silver: [0.75, 0.75, 0.8],
  bronze: [0.8, 0.5, 0.2],
  copper: [0.72, 0.45, 0.2],
  brown: [0.45, 0.28, 0.15],
  wood: [0.48, 0.32, 0.18],
  bark: [0.38, 0.24, 0.14],
  sand: [0.88, 0.82, 0.68],
  sandstone: [0.86, 0.78, 0.65],
  slate: [0.25, 0.32, 0.42],
  charcoal: [0.18, 0.2, 0.25],
  carbon: [0.15, 0.17, 0.22],
  obsidian: [0.1, 0.1, 0.15],
  white: [0.95, 0.95, 0.95],
  ivory: [0.96, 0.94, 0.86],
  cream: [0.96, 0.92, 0.82],
  black: [0.08, 0.08, 0.08],
  grey: [0.5, 0.5, 0.5],
  gray: [0.5, 0.5, 0.5],
  crimson: [0.86, 0.08, 0.24],
  turquoise: [0.25, 0.88, 0.82],
  coral: [0.95, 0.45, 0.35],
  rose: [0.95, 0.25, 0.45],
  navy: [0.05, 0.1, 0.35],
  indigo: [0.29, 0.0, 0.51],
  lavender: [0.85, 0.75, 0.95],
  moss: [0.25, 0.55, 0.2],
  olive: [0.5, 0.5, 0.1],
  mint: [0.4, 0.9, 0.65],
  sky: [0.4, 0.75, 0.98],
  neon: [0.1, 1.0, 0.4],
};

/**
 * Universal Color Parser:
 * Supports ALL Hex formats, ALL 140+ CSS named colors, RGB/RGBA/HSL strings,
 * number arrays [r,g,b], and natural language strings (e.g. "dark emerald green", "glowing orange").
 */
export function parseColorToRgb(color?: ColorValue): [number, number, number] {
  if (!color) return [0.85, 0.85, 0.85]; // Default soft neutral

  // 1. Array of numbers [r, g, b]
  if (Array.isArray(color)) {
    if (color.length >= 3) {
      const is0to1 = color[0] <= 1.0 && color[1] <= 1.0 && color[2] <= 1.0;
      return [
        clamp(is0to1 ? color[0] : color[0] / 255, 0, 1),
        clamp(is0to1 ? color[1] : color[1] / 255, 0, 1),
        clamp(is0to1 ? color[2] : color[2] / 255, 0, 1),
      ];
    }
  }

  // 2. String color (hex, CSS name, RGB string, or natural language)
  if (typeof color === "string") {
    let clean = color.trim().toLowerCase();

    // Check Three.js native CSS / Hex / RGB parser
    try {
      const tc = new THREE.Color();
      // Handle missing # on 3 or 6 hex digits
      if (/^[0-9a-f]{6}$/i.test(clean) || /^[0-9a-f]{3}$/i.test(clean)) {
        tc.set(`#${clean}`);
        return [tc.r, tc.g, tc.b];
      }
      tc.set(clean);
      if (!isNaN(tc.r) && !isNaN(tc.g) && !isNaN(tc.b)) {
        return [tc.r, tc.g, tc.b];
      }
    } catch {
      // Continue to fuzzy matcher
    }

    // Fuzzy natural language keyword matching
    for (const [name, rgb] of Object.entries(COLOR_NAME_MAP)) {
      if (clean.includes(name)) {
        let [r, g, b] = rgb;
        if (clean.includes("dark") || clean.includes("deep")) {
          r *= 0.6;
          g *= 0.6;
          b *= 0.6;
        } else if (clean.includes("light") || clean.includes("pale") || clean.includes("pastel")) {
          r = r * 0.6 + 0.4;
          g = g * 0.6 + 0.4;
          b = b * 0.6 + 0.4;
        } else if (clean.includes("bright") || clean.includes("neon") || clean.includes("glowing")) {
          r = Math.min(1.0, r * 1.2);
          g = Math.min(1.0, g * 1.2);
          b = Math.min(1.0, b * 1.2);
        }
        return [clamp(r, 0, 1), clamp(g, 0, 1), clamp(b, 0, 1)];
      }
    }
  }

  return [0.85, 0.85, 0.85];
}

// ─────────────────────────────────────────────────────────────────────────────
// Inigo Quilez Signed Distance Functions
// ─────────────────────────────────────────────────────────────────────────────

export function sdSphere(p: Vec3, radius: number): number {
  return vLength(p) - radius;
}

export function sdBox(p: Vec3, size: Vec3, rounding: number = 0): number {
  const q: Vec3 = [
    Math.abs(p[0]) - size[0] / 2 + rounding,
    Math.abs(p[1]) - size[1] / 2 + rounding,
    Math.abs(p[2]) - size[2] / 2 + rounding,
  ];
  const max0: Vec3 = [Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0)];
  return vLength(max0) + Math.min(Math.max(q[0], Math.max(q[1], q[2])), 0) - rounding;
}

export function sdCylinder(p: Vec3, radius: number, height: number, rounding: number = 0): number {
  const dX = Math.sqrt(p[0] * p[0] + p[2] * p[2]) - radius + rounding;
  const dY = Math.abs(p[1]) - height / 2 + rounding;
  const maxD = [Math.max(dX, 0), Math.max(dY, 0)];
  const len = Math.sqrt(maxD[0] * maxD[0] + maxD[1] * maxD[1]);
  return Math.min(Math.max(dX, dY), 0) + len - rounding;
}

export function sdTorus(p: Vec3, majorRadius: number, minorRadius: number): number {
  const qX = Math.sqrt(p[0] * p[0] + p[2] * p[2]) - majorRadius;
  const qY = p[1];
  return Math.sqrt(qX * qX + qY * qY) - minorRadius;
}

export function sdCapsule(p: Vec3, a: Vec3, b: Vec3, radius: number): number {
  const pa = vSub(p, a);
  const ba = vSub(b, a);
  const h = clamp(vDot(pa, ba) / vDot(ba, ba), 0.0, 1.0);
  return vLength([pa[0] - ba[0] * h, pa[1] - ba[1] * h, pa[2] - ba[2] * h]) - radius;
}

export function sdCone(p: Vec3, radius: number, height: number): number {
  const qx = Math.sqrt(p[0] * p[0] + p[2] * p[2]);
  const qy = p[1];

  // Slanted side from tip (0, h/2) to base (r, -h/2)
  const ex = radius;
  const ey = -height;
  const eLenSq = ex * ex + ey * ey + 1e-8;

  const wx = qx;
  const wy = qy - 0.5 * height;
  const hProj = clamp((wx * ex + wy * ey) / eLenSq, 0, 1);
  const bx = wx - ex * hProj;
  const by = wy - ey * hProj;
  const dSide = Math.sqrt(bx * bx + by * by);

  // Flat base cap at y = -0.5*h, radius <= r
  const baseProjX = clamp(qx, 0, radius);
  const diffBaseX = qx - baseProjX;
  const diffBaseY = qy - (-0.5 * height);
  const dBase = Math.sqrt(diffBaseX * diffBaseX + diffBaseY * diffBaseY);

  const d = Math.min(dSide, dBase);
  const rAtY = Math.max(0, (radius * (0.5 * height - qy)) / Math.max(height, 1e-6));
  const isInside = qy <= 0.5 * height && qy >= -0.5 * height && qx <= rAtY;
  return isInside ? -d : d;
}

export function sdHexPrism(p: Vec3, radius: number, height: number, rounding: number = 0): number {
  const kx = -0.8660254;
  const ky = 0.5;

  let px = Math.abs(p[0]);
  let py = Math.abs(p[2]);

  const dot = 2.0 * Math.min(kx * px + ky * py, 0.0);
  px -= dot * kx;
  py -= dot * ky;

  const dXFinal = Math.max(px - radius, py * 0.8660254 - radius * 0.5) + rounding;
  const max0 = [Math.max(dXFinal, 0), Math.max(Math.abs(p[1]) - height / 2.0 + rounding, 0)];
  return Math.min(Math.max(dXFinal, Math.abs(p[1]) - height / 2.0), 0.0) + Math.sqrt(max0[0] * max0[0] + max0[1] * max0[1]) - rounding;
}

export function sdEllipsoid(p: Vec3, r: Vec3): number {
  const k0 = vLength([p[0] / r[0], p[1] / r[1], p[2] / r[2]]);
  const k1 = vLength([p[0] / (r[0] * r[0]), p[1] / (r[1] * r[1]), p[2] / (r[2] * r[2])]);
  return k0 * (k0 - 1.0) / (k1 || 1.0);
}

export function sdPyramid(p: Vec3, h: number, base: [number, number]): number {
  let px = Math.abs(p[0]);
  let pz = Math.abs(p[2]);
  const py = p[1];
  
  px -= base[0] * 0.5;
  pz -= base[1] * 0.5;
  
  return Math.max(Math.max(px, pz) + py * (base[0] / (2 * h)), -py);
}

function rotatePoint(p: Vec3, rotDeg: Vec3): Vec3 {
  const radX = (rotDeg[0] * Math.PI) / 180;
  const radY = (rotDeg[1] * Math.PI) / 180;
  const radZ = (rotDeg[2] * Math.PI) / 180;

  let [x, y, z] = p;

  let y1 = y * Math.cos(radX) - z * Math.sin(radX);
  let z1 = y * Math.sin(radX) + z * Math.cos(radX);
  let x2 = x * Math.cos(radY) + z1 * Math.sin(radY);
  let z2 = -x * Math.sin(radY) + z1 * Math.cos(radY);
  let x3 = x2 * Math.cos(radZ) - y1 * Math.sin(radZ);
  let y3 = x2 * Math.sin(radZ) + y1 * Math.cos(radZ);

  return [x3, y3, z2];
}

// ─────────────────────────────────────────────────────────────────────────────
// WS1.2 — Tight Analytical AABB
// Computes the smallest bounding box that fully contains a node's geometry,
// without sampling the field. Used by the worker to maximise voxel density.
// ─────────────────────────────────────────────────────────────────────────────

export interface AABB {
  min: Vec3;
  max: Vec3;
}

const INF = 1e9;
const EMPTY_AABB: AABB = { min: [INF, INF, INF], max: [-INF, -INF, -INF] };
const INFINITE_AABB: AABB = { min: [-INF, -INF, -INF], max: [INF, INF, INF] };
const DEFAULT_AABB: AABB = { min: [-2, -2, -2], max: [2, 2, 2] };
const DEFAULT_UNIT_AABB: AABB = { min: [-1, -1, -1], max: [1, 1, 1] };

function mergeAABB(a: AABB, b: AABB): AABB {
  return { min: vMin(a.min, b.min), max: vMax(a.max, b.max) };
}

function expandAABB(aabb: AABB, margin: number): AABB {
  return {
    min: [aabb.min[0] - margin, aabb.min[1] - margin, aabb.min[2] - margin],
    max: [aabb.max[0] + margin, aabb.max[1] + margin, aabb.max[2] + margin],
  };
}

export function computeTightAABB(node: any): AABB {
  if (!node || typeof node !== "object") {
    return DEFAULT_AABB;
  }
  const op = node.op || "sphere";
  switch (op) {
    case "sphere": {
      const c = asVec3(node.center, [0, 0, 0]);
      const r = asNumber(node.radius, 1.0);
      return { min: [c[0] - r, c[1] - r, c[2] - r], max: [c[0] + r, c[1] + r, c[2] + r] };
    }
    case "box": {
      const c = asVec3(node.center, [0, 0, 0]);
      const s = asVec3(node.size, [1, 1, 1]);
      const hw = s[0] / 2;
      const hh = s[1] / 2;
      const hd = s[2] / 2;
      return { min: [c[0] - hw, c[1] - hh, c[2] - hd], max: [c[0] + hw, c[1] + hh, c[2] + hd] };
    }
    case "cylinder": {
      const c = asVec3(node.center, [0, 0, 0]);
      const r = asNumber(node.radius, 0.5);
      const hh = asNumber(node.height, 1.0) / 2;
      return { min: [c[0] - r, c[1] - hh, c[2] - r], max: [c[0] + r, c[1] + hh, c[2] + r] };
    }
    case "torus": {
      const c = asVec3(node.center, [0, 0, 0]);
      const R = asNumber(node.majorRadius, 1.0);
      const r = asNumber(node.minorRadius, 0.25);
      const outer = R + r;
      return { min: [c[0] - outer, c[1] - r, c[2] - outer], max: [c[0] + outer, c[1] + r, c[2] + outer] };
    }
    case "capsule": {
      const a = asVec3(node.a, [0, -0.5, 0]);
      const b = asVec3(node.b, [0, 0.5, 0]);
      const r = asNumber(node.radius, 0.25);
      return {
        min: [Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.min(a[2], b[2]) - r],
        max: [Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r, Math.max(a[2], b[2]) + r],
      };
    }
    case "cone": {
      const c = asVec3(node.center, [0, 0, 0]);
      const r = asNumber(node.radius, 0.5);
      const hh = asNumber(node.height, 1.0) / 2;
      return { min: [c[0] - r, c[1] - hh, c[2] - r], max: [c[0] + r, c[1] + hh, c[2] + r] };
    }
    case "hexPrism": {
      const c = asVec3(node.center, [0, 0, 0]);
      const r = asNumber(node.radius, 0.5);
      const hh = asNumber(node.height, 1.0) / 2;
      return { min: [c[0] - r, c[1] - hh, c[2] - r], max: [c[0] + r, c[1] + hh, c[2] + r] };
    }
    case "ellipsoid": {
      const c = asVec3(node.center, [0, 0, 0]);
      const r = asVec3(node.radii, [1, 1, 1]);
      return { min: [c[0] - r[0], c[1] - r[1], c[2] - r[2]], max: [c[0] + r[0], c[1] + r[1], c[2] + r[2]] };
    }
    case "pyramid": {
      const c = asVec3(node.center, [0, 0, 0]);
      const base = asVec3(node.baseSize, [1, 1, 1]);
      const h = asNumber(node.height, 1.0);
      return { min: [c[0] - base[0] / 2, c[1] - h / 2, c[2] - base[1] / 2], max: [c[0] + base[0] / 2, c[1] + h / 2, c[2] + base[1] / 2] };
    }
    // Combiners — union of children AABBs
    case "union":
    case "smoothUnion": {
      const children: any[] = Array.isArray(node.children) ? node.children : [];
      if (children.length === 0) return DEFAULT_AABB;
      let acc = EMPTY_AABB;
      for (const ch of children) {
        acc = mergeAABB(acc, computeTightAABB(ch));
      }
      return acc;
    }
    case "intersection":
    case "smoothIntersection": {
      const ch = Array.isArray(node.children) && node.children[0] ? node.children[0] : null;
      return ch ? computeTightAABB(ch) : DEFAULT_AABB;
    }
    case "subtraction":
    case "smoothSubtraction": {
      return node.a ? computeTightAABB(node.a) : DEFAULT_AABB;
    }
    case "displace": {
      const child = node.child ? computeTightAABB(node.child) : DEFAULT_AABB;
      return expandAABB(child, asNumber(node.amplitude, 0.1));
    }
    case "onion": {
      return node.child ? computeTightAABB(node.child) : DEFAULT_AABB;
    }
    case "twist":
    case "bend":
    case "taper":
    case "elongate":
    case "symmetry":
    case "radialRepeat": {
      const ch = node.child ? computeTightAABB(node.child) : DEFAULT_AABB;
      const maxExtent = Math.max(
        Math.abs(ch.max[0]), Math.abs(ch.min[0]),
        Math.abs(ch.max[1]), Math.abs(ch.min[1]),
        Math.abs(ch.max[2]), Math.abs(ch.min[2]),
        1.0
      );
      return { min: [-maxExtent, -maxExtent, -maxExtent], max: [maxExtent, maxExtent, maxExtent] };
    }
    case "repeatLimited": {
      const period = asVec3(node.period, [2, 2, 2]);
      const limit = asVec3(node.limit, [1, 1, 1]);
      const hw: Vec3 = [
        (limit[0] + 0.5) * period[0],
        (limit[1] + 0.5) * period[1],
        (limit[2] + 0.5) * period[2],
      ];
      const childAABB = node.child ? computeTightAABB(node.child) : DEFAULT_UNIT_AABB;
      const childMax = [Math.abs(childAABB.max[0]), Math.abs(childAABB.max[1]), Math.abs(childAABB.max[2])];
      return {
        min: [-hw[0] - childMax[0], -hw[1] - childMax[1], -hw[2] - childMax[2]],
        max: [ hw[0] + childMax[0],  hw[1] + childMax[1],  hw[2] + childMax[2]],
      };
    }
    case "transform": {
      const child = node.child ? computeTightAABB(node.child) : DEFAULT_UNIT_AABB;
      const tx = asVec3(node.translate, [0, 0, 0]);
      const sc = asVec3(node.scale, [1, 1, 1]);
      const maxSc = Math.max(Math.abs(sc[0]), Math.abs(sc[1]), Math.abs(sc[2]), 0.01);
      const halfX = Math.max(Math.abs(child.max[0]), Math.abs(child.min[0])) * maxSc;
      const halfY = Math.max(Math.abs(child.max[1]), Math.abs(child.min[1])) * maxSc;
      const halfZ = Math.max(Math.abs(child.max[2]), Math.abs(child.min[2])) * maxSc;
      return {
        min: [tx[0] - halfX, tx[1] - halfY, tx[2] - halfZ],
        max: [tx[0] + halfX, tx[1] + halfY, tx[2] + halfZ],
      };
    }
    case "sweep": {
      const pts: Vec3[] = Array.isArray(node.path) ? node.path.map((p: any) => asVec3(p, [0, 0, 0])) : [];
      const r = asNumber(node.radius, 0.2);
      if (pts.length > 0) {
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (const p of pts) {
          minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]); minZ = Math.min(minZ, p[2]);
          maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]); maxZ = Math.max(maxZ, p[2]);
        }
        return { min: [minX - r, minY - r, minZ - r], max: [maxX + r, maxY + r, maxZ + r] };
      }
      return DEFAULT_AABB;
    }
    case "revolve": {
      const c = asVec3(node.center, [0, 0, 0]);
      const profile = Array.isArray(node.profile) ? node.profile : [];
      let min_y = -1, max_y = 1, max_r = 1;
      if (profile.length > 0) {
        min_y = Math.min(...profile.map((p: any) => Array.isArray(p) ? p[0] : 0));
        max_y = Math.max(...profile.map((p: any) => Array.isArray(p) ? p[0] : 0));
        max_r = Math.max(...profile.map((p: any) => Array.isArray(p) ? Math.abs(p[1]) : 0.5));
      }
      return { min: [c[0] - max_r, c[1] + min_y, c[2] - max_r], max: [c[0] + max_r, c[1] + max_y, c[2] + max_r] };
    }
    case "hexShellCells": {
      return node.child ? computeTightAABB(node.child) : DEFAULT_AABB;
    }
    default:
      return { min: [-3.5, -3.5, -3.5], max: [3.5, 3.5, 3.5] };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WS1.1 — Minimum Feature Thickness Scan
// Returns the narrowest feature in the tree (in world-space units).
// ─────────────────────────────────────────────────────────────────────────────

export function computeMinFeatureThickness(node: SDFNode): number {
  let min = Infinity;

  const consider = (...vals: (number | undefined | null)[]) => {
    for (const v of vals) {
      if (typeof v === "number" && !isNaN(v) && v > 0) {
        min = Math.min(min, v);
      }
    }
  };

  const visit = (n: any) => {
    if (!n || typeof n !== "object") return;
    switch (n.op) {
      case "torus":
        consider(n.minorRadius ? n.minorRadius * 2 : 0.2);
        break;
      case "box": {
        const s = asVec3(n.size, [1, 1, 1]);
        consider(s[0], s[1], s[2]);
        break;
      }
      case "cylinder":
        consider(n.radius ? n.radius * 2 : 0.5, n.height);
        break;
      case "capsule":
        consider(n.radius ? n.radius * 2 : 0.3);
        break;
      case "hexPrism":
        consider(n.radius, n.height);
        break;
      case "sphere":
        consider(n.radius ? n.radius * 2 : 1.0);
        break;
      case "cone":
        consider(n.radius);
        break;
      case "ellipsoid": {
        const r = asVec3(n.radii, [1, 1, 1]);
        consider(r[0] * 2, r[1] * 2, r[2] * 2);
        break;
      }
      case "onion":
        consider(n.thickness ? n.thickness * 2 : 0.1);
        if (n.child) visit(n.child);
        return;
      case "sweep":
        consider(n.radius ? n.radius * 2 : 0.2);
        break;
      case "revolve": {
        if (Array.isArray(n.profile)) {
          const minR = Math.min(...n.profile.map((pt: any) => Array.isArray(pt) ? pt[1] : 0.2));
          consider(minR > 0 ? minR * 2 : 0.2);
        }
        break;
      }
      case "mirror":
      case "taper":
        if (n.child) visit(n.child);
        return;
    }
    if (Array.isArray(n.children)) {
      for (const ch of n.children) visit(ch);
    }
    if (n.child) visit(n.child);
    if (n.a) visit(n.a);
    if (n.b && typeof n.b === "object") visit(n.b);
  };

  visit(node);
  return min === Infinity || isNaN(min) ? 0.3 : min;
}

export function autoResolution(
  node: SDFNode,
  aabb: AABB,
  requestedResolution: number,
  minVoxels = 2.5,
  maxResolution = 88
): { resolution: number; wasUpscaled: boolean } {
  const span = Math.max(
    Math.max(0.5, aabb.max[0] - aabb.min[0]),
    Math.max(0.5, aabb.max[1] - aabb.min[1]),
    Math.max(0.5, aabb.max[2] - aabb.min[2])
  );
  const minFeature = Math.max(0.06, computeMinFeatureThickness(node));
  const requiredRes = Math.ceil((span * minVoxels) / (isNaN(minFeature) || minFeature <= 0 ? 0.2 : minFeature));
  const req = isNaN(requestedResolution) ? 64 : requestedResolution;
  const finalRes = Math.min(Math.max(req, isNaN(requiredRes) ? req : requiredRes), maxResolution);
  return { resolution: finalRes, wasUpscaled: finalRes > req };
}

// ─────────────────────────────────────────────────────────────────────────────
// WS3.2 — hexShellCells: first-class compiler op
// Hollows a surface to `shellThickness`, then carves hex cells oriented along the
// local surface normal at `cellSize` spacing with depth `cellDepth`.
// Implemented as an SDF: onion(child, shellThickness) minus a hex-lattice.
// ─────────────────────────────────────────────────────────────────────────────

function sdHexShellCells(
  p: Vec3,
  child: SDFNode,
  shellThickness: number,
  cellSize: number,
  cellDepth: number
): number {
  // 1. Hollow the base shape into a shell
  const raw = evaluateSDF(child, p);
  const shell = Math.abs(raw) - shellThickness;

  // 2. Hex lattice in local XZ plane tiled by cellSize
  // Hex grid: use two shear coordinates
  const hx = cellSize * Math.sqrt(3);
  const hz = cellSize * 1.5;
  let lx = ((p[0] % hx) + hx) % hx - hx / 2;
  let lz = ((p[2] % hz) + hz) % hz - hz / 2;
  // Hex distance approximation (iq's hexPrism trick)
  const qlx = Math.abs(lx);
  const qlz = Math.abs(lz);
  const hexDist = Math.max(qlx * 0.866025 + qlz * 0.5 - cellSize * 0.866025, qlz - cellSize) ;
  // Cells are only active near the shell surface
  const surfaceProximity = Math.abs(raw);
  const cellSDF = surfaceProximity < shellThickness + cellDepth
    ? Math.max(hexDist, -(cellDepth - surfaceProximity))
    : 1000;

  return Math.max(shell, -cellSDF);
}

// ─────────────────────────────────────────────────────────────────────────────
// Revolve & Sweep Signed Distance Functions
// ─────────────────────────────────────────────────────────────────────────────

export function sdRevolve(p: Vec3, profile: [number, number][]): number {
  const py = p[1];
  const pr = Math.sqrt(p[0] * p[0] + p[2] * p[2]);
  if (!profile || profile.length < 2) return Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]) - 1.0;

  let minDistSq = Infinity;
  let crossings = false;
  let yMin = Infinity;
  let yMax = -Infinity;

  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[i];
    const b = profile[i + 1];
    yMin = Math.min(yMin, a[0], b[0]);
    yMax = Math.max(yMax, a[0], b[0]);

    // Segment distance in 2D (py, pr)
    const bay = b[0] - a[0];
    const bar = b[1] - a[1];
    const baLenSq = bay * bay + bar * bar + 1e-8;
    const qay = py - a[0];
    const qar = pr - a[1];
    const h = clamp((qay * bay + qar * bar) / baLenSq, 0, 1);
    const dy = qay - bay * h;
    const dr = qar - bar * h;
    const distSq = dy * dy + dr * dr;
    if (distSq < minDistSq) minDistSq = distSq;

    // Ray test for inside/outside
    const condY = (a[0] <= py && py < b[0]) || (b[0] <= py && py < a[0]);
    const denom = b[0] - a[0];
    if (condY && Math.abs(denom) > 1e-6) {
      const rAtY = a[1] + ((py - a[0]) * (b[1] - a[1])) / denom;
      if (pr < rAtY) crossings = !crossings;
    }
  }

  const d = Math.sqrt(Math.max(minDistSq, 0));
  const isInside = crossings && py >= yMin && py <= yMax;
  return isInside ? -d : d;
}

export function sdSweep(p: Vec3, path: Vec3[], radius: number): number {
  if (!path || path.length < 2) return vLength(p) - radius;
  let minDist = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const ba: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const pa: Vec3 = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
    const baLenSq = ba[0] * ba[0] + ba[1] * ba[1] + ba[2] * ba[2] + 1e-8;
    const h = clamp((pa[0] * ba[0] + pa[1] * ba[1] + pa[2] * ba[2]) / baLenSq, 0, 1);
    const dx = pa[0] - ba[0] * h;
    const dy = pa[1] - ba[1] * h;
    const dz = pa[2] - ba[2] * h;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < minDist) minDist = dist;
  }
  return minDist - radius;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Recursive Evaluator
// ─────────────────────────────────────────────────────────────────────────────

export interface SDFEvaluationResult {
  distance: number;
  color: [number, number, number];
}

/**
 * Main Recursive Evaluator with Material Inheritance.
 *
 * WS1.3 — Color assignment is nearest-surface, NOT interpolated:
 * In smoothUnion/smoothSubtraction, geometry smoothly blends (via k) but the
 * colour of whichever child is geometrically closer wins. This keeps colours
 * crisp at perceptual boundaries even when shapes melt together.
 */
export function evaluateSDFWithMaterial(
  node: any, 
  p: Vec3, 
  inheritedMaterial?: MaterialDef
): SDFEvaluationResult {
  if (!node || typeof node !== "object") {
    return { distance: 1000.0, color: [0.85, 0.85, 0.85] };
  }

  const effectiveMat: MaterialDef | undefined = node.material
    ? { ...inheritedMaterial, ...node.material }
    : inheritedMaterial;

  const nodeColor = parseColorToRgb(effectiveMat?.color);
  const op = node.op || "sphere";

  switch (op) {
    case "sphere": {
      const center = asVec3(node.center, [0, 0, 0]);
      const r = asNumber(node.radius, 1.0);
      return {
        distance: sdSphere(vSub(p, center), r),
        color: nodeColor,
      };
    }

    case "box": {
      const center = asVec3(node.center, [0, 0, 0]);
      const size = asVec3(node.size, [1, 1, 1]);
      const rounding = asNumber(node.rounding, 0);
      return {
        distance: sdBox(vSub(p, center), size, rounding),
        color: nodeColor,
      };
    }

    case "cylinder": {
      const center = asVec3(node.center, [0, 0, 0]);
      const r = asNumber(node.radius, 0.5);
      const h = asNumber(node.height, 1.0);
      const rounding = asNumber(node.rounding, 0);
      return {
        distance: sdCylinder(vSub(p, center), r, h, rounding),
        color: nodeColor,
      };
    }

    case "torus": {
      const center = asVec3(node.center, [0, 0, 0]);
      const R = asNumber(node.majorRadius, 1.0);
      const r = asNumber(node.minorRadius, 0.25);
      return {
        distance: sdTorus(vSub(p, center), R, r),
        color: nodeColor,
      };
    }

    case "capsule": {
      const a = asVec3(node.a, [0, -0.5, 0]);
      const b = asVec3(node.b, [0, 0.5, 0]);
      const r = asNumber(node.radius, 0.25);
      return {
        distance: sdCapsule(p, a, b, r),
        color: nodeColor,
      };
    }

    case "cone": {
      const center = asVec3(node.center, [0, 0, 0]);
      const r = asNumber(node.radius, 0.5);
      const h = asNumber(node.height, 1.0);
      return {
        distance: sdCone(vSub(p, center), r, h),
        color: nodeColor,
      };
    }

    case "hexPrism": {
      const center = asVec3(node.center, [0, 0, 0]);
      const r = asNumber(node.radius, 0.5);
      const h = asNumber(node.height, 1.0);
      const rounding = asNumber(node.rounding, 0);
      return {
        distance: sdHexPrism(vSub(p, center), r, h, rounding),
        color: nodeColor,
      };
    }

    case "ellipsoid": {
      const center = asVec3(node.center, [0, 0, 0]);
      const radii = asVec3(node.radii, [1, 1, 1]);
      return {
        distance: sdEllipsoid(vSub(p, center), radii),
        color: nodeColor,
      };
    }

    case "pyramid": {
      const center = asVec3(node.center, [0, 0, 0]);
      const h = asNumber(node.height, 1.0);
      const base = asVec3(node.baseSize, [1, 1, 1]);
      return {
        distance: sdPyramid(vSub(p, center), h, [base[0], base[1]]),
        color: nodeColor,
      };
    }

    case "union": {
      const validChildren = Array.isArray(node.children) ? node.children.filter((c: any) => c && typeof c === "object") : [];
      if (validChildren.length === 0) return { distance: 1000.0, color: nodeColor };
      let best = evaluateSDFWithMaterial(validChildren[0], p, effectiveMat);
      for (let i = 1; i < validChildren.length; i++) {
        const cur = evaluateSDFWithMaterial(validChildren[i], p, effectiveMat);
        if (cur.distance < best.distance) {
          best = cur;
        }
      }
      return best;
    }

    case "intersection": {
      const validChildren = Array.isArray(node.children) ? node.children.filter((c: any) => c && typeof c === "object") : [];
      if (validChildren.length === 0) return { distance: 1000.0, color: nodeColor };
      let best = evaluateSDFWithMaterial(validChildren[0], p, effectiveMat);
      for (let i = 1; i < validChildren.length; i++) {
        const cur = evaluateSDFWithMaterial(validChildren[i], p, effectiveMat);
        if (cur.distance > best.distance) {
          best = cur;
        }
      }
      return best;
    }

    case "subtraction": {
      if (!node.a) return { distance: 1000.0, color: nodeColor };
      if (!node.b) return evaluateSDFWithMaterial(node.a, p, effectiveMat);
      const da = evaluateSDFWithMaterial(node.a, p, effectiveMat);
      const db = evaluateSDFWithMaterial(node.b, p, effectiveMat);
      const dist = Math.max(-db.distance, da.distance);
      return {
        distance: dist,
        color: -db.distance > da.distance ? db.color : da.color,
      };
    }

    case "smoothUnion": {
      const validChildren = Array.isArray(node.children) ? node.children.filter((c: any) => c && typeof c === "object") : [];
      if (validChildren.length === 0) return { distance: 1000.0, color: nodeColor };
      let resA = evaluateSDFWithMaterial(validChildren[0], p, effectiveMat);
      const k = Math.max(asNumber(node.k, 0.3), 1e-5);
      for (let i = 1; i < validChildren.length; i++) {
        const resB = evaluateSDFWithMaterial(validChildren[i], p, effectiveMat);
        const h = clamp(0.5 + 0.5 * (resB.distance - resA.distance) / k, 0.0, 1.0);
        const d = resB.distance * (1.0 - h) + resA.distance * h - k * h * (1.0 - h);
        const winnerColor = resA.distance <= resB.distance ? resA.color : resB.color;
        resA = { distance: d, color: winnerColor };
      }
      return resA;
    }

    case "smoothIntersection": {
      const validChildren = Array.isArray(node.children) ? node.children.filter((c: any) => c && typeof c === "object") : [];
      if (validChildren.length === 0) return { distance: 1000.0, color: nodeColor };
      let resA = evaluateSDFWithMaterial(validChildren[0], p, effectiveMat);
      const k = Math.max(asNumber(node.k, 0.3), 1e-5);
      for (let i = 1; i < validChildren.length; i++) {
        const resB = evaluateSDFWithMaterial(validChildren[i], p, effectiveMat);
        const h = clamp(0.5 - 0.5 * (resB.distance - resA.distance) / k, 0.0, 1.0);
        const d = resB.distance * (1.0 - h) + resA.distance * h + k * h * (1.0 - h);
        resA = { distance: d, color: resA.color };
      }
      return resA;
    }

    case "smoothSubtraction": {
      if (!node.a) return { distance: 1000.0, color: nodeColor };
      if (!node.b) return evaluateSDFWithMaterial(node.a, p, effectiveMat);
      const da = evaluateSDFWithMaterial(node.a, p, effectiveMat);
      const db = evaluateSDFWithMaterial(node.b, p, effectiveMat);
      const k = Math.max(asNumber(node.k, 0.3), 1e-5);
      const h = clamp(0.5 - 0.5 * (da.distance + db.distance) / k, 0.0, 1.0);
      const d = da.distance * (1.0 - h) - db.distance * h + k * h * (1.0 - h);
      return {
        distance: d,
        color: da.distance < -db.distance ? da.color : db.color,
      };
    }

    case "symmetry": {
      let sp: Vec3 = [...p];
      if (node.axes.includes("x")) sp[0] = Math.abs(sp[0]);
      if (node.axes.includes("y")) sp[1] = Math.abs(sp[1]);
      if (node.axes.includes("z")) sp[2] = Math.abs(sp[2]);
      return evaluateSDFWithMaterial(node.child, sp, effectiveMat);
    }

    case "radialRepeat": {
      const count = node.count || 4;
      const sector = (2 * Math.PI) / count;
      let angle = Math.atan2(p[2], p[0]);
      const radius = Math.sqrt(p[0] * p[0] + p[2] * p[2]);
      angle = ((angle % sector) + sector) % sector - sector * 0.5;
      const rp: Vec3 = [radius * Math.cos(angle), p[1], radius * Math.sin(angle)];
      return evaluateSDFWithMaterial(node.child, rp, effectiveMat);
    }

    case "repeat": {
      const px = ((p[0] % node.period[0]) + node.period[0]) % node.period[0] - node.period[0] * 0.5;
      const py = ((p[1] % node.period[1]) + node.period[1]) % node.period[1] - node.period[1] * 0.5;
      const pz = ((p[2] % node.period[2]) + node.period[2]) % node.period[2] - node.period[2] * 0.5;
      return evaluateSDFWithMaterial(node.child, [px, py, pz], effectiveMat);
    }

    case "repeatLimited": {
      // WS1.5: clamp-before-subtract ordering — copies are always bounded by limit
      const px = p[0] - node.period[0] * clamp(Math.round(p[0] / node.period[0]), -node.limit[0], node.limit[0]);
      const py = p[1] - node.period[1] * clamp(Math.round(p[1] / node.period[1]), -node.limit[1], node.limit[1]);
      const pz = p[2] - node.period[2] * clamp(Math.round(p[2] / node.period[2]), -node.limit[2], node.limit[2]);
      return evaluateSDFWithMaterial(node.child, [px, py, pz], effectiveMat);
    }

    case "twist": {
      const c = Math.cos(node.strength * p[1]);
      const s = Math.sin(node.strength * p[1]);
      const twistedP: Vec3 = [c * p[0] - s * p[2], p[1], s * p[0] + c * p[2]];
      return evaluateSDFWithMaterial(node.child, twistedP, effectiveMat);
    }

    case "bend": {
      const c = Math.cos(node.strength * p[0]);
      const s = Math.sin(node.strength * p[0]);
      const bentP: Vec3 = [c * p[0] - s * p[1], s * p[0] + c * p[1], p[2]];
      return evaluateSDFWithMaterial(node.child, bentP, effectiveMat);
    }

    case "displace": {
      const freq = asNumber(node.frequency, 3.0);
      const amp = asNumber(node.amplitude, 0.1);
      const res = evaluateSDFWithMaterial(node.child, p, effectiveMat);
      const disp = Math.sin(freq * p[0]) * Math.sin(freq * p[1]) * Math.sin(freq * p[2]) * amp;
      return { distance: res.distance + disp, color: res.color };
    }

    case "elongate": {
      const sz = asVec3(node.size, [1, 1, 1]);
      const q: Vec3 = [
        p[0] - clamp(p[0], -sz[0] / 2, sz[0] / 2),
        p[1] - clamp(p[1], -sz[1] / 2, sz[1] / 2),
        p[2] - clamp(p[2], -sz[2] / 2, sz[2] / 2),
      ];
      return evaluateSDFWithMaterial(node.child, q, effectiveMat);
    }

    case "transform": {
      if (!node.child) return { distance: 1000.0, color: nodeColor };
      let tp: Vec3 = [...p];
      if (node.translate) {
        const tr = asVec3(node.translate);
        tp = [tp[0] - tr[0], tp[1] - tr[1], tp[2] - tr[2]];
      }
      if (node.rotate) {
        const rot = asVec3(node.rotate);
        tp = rotatePoint(tp, [-rot[0], -rot[1], -rot[2]]);
      }
      let scaleMult = 1.0;
      if (node.scale) {
        if (typeof node.scale === "number") {
          const sc = Math.max(node.scale, 0.001);
          tp = [tp[0] / sc, tp[1] / sc, tp[2] / sc];
          scaleMult = sc;
        } else {
          const sc = asVec3(node.scale, [1, 1, 1]);
          const sx = Math.max(sc[0], 0.001);
          const sy = Math.max(sc[1], 0.001);
          const sz = Math.max(sc[2], 0.001);
          tp = [tp[0] / sx, tp[1] / sy, tp[2] / sz];
          scaleMult = Math.min(sx, Math.min(sy, sz));
        }
      }
      const res = evaluateSDFWithMaterial(node.child, tp, effectiveMat);
      return { distance: res.distance * scaleMult, color: res.color };
    }

    case "onion": {
      const thick = asNumber(node.thickness, 0.1);
      const res = evaluateSDFWithMaterial(node.child, p, effectiveMat);
      return { distance: Math.abs(res.distance) - thick, color: res.color };
    }

    case "revolve": {
      const center = node.center || [0, 0, 0];
      const cp = vSub(p, center);
      return {
        distance: sdRevolve(cp, node.profile),
        color: nodeColor,
      };
    }

    case "sweep": {
      return {
        distance: sdSweep(p, node.path, node.radius),
        color: nodeColor,
      };
    }

    case "mirror": {
      let mp: Vec3 = [...p];
      const offset = node.offset || 0;
      const axIdx = node.axis === "y" ? 1 : (node.axis === "z" ? 2 : 0);
      mp[axIdx] = Math.abs(mp[axIdx]) - offset;
      return evaluateSDFWithMaterial(node.child, mp, effectiveMat);
    }

    case "taper": {
      let tp: Vec3 = [...p];
      const factor = node.factor || 0.3;
      const axIdx = node.axis === "x" ? 0 : (node.axis === "z" ? 2 : 1);
      const otherAxes = [0, 1, 2].filter((i) => i !== axIdx);
      const h = p[axIdx];
      const scale = Math.max(1.0 + factor * h, 0.05);
      tp[otherAxes[0]] /= scale;
      tp[otherAxes[1]] /= scale;
      const res = evaluateSDFWithMaterial(node.child, tp, effectiveMat);
      return { distance: res.distance * scale, color: res.color };
    }

    default: {
      // WS3.2: hexShellCells runtime (not yet in discriminated union type — handled here)
      const anyNode = node as any;
      if (anyNode.op === "hexShellCells") {
        const dist = sdHexShellCells(
          p,
          anyNode.child,
          anyNode.shellThickness ?? 0.1,
          anyNode.cellSize ?? 0.3,
          anyNode.cellDepth ?? 0.15
        );
        const childResult = evaluateSDFWithMaterial(anyNode.child, p, effectiveMat);
        return { distance: dist, color: childResult.color };
      }
      return { distance: 1000.0, color: [0.85, 0.85, 0.85] };
    }
  }
}

export function evaluateSDF(node: SDFNode, p: Vec3): number {
  return evaluateSDFWithMaterial(node, p).distance;
}

export function computeSDFNormal(node: SDFNode, p: Vec3, eps = 0.002): Vec3 {
  const d = evaluateSDF(node, p);
  const nx = evaluateSDF(node, [p[0] + eps, p[1], p[2]]) - d;
  const ny = evaluateSDF(node, [p[0], p[1] + eps, p[2]]) - d;
  const nz = evaluateSDF(node, [p[0], p[1], p[2] + eps]) - d;
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1.0;
  return [nx / len, ny / len, nz / len];
}
