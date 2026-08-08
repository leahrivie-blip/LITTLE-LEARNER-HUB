#!/usr/bin/env python3
"""
Build Preschool All About Me Picture Card Pack proof PDF + page PNGs + enrichment images.

Outputs (under docs/teaching-kit/qa/next-10-gold-upgrade/proof/all-about-me/):
  - All-About-Me-Picture-Card-Pack.pdf
  - pages/*.png (via pdftoppm -png -r 150)
  - images/self-portrait-example.png (+ .txt alt)
  - images/name-discovery-setup.png (+ .txt alt)

Illustrations are original inclusive cartoons drawn with reportlab (no photos of real children).
"""

from __future__ import annotations

import math
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.colors import Color, HexColor, black, white
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "docs/teaching-kit/qa/next-10-gold-upgrade/proof/all-about-me"
PDF_PATH = OUT_DIR / "All-About-Me-Picture-Card-Pack.pdf"
PAGES_DIR = OUT_DIR / "pages"
IMAGES_DIR = OUT_DIR / "images"

PAGE_W, PAGE_H = letter  # 612 x 792

# Brand / ink-friendly palette
BRAND_GREEN = HexColor("#3D6B4F")
BRAND_SOFT = HexColor("#E8F0EA")
BRAND_CREAM = HexColor("#FBF8F2")
INK = HexColor("#2A332C")
MUTED = HexColor("#5A6B5D")
CUT = HexColor("#6B8F71")
ACCENT = HexColor("#C4784A")
SKY = HexColor("#D7E8F2")
SOFT_YELLOW = HexColor("#F6E7A8")
SOFT_PINK = HexColor("#F3D5D8")
SOFT_BLUE = HexColor("#C9D9EE")
SOFT_LAV = HexColor("#DDD4EC")
GRASS = HexColor("#A8C98A")

# Skin tones (distinct; includes deeper tones)
SKIN = {
    "deep": HexColor("#4A2C1A"),
    "rich": HexColor("#8D5524"),
    "warm": HexColor("#C68642"),
    "golden": HexColor("#E0AC69"),
    "honey": HexColor("#F1C27D"),
    "peach": HexColor("#FFDBAC"),
    "rosewood": HexColor("#6B3A2A"),
}

HAIR = {
    "black": HexColor("#1A120F"),
    "brown": HexColor("#4A2F1B"),
    "auburn": HexColor("#6B3A1F"),
    "dark_brown": HexColor("#2C1A12"),
    "blonde": HexColor("#C9A66B"),
    "gray": HexColor("#8A8A8A"),
}

WOOD = HexColor("#C4A06A")
WHEEL = HexColor("#4A5560")
FRAME = HexColor("#5B7C65")

BRAND_LINE = "Little Learner Hub by Leah"
BRAND_URL = "littlelearnershubbyleah.com"
DRAFT_FOOTER = "DRAFT — Owner review"


def _ellipse(c: canvas.Canvas, x, y, w, h, fill=None, stroke=None, sw=1.2):
    c.saveState()
    if fill is not None:
        c.setFillColor(fill)
    if stroke is not None:
        c.setStrokeColor(stroke)
        c.setLineWidth(sw)
    else:
        c.setStrokeColor(fill if fill is not None else black)
        c.setLineWidth(0)
    op = 1 if fill is not None else 0
    st = 1 if stroke is not None else 0
    if fill is not None and stroke is None:
        c.setStrokeColor(fill)
        st = 0
        c.ellipse(x, y, x + w, y + h, fill=1, stroke=0)
    elif fill is not None and stroke is not None:
        c.ellipse(x, y, x + w, y + h, fill=1, stroke=1)
    else:
        c.ellipse(x, y, x + w, y + h, fill=0, stroke=1)
    c.restoreState()


def _rect(c, x, y, w, h, fill=None, stroke=None, sw=1.2, radius=0):
    c.saveState()
    if fill is not None:
        c.setFillColor(fill)
    if stroke is not None:
        c.setStrokeColor(stroke)
        c.setLineWidth(sw)
    if radius:
        c.roundRect(x, y, w, h, radius, fill=1 if fill is not None else 0, stroke=1 if stroke is not None else 0)
    else:
        c.rect(x, y, w, h, fill=1 if fill is not None else 0, stroke=1 if stroke is not None else 0)
    c.restoreState()


def _line(c, x1, y1, x2, y2, color=INK, sw=1.5):
    c.saveState()
    c.setStrokeColor(color)
    c.setLineWidth(sw)
    c.line(x1, y1, x2, y2)
    c.restoreState()


def _arc_smile(c, cx, cy, r, color=INK, sw=2.2, open_up=True):
    """Simple smile / frown using a cubic-ish path of short lines."""
    c.saveState()
    c.setStrokeColor(color)
    c.setLineWidth(sw)
    c.setLineCap(1)
    pts = []
    start = 200 if open_up else 20
    end = 340 if open_up else 160
    steps = 18
    for i in range(steps + 1):
        t = start + (end - start) * i / steps
        rad = math.radians(t)
        pts.append((cx + r * math.cos(rad), cy + r * math.sin(rad)))
    p = c.beginPath()
    p.moveTo(pts[0][0], pts[0][1])
    for x, y in pts[1:]:
        p.lineTo(x, y)
    c.drawPath(p, stroke=1, fill=0)
    c.restoreState()


def draw_brand_header(c: canvas.Canvas, subtitle: str):
    c.setFillColor(BRAND_GREEN)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(36, PAGE_H - 28, BRAND_LINE)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 9)
    c.drawRightString(PAGE_W - 36, PAGE_H - 28, subtitle)
    _line(c, 36, PAGE_H - 34, PAGE_W - 36, PAGE_H - 34, BRAND_GREEN, 1.0)


