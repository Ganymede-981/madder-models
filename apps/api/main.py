import os
import sys
import json
import re
import time
import httpx
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

# ─────────────────────────────────────────────────────────────────────────────
# Groq Multi-Key Router (OTPM Rate Limit Mitigation)
# ─────────────────────────────────────────────────────────────────────────────

_groq_key_index = 0
_groq_clients_cache: Dict[str, Any] = {}

def get_all_groq_keys() -> List[str]:
    """Collects all configured Groq API keys from environment for multi-key routing."""
    keys: List[str] = []
    
    # 1. Comma / semicolon / space-separated list in GROQ_API_KEYS
    raw_keys = os.getenv("GROQ_API_KEYS", "")
    if raw_keys:
        for k in re.split(r"[,;\s]+", raw_keys.strip()):
            k_clean = k.strip()
            if k_clean and k_clean not in keys:
                keys.append(k_clean)
                
    # 2. Standard single GROQ_API_KEY
    primary = os.getenv("GROQ_API_KEY", "").strip()
    if primary and primary not in keys:
        keys.append(primary)
        
    # 3. Enumerated keys GROQ_API_KEY_1, GROQ_API_KEY_2, etc.
    for i in range(1, 20):
        enum_k = os.getenv(f"GROQ_API_KEY_{i}", "").strip()
        if enum_k and enum_k not in keys:
            keys.append(enum_k)
            
    return keys

def get_primary_groq_key() -> str:
    """Returns the first available Groq API key from the pool."""
    keys = get_all_groq_keys()
    return keys[0] if keys else ""

def get_groq_client_for_key(api_key: str) -> Any:
    """Returns a cached or new Groq client for the given key."""
    from groq import Groq
    if api_key not in _groq_clients_cache:
        _groq_clients_cache[api_key] = Groq(api_key=api_key)
    return _groq_clients_cache[api_key]

ALL_GROQ_KEYS = get_all_groq_keys()
GROQ_API_KEY = get_primary_groq_key()
GROQ_MODEL = os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b")

print("=== Madder Models Architect & Sculptor Studio ===")
print(f"[*] Env loaded from: {ENV_FILE}")
print(f"[*] Groq Keys Loaded: {len(ALL_GROQ_KEYS)} key(s) in rotation pool")
for i, k in enumerate(ALL_GROQ_KEYS):
    print(f"    ├─ Key #{i+1}: {k[:8]}...{k[-4:]}")
print(f"[*] Active Model: {GROQ_MODEL}")
print(f"[*] Server listening on http://localhost:{os.getenv('PORT', '8000')}")
print("=================================================")
sys.stdout.flush()

# ─────────────────────────────────────────────────────────────────────────────
# System Prompts
# ─────────────────────────────────────────────────────────────────────────────

