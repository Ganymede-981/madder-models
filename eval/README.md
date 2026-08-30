# 🔬 Madder Models — MLflow Driven Multimodal Evaluation Pipeline

This evaluation pipeline automatically assesses generated **SDF-DSL 3D models** and **rendered 3D images** using **Gemini Flash Lite** as a multimodal LLM-as-a-judge, logging all runs, parameters, metrics, images, and scorecards to **MLflow**.

---

## 🏗️ Architecture

```
User Prompt ─────► SDF-DSL Model (JSON) ─────► Raymarching Renderer (PNG)
                         │                                 │
                         ▼                                 ▼
              ┌──────────────────────────────────────────────────┐
              │      Multimodal Judge (Gemini Flash Lite)        │
              └──────────────────────┬───────────────────────────┘
                                     │
                                     ▼
                ┌──────────────────────────────────────────────┐
                │             MLflow Tracking Server           │
                │  • Params: Generator, Judge, Prompt, Bounds  │
                │  • Metrics: Alignment, Fidelity, Quality... │
                │  • Artifacts: PNG Renders, JSON, Markdown    │
                └──────────────────────────────────────────────┘
```

---

## 📊 Evaluation Metrics (1 – 10 Scale)

1. **`prompt_alignment`**: Semantic accuracy against the input concept and requested parts.
2. **`geometric_fidelity`**: Silhouette clarity and structural coherence (checks against shapeless blobs).
3. **`organic_quality`**: Checks for clean organic blending vs the *"pimple / walnut noise trap"* (high-frequency `displace` abuse).
4. **`sdf_code_elegance`**: Operator hierarchy, modifier nesting (e.g. windows nested inside twists), hollow shells (`onion`) before carving.
5. **`color_harmony`**: Material separation, vibrant semantic color mapping.
6. **`overall_score`**: Weighted composite quality score and verdict (`EXCELLENT`, `GOOD`, `MEDIOCRE`, `POOR`).

---

## 🚀 Quickstart

### 1. Configuration
In `apps/api/.env`:
```env
# Multimodal Judge Model (Google Gemini API)
GEMINI_API_KEY=your_gemini_api_key_here
JUDGE_MODEL=gemini-2.0-flash-lite

# Generator Model
GROQ_API_KEY=gsk_...
GROQ_MODEL=qwen/qwen3.6-27b
```

### 2. Run Evaluations via CLI

* **Run all curated benchmark test cases**:
  ```bash
  python eval/cli.py --all
  ```

* **Run a single benchmark by ID**:
  ```bash
  python eval/cli.py --bench-id bench_01_honeycomb_house
  ```

* **Evaluate a custom prompt**:
  ```bash
  python eval/cli.py --prompt "A deep-sea glowing organism with translucent umbrella dome"
  ```

* **Evaluate existing SDF code & render image**:
  ```bash
  python eval/cli.py --prompt "..." --sdf-file path/to/model.json --image path/to/render.png
  ```

---

## 📈 View Results in MLflow UI

To open the visual tracking dashboard with interactive metrics charts, rendered 3D images, and judge feedback scorecards:

```bash
mlflow ui
```
Then navigate to **`http://localhost:5000`** in your browser.
