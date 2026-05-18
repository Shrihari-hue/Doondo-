"""
Doondo V2 — Employer UI mockups (premium pass + feature expansion).

20 pages, 390x844 iPhone-Pro shape, warm-dark luxe palette. Built from
the design tokens in packages/tokens/src/colors.ts:
  warm-black canvas, brick coral hero, deep jade trust, champagne gold
  reserved for premium moments.

Adds the standout features:
  - Doondo Score badge on every applicant (CIBIL of blue-collar work)
  - Crew Apply card (3-5 workers as one unit)
  - Anti-Ghost engine score on Profile + Posts
  - Reverse Interview answers on Post a Job
  - Women-only / Diaspora / Auction toggles on Post a Job
  - In-chat translate + quick-reply templates on Conversation
  - 8 new feature screens (Hire Reels, Skill Passport, Live Auction,
    Interview Scheduler, Shift Check-in, Doondo Coach, Hire Celebration,
    Doondo for Women)
"""

import os, html, math
import cairosvg
from PIL import Image, ImageDraw, ImageFont


def esc(t):
    return html.escape(str(t), quote=False)


# ───────────────────────────────────────────────────────────────────────
# Tokens
# ───────────────────────────────────────────────────────────────────────

W, H = 390, 844
TAB_BAR = 96

BG_CANVAS = "#0A0809"
BG_SURFACE = "#141114"
BG_ELEVATED = "#1A1718"
BG_SUNKEN = "#0D0B0D"

TEXT_PRIMARY = "#EDE6D7"
TEXT_SECONDARY = "#9C948A"
TEXT_TERTIARY = "#6A655E"

CORAL = "#C8533A"
CORAL_LIGHT = "#D9694F"
CORAL_DEEP = "#9C3B26"
CORAL_SUBTLE = "rgba(200, 83, 58, 0.10)"
CORAL_BORDER = "rgba(200, 83, 58, 0.45)"

JADE = "#168860"
JADE_LIGHT = "#2DA376"
JADE_SUBTLE = "rgba(14, 110, 84, 0.16)"
JADE_BORDER = "rgba(14, 110, 84, 0.50)"

AMBER = "#E0A744"
AMBER_DEEP = "#A87519"
AMBER_SUBTLE = "rgba(224, 167, 68, 0.12)"
AMBER_BORDER = "rgba(224, 167, 68, 0.45)"

GOLD_LIGHT = "#E0C58A"
GOLD = "#C7A87A"
GOLD_DEEP = "#8C7045"
GOLD_HAIRLINE = "rgba(199, 168, 122, 0.32)"
GOLD_HAIRLINE_STRONG = "rgba(199, 168, 122, 0.55)"
GOLD_SUBTLE = "rgba(184, 153, 104, 0.08)"

BLUE = "#3E7FD9"
GREEN_BRIGHT = "#10B981"
PINK = "#EC6F8F"
PINK_LIGHT = "#F4A0B6"
PINK_SUBTLE = "rgba(236, 111, 143, 0.12)"
PINK_BORDER = "rgba(236, 111, 143, 0.45)"

BORDER_HAIR = "rgba(237, 230, 215, 0.06)"
BORDER_DEFAULT = "rgba(237, 230, 215, 0.10)"
BORDER_STRONG = "rgba(237, 230, 215, 0.20)"

FONT = "Inter, Helvetica Neue, Segoe UI, system-ui, sans-serif"
FONT_DISPLAY = "Inter Tight, Inter, Helvetica Neue, sans-serif"
FONT_SERIF = "Cormorant Garamond, Playfair Display, Times New Roman, serif"
FONT_MONO = "JetBrains Mono, Menlo, Consolas, monospace"


def defs():
    return f'''
<defs>
  <radialGradient id="canvasVignette" cx="50%" cy="0%" r="120%">
    <stop offset="0%" stop-color="#1A1518" stop-opacity="1"/>
    <stop offset="55%" stop-color="{BG_CANVAS}" stop-opacity="1"/>
    <stop offset="100%" stop-color="#050405" stop-opacity="1"/>
  </radialGradient>
  <radialGradient id="cardLight" cx="50%" cy="-10%" r="85%">
    <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.045"/>
    <stop offset="60%" stop-color="#FFFFFF" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="cardPremiumGlow" cx="0%" cy="0%" r="85%">
    <stop offset="0%" stop-color="{GOLD}" stop-opacity="0.10"/>
    <stop offset="60%" stop-color="{GOLD}" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="coralBtn" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="{CORAL_LIGHT}"/>
    <stop offset="50%" stop-color="{CORAL}"/>
    <stop offset="100%" stop-color="{CORAL_DEEP}"/>
  </linearGradient>
  <linearGradient id="coralBtnGlow" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.18"/>
    <stop offset="40%" stop-color="#FFFFFF" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="goldBrush" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="{GOLD_LIGHT}"/>
    <stop offset="50%" stop-color="{GOLD}"/>
    <stop offset="100%" stop-color="{GOLD_DEEP}"/>
  </linearGradient>
  <linearGradient id="goldText" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="{GOLD_LIGHT}"/>
    <stop offset="100%" stop-color="{GOLD}"/>
  </linearGradient>
  <radialGradient id="goldOrb" cx="40%" cy="32%" r="70%">
    <stop offset="0%" stop-color="#F2E0B5"/>
    <stop offset="55%" stop-color="{GOLD}"/>
    <stop offset="100%" stop-color="{GOLD_DEEP}"/>
  </radialGradient>
  <radialGradient id="avatarCoral" cx="35%" cy="30%" r="80%">
    <stop offset="0%" stop-color="#E2876C"/>
    <stop offset="60%" stop-color="{CORAL}"/>
    <stop offset="100%" stop-color="{CORAL_DEEP}"/>
  </radialGradient>
  <radialGradient id="avatarJade" cx="35%" cy="30%" r="80%">
    <stop offset="0%" stop-color="#3DA88A"/>
    <stop offset="100%" stop-color="#0A5A45"/>
  </radialGradient>
  <radialGradient id="avatarSlate" cx="35%" cy="30%" r="80%">
    <stop offset="0%" stop-color="#564E48"/>
    <stop offset="100%" stop-color="#2A2522"/>
  </radialGradient>
  <radialGradient id="avatarPink" cx="35%" cy="30%" r="80%">
    <stop offset="0%" stop-color="#F2A0B5"/>
    <stop offset="100%" stop-color="#8A2E4A"/>
  </radialGradient>
  <radialGradient id="auroraCoral" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="{CORAL}" stop-opacity="0.30"/>
    <stop offset="100%" stop-color="{CORAL}" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="auroraGold" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="{GOLD}" stop-opacity="0.20"/>
    <stop offset="100%" stop-color="{GOLD}" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="auroraJade" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="{JADE_LIGHT}" stop-opacity="0.16"/>
    <stop offset="100%" stop-color="{JADE_LIGHT}" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="auroraPink" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="{PINK}" stop-opacity="0.25"/>
    <stop offset="100%" stop-color="{PINK}" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="reelGrad" cx="50%" cy="50%" r="80%">
    <stop offset="0%" stop-color="#2A1E22"/>
    <stop offset="100%" stop-color="#0A0809"/>
  </radialGradient>
  <filter id="glowSoft" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="4"/>
  </filter>
</defs>
'''


def svg_open():
    return (f'<svg xmlns="http://www.w3.org/2000/svg" '
            f'viewBox="0 0 {W} {H}">'
            f'{defs()}'
            f'<rect width="{W}" height="{H}" fill="url(#canvasVignette)"/>')


def svg_close():
    return "</svg>"


def status_bar(white=False):
    col = "#FFFFFF" if white else TEXT_PRIMARY
    return f'''
<g font-family="{FONT}" fill="{col}">
  <text x="22" y="24" font-size="12.5" font-weight="600" letter-spacing="-0.2">9:41</text>
  <g transform="translate(326,15)" fill="{col}">
    <rect x="0" y="6" width="3" height="6" rx="0.5" opacity="0.95"/>
    <rect x="5" y="3" width="3" height="9" rx="0.5" opacity="0.95"/>
    <rect x="10" y="0" width="3" height="12" rx="0.5" opacity="0.95"/>
    <g transform="translate(20,1)">
      <rect x="0" y="2" width="22" height="10" rx="2.5" fill="none" stroke="{col}" stroke-width="0.8" opacity="0.7"/>
      <rect x="23" y="5" width="1.5" height="4" rx="0.5" fill="{col}" opacity="0.6"/>
      <rect x="2" y="4" width="14" height="6" rx="1" fill="{col}"/>
    </g>
  </g>
</g>
'''


def home_indicator(white=False):
    col = "#FFFFFF" if white else TEXT_PRIMARY
    return (f'<rect x="{W//2 - 65}" y="{H - 7}" width="130" height="4" '
            f'rx="2" fill="{col}" opacity="0.42"/>')


def monogram(x, y, scale=1.0):
    return f'''
<g transform="translate({x},{y}) scale({scale})">
  <circle cx="0" cy="0" r="14" fill="none" stroke="{GOLD_HAIRLINE_STRONG}" stroke-width="0.6"/>
  <text x="0" y="5" font-family="{FONT_SERIF}" font-size="17" font-style="italic"
        font-weight="500" fill="url(#goldText)" text-anchor="middle">d</text>
</g>
'''


def hairline(x1, y1, x2, y2, color=BORDER_HAIR, w=0.5):
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="{w}"/>'


def gold_rule(x, y, width=40):
    return (f'<rect x="{x}" y="{y}" width="{width}" height="1.2" '
            f'fill="url(#goldBrush)" opacity="0.85"/>')


def tab_bar(active):
    items = [("Posts", "◆"), ("Applicants", "◉"), ("Chat", "✦"), ("You", "⌘")]
    tab_w = W / 4
    parts = [
        f'<rect x="0" y="{H-TAB_BAR}" width="{W}" height="{TAB_BAR}" fill="#0F0D0F"/>',
        f'<line x1="0" y1="{H-TAB_BAR}" x2="{W}" y2="{H-TAB_BAR}" stroke="{GOLD_HAIRLINE}" stroke-width="0.5"/>',
    ]
    for i, (label, glyph) in enumerate(items):
        cx = tab_w * (i + 0.5)
        is_active = label == active
        col = TEXT_PRIMARY if is_active else TEXT_TERTIARY
        if is_active:
            parts.append(f'<rect x="{cx-10}" y="{H-TAB_BAR}" width="20" height="1.5" rx="1" fill="url(#goldBrush)"/>')
        parts.append(f'<text x="{cx}" y="{H-TAB_BAR+30}" font-family="{FONT}" font-size="18" fill="{col}" text-anchor="middle">{glyph}</text>')
        weight = "500" if is_active else "400"
        parts.append(f'<text x="{cx}" y="{H-TAB_BAR+50}" font-family="{FONT}" font-size="10.5" font-weight="{weight}" letter-spacing="0.4" fill="{col}" text-anchor="middle">{esc(label)}</text>')
    return "\n".join(parts) + "\n" + home_indicator()


def pill(x, y, label, tone="neutral", leading=None, size=10.5, height=22):
    palette = {
        "neutral": (BG_ELEVATED, TEXT_SECONDARY, BORDER_DEFAULT),
        "info":    ("rgba(62,127,217,0.12)", "#7FA9FF", "rgba(62,127,217,0.38)"),
        "success": (JADE_SUBTLE, "#5EC4A0", JADE_BORDER),
        "warning": (AMBER_SUBTLE, "#F4C76B", AMBER_BORDER),
        "premium": (GOLD_SUBTLE, GOLD_LIGHT, GOLD_HAIRLINE_STRONG),
        "hero":    (CORAL_SUBTLE, CORAL_LIGHT, CORAL_BORDER),
        "ghost":   ("transparent", TEXT_SECONDARY, BORDER_DEFAULT),
        "pink":    (PINK_SUBTLE, PINK_LIGHT, PINK_BORDER),
    }
    bg, fg, br = palette[tone]
    text = f"{leading}  {label}" if leading else label
    w = max(42, int(len(text) * size * 0.62) + 18)
    return f'''
<g><rect x="{x}" y="{y}" width="{w}" height="{height}" rx="{height/2}" fill="{bg}" stroke="{br}" stroke-width="0.5"/>
<text x="{x+w/2}" y="{y+height/2+3.5}" font-family="{FONT}" font-size="{size}" font-weight="500" letter-spacing="0.3" fill="{fg}" text-anchor="middle">{esc(text)}</text></g>'''


def card(x, y, w, h, premium=False, sunken=False, accent=None):
    fill = BG_SUNKEN if sunken else BG_SURFACE
    stroke = GOLD_HAIRLINE if premium else BORDER_DEFAULT
    if accent == "pink":
        stroke = PINK_BORDER
    parts = []
    if premium:
        parts.append(f'<rect x="{x-4}" y="{y-4}" width="{w+8}" height="{h+8}" rx="18" fill="url(#auroraGold)" opacity="0.55"/>')
    parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="16" fill="{fill}" stroke="{stroke}" stroke-width="{0.7 if premium else 0.6}"/>')
    parts.append(f'<rect x="{x+1}" y="{y+1}" width="{w-2}" height="{h-2}" rx="15" fill="url(#cardLight)"/>')
    if premium:
        parts.append(f'<rect x="{x+1}" y="{y+1}" width="{w-2}" height="{h-2}" rx="15" fill="url(#cardPremiumGlow)" opacity="0.7"/>')
        parts.append(f'<rect x="{x+18}" y="{y+0.5}" width="{w-36}" height="0.6" fill="url(#goldBrush)" opacity="0.55"/>')
    return "".join(parts)


def primary_btn(x, y, w, label, h=54, glow=True):
    parts = []
    if glow:
        parts.append(f'<rect x="{x-6}" y="{y-2}" width="{w+12}" height="{h+10}" rx="20" fill="url(#auroraCoral)" opacity="0.7"/>')
    parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="16" fill="url(#coralBtn)" stroke="{CORAL_DEEP}" stroke-width="0.5"/>')
    parts.append(f'<rect x="{x+1}" y="{y+1}" width="{w-2}" height="{h*0.55}" rx="15" fill="url(#coralBtnGlow)"/>')
    parts.append(f'<text x="{x+w/2}" y="{y+h/2+5}" font-family="{FONT}" font-size="14.5" font-weight="600" letter-spacing="0.3" fill="#FFFFFF" text-anchor="middle">{esc(label)}</text>')
    return "\n".join(parts)


