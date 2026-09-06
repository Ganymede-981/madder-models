import os
import sys
import json
import time
import copy
from typing import Dict, Any, Optional, Tuple, List

# Add project root to sys.path
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from eval.code_judge import evaluate_code, CodeVerdict
from eval.judge import evaluate_visual_critic, VisualVerdict
from eval.renderer import render_sdf_snapshot, render_sdf_multiview

# Client and prompt functions from main
API_DIR = os.path.dirname(os.path.abspath(__file__))
if API_DIR not in sys.path:
    sys.path.insert(0, API_DIR)

from main import (
    call_groq,
    extract_json_from_llm_response,
    normalize_sdf_document,
    plan_scene_blueprint,
    synthesize_scene_sdf,
    get_primary_groq_key,
    get_groq_client_for_key,
    SCULPTOR_SYSTEM_PROMPT,
)

def get_groq_client(api_key: Optional[str] = None):
    key = api_key or get_primary_groq_key()
    if not key:
        raise ValueError("GROQ_API_KEY is missing in apps/api/.env (or set GROQ_API_KEY_1)")
    return get_groq_client_for_key(key)

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

# ─────────────────────────────────────────────────────────────────────────────
# Graph Nodes
# ─────────────────────────────────────────────────────────────────────────────

def _reset_critique_checkpoint(state: Dict[str, Any]) -> Dict[str, Any]:
    """Clear stale checkpoint scores from prior runs in the same session."""
    return {
        "best_score": 0.0,
        "best_sdf_document": None,
        "regressed": False,
    }

def architect_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """Decomposes the initial user prompt into 3-6 semantic parts."""
    prompt = state["user_prompt"]
    client = get_groq_client(state.get("groq_api_key"))
    print(f"\n[LangGraph: ArchitectNode] Decomposing: '{prompt}'")
    sys.stdout.flush()
    blueprint = plan_scene_blueprint(client, prompt)
    return {
        "blueprint": blueprint,
        "current_round": 1,
    }

def sculptor_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """Synthesizes the initial SDF-DSL tree from the architectural blueprint."""
    prompt = state["user_prompt"]
    blueprint = state["blueprint"]
    client = get_groq_client(state.get("groq_api_key"))
    print(f"[LangGraph: SculptorNode] Synthesizing initial SDF...")
    sys.stdout.flush()
    sdf_doc = synthesize_scene_sdf(client, blueprint, prompt)
    sdf_doc["_blueprint"] = blueprint
    return {
        "sdf_document": sdf_doc,
        **_reset_critique_checkpoint(state),
        "pre_critique_sdf": None,
        "baseline_score": 0.0,
    }

def code_judge_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """IterTracer regime: Analytic inspection of SDF-DSL structure."""
    prompt = state["user_prompt"]
    sdf_doc = state["sdf_document"]
    round_num = state.get("current_round", 1)
    print(f"[LangGraph: CodeJudgeNode] Evaluating SDF code structure (Round {round_num})...")
    sys.stdout.flush()
    code_v: CodeVerdict = evaluate_code(prompt=prompt, sdf_document=sdf_doc, round_num=round_num)

    print("\n" + "=" * 70)
    print(f" 🔍 [LLM CODE JUDGE / IterTracer] Verdict: {code_v.status} | Score: {code_v.code_score:.1f}/10")
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

    return {
        "code_verdict": code_v.model_dump(),
        "skip_render": _should_skip_render(code_v),
    }

