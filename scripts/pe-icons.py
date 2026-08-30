"""List RT_ICON / RT_GROUP_ICON resources in a Windows PE file.

Usage: python scripts/pe-icons.py <exe> [<exe> ...]
       python scripts/pe-icons.py --extract <exe> <group-id> <out.ico>

Why: Tauri embeds the app icon as PE icon resources. The .md file-association
icon is `<exe>,0`, i.e. the FIRST icon group by resource-id order. This script
proves which image Windows will actually show without touching the icon cache.
"""
import struct
import sys


def _read(path):
    with open(path, "rb") as f:
        return f.read()


def parse(path):
    d = _read(path)
    e = struct.unpack_from("<I", d, 0x3C)[0]
    if d[e:e + 4] != b"PE\0\0":
        raise ValueError("not a PE file")
    coff = e + 4
    nsec = struct.unpack_from("<H", d, coff + 2)[0]
    optsz = struct.unpack_from("<H", d, coff + 16)[0]
    magic = struct.unpack_from("<H", d, coff + 20)[0]
    ddoff = coff + 20 + (112 if magic == 0x20B else 96)
    rva, _size = struct.unpack_from("<II", d, ddoff + 2 * 8)

    secs = []
    so = coff + 20 + optsz
    for i in range(nsec):
        o = so + 40 * i
        vs, va, rs, pr = struct.unpack_from("<IIII", d, o + 8)
        secs.append((va, vs, rs, pr))

    def r2o(r):
        for va, vs, rs, pr in secs:
            if va <= r < va + max(vs, rs):
                return pr + (r - va)
        return None

    base = r2o(rva)
    MASK = 0x7FFFFFFF

    def entries(off):
        nn, ni = struct.unpack_from("<HH", d, off + 12)
        out = []
        for i in range(nn + ni):
            eo = off + 16 + 8 * i
            nid, doff = struct.unpack_from("<II", d, eo)
            out.append((nid, doff))
        return out

    found = []
    for tid, toff in entries(base):
        t = tid & MASK
        if t not in (3, 14):
            continue
        for nid, noff in entries(base + (toff & MASK)):
            for _lid, loff in entries(base + (noff & MASK)):
                do = base + (loff & MASK)
                dr, dsz = struct.unpack_from("<II", d, do)
                found.append((t, nid & MASK, dsz, r2o(dr)))
    return d, found


def show(path):
    d, found = parse(path)
    groups = sorted([x for x in found if x[0] == 14], key=lambda x: x[1])
    icons = {x[1]: x for x in found if x[0] == 3}
    print("==", path)
    print("   RT_ICON images:", len(icons), "| RT_GROUP_ICON ids:", [g[1] for g in groups])
    for _t, gid, _sz, off in groups:
        cnt = struct.unpack_from("<H", d, off + 4)[0]
        info = []
        for i in range(cnt):
            o = off + 6 + 14 * i
            w, h, _cc, _r, _pl, bc, sz, iid = struct.unpack_from("<BBBBHHIH", d, o)
            kind = "?"
            if iid in icons:
                io = icons[iid][3]
                kind = "PNG" if d[io:io + 4] == b"\x89PNG" else "BMP"
            info.append("%dx%d(id%d,%s,%db)" % (w or 256, h or 256, iid, kind, sz))
        print("   group %d -> %d images: %s" % (gid, cnt, " ".join(info)))
    return d, groups, icons


def extract(path, gid, out):
    d, found = parse(path)
    groups = {x[1]: x for x in found if x[0] == 14}
    icons = {x[1]: x for x in found if x[0] == 3}
    _t, _g, _sz, off = groups[gid]
    cnt = struct.unpack_from("<H", d, off + 4)[0]
    dirs, blobs = [], []
    data_off = 6 + 16 * cnt
    for i in range(cnt):
        o = off + 6 + 14 * i
        w, h, cc, r, pl, bc, sz, iid = struct.unpack_from("<BBBBHHIH", d, o)
        io = icons[iid][3]
        blob = d[io:io + sz]
        dirs.append(struct.pack("<BBBBHHII", w, h, cc, r, pl, bc, len(blob), data_off))
        data_off += len(blob)
        blobs.append(blob)
    with open(out, "wb") as f:
        f.write(struct.pack("<HHH", 0, 1, cnt))
        for x in dirs:
            f.write(x)
        for b in blobs:
            f.write(b)
    print("wrote", out)


if __name__ == "__main__":
    args = sys.argv[1:]
    if args and args[0] == "--extract":
        extract(args[1], int(args[2]), args[3])
    else:
        for p in args:
            try:
                show(p)
            except Exception as ex:  # noqa: BLE001
                print("==", p, "ERROR:", ex)
