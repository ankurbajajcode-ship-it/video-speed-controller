#!/usr/bin/env python3
"""
Generate crisp, modern icons for Video Speed Controller extension.
Uses Pillow to draw at high resolution and downsample using Lanczos filtering.
"""

import os
import math
from PIL import Image, ImageDraw, ImageFont

def create_icon(size):
    # Render at 4x resolution for super-sampled anti-aliasing
    scale = 4
    canvas_size = size * scale
    img = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Background: modern rounded rectangle with subtle gradient
    # We will simulate a vibrant gradient from deep indigo (#4338CA) to purple (#7C3AED)
    corner_radius = int(canvas_size * 0.22)
    
    # Draw background with rounded corners
    # Create mask for rounded rectangle
    mask = Image.new("L", (canvas_size, canvas_size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle(
        [(0, 0), (canvas_size - 1, canvas_size - 1)],
        radius=corner_radius,
        fill=255
    )

    # Create gradient background
    bg = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    bg_draw = ImageDraw.Draw(bg)
    for y in range(canvas_size):
        ratio = y / canvas_size
        # Interpolate between #3B82F6 (blue) -> #6366F1 (indigo) -> #8B5CF6 (purple)
        r = int(59 + (139 - 59) * ratio)
        g = int(130 + (92 - 130) * ratio)
        b = int(246 + (246 - 246) * ratio)
        bg_draw.line([(0, y), (canvas_size, y)], fill=(r, g, b, 255))

    # Apply rounded mask
    img.paste(bg, (0, 0), mask)

    # Now draw the icon symbol: Dual forward chevrons / fast-forward speed triangles
    # Triangle 1 (left chevron/triangle) and Triangle 2 (right chevron/triangle)
    draw = ImageDraw.Draw(img)
    
    # Fast-forward triangles in pure white with slight glow/shadow
    cx = canvas_size / 2.0
    cy = canvas_size / 2.0
    
    # Dimensions for the two triangles
    tri_w = canvas_size * 0.26
    tri_h = canvas_size * 0.38
    spacing = canvas_size * 0.05
    
    # Left triangle
    x1_left = cx - tri_w + spacing / 2.0 - tri_w * 0.4
    x1_right = cx - spacing / 2.0 - tri_w * 0.4 + tri_w
    t1 = [
        (x1_left, cy - tri_h / 2.0),
        (x1_right, cy),
        (x1_left, cy + tri_h / 2.0)
    ]
    
    # Right triangle
    x2_left = cx + spacing / 2.0 - tri_w * 0.4
    x2_right = cx + tri_w + spacing / 2.0 - tri_w * 0.4 + tri_w
    t2 = [
        (x2_left, cy - tri_h / 2.0),
        (x2_right, cy),
        (x2_left, cy + tri_h / 2.0)
    ]
    
    # Speed arc / tachometer gauge ring at the top/sides
    arc_box = [
        canvas_size * 0.12,
        canvas_size * 0.12,
        canvas_size * 0.88,
        canvas_size * 0.88
    ]
    draw.arc(arc_box, start=135, end=405, fill=(255, 255, 255, 60), width=max(1, int(scale * 1.5)))
    
    # Active speed arc segment (showing speed boost)
    draw.arc(arc_box, start=270, end=390, fill=(255, 255, 255, 180), width=max(1, int(scale * 2.2)))

    # Draw the triangles
    draw.polygon(t1, fill=(255, 255, 255, 255))
    draw.polygon(t2, fill=(255, 255, 255, 255))

    # Downsample to target size with Lanczos filter for maximum sharpness
    final_img = img.resize((size, size), Image.Resampling.LANCZOS)
    return final_img

def main():
    icons_dir = os.path.join(os.path.dirname(__file__), "..", "icons")
    os.makedirs(icons_dir, exist_ok=True)
    sizes = [16, 32, 48, 128]
    for size in sizes:
        icon = create_icon(size)
        path = os.path.join(icons_dir, f"icon{size}.png")
        icon.save(path, "PNG")
        print(f"Generated {path} ({size}x{size})")

if __name__ == "__main__":
    main()
