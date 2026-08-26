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

app = FastAPI(title="Madder Models AI 3D Studio", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "qwen/qwen3.6-27b")

print("=== Madder Models Pure LLM 3D Studio ===")
print(f"[*] Env loaded from: {ENV_FILE}")
print(f"[*] Groq Key configured: {'YES (' + GROQ_API_KEY[:8] + '...)' if GROQ_API_KEY else 'NO (Missing in .env)'}")
print(f"[*] Groq Model: {GROQ_MODEL}")
print(f"[*] Server listening on http://localhost:{os.getenv('PORT', '8000')}")
print("========================================")
sys.stdout.flush()

SYSTEM_PROMPT = """You are the AI 3D Geometry & Material Engine for Madder Models, an organic AI-native 3D modeling tool.
You generate and refine vivid, fluid 3D shapes using Signed Distance Functions (SDF) Domain-Specific Language (SDF-DSL).

CRITICAL DESIGN PRINCIPLES:
1. ORGANIC & FLUID: Avoid rigid boxes where possible. Use 'smoothUnion' (blend radius k=0.2 to 0.7) to melt shapes seamlessly like clay.
2. VIVID PER-NODE MATERIALS: Assign a 'material' object with 'color' to primitive nodes (or group nodes).
   - 'color' can be ANY hex code (e.g. '#2d6a4f', '#f97316', '#dc2626', '#3b82f6', '#fbbf24') OR any color name ('green', 'orange', 'crimson', 'cyan', 'gold', 'emerald', 'lavender', 'dark blue', 'neon pink', 'brown', 'sandstone', 'slate', 'ivory', etc.).
   - Colors automatically interpolate and blend smoothly across 'smoothUnion' seams!
3. SUBTRACTION & CARVING: Use 'smoothSubtraction' to carve hollow living spaces, honeycombs, window ports, or pores.
4. REPETITION & PATTERNS: Use 'repeatLimited' or 'radialRepeat' (for flowers, domes, gears, starships) and 'symmetry' (for creatures, vehicles, faces).
5. DEFORMATIONS: Use 'twist', 'bend', 'displace' (ripples/bumps), or 'onion' (hollow shell walls).

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
- transform: { "op": "transform", "translate"?: [x,y,z], "rotate"?: [degX,degY,degZ], "scale"?: [sx,sy,sz]|number, "child": SDFNode, "material"?: { ... } }
- onion: { "op": "onion", "thickness": number, "child": SDFNode, "material"?: { ... } }

REQUIRED ROOT DOCUMENT STRUCTURE:
{
  "version": "sdf-dsl-1",
  "name": "Model Title",
  "description": "Short description",
  "bounds": { "min": [-3.5, -3.5, -3.5], "max": [3.5, 3.5, 3.5] },
  "resolution": 64,
  "root": {
    "op": "smoothUnion",
    "k": 0.5,
    "children": [ ... ]
  }
}

OUTPUT RULES:
- Emit ONLY the valid JSON document. No conversation, no explanations, no thinking text outside the JSON."""

def extract_json_from_llm_response(text: str) -> Any:
    """Robustly extracts and repairs JSON from LLM output."""
    if not text:
        raise ValueError("Empty response from LLM")
        
    # Strip <think>...</think> blocks
    cleaned = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
    
    # 1. Try markdown code block extraction
    code_block = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned)
    if code_block:
        candidate = code_block.group(1).strip()
        try:
            res = json_repair.loads(candidate)
            if res:
                return res
        except Exception:
            pass

    # 2. Try native json_repair on cleaned text (it scans and extracts JSON structures automatically)
    try:
        res = json_repair.loads(cleaned)
        if res:
            return res
    except Exception:
        pass

    # 3. Find outermost { ... }
    first_brace = cleaned.find("{")
    last_brace = cleaned.rfind("}")
    if first_brace != -1 and last_brace > first_brace:
        candidate = cleaned[first_brace : last_brace + 1]
        return json_repair.loads(candidate)

    # 4. Find outermost [ ... ]
    first_bracket = cleaned.find("[")
    last_bracket = cleaned.rfind("]")
    if first_bracket != -1 and last_bracket > first_bracket:
        candidate = cleaned[first_bracket : last_bracket + 1]
        return json_repair.loads(candidate)

    return json_repair.loads(cleaned)