def gold_btn(x, y, w, label, h=54):
    return f'''
<rect x="{x-6}" y="{y-2}" width="{w+12}" height="{h+10}" rx="20" fill="url(#auroraGold)" opacity="0.9"/>
<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="16" fill="url(#goldBrush)" stroke="{GOLD_DEEP}" stroke-width="0.5"/>
<rect x="{x+1}" y="{y+1}" width="{w-2}" height="{h*0.55}" rx="15" fill="url(#coralBtnGlow)"/>
<text x="{x+w/2}" y="{y+h/2+5}" font-family="{FONT}" font-size="14.5" font-weight="600" letter-spacing="0.4" fill="#241B0B" text-anchor="middle">{esc(label)}</text>'''


def secondary_btn(x, y, w, label, h=54):
    return f'''
<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="16" fill="{BG_SURFACE}" stroke="{BORDER_STRONG}" stroke-width="0.6"/>
<rect x="{x+1}" y="{y+1}" width="{w-2}" height="{h*0.55}" rx="15" fill="url(#cardLight)"/>
<text x="{x+w/2}" y="{y+h/2+5}" font-family="{FONT}" font-size="14" font-weight="500" letter-spacing="0.3" fill="{TEXT_PRIMARY}" text-anchor="middle">{esc(label)}</text>'''


def eyebrow(x, y, text, color=TEXT_TERTIARY, size=10.5, spacing=2.0, anchor="start"):
    return f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" font-weight="600" letter-spacing="{spacing}" fill="{color}" text-anchor="{anchor}">{esc(text.upper())}</text>'


def display(x, y, text, size=34, color=TEXT_PRIMARY, weight="500",
            italic=False, serif=False, anchor="start"):
    font = FONT_SERIF if serif else FONT_DISPLAY
    style = ' font-style="italic"' if italic else ""
    return f'<text x="{x}" y="{y}" font-family="{font}" font-size="{size}" font-weight="{weight}" fill="{color}" letter-spacing="-0.8" text-anchor="{anchor}"{style}>{esc(text)}</text>'


def head(x, y, text, size=16, color=TEXT_PRIMARY, weight="500", anchor="start"):
    return f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" font-weight="{weight}" letter-spacing="-0.2" fill="{color}" text-anchor="{anchor}">{esc(text)}</text>'


def body(x, y, text, size=12.5, color=TEXT_SECONDARY, weight="400", anchor="start"):
    return f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" font-weight="{weight}" fill="{color}" letter-spacing="0.05" text-anchor="{anchor}">{esc(text)}</text>'


def avatar(cx, cy, r, initial, kind="coral", premium=False, italic=True):
    grad = {"coral": "avatarCoral", "jade": "avatarJade",
            "slate": "avatarSlate", "pink": "avatarPink"}[kind]
    parts = []
    if premium:
        parts.append(f'<circle cx="{cx}" cy="{cy}" r="{r+8}" fill="url(#auroraGold)" opacity="0.9"/>')
        parts.append(f'<circle cx="{cx}" cy="{cy}" r="{r+3}" fill="none" stroke="url(#goldBrush)" stroke-width="1.0" opacity="0.95"/>')
    parts.append(f'<circle cx="{cx}" cy="{cy}" r="{r+0.5}" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="0.5"/>')
    parts.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#{grad})"/>')
    font = FONT_SERIF if italic else FONT_DISPLAY
    style = ' font-style="italic"' if italic else ""
    parts.append(f'<text x="{cx}" y="{cy + r*0.34}" font-family="{font}" font-size="{int(r*1.05)}" font-weight="500" fill="white" text-anchor="middle" opacity="0.95"{style}>{esc(initial)}</text>')
    return "\n".join(parts)


def chip(x, y, label, active=False, size=11, height=30):
    fg = "#F2DDC5" if active else TEXT_SECONDARY
    bg = "rgba(199,168,122,0.10)" if active else "transparent"
    br = GOLD_HAIRLINE_STRONG if active else BORDER_DEFAULT
    w = max(50, int(len(label) * size * 0.62) + 22)
    return f'''<g><rect x="{x}" y="{y}" width="{w}" height="{height}" rx="{height/2}" fill="{bg}" stroke="{br}" stroke-width="0.6"/>
<text x="{x+w/2}" y="{y+height/2+3.5}" font-family="{FONT}" font-size="{size}" font-weight="500" letter-spacing="0.4" fill="{fg}" text-anchor="middle">{esc(label)}</text></g>'''


def filter_chip(x, y, label, active=False):
    fg = CORAL_LIGHT if active else TEXT_SECONDARY
    bg = CORAL_SUBTLE if active else "transparent"
    br = CORAL_BORDER if active else BORDER_DEFAULT
    w = max(46, int(len(label) * 11 * 0.62) + 22)
    return f'''<g><rect x="{x}" y="{y}" width="{w}" height="28" rx="14" fill="{bg}" stroke="{br}" stroke-width="0.6"/>
<text x="{x+w/2}" y="{y+18}" font-family="{FONT}" font-size="11" font-weight="500" letter-spacing="0.3" fill="{fg}" text-anchor="middle">{esc(label)}</text></g>'''


def doondo_score(x, y, score, size=44):
    """Compact circular badge — the CIBIL of blue-collar work."""
    grade = "A+" if score >= 90 else ("A" if score >= 80 else "B")
    color = GOLD_LIGHT if score >= 90 else (JADE_LIGHT if score >= 80 else AMBER)
    return f'''
<g>
  <circle cx="{x}" cy="{y}" r="{size/2}" fill="rgba(199,168,122,0.08)" stroke="{color}" stroke-width="0.8"/>
  <text x="{x}" y="{y-3}" font-family="{FONT}" font-size="9.5" font-weight="600" letter-spacing="1.4" fill="{TEXT_TERTIARY}" text-anchor="middle">SCORE</text>
  <text x="{x}" y="{y+11}" font-family="{FONT_DISPLAY}" font-size="14" font-weight="600" letter-spacing="-0.4" fill="{color}" text-anchor="middle">{score}</text>
</g>
'''


# ───────────────────────────────────────────────────────────────────────
# Page 1 — Welcome (with subtle Doondo Pulse widget hint)
# ───────────────────────────────────────────────────────────────────────

def page_welcome():
    s = [svg_open(), status_bar()]
    s.append(f'<ellipse cx="80" cy="180" rx="240" ry="220" fill="url(#auroraCoral)"/>')
    s.append(f'<ellipse cx="360" cy="380" rx="200" ry="200" fill="url(#auroraGold)"/>')
    s.append(f'<ellipse cx="200" cy="700" rx="260" ry="220" fill="url(#auroraJade)"/>')
    s.append(monogram(W-42, 42))

    s.append(eyebrow(28, 134, "DOONDO  ·  EST. 2025", spacing=2.6))
    s.append(gold_rule(28, 150, 38))
    s.append(display(28, 230, "Hire", size=64))
    s.append(display(28, 290, "nearby.", size=64, italic=True, serif=True, color=GOLD_LIGHT))
    s.append(body(28, 330, "A quiet, premium way to find work and",
                  size=14.5, color=TEXT_SECONDARY))
    s.append(body(28, 352, "build a team — in your language, on", size=14.5, color=TEXT_SECONDARY))
    s.append(body(28, 374, "your terms.", size=14.5, color=TEXT_SECONDARY))

    # Hero orb + orbit
    cx, cy = W/2, 510
    s.append(f'<circle cx="{cx}" cy="{cy}" r="86" fill="none" stroke="{GOLD_HAIRLINE}" stroke-width="0.6"/>')
    s.append(f'<circle cx="{cx}" cy="{cy}" r="56" fill="none" stroke="{GOLD_HAIRLINE}" stroke-width="0.4"/>')
    s.append(f'<circle cx="{cx}" cy="{cy}" r="42" fill="url(#goldOrb)" opacity="0.9"/>')
    s.append(f'<circle cx="{cx-12}" cy="{cy-14}" r="9" fill="white" opacity="0.4"/>')
    s.append(f'<circle cx="{cx+86}" cy="{cy}" r="2.5" fill="{GOLD_LIGHT}"/>')
    s.append(f'<circle cx="{cx-56}" cy="{cy-28}" r="1.8" fill="{CORAL_LIGHT}"/>')

    # Language pill — premium glass pill in top-left, hints at language choice
    s.append(f'<rect x="22" y="74" width="92" height="28" rx="14" fill="rgba(237,230,215,0.06)" stroke="{BORDER_DEFAULT}" stroke-width="0.5"/>')
    s.append(body(36, 92, "हिंदी  ·  EN  ▾", size=11, color=TEXT_PRIMARY, weight="500"))

    # CTAs
    s.append(primary_btn(28, H - 240, W - 56, "Create your account"))
    s.append(secondary_btn(28, H - 170, W - 56, "I already have an account"))
    s.append(body(W/2, H - 104, "By continuing you agree to Doondo's Terms & Privacy.",
                  size=10.5, color=TEXT_TERTIARY, anchor="middle"))
    s.append(home_indicator())
    s.append(svg_close())
    return "".join(s)


# ───────────────────────────────────────────────────────────────────────
# Page 2 — Role Picker (with Women + Diaspora modes tucked in)
# ───────────────────────────────────────────────────────────────────────

def page_role_picker():
    s = [svg_open(), status_bar()]
    s.append(monogram(W-42, 42))

    s.append(eyebrow(28, 84, "LESS WHO HIRED THEM — MORE WHO FOUND THEM"))
    s.append(gold_rule(28, 100))
    s.append(display(28, 152, "Choose", size=34))
    s.append(display(28, 188, "your side.", size=34, italic=True, serif=True, color=GOLD_LIGHT))

    # Seeker card
    sx, sy, sw, sh = 22, 220, W-44, 90
    s.append(card(sx, sy, sw, sh))
    s.append(f'<circle cx="{sx+36}" cy="{sy+sh/2}" r="22" fill="rgba(62,127,217,0.18)" stroke="rgba(62,127,217,0.45)" stroke-width="0.5"/>')
    s.append(f'<text x="{sx+36}" y="{sy+sh/2+5}" font-family="{FONT}" font-size="18" fill="#7FA9FF" text-anchor="middle">◎</text>')
    s.append(eyebrow(sx+72, sy+30, "FOR JOB SEEKERS", color="#7FA9FF"))
    s.append(head(sx+72, sy+52, "Find work near you.", size=14))
    s.append(body(sx+72, sy+70, "Local jobs · skills · schedule.", size=11))
    s.append(body(sx+sw-22, sy+sh/2+4, "›", size=20, color=TEXT_SECONDARY, anchor="end"))

    # Employer card — premium
    ex, ey, ew, eh = 22, 326, W-44, 332
    s.append(card(ex, ey, ew, eh, premium=True))
    s.append(f'<ellipse cx="{ex+ew/2}" cy="{ey+72}" rx="{ew*0.6}" ry="76" fill="url(#auroraCoral)" opacity="0.7"/>')
    cx, cy = ex+ew/2, ey+82
    s.append(f'<polygon points="{cx},{cy-40} {cx+30},{cy} {cx},{cy+40} {cx-30},{cy}" fill="url(#goldBrush)" opacity="0.16"/>')
    s.append(f'<polygon points="{cx},{cy-40} {cx+30},{cy} {cx},{cy+40} {cx-30},{cy}" fill="none" stroke="url(#goldBrush)" stroke-width="0.9"/>')
    s.append(f'<polygon points="{cx},{cy-40} {cx+30},{cy} {cx-30},{cy}" fill="url(#goldBrush)" opacity="0.5"/>')

    s.append(eyebrow(ex+22, ey+158, "FOR EMPLOYERS", color=GOLD_LIGHT))
    s.append(gold_rule(ex+22, ey+170, 28))
    s.append(display(ex+22, ey+206, "Hire local", size=24))
    s.append(display(ex+22, ey+232, "talent.", size=24, italic=True, serif=True, color=GOLD_LIGHT))
    bullets = ["Post a job in minutes",
               "Crew Apply — hire 3-5 together",
               "Verified profiles & Doondo Score"]
    by = ey + 260
    for t in bullets:
        s.append(f'<circle cx="{ex+28}" cy="{by-4}" r="3" fill="url(#goldBrush)"/>')
        s.append(body(ex+44, by, t, size=12.5, color=TEXT_PRIMARY))
        by += 20

    s.append(primary_btn(ex+18, ey+eh-60, ew-36, "I want to hire workers"))

    # Mode chips at the bottom — Women + Diaspora
    s.append(eyebrow(28, 692, "OR ENTER A MODE", color=TEXT_TERTIARY, spacing=2.0))
    # Women mode chip
    cx_w = 22
    s.append(f'<rect x="{cx_w}" y="708" width="166" height="56" rx="14" fill="{PINK_SUBTLE}" stroke="{PINK_BORDER}" stroke-width="0.6"/>')
    s.append(f'<text x="{cx_w+18}" y="730" font-family="{FONT_SERIF}" font-size="16" fill="{PINK_LIGHT}" font-style="italic">♀</text>')
    s.append(head(cx_w+38, 729, "Doondo for Women", size=12, color=PINK_LIGHT))
    s.append(body(cx_w+38, 748, "Women employers · masked location", size=9.5, color="#C98AA0"))

    # Diaspora chip
    cx_d = 202
    s.append(f'<rect x="{cx_d}" y="708" width="166" height="56" rx="14" fill="rgba(62,127,217,0.10)" stroke="rgba(62,127,217,0.40)" stroke-width="0.6"/>')
    s.append(f'<text x="{cx_d+18}" y="730" font-family="{FONT_SERIF}" font-size="16" fill="#7FA9FF" font-style="italic">✈</text>')
    s.append(head(cx_d+38, 729, "Hiring from abroad", size=12, color="#7FA9FF"))
    s.append(body(cx_d+38, 748, "NRI · cooks, drivers, caretakers", size=9.5, color="#9EBBE6"))

    s.append(home_indicator())
    s.append(svg_close())
    return "".join(s)


# ───────────────────────────────────────────────────────────────────────
# Page 3 — Sign up (Voice biometric option)
# ───────────────────────────────────────────────────────────────────────

