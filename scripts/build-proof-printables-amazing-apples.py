#!/usr/bin/env python3
"""Generate Toddler Amazing Apples picture-card pack (US Letter PDF + page PNGs + activity images)."""

from __future__ import annotations

import math
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.colors import Color, HexColor, white, black
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "docs/teaching-kit/qa/next-10-gold-upgrade/proof/amazing-apples"
PDF_PATH = OUT_DIR / "Amazing-Apples-Picture-Card-Pack.pdf"
PAGES_DIR = OUT_DIR / "pages"
IMAGES_DIR = OUT_DIR / "images"

PAGE_W, PAGE_H = letter  # 612 x 792
BRAND = "Little Learner Hub by Leah"
SITE = "littlelearnershubbyleah.com"
PACK_TITLE = "Amazing Apples Picture Card Pack"
# Customer-ready footer (no DRAFT watermark). Resource stays draft in catalog until owner publishes.
OWNER_NOTE = ""

CREAM = HexColor("#FCFBF7")
INK = HexColor("#2F3A33")
MUTED = HexColor("#5A6B5D")
CUT = HexColor("#6B8F71")
LINE = HexColor("#3D4A40")

RED = HexColor("#C23B2F")
RED_DARK = HexColor("#8E2A22")
GREEN_APPLE = HexColor("#5FA04A")
GREEN_DARK = HexColor("#3F7033")
YELLOW = HexColor("#E2B83A")
YELLOW_DARK = HexColor("#B08A1E")
LEAF = HexColor("#4F8F3E")
LEAF_DARK = HexColor("#2F5C28")
STEM = HexColor("#5C4030")
SEED = HexColor("#6B4423")
SEED_DARK = HexColor("#3E2814")
TRUNK = HexColor("#7A5230")
CANOPY = HexColor("#4E8A3D")
CANOPY_DARK = HexColor("#35652B")
BASKET = HexColor("#C4A06A")
BASKET_DARK = HexColor("#8B6B3D")
FLESH = HexColor("#F5E6C8")
HIGHLIGHT = HexColor("#FFF6E8")


def ensure_dirs() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    PAGES_DIR.mkdir(parents=True, exist_ok=True)
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)


def draw_page_chrome(c: canvas.Canvas, page_num: int, total: int, subtitle: str = "") -> None:
    """Header branding + footer with page number and draft watermark."""
    c.setFillColor(CREAM)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(0.55 * inch, PAGE_H - 0.42 * inch, BRAND)
    c.setFont("Helvetica", 9)
    c.setFillColor(MUTED)
    c.drawRightString(PAGE_W - 0.55 * inch, PAGE_H - 0.42 * inch, SITE)

    c.setStrokeColor(HexColor("#D7E0D8"))
    c.setLineWidth(0.8)
    c.line(0.55 * inch, PAGE_H - 0.52 * inch, PAGE_W - 0.55 * inch, PAGE_H - 0.52 * inch)

    if subtitle:
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 8)
        c.drawCentredString(PAGE_W / 2, PAGE_H - 0.68 * inch, subtitle)

    # Footer
    c.setStrokeColor(HexColor("#D7E0D8"))
    c.line(0.55 * inch, 0.48 * inch, PAGE_W - 0.55 * inch, 0.48 * inch)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 8)
    c.drawString(0.55 * inch, 0.28 * inch, f"{PACK_TITLE}")
    c.drawRightString(PAGE_W - 0.55 * inch, 0.28 * inch, f"Page {page_num} of {total}")
    if OWNER_NOTE:
        c.setFont("Helvetica-Oblique", 7)
        c.setFillColor(HexColor("#9AA89B"))
        c.drawString(0.55 * inch, 0.14 * inch, OWNER_NOTE)


def dashed_rect(c: canvas.Canvas, x: float, y: float, w: float, h: float, radius: float = 10) -> None:
    c.saveState()
    c.setStrokeColor(CUT)
    c.setLineWidth(1.6)
    c.setDash(5, 4)
    c.setFillColor(CREAM)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=1)
    c.restoreState()
    # Inner soft guide
    c.saveState()
    c.setStrokeColor(HexColor("#E4EBE4"))
    c.setLineWidth(0.6)
    c.setDash()
    c.roundRect(x + 4, y + 4, w - 8, h - 8, radius - 2, fill=0, stroke=1)
    c.restoreState()


def card_label(c: canvas.Canvas, cx: float, y: float, title: str, hint: str = "") -> None:
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(cx, y, title)
    if hint:
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 9)
        c.drawCentredString(cx, y - 14, hint)


# ---------------------------------------------------------------------------
# Unique apple illustrations (each deliberately different composition)
# ---------------------------------------------------------------------------

def _stem_and_leaf_classic(c: canvas.Canvas, cx: float, top: float, leaf_side: str = "right") -> None:
    c.setStrokeColor(STEM)
    c.setFillColor(STEM)
    c.setLineWidth(2.2)
    c.line(cx, top, cx, top + 14)
    # leaf
    c.setFillColor(LEAF)
    c.setStrokeColor(LEAF_DARK)
    c.setLineWidth(1)
    path = c.beginPath()
    if leaf_side == "right":
        path.moveTo(cx + 1, top + 10)
        path.curveTo(cx + 18, top + 22, cx + 22, top + 4, cx + 8, top + 2)
        path.curveTo(cx + 14, top + 10, cx + 6, top + 12, cx + 1, top + 10)
    else:
        path.moveTo(cx - 1, top + 10)
        path.curveTo(cx - 18, top + 22, cx - 22, top + 4, cx - 8, top + 2)
        path.curveTo(cx - 14, top + 10, cx - 6, top + 12, cx - 1, top + 10)
    c.drawPath(path, fill=1, stroke=1)
    c.setStrokeColor(LEAF_DARK)
    c.setLineWidth(0.8)
    if leaf_side == "right":
        c.line(cx + 2, top + 9, cx + 14, top + 12)
    else:
        c.line(cx - 2, top + 9, cx - 14, top + 12)


