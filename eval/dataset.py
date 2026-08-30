import os
import json
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

class BenchmarkItem(BaseModel):
    id: str
    category: str
    prompt: str
    expected_features: List[str] = []

def load_benchmarks(benchmarks_path: Optional[str] = None) -> List[BenchmarkItem]:
    """Loads benchmark test items from JSON file."""
    if not benchmarks_path:
        benchmarks_path = os.path.join(os.path.dirname(__file__), "benchmarks.json")
    
    with open(benchmarks_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    return [BenchmarkItem(**item) for item in data]

def get_benchmark_by_id(bench_id: str) -> Optional[BenchmarkItem]:
    """Finds a benchmark item by ID."""
    items = load_benchmarks()
    for item in items:
        if item.id == bench_id:
            return item
    return None
