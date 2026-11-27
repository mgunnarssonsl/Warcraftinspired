"""Building parts for the painted style: stone block walls, shingled roofs, timber framing,
windows, doors, banners, props. One Blender unit = one tile; models face -Y."""
import math
import random
from blib import mat, sphere, box, lathe, tube, extrude, torus, sheet, lump, curve_tube, pivot

STONE = ['#c9bea8', '#b8ad98', '#d6ccb6', '#a99e8a']
MORTAR = '#8f8472'
PLASTER = '#efe2c4'
TIMBER = '#7a4e2a'
TIMBER_L = '#9a6a3c'
GOLD = '#f0bd4c'
IRON = '#5e646c'
GLASS = '#ffc25a'
DARK = '#2a1e14'
GRASS = ['#94c252', '#7fb243', '#a8d060']


class Rng:
    def __init__(self, seed):
        self.r = random.Random(seed)

    def __call__(self, a=0.0, b=1.0):
        return self.r.uniform(a, b)

    def pick(self, xs):
        return self.r.choice(xs)


def ground_skirt(P, w, d, seed=1, n=None):
    """Grass tufts and pebbles round a footing, so the building sits in the terrain."""
    r = Rng(seed)
    n = n or int((w + d) * 5)
    for i in range(n):
        a = 2 * math.pi * i / n + r(-0.1, 0.1)
        x = math.cos(a) * (w / 2 + r(-0.12, 0.06))
        y = math.sin(a) * (d / 2 + r(-0.12, 0.06))
        if r() < 0.75:
            lump(f'tuft{i}', r(0.09, 0.15), mat('matte', r.pick(GRASS)), P, at=(x, y, 0.01), scale=(1.4, 1.4, 0.45), seed=i, rough=0.3, segs=8, rings=6, sub=0)
        else:
            lump(f'pebble{i}', r(0.05, 0.1), mat('matte', r.pick(STONE)), P, at=(x, y, 0.03), seed=i + 100, rough=0.25, segs=8, rings=6, sub=0)


def stone_wall(name, P, w, h, d, at, seed=1, block=(0.3, 0.17), colors=STONE, faces='nsew', inset=0.02):
    """A wall of staggered, bevelled stone blocks over a mortar core."""
    r = Rng(seed)
    x0, y0, z0 = at
    box(f'{name}Core', (w - inset * 2, d - inset * 2, h), mat('matte', MORTAR), P, at=(x0, y0, z0 + h / 2))
    rows = max(1, round(h / block[1]))
    bh = h / rows
    def face(axis_len, normal, fixed, horizontal):
        for j in range(rows):
            off = 0.5 if j % 2 else 0.0
            n = max(1, round(axis_len / block[0]))
            bw = axis_len / n
            for i in range(-1, n + 1):
                t = (i + off) * bw - axis_len / 2 + bw / 2
                if t - bw / 2 < -axis_len / 2 - 1e-6:
                    lo = -axis_len / 2
                    hi = t + bw / 2
                elif t + bw / 2 > axis_len / 2 + 1e-6:
                    lo = t - bw / 2
                    hi = axis_len / 2
                else:
                    lo, hi = t - bw / 2, t + bw / 2
                if hi - lo < 0.03:
                    continue
                c = (lo + hi) / 2
                sz = (hi - lo - 0.012, 0.03, bh - 0.012) if horizontal else (0.03, hi - lo - 0.012, bh - 0.012)
                z = z0 + j * bh + bh / 2
                if horizontal:
                    pos = (x0 + c, fixed, z)
                else:
                    pos = (fixed, y0 + c, z)
                box(f'{name}B{normal}{j}_{i}', sz, mat('matte', r.pick(colors)), P, at=pos, bevel=0.008, bevel_segs=1)
    if 'n' in faces:
        face(w, 'n', y0 - d / 2 + 0.01, True)
    if 's' in faces:
        face(w, 's', y0 + d / 2 - 0.01, True)
    if 'w' in faces:
        face(d, 'w', x0 - w / 2 + 0.01, False)
    if 'e' in faces:
        face(d, 'e', x0 + w / 2 - 0.01, False)


