import math
import numpy as np
from PIL import Image
from typing import Dict, Any, Tuple, Optional, List

# ─────────────────────────────────────────────────────────────────────────────
# Color & Material Parsing (Full fuzzy palette matching TypeScript evaluator)
# ─────────────────────────────────────────────────────────────────────────────

COLOR_NAME_MAP = {
    "red": [0.86, 0.15, 0.15],
    "green": [0.13, 0.77, 0.36],
    "blue": [0.23, 0.51, 0.96],
    "cyan": [0.06, 0.75, 0.89],
    "gold": [0.98, 0.75, 0.14],
    "yellow": [0.95, 0.85, 0.15],
    "orange": [0.98, 0.45, 0.09],
    "pink": [0.96, 0.45, 0.71],
    "rose pink": [0.96, 0.45, 0.71],
    "purple": [0.66, 0.33, 0.97],
    "lavender": [0.75, 0.65, 0.95],
    "crimson": [0.86, 0.15, 0.15],
    "emerald": [0.06, 0.73, 0.48],
    "amber": [0.96, 0.62, 0.05],
    "sandstone": [0.85, 0.72, 0.53],
    "slate": [0.40, 0.49, 0.59],
    "slate blue": [0.35, 0.45, 0.65],
    "carbon": [0.15, 0.15, 0.18],
    "black": [0.10, 0.10, 0.12],
    "white": [0.95, 0.95, 0.98],
    "ivory": [0.96, 0.94, 0.86],
    "moss green": [0.34, 0.55, 0.22],
    "moss": [0.34, 0.55, 0.22],
    "brown": [0.55, 0.35, 0.20],
}

def parse_color(color_val: Any) -> np.ndarray:
    """Parses hex code, color names, or RGB arrays into normalized [R, G, B] floats."""
    if isinstance(color_val, str):
        clean = color_val.strip().lower()
        if clean.startswith("#"):
            hex_code = clean.lstrip("#")
            if len(hex_code) == 3:
                hex_code = "".join([c * 2 for c in hex_code])
            if len(hex_code) == 6:
                try:
                    return np.array([
                        int(hex_code[0:2], 16) / 255.0,
                        int(hex_code[2:4], 16) / 255.0,
                        int(hex_code[4:6], 16) / 255.0,
                    ], dtype=np.float32)
                except ValueError:
                    pass
        
        # Fuzzy match keyword palette
        for name, rgb in COLOR_NAME_MAP.items():
            if name in clean:
                r, g, b = rgb
                if "dark" in clean or "deep" in clean:
                    r, g, b = r * 0.6, g * 0.6, b * 0.6
                elif "light" in clean or "pale" in clean:
                    r, g, b = r * 0.6 + 0.4, g * 0.6 + 0.4, b * 0.6 + 0.4
                elif "bright" in clean or "glowing" in clean:
                    r, g, b = min(1.0, r * 1.2), min(1.0, g * 1.2), min(1.0, b * 1.2)
                return np.array([r, g, b], dtype=np.float32)

    elif isinstance(color_val, (list, tuple)) and len(color_val) >= 3:
        arr = np.array(color_val[:3], dtype=np.float32)
        if np.max(arr) > 1.0:
            arr /= 255.0
        return np.clip(arr, 0.0, 1.0)

    return np.array([0.5, 0.55, 0.95], dtype=np.float32)

# ─────────────────────────────────────────────────────────────────────────────
# 3D Math & Analytical AABB Centering
# ─────────────────────────────────────────────────────────────────────────────

def rotate_point(p: np.ndarray, angles_deg: np.ndarray) -> np.ndarray:
    """Applies Euler XYZ rotation in degrees."""
    rad = np.radians(angles_deg)
    rx, ry, rz = rad[0], rad[1], rad[2]
    
    cx, sx = math.cos(rx), math.sin(rx)
    cy, sy = math.cos(ry), math.sin(ry)
    cz, sz = math.cos(rz), math.sin(rz)
    
    x, y, z = p[..., 0], p[..., 1], p[..., 2]
    
    # Rotate X
    y1 = y * cx - z * sx
    z1 = y * sx + z * cx
    # Rotate Y
    x2 = x * cy + z1 * sy
    z2 = -x * sy + z1 * cy
    # Rotate Z
    x3 = x2 * cz - y1 * sz
    y3 = x2 * sz + y1 * cz
    
    return np.stack([x3, y3, z2], axis=-1)

