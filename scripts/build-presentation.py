from pathlib import Path
import json
import math
import os
import subprocess
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageColor

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "presentation"
PREVIEWS = OUT / "previews"
PREVIEWS.mkdir(parents=True, exist_ok=True)
DATA = json.loads(subprocess.check_output(["node", str(ROOT / "scripts/presentation-data.mjs")], text=True))
SCALE = 2
WIDTH, HEIGHT = 1280, 720
BG = "#090d17"
FG = "#f4f1ff"
MUTED = "#9ba4b8"
PURPLE = "#bda4fa"
ORANGE = "#edb581"
GREEN = "#80d4bc"
FONT_PATH = os.environ.get("NEXUS_SLIDE_FONT", "/System/Library/Fonts/Avenir Next.ttc")
MONO_PATH = os.environ.get("NEXUS_SLIDE_MONO_FONT", "/System/Library/Fonts/SFNSMono.ttf")
FONTS = {}


def font(size, weight="regular"):
    key = (size, weight)
    if key not in FONTS:
        path = MONO_PATH if weight == "mono" else FONT_PATH
        index = {"bold": 0, "demi": 2, "medium": 5, "regular": 7, "heavy": 8}.get(weight, 0)
        FONTS[key] = ImageFont.truetype(path, int(size * SCALE), index=index if path.endswith(".ttc") else 0)
    return FONTS[key]


def text(image, position, value, size=20, color=FG, weight="regular", spacing=1.2):
    draw = ImageDraw.Draw(image)
    horizontal, vertical = position
    for line in str(value).split("\n"):
        draw.text((int(horizontal * SCALE), int(vertical * SCALE)), line, font=font(size, weight), fill=color, anchor="lt")
        vertical += size * spacing


def label(image, position, value, color=MUTED, size=10):
    text(image, position, value, size, color, "mono")


def rect(image, box, fill, outline=None, radius=16, width=1):
    ImageDraw.Draw(image).rounded_rectangle(tuple(int(value * SCALE) for value in box), radius=int(radius * SCALE), fill=fill, outline=outline, width=width * SCALE)


def line(image, points, color, width=1):
    ImageDraw.Draw(image).line([(int(horizontal * SCALE), int(vertical * SCALE)) for horizontal, vertical in points], fill=color, width=max(1, int(width * SCALE)), joint="curve")


def ellipse(image, box, fill=None, outline=None, width=1):
    ImageDraw.Draw(image).ellipse(tuple(int(value * SCALE) for value in box), fill=fill, outline=outline, width=width * SCALE)


def glow(image, center, radius, color, opacity=70):
    layer = Image.new("RGBA", image.size)
    rgb = ImageColor.getrgb(color)
    horizontal, vertical = center
    ellipse(layer, (horizontal - radius, vertical - radius, horizontal + radius, vertical + radius), fill=(*rgb, opacity))
    image.alpha_composite(layer.filter(ImageFilter.GaussianBlur(radius * SCALE * 0.6)))


def arrow(image, start, end, color=PURPLE, width=2):
    line(image, [start, end], color, width)
    angle = math.atan2(end[1] - start[1], end[0] - start[0])
    points = [end, (end[0] - 10 * math.cos(angle - 0.5), end[1] - 10 * math.sin(angle - 0.5)), (end[0] - 10 * math.cos(angle + 0.5), end[1] - 10 * math.sin(angle + 0.5))]
    ImageDraw.Draw(image).polygon([(int(horizontal * SCALE), int(vertical * SCALE)) for horizontal, vertical in points], fill=color)


def star(image, center, size=15, color=PURPLE):
    horizontal, vertical = center
    points = [(horizontal, vertical - size), (horizontal + size * 0.26, vertical - size * 0.26), (horizontal + size, vertical), (horizontal + size * 0.26, vertical + size * 0.26), (horizontal, vertical + size), (horizontal - size * 0.26, vertical + size * 0.26), (horizontal - size, vertical), (horizontal - size * 0.26, vertical - size * 0.26)]
    ImageDraw.Draw(image).polygon([(int(left * SCALE), int(top * SCALE)) for left, top in points], fill=color)


