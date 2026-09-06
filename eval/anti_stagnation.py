import json
import copy
from typing import Dict, Any, Tuple

def _is_sdf_identical_or_degenerate(
    current_sdf: Dict[str, Any],
    candidate_sdf: Dict[str, Any],
) -> Tuple[bool, str]:
    """Checks whether the candidate SDF is structurally identical to current or degenerate."""
    if not candidate_sdf or not isinstance(candidate_sdf, dict):
        return True, "Candidate SDF is empty or invalid"
    curr_root = current_sdf.get("root", {})
    cand_root = candidate_sdf.get("root", {})
    if not cand_root or not isinstance(cand_root, dict):
        return True, "Candidate root node is missing or non-dict"
    curr_str = json.dumps(curr_root, sort_keys=True)
    cand_str = json.dumps(cand_root, sort_keys=True)
    if curr_str == cand_str:
        return True, "Candidate geometry root is byte-identical to previous round"
    if cand_root.get("op") == "sphere" and len(cand_root.keys()) <= 3 and len(curr_str) > 200:
        return True, "Candidate collapsed to fallback single sphere"
    return False, ""

def _apply_safe_mutation(sdf_doc: Dict[str, Any]) -> Dict[str, Any]:
    """Applies a gentle geometric mutation to ensure geometry moves if the LLM repeated itself."""
    mutated = copy.deepcopy(sdf_doc)
    root = mutated.get("root", {})
    mutated_flag = [False]

    def _walk(node: Any):
        if mutated_flag[0]:
            return
        if isinstance(node, dict):
            for key in ["k", "radius", "height", "amplitude", "thickness", "rounding"]:
                if key in node and isinstance(node[key], (int, float)):
                    orig = float(node[key])
                    node[key] = round(orig * 1.08 if orig != 0 else 0.15, 3)
                    mutated_flag[0] = True
                    return
            if "size" in node and isinstance(node["size"], list) and len(node["size"]) >= 3:
                node["size"][1] = round(float(node["size"][1]) * 1.08, 3)
                mutated_flag[0] = True
                return
            for v in node.values():
                _walk(v)
        elif isinstance(node, list):
            for item in node:
                _walk(item)

    _walk(root)
    return mutated
