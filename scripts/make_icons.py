#!/usr/bin/env python3
"""Render the app icon set.

The mark is the board's sigil (design/board/pin08.png): a 2x2 grid of
geometric primitives — quarter circle, dot pair, dome, disc — the same
four shapes the home-screen card widget draws. No dot matrix, so the
launcher stops reading as Nothing OS.

Pure stdlib: there is no Pillow in this environment, so the rasteriser
supersamples into a byte buffer and zlib-packs a PNG by hand.
"""

import math
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"

INK = (11, 11, 10)
PAPER = (244, 242, 237)

SS = 4  # supersampling factor


class Canvas:
    """RGBA byte canvas with supersampled coverage shapes."""

    def __init__(self, size, fill):
        self.size = size
        self.hi = size * SS
        r, g, b, a = fill
        self.buf = bytearray([r, g, b, a] * (self.hi * self.hi))

    def _blend(self, x, y, color, alpha):
        if alpha <= 0:
            return
        i = (y * self.hi + x) * 4
        src_r, src_g, src_b = color
        dst_r, dst_g, dst_b, dst_a = self.buf[i : i + 4]
        out_a = alpha + dst_a / 255 * (1 - alpha)
        if out_a <= 0:
            return
        for k, (s, d) in enumerate(((src_r, dst_r), (src_g, dst_g), (src_b, dst_b))):
            self.buf[i + k] = int(
                (s * alpha + d / 255 * dst_a / 255 * (1 - alpha)) / out_a
            )
        self.buf[i + 3] = int(out_a * 255)

    def fill_where(self, box, predicate, color):
        """Fill every supersampled pixel inside `box` where predicate(x, y)."""
        x0, y0, x1, y1 = (int(v * SS) for v in box)
        for y in range(max(0, y0), min(self.hi, y1)):
            cy = (y + 0.5) / SS
            for x in range(max(0, x0), min(self.hi, x1)):
                if predicate((x + 0.5) / SS, cy):
                    self._blend(x, y, color, 1.0)

    def downsample(self):
        """Box-filter the supersampled buffer down to the target size."""
        out = bytearray(self.size * self.size * 4)
        n = SS * SS
        for y in range(self.size):
            for x in range(self.size):
                acc = [0, 0, 0, 0]
                for sy in range(SS):
                    row = ((y * SS + sy) * self.hi + x * SS) * 4
                    for sx in range(SS):
                        i = row + sx * 4
                        acc[0] += self.buf[i]
                        acc[1] += self.buf[i + 1]
                        acc[2] += self.buf[i + 2]
                        acc[3] += self.buf[i + 3]
                o = (y * self.size + x) * 4
                for k in range(4):
                    out[o + k] = acc[k] // n
        return out


def write_png(path, size, pixels):
    raw = b"".join(
        b"\x00" + bytes(pixels[y * size * 4 : (y + 1) * size * 4])
        for y in range(size)
    )

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)


def draw_sigil(canvas, cx, cy, span, color):
    """The four primitives, laid out on a 2x2 grid centred on (cx, cy)."""
    tile = span / 2
    left, top = cx - span / 2, cy - span / 2

    def inside(px, py, r, ox, oy):
        return (px - ox) ** 2 + (py - oy) ** 2 <= r * r

    # Quarter circle: filled pie anchored at the tile's top-left corner.
    r = tile * 0.92
    canvas.fill_where(
        (left, top, left + tile, top + tile),
        lambda px, py: inside(px, py, r, left, top),
        color,
    )

    # Dot pair.
    dot = tile * 0.19
    for ox in (left + tile * 1.3, left + tile * 1.78):
        canvas.fill_where(
            (ox - dot, top + tile * 0.5 - dot, ox + dot, top + tile * 0.5 + dot),
            lambda px, py, ox=ox: inside(px, py, dot, ox, top + tile * 0.5),
            color,
        )

    # Dome sitting on the bottom edge of its tile.
    dome_r = tile * 0.46
    dome_cx, dome_cy = left + tile * 0.5, top + tile * 1.72
    canvas.fill_where(
        (dome_cx - dome_r, dome_cy - dome_r, dome_cx + dome_r, dome_cy + dome_r),
        lambda px, py: py <= dome_cy and inside(px, py, dome_r, dome_cx, dome_cy),
        color,
    )

    # Disc.
    disc_r = tile * 0.36
    disc_cx, disc_cy = left + tile * 1.5, top + tile * 1.5
    canvas.fill_where(
        (disc_cx - disc_r, disc_cy - disc_r, disc_cx + disc_r, disc_cy + disc_r),
        lambda px, py: inside(px, py, disc_r, disc_cx, disc_cy),
        color,
    )


def rounded_square(canvas, inset, radius, color):
    size = canvas.size
    x0, y0, x1, y1 = inset, inset, size - inset, size - inset

    def inside(px, py):
        cx = min(max(px, x0 + radius), x1 - radius)
        cy = min(max(py, y0 + radius), y1 - radius)
        if x0 <= px <= x1 and y0 <= py <= y1:
            if (px < x0 + radius or px > x1 - radius) and (
                py < y0 + radius or py > y1 - radius
            ):
                return (px - cx) ** 2 + (py - cy) ** 2 <= radius * radius
            return True
        return False

    canvas.fill_where((x0, y0, x1, y1), inside, color)


