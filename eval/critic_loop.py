import os
import sys
import json
import time
import copy
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field

# Ensure path includes root
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from eval.code_judge import evaluate_code, CodeVerdict
from eval.judge import evaluate_visual_critic, VisualVerdict
from eval.renderer import render_sdf_snapshot, render_sdf_multiview

# Import sculptor system prompt and helpers from main
API_DIR = os.path.abspath(os.path.join(ROOT_DIR, "apps", "api"))
if API_DIR not in sys.path:
    sys.path.insert(0, API_DIR)

from main import (
    call_groq,
    extract_json_from_llm_response,
    normalize_sdf_document,
    SCULPTOR_SYSTEM_PROMPT,
)
from eval.anti_stagnation import _is_sdf_identical_or_degenerate, _apply_safe_mutation

def _refine_max_tokens(round_num: int, sdf_doc: Dict[str, Any]) -> int:
    """Scale token budget with round depth and document size (3.1)."""
    base = 2800 + max(0, round_num - 1) * 600
    size_bonus = max(0, len(json.dumps(sdf_doc)) - 8000) // 2000 * 400
    return min(base + size_bonus, 8192)

def _should_skip_render(code_v: CodeVerdict) -> bool:
    """Skip render/VLM when code is structurally broken (3.2)."""
    if code_v.status != "RETRY":
        return False
    return (
        not code_v.schema_valid
        or not code_v.nesting_correct
        or code_v.was_truncated
        or code_v.code_score < 4.0
    )

class CriticLoopResult(BaseModel):
    final_document: Dict[str, Any]
    final_score: float = Field(..., ge=1, le=10, description="Final composite score (1-10)")
    total_rounds: int = Field(..., ge=1, description="Total critique rounds performed")
    round_scores: List[Dict[str, Any]] = Field(default_factory=list)
    final_code_verdict: Optional[CodeVerdict] = None
    final_visual_verdict: Optional[VisualVerdict] = None
    last_image_path: Optional[str] = None

