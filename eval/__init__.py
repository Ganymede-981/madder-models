"""
Madder Models — MLflow Driven Multimodal Evaluation Pipeline
Judge: GLM-4.6V-Flash (multimodal evaluation on prompt + SDF-DSL + rendered 3D images)
"""

from eval.dataset import BenchmarkItem, load_benchmarks, get_benchmark_by_id
from eval.renderer import render_sdf_snapshot, SDFEvaluator
from eval.judge import evaluate_with_glm_judge, JudgeEvaluation
from eval.pipeline import MLflowEvalPipeline

__all__ = [
    "BenchmarkItem",
    "load_benchmarks",
    "get_benchmark_by_id",
    "render_sdf_snapshot",
    "SDFEvaluator",
    "evaluate_with_glm_judge",
    "JudgeEvaluation",
    "MLflowEvalPipeline",
]