def compute_tight_aabb(node: Any) -> Tuple[np.ndarray, np.ndarray]:
    """Recursively estimates tight analytical bounding box [min, max] of the SDF tree."""
    if not isinstance(node, dict):
        return np.array([-1.5, -1.5, -1.5], dtype=np.float32), np.array([1.5, 1.5, 1.5], dtype=np.float32)

    op = node.get("op", "sphere")
    
    if op == "sphere":
        r = float(node.get("radius", 1.0))
        c = np.array(node.get("center", [0, 0, 0]), dtype=np.float32)
        return c - r, c + r
    
    elif op == "box":
        s = np.array(node.get("size", [1, 1, 1]), dtype=np.float32) / 2.0
        c = np.array(node.get("center", [0, 0, 0]), dtype=np.float32)
        return c - s, c + s
    
    elif op in ("cylinder", "hexPrism"):
        r = float(node.get("radius", 0.5))
        h = float(node.get("height", 1.0)) / 2.0
        c = np.array(node.get("center", [0, 0, 0]), dtype=np.float32)
        return c - np.array([r, h, r]), c + np.array([r, h, r])
    
    elif op == "torus":
        R = float(node.get("majorRadius", 1.0))
        r = float(node.get("minorRadius", 0.25))
        c = np.array(node.get("center", [0, 0, 0]), dtype=np.float32)
        bound = R + r
        return c - np.array([bound, r, bound]), c + np.array([bound, r, bound])
    
    elif op == "capsule":
        a = np.array(node.get("a", [0, -0.5, 0]), dtype=np.float32)
        b = np.array(node.get("b", [0, 0.5, 0]), dtype=np.float32)
        r = float(node.get("radius", 0.25))
        min_p = np.minimum(a, b) - r
        max_p = np.maximum(a, b) + r
        return min_p, max_p
    
    elif op == "ellipsoid":
        radii = np.array(node.get("radii", [1.0, 1.0, 1.0]), dtype=np.float32)
        c = np.array(node.get("center", [0, 0, 0]), dtype=np.float32)
        return c - radii, c + radii
    
    elif op in ("pyramid", "cone"):
        h = float(node.get("height", 1.5))
        c = np.array(node.get("center", [0, 0, 0]), dtype=np.float32)
        base = float(node.get("radius", 1.0)) if op == "cone" else max(node.get("baseSize", [1.0, 1.0])) / 2.0
        return c - np.array([base, h/2.0, base]), c + np.array([base, h/2.0, base])

    elif op in ("union", "smoothUnion", "intersection", "smoothIntersection"):
        children = node.get("children", [])
        if not children or not isinstance(children, list):
            return np.array([-1, -1, -1], dtype=np.float32), np.array([1, 1, 1], dtype=np.float32)
        mins, maxs = [], []
        for ch in children:
            if isinstance(ch, dict):
                mn, mx = compute_tight_aabb(ch)
                mins.append(mn)
                maxs.append(mx)
        if not mins:
            return np.array([-1, -1, -1], dtype=np.float32), np.array([1, 1, 1], dtype=np.float32)
        return np.min(np.stack(mins), axis=0), np.max(np.stack(maxs), axis=0)

    elif op in ("subtraction", "smoothSubtraction"):
        a_node = node.get("a", {"op": "sphere", "radius": 1.0})
        return compute_tight_aabb(a_node)

    elif op == "transform":
        child = node.get("child", {"op": "sphere", "radius": 1.0})
        c_min, c_max = compute_tight_aabb(child)
        t = np.array(node.get("translate", [0, 0, 0]), dtype=np.float32)
        s_raw = node.get("scale", 1.0)
        s = np.array(s_raw if isinstance(s_raw, (list, tuple)) else [s_raw, s_raw, s_raw], dtype=np.float32)
        return (c_min * s) + t, (c_max * s) + t

    elif op in ("onion", "hexShellCells", "twist", "bend", "elongate", "displace", "symmetry"):
        child = node.get("child", {"op": "sphere", "radius": 1.0})
        return compute_tight_aabb(child)

    return np.array([-2.0, -2.0, -2.0], dtype=np.float32), np.array([2.0, 2.0, 2.0], dtype=np.float32)