def page_signup():
    s = [svg_open(), status_bar()]
    s.append(monogram(W-42, 42))
    s.append(body(22, 70, "← Back", size=12, color=TEXT_SECONDARY))

    s.append(eyebrow(22, 116, "CREATE EMPLOYER ACCOUNT"))
    s.append(gold_rule(22, 132, 38))
    s.append(display(22, 178, "Welcome to", size=26))
    s.append(display(22, 210, "Doondo.", size=26, italic=True, serif=True, color=GOLD_LIGHT))

    fields = [
        ("BUSINESS NAME", "Doondo Salon & Spa"),
        ("YOUR NAME", "Shree Kulkarni"),
        ("PHONE", "+91 98765 43210"),
        ("EMAIL", "shree@doondosalon.in"),
    ]
    y = 244
    for label, val in fields:
        s.append(eyebrow(22, y, label, size=9.5, spacing=1.6, color=TEXT_TERTIARY))
        s.append(f'<rect x="22" y="{y+10}" width="{W-44}" height="46" rx="14" fill="{BG_SURFACE}" stroke="{BORDER_DEFAULT}" stroke-width="0.6"/>')
        s.append(f'<rect x="23" y="{y+11}" width="{W-46}" height="22" rx="13" fill="url(#cardLight)"/>')
        s.append(f'<text x="40" y="{y+38}" font-family="{FONT}" font-size="13.5" fill="{TEXT_PRIMARY}" letter-spacing="0.2">{esc(val)}</text>')
        y += 68

    # Voice biometric card — replaces OTP for premium feel
    y = 528
    s.append(card(22, y, W-44, 88, premium=True))
    s.append(eyebrow(40, y+22, "AUTHENTICATE WITH VOICE", color=GOLD_LIGHT))
    s.append(head(40, y+46, "Say: \"Doondo, this is Shree.\"", size=13.5))
    s.append(body(40, y+66, "Faster than typing · harder to spoof than OTP",
                  size=10.5, color=TEXT_TERTIARY))
    # Mic visualization
    s.append(f'<circle cx="{W-58}" cy="{y+44}" r="22" fill="url(#goldOrb)" opacity="0.9"/>')
    s.append(f'<text x="{W-58}" y="{y+49}" font-family="{FONT}" font-size="14" fill="#241B0B" text-anchor="middle">🎙</text>')
    # waveform mini
    for i, h_v in enumerate([4, 8, 12, 16, 12, 8, 14, 10, 6]):
        s.append(f'<rect x="{W-128 + i*5}" y="{y+44 - h_v/2}" width="2.5" height="{h_v}" rx="1.2" fill="{GOLD}" opacity="{0.4 + (i%3)*0.2}"/>')

    # Use password instead link
    s.append(body(W/2, y+108, "Or use password instead", size=11.5, color=TEXT_SECONDARY, anchor="middle"))

    s.append(primary_btn(22, H - 152, W - 44, "Create account"))
    s.append(home_indicator())
    s.append(svg_close())
    return "".join(s)


# ───────────────────────────────────────────────────────────────────────
# Page 4 — Posts (with Anti-Ghost score + Festival ribbon + Wage strike chip)
# ───────────────────────────────────────────────────────────────────────

def page_posts():
    s = [svg_open(), status_bar()]
    s.append(monogram(W-42, 42))

    # Festival ribbon — subtle Diwali strip at the top (gold sparkle)
    s.append(f'<rect x="0" y="44" width="{W}" height="26" fill="rgba(199,168,122,0.06)"/>')
    s.append(f'<text x="{W/2}" y="62" font-family="{FONT}" font-size="11" font-weight="500" letter-spacing="1.4" fill="{GOLD_LIGHT}" text-anchor="middle">✦  DIWALI HIRING — decorator, cook, security spike  ✦</text>')

    s.append(eyebrow(22, 110, "POSTS"))
    s.append(gold_rule(22, 124, 28))
    s.append(display(22, 162, "Your", size=32))
    s.append(display(74, 162, "jobs.", size=32, italic=True, serif=True, color=GOLD_LIGHT))

    # Anti-Ghost response score in the header
    s.append(f'<rect x="{W-114}" y="138" width="92" height="38" rx="19" fill="{JADE_SUBTLE}" stroke="{JADE_BORDER}" stroke-width="0.6"/>')
    s.append(f'<text x="{W-100}" y="162" font-family="{FONT}" font-size="13" fill="#5EC4A0">●</text>')
    s.append(head(W-86, 156, "Replies < 4h", size=11.5, color="#5EC4A0"))
    s.append(body(W-86, 170, "Your response score: A+", size=9, color=JADE_LIGHT))

    s.append(body(22, 184, "4 total  ·  4-hour median reply", size=11.5))

    # OPEN section
    s.append(eyebrow(22, 218, "OPEN", color=TEXT_SECONDARY, size=10.5, spacing=1.6))
    s.append(hairline(64, 215, 360, 215, color=BORDER_HAIR))

    cx, cy, cw, ch = 22, 230, W-44, 138
    s.append(card(cx, cy, cw, ch))
    s.append(head(cx+18, cy+32, "Delivery rider, two-wheeler", size=14.5))
    s.append(body(cx+18, cy+52, "Indiranagar  ·  Gig  ·  ₹600 / day", size=11))
    s.append(pill(cx+cw-72, cy+18, "Active", tone="success"))
    s.append(hairline(cx+18, cy+76, cx+cw-18, cy+76))
    s.append(pill(cx+18, cy+90, "12 applicants", tone="info"))
    s.append(pill(cx+150, cy+90, "Pause", tone="ghost"))
    s.append(pill(cx+208, cy+90, "Auction", tone="hero"))
    # Reels indicator
    s.append(body(cx+18, cy+126, "4 video resumes attached", size=10, color=GOLD_LIGHT))

    # Card 2 — Paused with Wage-strike alert
    cy = 388
    s.append(card(cx, cy, cw, ch))
    s.append(head(cx+18, cy+32, "Salon assistant — weekends", size=14.5))
    s.append(body(cx+18, cy+52, "HSR Layout  ·  Part-time  ·  ₹450 / shift", size=11))
    s.append(pill(cx+cw-72, cy+18, "Paused", tone="warning"))
    s.append(hairline(cx+18, cy+76, cx+cw-18, cy+76))
    # Wage strike warning
    s.append(f'<rect x="{cx+18}" y="{cy+86}" width="{cw-36}" height="36" rx="10" fill="rgba(215,85,85,0.10)" stroke="rgba(215,85,85,0.4)" stroke-width="0.5"/>')
    s.append(f'<text x="{cx+30}" y="{cy+108}" font-family="{FONT}" font-size="11" fill="#E89999">⚠  2 verified workers flagged — wage / hours dispute</text>')

    # FILLED section
    s.append(eyebrow(22, 552, "FILLED", color=GOLD, spacing=1.6))
    s.append(hairline(70, 549, 360, 549, color=GOLD_HAIRLINE))

    cy = 566
    s.append(card(cx, cy, cw, 108, premium=True))
    s.append(head(cx+18, cy+34, "Cashier — Indiranagar shop", size=14.5))
    s.append(body(cx+18, cy+54, "Indiranagar  ·  Full-time  ·  ₹18 000 / month", size=11))
    s.append(pill(cx+cw-72, cy+18, "Filled", tone="premium", leading="★"))
    s.append(pill(cx+18, cy+76, "Mohammed Iqbal  ·  Day 12", tone="premium"))

    s.append(tab_bar("Posts"))
    s.append(svg_close())
    return "".join(s)


# ───────────────────────────────────────────────────────────────────────
# Page 5 — Post a Job (Reverse Interview + Women + Auction toggles)
# ───────────────────────────────────────────────────────────────────────

def page_post_job():
    s = [svg_open(), status_bar()]
    s.append(body(22, 70, "Cancel", size=12.5, color=TEXT_SECONDARY))
    s.append(monogram(W-42, 42))

    s.append(eyebrow(22, 110, "POST A JOB"))
    s.append(gold_rule(22, 124, 28))
    s.append(display(22, 168, "Tell us what", size=26))
    s.append(display(22, 198, "you need.", size=26, italic=True, serif=True, color=GOLD_LIGHT))

    # Title
    y = 230
    s.append(eyebrow(22, y, "TITLE", size=9.5, spacing=1.6))
    s.append(f'<rect x="22" y="{y+10}" width="{W-44}" height="46" rx="14" fill="{BG_SURFACE}" stroke="{BORDER_DEFAULT}" stroke-width="0.6"/>')
    s.append(f'<rect x="23" y="{y+11}" width="{W-46}" height="22" rx="13" fill="url(#cardLight)"/>')
    s.append(f'<text x="40" y="{y+38}" font-family="{FONT}" font-size="14" fill="{TEXT_PRIMARY}">Cook — South Indian breakfast</text>')

    # Pay + period combined (compact)
    y = 304
    s.append(eyebrow(22, y, "PAY", size=9.5, spacing=1.6))
    s.append(f'<rect x="22" y="{y+10}" width="170" height="46" rx="14" fill="{BG_SURFACE}" stroke="{BORDER_DEFAULT}" stroke-width="0.6"/>')
    s.append(f'<rect x="23" y="{y+11}" width="168" height="22" rx="13" fill="url(#cardLight)"/>')
    s.append(f'<text x="40" y="{y+39}" font-family="{FONT_SERIF}" font-style="italic" font-size="18" fill="{GOLD_LIGHT}">₹</text>')
    s.append(f'<text x="60" y="{y+39}" font-family="{FONT}" font-size="15" fill="{TEXT_PRIMARY}" font-weight="500">800</text>')
    s.append(f'<rect x="198" y="{y+10}" width="170" height="46" rx="14" fill="{BG_SURFACE}" stroke="{BORDER_DEFAULT}" stroke-width="0.6"/>')
    s.append(body(214, y+39, "per day  ▾", size=14, color=TEXT_PRIMARY))

    # REVERSE INTERVIEW — the wild one
    y = 376
    s.append(eyebrow(22, y, "REVERSE INTERVIEW · answer for the worker", color=GOLD_LIGHT, size=9.5, spacing=1.4))
    s.append(card(22, y+12, W-44, 174))
    questions = [
        ("Do you pay on time?", "Yes — weekly, every Saturday"),
        ("Is overtime paid?", "Yes — 1.5x after 8 hrs"),
        ("Do you provide PPE / uniform?", "Apron + cap"),
        ("Are there bathrooms for women?", "Yes, separate"),
        ("Written contract?", "Yes — signed copy given"),
    ]
    qy = y + 36
    for q, a in questions:
        s.append(f'<text x="40" y="{qy}" font-family="{FONT}" font-size="11" fill="{TEXT_SECONDARY}" letter-spacing="0.2">{esc(q)}</text>')
        s.append(f'<circle cx="{W-50}" cy="{qy-4}" r="6" fill="{JADE_SUBTLE}" stroke="{JADE_BORDER}" stroke-width="0.5"/>')
        s.append(f'<text x="{W-50}" y="{qy-1}" font-family="{FONT}" font-size="8" font-weight="700" fill="#5EC4A0" text-anchor="middle">✓</text>')
        s.append(f'<text x="40" y="{qy+15}" font-family="{FONT_SERIF}" font-style="italic" font-size="12" fill="{GOLD_LIGHT}">{esc(a)}</text>')
        qy += 28

    # Mode toggles — 3 segmented options
    y = 580
    s.append(eyebrow(22, y, "POSTING MODE", spacing=1.6))
    modes = [
        ("Standard", False, AMBER),
        ("Auction ⚡", True, CORAL_LIGHT),
        ("Women-only ♀", False, PINK_LIGHT),
    ]
    seg_w = (W - 44 - 12) / 3
    x = 22
    for label, active, col in modes:
        bg_fill = "rgba(199,168,122,0.14)" if active else BG_SURFACE
        br = GOLD_HAIRLINE_STRONG if active else BORDER_DEFAULT
        col_t = TEXT_PRIMARY if active else TEXT_SECONDARY
        s.append(f'<rect x="{x}" y="{y+12}" width="{seg_w}" height="40" rx="20" fill="{bg_fill}" stroke="{br}" stroke-width="0.6"/>')
        if active:
            s.append(f'<rect x="{x+1}" y="{y+13}" width="{seg_w-2}" height="19" rx="19" fill="url(#cardLight)"/>')
        s.append(f'<text x="{x+seg_w/2}" y="{y+38}" font-family="{FONT}" font-size="11.5" font-weight="500" letter-spacing="0.4" fill="{col_t}" text-anchor="middle">{esc(label)}</text>')
        x += seg_w + 6

    s.append(body(22, y+72, "Auction mode  ·  90-min countdown, surge pricing", size=10.5, color=CORAL_LIGHT))

    # Urgent toggle
    y = 692
    s.append(f'<rect x="22" y="{y}" width="{W-44}" height="52" rx="16" fill="rgba(224,167,68,0.08)" stroke="{AMBER_BORDER}" stroke-width="0.6"/>')
    s.append(f'<rect x="38" y="{y+14}" width="22" height="22" rx="6" fill="{AMBER}"/>')
    s.append(f'<text x="49" y="{y+31}" font-family="{FONT}" font-size="13" font-weight="700" fill="#1A1106" text-anchor="middle">✓</text>')
    s.append(head(74, y+26, "Mark as urgent", size=13, color="#F4C76B"))
    s.append(body(74, y+42, "Sorts ahead · notifies nearby seekers", size=10.5, color=TEXT_SECONDARY))

    s.append(home_indicator())
    s.append(svg_close())
    return "".join(s)


# ───────────────────────────────────────────────────────────────────────
# Page 6 — Applicants (Crew Apply + Doondo Score badges)
# ───────────────────────────────────────────────────────────────────────

