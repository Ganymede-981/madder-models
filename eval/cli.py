import os
import sys
import json
import argparse
from typing import Optional
from dotenv import load_dotenv

# Load env variables from apps/api/.env
ENV_PATH = os.path.join(os.path.dirname(__file__), "..", "apps", "api", ".env")
load_dotenv(dotenv_path=ENV_PATH, override=True)

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from eval.pipeline import MLflowEvalPipeline
from eval.dataset import load_benchmarks, get_benchmark_by_id

def parse_args():
    parser = argparse.ArgumentParser(
        description="Madder Models — MLflow Driven Evaluation Pipeline with GLM-4.6V-Flash Multimodal Judge",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Run evaluation on all curated benchmark items.",
    )
    parser.add_argument(
        "--bench-id",
        type=str,
        default=None,
        help="Run a specific benchmark item by ID (e.g. bench_01_honeycomb_house).",
    )
    parser.add_argument(
        "--prompt",
        type=str,
        default=None,
        help="Custom prompt string to generate & evaluate.",
    )
    parser.add_argument(
        "--image",
        type=str,
        default=None,
        help="Path to an existing rendered snapshot image (PNG/JPG). If omitted, renderer auto-renders the SDF.",
    )
    parser.add_argument(
        "--sdf-file",
        type=str,
        default=None,
        help="Path to an existing SDF-DSL JSON file to evaluate.",
    )
    parser.add_argument(
        "--judge-model",
        type=str,
        default=os.getenv("JUDGE_MODEL", "gemini-3.5-flash-lite"),
        help="Multimodal LLM judge model name (default: gemini-3.5-flash-lite).",
    )
    parser.add_argument(
        "--experiment",
        type=str,
        default="Madder-Models-SDF-Eval",
        help="MLflow experiment name (default: Madder-Models-SDF-Eval).",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List all available benchmark dataset prompts.",
    )
    return parser.parse_args()

def main():
    args = parse_args()

    if args.list:
        benchmarks = load_benchmarks()
        print("\n=== Curated Evaluation Benchmarks ===")
        for b in benchmarks:
            print(f"• [{b.id}] ({b.category})")
            print(f"  Prompt: \"{b.prompt}\"")
            print(f"  Features: {', '.join(b.expected_features)}\n")
        return

    pipeline = MLflowEvalPipeline(
        experiment_name=args.experiment,
        judge_model=args.judge_model,
    )

    # 1. Run all benchmarks
    if args.all:
        print(f"[*] Starting full benchmark evaluation suite...")
        pipeline.evaluate_benchmark_suite()
        print("\n🚀 To view interactive metrics, scorecard tables, and image artifacts in MLflow UI:")
        print("   Run: mlflow ui\n")
        return

    # 2. Run specific benchmark by ID
    if args.bench_id:
        bench = get_benchmark_by_id(args.bench_id)
        if not bench:
            print(f"[ERROR] Benchmark ID '{args.bench_id}' not found. Use --list to see IDs.")
            sys.exit(1)
        
        from eval.generator import generate_sdf_for_prompt
        print(f"[*] Generating real 3D model with Groq ({args.bench_id})...")
        sdf_doc = generate_sdf_for_prompt(bench.prompt)

        res = pipeline.evaluate_sample(
            prompt=bench.prompt,
            sdf_document=sdf_doc,
            category=bench.category,
            sample_id=bench.id,
        )
        print(f"\n[Result] Overall Score: {res['overall_score']}/10 ({res['verdict']})")
        print(f"[Artifact] Report saved: {res['report_path']}")
        return

    # 3. Custom prompt / SDF evaluation
    if args.prompt:
        sdf_doc = None
        if args.sdf_file and os.path.exists(args.sdf_file):
            with open(args.sdf_file, "r", encoding="utf-8") as f:
                sdf_doc = json.load(f)
        else:
            from eval.generator import generate_sdf_for_prompt
            print(f"[*] Generating real 3D model with Groq for custom prompt...")
            sdf_doc = generate_sdf_for_prompt(args.prompt)

        res = pipeline.evaluate_sample(
            prompt=args.prompt,
            sdf_document=sdf_doc,
            image_path=args.image,
            category="Custom",
        )
        print(f"\n[Result] Overall Score: {res['overall_score']}/10 ({res['verdict']})")
        print(f"[Artifact] Report saved: {res['report_path']}")
        return

    # Default if no arguments
    print("No evaluation target specified. Running single sample test...")
    pipeline.evaluate_benchmark_suite(benchmarks=load_benchmarks()[:1])
    print("\n🚀 To view results in MLflow UI, run:\n   mlflow ui\n")

if __name__ == "__main__":
    main()
