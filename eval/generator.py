import os
import sys
import json
from typing import Dict, Any, Optional
from dotenv import load_dotenv

# Ensure apps/api/.env is loaded
ENV_PATH = os.path.join(os.path.dirname(__file__), "..", "apps", "api", ".env")
load_dotenv(dotenv_path=ENV_PATH, override=True)

# Add apps/api to path so we can reuse Architect & Sculptor functions
API_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "apps", "api"))
if API_DIR not in sys.path:
    sys.path.insert(0, API_DIR)

from main import plan_scene_blueprint, synthesize_scene_sdf

def generate_sdf_for_prompt(prompt: str, api_key: Optional[str] = None) -> Dict[str, Any]:
    """
    Generates a full 3D SDF-DSL model using the Architect & Sculptor pipeline (Groq).
    """
    groq_key = api_key or os.getenv("GROQ_API_KEY", "")
    if not groq_key:
        raise ValueError("GROQ_API_KEY is missing in apps/api/.env. Cannot generate real SDF model.")

    from groq import Groq
    client = Groq(api_key=groq_key)

    # 1. Stage 1: Architect decomposes the prompt into semantic parts
    blueprint = plan_scene_blueprint(client, prompt)

    # 2. Stage 2: Sculptor synthesizes the full SDF tree
    sdf_doc = synthesize_scene_sdf(client, blueprint, prompt)
    sdf_doc["_blueprint"] = blueprint
    return sdf_doc
