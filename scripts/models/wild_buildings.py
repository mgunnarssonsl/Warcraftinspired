"""Thornwild buildings (sheet 06): grown, not built. One unit = one tile; entrance toward -Y."""
import math
from blib import mat, sphere, box, lathe, tube, extrude, torus, sheet, lump, curve_tube, pivot
from bkit import STONE, TIMBER, ground_skirt, barrel, fence, Rng
from common import leaf, leaf_outline

BARK = '#a0703f'
BARK_D = '#74502c'
BARK_L = '#c08a52'
LEAVES = ['#9ccc4c', '#86bc40', '#b6dc5c', '#76aa36']
AMBER = '#ffb43a'
BONE = '#ece0c2'
EARTH = '#9a7e56'


def canopy(name, P, at, r, seed, n=8):
    rr = Rng(seed)
    x0, y0, z0 = at
    lump(f'{name}Core', r * 0.8, mat('matte', LEAVES[1]), P, at=at, scale=(1.2, 1.2, 0.8), seed=seed, rough=0.15, segs=16, rings=10)
    for i in range(n):
        a = 2 * math.pi * i / n + rr(-0.2, 0.2)
        d = r * rr(0.55, 0.85)
        lump(f'{name}C{i}', r * rr(0.38, 0.55), mat('matte', LEAVES[i % 4]), P, at=(x0 + math.cos(a) * d, y0 + math.sin(a) * d, z0 + rr(-0.3, 0.25) * r), scale=(1, 1, 0.8), seed=seed * 13 + i, rough=0.18, segs=12, rings=8)
    lump(f'{name}Top', r * 0.55, mat('matte', LEAVES[2]), P, at=(x0 - r * 0.1, y0 + r * 0.1, z0 + r * 0.5), seed=seed * 7, rough=0.18, segs=12, rings=8)


def trunk(name, P, at, r, h, seed, roots=6):
    rr = Rng(seed)
    x0, y0, z0 = at
    lathe(f'{name}', [(0.0, 0.0), (r * 1.6, 0.0), (r * 1.15, h * 0.12), (r * 0.95, h * 0.4), (r * 1.0, h * 0.75), (r * 1.25, h), (0.0, h)], mat('matte', BARK), P, at=at, segs=14, sub=1)
    for i in range(6):
        a = i * 1.05 + rr(0, 0.3)
        curve_tube(f'{name}Ridge{i}', [(x0 + math.cos(a) * r, y0 + math.sin(a) * r, z0 + h * 0.08), (x0 + math.cos(a + 0.2) * r * 0.95, y0 + math.sin(a + 0.2) * r * 0.95, z0 + h * 0.5), (x0 + math.cos(a) * r * 1.15, y0 + math.sin(a) * r * 1.15, z0 + h * 0.95)],
                   r * 0.18, mat('matte', BARK_D), P, taper=[1.2, 0.8, 1.0])
    for i in range(roots):
        a = 2 * math.pi * i / roots + rr(-0.2, 0.2)
        curve_tube(f'{name}Root{i}', [(x0 + math.cos(a) * r * 0.9, y0 + math.sin(a) * r * 0.9, z0 + h * 0.15), (x0 + math.cos(a) * r * 1.6, y0 + math.sin(a) * r * 1.6, z0 + 0.06), (x0 + math.cos(a) * r * 2.3, y0 + math.sin(a) * r * 2.3, z0 + 0.0)],
                   r * 0.32, mat('matte', BARK if i % 2 else BARK_D), P, taper=[1.0, 0.75, 0.3])


def glow_door(name, P, at, w=0.45, h=0.6):
    x0, y0, z0 = at
    pts = [(-w / 2, 0)]
    for i in range(9):
        a = math.pi - math.pi * i / 8
        pts.append((math.cos(a) * w / 2, h - w / 2 + math.sin(a) * w / 2))
    pts.append((w / 2, 0))
    extrude(f'{name}Frame', [(x * 1.25, z * 1.12) for x, z in pts], 0.06, mat('matte', BARK_D), P, at=at, bevel=0.01)
    extrude(f'{name}Light', pts, 0.07, mat('glow', '#ffb84a'), P, at=(x0, y0 - 0.005, z0))


