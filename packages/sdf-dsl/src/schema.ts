import { z } from "zod";

export const Vec3Schema = z.tuple([z.number(), z.number(), z.number()]);
export const Vec2Schema = z.tuple([z.number(), z.number()]);

export const ColorValueSchema = z.union([
  z.string(),
  z.tuple([z.number(), z.number(), z.number()]),
  z.array(z.number()),
]);

export const MaterialDefSchema = z.object({
  color: ColorValueSchema.optional(),
  roughness: z.number().min(0).max(1).optional(),
  metalness: z.number().min(0).max(1).optional(),
  emissive: ColorValueSchema.optional(),
});

// Base Primitives with optional MaterialDef
export const SphereNodeSchema = z.object({
  op: z.literal("sphere"),
  radius: z.number().positive(),
  center: Vec3Schema.optional(),
  material: MaterialDefSchema.optional(),
});

export const BoxNodeSchema = z.object({
  op: z.literal("box"),
  size: Vec3Schema,
  center: Vec3Schema.optional(),
  rounding: z.number().min(0).optional(),
  material: MaterialDefSchema.optional(),
});

export const CylinderNodeSchema = z.object({
  op: z.literal("cylinder"),
  radius: z.number().positive(),
  height: z.number().positive(),
  center: Vec3Schema.optional(),
  rounding: z.number().min(0).optional(),
  material: MaterialDefSchema.optional(),
});

export const TorusNodeSchema = z.object({
  op: z.literal("torus"),
  majorRadius: z.number().positive(),
  minorRadius: z.number().positive(),
  center: Vec3Schema.optional(),
  material: MaterialDefSchema.optional(),
});

export const CapsuleNodeSchema = z.object({
  op: z.literal("capsule"),
  a: Vec3Schema,
  b: Vec3Schema,
  radius: z.number().positive(),
  material: MaterialDefSchema.optional(),
});

export const ConeNodeSchema = z.object({
  op: z.literal("cone"),
  radius: z.number().positive(),
  height: z.number().positive(),
  center: Vec3Schema.optional(),
  material: MaterialDefSchema.optional(),
});

export const HexPrismNodeSchema = z.object({
  op: z.literal("hexPrism"),
  radius: z.number().positive(),
  height: z.number().positive(),
  center: Vec3Schema.optional(),
  rounding: z.number().min(0).optional(),
  material: MaterialDefSchema.optional(),
});

export const EllipsoidNodeSchema = z.object({
  op: z.literal("ellipsoid"),
  radii: Vec3Schema,
  center: Vec3Schema.optional(),
  material: MaterialDefSchema.optional(),
});

export const PyramidNodeSchema = z.object({
  op: z.literal("pyramid"),
  height: z.number().positive(),
  baseSize: Vec2Schema,
  center: Vec3Schema.optional(),
  material: MaterialDefSchema.optional(),
});

export const RevolveNodeSchema = z.object({
  op: z.literal("revolve"),
  profile: z.array(z.tuple([z.number(), z.number()])).min(2),
  center: Vec3Schema.optional(),
  material: MaterialDefSchema.optional(),
});

export const MirrorNodeSchema = z.object({
  op: z.literal("mirror"),
  axis: z.enum(["x", "y", "z"]),
  offset: z.number().optional(),
  child: z.lazy(() => SDFNodeSchema),
  material: MaterialDefSchema.optional(),
});

export const SweepNodeSchema = z.object({
  op: z.literal("sweep"),
  path: z.array(Vec3Schema).min(2),
  radius: z.number().positive(),
  material: MaterialDefSchema.optional(),
});

export const TaperNodeSchema = z.object({
  op: z.literal("taper"),
  factor: z.number(),
  axis: z.enum(["x", "y", "z"]).optional(),
  child: z.lazy(() => SDFNodeSchema),
  material: MaterialDefSchema.optional(),
});