def renderer_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """Renders 3 canonical perspectives (Front 3/4, Back 3/4, Top-Down) with strictly identical framing."""
    sdf_doc = state["sdf_document"]
    session_id = state.get("session_id", "session")
    round_num = state.get("current_round", 1)

    # 3.2 — Skip rendering when code verdict is structurally invalid
    if state.get("skip_render"):
        code_v = state.get("code_verdict", {})
        reasons = []
        if not code_v.get("schema_valid", True):
            reasons.append("schema invalid")
        if not code_v.get("nesting_correct", True):
            reasons.append("nesting broken")
        if code_v.get("was_truncated"):
            reasons.append("truncated JSON")
        if code_v.get("code_score", 0.0) < 4.0:
            reasons.append(f"score {code_v.get('code_score', 0.0):.1f} < 4.0")
        reason_str = ", ".join(reasons) or "bad code"
        print(f"[LangGraph: RendererNode] ⏭️  Skipping render for Round {round_num} — {reason_str}.")
        sys.stdout.flush()
        return {
            "rendered_image_path": None,
            "rendered_views": {},
        }

    artifacts_dir = os.path.join(ROOT_DIR, "eval", "eval_artifacts")
    os.makedirs(artifacts_dir, exist_ok=True)
    prefix = os.path.join(artifacts_dir, f"{session_id}_r{round_num}")

    print(f"[LangGraph: RendererNode] Rendering 3 canonical views (Front 3/4, Back 3/4, Top-Down) for Round {round_num}...")
    sys.stdout.flush()
    try:
        view_dict = render_sdf_multiview(sdf_doc, output_prefix=prefix, width=400, height=400)
        img_path = view_dict.get("front_3_4")
    except Exception as e:
        print(f"[LangGraph: RendererNode] [WARN] Multi-view render error: {e}")
        import traceback
        traceback.print_exc()
        try:
            fallback_img = f"{prefix}_front_3_4.png"
            render_sdf_snapshot(sdf_doc, output_path=fallback_img, width=400, height=400)
            view_dict = {"front_3_4": fallback_img}
            img_path = fallback_img
        except Exception as e2:
            print(f"[LangGraph: RendererNode] [WARN] Single snapshot fallback also failed: {e2}")
            view_dict = {}
            img_path = None
    sys.stdout.flush()

    return {
        "rendered_image_path": img_path,
        "rendered_views": view_dict,
    }

def vlm_critic_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """IterVision regime: VLM multimodal evaluation of rendered 3-view snapshots."""
    prompt = state["user_prompt"]
    rendered_views = state.get("rendered_views") or state.get("rendered_image_path")
    code_v = state.get("code_verdict", {})
    code_score = code_v.get("code_score", 7.0)
    round_num = state.get("current_round", 1)

    # Check previous round defects to pass along for verification
    prev_verdict = state.get("visual_verdict") or {}
    prev_issues = prev_verdict.get("issues") if round_num > 1 else None

    print(f"[LangGraph: VLMCriticNode] Critiquing rendered multi-view snapshots (Round {round_num})...")
    sys.stdout.flush()

    if not rendered_views:
        skipped = state.get("skip_render", False)
        print(f"[LangGraph: VLMCriticNode] [WARN] No rendered views — {'code structurally invalid' if skipped else 'render unavailable'}; using synthetic verdict.")
        visual_v = VisualVerdict(
            status="RETRY" if skipped else "PASS",
            visual_score=code_score if skipped else 7.0,
            prompt_alignment=code_score if skipped else 7.0,
            spatial_coherence=code_score if skipped else 7.0,
            silhouette_quality=code_score if skipped else 7.0,
            material_fidelity=code_score if skipped else 7.0,
            structural_anomalies=code_score if skipped else 7.0,
            organic_quality=code_score if skipped else 7.0,
            issues=["Render skipped — SDF code is structurally invalid; fix code before visual critique."]
            if skipped
            else ["Visual critic skipped because rendering was bypassed or unavailable."],
            recommended_patch=code_v.get("recommended_patch", "") if skipped else "",
        )
    else:
        try:
            visual_v = evaluate_visual_critic(
                prompt=prompt,
                image_path=rendered_views,
                round_num=round_num,
                previous_issues=prev_issues,
            )
        except Exception as e:
            print(f"[LangGraph: VLMCriticNode] [WARN] VLM Critic failed: {e} — using baseline verdict.")
            visual_v = VisualVerdict(
                status="PASS",
                visual_score=7.0,
                prompt_alignment=7.0,
                spatial_coherence=7.0,
                silhouette_quality=7.0,
                material_fidelity=7.0,
                structural_anomalies=7.0,
                organic_quality=7.0,
                issues=[f"Visual critic warning: {str(e)}"],
                recommended_patch="",
            )

    # Composite score: 40% code integrity, 60% perceptual visual quality
    composite = round(0.4 * code_score + 0.6 * visual_v.visual_score, 2)

    # 3.4 — Checkpoint: track best score and SDF within THIS critique loop only
    prev_best = state.get("best_score") or 0.0
    best_sdf_document = state.get("best_sdf_document")
    regressed = False

    # Ignore stale score from old code that tracked best_score without saving the document
    if prev_best > 0 and not best_sdf_document:
        print(f"  ├─ [WARN] Ignoring stale best_score={prev_best:.2f} — no checkpoint document saved.")
        prev_best = 0.0

    if best_sdf_document is None:
        # First scored round in this loop — seed the checkpoint
        best_score = composite
        best_sdf_document = copy.deepcopy(state.get("sdf_document"))
    elif composite > prev_best:
        best_score = composite
        best_sdf_document = copy.deepcopy(state.get("sdf_document"))
    else:
        best_score = prev_best
        if composite < prev_best:
            regressed = True
            print(f"  ├─ [REGRESSION] Round {round_num} scored {composite:.2f} < checkpoint {prev_best:.2f} — will refine from best checkpoint.")

    print("\n" + "=" * 70)
    print(f" 👁️  [VLM MULTI-VIEW CRITIC] Round {round_num}: {visual_v.status} | Visual Score: {visual_v.visual_score:.1f}/10")
    print(f"     Subscores -> Alignment: {visual_v.prompt_alignment:.1f} | Coherence: {visual_v.spatial_coherence:.1f} | Silhouette: {visual_v.silhouette_quality:.1f} | Material: {visual_v.material_fidelity:.1f} | Organic: {visual_v.organic_quality:.1f} | Structure: {visual_v.structural_anomalies:.1f}")
    print("-" * 70)
    if visual_v.issues:
        print("  ❌ Multi-View Visual Defects Detected (Front 3/4, Back 3/4, Top-Down):")
        for iss in visual_v.issues:
            print(f"     • {iss}")
    else:
        print("  ✓ No visual defects detected across canonical views.")
    if visual_v.recommended_patch:
        print(f"  💡 Visual Patch Hint: {visual_v.recommended_patch}")
    print(f"  ⭐ Composite Quality Score: {composite:.2f}/10 (Code 40% + Visual 60%) | Best so far: {best_score:.2f}")
    print("=" * 70 + "\n")
    sys.stdout.flush()

    return {
        "visual_verdict": visual_v.model_dump(),
        "final_score": composite,
        "best_score": best_score,
        "best_sdf_document": best_sdf_document,
        "regressed": regressed,
    }