def page_applicants():
    s = [svg_open(), status_bar()]
    s.append(monogram(W-42, 42))

    s.append(eyebrow(22, 100, "APPLICANTS"))
    s.append(gold_rule(22, 114, 28))
    s.append(display(22, 156, "People who", size=28))
    s.append(display(22, 186, "want this.", size=28, italic=True, serif=True, color=GOLD_LIGHT))

    # Available banner
    y = 210
    s.append(f'<rect x="22" y="{y}" width="{W-44}" height="64" rx="16" fill="rgba(16,185,129,0.10)" stroke="rgba(16,185,129,0.42)" stroke-width="0.6"/>')
    s.append(f'<circle cx="56" cy="{y+32}" r="22" fill="rgba(16,185,129,0.18)"/>')
    s.append(f'<circle cx="56" cy="{y+32}" r="16" fill="{GREEN_BRIGHT}"/>')
    s.append(f'<text x="56" y="{y+37}" font-family="{FONT}" font-size="14" fill="white" text-anchor="middle">⚡</text>')
    s.append(eyebrow(90, y+24, "AVAILABLE NOW", color="#7FE3BC", size=9.5))
    s.append(head(90, y+42, "7 broadcasting · 2 with reels", size=13))
    s.append(body(W-30, y+38, "›", size=22, color=GREEN_BRIGHT, anchor="end"))

    # Filter chips
    y = 290
    chips_ = [("All", True), ("New", False), ("Crew", False), ("Reels", False), ("Hired", False)]
    x = 22
    for label, active in chips_:
        s.append(filter_chip(x, y, label, active))
        x += max(46, int(len(label) * 11 * 0.62) + 22) + 6

    # CREW APPLY card — the standout, premium
    y = 330
    s.append(card(22, y, W-44, 122, premium=True))
    s.append(eyebrow(40, y+22, "CREW · APPLIED TOGETHER", color=GOLD_LIGHT))
    s.append(head(40, y+44, "Painters of HSR — crew of 4", size=14.5))
    # Avatar cluster
    for i, (initial, kind) in enumerate([("R","coral"),("A","jade"),("S","slate"),("M","pink")]):
        s.append(avatar(56 + i*22, y+82, 16, initial, kind=kind))
    s.append(body(160, y+82, "Combined Doondo Score: 86  ·  3.5 km",
                  size=11, color=TEXT_SECONDARY))
    s.append(pill(40, y+96, "interior + exterior + texture", tone="neutral"))
    s.append(pill(W-86, y+30, "5 days", tone="info"))
    # Hire all CTA
    s.append(body(W-44, y+106, "Hire all 4  ›", size=11.5, color=CORAL_LIGHT, weight="600", anchor="end"))

    # Individual applicants with Score badges
    seekers = [
        ("Mohammed Iqbal", "M", "slate", True, "Koramangala  ·  12m",
         "Cashier", "premium", 94),
        ("Anita Sharma", "A", "jade", False, "HSR Layout  ·  1h",
         "Salon", "success", 82),
    ]
    y = 468
    for name, ini, kind, prem, meta, status, tone, score in seekers:
        s.append(card(22, y, W-44, 120, premium=prem))
        s.append(avatar(48, y+50, 22, ini, kind=kind, premium=prem))
        s.append(head(84, y+44, name, size=14))
        if prem:
            s.append(pill(206, y+32, "Verified", tone="premium", leading="★"))
        s.append(body(84, y+62, meta, size=11))
        # Doondo Score (right side)
        s.append(doondo_score(W-50, y+44, score, size=36))
        # Skills row
        sx = 40
        for sk in ["billing", "english", "POS"]:
            s.append(pill(sx, y+82, sk, tone="neutral"))
            sx += max(42, int(len(sk) * 10.5 * 0.62) + 18) + 6
        # Smart Resume note
        s.append(body(40, y+108, "✦  AI tailored their resume to your job",
                      size=10, color=GOLD_LIGHT))
        y += 130

    s.append(tab_bar("Applicants"))
    s.append(svg_close())
    return "".join(s)


# ───────────────────────────────────────────────────────────────────────
# Page 7 — Per-job Applicants (with Smart Resume banner)
# ───────────────────────────────────────────────────────────────────────

def page_job_applicants():
    s = [svg_open(), status_bar()]
    s.append(monogram(W-42, 42))
    s.append(body(22, 70, "← Back", size=12, color=TEXT_SECONDARY))

    s.append(eyebrow(22, 116, "APPLICANTS  ·  12 TOTAL"))
    s.append(gold_rule(22, 130, 28))
    s.append(display(22, 178, "Delivery rider,", size=24))
    s.append(display(22, 208, "two-wheeler.", size=24, italic=True, serif=True, color=GOLD_LIGHT))

    # Smart Resume hint banner
    y = 230
    s.append(f'<rect x="22" y="{y}" width="{W-44}" height="42" rx="14" fill="rgba(199,168,122,0.06)" stroke="{GOLD_HAIRLINE}" stroke-width="0.5"/>')
    s.append(f'<text x="40" y="{y+18}" font-family="{FONT}" font-size="10.5" font-weight="600" letter-spacing="1.4" fill="{GOLD_LIGHT}">✦  SMART RESUMES</text>')
    s.append(body(40, y+34, "Each applicant's CV auto-tuned for this job",
                  size=11, color=TEXT_SECONDARY))

    # Sort/filter row
    y = 288
    s.append(f'<rect x="22" y="{y}" width="156" height="30" rx="15" fill="{BG_SURFACE}" stroke="{BORDER_DEFAULT}" stroke-width="0.6"/>')
    s.append(body(38, y+19, "Doondo Score  ▾", size=11, color=TEXT_PRIMARY))
    s.append(f'<rect x="186" y="{y}" width="120" height="30" rx="15" fill="{BG_SURFACE}" stroke="{BORDER_DEFAULT}" stroke-width="0.6"/>')
    s.append(body(202, y+19, "Verified  ✓", size=11, color=GOLD_LIGHT))

    seekers = [
        ("Mohammed Iqbal", "M", "slate", True, "Koramangala", "12m", 94, ["billing","english"]),
        ("Ravi Kumar", "R", "coral", True, "Indiranagar", "1h", 89, ["driving","bike"]),
        ("Suresh Patel", "S", "slate", False, "BTM Layout", "2h", 76, ["driving"]),
        ("Anita Sharma", "A", "jade", False, "HSR Layout", "4h", 82, ["customer"]),
    ]
    y = 332
    for name, ini, kind, prem, loc, when, score, skills in seekers:
        s.append(card(22, y, W-44, 96, premium=prem))
        s.append(avatar(48, y+48, 20, ini, kind=kind, premium=prem))
        s.append(head(82, y+34, name, size=13.5))
        if prem:
            nm_w = int(len(name) * 13.5 * 0.55) + 86
            s.append(f'<text x="{nm_w}" y="{y+34}" font-family="{FONT}" font-size="11" fill="{GOLD_LIGHT}">★</text>')
        s.append(body(82, y+52, f"{loc}  ·  {when}", size=10.5))
        # Skills
        sx = 82
        for sk in skills:
            s.append(pill(sx, y+66, sk, tone="neutral"))
            sx += max(42, int(len(sk) * 10.5 * 0.62) + 18) + 6
        # Doondo Score
        s.append(doondo_score(W-46, y+48, score, size=34))
        y += 106

    s.append(home_indicator())
    s.append(svg_close())
    return "".join(s)


# ───────────────────────────────────────────────────────────────────────
# Page 8 — Applicant Detail (Doondo Score, Reel preview, Constitution)
# ───────────────────────────────────────────────────────────────────────

def page_applicant_detail():
    s = [svg_open(), status_bar()]
    s.append(monogram(W-42, 42))
    s.append(body(22, 70, "← Back", size=12, color=TEXT_SECONDARY))

    s.append(f'<ellipse cx="{W/2}" cy="170" rx="240" ry="140" fill="url(#auroraGold)" opacity="0.85"/>')

    # Identity row — avatar + Reel preview button on the right
    s.append(avatar(W/2 - 60, 150, 40, "M", kind="slate", premium=True))

    # Reel preview thumbnail — sits next to avatar, premium
    rx, ry = W/2 + 24, 110
    s.append(f'<rect x="{rx}" y="{ry}" width="76" height="100" rx="12" fill="url(#reelGrad)" stroke="{GOLD_HAIRLINE_STRONG}" stroke-width="0.6"/>')
    s.append(f'<rect x="{rx+1}" y="{ry+1}" width="74" height="50" rx="11" fill="url(#cardLight)"/>')
    s.append(f'<circle cx="{rx+38}" cy="{ry+50}" r="14" fill="rgba(255,255,255,0.18)"/>')
    s.append(f'<polygon points="{rx+33},{ry+44} {rx+33},{ry+56} {rx+46},{ry+50}" fill="white"/>')
    s.append(f'<text x="{rx+38}" y="{ry+82}" font-family="{FONT}" font-size="9" font-weight="600" letter-spacing="0.6" fill="{GOLD_LIGHT}" text-anchor="middle">HIRE REEL</text>')
    s.append(f'<text x="{rx+38}" y="{ry+94}" font-family="{FONT}" font-size="9" fill="{TEXT_TERTIARY}" text-anchor="middle">0:28</text>')

    s.append(display(W/2, 240, "Mohammed Iqbal", size=22, anchor="middle"))
    # Verified + score row
    s.append(pill(W/2 - 86, 256, "Verified", tone="premium", leading="★"))
    s.append(pill(W/2 + 8, 256, "Score 94", tone="premium"))
    s.append(body(W/2, 296, "Koramangala  ·  3 km  ·  ★ 4.9 (21)",
                  size=11.5, color=TEXT_SECONDARY, anchor="middle"))

    # Skill Passport CTA card (premium)
    y = 318
    s.append(card(22, y, W-44, 72, premium=True))
    s.append(f'<rect x="40" y="{y+18}" width="36" height="36" rx="8" fill="rgba(199,168,122,0.14)" stroke="{GOLD_HAIRLINE_STRONG}" stroke-width="0.5"/>')
    s.append(f'<text x="58" y="{y+42}" font-family="{FONT}" font-size="16" fill="{GOLD_LIGHT}" text-anchor="middle">⌘</text>')
    s.append(head(86, y+34, "Skill Passport", size=13.5, color=GOLD_LIGHT))
    s.append(body(86, y+52, "32 verified shifts · 4 courses · DigiLocker",
                  size=10.5, color=TEXT_TERTIARY))
    s.append(body(W-30, y+44, "›", size=20, color=GOLD_LIGHT, anchor="end"))

    # Constitution / boundaries card
    y = 406
    s.append(card(22, y, W-44, 90))
    s.append(eyebrow(40, y+22, "HIS RULES", color=TEXT_SECONDARY))
    rules = ["Min ₹600 / day", "Within 8 km", "No night shifts", "Must have PPE"]
    rx = 40
    for r in rules:
        s.append(pill(rx, y+40, r, tone="neutral"))
        rx += max(42, int(len(r) * 10.5 * 0.62) + 18) + 6
    s.append(body(40, y+74, "Doondo Constitution  ·  set by Mohammed",
                  size=10, color=TEXT_TERTIARY))

    # Predictive availability — premium hint
    y = 512
    s.append(f'<rect x="22" y="{y}" width="{W-44}" height="44" rx="14" fill="rgba(45,163,118,0.10)" stroke="rgba(45,163,118,0.40)" stroke-width="0.5"/>')
    s.append(f'<text x="40" y="{y+20}" font-family="{FONT}" font-size="10.5" font-weight="600" letter-spacing="1.4" fill="#7FE3BC">✦  PREDICTIVE</text>')
    s.append(body(40, y+34, "Usually free this Saturday — pre-book?", size=11.5, color="#9FD7C2"))

    # Skills row
    y = 572
    s.append(card(22, y, W-44, 64))
    s.append(eyebrow(40, y+22, "SKILLS"))
    sx, sk_y = 40, y+44
    for sk in ["billing", "english", "polite", "POS"]:
        s.append(pill(sx, sk_y, sk, tone="neutral"))
        sx += max(46, int(len(sk) * 10.5 * 0.62) + 18) + 6

    # Action row
    y = 656
    s.append(secondary_btn(22, y, 96, "Reject", h=50))
    s.append(secondary_btn(122, y, 104, "Shortlist", h=50))
    s.append(gold_btn(230, y, 140, "Hire ★", h=50))

    # Schedule interview strip
    y = 728
    s.append(card(22, y, W-44, 56))
    s.append(f'<circle cx="52" cy="{y+28}" r="18" fill="rgba(62,127,217,0.16)" stroke="rgba(62,127,217,0.42)" stroke-width="0.6"/>')
    s.append(f'<text x="52" y="{y+33}" font-family="{FONT}" font-size="14" fill="#7FA9FF" text-anchor="middle">⌚</text>')
    s.append(head(82, y+24, "Schedule interview", size=13))
    s.append(body(82, y+42, "AI suggests Tue 11am · in-person · 20 min",
                  size=10.5, color=TEXT_TERTIARY))
    s.append(body(W-30, y+34, "›", size=22, color=TEXT_SECONDARY, anchor="end"))

    s.append(home_indicator())
    s.append(svg_close())
    return "".join(s)


# ───────────────────────────────────────────────────────────────────────
# Page 9 — Available Right Now (Open Shift posts visible too)
# ───────────────────────────────────────────────────────────────────────

def page_available_workers():
    s = [svg_open(), status_bar()]
    s.append(monogram(W-42, 42))
    s.append(body(22, 70, "← Back", size=12, color=TEXT_SECONDARY))

    y = 100
    s.append(f'<rect x="22" y="{y}" width="{W-44}" height="124" rx="20" fill="rgba(45,163,118,0.12)" stroke="rgba(45,163,118,0.40)" stroke-width="0.6"/>')
    s.append(f'<rect x="23" y="{y+1}" width="{W-46}" height="56" rx="19" fill="url(#cardLight)"/>')
    s.append(f'<circle cx="62" cy="{y+58}" r="32" fill="none" stroke="{GREEN_BRIGHT}" stroke-width="0.5" opacity="0.4"/>')
    s.append(f'<circle cx="62" cy="{y+58}" r="22" fill="{GREEN_BRIGHT}"/>')
    s.append(f'<text x="62" y="{y+64}" font-family="{FONT}" font-size="18" fill="white" text-anchor="middle">⚡</text>')
    s.append(eyebrow(110, y+30, "LIVE  ·  AUTO-REFRESH", color="#7FE3BC"))
    s.append(display(110, y+62, "Available", size=20))
    s.append(display(110, y+86, "right now.", size=20, italic=True, serif=True, color=GOLD_LIGHT))
    s.append(body(110, y+108, "7 workers + 3 open shifts within 15 km",
                  size=11, color="#7FE3BC"))

    # Filter chips — include Open-Shift (seeker-posted)
    y = 248
    chips_ = [("Workers", True), ("Open Shifts", False), ("Delivery", False), ("Salon", False)]
    x = 22
    for label, active in chips_:
        s.append(filter_chip(x, y, label, active))
        x += max(46, int(len(label) * 11 * 0.62) + 22) + 6

    # Open-Shift card (seeker-posted) — different visual style, premium
    y = 290
    s.append(card(22, y, W-44, 92, premium=True))
    s.append(eyebrow(40, y+22, "WORKER POSTED · OPEN SHIFT", color=GOLD_LIGHT))
    s.append(head(40, y+46, "Anita — Sunday 9–5  ·  catering", size=13))
    s.append(body(40, y+66, "₹800 fixed  ·  KPHB  ·  9 km", size=11))
    s.append(pill(W-94, y+34, "Accept", tone="premium"))

    # Workers
    workers = [
        ("Ravi Kumar", "R", "coral", True, "Delivery, driver", "1.2 km", "free 2h", 89),
        ("Suresh Patel", "S", "slate", False, "Mason, helper", "3.5 km", "free today", 76),
        ("Lakshmi Bai", "L", "pink", True, "Cook, helper", "4.1 km", "free 3h", 84),
    ]
    y = 396
    for name, ini, kind, prem, trade, dist, status, score in workers:
        s.append(card(22, y, W-44, 90, premium=prem))
        s.append(avatar(48, y+44, 20, ini, kind=kind, premium=prem))
        s.append(head(82, y+34, name, size=13))
        s.append(body(82, y+52, f"{trade}  ·  {dist}", size=10.5))
        s.append(f'<circle cx="86" cy="{y+71}" r="3" fill="{GREEN_BRIGHT}"/>')
        s.append(body(96, y+74, status, size=10.5, color="#7FE3BC", weight="500"))
        s.append(doondo_score(W-46, y+44, score, size=32))
        y += 100

    s.append(home_indicator())
    s.append(svg_close())
    return "".join(s)