def normalize_sdf_document(parsed: Any, fallback_name: str = "AI Model") -> dict:
    """
    Normalizes any JSON structure returned by the LLM into a fully compliant SDFDocument.
    Handles arrays, top-level root nodes, wrapped document objects, and missing fields automatically.
    """
    if isinstance(parsed, list):
        valid_children = [item for item in parsed if isinstance(item, dict)]
        if not valid_children:
            raise ValueError("LLM returned an empty list without valid SDF nodes")
        if len(valid_children) == 1 and "op" in valid_children[0]:
            parsed = valid_children[0]
        else:
            parsed = {
                "op": "smoothUnion",
                "k": 0.45,
                "children": valid_children,
            }

    if not isinstance(parsed, dict):
        raise ValueError(f"Expected dict or list from LLM, got {type(parsed)}")

    for key in ["document", "model", "sdf", "data", "sdfDocument"]:
        if key in parsed and isinstance(parsed[key], (dict, list)):
            return normalize_sdf_document(parsed[key], fallback_name)

    if "root" in parsed and isinstance(parsed["root"], (dict, list)):
        root_node = parsed["root"]
        if isinstance(root_node, list):
            root_node = {
                "op": "smoothUnion",
                "k": 0.45,
                "children": [c for c in root_node if isinstance(c, dict)],
            }
        return {
            "version": "sdf-dsl-1",
            "name": str(parsed.get("name", fallback_name)),
            "description": str(parsed.get("description", "AI synthesized SDF model")),
            "bounds": parsed.get("bounds", {"min": [-3.5, -3.5, -3.5], "max": [3.5, 3.5, 3.5]}),
            "resolution": int(parsed.get("resolution", 64)),
            "root": root_node,
        }

    if "op" in parsed:
        return {
            "version": "sdf-dsl-1",
            "name": fallback_name,
            "description": "AI synthesized SDF model",
            "bounds": {"min": [-3.5, -3.5, -3.5], "max": [3.5, 3.5, 3.5]},
            "resolution": 64,
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
            "resolution": 64,
            "root": found_node,
        }

    raise ValueError(f"Could not find a valid SDF node with 'op' in LLM output: {list(parsed.keys())}")

class CreateRequest(BaseModel):
    prompt: str
    groqApiKey: Optional[str] = None

class RefineRequest(BaseModel):
    prompt: str
    currentDocument: Dict[str, Any]
    groqApiKey: Optional[str] = None

@app.get("/api/health")
def health_check():
    load_dotenv(dotenv_path=ENV_FILE, override=True)
    key = os.getenv("GROQ_API_KEY", "")
    return {
        "status": "healthy",
        "groq_configured": bool(key),
        "groq_model": os.getenv("GROQ_MODEL", "qwen/qwen3.6-27b"),
    }