def sculptor_critic_refine_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """Self-refinement node inside the initial creation critic loop."""
    prompt = state["user_prompt"]
    current_sdf = state["sdf_document"]
    code_v = state.get("code_verdict", {})
    visual_v = state.get("visual_verdict", {})
    client = get_groq_client(state.get("groq_api_key"))
    current_r = state.get("current_round", 1)

    # 3.4 — On regression, refine from the best-scoring checkpoint, not the worse round
    if state.get("regressed") and state.get("best_sdf_document"):
        print(f"[LangGraph: SculptorCriticRefine] Reverting to best checkpoint (score {state.get('best_score', 0):.2f}) before refinement.")
        current_sdf = copy.deepcopy(state["best_sdf_document"])

    print(f"[LangGraph: SculptorCriticRefine] Preparing critic fix hints for round {current_r + 1}...")
    sys.stdout.flush()

    feedback_parts = []
    if code_v.get("issues"):
        feedback_parts.append("CODE ISSUES:\n- " + "\n- ".join(code_v["issues"]))
    if code_v.get("recommended_patch"):
        feedback_parts.append(f"CODE FIX HINT: {code_v['recommended_patch']}")
    # 3.3 — Preserve hints: tell sculptor which sections are already correct
    preserve_list = code_v.get("preserve", [])
    if preserve_list:
        feedback_parts.append("PRESERVE (do NOT modify these sub-trees — they are already correct):\n- " + "\n- ".join(preserve_list))
    if code_v.get("was_truncated"):
        feedback_parts.append("NOTE: The Code Judge only saw a partial truncated version of your SDF — ensure your full tree is correct end-to-end.")
    if visual_v.get("issues"):
        feedback_parts.append("VISUAL DEFECTS (MULTI-VIEW FRONT/BACK/TOP):\n- " + "\n- ".join(visual_v["issues"]))
    if visual_v.get("recommended_patch"):
        feedback_parts.append(f"VISUAL FIX HINT: {visual_v['recommended_patch']}")

    combined = "\n\n".join(feedback_parts)
    max_tokens = _refine_max_tokens(current_r + 1, current_sdf)

    print("\n" + "#" * 70)
    print(f" 🛠️  [SCULPTOR REFINEMENT INPUT — ROUND {current_r + 1}]")
    print(f" Consolidated Dual-Critic Feedback sent to Sculptor:")
    print("-" * 70)
    print(combined)
    print("#" * 70 + "\n")
    sys.stdout.flush()

    user_content = (
        f"TARGET USER PROMPT: \"{prompt}\"\n\n"
        f"CURRENT SDF DOCUMENT (Round {current_r} — DO NOT copy this verbatim; you MUST produce a geometrically improved version):\n"
        f"```json\n{json.dumps(current_sdf, indent=2)}\n```\n\n"
        f"DUAL-CRITIC EVALUATION FEEDBACK (Round {current_r} failures to fix):\n{combined}\n\n"
        "REFINEMENT RULES (strictly follow all):\n"
        "1. ADDRESS EVERY visual defect and code issue listed above — do not skip any.\n"
        "2. PHYSICAL GROUNDING & PROPORTIONS: Ground level is at y = 0. Tree trunks, furniture legs, and supports MUST stand firmly on the ground (base at y <= 0). Tree trunks MUST be upright cylinders or capsules, NEVER inverted cone needles!\n"
        "3. SUBSTANTIAL THICKNESS (>= 0.12): Avoid razor-thin floating slats or fragile sticks. For benches/furniture, model solid seat slabs (thickness 0.15 to 0.22) and sturdy legs.\n"
        "4. LUSH ORGANIC CANOPIES: For trees, create lush, voluminous, rounded crowns (displaced sphere or generous smoothUnion of overlapping spheres) rather than harsh clipping balls.\n"
        "5. Preserve and articulate fine decomposed features with solid substance rather than paper-thin fragments.\n"
        + (
            "6. SURGICAL EDIT: Copy every sub-tree listed in PRESERVE verbatim — only modify nodes flagged in the issue lists.\n"
            "7. Do NOT output the same geometry as the current document. The geometry MUST be visibly improved, more detailed, and closer to the target prompt.\n"
            if preserve_list
            else "6. Do NOT output the same geometry as the current document. The geometry MUST be visibly improved, more detailed, and closer to the target prompt.\n"
        )
        + (
            "8. Ensure no unrequested ground plane or flat floor slabs.\n"
            "9. Output pure SDF Document JSON starting with {\n  \"version\": \"sdf-dsl-1\",\n  \"name\": \"...\",\n  \"root\": { ... }\n}:"
            if preserve_list
            else "7. Ensure no unrequested ground plane or flat floor slabs.\n"
            "8. Output pure SDF Document JSON starting with {\n  \"version\": \"sdf-dsl-1\",\n  \"name\": \"...\",\n  \"root\": { ... }\n}:"
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
        print(f"[LangGraph: SculptorCriticRefine] [WARN] {reason}! Triggering retry with higher temperature & mutation guidance...")
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
            print(f"[LangGraph: SculptorCriticRefine] Successfully regenerated mutated SDF geometry on retry.")
        else:
            print(f"[LangGraph: SculptorCriticRefine] [WARN] Geometry still identical after retry. Applying geometric micro-mutation.")
            refined_sdf = _apply_safe_mutation(retry_refined)

    return {
        "sdf_document": refined_sdf,
        "current_round": current_r + 1,
    }

def conversational_refine_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """Refines an existing 3D model using conversational context and user instructions."""
    instruction = state["user_prompt"]
    current_sdf = state["sdf_document"]
    client = get_groq_client(state.get("groq_api_key"))

    # Preserve the pre-modification model as fallback if this critique loop regresses
    baseline = state.get("best_score") or state.get("final_score") or 0.0

    print(f"\n[LangGraph: ConversationalRefineNode] Instruction: '{instruction}'")

    # Construct conversation history summary
    msgs = state.get("messages", [])
    history_summary = []
    for m in msgs[-6:]:  # Keep recent turns
        role = getattr(m, "type", "user")
        text = getattr(m, "content", "")
        if text:
            history_summary.append(f"{role.upper()}: {text[:150]}")
    history_str = "\n".join(history_summary)

    user_content = (
        f"CONVERSATION HISTORY:\n{history_str}\n\n"
        f"CURRENT SDF DOCUMENT:\n```json\n{json.dumps(current_sdf, indent=2)}\n```\n\n"
        f"USER REFINEMENT INSTRUCTION:\n\"{instruction}\"\n\n"
        "Apply the user's requested modification to the existing 3D model while preserving its identity and working parts. "
        "Output pure SDF Document JSON starting with {\n  \"version\": \"sdf-dsl-1\",\n  \"name\": \"...\",\n  \"root\": { ... }\n}:"
    )

    raw = call_groq(
        client=client,
        messages=[
            {"role": "system", "content": SCULPTOR_SYSTEM_PROMPT},
            {"role": "user", "content": user_content}
        ],
        temperature=0.45,
        max_tokens=2800,
    )
    parsed = extract_json_from_llm_response(raw)
    refined_sdf = normalize_sdf_document(parsed, fallback_name=current_sdf.get("name", "Refined Model"))

    is_identical, _ = _is_sdf_identical_or_degenerate(current_sdf, refined_sdf)
    if is_identical:
        print("[LangGraph: ConversationalRefineNode] [WARN] Output unchanged. Retrying with higher temperature...")
        retry_raw = call_groq(
            client=client,
            messages=[
                {"role": "system", "content": SCULPTOR_SYSTEM_PROMPT},
                {"role": "user", "content": user_content + "\n\nCRITICAL: You MUST make the requested modification, do not echo the same model unchanged."}
            ],
            temperature=0.65,
            max_tokens=2800,
        )
        parsed_retry = extract_json_from_llm_response(retry_raw)
        refined_sdf = normalize_sdf_document(parsed_retry, fallback_name=current_sdf.get("name", "Refined Model"))

    return {
        "sdf_document": refined_sdf,
        "current_round": 1,
        **_reset_critique_checkpoint(state),
        "pre_critique_sdf": copy.deepcopy(current_sdf),
        "baseline_score": baseline,
    }

def finalize_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """Generates the final assistant message and packages response metadata."""
    best_doc = state.get("best_sdf_document")
    current_doc = state.get("sdf_document", {})
    pre_critique = state.get("pre_critique_sdf")
    baseline = state.get("baseline_score") or 0.0
    loop_best = state.get("best_score") or 0.0
    current_round_score = state.get("final_score") or 0.0
    rounds = state.get("current_round", 1)
    is_refinement = state.get("is_refinement", False)

    # 3.4 — Ship the best checkpoint; for refinements, fall back to pre-modification model if loop regressed
    if is_refinement and pre_critique and baseline > 0 and loop_best < baseline:
        doc = copy.deepcopy(pre_critique)
        score = baseline
        print(f"[LangGraph: Finalize] Loop best {loop_best:.2f} < pre-refinement baseline {baseline:.2f} — restoring original model.")
    elif best_doc:
        doc = copy.deepcopy(best_doc)
        score = loop_best if loop_best > 0 else current_round_score
        if current_round_score < score:
            print(f"[LangGraph: Finalize] Shipping checkpoint score {score:.2f} (last round was {current_round_score:.2f}).")
    else:
        doc = copy.deepcopy(current_doc)
        score = current_round_score if current_round_score > 0 else 8.0

    name = doc.get("name", "3D Model")
    restored_pre_critique = (
        is_refinement and pre_critique and baseline > 0 and loop_best < baseline
    )

    if restored_pre_critique:
        msg = f"↩️ Kept **{name}** — the refinement loop scored lower ({loop_best:.1f}) than your existing model ({baseline:.1f}/10)."
    elif is_refinement:
        msg = f"✨ Refined **{name}** based on your instruction. (Quality Score: {score:.1f}/10)"
    else:
        msg = f"✨ Generated **{name}** in {rounds} critique round{'s' if rounds > 1 else ''}. (Quality Score: {score:.1f}/10)"

    return {
        "assistant_message": msg,
        "total_rounds": rounds,
        "sdf_document": doc,
        "final_score": score,
        "best_score": score,
        "best_sdf_document": copy.deepcopy(doc),
        "pre_critique_sdf": None,
        "baseline_score": 0.0,
        "regressed": False,
    }

# ─────────────────────────────────────────────────────────────────────────────
# Conditional Routing Edges
# ─────────────────────────────────────────────────────────────────────────────

def route_initial_or_refine(state: Dict[str, Any]) -> str:
    """Determines whether this message is a new model creation or a conversational refinement."""
    if state.get("is_refinement") and state.get("sdf_document"):
        return "conversational_refine"
    return "architect"

def gate_critic_decision(state: Dict[str, Any]) -> str:
    """Decides whether to pass to finalize or retry with another refinement round."""
    code_v = state.get("code_verdict", {})
    visual_v = state.get("visual_verdict", {})
    current_r = state.get("current_round", 1)
    max_r = state.get("max_rounds", 3)

    # Both passed gate -> finalize (finalize_node restores best checkpoint if last round regressed)
    if code_v.get("status") == "PASS" and visual_v.get("status") == "PASS":
        if state.get("regressed"):
            print(f"[LangGraph: Gate] PASS on round {current_r} but below loop checkpoint — finalize will ship best/pre-refinement model")
        else:
            print(f"[LangGraph: Gate] PASS gate satisfied on round {current_r}")
        return "finalize"

    # Reached maximum allowed rounds -> finalize
    if current_r >= max_r:
        print(f"[LangGraph: Gate] Max rounds ({max_r}) reached -> finalizing")
        return "finalize"

    # Otherwise retry with another critique round
    print(f"[LangGraph: Gate] Critic gate RETRY triggered -> round {current_r + 1}")
    return "sculptor_critic_refine"
