import type { SDFNode, Vec3 } from "@madder/sdf-dsl";

// Vector Math Helpers
function vSub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vLength(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function vDot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// Inigo Quilez Signed Distance Functions
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
  const ca = [q, p[1]];
  const cb = [q - k * clamp(q / k, 0, height), p[1] - clamp(p[1], -height / 2, height / 2)];
  return Math.sqrt(cb[0] * cb[0] + cb[1] * cb[1]) * Math.sign(p[1]);
}

export function sdHexPrism(p: Vec3, radius: number, height: number, rounding: number = 0): number {
  const kx = -0.8660254; // -sqrt(3)/2
  const ky = 0.5;
  const kz = 0.57735026; // tan(30 deg)

  let px = Math.abs(p[0]);
  let py = Math.abs(p[2]);

  const dot = 2.0 * Math.min(kx * px + ky * py, 0.0);
  px -= dot * kx;
  py -= dot * ky;

  const d1 = clamp(px - clamp(px, -kz * radius, kz * radius), 0, 1000);
  const dX = Math.sqrt((px - radius) * (px - radius) + py * py) * Math.sign(py - radius * kz);
  const dY = Math.abs(p[1]) - height / 2.0;

  const dXFinal = Math.max(px - radius, py * 0.8660254 - radius * 0.5) + rounding;
  const max0 = [Math.max(dXFinal, 0), Math.max(dY + rounding, 0)];
  return Math.min(Math.max(dXFinal, dY), 0.0) + Math.sqrt(max0[0] * max0[0] + max0[1] * max0[1]) - rounding;
}

// Organic Combination & Smooth Blending Operators
export function smin(a: number, b: number, k: number): number {
  if (k <= 0.0001) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0.0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

export function smax(a: number, b: number, k: number): number {
  if (k <= 0.0001) return Math.max(a, b);
  const h = Math.max(k - Math.abs(a - b), 0.0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
}

// Domain Transformations
function rotatePoint(p: Vec3, rotDeg: Vec3): Vec3 {
  const radX = (rotDeg[0] * Math.PI) / 180;
  const radY = (rotDeg[1] * Math.PI) / 180;
  const radZ = (rotDeg[2] * Math.PI) / 180;

  let [x, y, z] = p;

  // Rot X
  let y1 = y * Math.cos(radX) - z * Math.sin(radX);
  let z1 = y * Math.sin(radX) + z * Math.cos(radX);
  // Rot Y
  let x2 = x * Math.cos(radY) + z1 * Math.sin(radY);
  let z2 = -x * Math.sin(radY) + z1 * Math.cos(radY);
  // Rot Z
  let x3 = x2 * Math.cos(radZ) - y1 * Math.sin(radZ);
  let y3 = x2 * Math.sin(radZ) + y1 * Math.cos(radZ);

  return [x3, y3, z2];
}

// Main Recursive Evaluator
export function evaluateSDF(node: SDFNode, p: Vec3): number {
  switch (node.op) {
    case "sphere": {
      const center = node.center || [0, 0, 0];
      return sdSphere(vSub(p, center), node.radius);
    }

    case "box": {
      const center = node.center || [0, 0, 0];
      return sdBox(vSub(p, center), node.size, node.rounding || 0);
    }

    case "cylinder": {
      const center = node.center || [0, 0, 0];
      return sdCylinder(vSub(p, center), node.radius, node.height, node.rounding || 0);
    }

    case "torus": {
      const center = node.center || [0, 0, 0];
      return sdTorus(vSub(p, center), node.majorRadius, node.minorRadius);
    }

    case "capsule": {
      return sdCapsule(p, node.a, node.b, node.radius);
    }

    case "cone": {
      const center = node.center || [0, 0, 0];
      return sdCone(vSub(p, center), node.radius, node.height);
    }

    case "hexPrism": {
      const center = node.center || [0, 0, 0];
      return sdHexPrism(vSub(p, center), node.radius, node.height, node.rounding || 0);
    }

    case "union": {
      let d = Infinity;
      for (const child of node.children) {
        d = Math.min(d, evaluateSDF(child, p));
      }
      return d;
    }

    case "intersection": {
      let d = -Infinity;
      for (const child of node.children) {
        d = Math.max(d, evaluateSDF(child, p));
      }
      return d;
    }

    case "subtraction": {
      const da = evaluateSDF(node.a, p);
      const db = evaluateSDF(node.b, p);
      return Math.max(-db, da);
    }

    case "smoothUnion": {
      let d = evaluateSDF(node.children[0], p);
      for (let i = 1; i < node.children.length; i++) {
        d = smin(d, evaluateSDF(node.children[i], p), node.k);
      }
      return d;
    }

    case "smoothIntersection": {
      let d = evaluateSDF(node.children[0], p);
      for (let i = 1; i < node.children.length; i++) {
        d = smax(d, evaluateSDF(node.children[i], p), node.k);
      }
      return d;
    }

    case "smoothSubtraction": {
      const da = evaluateSDF(node.a, p);
      const db = evaluateSDF(node.b, p);
      return smax(da, -db, node.k);
    }

    case "repeat": {
      const px = ((p[0] % node.period[0]) + node.period[0]) % node.period[0] - node.period[0] * 0.5;
      const py = ((p[1] % node.period[1]) + node.period[1]) % node.period[1] - node.period[1] * 0.5;
      const pz = ((p[2] % node.period[2]) + node.period[2]) % node.period[2] - node.period[2] * 0.5;
      return evaluateSDF(node.child, [px, py, pz]);
    }

    case "repeatLimited": {
      const px = p[0] - node.period[0] * clamp(Math.round(p[0] / node.period[0]), -node.limit[0], node.limit[0]);
      const py = p[1] - node.period[1] * clamp(Math.round(p[1] / node.period[1]), -node.limit[1], node.limit[1]);
      const pz = p[2] - node.period[2] * clamp(Math.round(p[2] / node.period[2]), -node.limit[2], node.limit[2]);
      return evaluateSDF(node.child, [px, py, pz]);
    }

    case "twist": {
      const c = Math.cos(node.strength * p[1]);
      const s = Math.sin(node.strength * p[1]);
      const twistedP: Vec3 = [c * p[0] - s * p[2], p[1], s * p[0] + c * p[2]];
      return evaluateSDF(node.child, twistedP);
    }

    case "bend": {
      const c = Math.cos(node.strength * p[0]);
      const s = Math.sin(node.strength * p[0]);
      const bentP: Vec3 = [c * p[0] - s * p[1], s * p[0] + c * p[1], p[2]];
      return evaluateSDF(node.child, bentP);
    }

    case "displace": {
      const freq = node.frequency || 3.0;
      const d = evaluateSDF(node.child, p);
      const disp = Math.sin(freq * p[0]) * Math.sin(freq * p[1]) * Math.sin(freq * p[2]) * node.amplitude;
      return d + disp;
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
      return evaluateSDF(node.child, tp) * scaleMult;
    }

    case "onion": {
      return Math.abs(evaluateSDF(node.child, p)) - node.thickness;
    }

    default:
      return 1000.0;
  }
}

// Surface normal computation for high-quality smooth shading
export function computeSDFNormal(node: SDFNode, p: Vec3, eps = 0.002): Vec3 {
  const d = evaluateSDF(node, p);
  const nx = evaluateSDF(node, [p[0] + eps, p[1], p[2]]) - d;
  const ny = evaluateSDF(node, [p[0], p[1] + eps, p[2]]) - d;
  const nz = evaluateSDF(node, [p[0], p[1], p[2] + eps]) - d;
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1.0;
  return [nx / len, ny / len, nz / len];
}