@app.post("/api/create")
async def create_model(req: CreateRequest):
    load_dotenv(dotenv_path=ENV_FILE, override=True)
    api_key = req.groqApiKey or os.getenv("GROQ_API_KEY", "")
    model = os.getenv("GROQ_MODEL", "qwen/qwen3.6-27b")

    print(f"\n[POST /api/create] Prompt: '{req.prompt}'")
    sys.stdout.flush()

    if not api_key:
        print("[ERROR] GROQ_API_KEY is missing in apps/api/.env")
        sys.stdout.flush()
        raise HTTPException(
            status_code=400,
            detail="GROQ_API_KEY is missing in apps/api/.env. Please paste your key in apps/api/.env.",
        )

    try:
        from groq import Groq
        client = Groq(api_key=api_key)

        print(f"[*] Sending request to Groq (Model: {model})...")
        sys.stdout.flush()
        
        completion = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": f"USER REQUEST: Create a vivid, organic 3D model matching this concept: '{req.prompt}'.\nAssign vibrant semantic colors ('#hex' or color names like 'green', 'orange', 'crimson', etc.) to each primitive node.\nOutput pure SDF Document JSON starting with {{\n  \"version\": \"sdf-dsl-1\",\n  \"name\": \"...\",\n  \"root\": {{ ... }}\n}}:",
                },
            ],
            max_tokens=4096,
            temperature=0.3,
        )

        raw_content = completion.choices[0].message.content
        if not raw_content:
            print("[ERROR] Empty response received from Groq")
            sys.stdout.flush()
            raise HTTPException(status_code=500, detail="Empty response received from Groq")

        print(f"[*] Received response from Groq ({len(raw_content)} chars). Extracting JSON...")
        sys.stdout.flush()

        parsed_raw = extract_json_from_llm_response(raw_content)
        normalized = normalize_sdf_document(parsed_raw, fallback_name=req.prompt[:30].strip())

        print(f"[OK] Successfully created 3D Model: '{normalized.get('name', 'New Model')}'")
        sys.stdout.flush()
        return {"success": True, "document": normalized}

    except Exception as e:
        print(f"\n[ERROR] Exception during /api/create:")
        print(f"Error Type: {type(e).__name__}")
        print(f"Error Message: {e}")
        traceback.print_exc()
        if 'raw_content' in locals() and raw_content:
            print(f"[DEBUG Raw LLM Output (first 1000 chars)]:\n{raw_content[:1000]}")
        sys.stdout.flush()
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)}")

@app.post("/api/refine")
async def refine_model(req: RefineRequest):
    load_dotenv(dotenv_path=ENV_FILE, override=True)
    api_key = req.groqApiKey or os.getenv("GROQ_API_KEY", "")
    model = os.getenv("GROQ_MODEL", "qwen/qwen3.6-27b")

    print(f"\n[POST /api/refine] Prompt: '{req.prompt}'")
    sys.stdout.flush()

    if not api_key:
        print("[ERROR] GROQ_API_KEY is missing in apps/api/.env")
        sys.stdout.flush()
        raise HTTPException(
            status_code=400,
            detail="GROQ_API_KEY is missing in apps/api/.env. Please paste your key in apps/api/.env.",
        )

    try:
        from groq import Groq
        client = Groq(api_key=api_key)

        print(f"[*] Sending refinement request to Groq (Model: {model})...")
        sys.stdout.flush()

        completion = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": f"CURRENT SDF DOCUMENT:\n{json.dumps(req.currentDocument, indent=2)}\n\nUSER REFINEMENT INSTRUCTION:\n{req.prompt}\n\nEmit the modified SDF Document in JSON starting with {{\n  \"version\": \"sdf-dsl-1\",\n  \"name\": \"...\",\n  \"root\": {{ ... }}\n}}:",
                },
            ],
            max_tokens=4096,
            temperature=0.2,
        )

        raw_content = completion.choices[0].message.content
        if not raw_content:
            print("[ERROR] Empty response received from Groq")
            sys.stdout.flush()
            raise HTTPException(status_code=500, detail="Empty response received from Groq")

        print(f"[*] Received refinement response from Groq ({len(raw_content)} chars). Extracting JSON...")
        sys.stdout.flush()

        parsed_raw = extract_json_from_llm_response(raw_content)
        normalized = normalize_sdf_document(parsed_raw, fallback_name=req.currentDocument.get("name", "Refined Model"))

        print(f"[OK] Successfully refined 3D Model: '{normalized.get('name', 'Refined Model')}'")
        sys.stdout.flush()
        return {"success": True, "document": normalized}

    except Exception as e:
        print(f"\n[ERROR] Exception during /api/refine:")
        print(f"Error Type: {type(e).__name__}")
        print(f"Error Message: {e}")
        traceback.print_exc()
        if 'raw_content' in locals() and raw_content:
            print(f"[DEBUG Raw LLM Output (first 1000 chars)]:\n{raw_content[:1000]}")
        sys.stdout.flush()
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
