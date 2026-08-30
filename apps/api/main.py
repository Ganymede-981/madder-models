import os
import sys
import json
import re
import traceback
from typing import Optional, Dict, Any, List
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import json_repair

# Ensure unbuffered utf-8 output on Windows console
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

# Always resolve .env relative to this file's location
ENV_FILE = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(dotenv_path=ENV_FILE, override=True)

app = FastAPI(title="Madder Models AI 3D Studio", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "qwen/qwen3.6-27b")

print("=== Madder Models Architect & Sculptor Studio ===")
print(f"[*] Env loaded from: {ENV_FILE}")
print(f"[*] Groq Key: {'YES (' + GROQ_API_KEY[:8] + '...)' if GROQ_API_KEY else 'NO (Missing in .env)'}")
print(f"[*] Active Model: {GROQ_MODEL}")
print(f"[*] Server listening on http://localhost:{os.getenv('PORT', '8000')}")
print("=================================================")
sys.stdout.flush()

# ─────────────────────────────────────────────────────────────────────────────
# System Prompts
# ─────────────────────────────────────────────────────────────────────────────

SCULPTOR_SYSTEM_PROMPT = """You are the AI 3D Geometry & Material Engine for Madder Models, an organic AI-native 3D modeling tool.
You generate and refine vivid, fluid 3D shapes using Signed Distance Functions (SDF) Domain-Specific Language (SDF-DSL).

CRITICAL DESIGN PRINCIPLES:
1. ORGANIC & FLUID: Avoid rigid boxes where possible. Use 'smoothUnion' (blend radius k=0.2 to 0.7) to melt shapes seamlessly like clay.
2. VIVID PER-NODE MATERIALS: Assign a 'material' object with 'color' to primitive nodes (or group nodes).
   - 'color' can be ANY hex code (e.g. '#2d6a4f', '#f97316', '#dc2626', '#3b82f6', '#fbbf24') OR any color name ('green', 'orange', 'crimson', 'cyan', 'gold', 'emerald', 'lavender', 'dark blue', 'neon pink', 'brown', 'sandstone', 'slate', 'ivory', etc.).
3. SUBTRACTION & CARVING: Use 'smoothSubtraction' to carve hollow living spaces, honeycombs, window ports, or pores.
   CRITICAL NESTING RULE: Features that are conceptually attached to a deformed parent (e.g. windows on a twisted spire,
   portholes on a bent tube) MUST be nested inside that parent's twist/bend node — never placed as siblings in the outer smoothUnion.
   Correct pattern:
     { "op": "smoothUnion", "children": [
       { "op": "twist", "strength": 0.5, "child":
         { "op": "smoothSubtraction", "a": <spire>, "b": <windows> }
       },
       <other parts>
     ]}
   Wrong pattern (sibling):
     { "op": "smoothUnion", "children": [
       { "op": "twist", "strength": 0.5, "child": <spire> },
       <windows>     ← WRONG: windows not following the twist
     ]}
4. REPETITION & PATTERNS: Use 'repeatLimited' or 'radialRepeat' (for flowers, domes, gears, starships) and 'symmetry' (for creatures, vehicles, faces).
5. DEFORMATIONS: Use 'twist', 'bend', 'displace' (ripples/bumps), or 'onion' (hollow shell walls).
6. HOLLOW BEFORE CARVING: If a part has cavities (cells, windows, pores), ALWAYS wrap the hull in 'onion' first to create
   a shell, then carve into the shell — never cut cells into a solid mass.
   For hex-cell biomimetic surfaces, use:
     { "op": "hexShellCells", "shellThickness": 0.1, "cellSize": 0.3, "cellDepth": 0.15, "child": <hull> }
7. RESOLUTION: Use resolution 96 for typical models, up to 128 for high-detail requests. The compiler auto-raises
   resolution if features are thinner than 3 voxels, so do NOT inflate resolution to work around thin features.

SUPPORTED PRIMITIVES & OPERATORS:
- sphere: { "op": "sphere", "radius": number, "center"?: [x,y,z], "material"?: { "color": string, "roughness"?: number, "metalness"?: number } }
- box: { "op": "box", "size": [w,h,d], "center"?: [x,y,z], "rounding"?: number, "material"?: { ... } }
- cylinder: { "op": "cylinder", "radius": number, "height": number, "center"?: [x,y,z], "rounding"?: number, "material"?: { ... } }
- torus: { "op": "torus", "majorRadius": number, "minorRadius": number, "center"?: [x,y,z], "material"?: { ... } }
- capsule: { "op": "capsule", "a": [x,y,z], "b": [x,y,z], "radius": number, "material"?: { ... } }
- cone: { "op": "cone", "radius": number, "height": number, "center"?: [x,y,z], "material"?: { ... } }
- hexPrism: { "op": "hexPrism", "radius": number, "height": number, "center"?: [x,y,z], "rounding"?: number, "material"?: { ... } }
- ellipsoid: { "op": "ellipsoid", "radii": [rx,ry,rz], "center"?: [x,y,z], "material"?: { ... } }
- pyramid: { "op": "pyramid", "height": number, "baseSize": [w,d], "center"?: [x,y,z], "material"?: { ... } }
- union: { "op": "union", "children": SDFNode[], "material"?: { ... } }
- intersection: { "op": "intersection", "children": SDFNode[], "material"?: { ... } }
- subtraction: { "op": "subtraction", "a": SDFNode, "b": SDFNode, "material"?: { ... } }
- smoothUnion: { "op": "smoothUnion", "k": number, "children": SDFNode[], "material"?: { ... } }
- smoothSubtraction: { "op": "smoothSubtraction", "k": number, "a": SDFNode, "b": SDFNode, "material"?: { ... } }
- repeatLimited: { "op": "repeatLimited", "period": [x,y,z], "limit": [x,y,z], "child": SDFNode, "material"?: { ... } }
- radialRepeat: { "op": "radialRepeat", "count": number, "axis"?: "x"|"y"|"z", "child": SDFNode, "material"?: { ... } }
- symmetry: { "op": "symmetry", "axes": ["x"|"y"|"z"], "child": SDFNode, "material"?: { ... } }
- twist: { "op": "twist", "strength": number, "child": SDFNode, "material"?: { ... } }
- bend: { "op": "bend", "strength": number, "child": SDFNode, "material"?: { ... } }
- displace: { "op": "displace", "amplitude": number, "frequency"?: number, "child": SDFNode, "material"?: { ... } }
- elongate: { "op": "elongate", "size": [x,y,z], "child": SDFNode, "material"?: { ... } }
- transform: { "op": "transform", "translate"?: [x,y,z], "rotate"?: [degX,degY,degZ], "scale"?: [sx,sy,sz]|number, "child": SDFNode, "material"?: { ... } }
- onion: { "op": "onion", "thickness": number, "child": SDFNode, "material"?: { ... } }
- hexShellCells: { "op": "hexShellCells", "shellThickness": number, "cellSize": number, "cellDepth": number, "child": SDFNode, "material"?: { ... } }

REQUIRED ROOT DOCUMENT STRUCTURE:
{
  "version": "sdf-dsl-1",
  "name": "Model Title",
  "description": "Short description",
  "bounds": { "min": [-3.5, -3.5, -3.5], "max": [3.5, 3.5, 3.5] },
  "resolution": 96,
  "root": {
    "op": "smoothUnion",
    "k": 0.5,
    "children": [ ... ]
  }
}

REASONING INSTRUCTIONS:
Briefly plan the 3D geometry coordinates in <think> in under 60 words, then immediately output the pure SDF Document JSON. Do not write lengthy explanations."""

