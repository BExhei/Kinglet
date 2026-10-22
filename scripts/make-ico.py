"""Build a multi-size Windows .ico with UNCOMPRESSED BMP (DIB) images.

Size order matters: tauri-codegen (windows) takes `IconDir::entries()[0]` as the
app's default WINDOW icon, and Windows then upscales that single bitmap for the
taskbar / Alt+Tab. Largest first, so the window icon is 256x256 instead of a
blurry upscaled 16x16. Windows itself picks the right frame by size for the
Explorer / file-association icon, so the order does not hurt there.

Why not Pillow / `npx tauri icon`:
  * Pillow's ICO writer silently drops sizes and stores 256px as PNG.
  * `npx tauri icon` emits PNG-compressed images inside the .ico, which
    makensis (NSIS) refuses, so the installer keeps its default icon.
  * A hand-rolled BMP writer must emit rows BOTTOM-UP. Getting that wrong
    ships an upside-down icon that looks "replaced but broken".

Usage:
    python scripts/make-ico.py <source.png> <out.ico> [sizes]
    e.g. python scripts/make-ico.py src-tauri/icons/icon.png src-tauri/icons/icon.ico

Always verifies the written file by decoding it again and comparing every
image to the source; also checks the vertically-flipped variant scores WORSE,
so a row-order regression can never pass silently.
"""
import io
import struct
import sys

import numpy as np
from PIL import Image

# 最大在前：见文件头注释（窗口图标取 entries[0]）
DEFAULT_SIZES = [256, 128, 64, 48, 32, 24, 16]


def dib_for(img: Image.Image) -> bytes:
    """32bpp BGRA DIB + 1bpp AND mask, both bottom-up, as ICO expects."""
    w, h = img.size
    a = np.asarray(img.convert("RGBA"), dtype=np.uint8)  # top-down RGBA
    a = a[::-1]  # -> bottom-up  (THE line that matters)

    bgra = a[:, :, [2, 1, 0, 3]].tobytes()

    # AND mask: 1 = transparent. Row stride padded to 4 bytes.
    alpha = a[:, :, 3]
    stride = ((w + 31) // 32) * 4
    mask = bytearray()
    for row in alpha:
        bits = bytearray(stride)
        for x in range(w):
            if row[x] == 0:
                bits[x >> 3] |= 0x80 >> (x & 7)
        mask += bits

    header = struct.pack(
        "<IiiHHIIiiII",
        40,          # biSize
        w,           # biWidth
        h * 2,       # biHeight  (XOR + AND stacked)
        1,           # biPlanes
        32,          # biBitCount
        0,           # biCompression = BI_RGB
        len(bgra) + len(mask),
        0, 0, 0, 0,
    )
    return header + bgra + bytes(mask)


def build(src_path: str, out_path: str, sizes=None) -> None:
    sizes = sizes or DEFAULT_SIZES
    src = Image.open(src_path).convert("RGBA")
    if src.size[0] != src.size[1]:
        raise SystemExit("source must be square, got %sx%s" % src.size)

    blobs = []
    for s in sizes:
        img = src.resize((s, s), Image.LANCZOS)
        blobs.append((s, dib_for(img)))

    offset = 6 + 16 * len(blobs)
    dirents, payload = b"", b""
    for s, blob in blobs:
        dirents += struct.pack(
            "<BBBBHHII",
            0 if s == 256 else s,
            0 if s == 256 else s,
            0, 0, 1, 32, len(blob), offset,
        )
        offset += len(blob)
        payload += blob

    data = struct.pack("<HHH", 0, 1, len(blobs)) + dirents + payload
    with open(out_path, "wb") as f:
        f.write(data)
    print("wrote %s  (%d images, %d bytes)" % (out_path, len(blobs), len(data)))
    verify(src, out_path, sizes)


def _mad(a: Image.Image, b: Image.Image) -> float:
    return float(np.abs(np.asarray(a, dtype=int) - np.asarray(b, dtype=int)).mean())


def verify(src: Image.Image, ico_path: str, sizes) -> None:
    ico = Image.open(ico_path)
    got = set(ico.ico.sizes())
    missing = [s for s in sizes if (s, s) not in got]
    if missing:
        raise SystemExit("FAIL missing sizes in written ico: %s" % missing)

    bad = []
    for s in sizes:
        frame = ico.ico.getimage((s, s)).convert("RGBA")
        ref = src.resize((s, s), Image.LANCZOS)
        d_ok = _mad(frame, ref)
        d_flip = _mad(frame, ref.transpose(Image.FLIP_TOP_BOTTOM))
        status = "ok" if (d_ok < 3.0 and d_ok < d_flip) else "FAIL"
        if status == "FAIL":
            bad.append(s)
        print("   %3dpx  diff=%6.2f  flipped-diff=%6.2f  %s" % (s, d_ok, d_flip, status))

    with open(ico_path, "rb") as f:
        raw = f.read()
    cnt = struct.unpack_from("<H", raw, 4)[0]
    for i in range(cnt):
        off = struct.unpack_from("<I", raw, 6 + 16 * i + 12)[0]
        if raw[off:off + 4] == b"\x89PNG":
            bad.append("png-compressed image #%d" % i)

    # 窗口图标 = entries[0]（tauri-codegen 只取第一条），必须放最大帧，否则
    # Windows 会把小图放大到 48px 显示在任务栏，看起来是糊的
    first_w = raw[6] or 256
    if first_w != max(sizes):
        bad.append("entries[0] is %dpx, must be the largest (%dpx)" % (first_w, max(sizes)))

    if bad:
        raise SystemExit("FAIL verification: %s" % bad)
    print("   verified: all images upright, BMP-encoded, correct sizes")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    extra = [int(x) for x in sys.argv[3:]] or None
    build(sys.argv[1], sys.argv[2], extra)
