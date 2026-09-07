import os
import sys
import json
import time
from typing import Dict, Any, List, Optional, Literal
from pydantic import BaseModel, Field
import json_repair

# Ensure apps/api/.env is loaded
ENV_PATH = os.path.join(os.path.dirname(__file__), "..", "apps", "api", ".env")
if os.path.exists(ENV_PATH):
    from dotenv import load_dotenv
    load_dotenv(dotenv_path=ENV_PATH, override=True)

class CodeVerdict(BaseModel):
    status: Literal["PASS", "RETRY"] = Field(..., description="PASS if code meets structural and prompt requirements, else RETRY")
    code_score: float = Field(..., ge=1, le=10, description="Overall code elegance & structural score (1-10)")
    schema_valid: bool = Field(default=True, description="Conforms to SDF-DSL version 1 specification")
    nesting_correct: bool = Field(default=True, description="Deformations and subtractions properly nested")
    bounded_coordinates: bool = Field(default=True, description="Coordinates within bounding box")
    issues: List[str] = Field(default_factory=list, description="Key mathematical or architectural defects")
    recommended_patch: str = Field(default="", description="Precise instruction on what to fix in the SDF tree")
    preserve: List[str] = Field(default_factory=list, description="Sub-tree sections or node names that are correct and must be preserved unchanged during refinement")
    was_truncated: bool = Field(default=False, description="True if the SDF JSON was truncated before evaluation — judge saw incomplete document")
    raw_response: Optional[str] = None

CODE_JUDGE_SYSTEM_PROMPT = """You are an expert Signed Distance Function (SDF-DSL) Code & Architecture Judge for Madder Models.
You evaluate the generated SDF-DSL JSON tree against the user prompt WITHOUT seeing any rendered image (IterTracer regime).

EVALUATION CRITERIA:
1. SCHEMA & OPERATORS:
   - Valid root with version "sdf-dsl-1", valid bounds, valid resolution.
   - All primitive ops (sphere, box, cylinder, torus, capsule, cone, hexPrism, ellipsoid, pyramid, revolve, sweep) have valid required parameters.
     • revolve: requires profile [[y, r], ...min 2 points]
     • sweep: requires path [[x, y, z], ...min 2 points] and radius
   - All CSG ops (union, smoothUnion, subtraction, smoothSubtraction, intersection, smoothIntersection) have proper children or [a, b].
   - All modifier/symmetry ops (mirror, symmetry, twist, bend, taper, onion, hexShellCells, displace, elongate, transform, repeatLimited, radialRepeat) are valid.
     • mirror: requires axis ("x"|"y"|"z"), optional offset, and child
     • taper: requires factor, optional axis ("x"|"y"|"z"), and child
2. NESTING INTEGRITY:
   - Features attached to a deformed object (e.g. windows/pores on a twisted spire or bent tube) MUST be nested inside the deformation child (twist/bend/taper), NOT placed as outer siblings in smoothUnion.
   - Hollow before carving: Shells with lattice/hex cells should wrap the hull in 'onion' or use 'hexShellCells' rather than carving into solid mass.
3. BOUNDS & COORDINATES:
   - Centers, translations, and dimensions must stay reasonably within bounds (default [-3.5, 3.5]).
4. PROMPT STRUCTURAL COVERAGE & PHYSICAL COHESION:
   - Does the tree contain mathematical structures corresponding to all requested functional/semantic parts from the prompt?
   - Reward well-decomposed, structurally sound, grounded parts (e.g. solid seat slab, sturdy legs, backrest, upright trunk, lush organic foliage crown).
   - Penalize fragile, paper-thin disjointed slats (< 0.08 thickness) or ungrounded floating sticks.
   - Grounding & orientation: Tree trunks, legs, and bases must stand firmly at y = 0. Penalize inverted needle-point cones for vertical supports.
5. AVOID STICKER/LUMP BULGES:
   - Penalize if separate solid primitives (like small boxes/spheres) are crudely glued onto a smooth hull just to assign a 2D surface color or patch, causing an unnatural protruding bump.
6. NO UNNECESSARY GROUND / FLOOR / PEDESTAL:
   - Penalize if the model generates an unrequested ground plane, flat floor slab, or pedestal when the prompt asked for an isolated standalone object.

DECISION RULES:
- PASS: code_score >= 6.0 AND schema is valid AND no catastrophic nesting/coordinate violations.
- RETRY: code_score < 6.0 OR missing major requested components OR broken operator hierarchy.

OUTPUT FORMAT:
Output MUST be a pure JSON object in this exact schema (no markdown outside the json):
{
  "status": "PASS",
  "code_score": 8.5,
  "schema_valid": true,
  "nesting_correct": true,
  "bounded_coordinates": true,
  "issues": [
    "Minor issue description"
  ],
  "preserve": [
    "node_name_or_subtree that is already correct"
  ],
  "recommended_patch": "Concise instruction on what node to adjust or re-nest"
}
"""