def draw_brand_footer(c: canvas.Canvas, page_label: str):
    _line(c, 36, 42, PAGE_W - 36, 42, HexColor("#D0D8D1"), 0.8)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 8)
    c.drawString(36, 28, f"{DRAFT_FOOTER}  ·  {BRAND_URL}")
    c.drawRightString(PAGE_W - 36, 28, page_label)
    c.setFont("Helvetica-Oblique", 7)
    c.setFillColor(HexColor("#7A8A7C"))
    c.drawCentredString(PAGE_W / 2, 16, BRAND_LINE)


def draw_cut_card_frame(c: canvas.Canvas, x, y, w, h):
    """Dashed cut lines around a large preschool card."""
    c.saveState()
    c.setStrokeColor(CUT)
    c.setDash(6, 4)
    c.setLineWidth(1.4)
    c.roundRect(x, y, w, h, 14, fill=0, stroke=1)
    # corner scissors marks
    c.setDash()
    c.setFont("Helvetica", 8)
    c.setFillColor(MUTED)
    c.drawString(x + 6, y + h - 14, "✂ cut")
    c.restoreState()
    # soft fill inside
    _rect(c, x + 3, y + 3, w - 6, h - 6, fill=BRAND_CREAM, stroke=None, radius=12)


def draw_hair(c, kind: str, cx, cy, head_r, color):
    """Draw hair textures as simple shapes around a head centered at (cx, cy)."""
    c.saveState()
    c.setFillColor(color)
    c.setStrokeColor(color)
    if kind == "curly":
        for ang, dist, rr in [
            (90, head_r * 0.95, 14),
            (120, head_r * 0.95, 12),
            (60, head_r * 0.95, 12),
            (150, head_r * 0.85, 11),
            (30, head_r * 0.85, 11),
            (180, head_r * 0.7, 10),
            (0, head_r * 0.7, 10),
            (105, head_r * 1.15, 13),
            (75, head_r * 1.15, 13),
        ]:
            rad = math.radians(ang)
            x = cx + dist * math.cos(rad) - rr
            y = cy + dist * math.sin(rad) - rr * 0.2
            c.circle(x + rr, y + rr, rr, fill=1, stroke=0)
    elif kind == "afro_puff":
        # short sides + puff on top
        c.circle(cx, cy + head_r * 0.95, head_r * 0.72, fill=1, stroke=0)
        c.circle(cx - head_r * 0.35, cy + head_r * 0.7, 16, fill=1, stroke=0)
        c.circle(cx + head_r * 0.35, cy + head_r * 0.7, 16, fill=1, stroke=0)
    elif kind == "braids":
        # scalp cap
        c.setLineWidth(0)
        p = c.beginPath()
        p.moveTo(cx - head_r, cy + 8)
        p.curveTo(cx - head_r, cy + head_r + 18, cx + head_r, cy + head_r + 18, cx + head_r, cy + 8)
        p.lineTo(cx - head_r, cy + 8)
        c.drawPath(p, fill=1, stroke=0)
        # two braids
        for side in (-1, 1):
            bx = cx + side * head_r * 0.55
            by = cy - 10
            for i in range(5):
                c.circle(bx + side * (i % 2) * 3, by - i * 14, 7 - i * 0.4, fill=1, stroke=0)
            # bead
            c.setFillColor(HexColor("#E8A54B"))
            c.circle(bx + side * 2, by - 5 * 14, 5, fill=1, stroke=0)
            c.setFillColor(color)
    elif kind == "straight":
        p = c.beginPath()
        p.moveTo(cx - head_r - 4, cy + 10)
        p.curveTo(cx - head_r - 2, cy + head_r + 22, cx + head_r + 2, cy + head_r + 22, cx + head_r + 4, cy + 10)
        p.lineTo(cx + head_r + 8, cy - head_r * 0.9)
        p.lineTo(cx + head_r - 6, cy - head_r * 0.5)
        p.lineTo(cx - head_r + 6, cy - head_r * 0.5)
        p.lineTo(cx - head_r - 8, cy - head_r * 0.9)
        p.close()
        c.drawPath(p, fill=1, stroke=0)
        # bangs
        c.setFillColor(color)
        c.rect(cx - head_r + 6, cy + head_r * 0.25, head_r * 1.7, 16, fill=1, stroke=0)
    elif kind == "short":
        p = c.beginPath()
        p.moveTo(cx - head_r, cy + 6)
        p.curveTo(cx - head_r - 2, cy + head_r + 10, cx + head_r + 2, cy + head_r + 10, cx + head_r, cy + 6)
        p.curveTo(cx + head_r * 0.5, cy + head_r * 0.35, cx - head_r * 0.5, cy + head_r * 0.35, cx - head_r, cy + 6)
        c.drawPath(p, fill=1, stroke=0)
    elif kind == "gray_curls":
        for ang, dist, rr in [
            (90, head_r * 0.9, 12),
            (125, head_r * 0.9, 11),
            (55, head_r * 0.9, 11),
            (155, head_r * 0.75, 10),
            (25, head_r * 0.75, 10),
            (180, head_r * 0.55, 9),
            (0, head_r * 0.55, 9),
        ]:
            rad = math.radians(ang)
            x = cx + dist * math.cos(rad)
            y = cy + dist * math.sin(rad)
            c.circle(x, y, rr, fill=1, stroke=0)
    c.restoreState()