SCULPTOR_SYSTEM_PROMPT = """You are the Lead 3D Sculptor for Madder Models, an AI-native 3D modeling studio.
You generate complete, highly detailed, beautifully proportioned 3D models using Signed Distance Functions (SDF) Domain-Specific Language (SDF-DSL).

CORE PRINCIPLES:
1. ORGANIC & SHARP BLENDING:
   - Use 'smoothUnion' (k=0.15 to 0.45) for organic connections (melting foliage clusters, branches into trunks, muscles, creature anatomy, spires).
   - Use standard 'union' for sharp mechanical assemblies, furniture, or distinct objects so sharp corners and edges don't melt into blobs.
2. DETAILED DECOMPOSITION & NATURAL PHYSICAL STRUCTURE:
   - Faithfully model all components from the blueprint. Build out complete, solid, physically believable structures:
     • For trees/nature: 
       - Trunk: Sturdy upright 'cylinder' or 'capsule' firmly grounded on the floor (base at y <= 0). NEVER use an inverted cone with the tip pointing down at the ground!
       - Canopy: Lush, voluminous organic green crown using 'displace' (amplitude 0.08 to 0.15) over a generous sphere, or a 'smoothUnion' (k=0.35 to 0.5) of 2–4 overlapping foliage spheres that melt into a full, cloud-like crown.
     • For furniture/benches:
       - Seat: Solid, substantial slab (rounded 'box' with thickness 0.14 to 0.22, width 1.3 to 1.8, depth 0.4 to 0.6). DO NOT create razor-thin floating individual slats!
       - Legs: Sturdy support legs ('cylinder' or 'box' with radius/width 0.08 to 0.12) resting firmly on the ground (bottom at y = 0).
       - Backrest/Arms: Solid, well-connected slabs or rails.
     • For vehicles/spaceships: Solid fuselage/body + aerodynamic canopy/cockpit + sturdy wings/thrusters.
     • For architecture: Solid foundation base + pillars/towers + decorative roofs and accents.
3. PHYSICAL GROUNDING & PROPORTIONS:
   - Ground level is at y = 0. Any object that rests on the ground (tree trunk base, bench legs, vehicle wheels, pedestals) MUST reach y ≈ 0 (or slightly below, e.g. y = -0.1 for tree roots). Nothing should hover unnaturally in midair!
   - MINIMUM THICKNESS (>= 0.12): Every physical feature must have tangible thickness. In SDF meshing, razor-thin geometry (< 0.08) fragments into floating particles or dissolves. Always give parts solid volume and substance!
4. VIVID MATERIALS & CONTRAST:
   - Assign rich materials with 'color', optional 'roughness' (0.0 to 1.0), and 'metalness' (0.0 to 1.0) to parts.
   - Use contrasting tones: rich wood/sandstone/emerald/cobalt/crimson primaries, metallic gold/silver trims, carbon/charcoal accents.
5. PROCEDURAL OPERATORS:
   - Use 'revolve' for organic curved axial silhouettes (vases, mushrooms, bottles, balloons, flared bells).
   - Use 'sweep' for smooth 3D curved tubes and paths (horns, pipes, curved railings, vines).
   - Use 'mirror' (axis: "x"|"y"|"z") for bilateral symmetry (limbs, wings, paired legs/wheels).
   - Use 'twist', 'bend', 'taper', 'displace', 'onion', 'radialRepeat' to add rich procedural shape.
6. NO UNREQUESTED GROUND SLABS:
   - Model the scene cleanly within bounds [-3.5, 3.5]. Do not add a flat ground slab unless explicitly requested.

COMPLETE OPERATOR & PRIMITIVE REFERENCE:
- sphere: { "op": "sphere", "radius": number, "center"?: [x,y,z], "material"?: { "color": string, "roughness"?: number, "metalness"?: number } }
- box: { "op": "box", "size": [w,h,d], "center"?: [x,y,z], "rounding"?: number, "material"?: { ... } }
- cylinder: { "op": "cylinder", "radius": number, "height": number, "center"?: [x,y,z], "rounding"?: number, "material"?: { ... } }
- torus: { "op": "torus", "majorRadius": number, "minorRadius": number, "center"?: [x,y,z], "material"?: { ... } }
- capsule: { "op": "capsule", "a": [x,y,z], "b": [x,y,z], "radius": number, "material"?: { ... } }
- cone: { "op": "cone", "radius": number, "height": number, "center"?: [x,y,z], "material"?: { ... } }
- hexPrism: { "op": "hexPrism", "radius": number, "height": number, "center"?: [x,y,z], "rounding"?: number, "material"?: { ... } }
- ellipsoid: { "op": "ellipsoid", "radii": [rx,ry,rz], "center"?: [x,y,z], "material"?: { ... } }
- pyramid: { "op": "pyramid", "height": number, "baseSize": [w,d], "center"?: [x,y,z], "material"?: { ... } }
- revolve: { "op": "revolve", "profile": [[y, r], ...min 2 pts], "center"?: [x,y,z], "material"?: { ... } }
- sweep: { "op": "sweep", "path": [[x,y,z], ...min 2 pts], "radius": number, "material"?: { ... } }
- mirror: { "op": "mirror", "axis": "x"|"y"|"z", "offset"?: number, "child": SDFNode, "material"?: { ... } }
- union: { "op": "union", "children": SDFNode[], "material"?: { ... } }
- smoothUnion: { "op": "smoothUnion", "k": number, "children": SDFNode[], "material"?: { ... } }
- subtraction: { "op": "subtraction", "a": SDFNode, "b": SDFNode, "material"?: { ... } }
- smoothSubtraction: { "op": "smoothSubtraction", "k": number, "a": SDFNode, "b": SDFNode, "material"?: { ... } }
- intersection: { "op": "intersection", "children": SDFNode[], "material"?: { ... } }
- smoothIntersection: { "op": "smoothIntersection", "k": number, "children": SDFNode[], "material"?: { ... } }
- repeatLimited: { "op": "repeatLimited", "period": [x,y,z], "limit": [x,y,z], "child": SDFNode, "material"?: { ... } }
- radialRepeat: { "op": "radialRepeat", "count": number, "axis"?: "x"|"y"|"z", "child": SDFNode, "material"?: { ... } }
- symmetry: { "op": "symmetry", "axes": ["x"|"y"|"z"], "child": SDFNode, "material"?: { ... } }
- twist: { "op": "twist", "strength": number, "child": SDFNode, "material"?: { ... } }
- bend: { "op": "bend", "strength": number, "child": SDFNode, "material"?: { ... } }
- taper: { "op": "taper", "factor": number, "axis"?: "x"|"y"|"z", "child": SDFNode, "material"?: { ... } }
- displace: { "op": "displace", "amplitude": number, "frequency"?: number, "child": SDFNode, "material"?: { ... } }
- elongate: { "op": "elongate", "size": [x,y,z], "child": SDFNode, "material"?: { ... } }
- transform: { "op": "transform", "translate"?: [x,y,z], "rotate"?: [degX,degY,degZ], "scale"?: [sx,sy,sz]|number, "child": SDFNode, "material"?: { ... } }
- onion: { "op": "onion", "thickness": number, "child": SDFNode, "material"?: { ... } }
- hexShellCells: { "op": "hexShellCells", "shellThickness": number, "cellSize": number, "cellDepth": number, "child": SDFNode, "material"?: { ... } }

DOCUMENT JSON FORMAT:
Output pure SDF Document JSON starting with:
{
  "version": "sdf-dsl-1",
  "name": "Model Title",
  "description": "Short description",
  "bounds": { "min": [-3.5, -3.5, -3.5], "max": [3.5, 3.5, 3.5] },
  "resolution": 96,
  "root": { ... }
}"""

