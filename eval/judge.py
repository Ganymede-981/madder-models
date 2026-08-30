import os
import re
import json
import base64
import time
import httpx
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
import json_repair

class JudgeEvaluation(BaseModel):
    prompt_alignment: float = Field(..., ge=1, le=10, description="Alignment with user prompt (1-10)")
    geometric_fidelity: float = Field(..., ge=1, le=10, description="Silhouette clarity and structural coherence (1-10)")
    organic_quality: float = Field(..., ge=1, le=10, description="Organic quality vs pimple/walnut noise trap (1-10)")
    sdf_code_elegance: float = Field(..., ge=1, le=10, description="SDF-DSL math elegance and operator nesting (1-10)")
    color_harmony: float = Field(..., ge=1, le=10, description="Semantic color accuracy and material harmony (1-10)")
    overall_score: float = Field(..., ge=1, le=10, description="Composite evaluation score (1-10)")
    verdict: str = Field(..., description="EXCELLENT, GOOD, MEDIOCRE, or POOR")
    strengths: List[str] = Field(default_factory=list, description="Key positive aspects")
    weaknesses: List[str] = Field(default_factory=list, description="Key defects or artifacts")
    actionable_feedback: str = Field(..., description="Concrete mathematical or prompting improvements")
    raw_response: Optional[str] = None

JUDGE_SYSTEM_PROMPT = """You are an expert 3D Computer Graphics and Generative AI Judge evaluating Signed Distance Function (SDF-DSL) 3D models.
You will be provided with:
1. The User's Text Prompt (the target 3D concept).
2. The Generated SDF-DSL Code (the mathematical 3D tree).
3. The Rendered 3D Image Snapshot (the visual output of the model).

Your task is to critically judge the 3D model and emit a structured score sheet.

EVALUATION CRITERIA (1 to 10 scale):
1. prompt_alignment (1-10): Did the model capture all requested components, semantic parts, colors, and overall concept?
2. geometric_fidelity (1-10): Is the 3D silhouette recognizable, coherent, and well-proportioned, or is it an ambiguous blob?
3. organic_quality (1-10): Does the model use smooth organic blending (smoothUnion k=0.2-0.5)? Penalize heavily if it falls into the "pimple/walnut noise trap" (abuse of high-frequency displace creating cobblestone/pimple lumps).
4. sdf_code_elegance (1-10): Is the SDF code modular, with proper modifier nesting (e.g. features nested inside twist/bend), hollow walls before carving (onion), and bounded coordinates?
5. color_harmony (1-10): Are painted material colors distinct, vibrant, and semantically mapped to the right parts without washed-out bleeding?
6. overall_score (1-10): Weighted composite quality score.

Output MUST be a pure JSON object in this exact schema (no markdown outside the json):
{
  "prompt_alignment": 8.5,
  "geometric_fidelity": 8.0,
  "organic_quality": 7.5,
  "sdf_code_elegance": 9.0,
  "color_harmony": 8.5,
  "overall_score": 8.3,
  "verdict": "GOOD",
  "strengths": [
    "Clean hollow dome with proper onion shell",
    "Vibrant contrasting colors on parts"
  ],
  "weaknesses": [
    "Slight displacement noise on the upper cap"
  ],
  "actionable_feedback": "Reduce displace amplitude from 0.15 to 0.03 to avoid surface lumpiness."
}
"""

def encode_image_to_base64(image_path: str) -> str:
    """Reads an image file and converts to base64 string."""
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")