def draw_face_features(c, cx, cy, mood: str, eye_scale=1.0):
    """mood: happy, calm, sad, excited"""
    eye_y = cy + 8
    eye_dx = 18 * eye_scale
    eye_r = 4.2 * eye_scale
    # eyes
    c.setFillColor(INK)
    if mood == "calm":
        # soft closed/soft eyes as gentle arcs
        _arc_smile(c, cx - eye_dx, eye_y, 7, INK, 2.0, open_up=False)
        _arc_smile(c, cx + eye_dx, eye_y, 7, INK, 2.0, open_up=False)
    elif mood == "excited":
        c.circle(cx - eye_dx, eye_y, eye_r + 1.2, fill=1, stroke=0)
        c.circle(cx + eye_dx, eye_y, eye_r + 1.2, fill=1, stroke=0)
        c.setFillColor(white)
        c.circle(cx - eye_dx - 1.5, eye_y + 1.5, 1.6, fill=1, stroke=0)
        c.circle(cx + eye_dx - 1.5, eye_y + 1.5, 1.6, fill=1, stroke=0)
        # sparkle
        c.setStrokeColor(ACCENT)
        c.setLineWidth(1.5)
        for sx, sy in [(cx - 40, cy + 28), (cx + 42, cy + 32), (cx + 10, cy + 48)]:
            c.line(sx - 4, sy, sx + 4, sy)
            c.line(sx, sy - 4, sx, sy + 4)
    else:
        c.circle(cx - eye_dx, eye_y, eye_r, fill=1, stroke=0)
        c.circle(cx + eye_dx, eye_y, eye_r, fill=1, stroke=0)
        c.setFillColor(white)
        c.circle(cx - eye_dx - 1.2, eye_y + 1.2, 1.3, fill=1, stroke=0)
        c.circle(cx + eye_dx - 1.2, eye_y + 1.2, 1.3, fill=1, stroke=0)

    # brows / cheeks
    if mood == "sad":
        c.setStrokeColor(INK)
        c.setLineWidth(2)
        c.line(cx - eye_dx - 8, eye_y + 12, cx - eye_dx + 6, eye_y + 8)
        c.line(cx + eye_dx - 6, eye_y + 8, cx + eye_dx + 8, eye_y + 12)
        # soft blush
        c.setFillColor(HexColor("#E8A090"))
        c.setFillColor(Color(0.9, 0.55, 0.5, alpha=0.35))
        c.circle(cx - 28, cy - 6, 7, fill=1, stroke=0)
        c.circle(cx + 28, cy - 6, 7, fill=1, stroke=0)
        _arc_smile(c, cx, cy - 10, 14, INK, 2.2, open_up=False)
    elif mood == "happy":
        c.setFillColor(HexColor("#E89B8A"))
        c.circle(cx - 28, cy - 2, 6, fill=1, stroke=0)
        c.circle(cx + 28, cy - 2, 6, fill=1, stroke=0)
        _arc_smile(c, cx, cy - 6, 16, INK, 2.4, open_up=True)
    elif mood == "calm":
        c.setFillColor(HexColor("#E8B4A8"))
        c.circle(cx - 26, cy - 4, 5, fill=1, stroke=0)
        c.circle(cx + 26, cy - 4, 5, fill=1, stroke=0)
        # gentle small smile
        _arc_smile(c, cx, cy - 8, 12, INK, 2.0, open_up=True)
    elif mood == "excited":
        c.setFillColor(HexColor("#F0A090"))
        c.circle(cx - 30, cy - 2, 7, fill=1, stroke=0)
        c.circle(cx + 30, cy - 2, 7, fill=1, stroke=0)
        # open joyful mouth
        c.setFillColor(HexColor("#C45C5C"))
        c.ellipse(cx - 12, cy - 22, cx + 12, cy - 4, fill=1, stroke=0)
        c.setFillColor(white)
        c.rect(cx - 8, cy - 10, 16, 4, fill=1, stroke=0)


def draw_head(c, cx, cy, skin, hair_kind, hair_color, mood, head_r=52):
    draw_hair(c, hair_kind, cx, cy, head_r, hair_color)
    _ellipse(c, cx - head_r, cy - head_r, head_r * 2, head_r * 2, fill=skin, stroke=HexColor("#5A4030"), sw=1.0)
    # redraw front hair fringe bits for straight/short so they sit over face top
    if hair_kind in ("straight", "short", "braids"):
        c.saveState()
        c.setFillColor(hair_color)
        if hair_kind == "straight":
            c.rect(cx - head_r + 8, cy + head_r * 0.35, head_r * 1.6, 14, fill=1, stroke=0)
        elif hair_kind == "short":
            p = c.beginPath()
            p.moveTo(cx - head_r + 4, cy + head_r * 0.2)
            p.curveTo(cx - 10, cy + head_r + 4, cx + 10, cy + head_r + 4, cx + head_r - 4, cy + head_r * 0.2)
            c.drawPath(p, fill=1, stroke=0)
        c.restoreState()
    draw_face_features(c, cx, cy, mood)


def draw_torso(c, cx, top_y, skin, shirt, width=70, height=70):
    # neck
    _rect(c, cx - 10, top_y - 8, 20, 14, fill=skin, stroke=None)
    # shirt body
    _rect(c, cx - width / 2, top_y - height, width, height, fill=shirt, stroke=HexColor("#4A5A4C"), sw=1, radius=10)
    # arms
    c.setStrokeColor(skin)
    c.setLineWidth(10)
    c.setLineCap(1)
    c.line(cx - width / 2 + 4, top_y - 18, cx - width / 2 - 18, top_y - 55)
    c.line(cx + width / 2 - 4, top_y - 18, cx + width / 2 + 18, top_y - 55)