def draw_red_apple(c: canvas.Canvas, cx: float, cy: float, scale: float = 1.0) -> None:
    """Round red apple, right leaf, bright left highlight — classic orchard look."""
    s = scale
    # body (slightly taller oval via two ellipses stacked look)
    c.setFillColor(RED)
    c.setStrokeColor(RED_DARK)
    c.setLineWidth(1.8 * s)
    c.ellipse(cx - 48 * s, cy - 42 * s, cx + 48 * s, cy + 40 * s, fill=1, stroke=1)
    # top cleft
    c.setStrokeColor(RED_DARK)
    c.setLineWidth(1.4 * s)
    c.line(cx - 4 * s, cy + 34 * s, cx, cy + 28 * s)
    c.line(cx + 4 * s, cy + 34 * s, cx, cy + 28 * s)
    # highlight
    c.setFillColor(HIGHLIGHT)
    c.setStrokeColor(HIGHLIGHT)
    c.ellipse(cx - 28 * s, cy + 2 * s, cx - 10 * s, cy + 22 * s, fill=1, stroke=0)
    # blush
    c.setFillColor(Color(0.95, 0.45, 0.35, alpha=0.35))
    c.circle(cx + 18 * s, cy - 8 * s, 14 * s, fill=1, stroke=0)
    _stem_and_leaf_classic(c, cx, cy + 38 * s, "right")
    # tiny shadow under
    c.setFillColor(Color(0.2, 0.25, 0.2, alpha=0.12))
    c.ellipse(cx - 36 * s, cy - 52 * s, cx + 36 * s, cy - 44 * s, fill=1, stroke=0)


def draw_green_apple(c: canvas.Canvas, cx: float, cy: float, scale: float = 1.0) -> None:
    """Slightly taller green apple, left leaf, speckles — Granny Smith style."""
    s = scale
    c.setFillColor(GREEN_APPLE)
    c.setStrokeColor(GREEN_DARK)
    c.setLineWidth(1.8 * s)
    # taller form
    c.ellipse(cx - 42 * s, cy - 48 * s, cx + 42 * s, cy + 44 * s, fill=1, stroke=1)
    # dimple
    c.setStrokeColor(GREEN_DARK)
    c.setLineWidth(1.2 * s)
    path = c.beginPath()
    path.moveTo(cx - 10 * s, cy + 36 * s)
    path.curveTo(cx - 2 * s, cy + 28 * s, cx + 2 * s, cy + 28 * s, cx + 10 * s, cy + 36 * s)
    c.drawPath(path, fill=0, stroke=1)
    # highlight streak
    c.setFillColor(HexColor("#C8E6B8"))
    c.ellipse(cx + 8 * s, cy - 6 * s, cx + 26 * s, cy + 24 * s, fill=1, stroke=0)
    # speckles for grayscale legibility
    c.setFillColor(GREEN_DARK)
    for dx, dy in [(-18, 8), (-8, -12), (12, -20), (-22, -22), (4, 16)]:
        c.circle(cx + dx * s, cy + dy * s, 1.6 * s, fill=1, stroke=0)
    _stem_and_leaf_classic(c, cx, cy + 42 * s, "left")
    c.setFillColor(Color(0.2, 0.25, 0.2, alpha=0.12))
    c.ellipse(cx - 32 * s, cy - 58 * s, cx + 32 * s, cy - 50 * s, fill=1, stroke=0)


def draw_yellow_apple(c: canvas.Canvas, cx: float, cy: float, scale: float = 1.0) -> None:
    """Wide golden apple, twin leaves, cheek blush — Golden Delicious style."""
    s = scale
    c.setFillColor(YELLOW)
    c.setStrokeColor(YELLOW_DARK)
    c.setLineWidth(1.8 * s)
    c.ellipse(cx - 52 * s, cy - 40 * s, cx + 52 * s, cy + 38 * s, fill=1, stroke=1)
    # top notch
    c.setFillColor(HexColor("#D4A82E"))
    c.ellipse(cx - 8 * s, cy + 28 * s, cx + 8 * s, cy + 38 * s, fill=1, stroke=0)
    # highlight crescent
    c.setFillColor(HexColor("#FFF3C0"))
    c.ellipse(cx - 34 * s, cy - 4 * s, cx - 12 * s, cy + 20 * s, fill=1, stroke=0)
    # pinkish cheek (still readable in gray as darker wedge)
    c.setFillColor(HexColor("#E8A050"))
    c.ellipse(cx + 16 * s, cy - 18 * s, cx + 38 * s, cy + 4 * s, fill=1, stroke=0)
    # stem
    c.setStrokeColor(STEM)
    c.setLineWidth(2.2 * s)
    c.line(cx, cy + 36 * s, cx + 2 * s, cy + 50 * s)
    # twin leaves
    for side, ang in [("left", 1), ("right", -1)]:
        c.setFillColor(LEAF)
        c.setStrokeColor(LEAF_DARK)
        c.setLineWidth(1)
        path = c.beginPath()
        ox = cx + (4 * ang) * s
        oy = cy + 46 * s
        path.moveTo(ox, oy)
        path.curveTo(ox + 16 * ang * s, oy + 14 * s, ox + 20 * ang * s, oy - 4 * s, ox + 6 * ang * s, oy - 8 * s)
        path.curveTo(ox + 12 * ang * s, oy + 2 * s, ox + 2 * ang * s, oy + 4 * s, ox, oy)
        c.drawPath(path, fill=1, stroke=1)
    c.setFillColor(Color(0.2, 0.25, 0.2, alpha=0.12))
    c.ellipse(cx - 40 * s, cy - 50 * s, cx + 40 * s, cy - 42 * s, fill=1, stroke=0)