def leaf_banner(name, P, at, w=0.26, h=0.45, rot_z=0.0):
    x0, y0, z0 = at
    c, s = math.cos(rot_z), math.sin(rot_z)
    tube(f'{name}Rod', 0.016, 0.016, w + 0.12, mat('matte', BARK_D), P, at=(x0 - (w / 2 + 0.06) * c, y0 - (w / 2 + 0.06) * s, z0), rot=(0, math.pi / 2, rot_z), segs=6)
    extrude(f'{name}Cloth', [(-w / 2, 0), (w / 2, 0), (w / 2, -h), (0, -h - w * 0.3), (-w / 2, -h)], 0.02, mat('team'), P, at=(x0 + 0.03 * s, y0 - 0.03 * c, z0), rot=(0, 0, rot_z), bevel=0.004)
    extrude(f'{name}Leaf', leaf_outline(w * 0.45, h * 0.45), 0.024, mat('matte', LEAVES[2]), P, at=(x0 + 0.045 * s, y0 - 0.045 * c, z0 - h * 0.7), rot=(0, 0, rot_z), bevel=0.003)


def lantern(name, P, at):
    x0, y0, z0 = at
    tube(f'{name}Cord', 0.005, 0.005, 0.15, mat('matte', BARK_D), P, at=(x0, y0, z0), segs=4)
    lathe(f'{name}', [(0.0, 0.0), (0.035, 0.0), (0.055, 0.05), (0.035, 0.11), (0.0, 0.11)], mat('glow', '#ffc84a'), P, at=(x0, y0, z0 - 0.11), segs=8)


def tusk(name, P, base, length, out_dir, lean=0.6):
    bx, by, bz = base
    dx, dy = out_dir
    curve_tube(name, [(bx, by, bz), (bx + dx * length * 0.3, by + dy * length * 0.3, bz + length * 0.55), (bx + dx * length * 0.75, by + dy * length * 0.75, bz + length * 0.85)],
               length * 0.1, mat('matte', BONE), P, taper=[1.0, 0.7, 0.15])


def stones(P, n, radius, seed, z=0.06):
    r = Rng(seed)
    for i in range(n):
        a = r(0, 2 * math.pi)
        lump(f'stone{seed}_{i}', r(0.1, 0.2), mat('matte', r.pick(STONE)), P, at=(math.cos(a) * radius, math.sin(a) * radius, z), seed=seed + i, rough=0.2, segs=10, rings=7, sub=0)


def heartwood(tier=1):
    P = pivot('root')
    k = 1 + (tier - 1) * 0.15
    ground_skirt(P, 3.9, 3.9, seed=31)
    lathe('mound', [(0.0, 0.0), (1.75, 0.0), (1.6, 0.1), (0.0, 0.14)], mat('matte', EARTH), P, segs=20)
    stones(P, 10, 1.6, 33)
    trunk('trunk', P, (0, 0.2, 0.1), 0.66 * k, 2.6 * k, 35, roots=8)
    glow_door('door', P, (0, -0.4 * k - 0.05, 0.12), 0.5, 0.75)
    for i in range(3):
        box(f'step{i}', (0.5 - i * 0.08, 0.14, 0.06), mat('matte', BARK_L), P, at=(0, -0.62 - (2 - i) * 0.1, 0.03 + i * 0.05), bevel=0.012)
    # A platform with a railing round the trunk.
    lathe('platform', [(0.0, 0.0), (1.05 * k, 0.0), (1.05 * k, 0.08), (0.0, 0.08)], mat('matte', BARK_L), P, at=(0, 0.2, 1.1 * k), segs=20)
    for i in range(12):
        a = 2 * math.pi * i / 12
        box(f'rail{i}', (0.05, 0.05, 0.26), mat('matte', BARK_D), P, at=(math.cos(a) * 1.0 * k, 0.2 + math.sin(a) * 1.0 * k, 1.3 * k), bevel=0.008)
    torus('railTop', 1.0 * k, 0.025, mat('matte', BARK_D), P, at=(0, 0.2, 1.43 * k), segs=28, rsegs=4)
    canopy('canopy', P, (0, 0.2, 3.0 * k), 1.45 * k, 37, n=10)
    for sx in (-1, 1):
        leaf_banner(f'banner{sx}', P, (sx * 0.72 * k, -0.42 * k, 1.0 * k), 0.28, 0.5)
    lantern('lanternA', P, (-0.9, -0.3, 2.05 * k))
    lantern('lanternB', P, (0.95, 0.0, 2.1 * k))
    lantern('lanternC', P, (0.2, -0.75, 2.2 * k))
    if tier > 1:
        lathe('upperPlatform', [(0.0, 0.0), (0.7, 0.0), (0.7, 0.07), (0.0, 0.07)], mat('matte', BARK_L), P, at=(0.55, 0.6, 2.0 * k), segs=16)
        lathe('hut', [(0.33, 0.0), (0.33, 0.26), (0.0, 0.58)], mat('matte', LEAVES[3]), P, at=(0.55, 0.6, 2.05 * k), segs=12, sub=1)
        glow_door('hutDoor', P, (0.55, 0.27, 2.06 * k), 0.14, 0.2)
    if tier > 2:
        for a in (0.5, 2.6, 3.7, 5.7):
            tusk(f'tusk{a}', P, (math.cos(a) * 1.25, 0.2 + math.sin(a) * 1.25, 0.1), 1.0, (math.cos(a), math.sin(a)))
        sphere('amberHeart', 0.2, mat('glow', AMBER), P, at=(0, -0.42, 1.7 * k), scale=(1, 0.6, 1.5))
    return P


