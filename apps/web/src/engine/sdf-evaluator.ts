import * as THREE from "three";
import type { SDFNode, Vec3, MaterialDef, ColorValue } from "@madder/sdf-dsl";

// Vector Math Helpers
function vSub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vAdd(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function vLength(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function vDot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vMax(a: Vec3, b: Vec3): Vec3 {
  return [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];
}

function vMin(a: Vec3, b: Vec3): Vec3 {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])];
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
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
  const q = Math.sqrt(p[0] * p[0] + p[2] * p[2]);
  const len = Math.sqrt(radius * radius + height * height);
  const sinA = radius / len;
  const cosA = height / len;
  const k = sinA / cosA;
  const cb = [q - k * clamp(q / k, 0, height), p[1] - clamp(p[1], -height / 2, height / 2)];
  return Math.sqrt(cb[0] * cb[0] + cb[1] * cb[1]) * Math.sign(p[1]);
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

function mergeAABB(a: AABB, b: AABB): AABB {
  return { min: vMin(a.min, b.min), max: vMax(a.max, b.max) };
}

function expandAABB(aabb: AABB, margin: number): AABB {
  return {
    min: [aabb.min[0] - margin, aabb.min[1] - margin, aabb.min[2] - margin],
    max: [aabb.max[0] + margin, aabb.max[1] + margin, aabb.max[2] + margin],
  };
}