def draw_whole_apple(c: canvas.Canvas, cx: float, cy: float, scale: float = 1.0) -> None:
    """Three-quarter view whole apple (red-green blend) with calyx marks at bottom."""
    s = scale
    # main body — tilted feel via offset highlight
    c.setFillColor(HexColor("#B8483A"))
    c.setStrokeColor(HexColor("#7A2E24"))
    c.setLineWidth(1.8 * s)
    c.ellipse(cx - 46 * s, cy - 44 * s, cx + 50 * s, cy + 40 * s, fill=1, stroke=1)
    # green shoulder
    c.setFillColor(HexColor("#6BA052"))
    path = c.beginPath()
    path.moveTo(cx - 30 * s, cy + 20 * s)
    path.curveTo(cx - 10 * s, cy + 44 * s, cx + 30 * s, cy + 42 * s, cx + 40 * s, cy + 10 * s)
    path.curveTo(cx + 20 * s, cy + 28 * s, cx - 10 * s, cy + 30 * s, cx - 30 * s, cy + 20 * s)
    c.drawPath(path, fill=1, stroke=0)
    # highlight
    c.setFillColor(HIGHLIGHT)
    c.ellipse(cx - 24 * s, cy + 4 * s, cx - 6 * s, cy + 24 * s, fill=1, stroke=0)
    # bottom calyx (flower end) — unique vs other apples
    c.setStrokeColor(HexColor("#7A2E24"))
    c.setLineWidth(1.1 * s)
    for a in range(-2, 3):
        c.line(cx + a * 4 * s, cy - 36 * s, cx, cy - 28 * s)
    c.setFillColor(HexColor("#8E4A30"))
    c.circle(cx, cy - 30 * s, 3 * s, fill=1, stroke=0)
    # stem angled
    c.setStrokeColor(STEM)
    c.setLineWidth(2.4 * s)
    c.line(cx - 2 * s, cy + 38 * s, cx - 10 * s, cy + 54 * s)
    c.setFillColor(LEAF)
    c.setStrokeColor(LEAF_DARK)
    path = c.beginPath()
    path.moveTo(cx - 8 * s, cy + 50 * s)
    path.curveTo(cx + 10 * s, cy + 62 * s, cx + 18 * s, cy + 40 * s, cx + 2 * s, cy + 42 * s)
    path.curveTo(cx + 8 * s, cy + 50 * s, cx - 2 * s, cy + 52 * s, cx - 8 * s, cy + 50 * s)
    c.drawPath(path, fill=1, stroke=1)
    c.setStrokeColor(LEAF_DARK)
    c.setLineWidth(0.7 * s)
    c.line(cx - 4 * s, cy + 48 * s, cx + 8 * s, cy + 52 * s)


def draw_half_apple(c: canvas.Canvas, cx: float, cy: float, scale: float = 1.0) -> None:
    """Cross-section half apple with seed cavity and seeds."""
    s = scale
    # outer skin arc (left half)
    c.setFillColor(RED)
    c.setStrokeColor(RED_DARK)
    c.setLineWidth(1.8 * s)
    # full ellipse then cover right with cream? Better: path for half
    path = c.beginPath()
    path.moveTo(cx, cy + 46 * s)
    path.curveTo(cx - 60 * s, cy + 46 * s, cx - 60 * s, cy - 46 * s, cx, cy - 46 * s)
    path.lineTo(cx, cy + 46 * s)
    c.drawPath(path, fill=1, stroke=1)
    # flesh
    c.setFillColor(FLESH)
    c.setStrokeColor(HexColor("#D4C4A0"))
    path = c.beginPath()
    path.moveTo(cx - 2 * s, cy + 42 * s)
    path.curveTo(cx - 52 * s, cy + 40 * s, cx - 52 * s, cy - 40 * s, cx - 2 * s, cy - 42 * s)
    path.lineTo(cx - 2 * s, cy + 42 * s)
    c.drawPath(path, fill=1, stroke=1)
    # cut face edge
    c.setStrokeColor(RED_DARK)
    c.setLineWidth(2 * s)
    c.line(cx, cy + 46 * s, cx, cy - 46 * s)
    # seed cavity (star/oval)
    c.setFillColor(HexColor("#E8D4A8"))
    c.setStrokeColor(HexColor("#C4A878"))
    c.setLineWidth(1 * s)
    c.ellipse(cx - 28 * s, cy - 16 * s, cx - 4 * s, cy + 16 * s, fill=1, stroke=1)
    # core lines
    c.setStrokeColor(HexColor("#B89868"))
    c.setLineWidth(0.8 * s)
    c.line(cx - 16 * s, cy + 14 * s, cx - 16 * s, cy - 14 * s)
    # seeds
    c.setFillColor(SEED)
    c.setStrokeColor(SEED_DARK)
    for dx, dy, rot in [(-22, 4, 20), (-14, -2, -15), (-20, -8, 35)]:
        c.saveState()
        c.translate(cx + dx * s, cy + dy * s)
        c.rotate(rot)
        c.ellipse(-4 * s, -2.2 * s, 4 * s, 2.2 * s, fill=1, stroke=1)
        c.restoreState()
    # stem stub on top
    c.setStrokeColor(STEM)
    c.setLineWidth(2 * s)
    c.line(cx - 4 * s, cy + 44 * s, cx - 4 * s, cy + 56 * s)
    c.setFillColor(LEAF)
    c.ellipse(cx - 2 * s, cy + 52 * s, cx + 14 * s, cy + 62 * s, fill=1, stroke=0)


def draw_apple_seed(c: canvas.Canvas, cx: float, cy: float, scale: float = 1.0) -> None:
    """Large oval brown seed with highlight and tip."""
    s = scale
    c.setFillColor(SEED)
    c.setStrokeColor(SEED_DARK)
    c.setLineWidth(2 * s)
    # teardrop-ish oval
    path = c.beginPath()
    path.moveTo(cx, cy + 38 * s)
    path.curveTo(cx + 28 * s, cy + 28 * s, cx + 32 * s, cy - 20 * s, cx, cy - 40 * s)
    path.curveTo(cx - 32 * s, cy - 20 * s, cx - 28 * s, cy + 28 * s, cx, cy + 38 * s)
    c.drawPath(path, fill=1, stroke=1)
    # tip darker
    c.setFillColor(SEED_DARK)
    path = c.beginPath()
    path.moveTo(cx, cy + 38 * s)
    path.curveTo(cx + 10 * s, cy + 30 * s, cx + 8 * s, cy + 18 * s, cx, cy + 16 * s)
    path.curveTo(cx - 8 * s, cy + 18 * s, cx - 10 * s, cy + 30 * s, cx, cy + 38 * s)
    c.drawPath(path, fill=1, stroke=0)
    # highlight
    c.setFillColor(HexColor("#A87850"))
    c.ellipse(cx - 16 * s, cy - 8 * s, cx - 4 * s, cy + 16 * s, fill=1, stroke=0)
    # seam line
    c.setStrokeColor(SEED_DARK)
    c.setLineWidth(1 * s)
    c.setDash(2, 2)
    c.line(cx, cy + 30 * s, cx, cy - 32 * s)
    c.setDash()
    # label cue under
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 8)
    c.drawCentredString(cx, cy - 55 * s, "brown · oval · pointy tip")