def grove():
    P = pivot('root')
    ground_skirt(P, 1.9, 1.9, seed=41)
    lathe('hutWall', [(0.0, 0.0), (0.48, 0.0), (0.45, 0.42), (0.0, 0.42)], mat('matte', BARK_L), P, at=(-0.35, 0.3, 0.0), segs=14)
    lathe('hutRoof', [(0.68, 0.0), (0.6, 0.26), (0.36, 0.55), (0.0, 0.74)], mat('matte', LEAVES[0]), P, at=(-0.35, 0.3, 0.38), segs=14, sub=1)
    for i in range(9):
        a = 2 * math.pi * i / 9
        leaf(f'roofLeaf{i}', P, (-0.35 + math.cos(a) * 0.55, 0.3 + math.sin(a) * 0.55, 0.45), 0.16, 0.28, LEAVES[i % 4], rot=(0, 2.4, a))
    glow_door('door', P, (-0.35, -0.16, 0.02), 0.22, 0.3)
    tusk('tusk', P, (-0.05, 0.35, 0.25), 0.45, (1, 0))
    for y in (-0.2, -0.65):
        box(f'bed{y}', (0.7, 0.32, 0.12), mat('matte', BARK_D), P, at=(0.45, y, 0.06), bevel=0.02)
        for i in range(4):
            lump(f'crop{y}{i}', 0.075, mat('matte', LEAVES[1]), P, at=(0.2 + i * 0.17, y, 0.16), seed=i + int(y * 10), rough=0.25, segs=8, rings=6, sub=0)
            sphere(f'fruit{y}{i}', 0.035, mat('matte', '#e0402e'), P, at=(0.23 + i * 0.17, y - 0.03, 0.2))
    tube('fruitTree', 0.05, 0.07, 0.6, mat('matte', BARK), P, at=(0.55, 0.5, 0.0), segs=8)
    canopy('fruitCanopy', P, (0.55, 0.5, 0.8), 0.32, 45, n=5)
    for i in range(5):
        sphere(f'treeFruit{i}', 0.04, mat('matte', '#e8502e'), P, at=(0.55 + math.cos(i) * 0.25, 0.5 + math.sin(i) * 0.25, 0.75))
    fence('fence', P, (-0.9, -0.9), (0.85, -0.9), BARK_L)
    barrel('barrel', P, (-0.75, -0.55, 0.0), 0.1)
    leaf_banner('banner', P, (-0.1, -0.08, 0.55), 0.2, 0.32)
    return P


def saplodge():
    P = pivot('root')
    ground_skirt(P, 2.9, 2.9, seed=51)
    trunk('trunk', P, (-0.45, 0.4, 0.0), 0.42, 1.25, 53, roots=5)
    canopy('canopy', P, (-0.45, 0.4, 1.55), 0.8, 55, n=7)
    glow_door('door', P, (-0.45, 0.0, 0.02), 0.36, 0.5)
    curve_tube('spout', [(-0.1, 0.25, 0.95), (0.3, 0.2, 0.9), (0.55, 0.15, 0.7)], 0.06, mat('matte', BARK_D), P, taper=[1.2, 1.0, 0.8])
    curve_tube('sapStream', [(0.55, 0.15, 0.68), (0.62, 0.1, 0.45), (0.65, 0.05, 0.28)], 0.035, mat('glow', AMBER), P)
    for x, y in ((0.7, 0.0), (0.35, -0.45), (0.95, -0.5)):
        lathe(f'tub{x}', [(0.0, 0.0), (0.18, 0.0), (0.22, 0.2), (0.21, 0.25), (0.19, 0.25), (0.19, 0.05), (0.0, 0.05)], mat('matte', BARK_L), P, at=(x, y, 0.0), segs=12)
        lathe(f'sap{x}', [(0.0, 0.0), (0.19, 0.0), (0.0, 0.0)], mat('glow', '#ffbe4a'), P, at=(x, y, 0.23), segs=12)
        for t in (0.07, 0.18):
            torus(f'hoop{x}{t}', 0.2 + t * 0.1, 0.01, mat('matte', BARK_D), P, at=(x, y, t), segs=14, rsegs=3)
    barrel('barrelA', P, (-1.0, -0.7, 0.0), 0.12)
    barrel('barrelB', P, (-0.75, -0.9, 0.0), 0.11)
    fence('fence', P, (-1.2, -1.15), (1.2, -1.15), BARK_L)
    leaf_banner('banner', P, (-0.45, -0.05, 0.95), 0.24, 0.38)
    return P


