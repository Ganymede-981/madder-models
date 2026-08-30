import { SDFDocumentSchema, SDFNodeSchema } from "./schema.js";
import type { SDFDocument, SDFNode, Vec3, Vec2 } from "./types.js";

// ─── Lint Warning / Error Types ───────────────────────────────────────────────
export interface SDFLintIssue {
  code: string;
  severity: "warning" | "error";
  message: string;
  path?: string; // dot-separated path to the offending node
}


// Helper to coerce any value to a valid finite number with a fallback
function toNum(val: unknown, fallback: number = 0): number {
  if (typeof val === "number" && !isNaN(val) && isFinite(val)) return val;
  if (typeof val === "string") {
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && isFinite(parsed)) return parsed;
  }
  return fallback;
}

// Helper to coerce a 3D vector [x, y, z]
function toVec3(val: unknown, fallback: Vec3 = [0, 0, 0]): Vec3 {
  if (Array.isArray(val)) {
    return [
      toNum(val[0], fallback[0]),
      toNum(val[1], fallback[1]),
      toNum(val[2], fallback[2]),
    ];
  }
  if (typeof val === "number" || typeof val === "string") {
    const n = toNum(val, 1.0);
    return [n, n, n];
  }
  return fallback;
}

// Helper to coerce a 2D vector [w, d]
function toVec2(val: unknown, fallback: Vec2 = [2, 2]): Vec2 {
  if (Array.isArray(val)) {
    return [toNum(val[0], fallback[0]), toNum(val[1], fallback[1])];
  }
  if (typeof val === "number" || typeof val === "string") {
    const n = toNum(val, 2.0);
    return [n, n];
  }
  return fallback;
}

// Operator aliases mapping
const OP_ALIASES: Record<string, string> = {
  smooth_union: "smoothUnion",
  "smooth-union": "smoothUnion",
  smooth_add: "smoothUnion",
  blend: "smoothUnion",
  melt: "smoothUnion",
  smooth_subtraction: "smoothSubtraction",
  "smooth-subtraction": "smoothSubtraction",
  smooth_diff: "smoothSubtraction",
  smooth_cut: "smoothSubtraction",
  smooth_intersection: "smoothIntersection",
  "smooth-intersection": "smoothIntersection",
  difference: "subtraction",
  diff: "subtraction",
  subtract: "subtraction",
  cut: "subtraction",
  carve: "subtraction",
  add: "union",
  group: "union",
  merge: "union",
  combine: "union",
  intersect: "intersection",
  pyramids: "pyramid",
  pyramid3d: "pyramid",
  tetrahedron: "pyramid",
  prism: "hexPrism",
  hex_prism: "hexPrism",
  hexagon: "hexPrism",
  radial_repeat: "radialRepeat",
  radial_array: "radialRepeat",
  radial: "radialRepeat",
  mirror: "symmetry",
  reflection: "symmetry",
  scale: "transform",
  rotate: "transform",
  translate: "transform",
  move: "transform",
  oval: "ellipsoid",
  egg: "ellipsoid",
};

/**
 * Deep recursive sanitizer that auto-corrects string numbers,
 * normalizes operator aliases, and repairs structural glitches.
 */