def draw_apple_leaf(c: canvas.Canvas, cx: float, cy: float, scale: float = 1.0) -> None:
    """Standalone leaf with center vein and side veins."""
    s = scale
    c.setFillColor(LEAF)
    c.setStrokeColor(LEAF_DARK)
    c.setLineWidth(1.6 * s)
    path = c.beginPath()
    path.moveTo(cx - 50 * s, cy - 8 * s)  # stem end
    path.curveTo(cx - 20 * s, cy + 40 * s, cx + 30 * s, cy + 36 * s, cx + 48 * s, cy + 4 * s)
    path.curveTo(cx + 30 * s, cy - 36 * s, cx - 20 * s, cy - 40 * s, cx - 50 * s, cy - 8 * s)
    c.drawPath(path, fill=1, stroke=1)
    # stem
    c.setStrokeColor(STEM)
    c.setLineWidth(2.2 * s)
    c.line(cx - 50 * s, cy - 8 * s, cx - 68 * s, cy - 14 * s)
    # center vein
    c.setStrokeColor(LEAF_DARK)
    c.setLineWidth(1.4 * s)
    c.line(cx - 48 * s, cy - 8 * s, cx + 42 * s, cy + 2 * s)
    # side veins
    c.setLineWidth(0.9 * s)
    for t, up in [(0.25, 1), (0.4, -1), (0.55, 1), (0.7, -1), (0.82, 1)]:
        bx = cx - 48 * s + t * 90 * s
        by = cy - 8 * s + t * 10 * s
        c.line(bx, by, bx + 6 * s, by + 16 * up * s)
    # slight lighter patch
    c.setFillColor(HexColor("#7CB86A"))
    c.ellipse(cx - 10 * s, cy + 4 * s, cx + 18 * s, cy + 22 * s, fill=1, stroke=0)


def draw_apple_tree(c: canvas.Canvas, cx: float, cy: float, scale: float = 1.0) -> None:
    """Tree with trunk, layered canopy, and hanging apples."""
    s = scale
    # ground
    c.setFillColor(HexColor("#D9E8C8"))
    c.setStrokeColor(HexColor("#A8C090"))
    c.ellipse(cx - 70 * s, cy - 58 * s, cx + 70 * s, cy - 42 * s, fill=1, stroke=1)
    # trunk
    c.setFillColor(TRUNK)
    c.setStrokeColor(HexColor("#5A3A20"))
    c.setLineWidth(1.2 * s)
    path = c.beginPath()
    path.moveTo(cx - 12 * s, cy - 48 * s)
    path.lineTo(cx - 8 * s, cy + 10 * s)
    path.lineTo(cx + 8 * s, cy + 10 * s)
    path.lineTo(cx + 14 * s, cy - 48 * s)
    path.close()
    c.drawPath(path, fill=1, stroke=1)
    # bark lines
    c.setStrokeColor(HexColor("#5A3A20"))
    c.setLineWidth(0.7 * s)
    c.line(cx - 2 * s, cy - 40 * s, cx - 2 * s, cy)
    c.line(cx + 4 * s, cy - 30 * s, cx + 4 * s, cy - 5 * s)
    # canopy layers
    for (ox, oy, r, col) in [
        (-28, 28, 34, CANOPY_DARK),
        (28, 26, 32, CANOPY_DARK),
        (0, 40, 38, CANOPY),
        (-18, 18, 26, HexColor("#6BA552")),
        (16, 16, 24, HexColor("#5C9A45")),
    ]:
        c.setFillColor(col)
        c.setStrokeColor(CANOPY_DARK)
        c.setLineWidth(1 * s)
        c.circle(cx + ox * s, cy + oy * s, r * s, fill=1, stroke=1)
    # apples on tree
    for ax, ay, col in [(-22, 22, RED), (18, 30, RED), (0, 12, GREEN_APPLE), (28, 10, YELLOW), (-30, 8, RED)]:
        c.setFillColor(col)
        c.setStrokeColor(LINE)
        c.setLineWidth(0.7 * s)
        c.circle(cx + ax * s, cy + ay * s, 7 * s, fill=1, stroke=1)
        c.setFillColor(STEM)
        c.rect(cx + ax * s - 0.8 * s, cy + ay * s + 6 * s, 1.6 * s, 4 * s, fill=1, stroke=0)


def draw_apple_basket(c: canvas.Canvas, cx: float, cy: float, scale: float = 1.0) -> None:
    """Woven basket filled with mixed apples."""
    s = scale
    # basket body
    c.setFillColor(BASKET)
    c.setStrokeColor(BASKET_DARK)
    c.setLineWidth(1.6 * s)
    path = c.beginPath()
    path.moveTo(cx - 55 * s, cy + 8 * s)
    path.lineTo(cx - 42 * s, cy - 42 * s)
    path.curveTo(cx - 20 * s, cy - 52 * s, cx + 20 * s, cy - 52 * s, cx + 42 * s, cy - 42 * s)
    path.lineTo(cx + 55 * s, cy + 8 * s)
    path.curveTo(cx + 20 * s, cy + 18 * s, cx - 20 * s, cy + 18 * s, cx - 55 * s, cy + 8 * s)
    c.drawPath(path, fill=1, stroke=1)
    # weave horizontal
    c.setStrokeColor(BASKET_DARK)
    c.setLineWidth(0.9 * s)
    for i, yy in enumerate([-8, -18, -28, -36]):
        y = cy + yy * s
        # approximate width at height
        t = (yy + 8) / (-42 - 8) if False else abs(yy) / 50
        half = 52 * s - abs(yy) * 0.3 * s
        c.line(cx - half, y, cx + half, y)
    # weave vertical dashes
    for xoff in range(-40, 45, 10):
        c.setDash(3, 2)
        c.line(cx + xoff * s, cy + 6 * s, cx + xoff * 0.75 * s, cy - 42 * s)
    c.setDash()
    # rim
    c.setFillColor(HexColor("#D4B078"))
    c.setStrokeColor(BASKET_DARK)
    c.ellipse(cx - 58 * s, cy + 2 * s, cx + 58 * s, cy + 18 * s, fill=1, stroke=1)
    # handle
    c.setStrokeColor(BASKET_DARK)
    c.setLineWidth(2.4 * s)
    c.setFillColor(Color(1, 1, 1, alpha=0))
    path = c.beginPath()
    path.moveTo(cx - 40 * s, cy + 12 * s)
    path.curveTo(cx - 30 * s, cy + 70 * s, cx + 30 * s, cy + 70 * s, cx + 40 * s, cy + 12 * s)
    c.drawPath(path, fill=0, stroke=1)
    # apples in basket — unique pile arrangement
    apples = [
        (-18, 28, RED, 14),
        (10, 30, GREEN_APPLE, 13),
        (28, 18, YELLOW, 12),
        (-32, 16, RED, 11),
        (0, 16, HexColor("#B8483A"), 12),
        (18, 12, RED, 10),
    ]
    for ax, ay, col, r in apples:
        c.setFillColor(col)
        c.setStrokeColor(LINE)
        c.setLineWidth(0.8 * s)
        c.circle(cx + ax * s, cy + ay * s, r * s, fill=1, stroke=1)
        c.setFillColor(HIGHLIGHT)
        c.circle(cx + (ax - 4) * s, cy + (ay + 4) * s, 3 * s, fill=1, stroke=0)
        c.setFillColor(STEM)
        c.rect(cx + ax * s - 0.7 * s, cy + ay * s + r * s - 1 * s, 1.4 * s, 5 * s, fill=1, stroke=0)


