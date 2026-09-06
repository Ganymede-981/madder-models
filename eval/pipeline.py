import os
import sys
import json
import time
from typing import Dict, Any, List, Optional
from datetime import datetime
import mlflow
from dotenv import load_dotenv

# Ensure local imports work
ENV_PATH = os.path.join(os.path.dirname(__file__), "..", "apps", "api", ".env")
load_dotenv(dotenv_path=ENV_PATH, override=True)

from eval.renderer import render_sdf_snapshot
from eval.judge import evaluate_with_glm_judge, JudgeEvaluation
from eval.dataset import BenchmarkItem, load_benchmarks
from eval.critic_loop import run_critic_loop

DEFAULT_EXPERIMENT_NAME = "Madder-Models-SDF-Eval"

class MLflowEvalPipeline:
    """
    MLflow-driven evaluation pipeline for Madder Models SDF-DSL and rendered 3D geometry.
    Uses dual LLM-as-a-judge and VLM visual critique.
    """

    def __init__(
        self,
        experiment_name: str = DEFAULT_EXPERIMENT_NAME,
        judge_model: str = os.getenv("JUDGE_MODEL", "gemini-3.5-flash-lite"),
        generator_model: str = "qwen/qwen3.6-27b",
        artifacts_dir: Optional[str] = None,
        use_critic_loop: bool = False,
        max_rounds: int = 3,
    ):
        self.experiment_name = experiment_name
        self.judge_model = judge_model
        self.generator_model = generator_model
        self.artifacts_dir = artifacts_dir or os.path.join(os.path.dirname(__file__), "eval_artifacts")
        self.use_critic_loop = use_critic_loop
        self.max_rounds = max_rounds
        os.makedirs(self.artifacts_dir, exist_ok=True)

        # Initialize MLflow experiment
        mlflow.set_experiment(self.experiment_name)
        print(f"[MLflow] Active Experiment: '{self.experiment_name}' (Critic Loop: {self.use_critic_loop})")

    def evaluate_sample(
        self,
        prompt: str,
        sdf_document: Dict[str, Any],
        image_path: Optional[str] = None,
        category: str = "General",
        sample_id: Optional[str] = None,
        run_name: Optional[str] = None,
        generator_info: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Runs full evaluation on a single SDF sample and logs parameters, metrics, and artifacts to MLflow.
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        s_id = sample_id or f"sample_{timestamp}"
        r_name = run_name or f"{s_id}_{category.lower()}"

        print(f"\n=======================================================")
        print(f"[*] Starting MLflow Evaluation Run: '{r_name}'")
        print(f"[*] Prompt: '{prompt}'")
        print(f"[*] Judge Model: '{self.judge_model}'")
        print(f"=======================================================")

        critic_result = None
        if self.use_critic_loop:
            from groq import Groq
            groq_key = os.getenv("GROQ_API_KEY", "")
            if groq_key:
                client = Groq(api_key=groq_key)
                print(f"[*] Executing Critic Loop for '{prompt[:40]}' (max {self.max_rounds} rounds)...")
                critic_result = run_critic_loop(
                    client=client,
                    prompt=prompt,
                    initial_sdf=sdf_document,
                    max_rounds=self.max_rounds,
                    artifacts_dir=self.artifacts_dir,
                    session_prefix=s_id,
                )
                sdf_document = critic_result.final_document
                if critic_result.last_image_path and os.path.exists(critic_result.last_image_path):
                    sample_img_path = critic_result.last_image_path

        # 1. Render 3D snapshot image if not provided or updated
        if not sample_img_path or not os.path.exists(sample_img_path):
            sample_img_path = os.path.join(self.artifacts_dir, f"{s_id}_render.png")
            print(f"[*] Rendering 3D snapshot to '{sample_img_path}'...")
            render_sdf_snapshot(sdf_document, output_path=sample_img_path, width=480, height=480)

        # 2. Query Multimodal LLM Judge (GLM-4.6V-Flash / Gemini)
        print(f"[*] Invoking Multimodal Judge ({self.judge_model})...")
        judge_result: JudgeEvaluation = evaluate_with_glm_judge(
            prompt=prompt,
            sdf_document=sdf_document,
            image_path=sample_img_path,
            model_name=self.judge_model,
        )

        print(f"[OK] Judge Score: {judge_result.overall_score}/10 ({judge_result.verdict})")

        # 3. Create Artifact Files
        sdf_artifact_path = os.path.join(self.artifacts_dir, f"{s_id}_sdf.json")
        with open(sdf_artifact_path, "w", encoding="utf-8") as f:
            json.dump(sdf_document, f, indent=2)

        critique_artifact_path = os.path.join(self.artifacts_dir, f"{s_id}_critique.json")
        with open(critique_artifact_path, "w", encoding="utf-8") as f:
            json.dump(judge_result.model_dump(), f, indent=2)

        report_md_path = os.path.join(self.artifacts_dir, f"{s_id}_report.md")
        report_md_content = self._generate_markdown_report(prompt, judge_result, s_id)
        with open(report_md_path, "w", encoding="utf-8") as f:
            f.write(report_md_content)

        # 4. Log everything to MLflow
        with mlflow.start_run(run_name=r_name) as run:
            run_id = run.info.run_id

            params_to_log = {
                "sample_id": s_id,
                "prompt": prompt[:250],
                "category": category,
                "judge_model": self.judge_model,
                "generator_model": self.generator_model,
                "model_name": sdf_document.get("name", "Untitled"),
                "sdf_resolution": sdf_document.get("resolution", 72),
                "has_blueprint": bool(sdf_document.get("_blueprint")),
                "use_critic_loop": self.use_critic_loop,
                **(generator_info or {}),
            }
            if critic_result:
                params_to_log["critic_total_rounds"] = critic_result.total_rounds
                params_to_log["critic_final_score"] = critic_result.final_score
            mlflow.log_params(params_to_log)

            metrics_to_log = {
                "prompt_alignment": judge_result.prompt_alignment,
                "geometric_fidelity": judge_result.geometric_fidelity,
                "organic_quality": judge_result.organic_quality,
                "sdf_code_elegance": judge_result.sdf_code_elegance,
                "color_harmony": judge_result.color_harmony,
                "overall_score": judge_result.overall_score,
            }
            if critic_result:
                metrics_to_log["critic_final_score"] = critic_result.final_score
                metrics_to_log["critic_rounds"] = float(critic_result.total_rounds)
                for r_info in critic_result.round_scores:
                    r_num = r_info["round"]
                    metrics_to_log[f"round_{r_num}_code_score"] = float(r_info["code_score"])
                    metrics_to_log[f"round_{r_num}_visual_score"] = float(r_info["visual_score"])
                    metrics_to_log[f"round_{r_num}_composite_score"] = float(r_info["composite_score"])
            mlflow.log_metrics(metrics_to_log)

            # Artifacts (Rendered 3D Image, SDF JSON, Markdown Report, Critique JSON)
            mlflow.log_artifact(sample_img_path, artifact_path="rendered_visuals")
            mlflow.log_artifact(sdf_artifact_path, artifact_path="sdf_dsl")
            mlflow.log_artifact(critique_artifact_path, artifact_path="judge_evaluation")
            mlflow.log_artifact(report_md_path, artifact_path="judge_evaluation")

            print(f"[MLflow] Run logged successfully! Run ID: {run_id}")

        return {
            "run_id": run_id,
            "sample_id": s_id,
            "overall_score": judge_result.overall_score,
            "verdict": judge_result.verdict,
            "evaluation": judge_result.model_dump(),
            "image_path": sample_img_path,
            "report_path": report_md_path,
        }

    def evaluate_benchmark_suite(
        self,
        benchmarks: Optional[List[BenchmarkItem]] = None,
        generator_fn: Optional[Any] = None,
    ) -> List[Dict[str, Any]]:
        """
        Runs batch evaluation on the full benchmark suite or a subset of benchmarks.
        """
        suite = benchmarks or load_benchmarks()
        results = []

        print(f"\n=======================================================")
        print(f"[*] Running MLflow Benchmark Suite ({len(suite)} items)")
        print(f"=======================================================")

        for idx, item in enumerate(suite, 1):
            print(f"\n[{idx}/{len(suite)}] Benchmark Item: {item.id} ({item.category})")
            
            # Generate real SDF document using provided generator function or Groq Architect/Sculptor
            if generator_fn:
                sdf_doc = generator_fn(item.prompt)
            else:
                from eval.generator import generate_sdf_for_prompt
                sdf_doc = generate_sdf_for_prompt(item.prompt)

            res = self.evaluate_sample(
                prompt=item.prompt,
                sdf_document=sdf_doc,
                category=item.category,
                sample_id=item.id,
                run_name=f"bench_{item.id}",
            )
            results.append(res)
            time.sleep(1.5)  # Smooth rate limiting between items

        avg_score = sum(r["overall_score"] for r in results) / len(results) if results else 0.0
        print(f"\n=======================================================")
        print(f"[*] Benchmark Suite Finished! Average Score: {avg_score:.2f}/10")
        print(f"[*] View detailed metrics and visual artifacts: run `mlflow ui`")
        print(f"=======================================================\n")
        return results

    def _generate_markdown_report(self, prompt: str, eval_res: JudgeEvaluation, sample_id: str) -> str:
        strengths_str = "\n".join([f"- ✅ {s}" for s in eval_res.strengths]) or "- None noted"
        weaknesses_str = "\n".join([f"- ⚠️ {w}" for w in eval_res.weaknesses]) or "- None noted"

        return f"""# 🏛️ LLM-as-a-Judge Evaluation Report
**Sample ID:** `{sample_id}`  
**Judge Model:** `{self.judge_model}`  
**Timestamp:** `{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}`  

---

## 🎯 Target Concept
> "{prompt}"

---

## 📊 Scorecard (1 – 10)
| Metric | Score | Rating |
| :--- | :--- | :--- |
| **Prompt Alignment** | **{eval_res.prompt_alignment}/10** | Semantic parts & themes |
| **Geometric Fidelity** | **{eval_res.geometric_fidelity}/10** | Silhouette & coherence |
| **Organic Quality** | **{eval_res.organic_quality}/10** | Smooth blend vs noise trap |
| **SDF Code Elegance** | **{eval_res.sdf_code_elegance}/10** | Nesting & mathematical bounds |
| **Color Harmony** | **{eval_res.color_harmony}/10** | Painted materials & contrast |
| **🏆 Overall Quality** | **{eval_res.overall_score}/10** | **{eval_res.verdict}** |

---

## 🌟 Strengths
{strengths_str}

## ⚠️ Defects & Weaknesses
{weaknesses_str}

## 💡 Actionable Improvement Feedback
> {eval_res.actionable_feedback}
"""
