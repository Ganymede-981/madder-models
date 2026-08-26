import os
import sys
import json
import re
import traceback
from typing import Optional, Dict, Any
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
from dotenv import load_dotenv
import json_repair

# Ensure utf-8 output on Windows console
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

load_dotenv(override=True)

app = FastAPI(title="Madder Models API Server", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "qwen/qwen3.6-27b")
HF_MVDREAM_ENDPOINT = os.getenv("HF_MVDREAM_ENDPOINT", os.getenv("HF_SHAP_E_ENDPOINT", ""))


print("=== Madder Models API Server ===")
print(f"[*] Groq Key configured: {'YES (' + GROQ_API_KEY[:8] + '...)' if GROQ_API_KEY else 'NO (Missing GROQ_API_KEY in apps/api/.env)'}")
print(f"[*] Groq Model: {GROQ_MODEL}")
print(f"[*] Server listening on http://localhost:{os.getenv('PORT', '8000')}")
print("================================")

SYSTEM_PROMPT = """You are the AI Geometry Engine for Madder Models, an organic AI-native 3D modeling tool.
You generate and refine 3D shapes using Signed Distance Functions (SDF) Domain-Specific Language (SDF-DSL).

YOUR TASK:
Take the current SDF Document and the user's natural language instruction, and output a modified or newly generated SDF Document in pure JSON matching the sdf-dsl-1 schema.

CRITICAL RULES:
1. GEOMETRY ONLY: Do NOT output color, material, texture, or styling properties (e.g. no 'color', 'material', 'red'). The viewport handles materials separately. Focus entirely on 3D geometric nodes.
2. ORGANIC & FLUID: Avoid rigid boxes where possible. Use 'smoothUnion' (with blend radius k=0.2 to 0.7) to seamlessly melt shapes together.
3. SUBTRACTION & CARVING: Use 'smoothSubtraction' to carve out hollows, organic cavities, or repeating window/cell patterns.
4. REPETITION: Use 'repeatLimited' for organic repeating structures like honeycomb cells (using 'hexPrism'), gills, fins, or pores.
5. DEFORMATIONS: Use 'twist', 'bend', 'displace' (ripples/bumps), or 'onion' (hollow shell walls).

SUPPORTED PRIMITIVES & OPERATORS:
- sphere: { "op": "sphere", "radius": number, "center"?: [x,y,z] }
- box: { "op": "box", "size": [w,h,d], "center"?: [x,y,z], "rounding"?: number }
- cylinder: { "op": "cylinder", "radius": number, "height": number, "center"?: [x,y,z], "rounding"?: number }
- torus: { "op": "torus", "majorRadius": number, "minorRadius": number, "center"?: [x,y,z] }
- capsule: { "op": "capsule", "a": [x,y,z], "b": [x,y,z], "radius": number }
- cone: { "op": "cone", "radius": number, "height": number, "center"?: [x,y,z] }
- hexPrism: { "op": "hexPrism", "radius": number, "height": number, "center"?: [x,y,z], "rounding"?: number }
- union: { "op": "union", "children": SDFNode[] }
- intersection: { "op": "intersection", "children": SDFNode[] }
- subtraction: { "op": "subtraction", "a": SDFNode, "b": SDFNode }
- smoothUnion: { "op": "smoothUnion", "k": number, "children": SDFNode[] }
- smoothSubtraction: { "op": "smoothSubtraction", "k": number, "a": SDFNode, "b": SDFNode }
- repeatLimited: { "op": "repeatLimited", "period": [x,y,z], "limit": [x,y,z], "child": SDFNode }
- twist: { "op": "twist", "strength": number, "child": SDFNode }
- bend: { "op": "bend", "strength": number, "child": SDFNode }
- displace: { "op": "displace", "amplitude": number, "frequency"?: number, "child": SDFNode }
- transform: { "op": "transform", "translate"?: [x,y,z], "rotate"?: [degX,degY,degZ], "scale"?: [sx,sy,sz]|number, "child": SDFNode }
- onion: { "op": "onion", "thickness": number, "child": SDFNode }

DOCUMENT FORMAT:
{
  "version": "sdf-dsl-1",
  "name": "string",
  "description": "string",
  "bounds": { "min": [-3.5, -3.5, -3.5], "max": [3.5, 3.5, 3.5] },
  "resolution": 96,
  "root": <SDFNode>
}

CRITICAL: Output ONLY valid, complete JSON. Do not include markdown codeblocks or comments."""

