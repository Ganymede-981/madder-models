"""
Madder Models - HuggingFace ZeroGPU Text-to-3D Neural Generator
Deploy this file to a free Hugging Face Space with ZeroGPU enabled.
Uses OpenAI's Shap-E neural implicit diffusion model via diffusers to generate 3D meshes.
"""

import os
import io
import torch
import gradio as gr
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import spaces

# Global neural diffusion pipeline container
pipeline = None

def get_pipeline():
    global pipeline
    if pipeline is None:
        print("[*] Loading openai/shap-e pipeline from Hugging Face Hub...")
        from diffusers import ShapEPipeline
        
        dtype = torch.float16 if torch.cuda.is_available() else torch.float32
        pipeline = ShapEPipeline.from_pretrained(
            "openai/shap-e", 
            torch_dtype=dtype
        )
        if torch.cuda.is_available():
            pipeline = pipeline.to("cuda")
        print("[*] Shap-E pipeline loaded successfully onto GPU!")
    return pipeline

@spaces.GPU(duration=45)
def generate_3d_mesh(prompt: str) -> str:
    """
    Runs text-to-3D diffusion on ZeroGPU (RTX 6000 Blackwell)
    and returns the extracted 3D model as an OBJ string.
    """
    if not prompt or not prompt.strip():
        prompt = "an organic mushroom pod"
        
    print(f"\n[*] Generating 3D neural mesh for prompt: '{prompt}'...")
    pipe = get_pipeline()
    
    # Run 3D implicit diffusion
    with torch.inference_mode():
        output = pipe(
            prompt,
            num_inference_steps=64,
            frame_size=64,
            guidance_scale=15.0,
            output_type="mesh",
        )
        
    mesh = output.images[0]
    
    # Extract vertices and triangular faces
    verts = mesh.verts
    faces = mesh.faces
    
    print(f"[OK] 3D mesh extracted: {len(verts)} vertices, {len(faces)} faces")
    
    # Build standard Wavefront OBJ file
    obj_lines = [f"# Madder Models 3D Neural Generation for: {prompt}"]
    for v in verts:
        # Scale and orient correctly for viewport
        obj_lines.append(f"v {v[0]:.6f} {v[2]:.6f} {-v[1]:.6f}")
    for f in faces:
        obj_lines.append(f"f {f[0] + 1} {f[1] + 1} {f[2] + 1}")
        
    return "\n".join(obj_lines)

class GenerateRequest(BaseModel):
    prompt: str

class GenerateResponse(BaseModel):
    obj: str
    prompt: str

# Gradio Web & API Interface
def gradio_process(prompt: str):
    obj_data = generate_3d_mesh(prompt)
    temp_path = "/tmp/generated_model.obj"
    with open(temp_path, "w", encoding="utf-8") as f:
        f.write(obj_data)
    return temp_path, obj_data

with gr.Blocks(title="Madder Models | ZeroGPU 3D Studio") as demo:
    gr.Markdown("# 🔮 Madder Models — ZeroGPU Neural 3D Generator")
    gr.Markdown("Generate freeform 3D polygon meshes from text prompts using neural diffusion on Hugging Face ZeroGPU.")
    
    with gr.Row():
        with gr.Column():
            prompt_in = gr.Textbox(
                label="Prompt", 
                placeholder="A hot air balloon, an armchair, a futuristic spaceship...",
                lines=3
            )
            btn = gr.Button("Generate 3D Model", variant="primary")
        with gr.Column():
            preview_3d = gr.Model3D(label="3D Interactive Preview")
            raw_obj = gr.Textbox(label="Raw OBJ Export", visible=False)
            
    btn.click(
        fn=gradio_process, 
        inputs=[prompt_in], 
        outputs=[preview_3d, raw_obj],
        api_name="generate"
    )

app = demo.app

@app.post("/generate", response_model=GenerateResponse)
def custom_api_generate(req: GenerateRequest):
    if not req.prompt:
        raise HTTPException(status_code=400, detail="Prompt cannot be empty")
    obj_str = generate_3d_mesh(req.prompt)
    return GenerateResponse(obj=obj_str, prompt=req.prompt)

if __name__ == "__main__":
    demo.queue().launch(server_name="0.0.0.0", server_port=7860)
