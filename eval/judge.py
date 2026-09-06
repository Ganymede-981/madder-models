import os
import sys
import re
import json
import base64
import time
import hashlib
import httpx
from typing import Dict, Any, List, Optional, Literal, Tuple
from pydantic import BaseModel, Field
import json_repair

class VisualVerdict(BaseModel):
    status: Literal["PASS", "RETRY"] = Field(..., description="PASS if rendered image aligns with prompt and geometry is coherent, else RETRY")
    visual_score: float = Field(..., ge=1, le=10, description="Overall visual quality & semantic fidelity score (1-10)")
    prompt_alignment: float = Field(default=8.0, ge=1, le=10, description="Visual match with user prompt (1-10)")
    spatial_coherence: float = Field(default=8.0, ge=1, le=10, description="Coherent parts connection vs floating disconnected elements (1-10)")
    silhouette_quality: float = Field(default=8.0, ge=1, le=10, description="Recognizable 3D silhouette vs ambiguous blob (1-10)")
    material_fidelity: float = Field(default=8.0, ge=1, le=10, description="Semantic color accuracy, material mapping, no color bleeding (1-10)")
    organic_quality: float = Field(default=8.0, ge=1, le=10, description="Smooth organic blending vs pimple/walnut noise trap (1-10)")
    structural_anomalies: float = Field(default=8.0, ge=1, le=10, description="Absence of inverted geometry, needle cones, and paper-thin supports (1-10, higher is better)")
    issues: List[str] = Field(default_factory=list, description="Visual defects, disconnected parts, bad proportions")
    recommended_patch: str = Field(default="", description="Recommended geometric or visual patch hint")
    raw_response: Optional[str] = None

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
2. geometric_fidelity (1-10): Is the 3D silhouette recognizable, coherent, and well-proportioned? Penalize physically absurd structures (e.g. tree trunks shaped like inverted needle cones, or furniture made of paper-thin floating slats/sticks). Reward sturdy, grounded, well-proportioned solid geometry.
3. organic_quality (1-10): Does the model use smooth organic blending (smoothUnion k=0.2-0.5)? Penalize heavily if it falls into the "pimple/walnut noise trap" (abuse of high-frequency displace creating cobblestone/pimple lumps). Canopies should look lush, continuous, and voluminous.
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

VISUAL_CRITIC_SYSTEM_PROMPT = """You are an expert 3D Visual Critic evaluating rendered multi-view snapshots of AI-generated Signed Distance Function (SDF-DSL) models (IterVision regime).

You are provided with:
1. The User's Text Prompt (the target 3D concept).
2. Canonical 3D perspective renders of the model captured with strictly identical camera distance and bounding-box framing:
   - View 1 [Front 3/4]: Azimuth 45°, Elevation 28° (Standard hero angle showing silhouette and main side profile).
   - View 2 [Back 3/4]: Azimuth 225°, Elevation 28° (180° opposite view — catches defects hidden behind the model, asymmetrical flaws, or missing rear geometry).
   - View 3 [Top-Down]: Azimuth 45°, Elevation 85° (Plan view — reveals whether repeated/cavity patterns like honeycomb cells or repeatLimited arrays resolve into a coherent radial/lattice layout, rather than a clumpy side-only illusion).

CRITICAL CROSS-VIEW REASONING:
- Cross-correlate all 3 views. A feature that looks plausible from the front might be broken, clipped, or floating when viewed from the back or top.
- Check top-down layout: ensure repeated arrays (repeatLimited, radialRepeat) or honeycombs resolve into a coherent 3D pattern rather than clipping or clumping.
- Ensure the object is self-contained and clean from all angles.

EVALUATION CRITERIA:
1. prompt_alignment (1-10): Are all requested features, colors, and overall concept visually identifiable across all views?
2. spatial_coherence (1-10): Are parts logically positioned and joined (e.g. spire attached to base, wings connected to fuselage), or are there disconnected/floating parts or clipped geometry visible in the rear or top-down views?
3. silhouette_quality (1-10): Is the silhouette crisp, organic, and distinct from all 3 angles, or an unrefined melted blob?
4. organic_quality (1-10): Does the model use smooth organic blending (smoothUnion k=0.2-0.5)? Penalize heavily if it falls into the "pimple/walnut noise trap" (abuse of high-frequency displace creating cobblestone/pimple lumps). Canopies and curved surfaces should look lush, continuous, and voluminous — not bumpy or granular.
5. material_fidelity (1-10): Are the painted material colors distinct, vibrant, semantically mapped to the correct part boundaries, and free from color bleeding or washed-out grey monotone?
6. structural_anomalies (1-10, higher = fewer anomalies): Does the model avoid: inverted geometries (needle-tip cone used as a trunk/leg), paper-thin floating slats, ungrounded hovering masses, or unprompted pedestals/floor slabs? Score 10 if none are present, lower if visible.
7. NO UNNECESSARY GROUND / FLOOR / PEDESTAL: Heavily penalize if the model generates an unrequested ground plane, flat floor slab, terrain disk, or pedestal when the user asked for a standalone subject object. The model should cleanly float in 3D space unless the prompt specifically asked for a floor/pedestal/environment.

DECISION RULES:
- PASS: visual_score >= 6.0 AND prompt_alignment >= 6.0 AND spatial_coherence >= 6.0 AND material_fidelity >= 5.0 AND organic_quality >= 5.0 AND structural_anomalies >= 5.0 (and no unrequested ground/pedestal ruining the model)
- RETRY: visual_score < 6.0 OR missing major requested components OR disconnected floating geometry OR rear/top defects OR material_fidelity < 5.0 OR organic_quality < 5.0 OR structural_anomalies < 5.0

OUTPUT FORMAT:
Output MUST be a pure JSON object in this exact schema (no markdown outside the json):
{
  "status": "PASS",
  "visual_score": 8.0,
  "prompt_alignment": 8.5,
  "spatial_coherence": 8.0,
  "silhouette_quality": 7.5,
  "organic_quality": 7.5,
  "material_fidelity": 7.0,
  "structural_anomalies": 8.5,
  "issues": [
    "Front 3/4 shows good spire, but Back 3/4 reveals hollow gap",
    "Top-down view shows honeycomb cells clumping on the left side"
  ],
  "recommended_patch": "Specific visual/geometric fix hint"
}
"""