# ───────────────────────────────────────────────────────────────────────
# Page 10 — Chat list (translate icon hint, anti-ghost timer)
# ───────────────────────────────────────────────────────────────────────

def page_chat_list():
    s = [svg_open(), status_bar()]
    s.append(monogram(W-42, 42))

    s.append(eyebrow(22, 100, "INBOX"))
    s.append(gold_rule(22, 114, 28))
    s.append(display(22, 156, "Chat", size=32))
    s.append(body(22, 180, "Median reply 4h  ·  A+ score", size=11, color=JADE_LIGHT))

    y = 208
    tabs = [("All", True), ("Applicants", False), ("Crew", False), ("Support", False)]
    seg_w = (W - 44 - 18) / 4
    x = 22
    for label, active in tabs:
        bg_fill = "rgba(199,168,122,0.12)" if active else BG_SURFACE
        br = GOLD_HAIRLINE_STRONG if active else BORDER_DEFAULT
        col = GOLD_LIGHT if active else TEXT_SECONDARY
        s.append(f'<rect x="{x}" y="{y}" width="{seg_w}" height="34" rx="17" fill="{bg_fill}" stroke="{br}" stroke-width="0.6"/>')
        if active:
            s.append(f'<rect x="{x+1}" y="{y+1}" width="{seg_w-2}" height="16" rx="16" fill="url(#cardLight)"/>')
        s.append(f'<text x="{x+seg_w/2}" y="{y+22}" font-family="{FONT}" font-size="12" font-weight="500" letter-spacing="0.4" fill="{col}" text-anchor="middle">{esc(label)}</text>')
        x += seg_w + 6

    # Search
    y = 254
    s.append(f'<rect x="22" y="{y}" width="{W-44}" height="40" rx="14" fill="{BG_SURFACE}" stroke="{BORDER_DEFAULT}" stroke-width="0.6"/>')
    s.append(f'<text x="40" y="{y+25}" font-family="{FONT}" font-size="13" fill="{TEXT_TERTIARY}">⌕  Search applicants…</text>')

    convos = [
        ("Mohammed Iqbal", "M", "slate", True, "Can I start Monday morning?", "12m", 2, False),
        ("Painters of HSR (crew)", "P", "jade", True, "We can bring our own ladders.", "1h", 0, False),
        ("Anita Sharma", "A", "jade", False, "Thanks for shortlisting!", "1h", 0, True),  # translated
        ("Ravi Kumar", "R", "coral", True, "Photo attached →", "3h", 1, False),
        ("Priya Rao", "P", "pink", False, "Voice message  ·  0:14", "yesterday", 0, False),
        ("Lakshmi Bai", "L", "pink", True, "पता क्या है?", "2d", 0, True),
    ]
    y = 308
    for name, ini, kind, prem, msg, when, unread, translated in convos:
        s.append(hairline(72, y+76, W-22, y+76))
        s.append(avatar(48, y+36, 22, ini, kind=kind, premium=prem))
        s.append(head(86, y+30, name, size=14))
        if prem:
            nm_w = int(len(name) * 14 * 0.55) + 90
            s.append(f'<text x="{nm_w}" y="{y+30}" font-family="{FONT}" font-size="11" fill="{GOLD_LIGHT}">★</text>')
        s.append(body(86, y+50, msg, size=12, color=TEXT_SECONDARY))
        if translated:
            s.append(f'<text x="86" y="{y+66}" font-family="{FONT}" font-size="9.5" font-weight="500" letter-spacing="0.6" fill="{GOLD_LIGHT}">⌘  AUTO-TRANSLATED</text>')
        s.append(body(W-22, y+28, when, size=10.5, color=TEXT_TERTIARY, anchor="end"))
        if unread:
            s.append(f'<circle cx="{W-30}" cy="{y+50}" r="10" fill="url(#coralBtn)"/>')
            s.append(f'<text x="{W-30}" y="{y+54}" font-family="{FONT}" font-size="10.5" font-weight="700" fill="white" text-anchor="middle">{unread}</text>')
        y += 78

    s.append(tab_bar("Chat"))
    s.append(svg_close())
    return "".join(s)


# ───────────────────────────────────────────────────────────────────────
# Page 11 — Conversation (quick-reply templates + translate)
# ───────────────────────────────────────────────────────────────────────

def page_conversation():
    s = [svg_open(), status_bar()]
    s.append(f'<rect x="0" y="0" width="{W}" height="98" fill="#0E0C0E"/>')
    s.append(f'<line x1="0" y1="98" x2="{W}" y2="98" stroke="{GOLD_HAIRLINE}" stroke-width="0.5"/>')
    s.append(body(22, 70, "←", size=20, color=TEXT_PRIMARY))
    s.append(avatar(72, 62, 18, "M", kind="slate", premium=True))
    s.append(head(102, 56, "Mohammed Iqbal", size=14))
    s.append(f'<circle cx="106" cy="75" r="3" fill="{GREEN_BRIGHT}"/>')
    s.append(body(116, 78, "Online  ·  Verified  ·  Score 94", size=10, color=GOLD_LIGHT))
    # Translate toggle in header
    s.append(f'<rect x="{W-100}" y="56" width="76" height="26" rx="13" fill="rgba(199,168,122,0.10)" stroke="{GOLD_HAIRLINE_STRONG}" stroke-width="0.5"/>')
    s.append(f'<text x="{W-62}" y="73" font-family="{FONT}" font-size="10" font-weight="500" letter-spacing="0.6" fill="{GOLD_LIGHT}" text-anchor="middle">⌘  EN ⇄ हिं</text>')

    s.append(f'<rect x="{W/2-38}" y="116" width="76" height="22" rx="11" fill="{BG_SURFACE}" stroke="{GOLD_HAIRLINE}" stroke-width="0.5"/>')
    s.append(body(W/2, 131, "Today", size=10.5, color=TEXT_TERTIARY, anchor="middle"))

    def bubble_right(y, lines):
        h = 22 + (len(lines)-1) * 20
        s.append(f'<rect x="96" y="{y-2}" width="{W-118}" height="{h+12}" rx="20" fill="url(#auroraCoral)" opacity="0.55"/>')
        s.append(f'<rect x="100" y="{y}" width="{W-122}" height="{h+8}" rx="18" fill="url(#coralBtn)"/>')
        s.append(f'<rect x="101" y="{y+1}" width="{W-124}" height="{(h+6)*0.55}" rx="17" fill="url(#coralBtnGlow)"/>')
        for i, ln in enumerate(lines):
            s.append(f'<text x="116" y="{y+22+i*20}" font-family="{FONT}" font-size="13" fill="white">{esc(ln)}</text>')

    def bubble_left(y, lines, translated_from=None):
        h = 22 + (len(lines)-1) * 20
        s.append(f'<rect x="22" y="{y}" width="{W-122}" height="{h+8}" rx="18" fill="{BG_SURFACE}" stroke="{BORDER_DEFAULT}" stroke-width="0.6"/>')
        s.append(f'<rect x="23" y="{y+1}" width="{W-124}" height="{(h+6)*0.55}" rx="17" fill="url(#cardLight)"/>')
        for i, ln in enumerate(lines):
            s.append(f'<text x="38" y="{y+22+i*20}" font-family="{FONT}" font-size="13" fill="{TEXT_PRIMARY}">{esc(ln)}</text>')
        if translated_from:
            s.append(f'<text x="38" y="{y+h+24}" font-family="{FONT}" font-size="9.5" font-weight="500" letter-spacing="0.6" fill="{GOLD_LIGHT}">⌘  TRANSLATED FROM {translated_from}</text>')

    bubble_right(156, ["Hi! Your application looks great.",
                       "Can you come Monday 9am?"])
    bubble_left(240, ["हाँ साहब, मैं आऊंगा।",
                      "क्या मुझे आधार लाना है?"], translated_from="HINDI")
    bubble_right(338, ["Yes — Aadhaar + photo.",
                       "Shop is at 80ft Road, Indiranagar."])

    # Voice note
    s.append(f'<rect x="22" y="430" width="244" height="50" rx="25" fill="{BG_SURFACE}" stroke="{GOLD_HAIRLINE}" stroke-width="0.5"/>')
    s.append(f'<circle cx="46" cy="455" r="13" fill="url(#goldOrb)"/>')
    s.append(f'<text x="46" y="460" font-family="{FONT}" font-size="11" fill="#1A1106" text-anchor="middle">▶</text>')
    for i in range(20):
        x_bar = 72 + i * 7
        h_bar = (3, 9, 14, 11, 6, 12, 5)[i % 7]
        s.append(f'<rect x="{x_bar}" y="{455-h_bar//2}" width="2.6" height="{h_bar}" rx="1.3" fill="{TEXT_SECONDARY}" opacity="0.85"/>')
    s.append(body(232, 460, "0:14", size=10.5, color=TEXT_TERTIARY))
    s.append(f'<text x="22" y="500" font-family="{FONT}" font-size="9.5" font-weight="500" letter-spacing="0.6" fill="{GOLD_LIGHT}">⌘  AUTO-TRANSCRIBED  ·  TAP TO READ</text>')

    # QUICK-REPLY TEMPLATES — premium
    y = 552
    s.append(eyebrow(22, y, "QUICK REPLY  ·  PRE-TRANSLATED", color=GOLD_LIGHT, spacing=1.4))
    chips_ = [
        ("Still hiring 🟢", True),
        ("Come tomorrow 11am", False),
        ("Send Aadhaar photo", False),
        ("Address: 80ft Rd", False),
    ]
    chip_y = y + 14
    chip_x = 22
    row = 0
    for label, active in chips_:
        c_w = max(50, int(len(label) * 11 * 0.62) + 22)
        if chip_x + c_w > W - 22:
            chip_x = 22
            chip_y += 38
            row += 1
        bg_c = "rgba(199,168,122,0.10)" if active else BG_SURFACE
        br_c = GOLD_HAIRLINE_STRONG if active else BORDER_DEFAULT
        fg_c = GOLD_LIGHT if active else TEXT_PRIMARY
        s.append(f'<rect x="{chip_x}" y="{chip_y}" width="{c_w}" height="32" rx="16" fill="{bg_c}" stroke="{br_c}" stroke-width="0.5"/>')
        s.append(f'<text x="{chip_x+c_w/2}" y="{chip_y+21}" font-family="{FONT}" font-size="12" font-weight="500" fill="{fg_c}" text-anchor="middle">{esc(label)}</text>')
        chip_x += c_w + 6

    # Input bar
    iy = H - 96
    s.append(f'<rect x="0" y="{iy}" width="{W}" height="96" fill="#0E0C0E"/>')
    s.append(f'<line x1="0" y1="{iy}" x2="{W}" y2="{iy}" stroke="{GOLD_HAIRLINE}" stroke-width="0.5"/>')
    s.append(f'<rect x="22" y="{iy+16}" width="{W-110}" height="44" rx="22" fill="{BG_ELEVATED}" stroke="{BORDER_DEFAULT}" stroke-width="0.6"/>')
    s.append(body(40, iy+42, "Message Mohammed…", color=TEXT_TERTIARY))
    s.append(f'<text x="{W-110}" y="{iy+42}" font-family="{FONT}" font-size="14" fill="{TEXT_TERTIARY}" text-anchor="end">🎙</text>')
    s.append(f'<circle cx="{W-58}" cy="{iy+38}" r="22" fill="url(#coralBtn)"/>')
    s.append(f'<text x="{W-58}" y="{iy+44}" font-family="{FONT}" font-size="14" fill="white" text-anchor="middle">↑</text>')

    s.append(home_indicator())
    s.append(svg_close())
    return "".join(s)


# ───────────────────────────────────────────────────────────────────────
# Page 12 — Profile / You (Response score, Reviews, Pulse widget)
# ───────────────────────────────────────────────────────────────────────