def draw_wheelchair_child(c, cx, cy, skin, hair_kind, hair_color, shirt):
    """Joyful child using a wheelchair — celebrated, not tokenizing."""
    # chair frame
    c.setStrokeColor(WHEEL)
    c.setFillColor(HexColor("#6A7680"))
    c.setLineWidth(3)
    # seat
    _rect(c, cx - 48, cy - 20, 90, 14, fill=HexColor("#7A8790"), stroke=WHEEL, sw=1.5, radius=3)
    # backrest
    _rect(c, cx - 48, cy - 6, 16, 70, fill=HexColor("#7A8790"), stroke=WHEEL, sw=1.5, radius=3)
    # large rear wheel
    c.setStrokeColor(WHEEL)
    c.setLineWidth(4)
    c.circle(cx - 20, cy - 28, 28, fill=0, stroke=1)
    c.setLineWidth(2)
    c.circle(cx - 20, cy - 28, 8, fill=1, stroke=0)
    # spokes
    for ang in range(0, 180, 45):
        rad = math.radians(ang)
        c.line(cx - 20, cy - 28, cx - 20 + 24 * math.cos(rad), cy - 28 + 24 * math.sin(rad))
    # front caster
    c.circle(cx + 38, cy - 22, 10, fill=0, stroke=1)
    c.setFillColor(WHEEL)
    c.circle(cx + 38, cy - 22, 3, fill=1, stroke=0)
    # footrest
    c.setStrokeColor(WHEEL)
    c.setLineWidth(2.5)
    c.line(cx + 20, cy - 18, cx + 42, cy - 14)
    # child body
    draw_head(c, cx + 8, cy + 78, skin, hair_kind, hair_color, "happy", head_r=36)
    # torso seated
    _rect(c, cx - 10, cy + 8, 50, 42, fill=shirt, stroke=HexColor("#4A5A4C"), sw=1, radius=8)
    _rect(c, cx + 8, cy + 42, 14, 12, fill=skin, stroke=None)
    # arms — one waving joyfully
    c.setStrokeColor(skin)
    c.setLineWidth(8)
    c.setLineCap(1)
    c.line(cx - 6, cy + 38, cx - 36, cy + 55)
    c.line(cx + 36, cy + 38, cx + 58, cy + 70)
    # hand wave
    c.setFillColor(skin)
    c.circle(cx + 60, cy + 74, 7, fill=1, stroke=0)
    # legs resting
    c.setStrokeColor(HexColor("#3A5A8A"))
    c.setLineWidth(9)
    c.line(cx + 5, cy - 6, cx + 28, cy - 16)
    c.line(cx + 20, cy - 6, cx + 40, cy - 14)
    # shoes
    c.setFillColor(HexColor("#2F3A44"))
    c.ellipse(cx + 24, cy - 22, cx + 44, cy - 10, fill=1, stroke=0)
    c.ellipse(cx + 34, cy - 20, cx + 52, cy - 8, fill=1, stroke=0)


def draw_card_title(c, title: str, y=118):
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 26)
    c.drawCentredString(PAGE_W / 2, y, title)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 11)
    c.drawCentredString(PAGE_W / 2, y - 18, "Talk · Point · Play")


def page_teacher_instructions(c: canvas.Canvas):
    draw_brand_header(c, "All About Me · Picture Card Pack")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 22)
    c.drawCentredString(PAGE_W / 2, PAGE_H - 70, "Teacher Instructions")
    c.setFont("Helvetica", 11)
    c.setFillColor(MUTED)
    c.drawCentredString(PAGE_W / 2, PAGE_H - 90, "Preschool · All About Me · Original inclusive illustrations")

    box_x, box_y, box_w, box_h = 48, 90, PAGE_W - 96, PAGE_H - 200
    _rect(c, box_x, box_y, box_w, box_h, fill=BRAND_SOFT, stroke=BRAND_GREEN, sw=1.5, radius=12)

    lines = [
        ("How to use", True),
        ("Print on US Letter cardstock. Cut on the dashed lines. Laminate if desired.", False),
        ("Use during circle, small groups, dramatic play, and “All About Me” centers.", False),
        ("", False),
        ("What is included", True),
        ("Feeling faces · family cards · hair & identity cards · favorite play · name frame · affirmation", False),
        ("", False),
        ("Inclusive teaching notes (important)", True),
        ("• Celebrate many families, skin tones, hair textures, and abilities.", False),
        ("• Do NOT compare bodies, rank height, or label a “normal” body.", False),
        ("• Do NOT use body-outline worksheets as comparison tools.", False),
        ("• Invite sharing; never require family photos or personal details.", False),
        ("• Offer seated and standing options for any movement follow-up.", False),
        ("", False),
        ("Prompt ideas", True),
        ("“Which face matches how you feel?”  “Who is in your family circle?”", False),
        ("“What hair do you notice?”  “What is your favorite way to play?”", False),
        ("“Would you like to write or scribble your name on the name card?”", False),
        ("", False),
        ("Care & print tip", True),
        ("Color prints are preferred; designs stay legible in grayscale.", False),
    ]
    y = box_y + box_h - 36
    for text, bold in lines:
        if not text:
            y -= 8
            continue
        c.setFillColor(BRAND_GREEN if bold else INK)
        c.setFont("Helvetica-Bold" if bold else "Helvetica", 12 if bold else 10.5)
        c.drawString(box_x + 22, y, text)
        y -= 18 if bold else 15

    draw_brand_footer(c, "Page 1 · Instructions")


def card_page(c, page_num: int, title: str, draw_fn, bg=None):
    draw_brand_header(c, "All About Me · Picture Cards")
    # large card with cut lines
    margin_x, margin_y = 40, 58
    card_w = PAGE_W - 2 * margin_x
    card_h = PAGE_H - 150
    draw_cut_card_frame(c, margin_x, margin_y, card_w, card_h)
    if bg is not None:
        _rect(c, margin_x + 10, margin_y + 70, card_w - 20, card_h - 90, fill=bg, stroke=None, radius=10)
    # illustration area center
    draw_fn(c, PAGE_W / 2, margin_y + card_h * 0.55)
    draw_card_title(c, title, y=margin_y + 42)
    draw_brand_footer(c, f"Page {page_num} · {title}")


# --- Card illustration callbacks (cx, cy = illustration center) ---

def ill_happy(c, cx, cy):
    _ellipse(c, cx - 110, cy - 90, 220, 200, fill=SOFT_YELLOW, stroke=None)
    draw_head(c, cx, cy + 10, SKIN["golden"], "curly", HAIR["brown"], "happy", 58)
    draw_torso(c, cx, cy - 48, SKIN["golden"], HexColor("#5B8FD6"), 78, 60)