export function computeTightAABB(node: SDFNode): AABB {
  switch (node.op) {
    case "sphere": {
      const c = node.center || [0, 0, 0];
      const r = node.radius;
      return { min: [c[0]-r, c[1]-r, c[2]-r], max: [c[0]+r, c[1]+r, c[2]+r] };
    }
    case "box": {
      const c = node.center || [0, 0, 0];
      const hw = node.size[0] / 2;
      const hh = node.size[1] / 2;
      const hd = node.size[2] / 2;
      return {
        min: [c[0]-hw, c[1]-hh, c[2]-hd],
        max: [c[0]+hw, c[1]+hh, c[2]+hd],
      };
    }
    case "cylinder": {
      const c = node.center || [0, 0, 0];
      const r = node.radius;
      const hh = node.height / 2;
      return {
        min: [c[0]-r, c[1]-hh, c[2]-r],
        max: [c[0]+r, c[1]+hh, c[2]+r],
      };
    }
    case "torus": {
      const c = node.center || [0, 0, 0];
      const outer = node.majorRadius + node.minorRadius;
      return {
        min: [c[0]-outer, c[1]-node.minorRadius, c[2]-outer],
        max: [c[0]+outer, c[1]+node.minorRadius, c[2]+outer],
      };
    }
    case "capsule": {
      const r = node.radius;
      return {
        min: [Math.min(node.a[0],node.b[0])-r, Math.min(node.a[1],node.b[1])-r, Math.min(node.a[2],node.b[2])-r],
        max: [Math.max(node.a[0],node.b[0])+r, Math.max(node.a[1],node.b[1])+r, Math.max(node.a[2],node.b[2])+r],
      };
    }
    case "cone": {
      const c = node.center || [0, 0, 0];
      const r = node.radius;
      const hh = node.height / 2;
      return {
        min: [c[0]-r, c[1]-hh, c[2]-r],
        max: [c[0]+r, c[1]+hh, c[2]+r],
      };
    }
    case "hexPrism": {
      const c = node.center || [0, 0, 0];
      const r = node.radius;
      const hh = node.height / 2;
      return {
        min: [c[0]-r, c[1]-hh, c[2]-r],
        max: [c[0]+r, c[1]+hh, c[2]+r],
      };
    }
    case "ellipsoid": {
      const c = node.center || [0, 0, 0];
      return {
        min: [c[0]-node.radii[0], c[1]-node.radii[1], c[2]-node.radii[2]],
        max: [c[0]+node.radii[0], c[1]+node.radii[1], c[2]+node.radii[2]],
      };
    }
    case "pyramid": {
      const c = node.center || [0, 0, 0];
      const hw = node.baseSize[0] / 2;
      const hd = node.baseSize[1] / 2;
      return {
        min: [c[0]-hw, c[1]-node.height/2, c[2]-hd],
        max: [c[0]+hw, c[1]+node.height/2, c[2]+hd],
      };
    }
    // Combiners — union of children AABBs
    case "union":
    case "smoothUnion": {
      return node.children.reduce<AABB>((acc, ch) => mergeAABB(acc, computeTightAABB(ch)), EMPTY_AABB);
    }
    case "intersection":
    case "smoothIntersection": {
      // Intersection can only be smaller than each child — use first child as over-estimate
      return computeTightAABB(node.children[0]);
    }
    case "subtraction":
    case "smoothSubtraction": {
      return computeTightAABB(node.a);
    }
    // Modifiers — add conservative expansion
    case "displace": {
      const child = computeTightAABB(node.child);
      return expandAABB(child, node.amplitude);
    }
    case "onion": {
      return computeTightAABB(node.child);
    }
    case "twist":
    case "bend":
    case "elongate":
    case "symmetry":
    case "radialRepeat": {
      // Conservative: use child AABB expanded isotropically
      const ch = computeTightAABB(node.child);
      const maxExtent = Math.max(
        Math.abs(ch.max[0]), Math.abs(ch.min[0]),
        Math.abs(ch.max[1]), Math.abs(ch.min[1]),
        Math.abs(ch.max[2]), Math.abs(ch.min[2])
      );
      return { min: [-maxExtent, -maxExtent, -maxExtent], max: [maxExtent, maxExtent, maxExtent] };
    }
    case "repeat": {
      // Infinite repeat — fall back to defaults
      return { min: [-4, -4, -4], max: [4, 4, 4] };
    }
    case "repeatLimited": {
      const period = node.period;
      const limit = node.limit;
      const hw: Vec3 = [
        (limit[0] + 0.5) * period[0],
        (limit[1] + 0.5) * period[1],
        (limit[2] + 0.5) * period[2],
      ];
      const childAABB = computeTightAABB(node.child);
      const childMax = [Math.abs(childAABB.max[0]), Math.abs(childAABB.max[1]), Math.abs(childAABB.max[2])];
      return {
        min: [-hw[0] - childMax[0], -hw[1] - childMax[1], -hw[2] - childMax[2]],
        max: [ hw[0] + childMax[0],  hw[1] + childMax[1],  hw[2] + childMax[2]],
      };
    }
    case "transform": {
      const child = computeTightAABB(node.child);
      // Apply translate only (rotation AABB expansion is conservative)
      const tx = node.translate || [0, 0, 0];
      const scale = typeof node.scale === "number"
        ? node.scale
        : node.scale
          ? Math.max(node.scale[0], node.scale[1], node.scale[2])
          : 1;
      const halfX = Math.max(Math.abs(child.max[0]), Math.abs(child.min[0])) * scale;
      const halfY = Math.max(Math.abs(child.max[1]), Math.abs(child.min[1])) * scale;
      const halfZ = Math.max(Math.abs(child.max[2]), Math.abs(child.min[2])) * scale;
      return {
        min: [tx[0] - halfX, tx[1] - halfY, tx[2] - halfZ],
        max: [tx[0] + halfX, tx[1] + halfY, tx[2] + halfZ],
      };
    }
    // hexShellCells (WS3.2)
    case "hexShellCells": {
      return computeTightAABB((node as any).child);
    }
    default:
      return { min: [-4, -4, -4], max: [4, 4, 4] };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WS1.1 — Minimum Feature Thickness Scan
// Returns the narrowest feature in the tree (in world-space units).
// The worker uses this to auto-raise resolution so features stay ≥ 3 voxels.
// ─────────────────────────────────────────────────────────────────────────────

export function computeMinFeatureThickness(node: SDFNode): number {
  let min = Infinity;

  const visit = (n: SDFNode) => {
    switch (n.op) {
      case "torus":
        min = Math.min(min, n.minorRadius * 2);
        break;
      case "box":
        min = Math.min(min, n.size[0], n.size[1], n.size[2]);
        break;
      case "cylinder":
        min = Math.min(min, n.radius * 2, n.height);
        break;
      case "capsule":
        min = Math.min(min, n.radius * 2);
        break;
      case "hexPrism":
        min = Math.min(min, n.radius, n.height);
        break;
      case "sphere":
        min = Math.min(min, n.radius * 2);
        break;
      case "cone":
        min = Math.min(min, n.radius);
        break;
      case "ellipsoid":
        min = Math.min(min, n.radii[0] * 2, n.radii[1] * 2, n.radii[2] * 2);
        break;
      case "onion":
        min = Math.min(min, n.thickness * 2);
        visit(n.child);
        return;
    }
    // Recurse children
    if ("children" in n && Array.isArray((n as any).children)) {
      for (const ch of (n as any).children) visit(ch);
    }
    if ("child" in n && (n as any).child) visit((n as any).child);
    if ("a" in n && (n as any).a) visit((n as any).a);
    if ("b" in n && (n as any).b && typeof (n as any).b === "object" && "op" in (n as any).b) {
      visit((n as any).b);
    }
  };

  visit(node);
  return min === Infinity ? 1.0 : min;
}

/**
 * Given a root node and desired resolution, returns the resolution needed so that
 * the thinnest feature is at least minVoxels voxels wide (capped at maxResolution).
 */
export function autoResolution(
  node: SDFNode,
  aabb: AABB,
  requestedResolution: number,
  minVoxels = 2.5,
  maxResolution = 96
): { resolution: number; wasUpscaled: boolean } {
  const span = Math.max(
    aabb.max[0] - aabb.min[0],
    aabb.max[1] - aabb.min[1],
    aabb.max[2] - aabb.min[2]
  );
  const minFeature = Math.max(0.06, computeMinFeatureThickness(node));
  // required resolution based on voxel size over the span
  const requiredRes = Math.ceil((span * minVoxels) / minFeature);
  const finalRes = Math.min(Math.max(requestedResolution, requiredRes), maxResolution);
  return { resolution: finalRes, wasUpscaled: finalRes > requestedResolution };
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
  node: SDFNode, 
  p: Vec3, 
  inheritedMaterial?: MaterialDef
): SDFEvaluationResult {
  const effectiveMat: MaterialDef | undefined = node.material
    ? { ...inheritedMaterial, ...node.material }
    : inheritedMaterial;

  const nodeColor = parseColorToRgb(effectiveMat?.color);

  switch (node.op) {
    case "sphere": {
      const center = node.center || [0, 0, 0];
      return {
        distance: sdSphere(vSub(p, center), node.radius),
        color: nodeColor,
      };
    }

    case "box": {
      const center = node.center || [0, 0, 0];
      return {
        distance: sdBox(vSub(p, center), node.size, node.rounding || 0),
        color: nodeColor,
      };
    }

    case "cylinder": {
      const center = node.center || [0, 0, 0];
      return {
        distance: sdCylinder(vSub(p, center), node.radius, node.height, node.rounding || 0),
        color: nodeColor,
      };
    }

    case "torus": {
      const center = node.center || [0, 0, 0];
      return {
        distance: sdTorus(vSub(p, center), node.majorRadius, node.minorRadius),
        color: nodeColor,
      };
    }

    case "capsule": {
      return {
        distance: sdCapsule(p, node.a, node.b, node.radius),
        color: nodeColor,
      };
    }

    case "cone": {
      const center = node.center || [0, 0, 0];
      return {
        distance: sdCone(vSub(p, center), node.radius, node.height),
        color: nodeColor,
      };
    }

    case "hexPrism": {
      const center = node.center || [0, 0, 0];
      return {
        distance: sdHexPrism(vSub(p, center), node.radius, node.height, node.rounding || 0),
        color: nodeColor,
      };
    }

    case "ellipsoid": {
      const center = node.center || [0, 0, 0];
      return {
        distance: sdEllipsoid(vSub(p, center), node.radii),
        color: nodeColor,
      };
    }

    case "pyramid": {
      const center = node.center || [0, 0, 0];
      return {
        distance: sdPyramid(vSub(p, center), node.height, node.baseSize),
        color: nodeColor,
      };
    }

    case "union": {
      let best = evaluateSDFWithMaterial(node.children[0], p, effectiveMat);
      for (let i = 1; i < node.children.length; i++) {
        const cur = evaluateSDFWithMaterial(node.children[i], p, effectiveMat);
        if (cur.distance < best.distance) {
          best = cur;
        }
      }
      return best;
    }

    case "intersection": {
      let best = evaluateSDFWithMaterial(node.children[0], p, effectiveMat);
      for (let i = 1; i < node.children.length; i++) {
        const cur = evaluateSDFWithMaterial(node.children[i], p, effectiveMat);
        if (cur.distance > best.distance) {
          best = cur;
        }
      }
      return best;
    }

    case "subtraction": {
      const da = evaluateSDFWithMaterial(node.a, p, effectiveMat);
      const db = evaluateSDFWithMaterial(node.b, p, effectiveMat);
      const dist = Math.max(-db.distance, da.distance);
      return {
        distance: dist,
        color: -db.distance > da.distance ? db.color : da.color,
      };
    }

    case "smoothUnion": {
      // WS1.3: blend geometry with polynomial smooth-min,
      // but pick winner color by nearest unblended distance (no lerp).
      let resA = evaluateSDFWithMaterial(node.children[0], p, effectiveMat);
      for (let i = 1; i < node.children.length; i++) {
        const resB = evaluateSDFWithMaterial(node.children[i], p, effectiveMat);
        const k = node.k || 0.3;
        
        // Polynomial smooth-min for geometry
        const h = clamp(0.5 + 0.5 * (resB.distance - resA.distance) / k, 0.0, 1.0);
        const d = resB.distance * (1.0 - h) + resA.distance * h - k * h * (1.0 - h);
        
        // Nearest-surface color (no gradient blend across the seam)
        const winnerColor = resA.distance <= resB.distance ? resA.color : resB.color;
        
        resA = { distance: d, color: winnerColor };
      }
      return resA;
    }

    case "smoothIntersection": {
      let resA = evaluateSDFWithMaterial(node.children[0], p, effectiveMat);
      for (let i = 1; i < node.children.length; i++) {
        const resB = evaluateSDFWithMaterial(node.children[i], p, effectiveMat);
        const k = node.k || 0.3;
        const h = clamp(0.5 - 0.5 * (resB.distance - resA.distance) / k, 0.0, 1.0);
        const d = resB.distance * (1.0 - h) + resA.distance * h + k * h * (1.0 - h);
        resA = { distance: d, color: resA.color };
      }
      return resA;
    }

    case "smoothSubtraction": {
      const da = evaluateSDFWithMaterial(node.a, p, effectiveMat);
      const db = evaluateSDFWithMaterial(node.b, p, effectiveMat);
      const k = node.k || 0.3;
      const h = clamp(0.5 - 0.5 * (da.distance + db.distance) / k, 0.0, 1.0);
      const d = da.distance * (1.0 - h) - db.distance * h + k * h * (1.0 - h);
      // WS1.3: nearest-surface wins
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
      const freq = node.frequency || 3.0;
      const res = evaluateSDFWithMaterial(node.child, p, effectiveMat);
      const disp = Math.sin(freq * p[0]) * Math.sin(freq * p[1]) * Math.sin(freq * p[2]) * node.amplitude;
      return { distance: res.distance + disp, color: res.color };
    }

    case "elongate": {
      const q: Vec3 = [
        p[0] - clamp(p[0], -node.size[0] / 2, node.size[0] / 2),
        p[1] - clamp(p[1], -node.size[1] / 2, node.size[1] / 2),
        p[2] - clamp(p[2], -node.size[2] / 2, node.size[2] / 2),
      ];
      return evaluateSDFWithMaterial(node.child, q, effectiveMat);
    }

    case "transform": {
      let tp: Vec3 = [...p];
      if (node.translate) {
        tp = [tp[0] - node.translate[0], tp[1] - node.translate[1], tp[2] - node.translate[2]];
      }
      if (node.rotate) {
        tp = rotatePoint(tp, [-node.rotate[0], -node.rotate[1], -node.rotate[2]]);
      }
      let scaleMult = 1.0;
      if (node.scale) {
        if (typeof node.scale === "number") {
          tp = [tp[0] / node.scale, tp[1] / node.scale, tp[2] / node.scale];
          scaleMult = node.scale;
        } else {
          tp = [tp[0] / node.scale[0], tp[1] / node.scale[1], tp[2] / node.scale[2]];
          scaleMult = Math.min(node.scale[0], Math.min(node.scale[1], node.scale[2]));
        }
      }
      const res = evaluateSDFWithMaterial(node.child, tp, effectiveMat);
      return { distance: res.distance * scaleMult, color: res.color };
    }

    case "onion": {
      const res = evaluateSDFWithMaterial(node.child, p, effectiveMat);
      return { distance: Math.abs(res.distance) - node.thickness, color: res.color };
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