# ─────────────────────────────────────────────────────────────────────────────
# Full Parity SDF Evaluator
# ─────────────────────────────────────────────────────────────────────────────

class FullSDFEvaluator:
    """Evaluates all Signed Distance Function primitives, deformations, and procedural modifiers."""

    def __init__(self, root_node: Dict[str, Any]):
        self.root = root_node

    def eval(self, p: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """Evaluates distance and color for point cloud p of shape (..., 3)."""
        return self._eval_node(self.root, p)

    def _eval_node(self, node: Any, p: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        if not isinstance(node, dict):
            return np.linalg.norm(p, axis=-1) - 1.0, np.array([0.5, 0.55, 0.95], dtype=np.float32)

        op = node.get("op", "sphere")
        mat_col = parse_color(node.get("material", {}).get("color", "#818cf8"))

        if op == "sphere":
            r = float(node.get("radius", 1.0))
            center = np.array(node.get("center", [0, 0, 0]), dtype=np.float32)
            d = np.linalg.norm(p - center, axis=-1) - r
            return d, np.broadcast_to(mat_col, p.shape)

        elif op == "box":
            size = np.array(node.get("size", [1, 1, 1]), dtype=np.float32) / 2.0
            center = np.array(node.get("center", [0, 0, 0]), dtype=np.float32)
            rounding = float(node.get("rounding", 0.0))
            q = np.abs(p - center) - size + rounding
            d = np.linalg.norm(np.maximum(q, 0.0), axis=-1) + np.minimum(np.max(q, axis=-1), 0.0) - rounding
            return d, np.broadcast_to(mat_col, p.shape)

        elif op == "cylinder":
            r = float(node.get("radius", 0.5))
            h = float(node.get("height", 1.0)) / 2.0
            center = np.array(node.get("center", [0, 0, 0]), dtype=np.float32)
            rounding = float(node.get("rounding", 0.0))
            cp = p - center
            d_xy = np.linalg.norm(cp[..., [0, 2]], axis=-1) - r + rounding
            d_z = np.abs(cp[..., 1]) - h + rounding
            maxD = np.maximum(np.stack([d_xy, d_z], axis=-1), 0.0)
            d = np.minimum(np.maximum(d_xy, d_z), 0.0) + np.linalg.norm(maxD, axis=-1) - rounding
            return d, np.broadcast_to(mat_col, p.shape)

        elif op == "torus":
            R = float(node.get("majorRadius", 1.0))
            r = float(node.get("minorRadius", 0.25))
            center = np.array(node.get("center", [0, 0, 0]), dtype=np.float32)
            cp = p - center
            q_x = np.linalg.norm(cp[..., [0, 2]], axis=-1) - R
            d = np.linalg.norm(np.stack([q_x, cp[..., 1]], axis=-1), axis=-1) - r
            return d, np.broadcast_to(mat_col, p.shape)

        elif op == "capsule":
            a = np.array(node.get("a", [0, -0.5, 0]), dtype=np.float32)
            b = np.array(node.get("b", [0, 0.5, 0]), dtype=np.float32)
            r = float(node.get("radius", 0.25))
            ba = b - a
            pa = p - a
            ba_len_sq = np.dot(ba, ba) + 1e-8
            h = np.clip(np.sum(pa * ba, axis=-1) / ba_len_sq, 0.0, 1.0)
            proj = a + np.expand_dims(h, axis=-1) * ba
            d = np.linalg.norm(p - proj, axis=-1) - r
            return d, np.broadcast_to(mat_col, p.shape)

        elif op == "ellipsoid":
            radii = np.array(node.get("radii", [1.0, 1.0, 1.0]), dtype=np.float32)
            center = np.array(node.get("center", [0, 0, 0]), dtype=np.float32)
            cp = (p - center) / radii
            k0 = np.linalg.norm(cp, axis=-1)
            k1 = np.linalg.norm(cp / radii, axis=-1) + 1e-8
            d = k0 * (k0 - 1.0) / k1
            return d, np.broadcast_to(mat_col, p.shape)

        elif op == "cone":
            r = float(node.get("radius", 1.0))
            h = float(node.get("height", 1.5))
            center = np.array(node.get("center", [0, 0, 0]), dtype=np.float32)
            cp = p - center
            q = np.linalg.norm(cp[..., [0, 2]], axis=-1)
            length = math.sqrt(r * r + h * h)
            sinA = r / length
            cosA = h / length
            k = sinA / cosA
            cb0 = q - k * np.clip(q / k, 0.0, h)
            cb1 = cp[..., 1] - np.clip(cp[..., 1], -h / 2.0, h / 2.0)
            d = np.sqrt(cb0 * cb0 + cb1 * cb1) * np.sign(cp[..., 1])
            return d, np.broadcast_to(mat_col, p.shape)

        elif op == "hexPrism":
            r = float(node.get("radius", 1.0))
            h = float(node.get("height", 1.0))
            center = np.array(node.get("center", [0, 0, 0]), dtype=np.float32)
            cp = p - center
            kx = -0.8660254
            ky = 0.5
            px = np.abs(cp[..., 0])
            py = np.abs(cp[..., 2])
            dot = 2.0 * np.minimum(kx * px + ky * py, 0.0)
            px = px - dot * kx
            py = py - dot * ky
            dX = np.maximum(px - r, py * 0.8660254 - r * 0.5)
            dY = np.abs(cp[..., 1]) - h / 2.0
            max0 = np.maximum(np.stack([dX, dY], axis=-1), 0.0)
            d = np.minimum(np.maximum(dX, dY), 0.0) + np.linalg.norm(max0, axis=-1)
            return d, np.broadcast_to(mat_col, p.shape)

        elif op == "pyramid":
            h = float(node.get("height", 1.5))
            base = node.get("baseSize", [1.5, 1.5])
            center = np.array(node.get("center", [0, 0, 0]), dtype=np.float32)
            cp = p - center
            px = np.abs(cp[..., 0]) - base[0] * 0.5
            pz = np.abs(cp[..., 2]) - base[1] * 0.5
            py = cp[..., 1]
            d = np.maximum(np.maximum(px, pz) + py * (base[0] / (2.0 * h)), -py)
            return d, np.broadcast_to(mat_col, p.shape)

        # ── Combiners ────────────────────────────────────────────────────────
        elif op == "smoothUnion":
            k = float(node.get("k", 0.35))
            children = node.get("children", [])
            if not children:
                return np.zeros(p.shape[:-1]), np.broadcast_to(mat_col, p.shape)
            
            d_acc, col_acc = self._eval_node(children[0], p)
            for ch in children[1:]:
                d_next, col_next = self._eval_node(ch, p)
                h = np.clip(0.5 + 0.5 * (d_next - d_acc) / max(k, 1e-4), 0.0, 1.0)
                d_acc = d_next * (1.0 - h) + d_acc * h - k * h * (1.0 - h)
                
                # Nearest surface color assignment (no color bleeding)
                is_next_closer = (d_next < d_acc)[..., None]
                col_acc = np.where(is_next_closer, col_next, col_acc)
            return d_acc, col_acc

        elif op == "union":
            children = node.get("children", [])
            if not children:
                return np.zeros(p.shape[:-1]), np.broadcast_to(mat_col, p.shape)
            d_acc, col_acc = self._eval_node(children[0], p)
            for ch in children[1:]:
                d_next, col_next = self._eval_node(ch, p)
                is_closer = (d_next < d_acc)[..., None]
                d_acc = np.minimum(d_acc, d_next)
                col_acc = np.where(is_closer, col_next, col_acc)
            return d_acc, col_acc

        elif op in ("subtraction", "smoothSubtraction"):
            k = float(node.get("k", 0.25)) if op == "smoothSubtraction" else 0.0
            a_node = node.get("a", {"op": "sphere", "radius": 1.0})
            b_node = node.get("b", {"op": "sphere", "radius": 0.5})
            da, col_a = self._eval_node(a_node, p)
            db, col_b = self._eval_node(b_node, p)
            if k > 0:
                h = np.clip(0.5 - 0.5 * (da + db) / max(k, 1e-4), 0.0, 1.0)
                d = da * (1.0 - h) - db * h + k * h * (1.0 - h)
            else:
                d = np.maximum(da, -db)
            return d, col_a

        elif op in ("intersection", "smoothIntersection"):
            k = float(node.get("k", 0.25)) if op == "smoothIntersection" else 0.0
            children = node.get("children", [])
            if not children:
                return np.zeros(p.shape[:-1]), np.broadcast_to(mat_col, p.shape)
            d_acc, col_acc = self._eval_node(children[0], p)
            for ch in children[1:]:
                d_next, col_next = self._eval_node(ch, p)
                if k > 0:
                    h = np.clip(0.5 - 0.5 * (d_next - d_acc) / max(k, 1e-4), 0.0, 1.0)
                    d_acc = d_next * (1.0 - h) + d_acc * h + k * h * (1.0 - h)
                else:
                    d_acc = np.maximum(d_acc, d_next)
            return d_acc, col_acc

        # ── Modifiers & Deformations ─────────────────────────────────────────
        elif op == "transform":
            tp = p.copy()
            if "translate" in node:
                tp = tp - np.array(node["translate"], dtype=np.float32)
            if "rotate" in node and np.any(np.array(node["rotate"]) != 0):
                tp = rotate_point(tp, -np.array(node["rotate"], dtype=np.float32))
            
            scale_mult = 1.0
            if "scale" in node:
                s_val = node["scale"]
                if isinstance(s_val, (int, float)):
                    tp = tp / s_val
                    scale_mult = float(s_val)
                elif isinstance(s_val, (list, tuple)) and len(s_val) >= 3:
                    s_arr = np.array(s_val[:3], dtype=np.float32)
                    tp = tp / s_arr
                    scale_mult = float(np.min(s_arr))
            
            child = node.get("child", {"op": "sphere", "radius": 1.0})
            d, col = self._eval_node(child, tp)
            return d * scale_mult, col

        elif op == "twist":
            strength = float(node.get("strength", 0.5))
            c = np.cos(strength * p[..., 1])
            s = np.sin(strength * p[..., 1])
            tp_x = c * p[..., 0] - s * p[..., 2]
            tp_z = s * p[..., 0] + c * p[..., 2]
            tp = np.stack([tp_x, p[..., 1], tp_z], axis=-1)
            child = node.get("child", {"op": "sphere", "radius": 1.0})
            return self._eval_node(child, tp)

        elif op == "bend":
            strength = float(node.get("strength", 0.5))
            c = np.cos(strength * p[..., 0])
            s = np.sin(strength * p[..., 0])
            tp_x = c * p[..., 0] - s * p[..., 1]
            tp_y = s * p[..., 0] + c * p[..., 1]
            tp = np.stack([tp_x, tp_y, p[..., 2]], axis=-1)
            child = node.get("child", {"op": "sphere", "radius": 1.0})
            return self._eval_node(child, tp)

        elif op == "elongate":
            s = np.array(node.get("size", [0.5, 0.5, 0.5]), dtype=np.float32) / 2.0
            q = p - np.clip(p, -s, s)
            child = node.get("child", {"op": "sphere", "radius": 1.0})
            return self._eval_node(child, q)

        elif op == "symmetry":
            axes = node.get("axes", ["x"])
            sp = p.copy()
            if "x" in axes:
                sp[..., 0] = np.abs(sp[..., 0])
            if "y" in axes:
                sp[..., 1] = np.abs(sp[..., 1])
            if "z" in axes:
                sp[..., 2] = np.abs(sp[..., 2])
            child = node.get("child", {"op": "sphere", "radius": 1.0})
            return self._eval_node(child, sp)

        elif op == "radialRepeat":
            count = int(node.get("count", 4))
            sector = (2.0 * math.pi) / count
            angle = np.arctan2(p[..., 2], p[..., 0])
            radius = np.linalg.norm(p[..., [0, 2]], axis=-1)
            angle = ((angle % sector) + sector) % sector - sector * 0.5
            rp = np.stack([radius * np.cos(angle), p[..., 1], radius * np.sin(angle)], axis=-1)
            child = node.get("child", {"op": "sphere", "radius": 1.0})
            return self._eval_node(child, rp)

        elif op == "repeatLimited":
            period = np.array(node.get("period", [1.0, 1.0, 1.0]), dtype=np.float32)
            limit = np.array(node.get("limit", [2, 2, 2]), dtype=np.float32)
            q = p - period * np.clip(np.round(p / period), -limit, limit)
            child = node.get("child", {"op": "sphere", "radius": 1.0})
            return self._eval_node(child, q)

        elif op == "onion":
            thickness = float(node.get("thickness", 0.1))
            child = node.get("child", {"op": "sphere", "radius": 1.0})
            d, col = self._eval_node(child, p)
            return np.abs(d) - thickness, col

        elif op == "hexShellCells":
            shell_th = float(node.get("shellThickness", 0.1))
            cell_size = float(node.get("cellSize", 0.3))
            cell_depth = float(node.get("cellDepth", 0.15))
            child = node.get("child", {"op": "sphere", "radius": 1.0})
            raw_d, col = self._eval_node(child, p)
            shell = np.abs(raw_d) - shell_th

            # Hex lattice in local XZ plane
            hx = cell_size * math.sqrt(3.0)
            hz = cell_size * 1.5
            lx = ((p[..., 0] % hx) + hx) % hx - hx / 2.0
            lz = ((p[..., 2] % hz) + hz) % hz - hz / 2.0
            qlx = np.abs(lx)
            qlz = np.abs(lz)
            hex_dist = np.maximum(qlx * 0.866025 + qlz * 0.5 - cell_size * 0.866025, qlz - cell_size)
            surface_prox = np.abs(raw_d)
            cell_sdf = np.where(
                surface_prox < (shell_th + cell_depth),
                np.maximum(hex_dist, -(cell_depth - surface_prox)),
                1000.0
            )
            d = np.maximum(shell, -cell_sdf)
            return d, col

        elif op == "displace":
            amp = float(node.get("amplitude", 0.05))
            freq = float(node.get("frequency", 3.0))
            child = node.get("child", {"op": "sphere", "radius": 1.0})
            d, col = self._eval_node(child, p)
            disp = np.sin(p[..., 0] * freq) * np.sin(p[..., 1] * freq) * np.sin(p[..., 2] * freq) * amp
            return d + disp, col

        # Fallback default sphere
        return np.linalg.norm(p, axis=-1) - 1.0, np.broadcast_to(mat_col, p.shape)

# Backward compatibility alias
SDFEvaluator = FullSDFEvaluator

# ─────────────────────────────────────────────────────────────────────────────
# High-Resolution Raymarching Snapshot Renderer with Dynamic Auto-Centering
# ─────────────────────────────────────────────────────────────────────────────

def render_sdf_snapshot(
    doc_or_node: Dict[str, Any],
    output_path: str = "snapshot.png",
    width: int = 512,
    height: int = 512,
    camera_pos: Optional[Tuple[float, float, float]] = None,
    target: Optional[Tuple[float, float, float]] = None,
) -> str:
    """
    Renders a studio-quality shaded 3D snapshot of any SDF-DSL document with
    automatic AABB bounds detection, dynamic framing, and full operator support.
    """
    if isinstance(doc_or_node, str):
        import json_repair
        try:
            doc_or_node = json_repair.loads(doc_or_node)
        except Exception:
            doc_or_node = {"op": "sphere", "radius": 1.0}

    root = doc_or_node.get("root", doc_or_node) if isinstance(doc_or_node, dict) else {"op": "sphere", "radius": 1.0}
    if isinstance(root, str):
        import json_repair
        try:
            root = json_repair.loads(root)
        except Exception:
            root = {"op": "sphere", "radius": 1.0}

    evaluator = FullSDFEvaluator(root)

    # 1. Compute tight bounding box and dynamic camera framing
    aabb_min, aabb_max = compute_tight_aabb(root)
    center = (aabb_min + aabb_max) * 0.5
    size = aabb_max - aabb_min
    model_radius = float(max(np.linalg.norm(size) * 0.5, 1.2))

    tgt_p = np.array(target if target is not None else center, dtype=np.float32)
    if camera_pos is not None:
        cam_p = np.array(camera_pos, dtype=np.float32)
    else:
        # Dynamic isometric studio perspective (elevated 45-degree angle)
        cam_offset = np.array([1.55 * model_radius, 1.15 * model_radius, 1.85 * model_radius], dtype=np.float32)
        cam_p = tgt_p + cam_offset

    # 2. Camera coordinate frame
    forward = tgt_p - cam_p
    dist_to_target = float(np.linalg.norm(forward))
    forward /= dist_to_target
    right = np.cross(forward, np.array([0, 1, 0], dtype=np.float32))
    norm_r = np.linalg.norm(right)
    if norm_r < 1e-4:
        right = np.array([1, 0, 0], dtype=np.float32)
    else:
        right /= norm_r
    up = np.cross(right, forward)

    # 3. Ray Directions
    u = np.linspace(-1.0, 1.0, width, dtype=np.float32)
    v = np.linspace(1.0, -1.0, height, dtype=np.float32)
    uu, vv = np.meshgrid(u, v)
    
    fov_mult = 0.52
    ray_dirs = forward[None, None, :] + (uu[:, :, None] * right[None, None, :] * fov_mult) + (vv[:, :, None] * up[None, None, :] * fov_mult)
    ray_dirs /= np.linalg.norm(ray_dirs, axis=-1, keepdims=True)

    # 4. Adaptive Sphere Tracing (84 steps)
    t_min = max(0.1, dist_to_target - model_radius * 2.2)
    max_dist = dist_to_target + model_radius * 2.5
    t = np.full((height, width), t_min, dtype=np.float32)
    hit_mask = np.zeros((height, width), dtype=bool)

    hit_threshold = max(0.003, model_radius * 0.002)

    for _ in range(84):
        pts = cam_p + ray_dirs * t[:, :, None]
        d, _ = evaluator.eval(pts)
        hit = d < hit_threshold
        hit_mask |= hit
        t += np.where(~hit_mask, np.clip(d * 0.95, hit_threshold, 0.35 * model_radius), 0.0)
        if np.all(hit_mask | (t > max_dist)):
            break

    # 5. Surface Shading with Studio Lighting
    hit_pixels = hit_mask & (t < max_dist)
    img_rgb = np.zeros((height, width, 3), dtype=np.float32)
    
    # Dark studio background gradient
    bg_gradient = 0.035 + 0.05 * (vv + 1.0) * 0.5
    img_rgb[:, :, 0] = bg_gradient * 0.8
    img_rgb[:, :, 1] = bg_gradient * 0.9
    img_rgb[:, :, 2] = bg_gradient * 1.35

    if np.any(hit_pixels):
        hit_pts = cam_p + ray_dirs[hit_pixels] * t[hit_pixels, None]
        _, colors = evaluator.eval(hit_pts)

        # Central difference normal calculation with adaptive epsilon
        eps = max(0.002, model_radius * 0.0015)
        d_center, _ = evaluator.eval(hit_pts)
        dx, _ = evaluator.eval(hit_pts + np.array([eps, 0, 0], dtype=np.float32))
        dy, _ = evaluator.eval(hit_pts + np.array([0, eps, 0], dtype=np.float32))
        dz, _ = evaluator.eval(hit_pts + np.array([0, 0, eps], dtype=np.float32))
        normals = np.stack([dx - d_center, dy - d_center, dz - d_center], axis=-1)
        normals /= (np.linalg.norm(normals, axis=-1, keepdims=True) + 1e-6)

        # Lighting Rigs: Key Light (warm front-top) + Fill Light (cool left) + Rim Light (bright cyan back)
        light_key = np.array([0.55, 0.85, 0.45], dtype=np.float32)
        light_key /= np.linalg.norm(light_key)
        
        light_fill = np.array([-0.7, 0.3, -0.65], dtype=np.float32)
        light_fill /= np.linalg.norm(light_fill)

        light_rim = np.array([0.0, -0.6, -1.0], dtype=np.float32)
        light_rim /= np.linalg.norm(light_rim)

        diff_key = np.clip(np.sum(normals * light_key, axis=-1), 0.0, 1.0)
        diff_fill = np.clip(np.sum(normals * light_fill, axis=-1), 0.0, 1.0) * 0.4
        diff_rim = np.clip(np.sum(normals * light_rim, axis=-1), 0.0, 1.0) * 0.25
        ambient = 0.28

        view_dirs = -ray_dirs[hit_pixels]
        half_vec = light_key + view_dirs
        half_vec /= np.linalg.norm(half_vec, axis=-1, keepdims=True)
        spec = np.power(np.clip(np.sum(normals * half_vec, axis=-1), 0.0, 1.0), 24.0) * 0.35

        illum = ambient + diff_key * 0.72 + diff_fill + diff_rim
        shaded_col = colors * illum[:, None] + spec[:, None]
        img_rgb[hit_pixels] = np.clip(shaded_col, 0.0, 1.0)

    # 6. Save as PNG
    img_uint8 = (img_rgb * 255).astype(np.uint8)
    image = Image.fromarray(img_uint8)
    image.save(output_path, "PNG")
    return output_path