ARCHITECT_SYSTEM_PROMPT = """You are the Scene Architect for Madder Models, an AI 3D modeling tool.
Your job is to decompose a user's concept into 3–6 named semantic parts that a separate SDF math engine will build.

For each part describe:
- What shape/silhouette it needs (hull)
- Whether domain warps apply (bend, twist, taper, ripple)
- Whether it needs carved negative space (windows, cells, pores) — flag requiresShell: true for lattice/biomimetic cavities
- Whether it has attached smaller features (fins, handles, legs, chimneys)

Output ONLY a valid JSON object in this exact schema (no prose, no markdown):
{
  "sceneName": "...",
  "description": "...",
  "parts": [
    {
      "id": "part_0",
      "name": "HumanReadableName",
      "description": "What this part represents",
      "anchor": [x, y, z],
      "scale": 1.0,
      "color": "#hexcode or color name",
      "geometryPlan": {
        "hull": { "type": "sphere|box|cylinder|cone|ellipsoid|pyramid|hexPrism", "params": { "radius": 1.5 } },
        "deformations": [{ "type": "twist", "params": { "strength": 0.4 } }],
        "cavities": [{ "type": "hexCell", "anchor": [0,0,0], "params": { "cellSize": 0.3 }, "requiresShell": true }],
        "appendages": [{ "type": "capsule", "anchor": [0.5, 0, 0], "count": 4, "params": { "radius": 0.1, "length": 0.4 } }]
      }
    }
  ]
}

Rules:
- 3 to 6 parts maximum — decompose into the minimum meaningful semantic units.
- Keep reasoning inside <think> to under 40 words, then output ONLY the JSON object immediately.
- Output ONLY the JSON object, no other text."""

