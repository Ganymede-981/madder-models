import { SDFDocumentSchema, SDFNodeSchema } from "./schema.js";
import type { SDFDocument, SDFNode } from "./types.js";

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  details?: Array<{ path: string; message: string }>;
}

export function validateSDFDocument(input: unknown): ValidationResult<SDFDocument> {
  const result = SDFDocumentSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data as SDFDocument };
  }
  const details = result.error.errors.map((e) => ({
    path: e.path.join("."),
    message: e.message,
  }));
  return {
    success: false,
    error: details.map((d) => `${d.path || "root"}: ${d.message}`).join("; "),
    details,
  };
}

export function validateSDFNode(input: unknown): ValidationResult<SDFNode> {
  const result = SDFNodeSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data as SDFNode };
  }
  const details = result.error.errors.map((e) => ({
    path: e.path.join("."),
    message: e.message,
  }));
  return {
    success: false,
    error: details.map((d) => `${d.path || "root"}: ${d.message}`).join("; "),
    details,
  };
}