ARCHITECT_SYSTEM_PROMPT = """You are the Senior 3D Scene Architect for Madder Models.
Your job is to decompose the user's prompt into clear, coherent physical semantic parts that form a complete, well-composed, stylistically solid 3D scene.

GUIDELINES:
- Identify all major components, secondary features, accessories, and distinct objects requested in the prompt.
- For each part, provide a descriptive name, its relative 3D placement [x, y, z], scale, vibrant material color/finish, and recommended geometry type.
- SPATIAL & PHYSICAL COHESION:
  • Ground level is at y = 0. Objects intended to stand on the ground (tree trunks, bench legs, furniture, pedestals) MUST reach ground level (y ≈ 0).
  • Tree trunks are sturdy upright cylinders/capsules, NEVER inverted cone points!
  • Benches and furniture must be designed as solid, tangible slabs (seat thickness >= 0.15) with sturdy support legs, NEVER fragile paper-thin slats (< 0.08) that look like floating sticks.
  • Tree canopies should be lush, voluminous organic crowns (displaced sphere or generous smoothUnion of overlapping spheres).
  • Keep all parts substantial and thick (minimum thickness >= 0.12).
- Do NOT add a ground plane or floor slab unless explicitly requested by the user prompt.

Output ONLY valid JSON in this exact schema (no prose, no markdown):
{
  "sceneName": "...",
  "description": "...",
  "parts": [
    {
      "id": "part_0",
      "name": "PartName",
      "description": "What this part represents and how it connects to the scene",
      "anchor": [x, y, z],
      "scale": 1.0,
      "color": "#hexcode or color name",
      "material": { "roughness": 0.3, "metalness": 0.5 },
      "geometryPlan": {
        "type": "revolve|sweep|cylinder|sphere|box|torus|capsule|cone|ellipsoid|hexPrism|pyramid",
        "description": "Geometry strategy (e.g. sturdy upright cylinder trunk, lush organic canopy cluster, solid bench seat slab with sturdy legs)"
      }
    }
  ]
}"""

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