# ─────────────────────────────────────────────────────────────────────────────
# Utility: JSON extraction and normalization
# ─────────────────────────────────────────────────────────────────────────────

def extract_json_from_llm_response(text: str) -> Any:
    """Robustly extracts and repairs JSON from LLM output, cleanly stripping reasoning tags and prioritizing final code blocks."""
    if not text:
        raise ValueError("Empty response from LLM")
        
    # 1. Cleanly strip all reasoning (<think>...</think>) including unclosed think blocks
    cleaned = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
    if "<think>" in cleaned:
        # Unclosed think block: strip everything from <think> to the first markdown code block or JSON object
        last_think_end = cleaned.rfind("</think>")
        if last_think_end != -1:
            cleaned = cleaned[last_think_end + 8:].strip()
        else:
            first_code_or_brace = min(
                [pos for pos in [cleaned.find("```"), cleaned.find("{")] if pos != -1] or [0]
            )
            cleaned = cleaned[first_code_or_brace:].strip()

    # 2. Find all markdown code blocks and inspect from LAST to FIRST (the final output is at the end)
    code_blocks = re.findall(r"```(?:json)?\s*([\s\S]*?)```", cleaned)
    for candidate in reversed(code_blocks):
        cand_str = candidate.strip()
        if not cand_str:
            continue
        try:
            res = json_repair.loads(cand_str)
            if isinstance(res, dict) and ("root" in res or "op" in res or "parts" in res or "version" in res):
                return res
            if isinstance(res, (dict, list)) and res:
                return res
        except Exception:
            pass

    # 3. Direct parse on full cleaned string
    try:
        res = json_repair.loads(cleaned)
        if res:
            return res
    except Exception:
        pass

    # 4. Search backwards for balanced JSON object { ... }
    last_brace = cleaned.rfind("}")
    if last_brace != -1:
        for first_brace in [m.start() for m in re.finditer(r"\{", cleaned)]:
            if first_brace < last_brace:
                cand_str = cleaned[first_brace : last_brace + 1]
                try:
                    res = json_repair.loads(cand_str)
                    if isinstance(res, dict) and ("root" in res or "op" in res or "parts" in res or "version" in res):
                        return res
                    if isinstance(res, dict) and res:
                        return res
                except Exception:
                    pass

    # 5. Last-ditch json_repair
    return json_repair.loads(cleaned)