def ill_calm(c, cx, cy):
    _ellipse(c, cx - 110, cy - 90, 220, 200, fill=SOFT_BLUE, stroke=None)
    # soft cloud shapes
    c.setFillColor(white)
    for ox, oy, r in [(-70, 70, 22), (-40, 80, 28), (-10, 70, 20), (50, 75, 24)]:
        c.circle(cx + ox, cy + oy, r, fill=1, stroke=0)
    draw_head(c, cx, cy + 8, SKIN["peach"], "straight", HAIR["blonde"], "calm", 56)
    draw_torso(c, cx, cy - 48, SKIN["peach"], HexColor("#7BB7A5"), 76, 58)


def ill_sad(c, cx, cy):
    _ellipse(c, cx - 110, cy - 90, 220, 200, fill=SOFT_LAV, stroke=None)
    # supportive heart nearby (friendship cue, not scary)
    c.setFillColor(HexColor("#E8A0B0"))
    c.circle(cx + 78, cy + 40, 12, fill=1, stroke=0)
    c.circle(cx + 94, cy + 40, 12, fill=1, stroke=0)
    p = c.beginPath()
    p.moveTo(cx + 68, cy + 38)
    p.lineTo(cx + 86, cy + 18)
    p.lineTo(cx + 104, cy + 38)
    c.drawPath(p, fill=1, stroke=0)
    draw_head(c, cx - 8, cy + 8, SKIN["warm"], "short", HAIR["black"], "sad", 56)
    draw_torso(c, cx - 8, cy - 48, SKIN["warm"], HexColor("#8FA3C4"), 74, 58)


def ill_excited(c, cx, cy):
    _ellipse(c, cx - 115, cy - 95, 230, 210, fill=HexColor("#FFE2C8"), stroke=None)
    draw_head(c, cx, cy + 12, SKIN["rich"], "afro_puff", HAIR["black"], "excited", 56)
    draw_torso(c, cx, cy - 46, SKIN["rich"], HexColor("#E07A4A"), 78, 60)
    # confetti dots
    c.setFillColor(ACCENT)
    for ox, oy in [(-90, 60), (95, 50), (-60, -40), (80, -30), (0, 95)]:
        c.circle(cx + ox, cy + oy, 4, fill=1, stroke=0)


def ill_family2(c, cx, cy):
    _ellipse(c, cx - 130, cy - 100, 260, 210, fill=HexColor("#E7F0E4"), stroke=None)
    # adult
    draw_head(c, cx - 45, cy + 35, SKIN["deep"], "braids", HAIR["black"], "happy", 42)
    draw_torso(c, cx - 45, cy - 8, SKIN["deep"], HexColor("#6B5B95"), 64, 70)
    # child
    draw_head(c, cx + 50, cy + 10, SKIN["honey"], "curly", HAIR["brown"], "happy", 34)
    draw_torso(c, cx + 50, cy - 22, SKIN["honey"], HexColor("#E8B84A"), 52, 50)
    # joined hands cue
    c.setStrokeColor(SKIN["honey"])
    c.setLineWidth(6)
    c.setLineCap(1)
    c.line(cx - 10, cy - 20, cx + 22, cy - 10)


def ill_family3(c, cx, cy):
    _ellipse(c, cx - 140, cy - 105, 280, 220, fill=HexColor("#F0EADF"), stroke=None)
    # adult left — straight hair
    draw_head(c, cx - 70, cy + 40, SKIN["peach"], "straight", HAIR["auburn"], "happy", 38)
    draw_torso(c, cx - 70, cy, SKIN["peach"], HexColor("#4A7C59"), 58, 68)
    # adult right — short hair, different tone
    draw_head(c, cx + 70, cy + 40, SKIN["rosewood"], "short", HAIR["black"], "happy", 38)
    draw_torso(c, cx + 70, cy, SKIN["rosewood"], HexColor("#3D5A80"), 58, 68)
    # child center — afro puff
    draw_head(c, cx, cy + 5, SKIN["warm"], "afro_puff", HAIR["dark_brown"], "happy", 32)
    draw_torso(c, cx, cy - 28, SKIN["warm"], HexColor("#D96B4C"), 48, 48)


def ill_family_grandparent(c, cx, cy):
    _ellipse(c, cx - 135, cy - 105, 270, 220, fill=HexColor("#E8EEF5"), stroke=None)
    # grandparent
    draw_head(c, cx - 55, cy + 38, SKIN["golden"], "gray_curls", HAIR["gray"], "calm", 44)
    draw_torso(c, cx - 55, cy - 8, SKIN["golden"], HexColor("#7A6B8A"), 66, 72)
    # child
    draw_head(c, cx + 55, cy + 8, SKIN["rich"], "braids", HAIR["black"], "happy", 34)
    draw_torso(c, cx + 55, cy - 26, SKIN["rich"], HexColor("#4FA3C4"), 50, 52)
    # shared book
    _rect(c, cx - 10, cy - 40, 36, 28, fill=HexColor("#E8D48A"), stroke=HexColor("#8A7040"), sw=1, radius=2)
    c.setFillColor(HexColor("#8A7040"))
    c.setFont("Helvetica-Bold", 7)
    c.drawCentredString(cx + 8, cy - 28, "story")


def ill_curly_child(c, cx, cy):
    _ellipse(c, cx - 110, cy - 95, 220, 210, fill=HexColor("#F5E6F0"), stroke=None)
    draw_head(c, cx, cy + 20, SKIN["deep"], "curly", HAIR["black"], "happy", 60)
    draw_torso(c, cx, cy - 42, SKIN["deep"], HexColor("#D45D79"), 80, 62)


