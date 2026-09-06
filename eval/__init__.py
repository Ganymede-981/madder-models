"""
Madder Models — MLflow Driven Multimodal Evaluation Pipeline
Judge: GLM-4.6V-Flash (multimodal evaluation on prompt + SDF-DSL + rendered 3D images)
"""

from eval.dataset import BenchmarkItem, load_benchmarks, get_benchmark_by_id
from eval.renderer import render_sdf_snapshot, SDFEvaluator
from eval.judge import evaluate_with_glm_judge, JudgeEvaluation


def __getattr__(name):
    if name == "MLflowEvalPipeline":
        from eval.pipeline import MLflowEvalPipeline

        return MLflowEvalPipeline
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

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