def evaluate_code(
    prompt: str,
    sdf_document: Dict[str, Any],
    model_name: Optional[str] = None,
    api_key: Optional[str] = None,
    round_num: Optional[int] = None,
    previous_issues: Optional[List[str]] = None,
) -> CodeVerdict:
    """
    Evaluates an SDF-DSL document strictly on code structure, mathematics, and prompt coverage
    using Gemini 3.5 Flash Lite (with Groq fallback).
    """
    groq_key = os.getenv("GROQ_API_KEY") or os.getenv("GROQ_API_KEY_1") or ""
    if not groq_key:
        try:
            from apps.api.main import get_primary_groq_key
            groq_key = get_primary_groq_key()
        except Exception:
            pass

    TRUNCATION_THRESHOLD = 11500  # chars: warn if JSON is near the cut
    sdf_str = json.dumps(sdf_document, indent=2)
    was_truncated = len(sdf_str) > TRUNCATION_THRESHOLD
    if was_truncated:
        truncated_sdf_str = sdf_str[:TRUNCATION_THRESHOLD] + "\n... [DOCUMENT TRUNCATED — evaluation based on partial tree only]"
        print(f"  ├─ [CodeJudge] ⚠️  SDF JSON is {len(sdf_str)} chars — truncated to {TRUNCATION_THRESHOLD} for evaluation.")
        sys.stdout.flush()
    else:
        truncated_sdf_str = sdf_str

    round_header = f"\nCRITIQUE ROUND: {round_num}\n" if round_num is not None else ""
    prev_issues_text = ""
    if previous_issues:
        bullet = "\n".join(f"  • {iss}" for iss in previous_issues)
        prev_issues_text = (
            f"ISSUES FLAGGED IN PRIOR ROUND (verify if resolved):\n{bullet}\n"
            "Check whether each prior issue was actually addressed in the updated SDF.\n\n"
        )
    user_content = (
        f"TARGET USER PROMPT:\n\"{prompt}\"\n"
        f"{round_header}\n"
        f"{prev_issues_text}"
        f"GENERATED SDF-DSL JSON:\n```json\n{truncated_sdf_str}\n```\n\n"
        "Analyze the SDF structure, assess schema conformance, nesting integrity, and prompt coverage. "
        "Also list in 'preserve' any node names or sub-tree sections that are already correct and should NOT be changed during refinement. "
        "Emit the CodeVerdict JSON object."
    )

    # 1. Primary: Groq (Ultra-fast ~0.5s execution via dedicated LLM code inference)
    if groq_key:
        try:
            from groq import Groq
            client = Groq(api_key=groq_key)
            resolved_groq_model = os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b")

            completion = client.chat.completions.create(
                model=resolved_groq_model,
                messages=[
                    {"role": "system", "content": CODE_JUDGE_SYSTEM_PROMPT},
                    {"role": "user", "content": user_content}
                ],
                temperature=0.1,
                max_tokens=800,
            )

            content = completion.choices[0].message.content or ""
            if "<think>" in content and "</think>" in content:
                content = content.split("</think>")[-1].strip()

            parsed = json_repair.loads(content)
            if isinstance(parsed, dict) and "code_score" in parsed:
                score = float(parsed.get("code_score", 7.0))
                schema_valid = bool(parsed.get("schema_valid", True))
                nesting_correct = bool(parsed.get("nesting_correct", True))
                llm_status = parsed.get("status", "")
                if not schema_valid or not nesting_correct:
                    verdict_status = "RETRY"
                else:
                    verdict_status = "PASS" if (score >= 6.0 and llm_status != "RETRY") else "RETRY"
                raw_issues = parsed.get("issues", [])
                clean_issues = [str(iss) for iss in (raw_issues if isinstance(raw_issues, list) else [raw_issues]) if iss is not None and str(iss).strip()]
                clean_patch = str(parsed.get("recommended_patch", "") or "")
                raw_preserve = parsed.get("preserve", [])
                clean_preserve = [str(p) for p in (raw_preserve if isinstance(raw_preserve, list) else []) if p]
                print(f"  ├─ [Judge Provider] Groq ({resolved_groq_model}) — Code Judge completed.")
                sys.stdout.flush()
                return CodeVerdict(
                    status=verdict_status,
                    code_score=score,
                    schema_valid=schema_valid,
                    nesting_correct=nesting_correct,
                    bounded_coordinates=bool(parsed.get("bounded_coordinates", True)),
                    issues=clean_issues,
                    recommended_patch=clean_patch,
                    preserve=clean_preserve,
                    was_truncated=was_truncated,
                    raw_response=content,
                )
        except Exception as e:
            print(f"[WARN] Groq Code Judge failed: {e}. Trying Gemini fallback...")
            sys.stdout.flush()

    # 2. Secondary Fallback: Gemini 3.5 Flash Lite
    target_key = api_key or gemini_key
    if target_key:
        resolved_model = model_name or os.getenv("JUDGE_MODEL", "gemini-3.5-flash-lite")
        endpoint = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
        headers = {
            "Authorization": f"Bearer {target_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": resolved_model,
            "messages": [
                {"role": "system", "content": CODE_JUDGE_SYSTEM_PROMPT},
                {"role": "user", "content": user_content}
            ],
            "temperature": 0.15,
            "max_tokens": 800,
        }

        try:
            import httpx
            with httpx.Client(timeout=25.0) as client:
                resp = client.post(endpoint, headers=headers, json=payload)
                if resp.status_code == 200:
                    resp_data = resp.json()
                    usage = resp_data.get("usage", {})
                    content = resp_data["choices"][0]["message"]["content"]
                    if "<think>" in content and "</think>" in content:
                        content = content.split("</think>")[-1].strip()

                    parsed = json_repair.loads(content)
                    if isinstance(parsed, dict) and "code_score" in parsed:
                        score = float(parsed.get("code_score", 7.0))
                        schema_valid = bool(parsed.get("schema_valid", True))
                        nesting_correct = bool(parsed.get("nesting_correct", True))
                        llm_status = parsed.get("status", "")
                        if not schema_valid or not nesting_correct:
                            verdict_status = "RETRY"
                        elif score >= 6.0 and llm_status != "RETRY":
                            verdict_status = "PASS"
                        else:
                            verdict_status = "RETRY"
                        p_tok = usage.get("prompt_tokens", 0)
                        c_tok = usage.get("completion_tokens", 0)
                        print(f"  ├─ [Judge Provider] Google Gemini ({resolved_model}) — Tokens: {p_tok} prompt, {c_tok} completion")
                        sys.stdout.flush()
                        raw_issues = parsed.get("issues", [])
                        clean_issues = [str(iss) for iss in (raw_issues if isinstance(raw_issues, list) else [raw_issues]) if iss is not None and str(iss).strip()]
                        clean_patch = str(parsed.get("recommended_patch", "") or "")
                        raw_preserve = parsed.get("preserve", [])
                        clean_preserve = [str(p) for p in (raw_preserve if isinstance(raw_preserve, list) else []) if p]
                        return CodeVerdict(
                            status=verdict_status,
                            code_score=score,
                            schema_valid=schema_valid,
                            nesting_correct=nesting_correct,
                            bounded_coordinates=bool(parsed.get("bounded_coordinates", True)),
                            issues=clean_issues,
                            recommended_patch=clean_patch,
                            preserve=clean_preserve,
                            was_truncated=was_truncated,
                            raw_response=content,
                        )
                else:
                    print(f"[WARN] Gemini Code Judge returned HTTP {resp.status_code}: {resp.text}")
                    sys.stdout.flush()
        except Exception as e:
            print(f"[WARN] Gemini Code Judge request failed: {e}.")
            sys.stdout.flush()

    # 3. Rule-based fallback
    return _heuristic_code_check(prompt, sdf_document)