def render(path, size, *, background, mark, span_ratio):
    canvas = Canvas(size, background)
    if span_ratio > 0:
        draw_sigil(canvas, size / 2, size / 2, size * span_ratio, mark)
    write_png(path, size, canvas.downsample())
    print(f"{path.name}  {size}x{size}")


def main():
    ASSETS.mkdir(exist_ok=True)

    # Square icon: ink field, paper sigil.
    render(ASSETS / "icon.png", 512, background=(*INK, 255), mark=PAPER, span_ratio=0.52)

    # Adaptive foreground: transparent, with the mark inside the 66% safe
    # zone Android crops adaptive icons to.
    render(
        ASSETS / "android-icon-foreground.png",
        512,
        background=(0, 0, 0, 0),
        mark=PAPER,
        span_ratio=0.36,
    )

    # Monochrome layer for themed icons: same mark, solid black.
    render(
        ASSETS / "android-icon-monochrome.png",
        512,
        background=(0, 0, 0, 0),
        mark=(0, 0, 0),
        span_ratio=0.36,
    )

    # Adaptive background is a flat ink field.
    render(
        ASSETS / "android-icon-background.png",
        512,
        background=(*INK, 255),
        mark=INK,
        span_ratio=0.0,
    )

    render(
        ASSETS / "splash-icon.png",
        384,
        background=(0, 0, 0, 0),
        mark=INK,
        span_ratio=0.46,
    )

    render(ASSETS / "favicon.png", 64, background=(*INK, 255), mark=PAPER, span_ratio=0.56)




# --- Android mipmaps -------------------------------------------------------
# `android/` is committed (no prebuild in CI), so the launcher bitmaps have to
# be regenerated here or the old dot-matrix icon survives in the APK.

RES = ROOT / "android" / "app" / "src" / "main" / "res"
DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}


def box_downsample(pixels, size, target):
    """Average-pool an RGBA buffer from `size` down to `target`."""
    out = bytearray(target * target * 4)
    step = size / target
    for y in range(target):
        y0, y1 = int(y * step), max(int(y * step) + 1, int((y + 1) * step))
        for x in range(target):
            x0, x1 = int(x * step), max(int(x * step) + 1, int((x + 1) * step))
            acc = [0, 0, 0, 0]
            n = 0
            for sy in range(y0, min(y1, size)):
                for sx in range(x0, min(x1, size)):
                    i = (sy * size + sx) * 4
                    for k in range(4):
                        acc[k] += pixels[i + k]
                    n += 1
            o = (y * target + x) * 4
            for k in range(4):
                out[o + k] = acc[k] // max(n, 1)
    return out


def mipmaps():
    masters = {}

    square = Canvas(432, (*INK, 255))
    draw_sigil(square, 216, 216, 432 * 0.52, PAPER)
    masters["ic_launcher"] = square.downsample()

    round_icon = Canvas(432, (0, 0, 0, 0))
    round_icon.fill_where(
        (0, 0, 432, 432),
        lambda px, py: (px - 216) ** 2 + (py - 216) ** 2 <= 216 * 216,
        INK,
    )
    draw_sigil(round_icon, 216, 216, 432 * 0.46, PAPER)
    masters["ic_launcher_round"] = round_icon.downsample()

    fg = Canvas(432, (0, 0, 0, 0))
    draw_sigil(fg, 216, 216, 432 * 0.36, PAPER)
    masters["ic_launcher_foreground"] = fg.downsample()

    mono = Canvas(432, (0, 0, 0, 0))
    draw_sigil(mono, 216, 216, 432 * 0.36, (0, 0, 0))
    masters["ic_launcher_monochrome"] = mono.downsample()

    # Adaptive layers are authored on a 108dp canvas; legacy icons on 48dp.
    base = {
        "ic_launcher": 48,
        "ic_launcher_round": 48,
        "ic_launcher_foreground": 108,
        "ic_launcher_monochrome": 108,
    }

    for density, scale in DENSITIES.items():
        folder = RES / f"mipmap-{density}"
        folder.mkdir(parents=True, exist_ok=True)
        for name, master in masters.items():
            target = int(base[name] * scale)
            write_png(folder / f"{name}.png", target, box_downsample(master, 432, target))
            stale = folder / f"{name}.webp"
            if stale.exists():
                stale.unlink()
        print(f"mipmap-{density} written")

    # The splash logo is the ink sigil on transparent.
    splash = Canvas(432, (0, 0, 0, 0))
    draw_sigil(splash, 216, 216, 432 * 0.5, INK)
    master = splash.downsample()
    for density, scale in DENSITIES.items():
        if density == "mdpi":
            continue
        folder = RES / f"drawable-{density}"
        if not folder.exists():
            continue
        target = int(100 * scale)
        write_png(folder / "splashscreen_logo.png", target, box_downsample(master, 432, target))
    print("splash logos written")


if __name__ == "__main__":
    main()
    mipmaps()
