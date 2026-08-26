import type { SDFDocument } from "./types.js";

export const PRESETS: Record<string, SDFDocument> = {
  honeycombHouse: {
    version: "sdf-dsl-1",
    name: "Honeycomb Organic House",
    description: "An organic biomimetic dwelling with hexagonal cell carvings and smooth blended dome roof.",
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
        },
      },
      a: {
        op: "smoothUnion",
        k: 0.6,
        children: [
          // Base dome body
          {
            op: "transform",
            scale: [1.8, 1.4, 1.8],
            translate: [0, 0, 0],
            child: {
              op: "sphere",
              radius: 1.2,
              center: [0, 0, 0],
            },
          },
          // Organic curved porch/entrance
          {
            op: "capsule",
            a: [0, -0.6, 0.8],
            b: [0, -0.8, 2.2],
            radius: 0.7,
          },
          // Surrounding organic grounding skirt
          {
            op: "torus",
            majorRadius: 1.9,
            minorRadius: 0.35,
            center: [0, -1.0, 0],
          },
        ],
      },
    },
  },

  organicCoral: {
    version: "sdf-dsl-1",
    name: "Organic Coral Tree",
    description: "Branching organic structures smoothly merged with ripple displacement.",
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
          // Central trunk
          {
            op: "capsule",
            a: [0, -1.8, 0],
            b: [0, 0.4, 0],
            radius: 0.55,
          },
          // Left organic branch
          {
            op: "capsule",
            a: [0, -0.4, 0],
            b: [-1.2, 1.3, 0.3],
            radius: 0.35,
          },
          // Right organic branch
          {
            op: "capsule",
            a: [0, 0.1, 0],
            b: [1.1, 1.4, -0.2],
            radius: 0.32,
          },
          // Sub-branch tip
          {
            op: "sphere",
            radius: 0.45,
            center: [-1.2, 1.4, 0.3],
          },
          {
            op: "sphere",
            radius: 0.42,
            center: [1.1, 1.5, -0.2],
          },
          // Ground base
          {
            op: "transform",
            scale: [1.8, 0.5, 1.8],
            child: {
              op: "sphere",
              radius: 1.0,
              center: [0, -1.8, 0],
            },
          },
        ],
      },
    },
  },

  twistedSpire: {
    version: "sdf-dsl-1",
    name: "Biomorphic Twisted Spire",
    description: "An architectural tower created via smooth non-linear domain twisting and hollow cavity.",
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
            },
            {
              op: "torus",
              majorRadius: 1.2,
              minorRadius: 0.3,
              center: [0, 0.5, 0],
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
          },
        },
      },
    },
  },

  mushroomPod: {
    version: "sdf-dsl-1",
    name: "Mushroom Bio-Pod",
    description: "Curved canopy cap gently blended onto an undulating stalk with interior hollow.",
    bounds: { min: [-3.0, -3.0, -3.0], max: [3.0, 3.0, 3.0] },
    resolution: 96,
    root: {
      op: "smoothUnion",
      k: 0.5,
      children: [
        // Top Cap
        {
          op: "transform",
          scale: [2.2, 0.9, 2.2],
          translate: [0, 0.8, 0],
          child: {
            op: "intersection",
            children: [
              { op: "sphere", radius: 1.2, center: [0, 0, 0] },
              { op: "box", size: [3, 2, 3], center: [0, 0.5, 0] },
            ],
          },
        },
        // Curved Stalk
        {
          op: "bend",
          strength: 0.2,
          child: {
            op: "cylinder",
            radius: 0.5,
            height: 2.8,
            rounding: 0.15,
            center: [0, -0.6, 0],
          },
        },
        // Base roots
        {
          op: "torus",
          majorRadius: 1.0,
          minorRadius: 0.35,
          center: [0, -1.8, 0],
        },
      ],
    },
  },
};
