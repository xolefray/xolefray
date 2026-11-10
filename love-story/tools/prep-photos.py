#!/usr/bin/env python3
"""prep-photos.py — make the three private photo files the film loads from love-story/photos/.

    python3 tools/prep-photos.py --cover IMG_6193.HEIC --proposal proposal.jpg --dog dog.jpg

  cover.jpg     the print INSIDE the black frame of the original (a photo of a framed print, shot at
                an angle): cut out, perspective-rectified to an upright 4:5 rectangle, the haze of
                the glass lifted a little, 1200 px on the long side.
  proposal.jpg  auto-oriented, at most 1600 px on the long side (both people kept whole).
  dog.jpg       auto-oriented, modest crop around the dog (ears and crossed paws kept), <= 1600 px.

Only the inputs given are processed. Outputs are plain upright sRGB JPEGs without metadata.

PRIVATE: the outputs are git-ignored (love-story/.gitignore and photos/.gitignore). Never commit
them and never write them anywhere else inside the repository. See photos/README.md.

Needs: pillow, pillow-heif (for .HEIC input), numpy.
"""

import argparse
import os
import sys

import numpy as np
from PIL import Image, ImageOps

try:  # HEIC support is optional: only needed when an input is .heic
    import pillow_heif

    pillow_heif.register_heif_opener()
except Exception:  # pragma: no cover
    pillow_heif = None

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_OUT = os.path.normpath(os.path.join(HERE, "..", "photos"))

# The four inner corners of the print in the cover original, as fractions of the (upright) image
# width / height, in the order top-left, top-right, bottom-right, bottom-left. Picked by eye on the
# 3024 x 4032 original (IMG_6193); override with --cover-quad for another shot.
COVER_QUAD = (
    (0.1455, 0.0935),  # top-left
    (0.8195, 0.1418),  # top-right
    (0.7975, 0.7305),  # bottom-right
    (0.1790, 0.7840),  # bottom-left
)
COVER_ASPECT = 4 / 5  # width : height of the print's visible opening (an 8 x 10 in frame)
COVER_LONG = 1200
COVER_INSET = 0.012  # trim this fraction per side after rectifying: frame lip and its shadow
MAX_LONG = 1600
QUALITY = 88

# Crops as fractions (left, top, right, bottom) of the upright original; None = keep everything.
PROPOSAL_CROP = None  # both people already fill the frame edge to edge
DOG_CROP = (0.05, 0.015, 0.91, 0.935)  # trims the blanket corner and spare bedding; ears + crossed paws stay in


def load(path):
    """Open an image upright (EXIF orientation applied) as RGB."""
    if path.lower().endswith((".heic", ".heif")) and pillow_heif is None:
        sys.exit("pillow-heif is required to read " + path)
    im = Image.open(path)
    im = ImageOps.exif_transpose(im)
    return im.convert("RGB")


def perspective_coeffs(dst, src):
    """Coefficients for Image.transform(PERSPECTIVE) mapping output points `dst` to input `src`."""
    a, b = [], []
    for (x, y), (u, v) in zip(dst, src):
        a.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        a.append([0, 0, 0, x, y, 1, -v * x, -v * y])
        b += [u, v]
    return np.linalg.solve(np.array(a, dtype=np.float64), np.array(b, dtype=np.float64)).tolist()


def rectify(im, quad, aspect, long_side):
    """Warp the quadrilateral `quad` (TL, TR, BR, BL in pixels) to an upright rectangle."""
    h = long_side if aspect <= 1 else round(long_side / aspect)
    w = round(h * aspect)
    # render at 2x then downsample: cleaner than one bicubic pass on a strong minification
    ss = 2
    dst = [(0, 0), (w * ss, 0), (w * ss, h * ss), (0, h * ss)]
    co = perspective_coeffs(dst, quad)
    big = im.transform((w * ss, h * ss), Image.PERSPECTIVE, co, resample=Image.BICUBIC)
    return big.resize((w, h), Image.LANCZOS)