def den():
    P = pivot('root')
    ground_skirt(P, 2.9, 2.9, seed=61)
    lathe('dome', [(1.05, 0.0), (1.0, 0.35), (0.75, 0.75), (0.35, 1.0), (0.0, 1.05)], mat('matte', BARK), P, at=(0, 0.25, 0.05), segs=18, sub=1)
    for i in range(6):
        torus(f'weave{i}', 0.96 - i * 0.01, 0.05, mat('matte', BARK_D if i % 2 else BARK_L), P, at=(0, 0.25, 0.05), rot=(math.pi / 2, 0, i * math.pi / 6), segs=20, rsegs=5)
    for i in range(10):
        a = 2 * math.pi * i / 10
        lump(f'leafClump{i}', 0.24, mat('matte', LEAVES[i % 4]), P, at=(math.cos(a) * 0.55, 0.25 + math.sin(a) * 0.55, 0.85), scale=(1, 1, 0.6), seed=63 + i, rough=0.2, segs=10, rings=7)
    lathe('mouth', [(0.0, 0.0), (0.34, 0.0), (0.34, 0.5), (0.0, 0.5)], mat('matte', '#24160c'), P, at=(0, -0.6, 0.02), rot=(math.pi / 2, 0, 0), segs=14, scale=(1, 0.3, 1))
    torus('mouthArch', 0.38, 0.07, mat('matte', BARK_D), P, at=(0, -0.68, 0.32), rot=(math.pi / 2, 0, 0), segs=16, rsegs=5)
    for a in (0.4, 1.2, 1.95, 2.75):
        tusk(f'tusk{a}', P, (math.cos(a) * 1.0, 0.25 - math.sin(a) * 1.0, 0.05), 0.75, (math.cos(a), -math.sin(a)))
    for x in (-0.9, 0.9):
        box(f'targetPost{x}', (0.04, 0.04, 0.45), mat('matte', BARK_D), P, at=(x, -1.0, 0.23))
        for r, c in ((0.16, '#efe6d0'), (0.09, '#c8402e')):
            lathe(f'target{x}{r}', [(0.0, 0.0), (r, 0.0), (r, 0.04), (0.0, 0.04)], mat('matte', c), P, at=(x, -1.02, 0.42), rot=(math.pi / 2, 0, 0), segs=14)
    fence('fenceL', P, (-1.3, -1.25), (-0.45, -1.25), BARK_L)
    fence('fenceR', P, (0.45, -1.25), (1.3, -1.25), BARK_L)
    for x in (-0.55, 0.55):
        leaf_banner(f'banner{x}', P, (x, -0.65, 0.8), 0.22, 0.36)
    return P