def page_profile():
    s = [svg_open(), status_bar()]
    s.append(monogram(W-42, 42))

    s.append(f'<rect x="22" y="78" width="196" height="30" rx="15" fill="rgba(237,230,215,0.04)" stroke="{BORDER_DEFAULT}" stroke-width="0.5"/>')
    s.append(f'<text x="36" y="98" font-family="{FONT}" font-size="12" font-weight="600" letter-spacing="0.2" fill="{TEXT_PRIMARY}">{esc("Doondo Salon & Spa  ▾")}</text>')

    s.append(f'<ellipse cx="56" cy="170" rx="80" ry="60" fill="url(#auroraGold)" opacity="0.9"/>')
    s.append(avatar(56, 170, 40, "D", kind="slate", premium=True))

    s.append(eyebrow(112, 140, "EMPLOYER"))
    s.append(display(112, 178, "Doondo", size=20))
    s.append(display(112, 202, "Salon & Spa", size=20, italic=True, serif=True, color=GOLD_LIGHT))
    s.append(body(112, 222, "Change photo", size=11.5, color=CORAL_LIGHT, weight="500"))

    # Anti-Ghost + Reviews two-card row
    y = 252
    s.append(card(22, y, (W-50)/2, 92, premium=True))
    s.append(eyebrow(40, y+22, "RESPONSE", color=GOLD_LIGHT))
    s.append(display(40, y+60, "A+", size=28))
    s.append(body(40, y+78, "Replies < 4 hours  ·  no ghosts", size=10, color=TEXT_TERTIARY))

    s.append(card(22 + (W-50)/2 + 6, y, (W-50)/2, 92))
    s.append(eyebrow(22 + (W-50)/2 + 24, y+22, "REVIEWS"))
    s.append(f'<text x="{22 + (W-50)/2 + 24}" y="{y+60}" font-family="{FONT_DISPLAY}" font-size="28" fill="{TEXT_PRIMARY}" font-weight="500">4.8</text>')
    s.append(f'<text x="{22 + (W-50)/2 + 80}" y="{y+58}" font-family="{FONT}" font-size="13" fill="{GOLD_LIGHT}" letter-spacing="2">★★★★★</text>')
    s.append(body(22 + (W-50)/2 + 24, y+78, "from 38 workers · anonymous", size=10, color=TEXT_TERTIARY))

    # Completion card
    y = 360
    s.append(card(22, y, W-44, 100))
    cx, cy = 70, y+50
    s.append(f'<circle cx="{cx}" cy="{cy}" r="36" fill="none" stroke="{BORDER_HAIR}" stroke-width="5"/>')
    pct = 0.88
    a0 = -math.pi / 2; a1 = a0 + 2 * math.pi * pct
    large = 1 if pct > 0.5 else 0
    x0 = cx + 36 * math.cos(a0); y0 = cy + 36 * math.sin(a0)
    x1 = cx + 36 * math.cos(a1); y1 = cy + 36 * math.sin(a1)
    s.append(f'<path d="M {x0:.2f} {y0:.2f} A 36 36 0 {large} 1 {x1:.2f} {y1:.2f}" fill="none" stroke="url(#goldBrush)" stroke-width="5" stroke-linecap="round"/>')
    s.append(f'<circle cx="{cx}" cy="{cy}" r="24" fill="url(#goldOrb)" opacity="0.95"/>')
    s.append(f'<circle cx="{cx-8}" cy="{cy-8}" r="5" fill="white" opacity="0.5"/>')
    s.append(eyebrow(124, y+30, "PROFILE COMPLETE"))
    s.append(display(124, y+68, "88", size=28))
    s.append(f'<text x="164" y="{y+68}" font-family="{FONT_SERIF}" font-size="20" font-style="italic" fill="{GOLD_LIGHT}">%</text>')
    s.append(body(124, y+86, "12% to gold — add bathrooms info.", size=10.5))

    # Doondo Pulse widget — live home-screen widget preview
    y = 476
    s.append(card(22, y, W-44, 104, premium=True))
    s.append(eyebrow(40, y+22, "DOONDO PULSE  ·  LIVE WIDGET", color=GOLD_LIGHT))
    s.append(head(40, y+44, "Today's hire pulse", size=13))
    # Mini chart
    pts = [(40, 84), (70, 76), (100, 78), (130, 70), (160, 64), (190, 68), (220, 58), (250, 52)]
    pts_d = " ".join(f"{px},{y+pt}" for px, pt in pts)
    s.append(f'<polyline points="{pts_d}" fill="none" stroke="url(#goldBrush)" stroke-width="1.4"/>')
    for px, pt in pts:
        s.append(f'<circle cx="{px}" cy="{y+pt}" r="1.6" fill="{GOLD_LIGHT}"/>')
    # Stats
    s.append(eyebrow(W-122, y+44, "AVG WAGE TODAY", color=TEXT_TERTIARY, size=8.5, spacing=1.2))
    s.append(f'<text x="{W-122}" y="{y+68}" font-family="{FONT_DISPLAY}" font-size="20" fill="{TEXT_PRIMARY}" font-weight="500">₹612</text>')
    s.append(f'<text x="{W-72}" y="{y+68}" font-family="{FONT}" font-size="11" fill="#5EC4A0">↑ 3.4%</text>')
    s.append(body(W-122, y+86, "salon trade · Bengaluru", size=9.5, color=TEXT_TERTIARY))

    # Sections row
    y = 596
    s.append(card(22, y, W-44, 70))
    s.append(eyebrow(40, y+22, "COMPLIANCE"))
    s.append(body(W-40, y+22, "Edit", size=11, color=CORAL_LIGHT, weight="500", anchor="end"))
    s.append(head(40, y+44, "29ABCDE1234F1Z5  ·  GST on file",
                  size=13, color=JADE_LIGHT))

    y = 678
    s.append(card(22, y, W-44, 70, premium=True))
    s.append(head(40, y+32, "Verification", size=14))
    s.append(body(40, y+52, "Your business carries the gold ★ everywhere.",
                  size=10.5, color=TEXT_SECONDARY))
    s.append(pill(W-92, y+22, "Verified", tone="premium", leading="★"))

    s.append(tab_bar("You"))
    s.append(svg_close())
    return "".join(s)


# ───────────────────────────────────────────────────────────────────────
# NEW Page 13 — Hire Reels (vertical video resume swiper)
# ───────────────────────────────────────────────────────────────────────

def page_hire_reels():
    s = [svg_open(), status_bar(white=True)]
    s.append(monogram(W-42, 42))

    # Full bleed reel "video" with gradient simulated
    s.append(f'<rect x="0" y="0" width="{W}" height="{H}" fill="url(#reelGrad)"/>')
    # Aurora behind the worker silhouette
    s.append(f'<ellipse cx="{W/2}" cy="380" rx="200" ry="280" fill="{CORAL}" opacity="0.18"/>')
    s.append(f'<ellipse cx="{W/2-60}" cy="240" rx="120" ry="180" fill="{GOLD}" opacity="0.15"/>')

    # Top bar — Reels label
    s.append(eyebrow(W/2, 70, "HIRE REELS", color="#FFFFFF", size=11, spacing=2.6, anchor="middle"))
    s.append(f'<rect x="{W/2-22}" y="80" width="44" height="1.6" fill="url(#goldBrush)"/>')

    # Worker silhouette (abstract)
    cxs, cys = W/2, 380
    # head
    s.append(f'<circle cx="{cxs}" cy="{cys-100}" r="48" fill="rgba(0,0,0,0.55)"/>')
    # body
    s.append(f'<path d="M {cxs-90} 440 Q {cxs-90} 340 {cxs} 320 Q {cxs+90} 340 {cxs+90} 440 Z" fill="rgba(0,0,0,0.55)"/>')

    # Tool / kitchen utensil hint — gold accent
    s.append(f'<rect x="{cxs+40}" y="320" width="6" height="60" rx="3" fill="url(#goldBrush)" opacity="0.7"/>')

    # Auto-caption box, premium
    s.append(f'<rect x="22" y="544" width="{W-44}" height="44" rx="14" fill="rgba(0,0,0,0.65)" stroke="{GOLD_HAIRLINE_STRONG}" stroke-width="0.5"/>')
    s.append(f'<text x="40" y="566" font-family="{FONT}" font-size="13" fill="white" font-weight="500">{esc(chr(8220) + "I have cooked South Indian for 6 years" + chr(8230) + chr(8221))}</text>')
    s.append(f'<text x="40" y="582" font-family="{FONT}" font-size="9.5" font-weight="500" letter-spacing="0.6" fill="{GOLD_LIGHT}">⌘  AUTO-CAPTIONED  ·  TRANSLATED FROM TAMIL</text>')

    # Right-side action rail (TikTok-style)
    rx = W - 50
    actions = [("♥", "1.2k"), ("✓", "Hire"), ("✦", "Save"), ("⌘", "Lang")]
    ay = 280
    for icon, label in actions:
        s.append(f'<circle cx="{rx}" cy="{ay}" r="22" fill="rgba(0,0,0,0.50)" stroke="rgba(199,168,122,0.40)" stroke-width="0.6"/>')
        s.append(f'<text x="{rx}" y="{ay+6}" font-family="{FONT}" font-size="15" fill="white" text-anchor="middle">{icon}</text>')
        s.append(f'<text x="{rx}" y="{ay+38}" font-family="{FONT}" font-size="9" font-weight="600" letter-spacing="0.4" fill="white" text-anchor="middle">{esc(label)}</text>')
        ay += 64

    # Worker info card — bottom
    y = 620
    s.append(f'<rect x="22" y="{y}" width="{W-44}" height="100" rx="18" fill="rgba(0,0,0,0.55)" stroke="{GOLD_HAIRLINE_STRONG}" stroke-width="0.5"/>')
    s.append(f'<rect x="23" y="{y+1}" width="{W-46}" height="40" rx="17" fill="url(#cardLight)"/>')
    s.append(avatar(56, y+44, 22, "L", kind="pink", premium=True))
    s.append(head(92, y+38, "Lakshmi Bai", size=15, color="#FFFFFF"))
    s.append(pill(192, y+24, "Verified", tone="premium", leading="★"))
    s.append(body(92, y+58, "Cook · Bengaluru · 4.1 km · ₹650/day",
                  size=11, color="rgba(255,255,255,0.75)"))
    # Doondo Score badge
    s.append(doondo_score(W-58, y+44, 84, size=36))
    # Hire CTA
    s.append(gold_btn(92, y+72, 130, "Hire ★", h=22))

    # Page indicator dots
    for i in range(4):
        col_d = "#FFFFFF" if i == 1 else "rgba(255,255,255,0.35)"
        s.append(f'<circle cx="{W/2 - 18 + i*12}" cy="{H-30}" r="2.5" fill="{col_d}"/>')

    s.append(home_indicator(white=True))
    s.append(svg_close())
    return "".join(s)


# ───────────────────────────────────────────────────────────────────────
# NEW Page 14 — Skill Passport (DigiLocker-style verifiable credentials)
# ───────────────────────────────────────────────────────────────────────

def page_skill_passport():
    s = [svg_open(), status_bar()]
    s.append(monogram(W-42, 42))
    s.append(body(22, 70, "← Back", size=12, color=TEXT_SECONDARY))

    s.append(f'<ellipse cx="{W/2}" cy="200" rx="280" ry="160" fill="url(#auroraGold)" opacity="0.95"/>')

    s.append(eyebrow(W/2, 116, "SKILL PASSPORT", color=GOLD_LIGHT, anchor="middle", spacing=2.8))
    s.append(gold_rule(W/2-22, 128, 44))

    s.append(display(W/2, 168, "Mohammed Iqbal", size=22, anchor="middle"))
    s.append(body(W/2, 192, "Tamper-proof  ·  DigiLocker-signed  ·  Portable",
                  size=11, color=TEXT_SECONDARY, anchor="middle"))

    # QR + ID card
    y = 222
    s.append(card(22, y, W-44, 196, premium=True))
    # QR
    s.append(f'<rect x="40" y="{y+24}" width="100" height="100" rx="10" fill="white"/>')
    # QR pixels (decorative)
    import random
    random.seed(7)
    for i in range(8):
        for j in range(8):
            if random.random() < 0.55:
                s.append(f'<rect x="{42 + j*12}" y="{y+26 + i*12}" width="10" height="10" fill="#0A0809"/>')
    # 3 corner markers
    for cx_q, cy_q in [(42, y+26), (42, y+102), (118, y+26)]:
        s.append(f'<rect x="{cx_q}" y="{cy_q}" width="24" height="24" fill="#0A0809"/>')
        s.append(f'<rect x="{cx_q+5}" y="{cy_q+5}" width="14" height="14" fill="white"/>')
        s.append(f'<rect x="{cx_q+8}" y="{cy_q+8}" width="8" height="8" fill="#0A0809"/>')

    s.append(head(160, y+44, "ID  DD-29-184-7732", size=12, color=GOLD_LIGHT))
    s.append(eyebrow(160, y+66, "VERIFIED SINCE", spacing=1.4))
    s.append(head(160, y+86, "Mar 2024", size=13))
    s.append(eyebrow(160, y+108, "TRADES", spacing=1.4))
    s.append(head(160, y+128, "Cashier · POS · Billing", size=12))
    s.append(body(40, y+148, "Show this QR to any employer — on or off Doondo.",
                  size=10.5, color=TEXT_TERTIARY))
    s.append(body(40, y+170, "32 shifts ✓  ·  4 courses ✓  ·  18 endorsements ✓",
                  size=10.5, color=JADE_LIGHT))

    # Credentials timeline
    y = 440
    s.append(eyebrow(22, y, "VERIFIED CREDENTIALS", spacing=1.6))
    s.append(gold_rule(22, y+10, 28))

    credentials = [
        ("Shift completed", "Hotel Royal · Bangalore",  "Apr 14, 2026", "Cook helper", "jade"),
        ("Course passed", "Doondo Academy · POS systems", "Mar 02, 2026", "12 hr · 94%", "gold"),
        ("Employer rating", "Indiranagar Shop · ★ 5.0", "Feb 28, 2026", "Paid on time", "gold"),
        ("Shift completed", "Royal Caterers · KPHB",   "Feb 21, 2026", "12 hr", "jade"),
    ]
    cy = y + 32
    for kind, where, when, detail, ctone in credentials:
        c_color = GOLD_LIGHT if ctone == "gold" else JADE_LIGHT
        s.append(f'<circle cx="36" cy="{cy+18}" r="6" fill="{c_color}" opacity="0.18" stroke="{c_color}" stroke-width="0.8"/>')
        s.append(f'<text x="36" y="{cy+22}" font-family="{FONT}" font-size="8" fill="{c_color}" text-anchor="middle">✓</text>')
        s.append(hairline(36, cy+24, 36, cy+62, color=BORDER_HAIR))
        s.append(head(54, cy+15, kind, size=12.5))
        s.append(body(54, cy+30, where, size=11))
        s.append(body(54, cy+45, detail, size=10, color=TEXT_TERTIARY))
        s.append(body(W-24, cy+15, when, size=10, color=TEXT_TERTIARY, anchor="end"))
        cy += 56

    s.append(home_indicator())
    s.append(svg_close())
    return "".join(s)


# ───────────────────────────────────────────────────────────────────────
# NEW Page 15 — Live Job Auction (countdown + live bidders)
# ───────────────────────────────────────────────────────────────────────

