#!/usr/bin/env python3
"""Generate ChainPulse LIVE demo video slides (1280x720)."""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

OUT = Path("/workspace/hackathons/binance-agent-os-onchain/demo/frames")
OUT.mkdir(parents=True, exist_ok=True)
W, H = 1280, 720

BG = (10, 14, 28)
BG2 = (16, 22, 42)
CARD = (22, 30, 55)
ACCENT = (240, 185, 11)
CYAN = (0, 210, 190)
GREEN = (46, 204, 113)
RED = (231, 76, 60)
WHITE = (240, 242, 248)
MUTED = (140, 150, 175)
DIM = (90, 100, 125)

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_M = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"


def f(path, size):
    return ImageFont.truetype(path, size)


def new_img():
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 6], fill=ACCENT)
    d.rectangle([0, H - 36, W, H], fill=BG2)
    d.text(
        (40, H - 28),
        "ChainPulse  ·  Binance Agent OS  ·  Onchain / BAW",
        font=f(FONT, 14),
        fill=MUTED,
    )
    # LIVE green badge bottom-right
    live_font = f(FONT_B, 14)
    live = "● LIVE"
    bbox = d.textbbox((0, 0), live, font=live_font)
    tw = bbox[2] - bbox[0]
    d.rounded_rectangle(
        [W - tw - 48, H - 30, W - 24, H - 8],
        radius=6,
        fill=(18, 60, 40),
    )
    d.text((W - tw - 36, H - 28), live, font=live_font, fill=GREEN)
    return img, d


def rounded_rect(d, xy, r, fill):
    d.rounded_rectangle(list(xy), radius=r, fill=fill)


def badge(d, x, y, text, fill, tfill=BG):
    font = f(FONT_B, 16)
    bbox = d.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    pad_x, pad_y = 14, 8
    rounded_rect(d, (x, y, x + tw + pad_x * 2, y + th + pad_y * 2), 8, fill)
    d.text((x + pad_x, y + pad_y - 1), text, font=font, fill=tfill)


def save(img, name):
    path = OUT / name
    img.save(path, "PNG")
    print(f"wrote {path}")


# ── 01 Title ──────────────────────────────────────────────────────────────
img, d = new_img()
d.text((80, 140), "ChainPulse", font=f(FONT_B, 72), fill=WHITE)
d.text(
    (80, 230),
    "Onchain workflows via Binance Agentic Wallet",
    font=f(FONT, 28),
    fill=CYAN,
)
d.text((80, 280), "(baw)", font=f(FONT_M, 26), fill=ACCENT)
badge(d, 80, 360, "● LIVE", GREEN, BG)
badge(d, 200, 360, "BAW PRIMARY", ACCENT, BG)
badge(d, 380, 360, "BSC / SOLANA", CYAN, BG)
d.text(
    (80, 460),
    "Real wallet · Real swap · Real Lista Earn  ·  Not paper",
    font=f(FONT, 18),
    fill=MUTED,
)
d.text(
    (80, 510),
    "Binance Agent OS · Onchain Track",
    font=f(FONT, 16),
    fill=DIM,
)
save(img, "01_title.png")

# ── 02 Auth ────────────────────────────────────────────────────────────────
img, d = new_img()
d.text((80, 50), "Auth — baw auth signin", font=f(FONT_B, 36), fill=WHITE)
d.text(
    (80, 100),
    "Binance App QR → verify  ·  NOT Hub Connect",
    font=f(FONT, 18),
    fill=MUTED,
)

