export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

export interface SphereNode {
  op: "sphere";
  radius: number;
  center?: Vec3;
}

export interface BoxNode {
  op: "box";
  size: Vec3;
  center?: Vec3;
  rounding?: number;
}

export interface CylinderNode {
  op: "cylinder";
  radius: number;
  height: number;
  center?: Vec3;
  rounding?: number;
}

export interface TorusNode {
  op: "torus";
  majorRadius: number;
  minorRadius: number;
  center?: Vec3;
}

export interface CapsuleNode {
  op: "capsule";
  a: Vec3;
  b: Vec3;
  radius: number;
}

export interface ConeNode {
  op: "cone";
  radius: number;
  height: number;
  center?: Vec3;
}

export interface HexPrismNode {
  op: "hexPrism";
  radius: number;
  height: number;
  center?: Vec3;
  rounding?: number;
}

export interface UnionNode {
  op: "union";
  children: SDFNode[];
}

export interface IntersectionNode {
  op: "intersection";
  children: SDFNode[];
}

export interface SubtractionNode {
  op: "subtraction";
  a: SDFNode;
  b: SDFNode;
}

export interface SmoothUnionNode {
  op: "smoothUnion";
  k: number;
  children: SDFNode[];
}

export interface SmoothIntersectionNode {
  op: "smoothIntersection";
  k: number;
  children: SDFNode[];
}

export interface SmoothSubtractionNode {
  op: "smoothSubtraction";
  k: number;
  a: SDFNode;
  b: SDFNode;
}

export interface RepeatNode {
  op: "repeat";
  period: Vec3;
  child: SDFNode;
}

export interface RepeatLimitedNode {
  op: "repeatLimited";
  period: Vec3;
  limit: Vec3;
  child: SDFNode;
}

export interface TwistNode {
  op: "twist";
  strength: number;
  child: SDFNode;
}

export interface BendNode {
  op: "bend";
  strength: number;
  child: SDFNode;
}

export interface DisplaceNode {
  op: "displace";
  amplitude: number;
  frequency?: number;
  child: SDFNode;
}

export interface TransformNode {
  op: "transform";
  translate?: Vec3;
  rotate?: Vec3;
  scale?: Vec3 | number;
  child: SDFNode;
}

export interface OnionNode {
  op: "onion";
  thickness: number;
  child: SDFNode;
}

export type SDFNode =
  | SphereNode
  | BoxNode
  | CylinderNode
  | TorusNode
  | CapsuleNode
  | ConeNode
  | HexPrismNode
  | UnionNode
  | IntersectionNode
  | SubtractionNode
  | SmoothUnionNode
  | SmoothIntersectionNode
  | SmoothSubtractionNode
  | RepeatNode
  | RepeatLimitedNode
  | TwistNode
  | BendNode
  | DisplaceNode
  | TransformNode
  | OnionNode;

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
  root: SDFNode;
}