def page_auction():
    s = [svg_open(), status_bar()]
    s.append(monogram(W-42, 42))
    s.append(body(22, 70, "← Back", size=12, color=TEXT_SECONDARY))

    # Pulsing coral aurora — urgent
    s.append(f'<ellipse cx="{W/2}" cy="190" rx="240" ry="140" fill="url(#auroraCoral)" opacity="0.95"/>')

    s.append(eyebrow(W/2, 112, "LIVE  ·  AUCTION", color=CORAL_LIGHT, anchor="middle"))
    s.append(gold_rule(W/2-22, 124, 44))

    s.append(display(W/2, 168, "Cook needed in", size=22, anchor="middle"))
    s.append(display(W/2, 194, "90 minutes.", size=22, italic=True, serif=True, color=GOLD_LIGHT, anchor="middle"))

    # Countdown
    y = 222
    s.append(card(22, y, W-44, 110))
    s.append(eyebrow(W/2, y+22, "TIME REMAINING", anchor="middle"))
    # Big clock
    s.append(f'<text x="{W/2-50}" y="{y+78}" font-family="{FONT_DISPLAY}" font-size="50" font-weight="500" letter-spacing="-1.5" fill="{CORAL_LIGHT}" text-anchor="middle">42</text>')
    s.append(f'<text x="{W/2-22}" y="{y+78}" font-family="{FONT_SERIF}" font-style="italic" font-size="40" fill="{TEXT_TERTIARY}" text-anchor="middle">:</text>')
    s.append(f'<text x="{W/2+30}" y="{y+78}" font-family="{FONT_DISPLAY}" font-size="50" font-weight="500" letter-spacing="-1.5" fill="{TEXT_PRIMARY}" text-anchor="middle">17</text>')
    s.append(body(W/2-44, y+96, "minutes", size=10, color=TEXT_TERTIARY, anchor="middle"))
    s.append(body(W/2+36, y+96, "seconds", size=10, color=TEXT_TERTIARY, anchor="middle"))

    # Current floor
    y = 354
    s.append(card(22, y, W-44, 76))
    s.append(eyebrow(40, y+22, "CURRENT FLOOR  ·  RISING"))
    s.append(f'<text x="40" y="{y+62}" font-family="{FONT_SERIF}" font-style="italic" font-size="22" fill="{GOLD_LIGHT}">₹</text>')
    s.append(f'<text x="60" y="{y+62}" font-family="{FONT_DISPLAY}" font-size="28" font-weight="500" letter-spacing="-0.8" fill="{TEXT_PRIMARY}">1 250</text>')
    s.append(body(168, y+62, "/ shift  ·  3 cooks bidding", size=11.5))
    s.append(f'<text x="{W-46}" y="{y+62}" font-family="{FONT}" font-size="13" fill="#5EC4A0">↑ 25%</text>')

    # Live bidders
    y = 452
    s.append(eyebrow(22, y, "LIVE BIDDERS"))
    s.append(gold_rule(22, y+10, 28))

    bidders = [
        ("Mohammed Iqbal", "M", "slate", True, "1.8 km", "₹1 250", 94, "leading"),
        ("Lakshmi Bai", "L", "pink", True, "2.4 km", "₹1 200", 84, None),
        ("Suresh Patel", "S", "slate", False, "3.7 km", "₹1 100", 76, None),
    ]
    y = y + 30
    for name, ini, kind, prem, dist, bid, score, tag in bidders:
        is_lead = tag == "leading"
        s.append(card(22, y, W-44, 86, premium=is_lead))
        s.append(avatar(50, y+44, 18, ini, kind=kind, premium=prem))
        s.append(head(82, y+30, name, size=13))
        s.append(body(82, y+48, f"{dist}  ·  Score {score}", size=10.5))
        if is_lead:
            s.append(pill(82, y+58, "LEADING", tone="premium", size=9))
        # Bid amount
        s.append(f'<text x="{W-46}" y="{y+38}" font-family="{FONT_DISPLAY}" font-size="18" font-weight="600" fill="{TEXT_PRIMARY}" text-anchor="end">{esc(bid)}</text>')
        s.append(body(W-46, y+54, "live", size=10, color=CORAL_LIGHT, anchor="end"))
        y += 94

    # Accept leader CTA
    s.append(primary_btn(22, H - 96, W - 44, "Accept Mohammed at ₹1 250", h=50))

    s.append(home_indicator())
    s.append(svg_close())
    return "".join(s)


# ───────────────────────────────────────────────────────────────────────
# NEW Page 16 — Interview Scheduler
# ───────────────────────────────────────────────────────────────────────

def page_interview_scheduler():
    s = [svg_open(), status_bar()]
    s.append(monogram(W-42, 42))
    s.append(body(22, 70, "Cancel", size=12, color=TEXT_SECONDARY))

    s.append(eyebrow(22, 116, "SCHEDULE INTERVIEW"))
    s.append(gold_rule(22, 130, 28))
    s.append(display(22, 178, "When works", size=24))
    s.append(display(22, 208, "for you both?", size=24, italic=True, serif=True, color=GOLD_LIGHT))

    # AI suggestion banner
    y = 232
    s.append(f'<rect x="22" y="{y}" width="{W-44}" height="44" rx="14" fill="rgba(199,168,122,0.06)" stroke="{GOLD_HAIRLINE}" stroke-width="0.5"/>')
    s.append(f'<text x="40" y="{y+18}" font-family="{FONT}" font-size="10.5" font-weight="600" letter-spacing="1.4" fill="{GOLD_LIGHT}">✦  AI SUGGESTS</text>')
    s.append(body(40, y+34, "Tue 11 am — both calendars are open",
                  size=11.5, color=TEXT_SECONDARY))

    # Mode toggles
    y = 296
    modes = [("In-person", True), ("Video call", False), ("Phone", False)]
    seg_w = (W - 44 - 12) / 3
    x = 22
    for label, active in modes:
        bg_fill = "rgba(199,168,122,0.14)" if active else BG_SURFACE
        br = GOLD_HAIRLINE_STRONG if active else BORDER_DEFAULT
        col = TEXT_PRIMARY if active else TEXT_SECONDARY
        s.append(f'<rect x="{x}" y="{y}" width="{seg_w}" height="40" rx="20" fill="{bg_fill}" stroke="{br}" stroke-width="0.6"/>')
        if active:
            s.append(f'<rect x="{x+1}" y="{y+1}" width="{seg_w-2}" height="19" rx="19" fill="url(#cardLight)"/>')
        s.append(f'<text x="{x+seg_w/2}" y="{y+26}" font-family="{FONT}" font-size="12" font-weight="500" fill="{col}" text-anchor="middle">{esc(label)}</text>')
        x += seg_w + 6

    # Day strip
    y = 360
    s.append(eyebrow(22, y, "PICK A DAY"))
    days = [("MON","18", False), ("TUE","19", True), ("WED","20", False),
            ("THU","21", False), ("FRI","22", False)]
    seg_w = (W - 44 - 16) / 5
    x = 22
    for d, num, active in days:
        bg_fill = "url(#goldBrush)" if active else BG_SURFACE
        col = "#241B0B" if active else TEXT_PRIMARY
        s.append(f'<rect x="{x}" y="{y+14}" width="{seg_w}" height="62" rx="14" fill="{bg_fill}" stroke="{GOLD_HAIRLINE_STRONG if active else BORDER_DEFAULT}" stroke-width="0.6"/>')
        s.append(f'<text x="{x+seg_w/2}" y="{y+34}" font-family="{FONT}" font-size="9.5" font-weight="600" letter-spacing="1.4" fill="{col}" text-anchor="middle">{d}</text>')
        s.append(f'<text x="{x+seg_w/2}" y="{y+62}" font-family="{FONT_DISPLAY}" font-size="20" font-weight="600" fill="{col}" text-anchor="middle">{num}</text>')
        x += seg_w + 4

    # Slots
    y = 460
    s.append(eyebrow(22, y, "AVAILABLE SLOTS"))
    slots = [
        ("9:00 AM", False, False), ("10:00 AM", False, False),
        ("11:00 AM", True, True), ("12:00 PM", False, False),
        ("2:00 PM", False, False), ("3:00 PM", False, True),
        ("4:00 PM", False, False), ("5:00 PM", False, False),
    ]
    seg_w = (W - 44 - 12) / 4
    x = 22
    by = y + 14
    for i, (label, active, ai) in enumerate(slots):
        bg_fill = "url(#goldBrush)" if active else BG_SURFACE
        col = "#241B0B" if active else TEXT_PRIMARY
        br = GOLD_HAIRLINE_STRONG if active else BORDER_DEFAULT
        s.append(f'<rect x="{x}" y="{by}" width="{seg_w}" height="38" rx="12" fill="{bg_fill}" stroke="{br}" stroke-width="0.6"/>')
        s.append(f'<text x="{x+seg_w/2}" y="{by+22}" font-family="{FONT}" font-size="11.5" font-weight="500" fill="{col}" text-anchor="middle">{esc(label)}</text>')
        if ai and not active:
            s.append(f'<text x="{x+seg_w/2}" y="{by+33}" font-family="{FONT}" font-size="8" letter-spacing="0.6" fill="{GOLD_LIGHT}" text-anchor="middle">✦ AI</text>')
        x += seg_w + 4
        if (i+1) % 4 == 0:
            x = 22
            by += 46

    # Summary card
    y = 632
    s.append(card(22, y, W-44, 80, premium=True))
    s.append(eyebrow(40, y+22, "INTERVIEW WITH"))
    s.append(avatar(56, y+54, 18, "M", kind="slate", premium=True))
    s.append(head(86, y+46, "Mohammed Iqbal · Tue 19, 11:00 AM", size=12.5))
    s.append(body(86, y+62, "Shop · 80ft Rd, Indiranagar  ·  20 min",
                  size=10.5, color=TEXT_TERTIARY))

    # Send CTA
    s.append(primary_btn(22, H - 80, W - 44, "Send & hold both calendars", h=50))

    s.append(home_indicator())
    s.append(svg_close())
    return "".join(s)


# ───────────────────────────────────────────────────────────────────────
# NEW Page 17 — Shift Check-in (selfie + geofence)
# ───────────────────────────────────────────────────────────────────────

def page_shift_checkin():
    s = [svg_open(), status_bar()]
    s.append(monogram(W-42, 42))
    s.append(body(22, 70, "← Back", size=12, color=TEXT_SECONDARY))

    s.append(eyebrow(22, 116, "SHIFT CHECK-IN  ·  LIVE"))
    s.append(gold_rule(22, 130, 28))
    s.append(display(22, 178, "Mohammed", size=26))
    s.append(display(22, 208, "checked in.", size=26, italic=True, serif=True, color=GOLD_LIGHT))
    # Time
    s.append(body(22, 232, "Today  ·  8:54 AM  ·  4 min early",
                  size=12, color=JADE_LIGHT))

    # Selfie card (left) + map card (right)
    y = 260
    # Selfie
    sw_ = (W - 50) / 2
    s.append(card(22, y, sw_, 220, premium=True))
    # Faux selfie portrait
    cx_p, cy_p = 22 + sw_/2, y + 96
    s.append(f'<ellipse cx="{cx_p}" cy="{cy_p-32}" rx="36" ry="38" fill="url(#avatarSlate)"/>')
    s.append(f'<path d="M {cx_p-50} {cy_p+50} Q {cx_p-50} {cy_p+10} {cx_p} {cy_p-5} Q {cx_p+50} {cy_p+10} {cx_p+50} {cy_p+50} Z" fill="url(#avatarSlate)" opacity="0.85"/>')
    # Liveness check overlay
    s.append(f'<rect x="34" y="{y+12}" width="60" height="20" rx="10" fill="rgba(16,185,129,0.85)"/>')
    s.append(f'<text x="64" y="{y+26}" font-family="{FONT}" font-size="9" font-weight="700" letter-spacing="0.6" fill="white" text-anchor="middle">✓ LIVE</text>')
    s.append(eyebrow(34, y+170, "SELFIE", color=GOLD_LIGHT))
    s.append(body(34, y+190, "Anti-spoof: passed", size=10, color=JADE_LIGHT))
    s.append(body(34, y+204, "iPhone front cam", size=9.5, color=TEXT_TERTIARY))

    # Map / geofence card
    mx = 22 + sw_ + 6
    s.append(card(mx, y, sw_, 220))
    # Map BG
    s.append(f'<rect x="{mx+1}" y="{y+1}" width="{sw_-2}" height="{220-2}" rx="15" fill="#1A1518"/>')
    # streets
    s.append(f'<rect x="{mx+1}" y="{y+80}" width="{sw_-2}" height="2" fill="rgba(199,168,122,0.18)"/>')
    s.append(f'<rect x="{mx+1}" y="{y+150}" width="{sw_-2}" height="2" fill="rgba(199,168,122,0.18)"/>')
    s.append(f'<rect x="{mx+sw_/2}" y="{y+1}" width="2" height="{220-2}" fill="rgba(199,168,122,0.18)"/>')
    # geofence circle
    cx_m, cy_m = mx + sw_/2, y + 110
    s.append(f'<circle cx="{cx_m}" cy="{cy_m}" r="60" fill="rgba(16,185,129,0.10)" stroke="rgba(16,185,129,0.5)" stroke-width="0.6" stroke-dasharray="3 3"/>')
    # Worker pin
    s.append(f'<circle cx="{cx_m}" cy="{cy_m-6}" r="14" fill="{GREEN_BRIGHT}"/>')
    s.append(f'<text x="{cx_m}" y="{cy_m-2}" font-family="{FONT}" font-size="11" fill="white" text-anchor="middle">●</text>')
    s.append(eyebrow(mx+14, y+170, "GEOFENCE", color=GOLD_LIGHT))
    s.append(body(mx+14, y+190, "Inside 50m radius", size=10, color=JADE_LIGHT))
    s.append(body(mx+14, y+204, "Indiranagar shop", size=9.5, color=TEXT_TERTIARY))

    # Shift summary card
    y = 500
    s.append(card(22, y, W-44, 124, premium=True))
    s.append(eyebrow(40, y+22, "SHIFT SUMMARY"))
    s.append(head(40, y+44, "Day 12 of full-time hire", size=14))
    # Stats row
    stats = [("HOURS", "8.0", JADE_LIGHT), ("RATE", "₹600", GOLD_LIGHT), ("ATTEND.", "100%", JADE_LIGHT)]
    sx = 40
    for label, val, c in stats:
        s.append(eyebrow(sx, y+72, label, size=9, spacing=1.2, color=TEXT_TERTIARY))
        s.append(f'<text x="{sx}" y="{y+96}" font-family="{FONT_DISPLAY}" font-size="20" font-weight="500" fill="{c}">{esc(val)}</text>')
        sx += 116
    s.append(body(40, y+114, "Today's payout unlocks at check-out.",
                  size=10.5, color=TEXT_TERTIARY))

    # Action row — Approve / Dispute
    s.append(secondary_btn(22, H - 168, (W-50)/2, "Dispute", h=46))
    s.append(primary_btn(28 + (W-50)/2, H - 168, (W-50)/2, "Approve payout", h=46))

    s.append(body(W/2, H - 100, "Family contact notified automatically",
                  size=10.5, color=TEXT_TERTIARY, anchor="middle"))

    s.append(home_indicator())
    s.append(svg_close())
    return "".join(s)


# ───────────────────────────────────────────────────────────────────────
# NEW Page 18 — Doondo Coach (voice AI overlay)
# ───────────────────────────────────────────────────────────────────────