def base(number, section, note="SYNTHETIC ENGINEERING CASES  /  HUMAN-REVIEWED DECISIONS"):
    image = Image.new("RGBA", (WIDTH * SCALE, HEIGHT * SCALE), BG)
    glow(image, (1090, 300), 240, "#564084", 38)
    for horizontal in range(65, 1250, 32):
        for vertical in range(100, 645, 32):
            ellipse(image, (horizontal, vertical, horizontal + 1, vertical + 1), "#212332")
    star(image, (78, 47), 14)
    text(image, (104, 37), "NEXUSFORGE", 20, FG, "demi")
    label(image, (858, 44), "AMD HACKATHON  /  INTELLIGENT INDUSTRY", size=10)
    line(image, [(65, 84), (1215, 84)], "#272936")
    line(image, [(65, 657), (1215, 657)], "#272936")
    label(image, (65, 678), note, size=9)
    label(image, (1025, 678), f"{section}   /   {number:02d}", size=9)
    return image


def twin(image, position, width):
    horizontal, vertical = position
    ratio = width / 1000
    draw = ImageDraw.Draw(image)
    for face in DATA["geometry"]:
        points = [((horizontal + point["x"] * ratio) * SCALE, (vertical + point["y"] * ratio) * SCALE) for point in face["points"]]
        draw.polygon(points, fill=face["fill"])
        draw.line(points + [points[0]], fill="#52607b", width=1)


def title(image, eyebrow, lines, size=60):
    label(image, (66, 118), eyebrow, PURPLE)
    text(image, (62, 151), lines, size, FG, "demi", 1.12)


def currency(amount, decimals=False):
    return f"€{amount:,.2f}" if decimals else f"€{amount:,.0f}"


slides = []
image = base(1, "THE PREMISE")
glow(image, (935, 388), 215, "#8260c4", 86)
for radius in (128, 212, 290):
    ellipse(image, (950 - radius, 369 - radius, 950 + radius, 369 + radius), outline="#343046")
label(image, (66, 131), "INDUSTRIAL DECISION INTELLIGENCE", PURPLE)
text(image, (60, 176), "Don't predict\nthe breakdown.", 68, FG, "demi", 1.05)
text(image, (60, 334), "Change\nthe outcome.", 76, PURPLE, "demi", 1.06)
text(image, (67, 526), "Challenge the cause. Compare the options.\nKeep the operator in control.", 19, MUTED, spacing=1.5)
twin(image, (529, 180), 769)
rect(image, (760, 498, 1189, 600), "#151925", "#594b76", 18)
star(image, (790, 529), 10)
label(image, (813, 523), "NEXT BEST MOVE", PURPLE)
text(image, (785, 552), "Ask for the missing observation.", 20, FG, "medium")
label(image, (790, 625), "PROCEDURAL TWIN / NOT A CALIBRATED PLANT MODEL", size=9)
slides.append(image)

image = base(2, "THE PROBLEM")
title(image, "FOR THE LINE SUPERVISOR UNDER PRODUCTION PRESSURE", "The alarm is not\nthe explanation.", 61)
rect(image, (831, 133, 1215, 300), "#111824", "#303345")
label(image, (853, 156), "PRESSURE LOSS  →  TORQUE RISE", ORANGE, 10)
for offset in (30, 65, 100):
    line(image, [(855, 169 + offset), (1190, 169 + offset)], "#252b3a")
series = DATA["before"]["scenario"]["sensor"]["series"]
line(image, [(855 + index * 335 / (len(series) - 1), 190 + (max(series) - value) / (max(series) - min(series)) * 86) for index, value in enumerate(series)], PURPLE, 3)
for left, heading, price, subtitle, accent in [(65, "UPSTREAM POSSIBILITY", "€18.50", "Pneumatic seal  /  verify before repair", PURPLE), (655, "DOWNSTREAM ALARM", "€2,450", "Robot motor  /  do not assume replacement", ORANGE)]:
    rect(image, (left, 341, left + 560, 596), "#141827", "#373348", 21)
    label(image, (left + 28, 367), heading, accent, 11)
    text(image, (left + 22, 406), price, 96, accent, "demi")
    text(image, (left + 30, 534), subtitle, 17, MUTED)
label(image, (69, 619), "ILLUSTRATIVE PART PRICES. THE APP MUST EARN THE REPAIR RECOMMENDATION WITH EVIDENCE.", size=10)
slides.append(image)