def evaluate_visual_critic(
    prompt: str,
    image_path: Any,  # Can be str, List[str], or Dict[str, str]
    model_name: Optional[str] = None,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
    round_num: Optional[int] = None,
    previous_issues: Optional[List[str]] = None,
) -> VisualVerdict:
    """
    Evaluates rendered 3D snapshot(s) against prompt using a Multimodal VLM (IterVision).
    Supports single image path, list of image paths, or dictionary of view paths.
    """
    # Always use Gemini 3.5 Flash Lite — no fallback, no other model
    gemini_key = api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or ""
    if not gemini_key:
        raise ValueError(
            "VLM Critic requires GEMINI_API_KEY (or GOOGLE_API_KEY) in apps/api/.env. "
            "No fallback model is configured."
        )
    key = gemini_key

    # Normalize image_path input into a list of tuples: [(label, path), ...]
    view_items: List[Tuple[str, str]] = []
    if isinstance(image_path, dict):
        label_map = {
            "front_3_4": "View 1: Front 3/4 (Azimuth 45°, Elevation 28° — Hero Angle)",
            "back_3_4": "View 2: Back 3/4 (Azimuth 225°, Elevation 28° — Rear Silhouette & Hidden Defects)",
            "top_down": "View 3: Top-Down (Azimuth 45°, Elevation 85° — Plan View / Cavity & Array Layout)",
        }
        for k, p in image_path.items():
            if p and os.path.exists(p):
                label = label_map.get(k, f"View: {k}")
                view_items.append((label, p))
    elif isinstance(image_path, (list, tuple)):
        default_labels = [
            "View 1: Front 3/4 (Azimuth 45°, Elevation 28° — Hero Angle)",
            "View 2: Back 3/4 (Azimuth 225°, Elevation 28° — Rear Silhouette & Hidden Defects)",
            "View 3: Top-Down (Azimuth 45°, Elevation 85° — Plan View / Cavity & Array Layout)",
        ]
        for idx, p in enumerate(image_path):
            if p and os.path.exists(p):
                label = default_labels[idx] if idx < len(default_labels) else f"View {idx + 1}"
                view_items.append((label, p))
    elif isinstance(image_path, str):
        if os.path.exists(image_path):
            view_items.append(("Rendered 3D View", image_path))

    if not view_items:
        raise RuntimeError(
            "VLM Critic: No renderable image views found. "
            "Ensure render_sdf_multiview completed successfully before calling evaluate_visual_critic."
        )

    # Locked to Gemini Google endpoint — no fallback, no other model
    endpoint = base_url or "https://generativelanguage.googleapis.com/v1beta/openai"
    resolved_model = model_name or os.getenv("JUDGE_MODEL") or "gemini-3.5-flash-lite"

    # Construct user multimodal content with round-aware guidance
    round_header = f"\n[CRITIQUE ROUND: {round_num}]\n" if round_num is not None else ""
    prev_feedback_text = ""
    if previous_issues:
        issues_bullet = "\n".join(f"  • {iss}" for iss in previous_issues)
        prev_feedback_text = (
            f"DEFECTS IDENTIFIED IN PRIOR ROUND (VERIFY IF RESOLVED):\n"
            f"{issues_bullet}\n"
            f"Carefully scrutinize all views to confirm whether these defects were genuinely resolved in this round.\n\n"
        )

    user_content: List[Dict[str, Any]] = [
        {
            "type": "text",
            "text": (
                f"TARGET USER PROMPT:\n\"{prompt}\"\n"
                f"{round_header}"
                f"{prev_feedback_text}"
                f"Critique this 3D model using the {len(view_items)} canonical perspective(s) rendered with identical framing:\n"
                "- Front 3/4: Hero silhouette and primary facade.\n"
                "- Back 3/4: Rear silhouette and hidden defects.\n"
                "- Top-Down: Cavity, honeycomb, and array layout coherence.\n"
            ),
        }
    ]

    for label, p in view_items:
        # Step 0: content-hash each image before encoding to detect stale renders
        img_hash = hashlib.md5(open(p, "rb").read()).hexdigest()[:8]
        print(f"  ├─ [VLM] {label} hash: {img_hash}  ({os.path.basename(p)})")
        sys.stdout.flush()
        img_b64 = encode_image_to_base64(p)
        data_uri = f"data:image/png;base64,{img_b64}"
        user_content.append({"type": "text", "text": f"── {label} ──"})
        user_content.append({"type": "image_url", "image_url": {"url": data_uri}})

    messages = [
        {"role": "system", "content": VISUAL_CRITIC_SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
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
        "temperature": 0.2,
        "max_tokens": 1200,  # Scaled up for richer multi-dimension critique (3.1)
    }

    url = f"{endpoint.rstrip('/')}/chat/completions"
    last_error: Optional[str] = None

    for attempt in range(3):
        try:
            with httpx.Client(timeout=60.0) as client:
                resp = client.post(url, headers=headers, json=payload)

                if resp.status_code == 429:
                    wait_sec = 2 ** (attempt + 1)
                    print(f"  ├─ [VLM] Rate limit (429) on {resolved_model}. Waiting {wait_sec}s before retry...")
                    sys.stdout.flush()
                    time.sleep(wait_sec)
                    continue

                if resp.status_code != 200:
                    last_error = f"Status {resp.status_code}: {resp.text[:300]}"
                    print(f"  ├─ [VLM] Error response from {resolved_model}: {last_error}")
                    sys.stdout.flush()
                    break  # Non-retryable HTTP error

                resp_json = resp.json()
                usage = resp_json.get("usage", {})
                content = resp_json["choices"][0]["message"]["content"]
                parsed = json_repair.loads(content)

                if not isinstance(parsed, dict) or "visual_score" not in parsed:
                    last_error = f"Invalid VLM response payload (missing visual_score): {content[:200]}"
                    print(f"  ├─ [VLM] Parse failure (attempt {attempt + 1}): {last_error}")
                    sys.stdout.flush()
                    time.sleep(1)
                    continue

                verdict_status = parsed.get("status", "PASS")
                score = float(parsed.get("visual_score", 7.0))

                # Parse all subscores
                pa_raw = parsed.get("prompt_alignment")
                pa = float(pa_raw) if pa_raw is not None else score
                sc_raw = parsed.get("spatial_coherence")
                sc = float(sc_raw) if sc_raw is not None else score
                sq_raw = parsed.get("silhouette_quality")
                sq = float(sq_raw) if sq_raw is not None else score
                oq_raw = parsed.get("organic_quality")
                oq = float(oq_raw) if oq_raw is not None else score
                mf_raw = parsed.get("material_fidelity")
                mf = float(mf_raw) if mf_raw is not None else score
                sa_raw = parsed.get("structural_anomalies")
                sa = float(sa_raw) if sa_raw is not None else score

                # Enforce gate: override status based on hard thresholds (2.3)
                if score < 6.0 or pa < 6.0 or sc < 6.0 or mf < 5.0 or oq < 5.0 or sa < 5.0:
                    verdict_status = "RETRY"
                elif verdict_status not in ("PASS", "RETRY"):
                    verdict_status = "PASS"

                p_tok = usage.get("prompt_tokens", 0)
                c_tok = usage.get("completion_tokens", 0)
                round_tag = f" Round {round_num}" if round_num is not None else ""
                print(f"  ├─ [VLM Provider] Google Gemini ({resolved_model}){round_tag} — Tokens: {p_tok} prompt, {c_tok} completion")
                print(f"  ├─ [VLM] Subscores — Alignment: {pa:.1f} | Coherence: {sc:.1f} | Silhouette: {sq:.1f} | Organic: {oq:.1f} | Material: {mf:.1f} | Structure: {sa:.1f}")
                sys.stdout.flush()

                raw_issues = parsed.get("issues", [])
                if isinstance(raw_issues, str):
                    issues_list = [raw_issues]
                elif isinstance(raw_issues, list):
                    issues_list = [str(item) for item in raw_issues]
                else:
                    issues_list = []

                raw_patch = parsed.get("recommended_patch", "")
                patch_str = str(raw_patch) if raw_patch is not None else ""

                return VisualVerdict(
                    status=verdict_status,
                    visual_score=score,
                    prompt_alignment=pa,
                    spatial_coherence=sc,
                    silhouette_quality=sq,
                    organic_quality=oq,
                    material_fidelity=mf,
                    structural_anomalies=sa,
                    issues=issues_list,
                    recommended_patch=patch_str,
                    raw_response=content,
                )
        except Exception as e:
            last_error = str(e)
            print(f"  ├─ [VLM] Exception (attempt {attempt + 1}): {e}")
            sys.stdout.flush()
            time.sleep(1)

    raise RuntimeError(
        f"VLM Critic (gemini-3.5-flash-lite) failed after 3 attempts. No fallback. "
        f"Last error: {last_error}"
    )

# Backward compatibility alias
evaluate_with_glm_judge = evaluate_with_llm_judge