def _sanitize_sdf_node(node: Any) -> Any:
    """Recursively walks an SDF DSL node tree and sanitizes invalid parameter types (e.g. lists where scalars are expected)."""
    if not isinstance(node, dict):
        return node

    scalar_keys = {
        "radius", "height", "majorRadius", "minorRadius", "rounding", "offset",
        "thickness", "shellThickness", "cellSize", "cellDepth", "amplitude",
        "frequency", "factor", "strength", "k", "angle", "count"
    }
    vector_keys = {
        "center", "size", "radii", "translate", "rotate", "scale", "period", "limit", "a", "b", "baseSize"
    }

    for k, v in list(node.items()):
        if k in scalar_keys:
            if isinstance(v, (list, tuple)):
                try:
                    node[k] = float(v[0]) if len(v) > 0 and v[0] is not None else 1.0
                except (ValueError, TypeError):
                    node[k] = 1.0
            elif isinstance(v, str):
                try:
                    node[k] = float(v)
                except ValueError:
                    pass
        elif k in vector_keys:
            if isinstance(v, (int, float)):
                f = float(v)
                node[k] = [f, f, f]
            elif isinstance(v, (list, tuple)):
                cleaned = []
                for item in v:
                    try:
                        cleaned.append(float(item) if item is not None else 0.0)
                    except (ValueError, TypeError):
                        cleaned.append(0.0)
                node[k] = cleaned

    if "children" in node and isinstance(node["children"], list):
        node["children"] = [_sanitize_sdf_node(c) for c in node["children"] if isinstance(c, dict)]
    for sub in ["child", "a", "b"]:
        if sub in node and isinstance(node[sub], dict):
            node[sub] = _sanitize_sdf_node(node[sub])

    return node

def normalize_sdf_document(parsed: Any, fallback_name: str = "AI Model") -> dict:
    """Normalizes any JSON structure returned by the LLM into a compliant SDFDocument with graceful fallbacks."""
    res = _normalize_sdf_document_raw(parsed, fallback_name)
    if isinstance(res, dict) and "root" in res:
        res["root"] = _sanitize_sdf_node(res["root"])
    return res

def _normalize_sdf_document_raw(parsed: Any, fallback_name: str = "AI Model") -> dict:
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
# Groq Client: direct execution with reasoning & fallback
# ─────────────────────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────────────────────
# Groq Client: direct execution with multi-key routing, backoff & fallback
# ─────────────────────────────────────────────────────────────────────────────