def round_tower(name, P, r, h, at, seed=1, colors=STONE):
    """A round tower of stone courses."""
    rr = Rng(seed)
    x0, y0, z0 = at
    lathe(f'{name}Core', [(0.0, 0.0), (r * 0.97, 0.0), (r * 0.97, h), (0.0, h)], mat('matte', MORTAR), P, at=(x0, y0, z0), segs=16)
    rows = max(1, round(h / 0.17))
    bh = h / rows
    n = max(6, round(2 * math.pi * r / 0.3))
    for j in range(rows):
        off = 0.5 if j % 2 else 0
        for i in range(n):
            a = 2 * math.pi * (i + off) / n
            box(f'{name}S{j}_{i}', (2 * math.pi * r / n - 0.014, 0.04, bh - 0.012), mat('matte', rr.pick(colors)), P,
                at=(x0 + math.cos(a) * r, y0 + math.sin(a) * r, z0 + j * bh + bh / 2), rot=(0, 0, a + math.pi / 2), bevel=0.007, bevel_segs=1)


def crenels(name, P, w, d, z, at=(0, 0), color=STONE[0], round_r=None):
    if round_r:
        n = max(6, round(2 * math.pi * round_r / 0.22))
        for i in range(0, n, 2):
            a = 2 * math.pi * i / n
            box(f'{name}{i}', (0.14, 0.12, 0.14), mat('matte', color), P, at=(at[0] + math.cos(a) * round_r, at[1] + math.sin(a) * round_r, z + 0.07), rot=(0, 0, a + math.pi / 2), bevel=0.012)
        torus(f'{name}Lip', round_r, 0.035, mat('matte', STONE[1]), P, at=(at[0], at[1], z - 0.005), segs=24, rsegs=4)
        return
    for axis, length in (('x', w), ('y', d)):
        n = max(2, round(length / 0.26))
        for i in range(0, n + 1, 2):
            t = -length / 2 + i * length / n
            for sgn in (-1, 1):
                pos = (at[0] + t, at[1] + sgn * d / 2, z + 0.07) if axis == 'x' else (at[0] + sgn * w / 2, at[1] + t, z + 0.07)
                box(f'{name}{axis}{i}{sgn}', (0.14, 0.14, 0.14), mat('matte', color), P, at=pos, bevel=0.012)
    box(f'{name}Ledge', (w + 0.08, d + 0.08, 0.05), mat('matte', STONE[1]), P, at=(at[0], at[1], z - 0.01), bevel=0.01)


def gable_roof(name, P, w, d, h, at, color='team', seed=1, overhang=0.12, ridge=GOLD):
    """A gabled roof, ridge along X: rows of overlapping shingles in shades of the team colour."""
    r = Rng(seed)
    x0, y0, z0 = at
    dd = d / 2 + overhang
    ww = w + overhang * 2
    slope = math.atan2(h, dd)
    ln = math.hypot(h, dd)
    under = mat('team_dark') if color == 'team' else mat('matte', color)
    extrude(f'{name}Gable', [(-dd, 0), (dd, 0), (0, h)], ww - 0.04, under, P, at=(x0, y0, z0), rot=(0, 0, math.pi / 2))
    extrude(f'{name}GableEnd', [(-dd * 0.92, 0.02), (dd * 0.92, 0.02), (0, h * 0.92)], ww - 0.02, mat('matte', TIMBER), P, at=(x0, y0, z0), rot=(0, 0, math.pi / 2))
    shades = ['team', 'team', 'team', 'team_dark', 'team_light'] if color == 'team' else [color]
    rows = max(3, round(ln / 0.13))
    for side in (-1, 1):
        for j in range(rows):
            t = (j + 0.5) / rows
            yy = y0 + side * dd * t
            zz = z0 + h * (1 - t) + 0.02
            per = max(3, round(ww / 0.16))
            off = 0.5 if j % 2 else 0.0
            for i in range(per):
                x = x0 - ww / 2 + (i + off + 0.5) * ww / per
                if x > x0 + ww / 2:
                    continue
                m = mat(r.pick(shades)) if color == 'team' else mat('matte', color)
                box(f'{name}T{side}{j}_{i}', (ww / per - 0.01, ln / rows * 1.8, 0.028), m, P,
                    at=(x, yy, zz), rot=(-side * slope + r(-0.03, 0.03), r(-0.02, 0.02), 0), bevel=0.006, bevel_segs=1)
    box(f'{name}Ridge', (ww + 0.06, 0.09, 0.08), mat('gold', ridge), P, at=(x0, y0, z0 + h + 0.02), bevel=0.02)
    for sgn in (-1, 1):
        sphere(f'{name}Finial{sgn}', 0.045, mat('gold', ridge), P, at=(x0 + sgn * (ww / 2 + 0.03), y0, z0 + h + 0.07))