def evaluate_with_llm_judge(
    prompt: str,
    sdf_document: Dict[str, Any],
    image_path: str,
    model_name: Optional[str] = None,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
) -> JudgeEvaluation:
    """
    Evaluates an SDF 3D model using Gemini Flash Lite (or specified vision model) as a multimodal LLM-as-a-judge.
    """
    # 1. Resolve Provider, API Key, Endpoint, and Model
    gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    zai_key = os.getenv("ZAI_API_KEY") or os.getenv("GLM_API_KEY") or os.getenv("ZHIPUAI_API_KEY")
    openrouter_key = os.getenv("OPENROUTER_API_KEY")

    key = api_key or gemini_key or zai_key or openrouter_key or os.getenv("OPENAI_API_KEY") or ""
    
    if not key:
        raise ValueError(
            "Judge API key is missing. Please set GEMINI_API_KEY (or GOOGLE_API_KEY / OPENROUTER_API_KEY / ZAI_API_KEY) in apps/api/.env."
        )

    # Determine endpoint & model defaults
    if base_url:
        endpoint = base_url
        resolved_model = model_name or os.getenv("JUDGE_MODEL", "gemini-3.5-flash-lite")
    elif gemini_key and (api_key == gemini_key or not api_key):
        # Official Google Gemini OpenAI-compatible endpoint
        endpoint = "https://generativelanguage.googleapis.com/v1beta/openai"
        resolved_model = model_name or os.getenv("JUDGE_MODEL") or os.getenv("GEMINI_MODEL") or "gemini-3.5-flash-lite"
    elif zai_key and (api_key == zai_key or not api_key):
        # Z.ai / BigModel endpoint
        endpoint = os.getenv("ZAI_BASE_URL", "https://open.bigmodel.cn/api/paas/v4")
        resolved_model = model_name or os.getenv("JUDGE_MODEL") or "glm-4.6v-flash"
    elif openrouter_key:
        endpoint = "https://openrouter.ai/api/v1"
        default_or_model = "google/gemini-3.5-flash-lite" if "gemini" in (model_name or "").lower() else "google/gemini-3.5-flash-lite"
        resolved_model = model_name or os.getenv("JUDGE_MODEL", default_or_model)
    else:
        endpoint = "https://generativelanguage.googleapis.com/v1beta/openai"
        resolved_model = model_name or "gemini-3.5-flash-lite"

    # 2. Encode image as base64 data URI
    img_b64 = encode_image_to_base64(image_path)
    img_data_uri = f"data:image/png;base64,{img_b64}"

    # 3. Construct multimodal message
    sdf_json_str = json.dumps(sdf_document, indent=2)
    user_text = (
        f"TARGET USER PROMPT:\n\"{prompt}\"\n\n"
        f"GENERATED SDF-DSL CODE:\n```json\n{sdf_json_str}\n```\n\n"
        "Please evaluate the 3D model against the user prompt and the rendered image."
    )

    messages = [
        {"role": "system", "content": JUDGE_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": user_text},
                {
                    "type": "image_url",
                    "image_url": {"url": img_data_uri},
                },
            ],
        },
    ]

    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    if "openrouter.ai" in endpoint:
        headers["HTTP-Referer"] = "https://madder.studio"
        headers["X-Title"] = "Madder Models SDF Eval"

    payload = {
        "model": resolved_model,
        "messages": messages,
        "temperature": 0.1,
        "max_tokens": 1500,
    }

    url = f"{endpoint.rstrip('/')}/chat/completions"
    max_retries = 4
    last_error = None

    # Try model candidates (e.g. gemini-2.0-flash-lite, gemini-2.5-flash-lite, gemini-1.5-flash)
    candidate_models = [resolved_model]
    if "generativelanguage.googleapis.com" in endpoint:
        for fallback in ["gemini-2.0-flash-lite", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-1.5-flash"]:
            if fallback not in candidate_models:
                candidate_models.append(fallback)

    for model_attempt in candidate_models:
        payload["model"] = model_attempt
        for attempt in range(max_retries):
            print(f"[*] Querying Multimodal LLM Judge ({model_attempt}) [Attempt {attempt + 1}/{max_retries}]...")
            try:
                with httpx.Client(timeout=60.0) as client:
                    resp = client.post(url, headers=headers, json=payload)
                    
                    if resp.status_code == 429:
                        wait_sec = 2 ** (attempt + 1)
                        print(f"[WARN] Rate limit (429) on {model_attempt}. Waiting {wait_sec}s before retry...")
                        time.sleep(wait_sec)
                        continue
                    
                    if resp.status_code != 200:
                        last_error = f"Status {resp.status_code}: {resp.text}"
                        print(f"[WARN] Attempt with {model_attempt} returned {resp.status_code}: {resp.text[:150]}")
                        break  # Try next model candidate if available

                    resp_json = resp.json()
                    content = resp_json["choices"][0]["message"]["content"]
                    parsed = json_repair.loads(content)
                    
                    if not isinstance(parsed, dict) or "overall_score" not in parsed:
                        raise ValueError(f"Judge returned invalid evaluation payload: {content}")

                    eval_res = JudgeEvaluation(**parsed)
                    eval_res.raw_response = content
                    return eval_res

            except Exception as e:
                last_error = str(e)
                if attempt < max_retries - 1:
                    time.sleep(2)

    raise RuntimeError(f"Judge API request failed after retries: {last_error}")

# Backward compatibility alias
evaluate_with_glm_judge = evaluate_with_llm_judge