def _heuristic_code_check(prompt: str, sdf_document: Dict[str, Any]) -> CodeVerdict:
    """Fast rule-based sanity check when LLM judge is unavailable."""
    issues = []
    score = 8.0

    if not isinstance(sdf_document, dict):
        return CodeVerdict(
            status="RETRY",
            code_score=1.0,
            schema_valid=False,
            nesting_correct=False,
            bounded_coordinates=False,
            issues=["Root is not a dictionary"],
            recommended_patch="Provide a valid SDF document object with root node.",
        )

    root = sdf_document.get("root")
    if not root or not isinstance(root, dict) or "op" not in root:
        issues.append("Missing valid 'root' node with 'op' property")
        score -= 4.0

    # Check bounds
    bounds = sdf_document.get("bounds", {})
    if not bounds or "min" not in bounds or "max" not in bounds:
        issues.append("Missing explicit bounds definition")
        score -= 1.0

    status: Literal["PASS", "RETRY"] = "PASS" if score >= 6.0 and len(issues) == 0 else "RETRY"
    return CodeVerdict(
        status=status,
        code_score=max(1.0, score),
        schema_valid=len(issues) == 0,
        nesting_correct=True,
        bounded_coordinates=True,
        issues=issues,
        recommended_patch="Ensure root node contains valid operators and valid bounds." if issues else "",
        raw_response="Heuristic evaluation",
    )