def call_groq(
    client: Any = None,
    messages: List[Dict[str, str]] = None,
    temperature: float = 0.3,
    max_tokens: int = 2000,
    api_key: Optional[str] = None,
) -> str:
    """
    Calls Groq using multi-key routing across all available keys with OTPM backoff/rotation
    and seamless Gemini Flash Lite fallback.
    """
    global _groq_key_index
    load_dotenv(dotenv_path=ENV_FILE, override=True)
    model_name = os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b")
    gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")

    # Collect available Groq keys
    pool = get_all_groq_keys()
    if api_key and api_key not in pool:
        pool.insert(0, api_key)

    num_keys = len(pool)
    if num_keys == 0 and client is None:
        print("[WARN] No Groq API keys configured.")
    else:
        # Starting offset in rotation pool
        start_idx = _groq_key_index % max(1, num_keys) if num_keys > 0 else 0

        for attempt_offset in range(max(1, num_keys)):
            current_idx = (start_idx + attempt_offset) % num_keys if num_keys > 0 else 0
            current_key = pool[current_idx] if pool else None
            active_client = get_groq_client_for_key(current_key) if current_key else client
            key_tag = f"key #{current_idx + 1} ({current_key[:8]}...)" if current_key else "default client"
            
            # Allow generous token allowance for complex multi-part scenes
            groq_tokens = min(max_tokens, 2400)

            try:
                print(f"[*] Querying Groq model: {model_name} via {key_tag} (attempt {attempt_offset + 1}, max_tokens={groq_tokens})...")
                sys.stdout.flush()
                completion = active_client.chat.completions.create(
                    model=model_name,
                    messages=messages,
                    max_tokens=groq_tokens,
                    temperature=temperature,
                )
                content = completion.choices[0].message.content
                if content and content.strip():
                    print(f"[OK] Response received via {key_tag} ({len(content)} chars)")
                    sys.stdout.flush()
                    # Distribute load to next key for subsequent call
                    if num_keys > 1:
                        _groq_key_index = (current_idx + 1) % num_keys
                    return content
            except Exception as e:
                err_str = str(e)
                print(f"[WARN] Groq request failed on {key_tag}: {err_str}")
                sys.stdout.flush()
                if "429" in err_str or "rate_limit" in err_str.lower() or "otpm" in err_str.lower():
                    if num_keys > 1 and attempt_offset < num_keys - 1:
                        print(f"[*] Groq OTPM rate limit encountered on {key_tag}. Rotating immediately to next key in pool...")
                        sys.stdout.flush()
                        _groq_key_index = (current_idx + 1) % num_keys
                        continue
                    elif num_keys == 1 and attempt_offset == 0:
                        print(f"[*] Groq OTPM rate limit encountered. Waiting 2.0s before single-key retry...")
                        sys.stdout.flush()
                        time.sleep(2.0)
                        try:
                            completion = active_client.chat.completions.create(
                                model=model_name,
                                messages=messages,
                                max_tokens=max_tokens,
                                temperature=temperature,
                            )
                            content = completion.choices[0].message.content
                            if content and content.strip():
                                print(f"[OK] Response received on retry ({len(content)} chars)")
                                sys.stdout.flush()
                                return content
                        except Exception as retry_err:
                            print(f"[WARN] Groq retry error: {retry_err}")
                            sys.stdout.flush()
                continue

    # Seamless fallback to Gemini if all Groq keys are exhausted or rate-limited
    if gemini_key:
        print("[*] Switching to Gemini (gemini-3.5-flash-lite) fallback to complete request...")
        sys.stdout.flush()
        try:
            endpoint = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
            headers = {
                "Authorization": f"Bearer {gemini_key}",
                "Content-Type": "application/json",
            }
            payload = {
                "model": os.getenv("JUDGE_MODEL", "gemini-3.5-flash-lite"),
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
            }
            with httpx.Client(timeout=40.0) as http_client:
                resp = http_client.post(endpoint, headers=headers, json=payload)
                if resp.status_code == 200:
                    content = resp.json()["choices"][0]["message"]["content"]
                    if content and content.strip():
                        print(f"[OK] Response received from Gemini fallback ({len(content)} chars)")
                        sys.stdout.flush()
                        return content
                else:
                    print(f"[WARN] Gemini fallback returned HTTP {resp.status_code}: {resp.text}")
                    sys.stdout.flush()
        except Exception as fallback_err:
            print(f"[ERROR] Gemini fallback exception: {fallback_err}")
            sys.stdout.flush()

    raise RuntimeError("All model providers (Groq keys and Gemini fallback) failed or were rate-limited.")

# ─────────────────────────────────────────────────────────────────────────────
# WS2 — Architect & Sculptor Pipeline
# ─────────────────────────────────────────────────────────────────────────────

def plan_scene_blueprint(client: Any, prompt: str) -> dict:
    """Stage 1: Architect — decompose the concept into 4-8 detailed semantic parts."""
    print(f"[Architect] Decomposing: '{prompt}' into detailed semantic parts")
    sys.stdout.flush()
    
    user_content = (
        f"Decompose this 3D scene concept into 4–8 detailed semantic parts with fine geometric features, spatial coordinates, and operator choices:\n\n\"{prompt}\"\n\n"
        "Output ONLY the JSON blueprint object, no other text."
    )
    raw = call_groq(
        client=client,
        messages=[{"role": "system", "content": ARCHITECT_SYSTEM_PROMPT},
                  {"role": "user", "content": user_content}],
        temperature=0.3,
        max_tokens=1200,
    )
    parsed = extract_json_from_llm_response(raw)
    if not isinstance(parsed, dict) or "parts" not in parsed:
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
    print(f"[Architect] Blueprint: {len(parsed['parts'])} detailed parts")
    sys.stdout.flush()
    return parsed

