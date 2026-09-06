import os
import sys
from typing import TypedDict, Annotated, Optional, Dict, Any, List
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages
from langgraph.graph import StateGraph, START, END

# Ensure imports work
API_DIR = os.path.dirname(os.path.abspath(__file__))
if API_DIR not in sys.path:
    sys.path.insert(0, API_DIR)

from memory import get_checkpointer
from nodes import (
    architect_node,
    sculptor_node,
    code_judge_node,
    renderer_node,
    vlm_critic_node,
    sculptor_critic_refine_node,
    conversational_refine_node,
    finalize_node,
    route_initial_or_refine,
    gate_critic_decision,
)

# ─────────────────────────────────────────────────────────────────────────────
# State Schema
# ─────────────────────────────────────────────────────────────────────────────

class MadderState(TypedDict, total=False):
    session_id: str
    messages: Annotated[List[BaseMessage], add_messages]
    user_prompt: str
    is_refinement: bool
    groq_api_key: Optional[str]
    max_rounds: int
    current_round: int
    blueprint: Optional[Dict[str, Any]]
    sdf_document: Optional[Dict[str, Any]]
    code_verdict: Optional[Dict[str, Any]]
    visual_verdict: Optional[Dict[str, Any]]
    rendered_image_path: Optional[str]
    rendered_views: Optional[Dict[str, str]]
    skip_render: bool
    final_score: Optional[float]
    best_score: Optional[float]
    best_sdf_document: Optional[Dict[str, Any]]
    pre_critique_sdf: Optional[Dict[str, Any]]
    baseline_score: Optional[float]
    regressed: bool
    total_rounds: int
    assistant_message: str

# ─────────────────────────────────────────────────────────────────────────────
# Graph Construction
# ─────────────────────────────────────────────────────────────────────────────

def build_graph():
    """Builds and compiles the Madder Models LangGraph state machine with memory."""
    workflow = StateGraph(MadderState)

    # Add Nodes
    workflow.add_node("architect", architect_node)
    workflow.add_node("sculptor", sculptor_node)
    workflow.add_node("code_judge", code_judge_node)
    workflow.add_node("renderer", renderer_node)
    workflow.add_node("vlm_critic", vlm_critic_node)
    workflow.add_node("sculptor_critic_refine", sculptor_critic_refine_node)
    workflow.add_node("conversational_refine", conversational_refine_node)
    workflow.add_node("finalize", finalize_node)

    # Initial routing from START
    workflow.add_conditional_edges(
        START,
        route_initial_or_refine,
        {
            "architect": "architect",
            "conversational_refine": "conversational_refine",
        }
    )

    # Generation Path
    workflow.add_edge("architect", "sculptor")
    workflow.add_edge("sculptor", "code_judge")

    # Refinement Path merges into verification
    workflow.add_edge("conversational_refine", "code_judge")

    # Verification Pipeline
    workflow.add_edge("code_judge", "renderer")
    workflow.add_edge("renderer", "vlm_critic")

    # Decision Gate: Pass to finalize or loop back to refine
    workflow.add_conditional_edges(
        "vlm_critic",
        gate_critic_decision,
        {
            "finalize": "finalize",
            "sculptor_critic_refine": "sculptor_critic_refine",
        }
    )

    # Self-refinement loop edge
    workflow.add_edge("sculptor_critic_refine", "code_judge")

    # End
    workflow.add_edge("finalize", END)

    # Compile with session memory checkpointer
    checkpointer = get_checkpointer()
    return workflow.compile(checkpointer=checkpointer)

# Singleton compiled graph
madder_graph = build_graph()
