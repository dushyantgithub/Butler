"""Build the Butler toy-brick icon set.

The brick is the app header's `.brick-logo` (tan #d2ad68, -7deg tilt, two studs)
drawn as a 3D brick on the navy (#334859) used by the wordmark.

Outputs (in ./out):
  icon-mac.svg / icon-tile.svg / icon-small.svg  master artwork
  icon.png (1024), icon.icns, icon.ico, favicon.svg, butler-logo.png (400)
"""
import io
import math
import pathlib
from PIL import Image
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).parent
OUT = HERE / "out"
OUT.mkdir(exist_ok=True)

NAVY_TOP, NAVY_BOT, NAVY_FLAT = "#3c5468", "#2a3b4a", "#334859"
FRONT, TOP, RIGHT = "#d2ad68", "#e3c27f", "#b48d4d"
STUD_TOP, STUD_FRONT, STUD_RIGHT = "#eed49c", "#dab772", "#bf9956"
EDGE = "#f3dfb0"


def squircle(cx, cy, size, n=5.0, steps=720):
    a = size / 2
    pts = []
    for i in range(steps):
        t = 2 * math.pi * i / steps
        c, s = math.cos(t), math.sin(t)
        pts.append(f"{cx + a * math.copysign(abs(c) ** (2 / n), c):.2f},{cy + a * math.copysign(abs(s) ** (2 / n), s):.2f}")
    return "M" + " L".join(pts) + " Z"


def poly(pts, fill, u, round_=1.6):
    d = "M" + " L".join(f"{x:.2f},{y:.2f}" for x, y in pts) + " Z"
    return f'<path d="{d}" fill="{fill}" stroke="{fill}" stroke-width="{round_ * u:.2f}" stroke-linejoin="round"/>'


def brick(cx, cy, u, detail=True, shadow=False, angle=-7, dx=6.5, dy=7.5):
    small = not detail  # tiny sizes: shallower body, taller studs, stronger face contrast
    if small:
        dx, dy = 5.5, 5.5
    top, right, stud_top, stud_front = (("#edd291", "#a6813f", "#f6e2b4", "#d9b570") if small
                                        else (TOP, RIGHT, STUD_TOP, STUD_FRONT))
    fw, fh = 30.5 - dx, 32 - dy
    ox, oy = cx - 15 * u, cy - (fh / 2 - 4.2) * u
    P = lambda x, y: (ox + x * u, oy + y * u)
    parts = []
    if shadow:
        X, Y = P(fw / 2 + 2.2, fh + 0.3)
        parts.append(f'<ellipse cx="{X:.2f}" cy="{Y:.2f}" rx="{16.5 * u:.2f}" ry="{2.3 * u:.2f}" '
                     f'fill="#0b131b" opacity="0.55" filter="url(#bl)"/>')
    parts.append(poly([P(fw, 0), P(fw + dx, -dy), P(fw + dx, fh - dy), P(fw, fh)], "url(#rf)" if detail else right, u))
    parts.append(poly([P(0, 0), P(fw, 0), P(fw + dx, -dy), P(dx, -dy)], top, u))
    parts.append(poly([P(0, 0), P(fw, 0), P(fw, fh), P(0, fh)], "url(#ff)" if detail else FRONT, u))
    r, ry, hgt = (4.6, 1.9, 5.6) if small else (4.3, 2.2, 4.0)
    for sx in ((18.0, 5.4) if small else (17.6, 6.0)):  # back stud first
        X, Y = P(sx + dx / 2, -dy / 2)
        rx_, ry_, h = r * u, ry * u, hgt * u
        parts.append(f'<path d="M{X - rx_:.2f},{Y:.2f} V{Y - h:.2f} H{X + rx_:.2f} V{Y:.2f} '
                     f'A{rx_:.2f},{ry_:.2f} 0 0 1 {X - rx_:.2f},{Y:.2f} Z" fill="{stud_front}"/>')
        if detail:
            parts.append(f'<path d="M{X + rx_ * 0.45:.2f},{Y - h:.2f} H{X + rx_:.2f} V{Y:.2f} '
                         f'A{rx_:.2f},{ry_:.2f} 0 0 1 {X + rx_ * 0.45:.2f},{Y + ry_ * 0.89:.2f} Z" fill="{STUD_RIGHT}"/>')
        parts.append(f'<ellipse cx="{X:.2f}" cy="{Y - h:.2f}" rx="{rx_:.2f}" ry="{ry_:.2f}" fill="{stud_top}"/>')
    if detail:
        a, b = P(0.4, 0), P(fw - 0.2, 0)
        parts.append(f'<path d="M{a[0]:.2f},{a[1]:.2f} L{b[0]:.2f},{b[1]:.2f}" stroke="{EDGE}" '
                     f'stroke-width="{0.7 * u:.2f}" stroke-linecap="round" opacity="0.7"/>')
    return f'<g transform="rotate({angle} {cx:.2f} {cy:.2f})">' + "".join(parts) + "</g>"