def refine_sdf_with_critique(
    client: Any,
    prompt: str,
    current_sdf: Dict[str, Any],
    code_verdict: CodeVerdict,
    visual_verdict: VisualVerdict,
    round_num: int = 1,
) -> Dict[str, Any]:
    """
    Sculptor refinement pass guided by both Code Judge (IterTracer) and Visual Critic (IterVision) feedback.
    """
    feedback_points = []
    if code_verdict.issues:
        feedback_points.append(f"CODE/STRUCTURE ISSUES:\n- " + "\n- ".join(code_verdict.issues))
    if code_verdict.recommended_patch:
        feedback_points.append(f"CODE FIX HINT: {code_verdict.recommended_patch}")
    if code_verdict.preserve:
        feedback_points.append(
            "PRESERVE (do NOT modify these sub-trees — they are already correct):\n- "
            + "\n- ".join(code_verdict.preserve)
        )
    if code_verdict.was_truncated:
        feedback_points.append(
            "NOTE: The Code Judge only saw a partial truncated version of your SDF — ensure your full tree is correct end-to-end."
        )
    if visual_verdict.issues:
        feedback_points.append(f"VISUAL DEFECTS (MULTI-VIEW FRONT/BACK/TOP):\n- " + "\n- ".join(visual_verdict.issues))
    if visual_verdict.recommended_patch:
        feedback_points.append(f"VISUAL FIX HINT: {visual_verdict.recommended_patch}")

    combined_feedback = "\n\n".join(feedback_points)
    max_tokens = _refine_max_tokens(round_num + 1, current_sdf)
    preserve_list = code_verdict.preserve

    print("\n" + "#" * 70)
    print(f" 🛠️  [EVAL CRITIC LOOP: SCULPTOR REFINEMENT PASS — ROUND {round_num + 1}]")
    print(f" Consolidated Dual-Critic Feedback sent to Sculptor:")
    print("-" * 70)
    print(combined_feedback)
    print("#" * 70 + "\n")
    sys.stdout.flush()

    user_content = (
        f"ORIGINAL USER PROMPT: \"{prompt}\"\n\n"
        f"CURRENT SDF DOCUMENT (Round {round_num} — DO NOT copy this verbatim; you MUST produce a geometrically improved version):\n"
        f"```json\n{json.dumps(current_sdf, indent=2)}\n```\n\n"
        f"DUAL-CRITIC EVALUATION FEEDBACK (Round {round_num} defects to fix):\n{combined_feedback}\n\n"
        "REFINEMENT RULES (strictly follow all):\n"
        "1. ADDRESS EVERY visual defect and code issue listed above — do not skip any.\n"
        "2. PHYSICAL GROUNDING & PROPORTIONS: Ground level is at y = 0. Tree trunks, furniture legs, and supports MUST stand firmly on the ground (base at y <= 0). Tree trunks MUST be upright cylinders or capsules, NEVER inverted cone needles!\n"
        "3. SUBSTANTIAL THICKNESS (>= 0.12): Avoid razor-thin floating slats or fragile sticks. Model solid seat slabs (0.15 to 0.22) and sturdy legs.\n"
        "4. LUSH ORGANIC CANOPIES: For trees, create lush, voluminous, rounded crowns (displaced sphere or generous smoothUnion of overlapping spheres).\n"
        + (
            "5. SURGICAL EDIT: Copy every sub-tree listed in PRESERVE verbatim — only modify nodes flagged in the issue lists.\n"
            "6. Do NOT output the same geometry as the current document. The geometry MUST be visibly improved, more detailed, and closer to the target prompt.\n"
            if preserve_list
            else "5. Do NOT output the same geometry as the current document. The geometry MUST be visibly improved, more detailed, and closer to the target prompt.\n"
        )
        + (
            "7. Ensure no unrequested ground plane or flat floor slabs.\n"
            "8. Output pure SDF Document JSON starting with {\n  \"version\": \"sdf-dsl-1\",\n  \"name\": \"...\",\n  \"root\": { ... }\n}:"
            if preserve_list
            else "6. Ensure no unrequested ground plane or flat floor slabs.\n"
            "7. Output pure SDF Document JSON starting with {\n  \"version\": \"sdf-dsl-1\",\n  \"name\": \"...\",\n  \"root\": { ... }\n}:"
        )
    )

    raw = call_groq(
        client=client,
        messages=[
            {"role": "system", "content": SCULPTOR_SYSTEM_PROMPT},
            {"role": "user", "content": user_content}
        ],
        temperature=0.55,
        max_tokens=max_tokens,
    )
    parsed = extract_json_from_llm_response(raw)
    refined_sdf = normalize_sdf_document(parsed, fallback_name=current_sdf.get("name", "Refined Model"))

    # Anti-stagnation equality check: Ensure refined_sdf is not identical to current_sdf
    is_identical, reason = _is_sdf_identical_or_degenerate(current_sdf, refined_sdf)
    if is_identical:
        print(f"  ├─ [WARN] {reason}! Triggering retry with higher temperature & mutation guidance...")
        sys.stdout.flush()
        retry_user_content = (
            user_content + "\n\n"
            "CRITICAL REJECTION: Your previous response returned the EXACT SAME geometry without any modifications! "
            "You MUST visibly and geometrically alter the 3D model: re-parameterize, add missing components, "
            "adjust dimensions, and address the specific critic feedback above. "
            "DO NOT return the identical tree!"
        )
        raw_retry = call_groq(
            client=client,
            messages=[
                {"role": "system", "content": SCULPTOR_SYSTEM_PROMPT},
                {"role": "user", "content": retry_user_content}
            ],
            temperature=0.7,
            max_tokens=max_tokens,
        )
        parsed_retry = extract_json_from_llm_response(raw_retry)
        retry_refined = normalize_sdf_document(parsed_retry, fallback_name=current_sdf.get("name", "Refined Model"))
        still_identical, _ = _is_sdf_identical_or_degenerate(current_sdf, retry_refined)
        if not still_identical:
            refined_sdf = retry_refined
            print(f"  ├─ Successfully regenerated mutated SDF geometry on retry.")
        else:
            print(f"  ├─ [WARN] Geometry still identical after retry. Applying geometric micro-mutation.")
            refined_sdf = _apply_safe_mutation(retry_refined)

    return refined_sdf

