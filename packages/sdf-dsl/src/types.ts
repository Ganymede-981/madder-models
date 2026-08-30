export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

export type ColorValue = string | [number, number, number] | number[];

export interface MaterialDef {
  color?: ColorValue; // Hex ("#ff8800"), name ("green", "orange", "crimson"), RGB string, or [r, g, b]
  roughness?: number; // 0.0 (smooth) to 1.0 (rough)
  metalness?: number; // 0.0 (dielectric) to 1.0 (metallic)
  emissive?: ColorValue; // Glowing emissive color
}

export interface SphereNode {
  op: "sphere";
  radius: number;
  center?: Vec3;
  material?: MaterialDef;
}

export interface BoxNode {
  op: "box";
  size: Vec3;
  center?: Vec3;
  rounding?: number;
  material?: MaterialDef;
}

export interface CylinderNode {
  op: "cylinder";
  radius: number;
  height: number;
  center?: Vec3;
  rounding?: number;
  material?: MaterialDef;
}

export interface TorusNode {
  op: "torus";
  majorRadius: number;
  minorRadius: number;
  center?: Vec3;
  material?: MaterialDef;
}

export interface CapsuleNode {
  op: "capsule";
  a: Vec3;
  b: Vec3;
  radius: number;
  material?: MaterialDef;
}

export interface ConeNode {
  op: "cone";
  radius: number;
  height: number;
  center?: Vec3;
  material?: MaterialDef;
}

export interface HexPrismNode {
  op: "hexPrism";
  radius: number;
  height: number;
  center?: Vec3;
  rounding?: number;
  material?: MaterialDef;
}

export interface EllipsoidNode {
  op: "ellipsoid";
  radii: Vec3;
  center?: Vec3;
  material?: MaterialDef;
}

export interface PyramidNode {
  op: "pyramid";
  height: number;
  baseSize: Vec2;
  center?: Vec3;
  material?: MaterialDef;
}

export interface UnionNode {
  op: "union";
  children: SDFNode[];
  material?: MaterialDef;
}

export interface IntersectionNode {
  op: "intersection";
  children: SDFNode[];
  material?: MaterialDef;
}

export interface SubtractionNode {
  op: "subtraction";
  a: SDFNode;
  b: SDFNode;
  material?: MaterialDef;
}

export interface SmoothUnionNode {
  op: "smoothUnion";
  k: number;
  children: SDFNode[];
  material?: MaterialDef;
}

export interface SmoothIntersectionNode {
  op: "smoothIntersection";
  k: number;
  children: SDFNode[];
  material?: MaterialDef;
}

export interface SmoothSubtractionNode {
  op: "smoothSubtraction";
  k: number;
  a: SDFNode;
  b: SDFNode;
  material?: MaterialDef;
}

export interface RepeatNode {
  op: "repeat";
  period: Vec3;
  child: SDFNode;
  material?: MaterialDef;
}

export interface RepeatLimitedNode {
  op: "repeatLimited";
  period: Vec3;
  limit: Vec3;
  child: SDFNode;
  material?: MaterialDef;
}

export interface RadialRepeatNode {
  op: "radialRepeat";
  count: number;
  axis?: "x" | "y" | "z";
  child: SDFNode;
  material?: MaterialDef;
}

export interface SymmetryNode {
  op: "symmetry";
  axes: ("x" | "y" | "z")[];
  child: SDFNode;
  material?: MaterialDef;
}

export interface TwistNode {
  op: "twist";
  strength: number;
  child: SDFNode;
  material?: MaterialDef;
}

export interface BendNode {
  op: "bend";
  strength: number;
  child: SDFNode;
  material?: MaterialDef;
}

export interface DisplaceNode {
  op: "displace";
  amplitude: number;
  frequency?: number;
  child: SDFNode;
  material?: MaterialDef;
}

export interface ElongateNode {
  op: "elongate";
  size: Vec3;
  child: SDFNode;
  material?: MaterialDef;
}

export interface TransformNode {
  op: "transform";
  translate?: Vec3;
  rotate?: Vec3;
  scale?: Vec3 | number;
  child: SDFNode;
  material?: MaterialDef;
}

export interface OnionNode {
  op: "onion";
  thickness: number;
  child: SDFNode;
  material?: MaterialDef;
}

/** WS3.2 — First-class hex shell lattice op. Hollows a surface to shellThickness
 *  and carves hex cells oriented along the local normal. */
export interface HexShellCellsNode {
  op: "hexShellCells";
  shellThickness: number;
  cellSize: number;
  cellDepth: number;
  child: SDFNode;
  material?: MaterialDef;
}

export type SDFNode =
  | SphereNode
  | BoxNode
  | CylinderNode
  | TorusNode
  | CapsuleNode
  | ConeNode
  | HexPrismNode
  | EllipsoidNode
  | PyramidNode
  | UnionNode
  | IntersectionNode
  | SubtractionNode
  | SmoothUnionNode
  | SmoothIntersectionNode
  | SmoothSubtractionNode
  | RepeatNode
  | RepeatLimitedNode
  | RadialRepeatNode
  | SymmetryNode
  | TwistNode
  | BendNode
  | DisplaceNode
  | ElongateNode
  | TransformNode
  | OnionNode
  | HexShellCellsNode;

export interface SDFBounds {
  min: Vec3;
  max: Vec3;
}

export interface SDFDocument {
  version: "sdf-dsl-1";
  name?: string;
  description?: string;
  bounds?: SDFBounds;
  resolution?: number;
  material?: MaterialDef;
  root: SDFNode;
}

// ─── WS3.1 — 4-Layer Geometry Schema ───────────────────────────────────────────────────

/**
 * Typed per-part plan used by the Architect (Stage 1) to describe each semantic
 * component. The Sculptor (Stage 2) converts this plan into an SDF sub-tree.
 *
 * Layer 1 — Hull:        Primary volume / silhouette primitive.
 * Layer 2 — Deformations: Domain warps applied to the hull.
 * Layer 3 — Cavities:    Carved negative space (windows, cells, pores).
 * Layer 4 — Appendages:  Attached secondary features (fins, legs, chimneys).
 */
export interface PartGeometryPlan {
  hull: { type: string; params: Record<string, number> };
  deformations: {
    type: "bend" | "twist" | "taper" | "ripple";
    params: Record<string, number>;
  }[];
  cavities: {
    type: string;
    anchor: Vec3;
    params: Record<string, number>;
    requiresShell?: boolean; // hint to Sculptor to apply onion before carving
  }[];
  appendages: {
    type: string;
    anchor: Vec3;
    count?: number;
    params: Record<string, number>;
  }[];
}

/** A single named semantic part within a multi-part scene blueprint. */
export interface ScenePartBlueprint {
  id: string;
  name: string;
  description: string;
  anchor: Vec3;
  scale?: Vec3 | number;
  color: string;
  geometryPlan: PartGeometryPlan;
}

/** Top-level scene blueprint produced by the Architect (Stage 1). */
export interface SceneBlueprint {
  sceneName: string;
  description: string;
  parts: ScenePartBlueprint[];
}
