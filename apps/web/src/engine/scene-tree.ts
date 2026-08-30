import type { SDFDocument, SDFNode, Vec3 } from "@madder/sdf-dsl";

export interface SceneObject {
  id: string;
  name: string;
  op: string;
  color?: string;
  translate: Vec3;
  rotate: Vec3;
  scale: Vec3;
  isWrappedTransform: boolean;
  node: SDFNode;
}

function getOpDisplayName(op: string): string {
  switch (op) {
    case "sphere": return "Sphere";
    case "box": return "Box";
    case "cylinder": return "Cylinder";
    case "torus": return "Torus Ring";
    case "capsule": return "Capsule";
    case "cone": return "Cone";
    case "hexPrism": return "Hex Prism";
    case "ellipsoid": return "Ellipsoid";
    case "pyramid": return "Pyramid";
    case "twist": return "Twisted Mesh";
    case "bend": return "Bent Mesh";
    case "onion": return "Hollow Shell";
    case "hexShellCells": return "Hex Lattice Shell";
    case "smoothUnion": return "Smooth Group";
    case "union": return "Union Group";
    case "subtraction": return "Carved Mesh";
    case "smoothSubtraction": return "Smooth Carved Mesh";
    case "transform": return "Transformed Part";
    default: return op.charAt(0).toUpperCase() + op.slice(1);
  }
}

function getNodeColor(node: any): string | undefined {
  if (node?.material?.color) {
    if (typeof node.material.color === "string") return node.material.color;
    if (Array.isArray(node.material.color)) {
      const [r, g, b] = node.material.color;
      const to255 = (v: number) => Math.round(v <= 1.0 ? v * 255 : v);
      return `rgb(${to255(r)}, ${to255(g)}, ${to255(b)})`;
    }
  }
  if (node?.child) return getNodeColor(node.child);
  if (node?.children?.[0]) return getNodeColor(node.children[0]);
  if (node?.a) return getNodeColor(node.a);
  return undefined;
}

/**
 * Extracts all top-level editable objects/parts from an SDF Document.
 */
export function extractSceneObjects(doc: SDFDocument): SceneObject[] {
  const root = doc.root;
  if (!root) return [];

  const blueprintParts: any[] = (doc as any)._blueprint?.parts || [];
  const objects: SceneObject[] = [];

  // Helper to extract transform info from a node
  function extractTransform(node: SDFNode, path: string, blueprintIndex?: number): SceneObject {
    let translate: Vec3 = [0, 0, 0];
    let rotate: Vec3 = [0, 0, 0];
    let scale: Vec3 = [1, 1, 1];
    let isWrappedTransform = false;
    let effectiveNode = node;

    if (node.op === "transform") {
      isWrappedTransform = true;
      if (node.translate) translate = [...node.translate];
      if (node.rotate) rotate = [...node.rotate];
      if (node.scale) {
        if (typeof node.scale === "number") {
          scale = [node.scale, node.scale, node.scale];
        } else {
          scale = [...node.scale];
        }
      }
      effectiveNode = node.child;
    } else if ("center" in node && Array.isArray((node as any).center)) {
      const c = (node as any).center;
      translate = [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0];
    }

    const bpPart = blueprintIndex !== undefined ? blueprintParts[blueprintIndex] : undefined;
    const color = bpPart?.color || getNodeColor(node) || "#818cf8";
    
    let name = bpPart?.name;
    if (!name) {
      const colorPrefix = color.startsWith("#") ? "" : `${color} `;
      name = `${colorPrefix}${getOpDisplayName(effectiveNode.op)}`;
    }

    return {
      id: path,
      name,
      op: effectiveNode.op,
      color,
      translate,
      rotate,
      scale,
      isWrappedTransform,
      node,
    };
  }

  // If root is a combiner (smoothUnion / union), each child is a distinct scene object
  if ((root.op === "smoothUnion" || root.op === "union") && Array.isArray(root.children)) {
    root.children.forEach((child, index) => {
      objects.push(extractTransform(child, `root.children[${index}]`, index));
    });
  } else {
    // Single root object
    objects.push(extractTransform(root, "root", 0));
  }

  return objects;
}

/**
 * Deep clones an SDFNode.
 */
function cloneNode(node: SDFNode): SDFNode {
  return JSON.parse(JSON.stringify(node));
}

/**
 * Updates the Translate, Rotate, and Scale of a specific object in the SDF Document.
 */
export function updateObjectTransform(
  doc: SDFDocument,
  objectId: string,
  newTransform: {
    translate?: Vec3;
    rotate?: Vec3;
    scale?: Vec3 | number;
  }
): SDFDocument {
  const newDoc: SDFDocument = JSON.parse(JSON.stringify(doc));

  function applyTransformToNode(targetNode: SDFNode): SDFNode {
    let t: Vec3 = [0, 0, 0];
    let r: Vec3 = [0, 0, 0];
    let s: Vec3 = [1, 1, 1];
    let innerChild: SDFNode = targetNode;

    if (targetNode.op === "transform") {
      t = targetNode.translate ? [...targetNode.translate] : [0, 0, 0];
      r = targetNode.rotate ? [...targetNode.rotate] : [0, 0, 0];
      if (targetNode.scale !== undefined) {
        s = typeof targetNode.scale === "number"
          ? [targetNode.scale, targetNode.scale, targetNode.scale]
          : [...targetNode.scale];
      }
      innerChild = targetNode.child;
    } else if ("center" in targetNode && Array.isArray((targetNode as any).center)) {
      const c = (targetNode as any).center;
      t = [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0];
    }

    if (newTransform.translate !== undefined) t = [...newTransform.translate];
    if (newTransform.rotate !== undefined) r = [...newTransform.rotate];
    if (newTransform.scale !== undefined) {
      s = typeof newTransform.scale === "number"
        ? [newTransform.scale, newTransform.scale, newTransform.scale]
        : [...newTransform.scale];
    }

    // Return clean transform node
    return {
      op: "transform",
      translate: t,
      rotate: r,
      scale: s[0] === s[1] && s[1] === s[2] ? s[0] : s,
      child: innerChild,
      material: targetNode.material,
    };
  }

  if (objectId === "root") {
    newDoc.root = applyTransformToNode(newDoc.root);
  } else {
    // Parse path e.g. "root.children[2]"
    const match = objectId.match(/root\.children\[(\d+)\]/);
    if (match && newDoc.root && "children" in newDoc.root && Array.isArray(newDoc.root.children)) {
      const idx = parseInt(match[1], 10);
      if (newDoc.root.children[idx]) {
        newDoc.root.children[idx] = applyTransformToNode(newDoc.root.children[idx]);
      }
    }
  }

  return newDoc;
}

/**
 * Updates the color of a specific object in the SDF Document.
 */
export function updateObjectColor(
  doc: SDFDocument,
  objectId: string,
  newColor: string
): SDFDocument {
  const newDoc: SDFDocument = JSON.parse(JSON.stringify(doc));

  function applyColor(node: any) {
    if (!node.material) node.material = {};
    node.material.color = newColor;
    if (node.child) applyColor(node.child);
  }

  if (objectId === "root") {
    applyColor(newDoc.root);
  } else {
    const match = objectId.match(/root\.children\[(\d+)\]/);
    if (match && newDoc.root && "children" in newDoc.root && Array.isArray(newDoc.root.children)) {
      const idx = parseInt(match[1], 10);
      if (newDoc.root.children[idx]) {
        applyColor(newDoc.root.children[idx]);
      }
    }
  }

  return newDoc;
}