steps = [
    ("1", "baw auth signin", "CLI starts local\nsign-in session"),
    ("2", "Binance App QR", "Scan QR in\nmobile Binance App"),
    ("3", "Verify", "Approve session\n→ wallet CONNECTED"),
]
for i, (num, title, desc) in enumerate(steps):
    x = 80 + i * 380
    y = 180
    rounded_rect(d, (x, y, x + 340, y + 320), 16, CARD)
    d.ellipse([x + 130, y + 30, x + 210, y + 110], fill=ACCENT if i < 2 else GREEN)
    bbox = d.textbbox((0, 0), num, font=f(FONT_B, 32))
    nw = bbox[2] - bbox[0]
    d.text((x + 170 - nw // 2, y + 48), num, font=f(FONT_B, 32), fill=BG)
    d.text((x + 30, y + 140), title, font=f(FONT_B, 22), fill=WHITE)
    for j, line in enumerate(desc.split("\n")):
        d.text((x + 30, y + 190 + j * 28), line, font=f(FONT, 17), fill=MUTED)
    if i < 2:
        d.text((x + 345, y + 140), "→", font=f(FONT_B, 36), fill=ACCENT)

d.text(
    (80, 540),
    "✗  Do NOT use Agentic Hub Connect for this flow",
    font=f(FONT_B, 18),
    fill=RED,
)
save(img, "02_auth.png")

# ── 03 Wallet CONNECTED ───────────────────────────────────────────────────
img, d = new_img()
d.text((80, 50), "Live Wallet — CONNECTED", font=f(FONT_B, 36), fill=WHITE)
d.text(
    (80, 100),
    "baw wallet status / address  ·  LIVE session",
    font=f(FONT, 18),
    fill=MUTED,
)

rounded_rect(d, (80, 160, 1200, 250), 14, CARD)
badge(d, 110, 185, "STATUS", DIM, WHITE)
d.text((250, 190), "CONNECTED", font=f(FONT_B, 28), fill=GREEN)
d.text((520, 195), "baw wallet status --json", font=f(FONT_M, 16), fill=MUTED)

# Solana card
rounded_rect(d, (80, 280, 620, 520), 16, CARD)
d.rectangle([80, 280, 620, 330], fill=(30, 40, 70))
d.text((110, 292), "Solana", font=f(FONT_B, 22), fill=CYAN)
d.text((110, 360), "CT_501", font=f(FONT_M, 16), fill=MUTED)
d.text((110, 400), "Bq7j…CNvr", font=f(FONT_B, 32), fill=WHITE)
d.text(
    (110, 460),
    "Bq7jLJDYTk1qe9nsoCBgJvEWMxhuv9Rzkgyh7Nh5CNvr",
    font=f(FONT_M, 12),
    fill=DIM,
)

# EVM card
rounded_rect(d, (660, 280, 1200, 520), 16, CARD)
d.rectangle([660, 280, 1200, 330], fill=(30, 40, 70))
d.text((690, 292), "EVM  ·  BSC / ETH / …", font=f(FONT_B, 22), fill=ACCENT)
d.text((690, 360), "chainId 56 (BSC) + others", font=f(FONT_M, 16), fill=MUTED)
d.text((690, 400), "0xC270…6593", font=f(FONT_B, 32), fill=WHITE)
d.text(
    (690, 460),
    "0xC2708cF97F8A65d4bCA9A6ec4196CE4a352e6593",
    font=f(FONT_M, 12),
    fill=DIM,
)
badge(d, 80, 550, "● LIVE", GREEN, BG)
save(img, "03_wallet.png")

# ── 04 Balances AFTER ops ─────────────────────────────────────────────────
img, d = new_img()
d.text((80, 50), "Live BSC Balances — AFTER ops", font=f(FONT_B, 34), fill=WHITE)
d.text(
    (80, 100),
    "Post swap + Lista Earn deposit  ·  chainId 56",
    font=f(FONT, 18),
    fill=MUTED,
)

balances = [
    ("USDT", "~4.43", "spot", ACCENT),
    ("BNB", "~0.0027", "gas + swap out", CYAN),
    ("roxptUSDT", "~1.97", "Lista Earn receipt", GREEN),
]
for i, (sym, amt, note, col) in enumerate(balances):
    x = 80 + i * 380
    y = 180
    rounded_rect(d, (x, y, x + 350, y + 300), 16, CARD)
    d.text((x + 30, y + 40), sym, font=f(FONT_B, 28), fill=MUTED)
    d.text((x + 30, y + 110), amt, font=f(FONT_B, 48), fill=col)
    d.text((x + 30, y + 200), note, font=f(FONT, 18), fill=MUTED)
    badge(d, x + 30, y + 250, "BSC", (30, 40, 70), CYAN)

badge(d, 80, 520, "● LIVE BALANCES", GREEN, BG)
d.text(
    (320, 528),
    "baw wallet balance --json",
    font=f(FONT_M, 16),
    fill=MUTED,
)
save(img, "04_balances.png")

# ── 05 Live swap FINISHED ─────────────────────────────────────────────────
img, d = new_img()
d.text((80, 50), "Live Swap — FINISHED", font=f(FONT_B, 36), fill=WHITE)
d.text(
    (80, 100),
    "1 USDT → 0.001337 BNB  ·  BSC  ·  order FINISHED",
    font=f(FONT, 18),
    fill=MUTED,
)

rounded_rect(d, (80, 160, 1200, 340), 16, CARD)
# from → to
d.text((120, 190), "FROM", font=f(FONT, 14), fill=MUTED)
d.text((120, 220), "1 USDT", font=f(FONT_B, 36), fill=WHITE)
d.text((420, 220), "→", font=f(FONT_B, 40), fill=ACCENT)
d.text((520, 190), "TO", font=f(FONT, 14), fill=MUTED)
d.text((520, 220), "0.001337 BNB", font=f(FONT_B, 36), fill=CYAN)
badge(d, 980, 220, "FINISHED", GREEN, BG)
d.text((120, 290), "order status: FINISHED", font=f(FONT_M, 18), fill=GREEN)

rounded_rect(d, (80, 370, 1200, 540), 16, CARD)
d.text((110, 390), "tx hash", font=f(FONT, 14), fill=MUTED)
# wrap long hash
tx = "0x9945b10ce4d45a06963fc0cd567606c4d153af3764b60b2b4a440066c96c9b92"
d.text((110, 430), tx[:42], font=f(FONT_M, 18), fill=WHITE)
d.text((110, 465), tx[42:], font=f(FONT_M, 18), fill=WHITE)
d.text((110, 505), "BSC explorer · live on-chain", font=f(FONT, 16), fill=MUTED)

badge(d, 80, 570, "● LIVE SWAP", GREEN, BG)
save(img, "05_swap.png")

# ── 06 Lista Earn deposit ─────────────────────────────────────────────────
img, d = new_img()
d.text((80, 50), "Live Lista Earn — Deposit", font=f(FONT_B, 36), fill=WHITE)
d.text(
    (80, 100),
    "2 USDT → ~1.966 roxptUSDT  ·  Lista (helio) Earn",
    font=f(FONT, 18),
    fill=MUTED,
)

rounded_rect(d, (80, 160, 1200, 340), 16, CARD)
d.text((120, 190), "DEPOSIT", font=f(FONT, 14), fill=MUTED)
d.text((120, 220), "2 USDT", font=f(FONT_B, 36), fill=WHITE)
d.text((420, 220), "→", font=f(FONT_B, 40), fill=ACCENT)
d.text((520, 190), "RECEIPT", font=f(FONT, 14), fill=MUTED)
d.text((520, 220), "~1.966 roxptUSDT", font=f(FONT_B, 32), fill=GREEN)
badge(d, 980, 220, "DONE", GREEN, BG)
d.text((120, 290), "protocol: Lista (helio)  ·  investType: Earn", font=f(FONT_M, 16), fill=MUTED)

rounded_rect(d, (80, 370, 1200, 540), 16, CARD)
d.text((110, 390), "tx hash", font=f(FONT, 14), fill=MUTED)
tx2 = "0xa753e1468407da0914b04139da188c8e8b4e9abf35dca93134b7f3b6b818ff48"
d.text((110, 430), tx2[:42], font=f(FONT_M, 18), fill=WHITE)
d.text((110, 465), tx2[42:], font=f(FONT_M, 18), fill=WHITE)
d.text((110, 505), "BSC explorer · live DeFi deposit", font=f(FONT, 16), fill=MUTED)

badge(d, 80, 570, "● LIVE DEFI", GREEN, BG)
save(img, "06_lista.png")

# ── 07 Quotas + risk ──────────────────────────────────────────────────────
img, d = new_img()
d.text((80, 50), "Quotas & Risk Gates", font=f(FONT_B, 36), fill=WHITE)
d.text(
    (80, 100),
    "Documented daily caps  ·  risk gates  ·  no withdrawals",
    font=f(FONT, 18),
    fill=MUTED,
)

quotas = [
    ("Swap", "$50k left", "~$50,000 daily", ACCENT),
    ("DeFi", "$5k left", "Lista / Earn bucket", CYAN),
    ("x402", "$20 left", "x402 payments", GREEN),
]
for i, (title, left, note, col) in enumerate(quotas):
    x = 80 + i * 380
    y = 160
    rounded_rect(d, (x, y, x + 350, y + 200), 16, CARD)
    d.text((x + 30, y + 30), title, font=f(FONT_B, 22), fill=MUTED)
    d.text((x + 30, y + 80), left, font=f(FONT_B, 36), fill=col)
    d.text((x + 30, y + 145), note, font=f(FONT, 16), fill=MUTED)

rounded_rect(d, (80, 400, 1200, 560), 16, CARD)
gates = [
    "✓  Risk gates: max notional / step, kill-switch aware",
    "✓  Confirm-required for live ops",
    "✗  No external withdrawals (agent wallet policy)",
]
for i, line in enumerate(gates):
    col = RED if line.startswith("✗") else GREEN
    d.text((110, 425 + i * 40), line, font=f(FONT_B, 18), fill=col)

save(img, "07_quotas.png")

# ── 08 Repo + LIVE PASS ───────────────────────────────────────────────────
img, d = new_img()
d.text((80, 120), "Repo + Next", font=f(FONT_B, 40), fill=WHITE)
d.text(
    (80, 190),
    "github.com/herewegoagain4436-creator/",
    font=f(FONT_M, 22),
    fill=MUTED,
)
d.text(
    (80, 230),
    "chainpulse-binance-agent-os",
    font=f(FONT_B, 28),
    fill=CYAN,
)

badge(d, 80, 320, "● LIVE PASS", GREEN, BG)
badge(d, 280, 320, "SWAP FINISHED", ACCENT, BG)
badge(d, 520, 320, "LISTA DEPOSIT", CYAN, BG)

d.text((80, 420), "Onchain workflows via baw — real txs on BSC", font=f(FONT, 20), fill=WHITE)
d.text(
    (80, 470),
    "Auth QR · Wallet CONNECTED · Swap · Lista Earn · Quotas",
    font=f(FONT, 18),
    fill=MUTED,
)
d.text(
    (80, 530),
    "ChainPulse  ·  Binance Agent OS Onchain",
    font=f(FONT, 16),
    fill=DIM,
)
save(img, "08_end.png")

print(f"\nAll frames written to {OUT}")