def cone_roof(name, P, r, h, at, color='team', seed=1, finial=True, flare=1.12):
    """A conical roof of shingle rings, a gold band and finial."""
    rr = Rng(seed)
    x0, y0, z0 = at
    lathe(f'{name}Core', [(r * flare, 0.0), (r * 0.6 * flare, h * 0.4), (0.0, h)], mat('team_dark') if color == 'team' else mat('matte', color), P, at=at, segs=20)
    shades = ['team', 'team_dark', 'team_light'] if color == 'team' else [color]
    rows = max(3, round(h / 0.14))
    # The core's surface radius at height t (0-1): two straight stretches.
    def surf(t):
        return r * flare * (1 - t / 0.4 * 0.4) if t < 0.4 else r * 0.6 * flare * (1 - (t - 0.4) / 0.6)
    for j in range(rows - 1):
        t = (j + 0.5) / rows
        rad = surf(t) + 0.012
        n = max(5, round(2 * math.pi * rad / 0.13))
        z = z0 + h * t
        slope = math.atan2(surf(max(0.0, t - 0.05)) - surf(min(1.0, t + 0.05)), h * 0.1)
        for i in range(n):
            a = 2 * math.pi * (i + (0.5 if j % 2 else 0)) / n
            m = mat(rr.pick(shades)) if color == 'team' else mat('matte', color)
            # Tangent to the ring, tilted out by the slope; long enough to overlap the row below.
            box(f'{name}T{j}_{i}', (2 * math.pi * rad / n * 1.05, 0.028, h / rows * 1.9), m, P,
                at=(x0 + math.cos(a) * rad, y0 + math.sin(a) * rad, z), rot=(-slope, 0, a + math.pi / 2), bevel=0.005, bevel_segs=1)
    torus(f'{name}Band', r * flare, 0.03, mat('gold', GOLD), P, at=(x0, y0, z0 + 0.02), segs=24, rsegs=4)
    if finial:
        tube(f'{name}Spike', 0.02, 0.02, 0.28, mat('gold', GOLD), P, at=(x0, y0, z0 + h - 0.02), segs=6)
        sphere(f'{name}Ball', 0.05, mat('gold', GOLD), P, at=(x0, y0, z0 + h + 0.12))


def window(name, P, at, w=0.16, h=0.24, rot_z=0.0, lit=True, frame=TIMBER, arch=True, shutters=False):
    """A recessed window on a wall facing -Y (turned by rot_z): frame, glow, mullion."""
    x0, y0, z0 = at
    c, s = math.cos(rot_z), math.sin(rot_z)
    def off(dx, dy):
        return (x0 + dx * c - dy * s, y0 + dx * s + dy * c, z0)
    pts = [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2 - w / 2 * (0.6 if arch else 0)), (0, h / 2), (-w / 2, h / 2 - w / 2 * (0.6 if arch else 0))]
    big = [(x * 1.35, z * 1.22) for x, z in pts]
    extrude(f'{name}Frame', big, 0.04, mat('matte', frame), P, at=off(0, -0.01), rot=(0, 0, rot_z), bevel=0.006)
    extrude(f'{name}Pane', pts, 0.045, mat('glow' if lit else 'matte', GLASS if lit else DARK), P, at=off(0, -0.015), rot=(0, 0, rot_z))
    box(f'{name}Mullion', (0.015, 0.05, h), mat('matte', frame), P, at=off(0, -0.03), rot=(0, 0, rot_z))
    box(f'{name}Transom', (w, 0.05, 0.015), mat('matte', frame), P, at=off(0, -0.03), rot=(0, 0, rot_z))
    box(f'{name}Sill', (w * 1.5, 0.07, 0.03), mat('matte', STONE[2]), P, at=(off(0, -0.03)[0], off(0, -0.03)[1], z0 - h * 0.62), rot=(0, 0, rot_z), bevel=0.008)
    if shutters:
        for sgn in (-1, 1):
            box(f'{name}Shutter{sgn}', (w * 0.55, 0.025, h * 1.05), mat('matte', '#3a6a9a' if False else TIMBER_L), P, at=off(sgn * w * 0.95, -0.03), rot=(0, 0, rot_z + sgn * 0.25), bevel=0.005)