def draw_growth_panel(
    c: canvas.Canvas, x: float, y: float, w: float, h: float, stage: str
) -> None:
    """One small panel in the growth sequence."""
    c.setFillColor(HexColor("#F7F9F4"))
    c.setStrokeColor(CUT)
    c.setLineWidth(1)
    c.roundRect(x, y, w, h, 6, fill=1, stroke=1)
    cx = x + w / 2
    cy = y + h / 2 + 6
    label_y = y + 8

    if stage == "seed":
        c.setFillColor(SEED)
        c.setStrokeColor(SEED_DARK)
        c.ellipse(cx - 14, cy - 8, cx + 14, cy + 10, fill=1, stroke=1)
        c.setFillColor(HexColor("#C4A078"))
        c.ellipse(cx - 8, cy - 2, cx - 2, cy + 6, fill=1, stroke=0)
        title = "1 · Seed"
    elif stage == "sprout":
        # soil
        c.setFillColor(HexColor("#8B6914"))
        c.ellipse(cx - 28, cy - 18, cx + 28, cy - 6, fill=1, stroke=0)
        c.setFillColor(SEED)
        c.ellipse(cx - 8, cy - 14, cx + 8, cy - 4, fill=1, stroke=0)
        c.setStrokeColor(LEAF)
        c.setLineWidth(2)
        c.line(cx, cy - 8, cx, cy + 16)
        c.setFillColor(LEAF)
        path = c.beginPath()
        path.moveTo(cx, cy + 12)
        path.curveTo(cx + 14, cy + 20, cx + 12, cy + 4, cx + 2, cy + 8)
        c.drawPath(path, fill=1, stroke=0)
        path = c.beginPath()
        path.moveTo(cx, cy + 8)
        path.curveTo(cx - 12, cy + 16, cx - 10, cy + 2, cx - 2, cy + 6)
        c.drawPath(path, fill=1, stroke=0)
        title = "2 · Sprout"
    elif stage == "sapling":
        c.setFillColor(HexColor("#D9E8C8"))
        c.ellipse(cx - 30, cy - 22, cx + 30, cy - 10, fill=1, stroke=0)
        c.setFillColor(TRUNK)
        c.rect(cx - 4, cy - 18, 8, 28, fill=1, stroke=0)
        c.setFillColor(CANOPY)
        c.setStrokeColor(CANOPY_DARK)
        c.circle(cx, cy + 18, 18, fill=1, stroke=1)
        c.circle(cx - 12, cy + 10, 12, fill=1, stroke=1)
        c.circle(cx + 12, cy + 10, 12, fill=1, stroke=1)
        title = "3 · Sapling"
    else:  # tree
        c.setFillColor(HexColor("#D9E8C8"))
        c.ellipse(cx - 32, cy - 24, cx + 32, cy - 12, fill=1, stroke=0)
        c.setFillColor(TRUNK)
        path = c.beginPath()
        path.moveTo(cx - 7, cy - 20)
        path.lineTo(cx - 5, cy + 8)
        path.lineTo(cx + 5, cy + 8)
        path.lineTo(cx + 8, cy - 20)
        path.close()
        c.drawPath(path, fill=1, stroke=0)
        c.setFillColor(CANOPY)
        c.circle(cx, cy + 22, 20, fill=1, stroke=0)
        c.circle(cx - 14, cy + 12, 14, fill=1, stroke=0)
        c.circle(cx + 14, cy + 14, 14, fill=1, stroke=0)
        for ax, ay, col in [(-10, 20, RED), (8, 24, YELLOW), (12, 10, RED)]:
            c.setFillColor(col)
            c.circle(cx + ax, cy + ay, 4.5, fill=1, stroke=0)
        title = "4 · Tree"

    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 8)
    c.drawCentredString(cx, label_y, title)


def draw_growth_sequence(c: canvas.Canvas, cx: float, cy: float, scale: float = 1.0) -> None:
    """Four-panel growth: seed → sprout → sapling → tree."""
    total_w = 220 * scale
    total_h = 100 * scale
    x0 = cx - total_w / 2
    y0 = cy - total_h / 2
    gap = 6 * scale
    pw = (total_w - 3 * gap) / 4
    stages = ["seed", "sprout", "sapling", "tree"]
    for i, stage in enumerate(stages):
        draw_growth_panel(c, x0 + i * (pw + gap), y0, pw, total_h, stage)
    # arrows between
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 10)
    for i in range(3):
        ax = x0 + (i + 1) * (pw + gap) - gap / 2
        c.drawCentredString(ax, cy, "→")


# ---------------------------------------------------------------------------
# Pages
# ---------------------------------------------------------------------------

