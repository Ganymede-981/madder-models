import * as THREE from "three";
import { STLExporter } from "three-stdlib";
import { OBJExporter } from "three-stdlib";
import { GLTFExporter } from "three-stdlib";

export function exportToSTL(geometryOrMesh: THREE.BufferGeometry | THREE.Mesh, filename = "model.stl") {
  const exporter = new STLExporter();
  let mesh: THREE.Mesh;
  if (geometryOrMesh instanceof THREE.BufferGeometry) {
    mesh = new THREE.Mesh(geometryOrMesh, new THREE.MeshStandardMaterial());
  } else {
    mesh = geometryOrMesh;
  }

  const result = exporter.parse(mesh, { binary: true });
  const blobPart: any = (result as any).buffer || result;
  const blob = new Blob([blobPart], { type: "application/octet-stream" });
  downloadBlob(blob, filename);
}

export function exportToOBJ(geometryOrMesh: THREE.BufferGeometry | THREE.Mesh, filename = "model.obj") {
  const exporter = new OBJExporter();
  let mesh: THREE.Mesh;
  if (geometryOrMesh instanceof THREE.BufferGeometry) {
    mesh = new THREE.Mesh(geometryOrMesh, new THREE.MeshStandardMaterial());
  } else {
    mesh = geometryOrMesh;
  }

  const result = exporter.parse(mesh);
  const blob = new Blob([result as string], { type: "text/plain" });
  downloadBlob(blob, filename);
}

export function exportToGLB(geometryOrMesh: THREE.BufferGeometry | THREE.Mesh, filename = "model.glb") {
  const exporter = new GLTFExporter();
  let mesh: THREE.Mesh;
  if (geometryOrMesh instanceof THREE.BufferGeometry) {
    mesh = new THREE.Mesh(geometryOrMesh, new THREE.MeshStandardMaterial());
  } else {
    mesh = geometryOrMesh;
  }

  exporter.parse(
    mesh,
    (gltf) => {
      const blob = new Blob([gltf as ArrayBuffer], { type: "application/octet-stream" });
      downloadBlob(blob, filename);
    },
    (error) => {
      console.error("GLB export failed:", error);
    },
    { binary: true }
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}