def ill_straight_child(c, cx, cy):
    _ellipse(c, cx - 110, cy - 95, 220, 210, fill=HexColor("#E6F2F5"), stroke=None)
    draw_head(c, cx, cy + 18, SKIN["honey"], "straight", HAIR["brown"], "happy", 58)
    draw_torso(c, cx, cy - 42, SKIN["honey"], HexColor("#5BA3A8"), 78, 62)


def ill_wheelchair(c, cx, cy):
    _ellipse(c, cx - 140, cy - 110, 280, 230, fill=HexColor("#EAF5E8"), stroke=None)
    draw_wheelchair_child(c, cx - 10, cy - 30, SKIN["warm"], "short", HAIR["black"], HexColor("#F0A202"))
    # joyful sun
    c.setFillColor(SOFT_YELLOW)
    c.circle(cx + 100, cy + 80, 22, fill=1, stroke=0)
    c.setStrokeColor(HexColor("#E0B84A"))
    c.setLineWidth(2)
    for ang in range(0, 360, 45):
        rad = math.radians(ang)
        c.line(cx + 100 + 24 * math.cos(rad), cy + 80 + 24 * math.sin(rad),
               cx + 100 + 32 * math.cos(rad), cy + 80 + 32 * math.sin(rad))


def ill_blocks(c, cx, cy):
    _ellipse(c, cx - 120, cy - 100, 240, 210, fill=HexColor("#F7F0E4"), stroke=None)
    # child peeking / playing
    draw_head(c, cx - 70, cy + 30, SKIN["peach"], "curly", HAIR["auburn"], "happy", 36)
    draw_torso(c, cx - 70, cy - 5, SKIN["peach"], HexColor("#6C9BCF"), 54, 50)
    # colorful blocks stack
    blocks = [
        (cx + 10, cy - 50, 50, 36, HexColor("#E07A4A")),
        (cx + 30, cy - 14, 44, 34, HexColor("#E8B84A")),
        (cx + 5, cy + 20, 48, 32, HexColor("#5B8FD6")),
        (cx + 55, cy + 20, 36, 28, HexColor("#7BB7A5")),
        (cx + 20, cy + 52, 40, 28, HexColor("#D45D79")),
    ]
    for x, y, w, h, col in blocks:
        _rect(c, x, y, w, h, fill=col, stroke=INK, sw=1.2, radius=3)
        c.setStrokeColor(white)
        c.setLineWidth(1)
        c.line(x + 6, y + h - 8, x + w - 6, y + h - 8)


def ill_books(c, cx, cy):
    _ellipse(c, cx - 120, cy - 100, 240, 210, fill=HexColor("#EDE6F5"), stroke=None)
    draw_head(c, cx - 55, cy + 25, SKIN["rich"], "braids", HAIR["black"], "calm", 38)
    draw_torso(c, cx - 55, cy - 12, SKIN["rich"], HexColor("#8B6BB5"), 56, 55)
    # open book
    _rect(c, cx + 5, cy - 20, 55, 70, fill=white, stroke=HexColor("#5A4030"), sw=1.5, radius=2)
    _rect(c, cx + 60, cy - 20, 55, 70, fill=HexColor("#FFF8E8"), stroke=HexColor("#5A4030"), sw=1.5, radius=2)
    c.setStrokeColor(MUTED)
    c.setLineWidth(1)
    for i in range(4):
        yy = cy + 35 - i * 12
        c.line(cx + 14, yy, cx + 50, yy)
        c.line(cx + 70, yy, cx + 105, yy)
    # small heart on cover area
    c.setFillColor(HexColor("#E07A4A"))
    c.circle(cx + 30, cy - 5, 5, fill=1, stroke=0)


def ill_outdoor(c, cx, cy):
    # sky + grass
    _rect(c, cx - 130, cy - 100, 260, 210, fill=SKY, stroke=None, radius=10)
    _rect(c, cx - 130, cy - 100, 260, 70, fill=GRASS, stroke=None, radius=0)
    # sun
    c.setFillColor(SOFT_YELLOW)
    c.circle(cx + 95, cy + 75, 20, fill=1, stroke=0)
    # running child (motion lines)
    draw_head(c, cx - 10, cy + 35, SKIN["golden"], "short", HAIR["brown"], "excited", 34)
    # body leaning
    c.saveState()
    c.translate(cx - 10, cy)
    c.rotate(-12)
    _rect(c, -28, -40, 56, 50, fill=HexColor("#3D8B6E"), stroke=HexColor("#2A5A48"), sw=1, radius=8)
    c.restoreState()
    c.setStrokeColor(SKIN["golden"])
    c.setLineWidth(7)
    c.setLineCap(1)
    c.line(cx - 30, cy - 5, cx - 55, cy + 20)  # arm back
    c.line(cx + 10, cy - 5, cx + 40, cy + 15)  # arm forward
    c.setStrokeColor(HexColor("#2F3A44"))
    c.line(cx - 20, cy - 40, cx - 45, cy - 70)  # leg back
    c.line(cx + 5, cy - 40, cx + 35, cy - 65)  # leg forward
    # motion dashes
    c.setStrokeColor(MUTED)
    c.setLineWidth(1.5)
    for i, ox in enumerate([-90, -78, -66]):
        c.line(cx + ox, cy + 10 - i * 4, cx + ox + 10, cy + 10 - i * 4)