image = base(3, "THE METHOD", "SUPPORT SCORES ARE DECLARED WEIGHTS, NOT CALIBRATED PROBABILITIES. TEST RESULTS HERE ARE SYNTHETIC.")
title(image, "ACTIVE DIAGNOSIS / REDUCE UNCERTAINTY BEFORE SPENDING", "One observation. A different decision.", 53)
for left, state, heading, accent in [(65, DATA["before"], "01 / BEFORE THE TEST", MUTED), (665, DATA["after"], "02 / LEAK CONFIRMED", PURPLE)]:
    rect(image, (left, 252, left + 550, 552), "#131827", "#373448", 21)
    label(image, (left + 26, 278), heading, accent, 11)
    hypotheses = {item["id"]: item for item in state["reasoning"]["hypotheses"]}
    for index, (identity, name) in enumerate([("seal", "Pneumatic leakage"), ("regulator", "Regulator instability"), ("sensor", "Measurement discrepancy"), ("drive", "Independent drive fault")]):
        top = 318 + index * 55
        weight = round(hypotheses[identity]["weight"] * 100)
        text(image, (left + 26, top), name, 16, FG if index == 0 else MUTED, "medium")
        label(image, (left + 474, top + 1), f"{weight:02d}/100", PURPLE if index == 0 else MUTED, 12)
        rect(image, (left + 26, top + 28, left + 515, top + 34), "#292f40", radius=3)
        rect(image, (left + 26, top + 28, left + 26 + max(3, weight * 4.89), top + 34), PURPLE if index == 0 else "#52526f", radius=3)
arrow(image, (624, 400), (655, 400))
rect(image, (65, 577, 1215, 632), "#1b1930", "#48405e", 12)
text(image, (86, 594), f"{DATA['before']['reasoning']['nextObservation']['informationGainBits']:.3f} bits", 22, PURPLE, "demi")
text(image, (224, 597), "Modeled information gain chooses the next useful observation—not a more confident story.", 16, FG)
slides.append(image)

image = base(4, "THE DIFFERENCE", "SYNTHETIC COST COMPARISON / NO REALIZED SAVINGS / CONVENTIONAL BASELINE IS NOT AN AUTHORIZED ACTION")
title(image, "NOT A SCRIPTED ANSWER. A DECISION YOU CAN CHALLENGE.", "Let the jury change the evidence.", 56)
cards = [("01", "No test result", "Inspect first", "Don't guess the repair.", MUTED), ("02", "Leak confirmed", "Repair eligible", "Only with parts and time.", PURPLE), ("03", "Stock = zero", "Block repair", "Diagnosis is not recovery.", ORANGE), ("04", "Unsafe readings", "Escalate", "The model cannot override.", GREEN)]
for index, (number, heading, action, detail, accent) in enumerate(cards):
    left = 65 + index * 293
    rect(image, (left, 261, left + 272, 469), "#131827", "#353346", 18)
    ellipse(image, (left + 22, 283, left + 68, 329), fill="#24253a", outline="#47405c")
    label(image, (left + 33, 298), number, accent, 13)
    text(image, (left + 22, 351), heading, 18, MUTED, "medium")
    text(image, (left + 20, 387), action, 28, accent, "demi")
    text(image, (left + 22, 436), detail, 13, MUTED)
chosen = next(plan for plan in DATA["after"]["plans"] if plan["id"] == "targeted")
baseline = next(plan for plan in DATA["after"]["plans"] if plan["id"] == "replace")
text(image, (64, 515), currency(chosen["savings"]), 75, PURPLE, "demi")
text(image, (445, 528), "Lower modeled scenario cost", 28, FG, "demi")
text(image, (448, 574), f"{currency(baseline['cost'])} conventional baseline vs {currency(chosen['cost'])} confirmed repair.\n{baseline['downtime']:.0f} vs {chosen['downtime']:.0f} minutes under explicit assumptions; figures rounded.", 16, MUTED, spacing=1.5)
slides.append(image)