def page_doondo_coach():
    s = [svg_open(), status_bar()]
    s.append(monogram(W-42, 42))
    # Dim background hinting at chat
    s.append(f'<rect x="0" y="0" width="{W}" height="{H}" fill="rgba(0,0,0,0.55)"/>')

    # Soft gold aurora behind orb
    s.append(f'<ellipse cx="{W/2}" cy="{H/2-60}" rx="320" ry="320" fill="url(#auroraGold)"/>')

    # The orb — a luminous champagne sphere with concentric soundwave rings
    cx, cy = W/2, 320
    for i, (r, op) in enumerate([(150, 0.10), (120, 0.18), (95, 0.28), (74, 0.42)]):
        s.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{GOLD_LIGHT}" stroke-width="0.6" opacity="{op}"/>')
    # Core sphere
    s.append(f'<circle cx="{cx}" cy="{cy}" r="58" fill="url(#goldOrb)"/>')
    s.append(f'<circle cx="{cx-16}" cy="{cy-18}" r="12" fill="white" opacity="0.55"/>')
    s.append(f'<circle cx="{cx}" cy="{cy}" r="58" fill="none" stroke="url(#goldBrush)" stroke-width="1" opacity="0.95"/>')

    s.append(eyebrow(W/2, 110, "DOONDO COACH  ·  VOICE FIRST", color=GOLD_LIGHT, anchor="middle"))
    s.append(gold_rule(W/2-22, 122, 44))

    s.append(display(W/2, 160, "I'm listening.", size=26, italic=True, serif=True,
                     color=TEXT_PRIMARY, anchor="middle"))

    # Transcription bubble — what the employer just said
    y = 440
    s.append(card(22, y, W-44, 100, premium=True))
    s.append(eyebrow(40, y+22, "YOU SAID  ·  TAMIL → EN"))
    s.append(body(40, y+46, "\"Doondo, find me 2 cooks for tomorrow", size=13, color=TEXT_PRIMARY))
    s.append(body(40, y+64, "near Indiranagar, at least ₹600 / day.\"",
                  size=13, color=TEXT_PRIMARY))
    s.append(body(40, y+86, "Heard at 9:42 AM  ·  confidence 96%",
                  size=10, color=TEXT_TERTIARY))

    # AI action plan
    y = 560
    s.append(eyebrow(22, y, "WHAT I'LL DO", color=GOLD_LIGHT, spacing=1.6))
    actions = [
        "Post a Gig job near Indiranagar at ₹650",
        "Notify 18 nearby verified cooks",
        "Hold tomorrow 9–5 in your calendar",
        "Read out replies as they come in",
    ]
    ay = y + 24
    for a in actions:
        s.append(f'<circle cx="34" cy="{ay-4}" r="3" fill="url(#goldBrush)"/>')
        s.append(body(48, ay, a, size=12, color=TEXT_PRIMARY))
        ay += 22

    # Tap to confirm CTA — gold
    s.append(gold_btn(22, H - 116, W - 44, "Tap to confirm  ·  or say \"yes\""))
    s.append(body(W/2, H - 50, "Or press hold to speak again",
                  size=11, color=TEXT_TERTIARY, anchor="middle"))

    s.append(home_indicator())
    s.append(svg_close())
    return "".join(s)


# ───────────────────────────────────────────────────────────────────────
# NEW Page 19 — Hire Celebration (3D fireworks + share card)
# ───────────────────────────────────────────────────────────────────────

def page_hire_celebration():
    s = [svg_open(), status_bar(white=True)]

    # Dark gold background
    s.append(f'<rect x="0" y="0" width="{W}" height="{H}" fill="#0A0709"/>')
    s.append(f'<ellipse cx="{W/2}" cy="320" rx="280" ry="200" fill="url(#auroraGold)" opacity="1"/>')
    s.append(f'<ellipse cx="{W/2}" cy="320" rx="180" ry="120" fill="url(#auroraCoral)" opacity="0.8"/>')

    # Fireworks lines — burst from center
    burst_cx, burst_cy = W/2, 280
    import random
    random.seed(13)
    for i in range(48):
        ang = (i / 48) * 2 * math.pi + random.random() * 0.05
        r0 = 30 + random.random() * 20
        r1 = 120 + random.random() * 60
        x0 = burst_cx + r0 * math.cos(ang)
        y0 = burst_cy + r0 * math.sin(ang)
        x1 = burst_cx + r1 * math.cos(ang)
        y1 = burst_cy + r1 * math.sin(ang)
        col = random.choice([GOLD_LIGHT, GOLD, CORAL_LIGHT, "#F2DDC5"])
        s.append(f'<line x1="{x0:.1f}" y1="{y0:.1f}" x2="{x1:.1f}" y2="{y1:.1f}" stroke="{col}" stroke-width="1.2" opacity="0.75" stroke-linecap="round"/>')
        # Sparkle endpoint
        s.append(f'<circle cx="{x1:.1f}" cy="{y1:.1f}" r="2.2" fill="{col}" opacity="0.95"/>')

    # Confetti
    for i in range(80):
        cx_c = random.random() * W
        cy_c = random.random() * H
        sz = 2 + random.random() * 3
        col = random.choice([GOLD_LIGHT, GOLD, CORAL_LIGHT, "#F2DDC5"])
        s.append(f'<rect x="{cx_c:.1f}" y="{cy_c:.1f}" width="{sz:.1f}" height="{sz:.1f}" fill="{col}" opacity="0.8" transform="rotate({random.random()*360} {cx_c+sz/2} {cy_c+sz/2})"/>')

    # Center orb
    s.append(f'<circle cx="{burst_cx}" cy="{burst_cy}" r="42" fill="url(#goldOrb)"/>')
    s.append(f'<circle cx="{burst_cx-12}" cy="{burst_cy-14}" r="10" fill="white" opacity="0.55"/>')
    s.append(f'<text x="{burst_cx}" y="{burst_cy+12}" font-family="{FONT}" font-size="32" fill="#241B0B" text-anchor="middle">★</text>')

    # Headline
    s.append(eyebrow(W/2, 444, "YOU JUST HIRED", color="#FFFFFF", anchor="middle", spacing=2.4))
    s.append(display(W/2, 490, "Mohammed Iqbal", size=30, color="#FFFFFF", anchor="middle"))
    s.append(display(W/2, 528, "as Head Cashier.", size=30, italic=True, serif=True,
                     color=GOLD_LIGHT, anchor="middle"))

    # Auto-share card preview
    y = 568
    s.append(card(36, y, W-72, 130, premium=True))
    s.append(eyebrow(50, y+22, "AUTO-GENERATED SHARE CARD"))
    # Mini "share" mockup
    s.append(avatar(72, y+72, 18, "M", kind="slate", premium=True))
    s.append(head(104, y+62, "Hired at Doondo Salon & Spa", size=12.5))
    s.append(body(104, y+80, "as Head Cashier  ·  Indiranagar  🎉", size=11))
    s.append(body(104, y+96, "doondo.in/hires/iqbal-2026-may", size=9.5, color=TEXT_TERTIARY))
    # share corner badge
    s.append(f'<rect x="{W-100}" y="{y+22}" width="56" height="24" rx="12" fill="rgba(199,168,122,0.18)" stroke="{GOLD_HAIRLINE_STRONG}" stroke-width="0.5"/>')
    s.append(f'<text x="{W-72}" y="{y+38}" font-family="{FONT}" font-size="10" font-weight="600" letter-spacing="0.6" fill="{GOLD_LIGHT}" text-anchor="middle">SHARE</text>')

    # Auto actions
    s.append(body(W/2, y+162, "Advance payment auto-offered  ·  family notified",
                  size=11, color=GOLD_LIGHT, anchor="middle"))

    # Continue CTA
    s.append(gold_btn(36, H - 100, W - 72, "Share & continue", h=50))

    s.append(home_indicator(white=True))
    s.append(svg_close())
    return "".join(s)


# ───────────────────────────────────────────────────────────────────────
# NEW Page 20 — Doondo for Women (mode landing)
# ───────────────────────────────────────────────────────────────────────

def page_women_mode():
    s = [svg_open(), status_bar()]
    s.append(monogram(W-42, 42))
    s.append(body(22, 70, "← Back", size=12, color=TEXT_SECONDARY))

    # Pink + gold aurora
    s.append(f'<ellipse cx="{W/2}" cy="240" rx="260" ry="200" fill="url(#auroraPink)"/>')
    s.append(f'<ellipse cx="{W/2+40}" cy="380" rx="160" ry="160" fill="url(#auroraGold)" opacity="0.7"/>')

    s.append(eyebrow(22, 116, "MODE", color=PINK_LIGHT))
    s.append(gold_rule(22, 130, 28))
    s.append(display(22, 178, "Doondo", size=34, color=PINK_LIGHT))
    s.append(display(22, 218, "for Women.", size=34, italic=True, serif=True,
                     color=GOLD_LIGHT))
    s.append(body(22, 246, "A safer, dignifying way to hire and be hired.",
                  size=12.5, color=TEXT_SECONDARY))

    # Hero illustration — feminine symbol with gold ring
    cx, cy = W/2, 396
    s.append(f'<circle cx="{cx}" cy="{cy}" r="78" fill="none" stroke="{GOLD_HAIRLINE}" stroke-width="0.6"/>')
    s.append(f'<circle cx="{cx}" cy="{cy}" r="58" fill="none" stroke="{PINK_BORDER}" stroke-width="0.6"/>')
    # Venus glyph
    s.append(f'<circle cx="{cx}" cy="{cy-12}" r="22" fill="none" stroke="url(#goldBrush)" stroke-width="2"/>')
    s.append(f'<rect x="{cx-2}" y="{cy+10}" width="4" height="24" fill="url(#goldBrush)"/>')
    s.append(f'<rect x="{cx-10}" y="{cy+22}" width="20" height="4" fill="url(#goldBrush)"/>')

    # Features panel
    y = 500
    items = [
        ("♀", "Women-only employers", "vetted, female-led businesses"),
        ("◔", "Masked location", "exact address shown only at interview"),
        ("✦", "Female reviewers", "verification handled by women only"),
        ("⚡", "Panic-tap", "alerts female-first responders + family"),
    ]
    iy = y
    for icon, title_t, sub in items:
        s.append(f'<circle cx="44" cy="{iy+18}" r="16" fill="{PINK_SUBTLE}" stroke="{PINK_BORDER}" stroke-width="0.6"/>')
        s.append(f'<text x="44" y="{iy+22}" font-family="{FONT_SERIF}" font-style="italic" font-size="14" fill="{PINK_LIGHT}" text-anchor="middle">{icon}</text>')
        s.append(head(72, iy+15, title_t, size=13))
        s.append(body(72, iy+32, sub, size=10.5))
        s.append(hairline(22, iy+50, W-22, iy+50))
        iy += 56

    # CTA — pink-on-gold premium
    s.append(f'<rect x="22" y="{H-94}" width="{W-44}" height="54" rx="16" fill="{PINK}" stroke="{GOLD_HAIRLINE_STRONG}" stroke-width="0.6"/>')
    s.append(f'<rect x="23" y="{H-93}" width="{W-46}" height="27" rx="15" fill="url(#cardLight)"/>')
    s.append(f'<text x="{W/2}" y="{H-63}" font-family="{FONT}" font-size="14.5" font-weight="600" letter-spacing="0.3" fill="white" text-anchor="middle">Enter women-only mode</text>')

    s.append(home_indicator())
    s.append(svg_close())
    return "".join(s)


# ───────────────────────────────────────────────────────────────────────
# Render & contact sheet
# ───────────────────────────────────────────────────────────────────────

OUT = "/sessions/awesome-eager-einstein/mnt/outputs/employer-ui-mockups"
DEST = "/sessions/awesome-eager-einstein/mnt/Doondo V2/employer-ui-mockups"
os.makedirs(OUT, exist_ok=True)
os.makedirs(DEST, exist_ok=True)

PAGES = [
    ("01_welcome", "Welcome", page_welcome),
    ("02_role_picker", "Role Picker (+ Women/Diaspora)", page_role_picker),
    ("03_signup", "Sign Up (+ Voice biometric)", page_signup),
    ("04_posts", "Posts (+ Anti-Ghost · Festival)", page_posts),
    ("05_post_job", "Post Job (+ Reverse Interview)", page_post_job),
    ("06_applicants", "Applicants (+ Crew · Score)", page_applicants),
    ("07_job_applicants", "Per-job (+ Smart Resume)", page_job_applicants),
    ("08_applicant_detail", "Applicant Detail", page_applicant_detail),
    ("09_available_workers", "Available + Open Shifts", page_available_workers),
    ("10_chat_list", "Chat (+ Translate)", page_chat_list),
    ("11_conversation", "Conversation (+ Quick-reply)", page_conversation),
    ("12_profile", "Profile (+ Pulse widget)", page_profile),
    ("13_hire_reels", "Hire Reels — video resume", page_hire_reels),
    ("14_skill_passport", "Skill Passport", page_skill_passport),
    ("15_live_auction", "Live Job Auction", page_auction),
    ("16_interview_scheduler", "Interview Scheduler", page_interview_scheduler),
    ("17_shift_checkin", "Live Shift Check-in", page_shift_checkin),
    ("18_doondo_coach", "Doondo Coach (voice AI)", page_doondo_coach),
    ("19_hire_celebration", "Hire Celebration", page_hire_celebration),
    ("20_women_mode", "Doondo for Women", page_women_mode),
]

for slug, _, fn in PAGES:
    svg_text = fn()
    png_bytes = cairosvg.svg2png(bytestring=svg_text.encode("utf-8"),
                                  output_width=W * 2, output_height=H * 2)
    for d in (OUT, DEST):
        with open(f"{d}/{slug}.png", "wb") as f:
            f.write(png_bytes)

# Contact sheet — 5 cols × 4 rows
cols, rows = 5, 4
thumb_w, thumb_h = 260, int(260 * H / W)
gap = 28
label_h = 32
pad = 56
sheet_w = pad * 2 + cols * thumb_w + (cols - 1) * gap
sheet_h = pad * 2 + 96 + rows * (thumb_h + label_h + gap) - gap

sheet = Image.new("RGB", (sheet_w, sheet_h), (10, 8, 9))
draw = ImageDraw.Draw(sheet)

# Gold rule line under title
for x in range(sheet_w):
    a = abs(x - sheet_w/2) / (sheet_w/2)
    draw.point((x, pad + 78), (int(199*(1-a)), int(168*(1-a)), int(122*(1-a))))

font_title = font_label = None
for candidate in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
                  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
    try:
        font_title = ImageFont.truetype(candidate, 36)
        font_label = ImageFont.truetype(candidate, 14)
        break
    except Exception:
        pass
if font_title is None:
    font_title = ImageFont.load_default()
    font_label = font_title

draw.text((pad, pad), "DOONDO  ·  EMPLOYER UI  ·  v2",
          fill=(237, 230, 215), font=font_title)
draw.text((pad, pad + 48),
          "20 pages · warm-dark luxe · Doondo Score · Skill Passport · Hire Reels · Coach · Anti-Ghost",
          fill=(156, 148, 138), font=font_label)

for i, (slug, label, _) in enumerate(PAGES):
    r, c = divmod(i, cols)
    x = pad + c * (thumb_w + gap)
    y = pad + 104 + r * (thumb_h + label_h + gap)
    im = Image.open(f"{OUT}/{slug}.png").convert("RGB")
    im_thumb = im.resize((thumb_w, thumb_h), Image.LANCZOS)
    sheet.paste(im_thumb, (x, y))
    draw.rectangle([x-1, y-1, x + thumb_w, y + thumb_h], outline=(60, 52, 38), width=1)
    draw.text((x + 4, y + thumb_h + 8), f"{i+1:02d}   {label}",
              fill=(225, 218, 200), font=font_label)

for d in (OUT, DEST):
    sheet.save(f"{d}/00_contact_sheet.png", "PNG", optimize=True)

print("OK", len(PAGES), "pages rendered")
print("Sheet:", sheet_w, "x", sheet_h)