export function sanitizeSDFNode(node: any): SDFNode {
  if (!node || typeof node !== "object") {
    return { op: "sphere", radius: 1.0, material: { color: "#818cf8" } };
  }

  let rawOp = String(node.op || "").trim();
  let cleanOp = OP_ALIASES[rawOp.toLowerCase()] || rawOp;

  const mat = node.material && typeof node.material === "object" ? node.material : undefined;

  switch (cleanOp) {
    case "sphere":
      return {
        op: "sphere",
        radius: Math.max(0.05, toNum(node.radius, 1.0)),
        center: node.center ? toVec3(node.center, [0, 0, 0]) : undefined,
        material: mat,
      };

    case "box":
      return {
        op: "box",
        size: toVec3(node.size, [2, 2, 2]),
        center: node.center ? toVec3(node.center, [0, 0, 0]) : undefined,
        rounding: node.rounding !== undefined ? Math.max(0, toNum(node.rounding, 0)) : undefined,
        material: mat,
      };

    case "cylinder":
      return {
        op: "cylinder",
        radius: Math.max(0.05, toNum(node.radius, 0.8)),
        height: Math.max(0.05, toNum(node.height, 2.0)),
        center: node.center ? toVec3(node.center, [0, 0, 0]) : undefined,
        rounding: node.rounding !== undefined ? Math.max(0, toNum(node.rounding, 0)) : undefined,
        material: mat,
      };

    case "torus":
      return {
        op: "torus",
        majorRadius: Math.max(0.1, toNum(node.majorRadius, 1.2)),
        minorRadius: Math.max(0.02, toNum(node.minorRadius, 0.3)),
        center: node.center ? toVec3(node.center, [0, 0, 0]) : undefined,
        material: mat,
      };

    case "capsule":
      return {
        op: "capsule",
        a: toVec3(node.a, [0, -1, 0]),
        b: toVec3(node.b, [0, 1, 0]),
        radius: Math.max(0.05, toNum(node.radius, 0.5)),
        material: mat,
      };

    case "cone":
      return {
        op: "cone",
        radius: Math.max(0.05, toNum(node.radius, 1.0)),
        height: Math.max(0.05, toNum(node.height, 2.5)),
        center: node.center ? toVec3(node.center, [0, 0, 0]) : undefined,
        material: mat,
      };

    case "hexPrism":
      return {
        op: "hexPrism",
        radius: Math.max(0.05, toNum(node.radius, 0.8)),
        height: Math.max(0.05, toNum(node.height, 2.0)),
        center: node.center ? toVec3(node.center, [0, 0, 0]) : undefined,
        rounding: node.rounding !== undefined ? Math.max(0, toNum(node.rounding, 0)) : undefined,
        material: mat,
      };

    case "ellipsoid":
      return {
        op: "ellipsoid",
        radii: toVec3(node.radii, [1.5, 1.0, 1.0]),
        center: node.center ? toVec3(node.center, [0, 0, 0]) : undefined,
        material: mat,
      };

    case "pyramid":
      return {
        op: "pyramid",
        height: Math.max(0.05, toNum(node.height, 2.5)),
        baseSize: toVec2(node.baseSize, [2.5, 2.5]),
        center: node.center ? toVec3(node.center, [0, 0, 0]) : undefined,
        material: mat,
      };

    case "union":
    case "intersection":
    case "smoothUnion":
    case "smoothIntersection": {
      const rawChildren = Array.isArray(node.children) ? node.children : [node.child || node.a, node.b].filter(Boolean);
      const sanitizedChildren = rawChildren.map(sanitizeSDFNode);
      if (sanitizedChildren.length === 0) {
        sanitizedChildren.push({ op: "sphere", radius: 1.0 });
      }

      if (cleanOp === "smoothUnion" || cleanOp === "smoothIntersection") {
        return {
          op: cleanOp,
          k: Math.max(0, toNum(node.k, 0.45)),
          children: sanitizedChildren,
          material: mat,
        };
      }
      return {
        op: cleanOp as "union" | "intersection",
        children: sanitizedChildren,
        material: mat,
      };
    }

    case "subtraction":
    case "smoothSubtraction": {
      const nodeA = sanitizeSDFNode(node.a || (Array.isArray(node.children) ? node.children[0] : null));
      const nodeB = sanitizeSDFNode(node.b || (Array.isArray(node.children) ? node.children[1] : null));

      if (cleanOp === "smoothSubtraction") {
        return {
          op: "smoothSubtraction",
          k: Math.max(0, toNum(node.k, 0.35)),
          a: nodeA,
          b: nodeB,
          material: mat,
        };
      }
      return {
        op: "subtraction",
        a: nodeA,
        b: nodeB,
        material: mat,
      };
    }

    case "repeat":
      return {
        op: "repeat",
        period: toVec3(node.period, [1.5, 1.5, 1.5]),
        child: sanitizeSDFNode(node.child),
        material: mat,
      };

    case "repeatLimited":
      return {
        op: "repeatLimited",
        period: toVec3(node.period, [1.2, 1.2, 1.2]),
        limit: toVec3(node.limit, [2, 2, 2]),
        child: sanitizeSDFNode(node.child),
        material: mat,
      };

    case "radialRepeat":
      return {
        op: "radialRepeat",
        count: Math.max(2, Math.round(toNum(node.count, 6))),
        axis: node.axis === "x" || node.axis === "y" || node.axis === "z" ? node.axis : "y",
        child: sanitizeSDFNode(node.child),
        material: mat,
      };

    case "symmetry":
      return {
        op: "symmetry",
        axes: Array.isArray(node.axes) ? node.axes.filter((ax: any) => ax === "x" || ax === "y" || ax === "z") : ["x"],
        child: sanitizeSDFNode(node.child),
        material: mat,
      };

    case "twist":
      return {
        op: "twist",
        strength: toNum(node.strength, 0.5),
        child: sanitizeSDFNode(node.child),
        material: mat,
      };

    case "bend":
      return {
        op: "bend",
        strength: toNum(node.strength, 0.3),
        child: sanitizeSDFNode(node.child),
        material: mat,
      };

    case "displace":
      return {
        op: "displace",
        amplitude: toNum(node.amplitude, 0.1),
        frequency: node.frequency !== undefined ? toNum(node.frequency, 3.0) : undefined,
        child: sanitizeSDFNode(node.child),
        material: mat,
      };

    case "elongate":
      return {
        op: "elongate",
        size: toVec3(node.size, [1, 1, 1]),
        child: sanitizeSDFNode(node.child),
        material: mat,
      };

    case "transform": {
      let sc: Vec3 | number | undefined = undefined;
      if (node.scale !== undefined) {
        if (Array.isArray(node.scale)) {
          sc = toVec3(node.scale, [1, 1, 1]);
        } else {
          sc = toNum(node.scale, 1.0);
        }
      }
      return {
        op: "transform",
        translate: node.translate ? toVec3(node.translate, [0, 0, 0]) : undefined,
        rotate: node.rotate ? toVec3(node.rotate, [0, 0, 0]) : undefined,
        scale: sc,
        child: sanitizeSDFNode(node.child),
        material: mat,
      };
    }

    case "onion":
      return {
        op: "onion",
        thickness: Math.max(0.01, toNum(node.thickness, 0.1)),
        child: sanitizeSDFNode(node.child),
        material: mat,
      };

    // WS3.2 — hexShellCells first-class op
    case "hexShellCells":
      return {
        op: "hexShellCells",
        shellThickness: Math.max(0.01, toNum(node.shellThickness, 0.1)),
        cellSize: Math.max(0.05, toNum(node.cellSize, 0.3)),
        cellDepth: Math.max(0.01, toNum(node.cellDepth, 0.15)),
        child: sanitizeSDFNode(node.child),
        material: mat,
      } as any;

    default:
      // Graceful fallback for any unknown op: convert to smoothUnion or sphere
      if (node.children && Array.isArray(node.children)) {
        return {
          op: "smoothUnion",
          k: 0.45,
          children: node.children.map(sanitizeSDFNode),
          material: mat,
        };
      }
      if (node.child) {
        return sanitizeSDFNode(node.child);
      }
      return {
        op: "sphere",
        radius: toNum(node.radius, 1.0),
        center: node.center ? toVec3(node.center, [0, 0, 0]) : undefined,
        material: mat,
      };
  }
}