def normalize_sdf_document(parsed: Any, fallback_name: str = "AI Model") -> dict:
    """Normalizes any JSON structure returned by the LLM into a compliant SDFDocument with graceful fallbacks."""
    if not parsed:
        return {
            "version": "sdf-dsl-1",
            "name": fallback_name,
            "description": "AI synthesized SDF model",
            "bounds": {"min": [-3.5, -3.5, -3.5], "max": [3.5, 3.5, 3.5]},
            "resolution": 72,
            "root": {"op": "sphere", "radius": 1.5, "material": {"color": "#6366f1"}},
        }

    if isinstance(parsed, list):
        valid_children = [item for item in parsed if isinstance(item, dict) and "op" in item]
        if valid_children:
            if len(valid_children) == 1:
                parsed = valid_children[0]
            else:
                parsed = {
                    "op": "smoothUnion",
                    "k": 0.45,
                    "children": valid_children,
                }
        else:
            # Maybe a list of dicts that need wrapping or conversion
            dict_children = [item for item in parsed if isinstance(item, dict)]
            if dict_children:
                parsed = {
                    "op": "smoothUnion",
                    "k": 0.45,
                    "children": [
                        {"op": "sphere", "radius": 1.0, "material": {"color": "#6366f1"}}
                    ],
                }
            else:
                parsed = {"op": "sphere", "radius": 1.5, "material": {"color": "#6366f1"}}

    if not isinstance(parsed, dict):
        return {
            "version": "sdf-dsl-1",
            "name": fallback_name,
            "description": "AI synthesized SDF model",
            "bounds": {"min": [-3.5, -3.5, -3.5], "max": [3.5, 3.5, 3.5]},
            "resolution": 72,
            "root": {"op": "sphere", "radius": 1.5, "material": {"color": "#6366f1"}},
        }

    for key in ["document", "model", "sdf", "data", "sdfDocument"]:
        if key in parsed and isinstance(parsed[key], (dict, list)):
            return normalize_sdf_document(parsed[key], fallback_name)

    if "root" in parsed and isinstance(parsed["root"], (dict, list)):
        root_node = parsed["root"]
        if isinstance(root_node, list):
            valid_c = [c for c in root_node if isinstance(c, dict) and "op" in c]
            root_node = {
                "op": "smoothUnion",
                "k": 0.45,
                "children": valid_c or [{"op": "sphere", "radius": 1.5, "material": {"color": "#6366f1"}}],
            }
        return {
            "version": "sdf-dsl-1",
            "name": str(parsed.get("name", fallback_name)),
            "description": str(parsed.get("description", "AI synthesized SDF model")),
            "bounds": parsed.get("bounds", {"min": [-3.5, -3.5, -3.5], "max": [3.5, 3.5, 3.5]}),
            "resolution": int(parsed.get("resolution", 72)),
            "root": root_node,
        }

    if "op" in parsed:
        return {
            "version": "sdf-dsl-1",
            "name": fallback_name,
            "description": "AI synthesized SDF model",
            "bounds": {"min": [-3.5, -3.5, -3.5], "max": [3.5, 3.5, 3.5]},
            "resolution": 72,
            "root": parsed,
        }

    def find_op(d: Any) -> Optional[dict]:
        if isinstance(d, dict):
            if "op" in d:
                return d
            for v in d.values():
                res = find_op(v)
                if res:
                    return res
        elif isinstance(d, list):
            for item in d:
                res = find_op(item)
                if res:
                    return res
        return None

    found_node = find_op(parsed)
    if found_node:
        return {
            "version": "sdf-dsl-1",
            "name": fallback_name,
            "description": "AI synthesized SDF model",
            "bounds": {"min": [-3.5, -3.5, -3.5], "max": [3.5, 3.5, 3.5]},
            "resolution": 72,
            "root": found_node,
        }

    # Safe fallback if only parts exist
    if "parts" in parsed and isinstance(parsed["parts"], list):
        part_nodes = []
        for i, part in enumerate(parsed["parts"]):
            if isinstance(part, dict):
                anchor = part.get("anchor", [0, 0, 0])
                color = part.get("color", "#6366f1")
                part_nodes.append({
                    "op": "sphere",
                    "radius": 0.8,
                    "center": anchor,
                    "material": {"color": color},
                })
        if part_nodes:
            return {
                "version": "sdf-dsl-1",
                "name": str(parsed.get("sceneName", fallback_name)),
                "description": str(parsed.get("description", "AI synthesized SDF model")),
                "bounds": {"min": [-3.5, -3.5, -3.5], "max": [3.5, 3.5, 3.5]},
                "resolution": 72,
                "root": {"op": "smoothUnion", "k": 0.45, "children": part_nodes},
            }

    return {
        "version": "sdf-dsl-1",
        "name": fallback_name,
        "description": "AI synthesized SDF model",
        "bounds": {"min": [-3.5, -3.5, -3.5], "max": [3.5, 3.5, 3.5]},
        "resolution": 72,
        "root": {"op": "sphere", "radius": 1.5, "material": {"color": "#6366f1"}},
    }

# ─────────────────────────────────────────────────────────────────────────────
# Groq Client: direct execution with reasoning
# ─────────────────────────────────────────────────────────────────────────────

def call_groq(client: Any, messages: List[Dict[str, str]], temperature: float = 0.3) -> str:
    """Calls Groq using the configured model."""
    load_dotenv(dotenv_path=ENV_FILE, override=True)
    model_name = os.getenv("GROQ_MODEL", "qwen/qwen3.6-27b")
    
    print(f"[*] Querying Groq model: {model_name}...")
    sys.stdout.flush()
    completion = client.chat.completions.create(
        model=model_name,
        messages=messages,
        max_tokens=2500,
        temperature=temperature,
    )
    content = completion.choices[0].message.content
    if not content or not content.strip():
        raise RuntimeError(f"Empty response from {model_name}")
        
    print(f"[OK] Response received ({len(content)} chars)")
    sys.stdout.flush()
    return content

