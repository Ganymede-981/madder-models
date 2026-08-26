# 🔮 Madder Models: Organic AI-Native 3D Studio

Madder Models is a modern AI-native 3D modeling environment designed for generating **vivid, organic, and abstract 3D geometries** from natural language prompts, and refining them freely without the rigid boxiness of traditional CAD software.

---

## 💡 Why the Pivot from Traditional CAD to SDF-DSL?

Traditional CAD tools (such as OpenSCAD or CSG engines) rely on hard-edge booleans (`union`, `difference`) over rigid primitives (`box`, `cylinder`). When an LLM tries to generate creative models (like a *"honeycomb organic house"* or a *"coral reef sculpture"*), it gets boxed into placing rigid cubes or manually computing complex triangle meshes.

### The Solution: Two Modes, One Soul

1. **Generate Mode (Shap-E Neural Diffusion)**:
   - Uses OpenAI's **Shap-E** model running on free **Hugging Face ZeroGPU** (RTX 6000 Blackwell) to generate freeform, unstructured 3D implicit fields and convert them directly into polygon meshes.
2. **Refine Mode (SDF-DSL in Browser)**:
   - Uses a clean, declarative **Signed Distance Function Domain-Specific Language (SDF-DSL)**.
   - The LLM emits a validated JSON tree of math nodes (`smoothUnion`, `smoothSubtraction`, `hexPrism`, `twist`, `displace`, `onion`).
   - The browser evaluates the signed distance field over a 3D grid and extracts high-resolution smooth geometry in real time using the **Marching Cubes** algorithm.
   - **`smin` (Smooth Minimum)** allows geometries to organically melt together without seams, like sculpted clay.

---

## 🏗️ Architecture

```
User Natural Language Prompt
         │
         ▼
┌────────────────────────────────────────────────────────┐
│                      MADDER MODELS                     │
├──────────────────────────┬─────────────────────────────┤
│   GENERATE MODE          │   REFINE MODE               │
│   (Shap-E via ZeroGPU)   │   (Groq + Browser SDF-DSL)  │
│                          │                             │
│   Text → 3D Mesh (OBJ)   │   LLM emits SDF JSON tree   │
│                          │   → Fast Marching Cubes     │
└────────────┬─────────────┴──────────────┬──────────────┘
             │                            │
             └─────────────┬──────────────┘
                           ▼
              ┌─────────────────────────┐
              │   Interactive 3D Canvas │
              │   (Materials, Wireframe)│
              └────────────┬────────────┘
                           ▼
               Export: STL (3D Print) / OBJ / GLTF
```

---

## 🚀 Quickstart

### 1. Run the Web Studio

```bash
# Install dependencies
npm install

# Start Vite Web App
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### 2. Configure Free Groq API Key
1. Get a free API key at [console.groq.com/keys](https://console.groq.com/keys).
2. In the web app, click **Set Groq Key** in the top right.
3. Paste your key. Refine Mode is now live and generates organic 3D mesh updates in <150ms!

### 3. (Optional) Python Backend & HF ZeroGPU Space

To run the local FastAPI server:

```bash
cd apps/api
pip install -r requirements.txt
python main.py
```

To deploy your own free ZeroGPU Shap-E generator:
1. Create a new Space on [Hugging Face](https://huggingface.co/spaces) with **ZeroGPU** accelerator.
2. Upload `apps/api/hf_space_app.py` as `app.py` with `diffusers`, `torch`, `spaces`, `gradio`, and `fastapi` in `requirements.txt`.
3. Put your Space URL into the Madder Models Settings dialog!

---

## 📦 Supported SDF-DSL Nodes

| Operator | Type | Parameters | Description |
|---|---|---|---|
| `sphere` | Primitive | `radius`, `center` | Smooth sphere |
| `box` | Primitive | `size`, `center`, `rounding` | Box with optional rounded edges |
| `cylinder` | Primitive | `radius`, `height`, `center`, `rounding` | Capped cylinder with rounding |
| `torus` | Primitive | `majorRadius`, `minorRadius`, `center` | Torus ring |
| `capsule` | Primitive | `a`, `b`, `radius` | Line-segment rounded capsule |
| `cone` | Primitive | `radius`, `height`, `center` | Capped cone |
| `hexPrism` | Primitive | `radius`, `height`, `center`, `rounding` | Hexagonal prism (honeycomb cells) |
| `smoothUnion` | Combinator | `children[]`, `k` | Organic smooth blending (`smin`) |
| `smoothSubtraction` | Combinator | `a`, `b`, `k` | Smooth cavity carving |
| `repeatLimited` | Domain | `period`, `limit`, `child` | Finite organic array replication |
| `twist` | Domain | `strength`, `child` | Non-linear 3D domain twist |
| `bend` | Domain | `strength`, `child` | Curved domain bend |
| `displace` | Domain | `amplitude`, `frequency`, `child` | Organic surface ripple/noise |
| `onion` | Domain | `thickness`, `child` | Hollow shell wall carving |
| `transform` | Transform | `translate`, `rotate`, `scale`, `child` | Spatial transformation |

---

## 📄 License
MIT