/**
 * Universal SDFDocument Validator with Automatic Pre-Sanitization
 */
export function validateSDFDocument(input: unknown): { success: boolean; data?: SDFDocument; error?: string } {
  if (!input || typeof input !== "object") {
    return { success: false, error: "Input is not an object" };
  }

  const rawDoc = input as any;
  const rootInput = rawDoc.root || (rawDoc.op ? rawDoc : null);

  if (!rootInput) {
    return { success: false, error: "Missing root node in document" };
  }

  const sanitizedRoot = sanitizeSDFNode(rootInput);

  const doc: SDFDocument = {
    version: "sdf-dsl-1",
    name: typeof rawDoc.name === "string" ? rawDoc.name : "AI Generated Model",
    description: typeof rawDoc.description === "string" ? rawDoc.description : undefined,
    bounds: rawDoc.bounds
      ? {
          min: toVec3(rawDoc.bounds.min, [-3.5, -3.5, -3.5]),
          max: toVec3(rawDoc.bounds.max, [3.5, 3.5, 3.5]),
        }
      : { min: [-3.5, -3.5, -3.5], max: [3.5, 3.5, 3.5] },
    resolution: rawDoc.resolution ? toNum(rawDoc.resolution, 96) : 96,
    material: rawDoc.material,
    root: sanitizedRoot,
  };

  return { success: true, data: doc };
}