def extract_json_from_llm_response(text: str) -> dict:
    """Robustly extracts and repairs JSON even if the model includes <think> tags, markdown codeblocks, or minor syntax glitches."""
    # 1. Strip reasoning / thinking tags
    cleaned = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
    
    # 2. Strip markdown codeblocks
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r"\s*```$", "", cleaned, flags=re.MULTILINE)
    
    # 3. Use json_repair for parsing and repairing truncated/malformed JSON
    try:
        # First try finding outermost object {...}
        match = re.search(r"(\{.*\})", cleaned, re.DOTALL)
        candidate = match.group(1) if match else cleaned
        return json_repair.loads(candidate)
    except Exception as e:
        return json_repair.loads(cleaned)

class RefineRequest(BaseModel):
    prompt: str
    currentDocument: Dict[str, Any]
    groqApiKey: Optional[str] = None

class GenerateRequest(BaseModel):
    prompt: str

@app.get("/api/health")
def health_check():
    load_dotenv(override=True)
    key = os.getenv("GROQ_API_KEY", "")
    return {
        "status": "healthy",
        "groq_configured": bool(key),
        "groq_model": os.getenv("GROQ_MODEL", "qwen/qwen3.6-27b"),
        "hf_endpoint_configured": bool(os.getenv("HF_SHAP_E_ENDPOINT", "")),
    }

@app.post("/api/refine")
async def refine_model(req: RefineRequest):
    load_dotenv(override=True)
    api_key = req.groqApiKey or os.getenv("GROQ_API_KEY", "")
    model = os.getenv("GROQ_MODEL", "qwen/qwen3.6-27b")

    print(f"\n[POST /api/refine] Prompt: '{req.prompt}'")

    if not api_key:
        print("[ERROR] GROQ_API_KEY is missing in apps/api/.env")
        raise HTTPException(
            status_code=400,
            detail="GROQ_API_KEY is missing in apps/api/.env. Please paste your key in apps/api/.env.",
        )

    try:
        from groq import Groq
        client = Groq(api_key=api_key)

        print(f"[*] Sending request to Groq (Model: {model})...")
        completion = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": f"CURRENT SDF DOCUMENT:\n{json.dumps(req.currentDocument, indent=2)}\n\nUSER REFINEMENT INSTRUCTION:\n{req.prompt}\n\nEmit the modified SDF Document in JSON:",
                },
            ],
            max_tokens=4096,
            temperature=0.2,
        )

        raw_content = completion.choices[0].message.content
        if not raw_content:
            print("[ERROR] Empty response received from Groq")
            raise HTTPException(status_code=500, detail="Empty response received from Groq")

        parsed = extract_json_from_llm_response(raw_content)
        
        # Ensure root node is present
        if not isinstance(parsed, dict) or "root" not in parsed:
            raise ValueError("Parsed JSON does not contain a valid 'root' SDF node")

        print(f"[OK] Successfully generated SDF-DSL Document: '{parsed.get('name', 'Refined Model')}'")
        return {"success": True, "document": parsed}

    except Exception as e:
        print(f"[ERROR] Exception during /api/refine: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate")
async def generate_model(req: GenerateRequest):
    load_dotenv(override=True)
    hf_endpoint = os.getenv("HF_MVDREAM_ENDPOINT", os.getenv("HF_SHAP_E_ENDPOINT", ""))

    print(f"\n[POST /api/generate] Prompt: '{req.prompt}'")

    if not req.prompt:
        raise HTTPException(status_code=400, detail="Prompt is required")

    if hf_endpoint:
        try:
            print(f"[*] Proxying request to MVDream HF Space: {hf_endpoint}")
            async with httpx.AsyncClient(timeout=60.0) as client:
                res = await client.post(
                    f"{hf_endpoint.rstrip('/')}/generate",
                    json={"prompt": req.prompt},
                )
                if res.status_code == 200:
                    return res.json()
        except Exception as e:
            print(f"[ERROR] Failed to reach HuggingFace ZeroGPU MVDream Space: {e}")
            traceback.print_exc()
            raise HTTPException(status_code=502, detail=f"Failed to reach HuggingFace ZeroGPU Space: {str(e)}")

    print("[WARN] No HF_MVDREAM_ENDPOINT configured")
    raise HTTPException(
        status_code=501,
        detail="No HuggingFace ZeroGPU MVDream endpoint configured. Please set HF_MVDREAM_ENDPOINT in .env or use Refine Mode.",
    )

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