def lift_haze(im, lo_pct=0.6, hi_pct=99.6, strength=0.75, wb=0.35):
    """Mild clean-up for a print photographed through glass.

    The glass adds a veil of reflected room light (raised blacks, flat contrast) and the room light
    tints the paper. Stretch the luminance range part of the way to full (`strength`), and pull the
    brightest neutral areas part of the way to white (`wb`). Deliberately gentle: no local edits.
    """
    a = np.asarray(im).astype(np.float32) / 255.0
    lum = a @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    lo, hi = np.percentile(lum, [lo_pct, hi_pct])
    lo *= strength
    hi = 1.0 - (1.0 - hi) * strength
    a = (a - lo) / max(1e-3, hi - lo)
    # white balance from the brightest 3 % (the dress, the surf): partial correction only
    lum = a @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    bright = a[lum >= np.percentile(lum, 97.0)]
    if len(bright):
        mean = bright.mean(axis=0)
        gain = mean.mean() / np.maximum(mean, 1e-3)
        a *= 1.0 + (gain - 1.0) * wb
    a = np.clip(a, 0.0, 1.0)
    return Image.fromarray((a * 255.0 + 0.5).astype(np.uint8), "RGB")


def crop_frac(im, box):
    if not box:
        return im
    w, h = im.size
    l, t, r, b = box
    return im.crop((round(l * w), round(t * h), round(r * w), round(b * h)))


def fit(im, long_side):
    w, h = im.size
    k = long_side / max(w, h)
    if k >= 1:
        return im
    return im.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)


def save(im, out_dir, name):
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, name)
    im.save(path, "JPEG", quality=QUALITY, optimize=True, progressive=True, subsampling=1)  # no EXIF
    print(f"{name}: {im.size[0]} x {im.size[1]} px, {os.path.getsize(path) / 1024:.0f} kB")
    return path


def parse_quad(text):
    v = [float(s) for s in text.replace(";", ",").split(",")]
    if len(v) != 8:
        raise argparse.ArgumentTypeError("need 8 numbers: x,y for TL, TR, BR, BL (fractions 0..1 or pixels)")
    return tuple((v[i], v[i + 1]) for i in range(0, 8, 2))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cover", help="photo of the framed print (HEIC or JPEG)")
    ap.add_argument("--proposal", help="the proposal photo")
    ap.add_argument("--dog", help="the photo of the dog")
    ap.add_argument("--out", default=DEFAULT_OUT, help="output folder (default: love-story/photos)")
    ap.add_argument("--cover-quad", type=parse_quad, default=None,
                    help="corners of the print: x,y of TL,TR,BR,BL as fractions (0..1) or pixels")
    ap.add_argument("--cover-flat", action="store_true", help="cover input is already a flat image: no rectifying")
    ap.add_argument("--no-cleanup", action="store_true", help="skip the glare / white-balance clean-up of the cover")
    args = ap.parse_args()

    if not (args.cover or args.proposal or args.dog):
        ap.error("nothing to do: pass --cover, --proposal and/or --dog")

    if args.cover:
        im = load(args.cover)
        if args.cover_flat:
            out = fit(im, COVER_LONG)
        else:
            w, h = im.size
            quad = args.cover_quad or COVER_QUAD
            if max(max(p) for p in quad) <= 1.5:  # fractions -> pixels
                quad = [(x * w, y * h) for x, y in quad]
            out = rectify(im, quad, COVER_ASPECT, round(COVER_LONG / (1 - 2 * COVER_INSET)))
            ow, oh = out.size
            out = out.crop((round(ow * COVER_INSET), round(oh * COVER_INSET),
                            round(ow * (1 - COVER_INSET)), round(oh * (1 - COVER_INSET))))
            out = fit(out, COVER_LONG)
        if not args.no_cleanup:
            out = lift_haze(out)
        save(out, args.out, "cover.jpg")

    if args.proposal:
        save(fit(crop_frac(load(args.proposal), PROPOSAL_CROP), MAX_LONG), args.out, "proposal.jpg")

    if args.dog:
        save(fit(crop_frac(load(args.dog), DOG_CROP), MAX_LONG), args.out, "dog.jpg")


if __name__ == "__main__":
    main()