export function validateSDFNode(input: unknown): { success: boolean; data?: SDFNode; error?: string } {
  const sanitized = sanitizeSDFNode(input);
  return { success: true, data: sanitized };
}

// ─────────────────────────────────────────────────────────────────────────────
// WS1.4 + WS3.3 — Structural Lint Passes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * WS1.4 — Modifier Nesting Lint:
 * Flags any smoothUnion where one child is a domain-warp (twist/bend) and a
 * sibling occupies a spatially overlapping region — the sibling should be
 * nested inside the warp rather than placed as a peer.
 *
 * WS3.3 — CAVITY_WITHOUT_HOLLOW:
 * Flags any subtraction / smoothSubtraction node (carving) that is not
 * enclosed by an onion or hexShellCells ancestor. Cutting cells into a solid
 * mass is almost always an authoring mistake for biomimetic/lattice shapes.
 */
export function lintSDFDocument(root: SDFNode, path = "root"): SDFLintIssue[] {
  const issues: SDFLintIssue[] = [];

  function walk(node: SDFNode, p: string, hasHollowAncestor: boolean): void {
    if (!node || typeof node !== "object") return;

    const isHollow = node.op === "onion" || (node as any).op === "hexShellCells";
    const hollowCtx = hasHollowAncestor || isHollow;

    // WS3.3 — Cavity-without-hollow check
    if ((node.op === "subtraction" || node.op === "smoothSubtraction") && !hollowCtx) {
      issues.push({
        code: "CAVITY_WITHOUT_HOLLOW",
        severity: "warning",
        message:
          `Carving op '${node.op}' at '${p}' is cutting into what appears to be a solid hull. ` +
          "Wrap the surface with 'onion' (shell) or use 'hexShellCells' before carving to avoid " +
          "tunnels through solid geometry.",
        path: p,
      });
    }

    // WS1.4 — Modifier nesting lint on smoothUnion children
    if (node.op === "smoothUnion" && Array.isArray(node.children)) {
      const twistBendIdx = node.children.findIndex(
        (ch: SDFNode) => ch.op === "twist" || ch.op === "bend"
      );
      if (twistBendIdx !== -1 && node.children.length > 1) {
        const warpNode = node.children[twistBendIdx];
        const siblings = node.children.filter((_, i) => i !== twistBendIdx);
        // Warn if siblings exist — they may need to be inside the warp
        const siblingOps = siblings.map((s: SDFNode) => s.op).join(", ");
        issues.push({
          code: "MODIFIER_NESTING",
          severity: "warning",
          message:
            `smoothUnion at '${p}' has a '${warpNode.op}' child and ${siblings.length} sibling(s) [${siblingOps}]. ` +
            "Features that are conceptually part of the warped shape (e.g. windows on a twisted spire) " +
            "should be nested inside the '" + warpNode.op + "' node, not placed as siblings.",
          path: p,
        });
      }
    }

    // Recurse
    if ("children" in node && Array.isArray((node as any).children)) {
      (node as any).children.forEach((ch: SDFNode, i: number) =>
        walk(ch, `${p}.children[${i}]`, hollowCtx)
      );
    }
    if ("child" in node && (node as any).child) {
      walk((node as any).child, `${p}.child`, hollowCtx);
    }
    if ("a" in node && (node as any).a) {
      walk((node as any).a, `${p}.a`, hollowCtx);
    }
    if ("b" in node && (node as any).b && typeof (node as any).b === "object" && "op" in (node as any).b) {
      walk((node as any).b, `${p}.b`, hollowCtx);
    }
  }

  walk(root, path, false);
  return issues;
}