# ─────────────────────────────────────────────────────────────────────────────
# WS2 — Architect & Sculptor Pipeline
# ─────────────────────────────────────────────────────────────────────────────

def plan_scene_blueprint(client: Any, prompt: str) -> dict:
    """Stage 1: Architect — decompose the concept into 3-6 semantic parts."""
    print(f"[Architect] Decomposing: '{prompt}'")
    sys.stdout.flush()
    
    user_content = (
        f"Decompose this 3D scene concept into 3–6 semantic parts:\n\n\"{prompt}\"\n\n"
        "Output ONLY the JSON blueprint object, no other text."
    )
    raw = call_groq(
        client=client,
        messages=[{"role": "system", "content": ARCHITECT_SYSTEM_PROMPT},
                  {"role": "user", "content": user_content}],
        temperature=0.4,
    )
    parsed = extract_json_from_llm_response(raw)
    if not isinstance(parsed, dict) or "parts" not in parsed:
        # Graceful fallback: construct basic blueprint if not in format
        return {
            "sceneName": prompt[:30].strip(),
            "description": prompt,
            "parts": [
                {
                    "id": "part_main",
                    "name": "MainStructure",
                    "description": prompt,
                    "anchor": [0, 0, 0],
                    "scale": 1.0,
                    "color": "#6366f1",
                    "geometryPlan": {"hull": {"type": "sphere", "params": {"radius": 1.5}}, "deformations": [], "cavities": [], "appendages": []}
                }
            ]
        }
    print(f"[Architect] Blueprint: {len(parsed['parts'])} parts")
    sys.stdout.flush()
    return parsed

def synthesize_scene_sdf(client: Any, blueprint: dict, original_prompt: str) -> dict:
    """Stage 2: Sculptor — convert the blueprint into an SDF document."""
    print(f"[Sculptor] Synthesizing SDF for blueprint '{blueprint.get('sceneName', '?')}'")
    sys.stdout.flush()
    
    user_content = (
        f"ORIGINAL REQUEST: \"{original_prompt}\"\n\n"
        f"SCENE BLUEPRINT (from Architect):\n{json.dumps(blueprint, indent=2)}\n\n"
        "Convert each part's geometryPlan into a tagged SDF sub-tree. "
        "Merge all part sub-trees into the root smoothUnion. "
        "Respect the anchor and scale of each part. "
        "When cavities[].requiresShell is true, wrap the hull in 'onion' or use 'hexShellCells' before carving. "
        "Output pure SDF Document JSON starting with {\n  \"version\": \"sdf-dsl-1\",\n  \"name\": \"...\",\n  \"root\": { ... }\n}:"
    )
    raw = call_groq(
        client=client,
        messages=[{"role": "system", "content": SCULPTOR_SYSTEM_PROMPT},
                  {"role": "user", "content": user_content}],
        temperature=0.25,
    )
    parsed_raw = extract_json_from_llm_response(raw)
    return normalize_sdf_document(parsed_raw, fallback_name=blueprint.get("sceneName", original_prompt[:30].strip()))

# ─────────────────────────────────────────────────────────────────────────────
# Request Models
# ─────────────────────────────────────────────────────────────────────────────

class CreateRequest(BaseModel):
    prompt: str
    groqApiKey: Optional[str] = None
    fast_mode: Optional[bool] = None  # None = auto-detect; True = force single-shot

class RefineRequest(BaseModel):
    prompt: str
    currentDocument: Dict[str, Any]
    groqApiKey: Optional[str] = None

class RefinePartRequest(BaseModel):
    partId: str
    instruction: str
    currentDocument: Dict[str, Any]

# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health_check():
    load_dotenv(dotenv_path=ENV_FILE, override=True)
    return {
        "status": "healthy",
        "provider": "groq",
        "groq_configured": bool(os.getenv("GROQ_API_KEY", "")),
        "active_model": os.getenv("GROQ_MODEL", "qwen/qwen3.6-27b"),
        "pipeline": "architect_sculptor_v2",
    }