def teacher_page(c: canvas.Canvas, page_num: int, total: int) -> None:
    draw_page_chrome(c, page_num, total)
    top = PAGE_H - 0.9 * inch

    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 22)
    c.drawCentredString(PAGE_W / 2, top, "Toddler Amazing Apples")
    c.setFont("Helvetica-Bold", 14)
    c.setFillColor(MUTED)
    c.drawCentredString(PAGE_W / 2, top - 22, "Picture Card Pack · Teacher Instructions")

    y = top - 55
    left = 0.7 * inch
    width = PAGE_W - 1.4 * inch

    sections = [
        (
            "Purpose",
            "These large picture cards help toddlers notice apple colors, parts, and the "
            "simple growth story from seed to tree. Use them for naming, matching, sorting, "
            "and short circle-time talks during the Amazing Apples unit.",
        ),
        (
            "How activities use the cards",
            "• Color hunt: hold up Red / Green / Yellow and invite toddlers to find matching toys or real apples.\n"
            "• Parts talk: Whole apple → Half apple → Seed → Leaf to build vocabulary.\n"
            "• Life-cycle line: lay the growth sequence (or Seedling / Sapling cards) left to right on a tray.\n"
            "• Basket sort: place color cards near a basket and sort toy apples by color.\n"
            "• Stamp & measure stations: keep cards nearby as visual cues while children paint or measure.",
        ),
        (
            "Laminating (optional)",
            "Laminate for longer classroom life, or slip into clear pouches. Unlaminated cards are fine "
            "for a single unit week. Corner-round after cutting if toddlers will handle them often.",
        ),
        (
            "Age notes",
            "Best for toddlers (about 18–36 months) with an adult. Keep sessions short (3–8 minutes). "
            "Supervise any real-apple tasting separately from card play. Cards are not toys for mouthing.",
        ),
        (
            "Cut guidance",
            "Cut on the dashed lines. Each page has two large cards (except the growth sequence card). "
            "Leave a small margin outside the dashes if possible. Store in an envelope labeled Amazing Apples.",
        ),
    ]

    for title, body in sections:
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 12)
        c.drawString(left, y, title)
        y -= 16
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 9.5)
        # simple wrap
        for para in body.split("\n"):
            words = para.split()
            line = ""
            for w in words:
                test = (line + " " + w).strip()
                if c.stringWidth(test, "Helvetica", 9.5) > width:
                    c.drawString(left, y, line)
                    y -= 13
                    line = w
                else:
                    line = test
            if line:
                c.drawString(left, y, line)
                y -= 13
        y -= 10

    # mini legend of cards
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(left, y, "Cards in this pack")
    y -= 14
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 9)
    cards = (
        "Red apple · Green apple · Yellow apple · Whole apple · Apple cut in half · "
        "Apple seed · Apple leaf · Apple tree · Apple basket · Growth sequence "
        "(seed → sprout → sapling → tree)"
    )
    words = cards.split()
    line = ""
    for w in words:
        test = (line + " " + w).strip()
        if c.stringWidth(test, "Helvetica", 9) > width:
            c.drawString(left, y, line)
            y -= 12
            line = w
        else:
            line = test
    if line:
        c.drawString(left, y, line)

    c.showPage()


def two_card_page(
    c: canvas.Canvas,
    page_num: int,
    total: int,
    card_a: tuple,
    card_b: tuple,
) -> None:
    """card tuple: (title, hint, draw_fn)"""
    draw_page_chrome(c, page_num, total, "Cut on dashed lines · Large toddler cards")

    margin_x = 0.55 * inch
    gap = 0.28 * inch
    card_w = PAGE_W - 2 * margin_x
    usable_top = PAGE_H - 0.85 * inch
    usable_bot = 0.65 * inch
    usable_h = usable_top - usable_bot
    card_h = (usable_h - gap) / 2

    cards = [card_a, card_b]
    for i, (title, hint, draw_fn) in enumerate(cards):
        y = usable_bot + (1 - i) * (card_h + gap)
        dashed_rect(c, margin_x, y, card_w, card_h, radius=12)
        # illustration area center
        illu_cx = margin_x + card_w / 2
        illu_cy = y + card_h * 0.55
        draw_fn(c, illu_cx, illu_cy, scale=1.15 if title != "Apple growth sequence" else 1.0)
        card_label(c, illu_cx, y + 28, title, hint)

    c.showPage()


def build_pdf() -> int:
    ensure_dirs()
    c = canvas.Canvas(str(PDF_PATH), pagesize=letter)
    c.setTitle(PACK_TITLE)
    c.setAuthor(BRAND)

    cards = [
        ("Red apple", "Color card · say “red apple”", draw_red_apple),
        ("Green apple", "Color card · say “green apple”", draw_green_apple),
        ("Yellow apple", "Color card · say “yellow apple”", draw_yellow_apple),
        ("Whole apple", "Parts talk · before we cut", draw_whole_apple),
        ("Apple cut in half", "See the seeds inside", draw_half_apple),
        ("Apple seed", "Tiny · brown · oval", draw_apple_seed),
        ("Apple leaf", "Find the vein", draw_apple_leaf),
        ("Apple tree", "Trunk · leaves · apples", draw_apple_tree),
        ("Apple basket", "Full of apples", draw_apple_basket),
        ("Apple growth sequence", "Seed → sprout → sapling → tree", draw_growth_sequence),
    ]

    # 1 teacher + 5 card pages (2 cards each)
    total_pages = 1 + (len(cards) + 1) // 2

    teacher_page(c, 1, total_pages)
    page = 2
    for i in range(0, len(cards), 2):
        a = cards[i]
        b = cards[i + 1] if i + 1 < len(cards) else ("", "", lambda *a, **k: None)
        if i + 1 < len(cards):
            two_card_page(c, page, total_pages, a, b)
        else:
            # single card page — shouldn't happen with 10 cards
            two_card_page(c, page, total_pages, a, a)
        page += 1

    c.save()
    return total_pages


# ---------------------------------------------------------------------------
# Companion activity images (PIL)
# ---------------------------------------------------------------------------

def _font(size: int):
    for name in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
    ):
        p = Path(name)
        if p.exists():
            return ImageFont.truetype(str(p), size)
    return ImageFont.load_default()


def _brand_corner(draw: ImageDraw.ImageDraw, w: int, h: int) -> None:
    font = _font(14)
    text = BRAND
    draw.text((10, h - 22), text, fill=(90, 107, 93), font=font)