def spire():
    P = pivot('root')
    ground_skirt(P, 1.8, 1.8, seed=71)
    stones(P, 7, 0.65, 73)
    for v in range(3):
        pts = []
        for i in range(9):
            t = i / 8
            a = v * 2.1 + t * 5
            rad = 0.32 * (1 - t * 0.55)
            pts.append((math.cos(a) * rad, math.sin(a) * rad, 0.05 + t * 2.1))
        curve_tube(f'vine{v}', pts, 0.13, mat('matte', [BARK, BARK_L, BARK_D][v]), P, taper=[1.2, 1.1, 1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4])
        for i in range(1, 8, 2):
            t = i / 8
            a = v * 2.1 + t * 5
            rad = 0.32 * (1 - t * 0.55) + 0.1
            tusk(f'thorn{v}{i}', P, (math.cos(a) * (rad - 0.05), math.sin(a) * (rad - 0.05), 0.05 + t * 2.1), 0.16, (math.cos(a), math.sin(a)))
    for i in range(5):
        a = 2 * math.pi * i / 5
        curve_tube(f'crownThorn{i}', [(math.cos(a) * 0.12, math.sin(a) * 0.12, 2.1), (math.cos(a) * 0.22, math.sin(a) * 0.22, 2.35), (math.cos(a) * 0.28, math.sin(a) * 0.28, 2.5)], 0.04, mat('matte', BARK_L), P, taper=[1.0, 0.6, 0.2])
    sphere('crystal', 0.17, mat('glow', '#7dff5a'), P, at=(0, 0, 2.42), scale=(1, 1, 1.6), segs=6, rings=4)
    for i in range(5):
        a = 2 * math.pi * i / 5
        leaf(f'midLeaf{i}', P, (math.cos(a) * 0.2, math.sin(a) * 0.2, 0.9), 0.14, 0.22, LEAVES[i % 4], rot=(0, 2.3, a))
    leaf_banner('banner', P, (0.0, -0.33, 1.35), 0.2, 0.36)
    return P


def circle():
    P = pivot('root')
    ground_skirt(P, 2.9, 2.9, seed=81)
    lathe('floor', [(0.0, 0.0), (1.05, 0.0), (1.0, 0.06), (0.0, 0.06)], mat('matte', STONE[2]), P, segs=24)
    torus('runeRing', 0.75, 0.035, mat('glow', '#7dff5a'), P, at=(0, 0, 0.065), segs=32, rsegs=4)
    for i in range(6):
        a = 2 * math.pi * i / 6 + 0.26
        x, y = math.cos(a) * 1.15, math.sin(a) * 1.15
        lump(f'menhir{i}', 0.22, mat('matte', '#9a9488'), P, at=(x, y, 0.42), scale=(0.85, 0.55, 2.0), rot=(0, 0, a), seed=83 + i, rough=0.12, segs=10, rings=8)
        lump(f'menhirMoss{i}', 0.13, mat('matte', LEAVES[3]), P, at=(x, y, 0.82), scale=(1, 1, 0.4), seed=90 + i, rough=0.3, segs=8, rings=6, sub=0)
        box(f'rune{i}', (0.08, 0.03, 0.16), mat('glow', '#7dff5a'), P, at=(x * 0.86, y * 0.86, 0.45), rot=(0, 0, a + math.pi / 2))
    tube('youngTree', 0.07, 0.1, 0.95, mat('matte', BARK), P, at=(0, 0, 0.05), segs=8)
    canopy('canopy', P, (0, 0, 1.2), 0.5, 87, n=6)
    for i in range(5):
        sphere(f'wisp{i}', 0.04, mat('glow', '#c8ff8a'), P, at=(math.cos(i * 1.3) * 0.38, math.sin(i * 1.3) * 0.38, 1.05 + (i % 2) * 0.2))
    leaf_banner('banner', P, (0, -0.12, 0.62), 0.18, 0.3)
    return P


def barkweaver():
    P = pivot('root')
    ground_skirt(P, 2.9, 2.9, seed=91)
    box('hut', (1.7, 1.1, 0.75), mat('matte', BARK), P, at=(-0.1, 0.35, 0.38), bevel=0.12, sub=1)
    for i in range(7):
        box(f'slat{i}', (0.06, 0.05, 0.78), mat('matte', BARK_D), P, at=(-0.9 + i * 0.27, -0.21, 0.4), bevel=0.015)
    lathe('roof', [(1.0, 0.0), (0.9, 0.25), (0.5, 0.55), (0.0, 0.65)], mat('matte', LEAVES[3]), P, at=(-0.1, 0.35, 0.74), scale=(1.1, 0.8, 1), segs=16, sub=1)
    for i in range(7):
        leaf(f'eaveLeaf{i}', P, (-0.95 + i * 0.28, -0.2, 0.95), 0.18, 0.3, LEAVES[i % 4], rot=(2.5, 0, 0))
    tusk('ridgeTusk', P, (-0.8, 0.35, 1.3), 1.5, (1, 0))
    glow_door('door', P, (-0.1, -0.24, 0.02), 0.4, 0.5)
    box('armourStand', (0.04, 0.04, 0.8), mat('matte', BARK_D), P, at=(0.95, -0.55, 0.4))
    lathe('barkArmour', [(0.15, 0.0), (0.18, 0.12), (0.15, 0.3), (0.08, 0.36)], mat('matte', '#b89a52'), P, at=(0.95, -0.55, 0.38), segs=10, sub=1)
    for i in range(3):
        leaf(f'armourLeaf{i}', P, (0.95 + (i - 1) * 0.06, -0.55, 0.72), 0.08, 0.12, LEAVES[i], rot=(0, 2.2, i * 2))
    box('bench', (0.7, 0.32, 0.08), mat('matte', BARK_L), P, at=(0.3, -0.85, 0.35), bevel=0.015)
    for x in (0.0, 0.6):
        box(f'benchLeg{x}', (0.06, 0.26, 0.32), mat('matte', BARK_D), P, at=(x, -0.85, 0.16))
    leaf_banner('banner', P, (-0.75, -0.24, 0.68), 0.22, 0.36)
    return P