image = base(5, "THE SYSTEM", "INTEGRATION DESIGN / ACTUAL AMD + EVOLUS VERIFICATION PENDING / NO GPU BENCHMARK OR FIELD-ACCURACY CLAIM")
title(image, "OPEN MODELS. DETERMINISTIC CONSTRAINTS. A HUMAN SIGNATURE.", "Intelligence proposes. Policy constrains.", 51)
columns = [
    (65, "01 / EVIDENCE", "CSV + reference text", "Validated values. Exact source lines.", "Evolus libraries + extraction", "Source-matched fields feed planning.", PURPLE),
    (465, "02 / REASONING", "AMD-hosted open model", "Review hypotheses and cite evidence.", "Local constraint solver", "Stock, deadlines, safety, modeled cost.", ORANGE),
    (865, "03 / ACCOUNTABILITY", "Named human review", "No action without acknowledgement.", "Evolus workflow request", "Honest status. Persisted audit trail.", GREEN)
]
for left, heading, top_title, top_body, bottom_title, bottom_body, accent in columns:
    rect(image, (left, 256, left + 350, 515), "#131827", "#383349", 20)
    label(image, (left + 22, 281), heading, accent, 11)
    text(image, (left + 22, 326), top_title, 20, FG, "demi")
    text(image, (left + 22, 363), top_body, 13, MUTED)
    line(image, [(left + 22, 399), (left + 328, 399)], "#333044")
    text(image, (left + 22, 429), bottom_title, 20, FG, "demi")
    text(image, (left + 22, 468), bottom_body, 13, MUTED)
arrow(image, (424, 376), (454, 376))
arrow(image, (824, 376), (854, 376))
passed, total = DATA["evaluation"]["passed"], DATA["evaluation"]["total"]
text(image, (68, 554), f"{passed}/{total}", 55, GREEN, "demi")
text(image, (256, 567), "Reproducible synthetic\ndecision-contract checks", 19, MUTED, spacing=1.35)
rect(image, (761, 559, 1215, 622), "#2a221f", "#685346", 14)
ellipse(image, (782, 584, 791, 593), fill=ORANGE)
text(image, (805, 580), "Live provider verification: pending", 18, ORANGE, "medium")
slides.append(image)

image = base(6, "YOUR TURN", "NEXUSFORGE / DECISION INTELLIGENCE FOR THE OPERATOR WHO OWNS THE OUTCOME")
label(image, (66, 125), "FROM A PRESENTATION TO A DECISION", PURPLE)
text(image, (61, 176), "Your evidence.\nYour constraints.", 65, FG, "demi", 1.2)
text(image, (61, 335), "Your next move.", 65, PURPLE, "demi")
text(image, (68, 449), "A better question before a costly action.", 21, MUTED)
rect(image, (67, 528, 464, 597), PURPLE, radius=15)
star(image, (99, 562), 12, BG)
text(image, (128, 548), "Let's challenge the demo.", 22, BG, "demi")
glow(image, (994, 365), 205, "#7854b5", 70)
rect(image, (760, 151, 1215, 593), "#131827", "#514366", 26)
label(image, (796, 182), "INTERACTIVE DEMO / 90 SECONDS", PURPLE, 11)
steps = [("01", "Choose the evidence", "Eight adversarial cases—or upload a CSV."), ("02", "Change one constraint", "Confirm the test. Remove the part."), ("03", "Make the final call", "Inspect the sources. Review the action.")]
for index, (number, heading, detail) in enumerate(steps):
    top = 244 + index * 110
    ellipse(image, (794, top, 836, top + 42), fill="#29233d", outline="#554a70")
    label(image, (804, top + 14), number, PURPLE, 12)
    text(image, (856, top + 2), heading, 22, FG, "demi")
    text(image, (856, top + 41), detail, 13, MUTED)
label(image, (797, 559), "START IN THE EVIDENCE STUDIO", GREEN, 10)
slides.append(image)

rgb_slides = [image.convert("RGB") for image in slides]
for index, image in enumerate(rgb_slides, start=1):
    image.save(PREVIEWS / f"slide-{index:02d}.png", optimize=True)
rgb_slides[0].save(OUT / "NexusForge-Cover.png", optimize=True)
rgb_slides[0].save(OUT / "NexusForge-Pitch.pdf", "PDF", save_all=True, append_images=rgb_slides[1:], resolution=144, quality=95, subsampling=0, title="NexusForge — Change the outcome", author="NexusForge", subject="AMD hackathon | Evidence-first industrial decision intelligence")
sheet = Image.new("RGB", (1280, 1080), "#070a11")
for index, image in enumerate(rgb_slides):
    sheet.paste(image.resize((640, 360), Image.Resampling.LANCZOS), ((index % 2) * 640, (index // 2) * 360))
sheet.save(PREVIEWS / "contact-sheet.png")
print(f"Created {len(slides)} slides, PDF, cover and preview contact sheet in {OUT}")