def ill_name_card(c, cx, cy):
    # decorative blank name frame — empty writing line only
    frame_w, frame_h = 280, 180
    x, y = cx - frame_w / 2, cy - frame_h / 2 - 10
    _rect(c, x, y, frame_w, frame_h, fill=white, stroke=FRAME, sw=3, radius=12)
    # inner decorative border
    c.setStrokeColor(HexColor("#A8C4AE"))
    c.setDash(2, 3)
    c.setLineWidth(1.2)
    c.roundRect(x + 10, y + 10, frame_w - 20, frame_h - 20, 8, fill=0, stroke=1)
    c.setDash()
    # corner flourishes (simple leaves)
    c.setFillColor(BRAND_GREEN)
    for ox, oy in [(18, frame_h - 22), (frame_w - 18, frame_h - 22), (18, 22), (frame_w - 18, 22)]:
        c.circle(x + ox, y + oy, 5, fill=1, stroke=0)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 14)
    c.drawCentredString(cx, y + frame_h - 40, "My Name")
    # empty writing line
    c.setStrokeColor(MUTED)
    c.setLineWidth(1.5)
    c.line(x + 40, y + 70, x + frame_w - 40, y + 70)
    c.setFillColor(MUTED)
    c.setFont("Helvetica-Oblique", 9)
    c.drawCentredString(cx, y + 48, "child writes or scribbles here")


def ill_affirmation(c, cx, cy):
    _ellipse(c, cx - 125, cy - 105, 250, 220, fill=HexColor("#FFF3D6"), stroke=None)
    # diverse mini faces around text
    draw_head(c, cx - 90, cy + 55, SKIN["deep"], "afro_puff", HAIR["black"], "happy", 28)
    draw_head(c, cx + 90, cy + 55, SKIN["peach"], "straight", HAIR["blonde"], "happy", 28)
    draw_head(c, cx - 95, cy - 45, SKIN["warm"], "braids", HAIR["dark_brown"], "happy", 26)
    draw_head(c, cx + 95, cy - 40, SKIN["rich"], "curly", HAIR["brown"], "happy", 26)
    # center banner
    _rect(c, cx - 80, cy - 30, 160, 70, fill=white, stroke=BRAND_GREEN, sw=2.5, radius=10)
    c.setFillColor(BRAND_GREEN)
    c.setFont("Helvetica-Bold", 22)
    c.drawCentredString(cx, cy + 8, "I am me")
    c.setFont("Helvetica", 10)
    c.setFillColor(MUTED)
    c.drawCentredString(cx, cy - 12, "unique · welcome · enough")


CARDS = [
    ("Happy Face", ill_happy),
    ("Calm Face", ill_calm),
    ("Sad Face", ill_sad),
    ("Excited Face", ill_excited),
    ("Family of 2", ill_family2),
    ("Family of 3", ill_family3),
    ("Family with Grandparent", ill_family_grandparent),
    ("Curly Hair", ill_curly_child),
    ("Straight Hair", ill_straight_child),
    ("Wheels & Joy", ill_wheelchair),
    ("Favorite Play: Blocks", ill_blocks),
    ("Favorite Play: Books", ill_books),
    ("Favorite Play: Running", ill_outdoor),
    ("My Name Card", ill_name_card),
    ("I Am Me", ill_affirmation),
]


def build_pdf() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(PDF_PATH), pagesize=letter)
    c.setTitle("All About Me Picture Card Pack — Little Learner Hub by Leah")
    c.setAuthor("Little Learner Hub by Leah")
    c.setSubject("Preschool All About Me picture cards (DRAFT — Owner review)")

    page_teacher_instructions(c)
    c.showPage()

    for i, (title, fn) in enumerate(CARDS, start=2):
        card_page(c, i, title, fn)
        c.showPage()

    c.save()
    return 1 + len(CARDS)


def export_page_pngs():
    PAGES_DIR.mkdir(parents=True, exist_ok=True)
    # clean old pages
    for old in PAGES_DIR.glob("*.png"):
        old.unlink()
    prefix = str(PAGES_DIR / "page")
    subprocess.run(
        ["pdftoppm", "-png", "-r", "150", str(PDF_PATH), prefix],
        check=True,
    )
    return sorted(PAGES_DIR.glob("page-*.png"))


def _load_font(size: int):
    for path in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
    ):
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def _brand_discreet(draw: ImageDraw.ImageDraw, w: int, h: int):
    font = _load_font(14)
    text = "Little Learner Hub by Leah · littlelearnershubbyleah.com"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    draw.text(((w - tw) / 2, h - 28), text, fill=(90, 107, 93), font=font)


def build_self_portrait_example():
    """Process-art style self portrait illustration (not a photo)."""
    w, h = 900, 700
    img = Image.new("RGB", (w, h), (251, 248, 242))
    d = ImageDraw.Draw(img)

    # table surface
    d.rectangle([40, 480, w - 40, h - 50], fill=(196, 160, 106))
    d.rectangle([40, 120, w - 40, 490], fill=(232, 240, 234))

    # paper
    d.rounded_rectangle([220, 140, 680, 520], radius=8, fill=(255, 255, 255), outline=(90, 107, 93), width=3)

    # process-art portrait: loose paint shapes, collage scraps — not a realistic face photo
    # paint blobs for hair
    for xy, col in [
        ((340, 190, 420, 270), (42, 26, 18)),
        ((380, 170, 470, 250), (74, 47, 27)),
        ((450, 185, 540, 265), (42, 26, 18)),
        ((500, 200, 580, 280), (28, 18, 12)),
    ]:
        d.ellipse(xy, fill=col)
    # face oval — crayon-y peach
    d.ellipse([360, 230, 560, 440], fill=(225, 172, 105), outline=(90, 64, 48), width=3)
    # eyes — simple marks
    d.ellipse([410, 300, 435, 325], fill=(42, 51, 44))
    d.ellipse([485, 300, 510, 325], fill=(42, 51, 44))
    d.ellipse([415, 303, 422, 310], fill=(255, 255, 255))
    d.ellipse([490, 303, 497, 310], fill=(255, 255, 255))
    # smile stroke
    d.arc([420, 340, 500, 400], 20, 160, fill=(42, 51, 44), width=4)
    # collage scrap rectangle (fabric/paper feel)
    d.rectangle([390, 410, 450, 455], fill=(91, 143, 113), outline=(45, 80, 60), width=2)
    d.rectangle([470, 405, 530, 450], fill=(212, 93, 121), outline=(120, 40, 60), width=2)
    # paint smudges on paper edge
    d.ellipse([250, 160, 290, 200], fill=(224, 122, 74, 180) if False else (224, 122, 74))
    d.ellipse([600, 450, 650, 495], fill=(91, 143, 213))

    # crayons on table
    for i, col in enumerate([(224, 122, 74), (91, 143, 213), (61, 107, 79), (212, 93, 121)]):
        x0 = 80 + i * 35
        d.rounded_rectangle([x0, 540, x0 + 22, 640], radius=4, fill=col, outline=(40, 40, 40), width=1)

    # paint cup
    d.rectangle([760, 500, 820, 600], fill=(255, 255, 255), outline=(90, 107, 93), width=2)
    d.ellipse([755, 490, 825, 520], fill=(167, 201, 138), outline=(90, 107, 93), width=2)

    title_font = _load_font(28)
    d.text((50, 40), "Self-Portrait Studio — process art example", fill=(61, 107, 79), font=title_font)
    sub = _load_font(16)
    d.text((50, 78), "Child-made marks & collage · not a photo of a real child", fill=(90, 107, 93), font=sub)
    _brand_discreet(d, w, h)

    path = IMAGES_DIR / "self-portrait-example.png"
    img.save(path, "PNG")
    alt = IMAGES_DIR / "self-portrait-example.png.txt"
    alt.write_text(
        "Illustration of a classroom self-portrait process-art example on white paper: "
        "loose painted hair shapes, a simple drawn face, and collage color scraps on a table "
        "with crayons and a paint cup. Not a photograph of a real child. "
        "Little Learner Hub by Leah branding at the bottom.\n",
        encoding="utf-8",
    )
    return path