def moonwell():
    P = pivot('root')
    ground_skirt(P, 2.9, 2.9, seed=101)
    lathe('rim', [(0.75, 0.0), (0.92, 0.0), (0.95, 0.3), (0.78, 0.34), (0.75, 0.15)], mat('matte', STONE[1]), P, at=(0, -0.1, 0.02), segs=24)
    lathe('pool', [(0.0, 0.0), (0.77, 0.0), (0.0, 0.0)], mat('glow', '#4ac8ff'), P, at=(0, -0.1, 0.3), segs=24)
    for sx in (-1, 1):
        curve_tube(f'archRoot{sx}', [(sx * 0.65, 0.55, 0.0), (sx * 0.6, 0.6, 0.8), (sx * 0.35, 0.62, 1.35), (0.0, 0.62, 1.45)], 0.11, mat('matte', BARK if sx < 0 else BARK_D), P, taper=[1.3, 1.0, 0.9, 0.8])
    canopy('archCanopy', P, (0, 0.62, 1.95), 0.45, 103, n=5)
    box('fall', (0.3, 0.04, 1.1), mat('glow', '#7ad8ff'), P, at=(0, 0.5, 0.85))
    box('splash', (0.36, 0.36, 0.08), mat('glow', '#9ae6ff'), P, at=(0, 0.38, 0.32))
    for sx in (-1, 1):
        lump(f'runestone{sx}', 0.2, mat('matte', '#9a9488'), P, at=(sx * 1.05, 0.1, 0.4), scale=(0.8, 0.55, 1.8), seed=105 + sx, rough=0.12, segs=10, rings=8)
        torus(f'runeGlow{sx}', 0.06, 0.015, mat('glow', '#6ad0ff'), P, at=(sx * 1.05, -0.02, 0.5), rot=(math.pi / 2, 0, 0), segs=12, rsegs=3)
    stones(P, 6, 1.1, 107)
    leaf_banner('banner', P, (0, 0.47, 1.25), 0.24, 0.3)
    return P


def rootpit():
    P = pivot('root')
    ground_skirt(P, 2.9, 2.9, seed=111)
    lathe('pitRim', [(0.7, 0.0), (1.25, 0.0), (1.2, 0.06), (0.75, 0.05)], mat('matte', '#7a6040'), P, segs=24)
    lathe('pitGlow', [(0.0, 0.0), (0.72, 0.0), (0.0, 0.0)], mat('glow', '#ffa83a'), P, at=(0, 0, 0.03), segs=20)
    for i in range(6):
        a = 2 * math.pi * i / 6
        curve_tube(f'arch{i}', [(math.cos(a) * 0.75, math.sin(a) * 0.75, 0.0), (math.cos(a) * 0.45, math.sin(a) * 0.45, 0.65), (0.0, 0.0, 0.85)], 0.09, mat('matte', BARK if i % 2 else BARK_D), P, taper=[1.3, 1.0, 0.8])
    tube('heart', 0.13, 0.2, 1.1, mat('matte', BARK_L), P, at=(0, 0, 0.05), segs=10)
    canopy('canopy', P, (0, 0, 1.25), 0.42, 113, n=5)
    for i in range(5):
        lathe(f'ember{i}', [(0.06, 0.0), (0.0, 0.22)], mat('glow', AMBER), P, at=(math.cos(i * 1.3) * 0.4, math.sin(i * 1.3) * 0.4, 0.02), segs=5)
    stones(P, 7, 1.15, 115)
    leaf_banner('banner', P, (0, -0.17, 0.88), 0.22, 0.32)
    return P
