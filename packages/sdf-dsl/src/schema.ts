import { z } from "zod";

export const Vec3Schema = z.tuple([z.number(), z.number(), z.number()]);
export const Vec2Schema = z.tuple([z.number(), z.number()]);

// Base Primitives
export const SphereNodeSchema = z.object({
  op: z.literal("sphere"),
  radius: z.number().positive(),
  center: Vec3Schema.optional(),
});

export const BoxNodeSchema = z.object({
  op: z.literal("box"),
  size: Vec3Schema,
  center: Vec3Schema.optional(),
  rounding: z.number().min(0).optional(),
});

export const CylinderNodeSchema = z.object({
  op: z.literal("cylinder"),
  radius: z.number().positive(),
  height: z.number().positive(),
  center: Vec3Schema.optional(),
  rounding: z.number().min(0).optional(),
});

export const TorusNodeSchema = z.object({
  op: z.literal("torus"),
  majorRadius: z.number().positive(),
  minorRadius: z.number().positive(),
  center: Vec3Schema.optional(),
});

export const CapsuleNodeSchema = z.object({
  op: z.literal("capsule"),
  a: Vec3Schema,
  b: Vec3Schema,
  radius: z.number().positive(),
});

export const ConeNodeSchema = z.object({
  op: z.literal("cone"),
  radius: z.number().positive(),
  height: z.number().positive(),
  center: Vec3Schema.optional(),
});

export const HexPrismNodeSchema = z.object({
  op: z.literal("hexPrism"),
  radius: z.number().positive(),
  height: z.number().positive(),
  center: Vec3Schema.optional(),
  rounding: z.number().min(0).optional(),
});

// Recursive SDFNode Schema using z.lazy
export const SDFNodeSchema: z.ZodType<any> = z.lazy(() =>
  z.discriminatedUnion("op", [
    SphereNodeSchema,
    BoxNodeSchema,
    CylinderNodeSchema,
    TorusNodeSchema,
    CapsuleNodeSchema,
    ConeNodeSchema,
    HexPrismNodeSchema,
    z.object({
      op: z.literal("union"),
      children: z.array(SDFNodeSchema).min(1),
    }),
    z.object({
      op: z.literal("intersection"),
      children: z.array(SDFNodeSchema).min(1),
    }),
    z.object({
      op: z.literal("subtraction"),
      a: SDFNodeSchema,
      b: SDFNodeSchema,
    }),
    z.object({
      op: z.literal("smoothUnion"),
      k: z.number().min(0),
      children: z.array(SDFNodeSchema).min(1),
    }),
    z.object({
      op: z.literal("smoothIntersection"),
      k: z.number().min(0),
      children: z.array(SDFNodeSchema).min(1),
    }),
    z.object({
      op: z.literal("smoothSubtraction"),
      k: z.number().min(0),
      a: SDFNodeSchema,
      b: SDFNodeSchema,
    }),
    z.object({
      op: z.literal("repeat"),
      period: Vec3Schema,
      child: SDFNodeSchema,
    }),
    z.object({
      op: z.literal("repeatLimited"),
      period: Vec3Schema,
      limit: Vec3Schema,
      child: SDFNodeSchema,
    }),
    z.object({
      op: z.literal("twist"),
      strength: z.number(),
      child: SDFNodeSchema,
    }),
    z.object({
      op: z.literal("bend"),
      strength: z.number(),
      child: SDFNodeSchema,
    }),
    z.object({
      op: z.literal("displace"),
      amplitude: z.number(),
      frequency: z.number().optional(),
      child: SDFNodeSchema,
    }),
    z.object({
      op: z.literal("transform"),
      translate: Vec3Schema.optional(),
      rotate: Vec3Schema.optional(),
      scale: z.union([Vec3Schema, z.number().positive()]).optional(),
      child: SDFNodeSchema,
    }),
    z.object({
      op: z.literal("onion"),
      thickness: z.number().positive(),
      child: SDFNodeSchema,
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
  root: SDFNodeSchema,
});