def door(name, P, at, w=0.45, h=0.65, frame=STONE[2], wood='#6a4226', rot_z=0.0):
    """An arched plank door with iron bands and a stone surround, facing -Y."""
    x0, y0, z0 = at
    c, s = math.cos(rot_z), math.sin(rot_z)
    def off(dx, dy, dz=0.0):
        return (x0 + dx * c - dy * s, y0 + dx * s + dy * c, z0 + dz)
    def arch(ww, hh):
        pts = [(-ww / 2, 0)]
        for i in range(9):
            a = math.pi - math.pi * i / 8
            pts.append((math.cos(a) * ww / 2, hh - ww / 2 + math.sin(a) * ww / 2))
        pts.append((ww / 2, 0))
        return pts
    extrude(f'{name}Surround', arch(w + 0.14, h + 0.08), 0.06, mat('matte', frame), P, at=off(0, 0.0), rot=(0, 0, rot_z), bevel=0.012)
    extrude(f'{name}Leaf', arch(w, h), 0.07, mat('matte', wood), P, at=off(0, -0.01), rot=(0, 0, rot_z), bevel=0.004)
    for i in range(1, 5):
        box(f'{name}Plank{i}', (0.008, 0.08, h * 0.9), mat('matte', '#4a2e1a'), P, at=off(-w / 2 + i * w / 5, -0.04, h * 0.45), rot=(0, 0, rot_z))
    for zz in (0.18, 0.48):
        box(f'{name}Band{zz}', (w * 0.96, 0.085, 0.03), mat('metal', IRON), P, at=off(0, -0.04, h * zz), rot=(0, 0, rot_z), bevel=0.006)
    torus(f'{name}Ring', 0.03, 0.007, mat('metal', IRON), P, at=off(w * 0.25, -0.055, h * 0.42), rot=(math.pi / 2, 0, rot_z), segs=10, rsegs=3)


def timber_frame(name, P, w, h, at, rot_z=0.0):
    """Exposed timbers on a plaster wall facing -Y."""
    x0, y0, z0 = at
    c, s = math.cos(rot_z), math.sin(rot_z)
    def off(dx, dz):
        return (x0 + dx * c, y0 + dx * s, z0 + dz)
    m = mat('matte', TIMBER)
    for dx in (-w / 2, -w / 6, w / 6, w / 2):
        box(f'{name}Post{dx:.2f}', (0.06, 0.05, h), m, P, at=off(dx, h / 2), rot=(0, 0, rot_z), bevel=0.008)
    for dz in (0.03, h / 2, h - 0.03):
        box(f'{name}Rail{dz:.2f}', (w + 0.06, 0.05, 0.06), m, P, at=off(0, dz), rot=(0, 0, rot_z), bevel=0.008)
    for sgn, cx in ((1, -w / 3), (-1, w / 3)):
        box(f'{name}Brace{cx:.2f}', (0.05, 0.045, h * 0.55), m, P, at=off(cx, h * 0.25), rot=(0, sgn * 0.55, rot_z), bevel=0.006)


def crown_outline(w, h):
    return [(-w / 2, 0), (w / 2, 0), (w / 2, h * 0.55), (w * 0.34, h * 0.35), (w * 0.22, h), (w * 0.1, h * 0.45),
            (0, h * 1.05), (-w * 0.1, h * 0.45), (-w * 0.22, h), (-w * 0.34, h * 0.35), (-w / 2, h * 0.55)]


def banner(name, P, at, w=0.3, h=0.55, rot_z=0.0, emblem='crown'):
    """A hanging team banner with a gold rod, a gold crown and a pointed hem, facing -Y."""
    x0, y0, z0 = at
    c, s = math.cos(rot_z), math.sin(rot_z)
    def off(dy):
        return (x0 - dy * s, y0 + dy * c, z0)
    tube(f'{name}Rod', 0.014, 0.014, w + 0.1, mat('gold', GOLD), P, at=(off(-0.02)[0] - (w / 2 + 0.05) * c, off(-0.02)[1] - (w / 2 + 0.05) * s, z0), rot=(0, math.pi / 2, rot_z), segs=6, caps=True)
    pts = [(-w / 2, 0), (w / 2, 0), (w / 2, -h), (0, -h - w * 0.35), (-w / 2, -h)]
    extrude(f'{name}Cloth', pts, 0.02, mat('team'), P, at=off(-0.03), rot=(0, 0, rot_z), bevel=0.004)
    extrude(f'{name}Border', [(-w / 2 - 0.012, 0.0), (w / 2 + 0.012, 0.0), (w / 2 + 0.012, -0.03), (-w / 2 - 0.012, -0.03)], 0.025, mat('gold', GOLD), P, at=off(-0.035), rot=(0, 0, rot_z))
    if emblem == 'crown':
        extrude(f'{name}Crown', crown_outline(w * 0.5, w * 0.36), 0.025, mat('gold', GOLD), P, at=(off(-0.045)[0], off(-0.045)[1], z0 - h * 0.55), rot=(0, 0, rot_z), bevel=0.003)