def synthesize_scene_sdf(client: Any, blueprint: dict, original_prompt: str) -> dict:
    """Stage 2: Sculptor — convert the blueprint into an SDF document."""
    print(f"[Sculptor] Synthesizing SDF for blueprint '{blueprint.get('sceneName', '?')}' ({len(blueprint.get('parts', []))} parts)")
    sys.stdout.flush()
    
    user_content = (
        f"ORIGINAL REQUEST: \"{original_prompt}\"\n\n"
        f"SCENE BLUEPRINT (from Architect):\n{json.dumps(blueprint, indent=2)}\n\n"
        "SCULPTING DIRECTIVES:\n"
        "1. Convert each part's geometryPlan into a detailed, articulated, solid SDF sub-tree.\n"
        "2. PHYSICAL GROUNDING: Ground level is at y = 0. Structural bases, tree trunks, and furniture legs MUST stand firmly on the ground (base reaches y <= 0). Tree trunks MUST be upright cylinders or capsules, NEVER inverted cone needles!\n"
        "3. SUBSTANTIAL THICKNESS: Every feature must have solid tangible volume (minimum thickness >= 0.12). For benches/furniture, model solid seat slabs and sturdy legs, NOT razor-thin floating slats.\n"
        "4. NATURAL VOLUMES: For tree canopies and organic shapes, create lush, cohesive, cloud-like foliage (smoothUnion of generous overlapping spheres or displaced sphere), not harsh disjointed spheres.\n"
        "5. Merge all parts into the root smoothUnion with appropriate blend radius (k=0.2 to 0.45).\n"
        "6. Respect anchors and scales. Assign vivid, contrasting materials with distinct colors, roughness, and metalness.\n"
        "Output pure SDF Document JSON starting with {\n  \"version\": \"sdf-dsl-1\",\n  \"name\": \"...\",\n  \"root\": { ... }\n}:"
    )
    raw = call_groq(
        client=client,
        messages=[{"role": "system", "content": SCULPTOR_SYSTEM_PROMPT},
                  {"role": "user", "content": user_content}],
        temperature=0.25,
        max_tokens=2800,
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

class ChatRequest(BaseModel):
    session_id: Optional[str] = None
    message: str
    groqApiKey: Optional[str] = None
    max_rounds: Optional[int] = 3
    new_model: Optional[bool] = False

# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/api/chat")
async def chat_endpoint(req: ChatRequest):
    """
    Unified LangGraph conversational 3D modeling endpoint.
    Maintains multi-turn conversation memory and self-refinement critic loop per session.
    """
    load_dotenv(dotenv_path=ENV_FILE, override=True)
    groq_key = req.groqApiKey or get_primary_groq_key()
    if not groq_key:
        raise HTTPException(status_code=400, detail="GROQ_API_KEY is missing in apps/api/.env (or set GROQ_API_KEY_1).")

    from langchain_core.messages import HumanMessage
    from graph import madder_graph

    session_id = req.session_id or f"session_{int(time.time())}"
    config = {"configurable": {"thread_id": session_id}}

    is_refinement = False
    if not req.new_model:
        try:
            prev_snapshot = madder_graph.get_state(config)
            if prev_snapshot and prev_snapshot.values.get("sdf_document"):
                is_refinement = True
        except Exception:
            pass

    inputs = {
        "session_id": session_id,
        "user_prompt": req.message,
        "messages": [HumanMessage(content=req.message)],
        "is_refinement": is_refinement,
        "groq_api_key": groq_key,
        "max_rounds": req.max_rounds or 3,
    }

    try:
        result = madder_graph.invoke(inputs, config=config)
        return {
            "success": True,
            "session_id": session_id,
            "document": result.get("sdf_document"),
            "final_score": result.get("final_score", 8.0),
            "total_rounds": result.get("total_rounds", 1),
            "message": result.get("assistant_message", "Model ready."),
            "blueprint": result.get("blueprint"),
            "is_refinement": is_refinement,
        }
    except Exception as e:
        print(f"\n[ERROR] Exception during /api/chat: {e}")
        traceback.print_exc()
        sys.stdout.flush()
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)}")

@app.get("/api/health")
def health_check():
    load_dotenv(dotenv_path=ENV_FILE, override=True)
    return {
        "status": "healthy",
        "provider": "groq",
        "groq_configured": bool(get_primary_groq_key()),
        "active_model": os.getenv("GROQ_MODEL", "qwen/qwen3.6-27b"),
        "pipeline": "architect_sculptor_v2",
    }

@app.post("/api/create")
async def create_model(req: CreateRequest):
    load_dotenv(dotenv_path=ENV_FILE, override=True)
    groq_key = req.groqApiKey or get_primary_groq_key()

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
    groq_key = req.groqApiKey or get_primary_groq_key()

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
            temperature=0.45,
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
    groq_key = req.groqApiKey or get_primary_groq_key()

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