def icon(size=1024, plate=824, u=13.2, shape="squircle", detail=True, flat_bg=False):
    """shape: 'squircle' (macOS grid) or 'rounded' (tile for Windows/web)."""
    c, s = size / 2, plate / 824
    if shape == "squircle":
        sp = squircle(c, c, plate)
        bg_shape = f'<path d="{sp}" fill="{{fill}}"/>'
        clip = f'<clipPath id="pl"><path d="{sp}"/></clipPath>'
    else:
        m, rr = (size - plate) / 2, plate * 0.225
        bg_shape = f'<rect x="{m:.2f}" y="{m:.2f}" width="{plate:.2f}" height="{plate:.2f}" rx="{rr:.2f}" fill="{{fill}}"/>'
        clip = f'<clipPath id="pl"><rect x="{m:.2f}" y="{m:.2f}" width="{plate:.2f}" height="{plate:.2f}" rx="{rr:.2f}"/></clipPath>'
    defs = [
        f'<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{NAVY_TOP}"/>'
        f'<stop offset="1" stop-color="{NAVY_BOT}"/></linearGradient>',
    ]
    layers = [bg_shape.replace("{fill}", NAVY_FLAT if flat_bg else "url(#bg)")]
    if detail:
        defs += [
            '<radialGradient id="gl" cx="0.5" cy="0.45" r="0.42"><stop offset="0" stop-color="#6d8aa3" stop-opacity="0.35"/>'
            '<stop offset="1" stop-color="#6d8aa3" stop-opacity="0"/></radialGradient>',
            f'<filter id="bl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="{16 * s:.2f}"/></filter>',
            '<linearGradient id="ff" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d8b471"/><stop offset="1" stop-color="#c9a25e"/></linearGradient>',
            '<linearGradient id="rf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b8914f"/><stop offset="1" stop-color="#a47f42"/></linearGradient>',
            clip,
        ]
        layers.append(f'<rect width="{size}" height="{size}" fill="url(#gl)" clip-path="url(#pl)"/>')
        if shape == "squircle":
            layers.append(f'<path d="{squircle(c, c, plate - 3 * s)}" fill="none" stroke="#fff" '
                          f'stroke-opacity="0.08" stroke-width="{3 * s:.2f}"/>')
    layers.append(brick(c, c + 2 * s, u, detail=detail, shadow=detail))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">'
            f'<defs>{"".join(defs)}</defs>{"".join(layers)}</svg>')


# Master artwork ---------------------------------------------------------------
MAC = icon()                                                        # macOS grid: 824 plate in 1024
MAC_SMALL = icon(u=15.0, detail=False)                              # 16/32 px Finder sizes
TILE = icon(shape="rounded", plate=944, u=13.2 * 944 / 824)         # Windows / generic / logo
TILE_SMALL = icon(shape="rounded", plate=1024, u=19.0, detail=False, flat_bg=True)  # <= 32 px
FAVICON = icon(size=64, shape="rounded", plate=64, u=19.0 * 64 / 1024, detail=False, flat_bg=True) \
    .replace(' width="64" height="64" viewBox', ' viewBox')

for name, svg in {"icon-mac.svg": MAC, "icon-mac-small.svg": MAC_SMALL, "icon-tile.svg": TILE,
                  "icon-tile-small.svg": TILE_SMALL, "favicon.svg": FAVICON}.items():
    (OUT / name).write_text(svg)


def rasterize(jobs):
    """jobs: list of (svg_text, size) -> list of PIL images (RGBA)."""
    imgs = []
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
        pg = b.new_page()
        for svg, size in jobs:
            # render at 4x then downsample with Lanczos for clean small sizes
            scale = 4 if size < 256 else 1
            px = size * scale
            pg.set_viewport_size({"width": px, "height": px})
            data = svg.replace("#", "%23")
            pg.set_content(f"<html><body style='margin:0;background:transparent'><img src='data:image/svg+xml;utf8,{data}' "
                           f"style='display:block;width:{px}px;height:{px}px'></body></html>")
            pg.wait_for_timeout(30)
            png = pg.screenshot(omit_background=True, clip={"x": 0, "y": 0, "width": px, "height": px})
            im = Image.open(io.BytesIO(png)).convert("RGBA")
            if scale != 1:
                im = im.resize((size, size), Image.LANCZOS)
            imgs.append(im)
        b.close()
    return imgs


mac_sizes = [16, 32, 64, 128, 256, 512, 1024]
tile_sizes = [16, 24, 32, 48, 64, 128, 256]
jobs = [(MAC_SMALL if s <= 32 else MAC, s) for s in mac_sizes]
jobs += [(TILE_SMALL if s <= 32 else TILE, s) for s in tile_sizes]
jobs += [(TILE, 400)]
imgs = rasterize(jobs)
mac = dict(zip(mac_sizes, imgs[: len(mac_sizes)]))
tile = dict(zip(tile_sizes, imgs[len(mac_sizes): len(mac_sizes) + len(tile_sizes)]))
logo = imgs[-1]

mac[1024].save(OUT / "icon.png")
mac[1024].save(OUT / "icon.icns", append_images=[mac[s] for s in mac_sizes if s != 1024])
tile[256].save(OUT / "icon.ico", sizes=[(s, s) for s in tile_sizes],
               append_images=[tile[s] for s in tile_sizes if s != 256])
logo.save(OUT / "butler-logo.png")
for s, im in {**{f"mac{k}": v for k, v in mac.items()}, **{f"tile{k}": v for k, v in tile.items()}}.items():
    im.save(OUT / f"_{s}.png")
print("built", sorted(p.name for p in OUT.iterdir() if not p.name.startswith("_")))