def flag_pole(name, P, at, h=0.6):
    x0, y0, z0 = at
    tube(f'{name}Pole', 0.018, 0.018, h, mat('matte', TIMBER), P, at=at, segs=6)
    sheet(f'{name}Flag', 0.3, 0.16, mat('team'), P, at=(x0 + 0.16, y0, z0 + h - 0.01), rot=(0, 0, 0), bend=0.04, cols=4, rows=3, thick=0.004, sub=0)
    sphere(f'{name}Ball', 0.03, mat('gold', GOLD), P, at=(x0, y0, z0 + h + 0.02))


def barrel(name, P, at, r=0.12):
    x0, y0, z0 = at
    lathe(f'{name}', [(0.0, 0.0), (r * 0.85, 0.0), (r, r * 1.1), (r * 0.85, r * 2.2), (0.0, r * 2.2)], mat('matte', '#9a6a3a'), P, at=at, segs=12)
    for t in (0.2, 0.8):
        torus(f'{name}Hoop{t}', r * (0.9 + 0.08 * (1 - abs(t - 0.5) * 2)), 0.01, mat('metal', IRON), P, at=(x0, y0, z0 + r * 2.2 * t), segs=14, rsegs=3)


def crate(name, P, at, size=0.22, rot_z=0.0):
    x0, y0, z0 = at
    box(f'{name}', (size, size, size), mat('matte', '#a8783e'), P, at=(x0, y0, z0 + size / 2), rot=(0, 0, rot_z), bevel=0.012)
    for sgn in (-1, 1):
        box(f'{name}Slat{sgn}', (size * 1.02, size * 0.12, size * 1.02), mat('matte', TIMBER), P, at=(x0, y0, z0 + size / 2 + sgn * size * 0.35), rot=(0, 0, rot_z))


def hay(name, P, at, r=0.2):
    lathe(f'{name}', [(0.0, 0.0), (r, 0.0), (r * 1.05, r * 0.6), (r * 0.6, r * 1.3), (0.0, r * 1.5)], mat('matte', '#e0bd5a'), P, at=at, segs=12, sub=1)


def log_pile(name, P, at, n=3, length=0.6, rot_z=0.0):
    x0, y0, z0 = at
    k = 0
    for row in range(n):
        for i in range(n - row):
            off = (i - (n - row - 1) / 2) * 0.15
            px = x0 + off * math.cos(rot_z)
            py = y0 + off * math.sin(rot_z)
            pz = z0 + 0.075 + row * 0.13
            tube(f'{name}{k}', 0.075, 0.075, length, mat('matte', '#8a5a32' if k % 2 else '#a06c3c'), P,
                 at=(px - math.sin(rot_z) * length / 2, py + math.cos(rot_z) * length / 2, pz), rot=(math.pi / 2, 0, rot_z), segs=10)
            k += 1


def fence(name, P, a, b, color=TIMBER_L):
    ln = math.hypot(b[0] - a[0], b[1] - a[1])
    ang = math.atan2(b[1] - a[1], b[0] - a[0])
    n = max(1, round(ln / 0.4))
    for i in range(n + 1):
        t = i / n
        box(f'{name}Post{i}', (0.055, 0.055, 0.28), mat('matte', color), P, at=(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0.14), bevel=0.01)
    for z in (0.1, 0.21):
        box(f'{name}Rail{z}', (ln, 0.035, 0.035), mat('matte', color), P, at=((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z), rot=(0, 0, ang), bevel=0.006)


def brazier(name, P, at):
    x0, y0, z0 = at
    lathe(f'{name}', [(0.0, 0.0), (0.07, 0.0), (0.045, 0.2), (0.14, 0.32), (0.15, 0.4), (0.0, 0.38)], mat('matte', STONE[2]), P, at=at, segs=10)
    lathe(f'{name}Fire', [(0.11, 0.0), (0.07, 0.12), (0.0, 0.26)], mat('glow', '#ffb43a'), P, at=(x0, y0, z0 + 0.38), segs=8)
    lathe(f'{name}Core', [(0.06, 0.0), (0.03, 0.08), (0.0, 0.16)], mat('glow', '#fff0a0'), P, at=(x0, y0, z0 + 0.38), segs=8)