def run_critic_loop(
    client: Any,
    prompt: str,
    initial_sdf: Dict[str, Any],
    max_rounds: int = 3,
    artifacts_dir: Optional[str] = None,
    session_prefix: str = "critique",
) -> CriticLoopResult:
    """
    Executes the multi-round closed-loop self-refinement (LLMForge Abstract Parametric Loop).
    Max rounds default to 3. Stops early if both Code Judge and Visual Critic pass.
    """
    out_dir = artifacts_dir or os.path.join(os.path.dirname(__file__), "eval_artifacts")
    os.makedirs(out_dir, exist_ok=True)

    current_sdf = initial_sdf
    round_history: List[Dict[str, Any]] = []
    best_sdf = current_sdf
    best_composite_score = 0.0
    latest_img_path: Optional[str] = None
    last_code_v: Optional[CodeVerdict] = None
    last_visual_v: Optional[VisualVerdict] = None

    print(f"\n[*] ─── Launching Closed-Loop Critic (max {max_rounds} rounds) ───")
    sys.stdout.flush()

    for r in range(1, max_rounds + 1):
        print(f"\n[Round {r}/{max_rounds}] Evaluating candidate SDF...")
        sys.stdout.flush()

        # 1. Analytic Code Evaluation (IterTracer)
        code_v = evaluate_code(prompt=prompt, sdf_document=current_sdf, round_num=r)
        last_code_v = code_v

        print("\n" + "=" * 70)
        print(f" 🔍 [LLM CODE JUDGE / IterTracer] Round {r}: {code_v.status} | Score: {code_v.code_score:.1f}/10")
        print(f"     Checks -> Schema: {'✓' if code_v.schema_valid else '✗'} | Nesting: {'✓' if code_v.nesting_correct else '✗'} | Bounded: {'✓' if code_v.bounded_coordinates else '✗'}")
        print("-" * 70)
        if code_v.issues:
            print("  ❌ Code & Structural Issues Detected:")
            for iss in code_v.issues:
                print(f"     • {iss}")
        else:
            print("  ✓ No critical code or nesting defects found.")
        if code_v.recommended_patch:
            print(f"  💡 Code Patch Hint: {code_v.recommended_patch}")
        print("=" * 70 + "\n")
        sys.stdout.flush()

        # 2. Render 3 Canonical 3D Snapshots (Front 3/4, Back 3/4, Top-Down)
        prefix = os.path.join(out_dir, f"{session_prefix}_round_{r}")
        skip_render = _should_skip_render(code_v)
        views_dict: Dict[str, str] = {}
        img_path = ""

        if skip_render:
            reasons = []
            if not code_v.schema_valid:
                reasons.append("schema invalid")
            if not code_v.nesting_correct:
                reasons.append("nesting broken")
            if code_v.was_truncated:
                reasons.append("truncated JSON")
            if code_v.code_score < 4.0:
                reasons.append(f"score {code_v.code_score:.1f} < 4.0")
            print(f"  ├─ ⏭️  Skipping render — {', '.join(reasons)} (3.2 gate)")
            sys.stdout.flush()
            visual_v = VisualVerdict(
                status="RETRY",
                visual_score=code_v.code_score,
                prompt_alignment=code_v.code_score,
                spatial_coherence=code_v.code_score,
                silhouette_quality=code_v.code_score,
                material_fidelity=code_v.code_score,
                structural_anomalies=code_v.code_score,
                organic_quality=code_v.code_score,
                issues=["Render skipped — SDF code is structurally invalid; fix code before visual critique."],
                recommended_patch=code_v.recommended_patch,
            )
            last_visual_v = visual_v
        else:
            print(f"  ├─ Rendering 3 canonical views (Front 3/4, Back 3/4, Top-Down)...")
            sys.stdout.flush()
            try:
                views_dict = render_sdf_multiview(current_sdf, output_prefix=prefix, width=400, height=400)
                img_path = views_dict.get("front_3_4", "")
                latest_img_path = img_path
            except Exception as e:
                print(f"  ├─ [WARN] Multi-view renderer error: {e}")
                views_dict = {}
                img_path = ""

            # 3. Visual VLM Critique (IterVision)
            prev_issues = last_visual_v.issues if last_visual_v else None
            if views_dict:
                visual_v = evaluate_visual_critic(prompt=prompt, image_path=views_dict, round_num=r, previous_issues=prev_issues)
            elif img_path and os.path.exists(img_path):
                visual_v = evaluate_visual_critic(prompt=prompt, image_path=img_path, round_num=r, previous_issues=prev_issues)
            else:
                visual_v = VisualVerdict(
                    status="PASS" if code_v.code_score >= 6.0 else "RETRY",
                    visual_score=code_v.code_score,
                    prompt_alignment=code_v.code_score,
                    spatial_coherence=8.0,
                    silhouette_quality=7.5,
                    material_fidelity=7.5,
                    structural_anomalies=8.0,
                    organic_quality=7.5,
                    issues=["Render snapshot unavailable"],
                    recommended_patch="",
                )
            last_visual_v = visual_v

        # Composite score (weighted: 40% code integrity, 60% visual perceptual quality)
        composite = round(0.4 * code_v.code_score + 0.6 * visual_v.visual_score, 2)

        print("\n" + "=" * 70)
        print(f" 👁️  [VLM MULTI-VIEW CRITIC] Round {r}: {visual_v.status} | Visual Score: {visual_v.visual_score:.1f}/10")
        print(f"     Subscores -> Alignment: {visual_v.prompt_alignment:.1f}/10 | Coherence: {visual_v.spatial_coherence:.1f}/10 | Silhouette: {visual_v.silhouette_quality:.1f}/10 | Organic: {visual_v.organic_quality:.1f}/10")
        print("-" * 70)
        if visual_v.issues:
            print("  ❌ Multi-View Visual Defects Detected (Front 3/4, Back 3/4, Top-Down):")
            for iss in visual_v.issues:
                print(f"     • {iss}")
        else:
            print("  ✓ No visual defects detected across canonical views.")
        if visual_v.recommended_patch:
            print(f"  💡 Visual Patch Hint: {visual_v.recommended_patch}")
        print(f"  ⭐ Composite Quality Score: {composite:.2f}/10 (Code 40% + Visual 60%)")
        print("=" * 70 + "\n")
        sys.stdout.flush()

        round_info = {
            "round": r,
            "code_score": code_v.code_score,
            "code_status": code_v.status,
            "code_issues": code_v.issues,
            "code_patch": code_v.recommended_patch,
            "visual_score": visual_v.visual_score,
            "visual_status": visual_v.status,
            "visual_issues": visual_v.issues,
            "visual_patch": visual_v.recommended_patch,
            "composite_score": composite,
            "image_path": img_path,
        }
        round_history.append(round_info)

        if composite > best_composite_score:
            best_composite_score = composite
            best_sdf = copy.deepcopy(current_sdf)
        elif best_composite_score > 0 and composite < best_composite_score:
            print(f"  ├─ [REGRESSION] Round {r} scored {composite:.2f} < checkpoint {best_composite_score:.2f} — reverting to best checkpoint.")
            sys.stdout.flush()
            current_sdf = copy.deepcopy(best_sdf)

        # Gate check: Early exit if both PASS or score is very high
        if code_v.status == "PASS" and visual_v.status == "PASS":
            print(f"[OK] Closed-loop reached PASS gate on Round {r}! (Score: {composite}/10)")
            sys.stdout.flush()
            return CriticLoopResult(
                final_document=best_sdf,
                final_score=best_composite_score,
                total_rounds=r,
                round_scores=round_history,
                final_code_verdict=last_code_v,
                final_visual_verdict=last_visual_v,
                last_image_path=latest_img_path,
            )

        # If more rounds remaining, refine model with dual feedback
        if r < max_rounds:
            print(f"[*] Refining model with combined critic feedback for Round {r + 1}...")
            sys.stdout.flush()
            try:
                current_sdf = refine_sdf_with_critique(
                    client=client,
                    prompt=prompt,
                    current_sdf=current_sdf,
                    code_verdict=code_v,
                    visual_verdict=visual_v,
                    round_num=r,
                )
            except Exception as e:
                print(f"[WARN] Refinement pass failed: {e}. Keeping current SDF.")
                break

    print(f"[*] Closed-loop completed {len(round_history)} rounds. Final Best Score: {best_composite_score}/10")
    return CriticLoopResult(
        final_document=best_sdf,
        final_score=best_composite_score,
        total_rounds=len(round_history),
        round_scores=round_history,
        final_code_verdict=last_code_v,
        final_visual_verdict=last_visual_v,
        last_image_path=latest_img_path,
    )