def build_name_discovery_setup():
    """Tray with name cards and letter magnets illustrated."""
    w, h = 900, 700
    img = Image.new("RGB", (w, h), (245, 240, 232))
    d = ImageDraw.Draw(img)

    # shelf / table
    d.rectangle([0, 520, w, h], fill=(140, 110, 70))
    d.rectangle([0, 500, w, 530], fill=(120, 95, 60))

    # tray
    d.rounded_rectangle([80, 160, 820, 500], radius=18, fill=(210, 185, 145), outline=(110, 85, 55), width=4)
    d.rounded_rectangle([100, 180, 800, 480], radius=12, fill=(232, 220, 195), outline=(150, 120, 80), width=2)

    # three large name cards
    card_specs = [
        (140, 210, 280, 320, "Ava", (232, 240, 234)),
        (360, 210, 500, 320, "Jay", (232, 236, 245)),
        (580, 210, 720, 320, "Mia", (245, 232, 236)),
    ]
    font_name = _load_font(36)
    font_small = _load_font(14)
    for x0, y0, x1, y1, name, fill in card_specs:
        d.rounded_rectangle([x0, y0, x1, y1], radius=8, fill=fill, outline=(61, 107, 79), width=3)
        # photo placeholder — abstract circle (not a real face photo)
        d.ellipse([x0 + 40, y0 + 18, x0 + 100, y0 + 78], fill=(224, 172, 105), outline=(90, 64, 48), width=2)
        d.text((x0 + 30, y1 - 45), name, fill=(42, 51, 44), font=font_name)

    # letter magnets scattered on tray
    magnets = [
        (160, 360, "A", (224, 122, 74)),
        (230, 380, "V", (91, 143, 213)),
        (300, 355, "A", (61, 107, 79)),
        (400, 370, "J", (212, 93, 121)),
        (470, 350, "A", (232, 184, 74)),
        (540, 385, "Y", (107, 91, 149)),
        (620, 360, "M", (61, 139, 110)),
        (690, 375, "I", (224, 122, 74)),
        (750, 355, "A", (91, 143, 213)),
        (200, 430, "S", (140, 110, 70)),
        (280, 440, "O", (74, 120, 160)),
        (500, 430, "L", (180, 90, 90)),
    ]
    font_mag = _load_font(28)
    for x, y, ch, col in magnets:
        d.rounded_rectangle([x, y, x + 48, y + 48], radius=6, fill=col, outline=(40, 40, 40), width=2)
        # letter in white
        bbox = d.textbbox((0, 0), ch, font=font_mag)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        d.text((x + (48 - tw) / 2, y + (48 - th) / 2 - 2), ch, fill=(255, 255, 255), font=font_mag)

    title_font = _load_font(28)
    d.text((50, 40), "My Name Discovery — tray setup", fill=(61, 107, 79), font=title_font)
    sub = _load_font(16)
    d.text(
        (50, 78),
        "Name cards + letter magnets ready at child height (illustrated setup)",
        fill=(90, 107, 93),
        font=sub,
    )
    _brand_discreet(d, w, h)

    path = IMAGES_DIR / "name-discovery-setup.png"
    img.save(path, "PNG")
    alt = IMAGES_DIR / "name-discovery-setup.png.txt"
    alt.write_text(
        "Illustrated classroom tray setup for name discovery: three colorful name cards "
        "(with simple abstract face circles, not real photos) and scattered letter magnets "
        "on a wooden tray on a table. Discreet Little Learner Hub by Leah branding at the bottom.\n",
        encoding="utf-8",
    )
    return path


def main():
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    PAGES_DIR.mkdir(parents=True, exist_ok=True)

    page_count = build_pdf()
    pages = export_page_pngs()
    sp = build_self_portrait_example()
    nd = build_name_discovery_setup()

    print(f"PDF: {PDF_PATH}")
    print(f"Pages: {page_count}")
    print(f"PNG count: {len(pages)}")
    print(f"PNG dir: {PAGES_DIR}")
    print(f"Image: {sp}")
    print(f"Image: {nd}")


if __name__ == "__main__":
    main()