// Recursive SDFNode Schema
export const SDFNodeSchema: z.ZodType<any> = z.lazy(() =>
  z.discriminatedUnion("op", [
    SphereNodeSchema,
    BoxNodeSchema,
    CylinderNodeSchema,
    TorusNodeSchema,
    CapsuleNodeSchema,
    ConeNodeSchema,
    HexPrismNodeSchema,
    EllipsoidNodeSchema,
    PyramidNodeSchema,
    RevolveNodeSchema,
    SweepNodeSchema,
    z.object({
      op: z.literal("union"),
      children: z.array(SDFNodeSchema).min(1),
      material: MaterialDefSchema.optional(),
    }),
    z.object({
      op: z.literal("intersection"),
      children: z.array(SDFNodeSchema).min(1),
      material: MaterialDefSchema.optional(),
    }),
    z.object({
      op: z.literal("subtraction"),
      a: SDFNodeSchema,
      b: SDFNodeSchema,
      material: MaterialDefSchema.optional(),
    }),
    z.object({
      op: z.literal("smoothUnion"),
      k: z.number().min(0),
      children: z.array(SDFNodeSchema).min(1),
      material: MaterialDefSchema.optional(),
    }),
    z.object({
      op: z.literal("smoothIntersection"),
      k: z.number().min(0),
      children: z.array(SDFNodeSchema).min(1),
      material: MaterialDefSchema.optional(),
    }),
    z.object({
      op: z.literal("smoothSubtraction"),
      k: z.number().min(0),
      a: SDFNodeSchema,
      b: SDFNodeSchema,
      material: MaterialDefSchema.optional(),
    }),
    z.object({
      op: z.literal("repeat"),
      period: Vec3Schema,
      child: SDFNodeSchema,
      material: MaterialDefSchema.optional(),
    }),
    z.object({
      op: z.literal("repeatLimited"),
      period: Vec3Schema,
      limit: Vec3Schema,
      child: SDFNodeSchema,
      material: MaterialDefSchema.optional(),
    }),
    z.object({
      op: z.literal("radialRepeat"),
      count: z.number().int().min(2),
      axis: z.enum(["x", "y", "z"]).optional(),
      child: SDFNodeSchema,
      material: MaterialDefSchema.optional(),
    }),
    z.object({
      op: z.literal("symmetry"),
      axes: z.array(z.enum(["x", "y", "z"])).min(1),
      child: SDFNodeSchema,
      material: MaterialDefSchema.optional(),
    }),
    MirrorNodeSchema,
    z.object({
      op: z.literal("twist"),
      strength: z.number(),
      child: SDFNodeSchema,
      material: MaterialDefSchema.optional(),
    }),
    z.object({
      op: z.literal("bend"),
      strength: z.number(),
      child: SDFNodeSchema,
      material: MaterialDefSchema.optional(),
    }),
    TaperNodeSchema,
    z.object({
      op: z.literal("displace"),
      amplitude: z.number(),
      frequency: z.number().optional(),
      child: SDFNodeSchema,
      material: MaterialDefSchema.optional(),
    }),
    z.object({
      op: z.literal("elongate"),
      size: Vec3Schema,
      child: SDFNodeSchema,
      material: MaterialDefSchema.optional(),
    }),
    z.object({
      op: z.literal("transform"),
      translate: Vec3Schema.optional(),
      rotate: Vec3Schema.optional(),
      scale: z.union([Vec3Schema, z.number().positive()]).optional(),
      child: SDFNodeSchema,
      material: MaterialDefSchema.optional(),
    }),
    z.object({
      op: z.literal("onion"),
      thickness: z.number().positive(),
      child: SDFNodeSchema,
      material: MaterialDefSchema.optional(),
    }),
    // WS3.2 — hexShellCells first-class op
    z.object({
      op: z.literal("hexShellCells"),
      shellThickness: z.number().positive(),
      cellSize: z.number().positive(),
      cellDepth: z.number().positive(),
      child: SDFNodeSchema,
      material: MaterialDefSchema.optional(),
    }),
  ])
);

export const SDFBoundsSchema = z.object({
  min: Vec3Schema,
  max: Vec3Schema,
});

export const SDFDocumentSchema = z.object({
  version: z.literal("sdf-dsl-1"),
  name: z.string().optional(),
  description: z.string().optional(),
  bounds: SDFBoundsSchema.optional(),
  resolution: z.number().int().min(16).max(256).optional(),
  material: MaterialDefSchema.optional(),
  root: SDFNodeSchema,
});