def make_stamp_painting_example() -> None:
    """Finished toddler apple stamp art on paper."""
    w, h = 800, 600
    img = Image.new("RGB", (w, h), (252, 250, 244))
    d = ImageDraw.Draw(img)
    # paper sheet
    d.rectangle([80, 40, 720, 520], fill=(255, 255, 255), outline=(180, 190, 182), width=2)
    # tape corners
    for tx, ty in [(90, 50), (680, 50), (90, 490), (680, 490)]:
        d.rectangle([tx, ty, tx + 30, ty + 18], fill=(230, 220, 180))

    def stamp_apple(cx, cy, color, angle_deg=0, size=55):
        # simple stamped apple: circle body + leaf blob + stem
        r = size
        d.ellipse([cx - r, cy - r + 4, cx + r, cy + r - 4], fill=color, outline=(60, 70, 60))
        # stem
        d.line([(cx, cy - r + 6), (cx, cy - r - 12)], fill=(80, 55, 40), width=3)
        # leaf
        d.ellipse([cx + 4, cy - r - 18, cx + 28, cy - r + 2], fill=(90, 150, 80), outline=(50, 90, 50))
        # paint smear / imprint texture
        for i in range(6):
            ox = int(math.cos(i) * (r - 10))
            oy = int(math.sin(i * 1.7) * (r - 14))
            d.ellipse([cx + ox - 4, cy + oy - 3, cx + ox + 4, cy + oy + 3], fill=color)

    # scattered toddler stamps
    stamp_apple(220, 200, (200, 70, 60), size=60)
    stamp_apple(380, 260, (90, 160, 75), size=50)
    stamp_apple(540, 190, (220, 180, 60), size=55)
    stamp_apple(300, 380, (200, 70, 60), size=45)
    stamp_apple(480, 360, (90, 160, 75), size=48)
    # paint tray cue
    d.ellipse([120, 430, 200, 480], fill=(200, 70, 60), outline=(100, 40, 30))
    d.ellipse([210, 430, 290, 480], fill=(90, 160, 75), outline=(40, 80, 40))
    d.rounded_rectangle([100, 500, 300, 530], radius=6, fill=(230, 235, 228), outline=(150, 160, 150))
    d.text((115, 505), "apple stamps", fill=(70, 80, 70), font=_font(16))

    d.text((300, 55), "My Apple Stamps", fill=(47, 58, 51), font=_font(22))
    _brand_corner(d, w, h)
    path = IMAGES_DIR / "stamp-painting-example.png"
    img.save(path, "PNG")
    (IMAGES_DIR / "stamp-painting-example.txt").write_text(
        "Illustration of finished toddler apple stamp art on white paper: red, green, and yellow "
        "stamped apple shapes with a small paint tray, branded Little Learner Hub by Leah.\n",
        encoding="utf-8",
    )
    # also write a tiny SVG companion
    svg = '''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <rect width="800" height="600" fill="#fcfaf4"/>
  <rect x="80" y="40" width="640" height="480" fill="#fff" stroke="#b4beb6" stroke-width="2"/>
  <text x="300" y="75" font-family="sans-serif" font-size="22" fill="#2f3a33">My Apple Stamps</text>
  <circle cx="220" cy="200" r="55" fill="#c8463c"/>
  <circle cx="380" cy="260" r="48" fill="#5aa04b"/>
  <circle cx="540" cy="190" r="52" fill="#dcb43c"/>
  <text x="10" y="585" font-family="sans-serif" font-size="14" fill="#5a6b5d">Little Learner Hub by Leah</text>
</svg>
'''
    (IMAGES_DIR / "stamp-painting-example.svg").write_text(svg, encoding="utf-8")


def make_measuring_station_setup() -> None:
    """Tray setup with apples, yarn, cubes."""
    w, h = 800, 600
    img = Image.new("RGB", (w, h), (245, 248, 242))
    d = ImageDraw.Draw(img)
    # table
    d.rectangle([0, 420, 800, 600], fill=(210, 190, 150))
    # tray
    d.rounded_rectangle([100, 120, 700, 480], radius=24, fill=(232, 220, 200), outline=(140, 120, 90), width=3)
    d.rounded_rectangle([120, 140, 680, 460], radius=18, fill=(248, 244, 235), outline=(180, 165, 140), width=2)

    # three apples in a row
    for i, (cx, col) in enumerate([(220, (200, 70, 60)), (320, (90, 160, 75)), (420, (220, 180, 60))]):
        d.ellipse([cx - 40, 200, cx + 40, 280], fill=col, outline=(60, 70, 55), width=2)
        d.line([(cx, 205), (cx, 185)], fill=(80, 55, 40), width=3)
        d.ellipse([cx + 2, 175, cx + 22, 195], fill=(90, 150, 80), outline=(50, 90, 50))

    # yarn / string for measuring
    d.arc([450, 210, 650, 310], 200, 340, fill=(80, 120, 180), width=4)
    d.arc([470, 250, 640, 340], 20, 160, fill=(80, 120, 180), width=4)
    d.ellipse([640, 300, 670, 330], fill=(80, 120, 180))  # yarn ball

    # linking cubes / counting cubes
    colors = [(220, 90, 90), (90, 160, 90), (90, 120, 200), (230, 180, 60), (180, 100, 180)]
    for i, col in enumerate(colors):
        x0 = 180 + i * 42
        d.rectangle([x0, 360, x0 + 38, 400], fill=col, outline=(50, 50, 50), width=2)

    d.text((140, 155), "Measuring Station", fill=(47, 58, 51), font=_font(24))
    d.text((140, 420), "apples · yarn · cubes", fill=(90, 107, 93), font=_font(16))
    _brand_corner(d, w, h)
    img.save(IMAGES_DIR / "measuring-station-setup.png", "PNG")
    (IMAGES_DIR / "measuring-station-setup.txt").write_text(
        "Illustration of a classroom tray measuring station with three colored apples, a blue yarn "
        "strand and ball, and a row of linking cubes for toddler measurement play. "
        "Little Learner Hub by Leah.\n",
        encoding="utf-8",
    )
    svg = '''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <rect width="800" height="600" fill="#f5f8f2"/>
  <rect x="100" y="120" width="600" height="360" rx="24" fill="#e8dcc8" stroke="#8c785a" stroke-width="3"/>
  <circle cx="220" cy="240" r="40" fill="#c8463c"/>
  <circle cx="320" cy="240" r="40" fill="#5aa04b"/>
  <circle cx="420" cy="240" r="40" fill="#dcb43c"/>
  <path d="M470 260 Q560 200 650 280" fill="none" stroke="#5078b4" stroke-width="4"/>
  <rect x="180" y="360" width="38" height="40" fill="#dc5a5a"/>
  <rect x="222" y="360" width="38" height="40" fill="#5aa05a"/>
  <text x="10" y="585" font-family="sans-serif" font-size="14" fill="#5a6b5d">Little Learner Hub by Leah</text>
</svg>
'''
    (IMAGES_DIR / "measuring-station-setup.svg").write_text(svg, encoding="utf-8")


