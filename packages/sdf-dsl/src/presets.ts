import type { SDFDocument } from "./types.js";

export const PRESETS: Record<string, SDFDocument> = {
  honeycombHouse: {
    version: "sdf-dsl-1",
    name: "Honeycomb Biomimetic House",
    description: "An organic dwelling with sandstone walls, amber carved hexagonal cells, and a slate blue foundation.",
    bounds: { min: [-3.5, -3.5, -3.5], max: [3.5, 3.5, 3.5] },
    resolution: 96,
    root: {
      op: "smoothSubtraction",
      k: 0.35,
      b: {
        op: "repeatLimited",
        period: [1.1, 1.1, 1.1],
        limit: [2, 2, 2],
        child: {
          op: "hexPrism",
          radius: 0.42,
          height: 3.2,
          rounding: 0.08,
          center: [0, 0, 0],
          material: { color: "#f59e0b", roughness: 0.3, emissive: "#d97706" }, // Amber cutout glow
        },
      },
      a: {
        op: "smoothUnion",
        k: 0.6,
        children: [
          // Base dome body in sandstone
          {
            op: "transform",
            scale: [1.8, 1.4, 1.8],
            translate: [0, 0, 0],
            child: {
              op: "sphere",
              radius: 1.2,
              center: [0, 0, 0],
              material: { color: "#e2d9cc", roughness: 0.7, metalness: 0.05 }, // Warm Sandstone
            },
          },
          // Organic curved entrance
          {
            op: "capsule",
            a: [0, -0.6, 0.8],
            b: [0, -0.8, 2.2],
            radius: 0.7,
            material: { color: "#c4b5a0", roughness: 0.6 },
          },
          // Grounding skirt in slate
          {
            op: "torus",
            majorRadius: 1.9,
            minorRadius: 0.35,
            center: [0, -1.0, 0],
            material: { color: "#334155", roughness: 0.5, metalness: 0.2 }, // Slate Foundation
          },
        ],
      },
    },
  },

  organicCoral: {
    version: "sdf-dsl-1",
    name: "Bioluminescent Coral Tree",
    description: "Deep sea branching coral with glowing turquoise arms, rose pink tips, and obsidian seafloor base.",
    bounds: { min: [-3.0, -3.0, -3.0], max: [3.0, 3.0, 3.0] },
    resolution: 96,
    root: {
      op: "displace",
      amplitude: 0.06,
      frequency: 4.0,
      child: {
        op: "smoothUnion",
        k: 0.45,
        children: [
          // Central turquoise trunk
          {
            op: "capsule",
            a: [0, -1.8, 0],
            b: [0, 0.4, 0],
            radius: 0.55,
            material: { color: "#06b6d4", roughness: 0.4, metalness: 0.1 }, // Cyan trunk
          },
          // Left branching arm
          {
            op: "capsule",
            a: [0, -0.4, 0],
            b: [-1.2, 1.3, 0.3],
            radius: 0.35,
            material: { color: "#0891b2", roughness: 0.4 },
          },
          // Right branching arm
          {
            op: "capsule",
            a: [0, 0.1, 0],
            b: [1.1, 1.4, -0.2],
            radius: 0.32,
            material: { color: "#0891b2", roughness: 0.4 },
          },
          // Rose Pink Glowing Buds
          {
            op: "sphere",
            radius: 0.45,
            center: [-1.2, 1.4, 0.3],
            material: { color: "#f43f5e", roughness: 0.2, emissive: "#e11d48" }, // Pink Bud
          },
          {
            op: "sphere",
            radius: 0.42,
            center: [1.1, 1.5, -0.2],
            material: { color: "#f43f5e", roughness: 0.2, emissive: "#e11d48" },
          },
          // Deep obsidian base
          {
            op: "transform",
            scale: [1.8, 0.5, 1.8],
            child: {
              op: "sphere",
              radius: 1.0,
              center: [0, -1.8, 0],
              material: { color: "#1e1b4b", roughness: 0.8 },
            },
          },
        ],
      },
    },
  },

  mushroomPod: {
    version: "sdf-dsl-1",
    name: "Mushroom Bio-Pod",
    description: "Crimson spotted canopy cap blended seamlessly onto a creamy ivory curved stalk.",
    bounds: { min: [-3.0, -3.0, -3.0], max: [3.0, 3.0, 3.0] },
    resolution: 96,
    root: {
      op: "smoothUnion",
      k: 0.5,
      children: [
        // Top Cap in Crimson
        {
          op: "transform",
          scale: [2.2, 0.9, 2.2],
          translate: [0, 0.8, 0],
          child: {
            op: "intersection",
            children: [
              { 
                op: "sphere", 
                radius: 1.2, 
                center: [0, 0, 0], 
                material: { color: "#dc2626", roughness: 0.4 } // Crimson Cap
              },
              { 
                op: "box", 
                size: [3, 2, 3], 
                center: [0, 0.5, 0],
                material: { color: "#dc2626", roughness: 0.4 } 
              },
            ],
          },
        },
        // Curved Stalk in Creamy Ivory
        {
          op: "bend",
          strength: 0.2,
          child: {
            op: "cylinder",
            radius: 0.5,
            height: 2.8,
            rounding: 0.15,
            center: [0, -0.6, 0],
            material: { color: "#fef3c7", roughness: 0.8 }, // Ivory Stalk
          },
        },
        // Mossy Base
        {
          op: "torus",
          majorRadius: 1.0,
          minorRadius: 0.35,
          center: [0, -1.8, 0],
          material: { color: "#15803d", roughness: 0.9 }, // Moss Green Base
        },
      ],
    },
  },

  twistedSpire: {
    version: "sdf-dsl-1",
    name: "Cybernetic Twisted Spire",
    description: "A futuristic architectural monolith with dark metallic body, golden rings, and twisted arches.",
    bounds: { min: [-2.5, -3.5, -2.5], max: [2.5, 3.5, 2.5] },
    resolution: 96,
    root: {
      op: "twist",
      strength: 0.75,
      child: {
        op: "smoothSubtraction",
        k: 0.25,
        a: {
          op: "smoothUnion",
          k: 0.5,
          children: [
            {
              op: "cone",
              radius: 1.6,
              height: 4.5,
              center: [0, -0.5, 0],
              material: { color: "#1e293b", roughness: 0.2, metalness: 0.8 }, // Dark Carbon
            },
            {
              op: "torus",
              majorRadius: 1.2,
              minorRadius: 0.3,
              center: [0, 0.5, 0],
              material: { color: "#fbbf24", roughness: 0.15, metalness: 0.9 }, // Gold Ring
            },
          ],
        },
        b: {
          op: "repeatLimited",
          period: [0, 1.2, 0],
          limit: [0, 2, 0],
          child: {
            op: "cylinder",
            radius: 0.6,
            height: 0.8,
            rounding: 0.2,
            center: [0.7, 0, 0],
            material: { color: "#38bdf8", emissive: "#0284c7" },
          },
        },
      },
    },
  },
};