@app.post("/api/create")
async def create_model(req: CreateRequest):
    load_dotenv(dotenv_path=ENV_FILE, override=True)
    groq_key = req.groqApiKey or os.getenv("GROQ_API_KEY", "")

    print(f"\n[POST /api/create] Prompt: '{req.prompt}'")
    sys.stdout.flush()

    if not groq_key:
        raise HTTPException(status_code=400, detail="GROQ_API_KEY is missing in apps/api/.env.")

    try:
        from groq import Groq
        client = Groq(api_key=groq_key)

        print(f"[*] Architect & Sculptor pipeline")
        blueprint = plan_scene_blueprint(client, req.prompt)
        normalized = synthesize_scene_sdf(client, blueprint, req.prompt)
        normalized["_blueprint"] = blueprint  # pass blueprint to frontend for outliner

        print(f"[OK] Model ready: '{normalized.get('name', 'New Model')}' via architect_sculptor")
        sys.stdout.flush()
        return {"success": True, "document": normalized, "pipeline": "architect_sculptor"}

    except Exception as e:
        print(f"\n[ERROR] Exception during /api/create: {e}")
        traceback.print_exc()
        sys.stdout.flush()
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)}")

@app.post("/api/refine")
async def refine_model(req: RefineRequest):
    load_dotenv(dotenv_path=ENV_FILE, override=True)
    groq_key = req.groqApiKey or os.getenv("GROQ_API_KEY", "")

    print(f"\n[POST /api/refine] Prompt: '{req.prompt}'")
    sys.stdout.flush()

    if not groq_key:
        raise HTTPException(status_code=400, detail="GROQ_API_KEY is missing in apps/api/.env.")

    try:
        from groq import Groq
        client = Groq(api_key=groq_key)

        user_content = (
            f"CURRENT SDF DOCUMENT:\n{json.dumps(req.currentDocument, indent=2)}\n\n"
            f"USER REFINEMENT INSTRUCTION:\n{req.prompt}\n\n"
            "Emit the modified SDF Document in JSON starting with {\n  \"version\": \"sdf-dsl-1\",\n  \"name\": \"...\",\n  \"root\": { ... }\n}:"
        )

        raw_content = call_groq(
            client=client,
            messages=[{"role": "system", "content": SCULPTOR_SYSTEM_PROMPT},
                      {"role": "user", "content": user_content}],
            temperature=0.2,
        )

        parsed_raw = extract_json_from_llm_response(raw_content)
        normalized = normalize_sdf_document(parsed_raw, fallback_name=req.currentDocument.get("name", "Refined Model"))

        print(f"[OK] Refined: '{normalized.get('name', 'Refined Model')}'")
        sys.stdout.flush()
        return {"success": True, "document": normalized}

    except Exception as e:
        print(f"\n[ERROR] Exception during /api/refine: {e}")
        traceback.print_exc()
        sys.stdout.flush()
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)}")

@app.post("/api/refine_part")
async def refine_part(req: RefinePartRequest):
    """WS2 — Refine a single named part without touching the rest of the scene."""
    load_dotenv(dotenv_path=ENV_FILE, override=True)
    groq_key = req.groqApiKey or os.getenv("GROQ_API_KEY", "")

    print(f"\n[POST /api/refine_part] partId='{req.partId}' instruction='{req.instruction}'")
    sys.stdout.flush()

    if not groq_key:
        raise HTTPException(status_code=400, detail="GROQ_API_KEY is missing in apps/api/.env.")

    try:
        from groq import Groq
        client = Groq(api_key=groq_key)

        user_content = (
            f"FULL SCENE SDF DOCUMENT:\n{json.dumps(req.currentDocument, indent=2)}\n\n"
            f"TARGET PART ID: '{req.partId}'\n"
            f"REFINEMENT INSTRUCTION: {req.instruction}\n\n"
            "Find the SDF sub-tree with partId matching the target (look for a node where partId or the parent transform's "
            "comment matches). Modify ONLY that sub-tree according to the instruction. "
            "Return the complete modified SDF Document in JSON. Do not change any other parts. "
            "Output pure SDF Document JSON starting with {\n  \"version\": \"sdf-dsl-1\",\n  \"name\": \"...\",\n  \"root\": { ... }\n}:"
        )

        raw_content = call_groq(
            client=client,
            messages=[{"role": "system", "content": SCULPTOR_SYSTEM_PROMPT},
                      {"role": "user", "content": user_content}],
            temperature=0.2,
        )

        parsed_raw = extract_json_from_llm_response(raw_content)
        normalized = normalize_sdf_document(
            parsed_raw, fallback_name=req.currentDocument.get("name", "Refined Scene")
        )

        print(f"[OK] Part '{req.partId}' refined successfully")
        sys.stdout.flush()
        return {"success": True, "document": normalized}

    except Exception as e:
        print(f"\n[ERROR] Exception during /api/refine_part: {e}")
        traceback.print_exc()
        sys.stdout.flush()
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