def make_life_cycle_setup() -> None:
    """Cards laid in order on a tray."""
    w, h = 800, 600
    img = Image.new("RGB", (w, h), (250, 248, 242))
    d = ImageDraw.Draw(img)
    # tray
    d.rounded_rectangle([60, 80, 740, 500], radius=20, fill=(220, 205, 175), outline=(130, 110, 80), width=3)
    d.rounded_rectangle([80, 100, 720, 480], radius=14, fill=(255, 252, 245), outline=(170, 155, 130), width=2)

    labels = ["Seed", "Sprout", "Sapling", "Tree"]
    card_w, card_h = 130, 180
    start_x = 110
    gap = 20
    cy = 220

    for i, lab in enumerate(labels):
        x = start_x + i * (card_w + gap)
        y = 160
        # dashed card
        for t in range(0, card_w, 8):
            d.line([(x + t, y), (x + min(t + 4, card_w), y)], fill=(107, 143, 113), width=2)
            d.line([(x + t, y + card_h), (x + min(t + 4, card_w), y + card_h)], fill=(107, 143, 113), width=2)
        for t in range(0, card_h, 8):
            d.line([(x, y + t), (x, y + min(t + 4, card_h))], fill=(107, 143, 113), width=2)
            d.line([(x + card_w, y + t), (x + card_w, y + min(t + 4, card_h))], fill=(107, 143, 113), width=2)
        d.rectangle([x + 4, y + 4, x + card_w - 4, y + card_h - 4], fill=(252, 251, 247))

        cx = x + card_w // 2
        if lab == "Seed":
            d.ellipse([cx - 22, 230, cx + 22, 280], fill=(107, 68, 35), outline=(62, 40, 20))
        elif lab == "Sprout":
            d.ellipse([cx - 35, 270, cx + 35, 295], fill=(139, 105, 20))
            d.line([(cx, 270), (cx, 220)], fill=(79, 143, 62), width=3)
            d.ellipse([cx + 2, 205, cx + 28, 230], fill=(79, 143, 62))
        elif lab == "Sapling":
            d.rectangle([cx - 6, 240, cx + 6, 295], fill=(122, 82, 48))
            d.ellipse([cx - 30, 195, cx + 30, 255], fill=(78, 138, 61))
        else:
            d.rectangle([cx - 8, 250, cx + 8, 300], fill=(122, 82, 48))
            d.ellipse([cx - 40, 185, cx + 40, 265], fill=(78, 138, 61))
            d.ellipse([cx - 12, 220, cx - 2, 230], fill=(194, 59, 47))
            d.ellipse([cx + 8, 210, cx + 18, 220], fill=(226, 184, 58))

        d.text((cx - 28, 320), lab, fill=(47, 58, 51), font=_font(18))
        if i < 3:
            ax = x + card_w + 4
            d.text((ax, 230), "→", fill=(90, 107, 93), font=_font(22))

    d.text((100, 115), "Life Cycle Order", fill=(47, 58, 51), font=_font(24))
    d.text((100, 440), "Lay cards left to right: seed → sprout → sapling → tree", fill=(90, 107, 93), font=_font(16))
    _brand_corner(d, w, h)
    img.save(IMAGES_DIR / "life-cycle-setup.png", "PNG")
    (IMAGES_DIR / "life-cycle-setup.txt").write_text(
        "Illustration of four apple life-cycle picture cards laid in order on a classroom tray: "
        "Seed, Sprout, Sapling, and Tree with arrows between them. Little Learner Hub by Leah.\n",
        encoding="utf-8",
    )
    svg = '''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <rect width="800" height="600" fill="#faf8f2"/>
  <rect x="60" y="80" width="680" height="420" rx="20" fill="#dccdaf" stroke="#827050" stroke-width="3"/>
  <text x="100" y="135" font-family="sans-serif" font-size="24" fill="#2f3a33">Life Cycle Order</text>
  <rect x="110" y="160" width="130" height="180" fill="#fcfbf7" stroke="#6b8f71" stroke-dasharray="5 4"/>
  <rect x="260" y="160" width="130" height="180" fill="#fcfbf7" stroke="#6b8f71" stroke-dasharray="5 4"/>
  <rect x="410" y="160" width="130" height="180" fill="#fcfbf7" stroke="#6b8f71" stroke-dasharray="5 4"/>
  <rect x="560" y="160" width="130" height="180" fill="#fcfbf7" stroke="#6b8f71" stroke-dasharray="5 4"/>
  <text x="10" y="585" font-family="sans-serif" font-size="14" fill="#5a6b5d">Little Learner Hub by Leah</text>
</svg>
'''
    (IMAGES_DIR / "life-cycle-setup.svg").write_text(svg, encoding="utf-8")


def render_pdf_pages(page_count: int) -> list[Path]:
    """Rasterize PDF pages with pdftoppm."""
    # clear old renders
    for old in PAGES_DIR.glob("page-*.png"):
        old.unlink()
    prefix = PAGES_DIR / "page"
    cmd = [
        "pdftoppm",
        "-png",
        "-r",
        "150",
        str(PDF_PATH),
        str(prefix),
    ]
    subprocess.run(cmd, check=True)
    # pdftoppm names page-1.png; rename to page-01.png
    produced = sorted(PAGES_DIR.glob("page-*.png"))
    renamed: list[Path] = []
    for p in produced:
        # page-1.png or page-01.png
        stem = p.stem  # page-1
        num = stem.split("-", 1)[-1]
        try:
            n = int(num)
        except ValueError:
            continue
        dest = PAGES_DIR / f"page-{n:02d}.png"
        if p != dest:
            if dest.exists():
                dest.unlink()
            p.rename(dest)
        renamed.append(dest)
    if len(renamed) != page_count:
        raise RuntimeError(f"Expected {page_count} page PNGs, got {len(renamed)}: {renamed}")
    return renamed


def main() -> None:
    ensure_dirs()
    page_count = build_pdf()
    make_stamp_painting_example()
    make_measuring_station_setup()
    make_life_cycle_setup()
    pages = render_pdf_pages(page_count)
    print(f"PDF: {PDF_PATH}")
    print(f"Pages: {page_count}")
    for p in pages:
        print(f"  {p}")
    print(f"Images dir: {IMAGES_DIR}")
    for name in (
        "stamp-painting-example.png",
        "measuring-station-setup.png",
        "life-cycle-setup.png",
    ):
        print(f"  {IMAGES_DIR / name}")


if __name__ == "__main__":
    main()
