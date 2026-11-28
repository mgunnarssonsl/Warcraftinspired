"""Thornwild heavy infantry in carved wood (sheet 03): the Thornguard and the Bark Sentinel.
Faceted bark plates with darker edges over a bulky frame, leafy shoulders, a horned
wooden helm with a visor slit and amber eyes, a spiked mace; the Thornguard carries a
round plank shield ringed with thorns and a green spiral glyph, the Bark Sentinel a
tall bark tower shield with moss and an amber heart, and antlers on its helm."""
import math
from blib import mat, sphere, box, lathe, tube, extrude, torus, pivot, lump, curve_tube
from figure import Figure, HIP, KNEE, ANKLE, SHOULDER, SH_X, ELBOW_DROP, WRIST_DROP, NECK, HEAD
from common import hand_at, arm_x, leaf, leaf_ring
import wild as WD

WOOD = '#b07a44'
WOOD_L = '#c99a5e'
WOOD_D = '#6e4626'
GLYPH = '#8fd84a'
AMBER = '#ffb43a'
MOSS = '#6f9a34'


def plate(name, parent, at, size, rot=(0, 0, 0), taper=None, light=False):
    """A carved wooden plate: a bevelled block with a darker rim under it."""
    box(name, size, mat('matte', WOOD_L if light else WOOD), parent, at=at, rot=rot, bevel=min(size) * 0.3, taper=taper, sub=0)
    box(name + 'Rim', (size[0] * 1.08, size[1] * 0.8, size[2] * 1.08), mat('matte', WOOD_D), parent, at=at, rot=rot, bevel=min(size) * 0.2, taper=taper, sub=0)


def body(F):
    b = F.bulk
    hips, spine, ch, h = F['hips'], F['spine'], F['chest'], F['head']
    for s, sx in (('R', -1), ('L', 1)):
        x = 0.085 * b * sx
        th, sh, ft = F[f'thigh.{s}'], F[f'shin.{s}'], F[f'foot.{s}']
        tube(f'leg.{s}', 0.07 * b, 0.06 * b, HIP - KNEE, mat('matte', WOOD_D), th, at=(x, 0, KNEE), segs=10, sub=1)
        plate(f'thighPlate.{s}', th, (x, -0.035, KNEE + 0.11), (0.12 * b, 0.05, 0.16), rot=(0.08, 0, 0), taper=(0.85, 1.0))
        plate(f'knee.{s}', sh, (x, -0.06, KNEE + 0.005), (0.1 * b, 0.05, 0.08), rot=(0.3, 0, 0), light=True)
        tube(f'shin.{s}', 0.058 * b, 0.068 * b, KNEE - ANKLE, mat('matte', WOOD_D), sh, at=(x, 0, ANKLE), segs=10, sub=1)
        plate(f'greave.{s}', sh, (x, -0.045, ANKLE + 0.08), (0.11 * b, 0.05, 0.14), taper=(1.15, 1.0))
        plate(f'boot.{s}', ft, (x, -0.04, 0.04), (0.12 * b, 0.2, 0.08), taper=(0.9, 0.75))
    # Torso: a broad chest plate, abdominal plates, a belt with an amber stone, a leaf skirt.
    lathe('core', [(0.0, 0.0), (0.13 * b, 0.0), (0.15 * b, 0.1), (0.17 * b, 0.18), (0.12, 0.25), (0.0, 0.26)], mat('matte', WOOD_D), ch, at=(0, 0, 0.5), scale=(1, 0.82, 1), segs=14, sub=1)
    plate('chestPlate', ch, (0, -0.12 * b, 0.66), (0.3 * b, 0.07, 0.17), rot=(-0.1, 0, 0), taper=(1.0, 1.0), light=True)
    for sx in (-1, 1):
        plate(f'pec{sx}', ch, (sx * 0.075 * b, -0.15 * b, 0.68), (0.13 * b, 0.04, 0.1), rot=(-0.1, sx * 0.15, 0))
    for i in range(3):
        plate(f'abs{i}', ch, (0, -0.125 * b, 0.56 - i * 0.045), (0.2 * b - i * 0.02, 0.05, 0.04))
    torus('belt', 0.14 * b, 0.022, mat('matte', WOOD_D), spine, at=(0, 0, 0.5), scale=(1, 0.86, 1), segs=18, rsegs=5)
    box('beltPlate', (0.09, 0.03, 0.07), mat('matte', WOOD_L), spine, at=(0, -0.13 * b, 0.5), bevel=0.012)
    sphere('beltStone', 0.024, mat('glow', AMBER), spine, at=(0, -0.148 * b, 0.5), sub=1)
    box('sash', (0.06, 0.014, 0.34), mat('team'), ch, at=(0.03, -0.155 * b, 0.62), rot=(0, 0.6, 0))
    leaf_ring('skirt', hips, (0, 0, HIP + 0.04), 0.14 * b, 12, 0.09, 0.2, WD.LEAVES, tilt=2.7)
    # Arms: wooden forearms, big angular pauldrons crowned with leaves and thorns.
    for s in 'RL':
        x = arm_x(F, s)
        sx = -1 if s == 'R' else 1
        ua, fa, hd = F[f'upperarm.{s}'], F[f'forearm.{s}'], F[f'hand.{s}']
        tube(f'upper.{s}', 0.06 * b, 0.052 * b, ELBOW_DROP, mat('matte', WOOD_D), ua, at=(x, 0, SHOULDER - ELBOW_DROP), segs=10, sub=1)
        for i in range(2):
            plate(f'pauldron{i}.{s}', ua, (x * 1.1 + sx * 0.02 * i, 0, SHOULDER + 0.03 - i * 0.05), (0.15 * b, 0.17 * b, 0.06), rot=(0, sx * (0.45 + 0.15 * i), 0), light=i == 0)
        leaf_ring(f'shoulderLeaves.{s}', ua, (x * 1.12, 0, SHOULDER + 0.06), 0.07, 6, 0.08, 0.15, WD.LEAVES, tilt=1.6)
        lathe(f'shoulderThorn.{s}', [(0.02, 0.0), (0.0, 0.08)], mat('matte', '#efe0c0'), ua, at=(x * 1.25, 0.0, SHOULDER + 0.05), rot=(0, sx * 1.1, 0), segs=6)
        tube(f'fore.{s}', 0.052 * b, 0.045 * b, WRIST_DROP - ELBOW_DROP, mat('matte', WOOD_D), fa, at=(x * 1.05, -0.005, SHOULDER - WRIST_DROP), segs=10, sub=1)
        plate(f'vambrace.{s}', fa, (x * 1.06, -0.03, SHOULDER - WRIST_DROP + 0.07), (0.09 * b, 0.05, 0.12), light=True)
        hx, hy, hz = hand_at(F, s)
        plate(f'fist.{s}', hd, (hx, hy, hz), (0.075 * b, 0.08, 0.075))
    # Helm: an angular wooden helm, a visor slit with amber eyes, horns, a leaf crest.
    hb = 1.12
    lathe('helm', [(0.0, -0.11), (0.1, -0.11), (0.112, -0.03), (0.108, 0.05), (0.085, 0.1), (0.0, 0.13)], mat('matte', WOOD), h, at=(0, 0, HEAD), scale=(hb, hb * 1.05, 1.05), segs=8, sub=0)
    box('faceGuard', (0.16, 0.04, 0.16), mat('matte', WOOD_L), h, at=(0, -0.11, HEAD - 0.02), bevel=0.02, taper=(0.75, 1.0))
    box('visor', (0.13, 0.03, 0.022), mat('matte', '#1e140c'), h, at=(0, -0.13, HEAD + 0.02))
    for sx in (-1, 1):
        sphere(f'eye{sx}', 0.012, mat('glow', AMBER), h, at=(sx * 0.03, -0.135, HEAD + 0.02))
        curve_tube(f'horn{sx}', [(sx * 0.09, -0.02, HEAD + 0.07), (sx * 0.15, -0.03, HEAD + 0.15), (sx * 0.15, -0.06, HEAD + 0.25)], 0.024, mat('matte', WOOD_L), h, taper=[1.0, 0.75, 0.15])
    box('crest', (0.03, 0.14, 0.06), mat('matte', WOOD_L), h, at=(0, 0.0, HEAD + 0.14), bevel=0.01)
    leaf_ring('helmLeaves', h, (0, 0.03, HEAD + 0.1), 0.08, 7, 0.06, 0.12, WD.LEAVES, tilt=1.3)


def mace(F, size=1.0):
    hd = F['hand.R']
    hx, hy, hz = hand_at(F, 'R')
    w = pivot('weapon', hd, (hx, hy, hz))
    w.rotation_euler = (0.6, 0, 0)
    F.p['weapon'] = w
    tube('haft', 0.022 * size, 0.026 * size, 0.42 * size, mat('matte', WOOD_D), w, at=(hx, hy, hz - 0.1), segs=8)
    top = (hx, hy, hz + 0.35 * size)
    lump('maceHead', 0.085 * size, mat('matte', WOOD), w, at=top, seed=7, rough=0.08)
    for i in range(10):
        a = 2 * math.pi * i / 10
        e = 0.5 if i % 2 else -0.5
        d = (math.cos(a) * math.cos(e), math.sin(a) * math.cos(e), math.sin(e))
        lathe(f'spike{i}', [(0.02 * size, 0.0), (0.0, 0.07 * size)], mat('matte', '#efe0c0'), w, at=(top[0] + d[0] * 0.075 * size, top[1] + d[1] * 0.075 * size, top[2] + d[2] * 0.075 * size), rot=(math.acos(max(-1, min(1, d[2]))), 0, math.atan2(d[1], d[0]) + math.pi / 2) if False else (math.pi / 2 - e, 0, a - math.pi / 2), segs=5)


def round_shield(F):
    fa = F['forearm.L']
    sx = arm_x(F, 'L') * 1.05 + 0.05
    sz = SHOULDER - WRIST_DROP + 0.07
    yaw = -0.55
    c, sn = math.cos(yaw), math.sin(yaw)
    def on(dy, dx=0.0, dz=0.0):
        return (sx + dx * c - dy * sn, -0.08 + dx * sn + dy * c, sz + dz)
    r = 0.2
    lathe('shieldWood', [(0.0, 0.0), (r, 0.0), (r * 0.97, 0.035), (0.0, 0.05)], mat('matte', WOOD), fa, at=on(0.0), rot=(math.pi / 2, 0, yaw), segs=24)
    for i in range(4):
        box(f'plank{i}', (0.006, 0.01, r * 1.8 * math.sqrt(max(0.1, 1 - ((i - 1.5) * 0.09 / r) ** 2))), mat('matte', WOOD_D), fa, at=on(-0.052, (i - 1.5) * 0.09), rot=(0, 0, yaw))
    torus('shieldRim', r, 0.024, mat('matte', WOOD_L), fa, at=on(-0.01), rot=(math.pi / 2, 0, yaw), segs=28, rsegs=6)
    for i in range(10):
        a = 2 * math.pi * i / 10
        p = on(-0.01, math.cos(a) * r * 1.06, math.sin(a) * r * 1.06)
        lathe(f'thorn{i}', [(0.018, 0.0), (0.0, 0.07)], mat('matte', '#efe0c0'), fa, at=p, rot=(0, math.pi / 2 - a, yaw) if False else (math.pi / 2 - a, math.pi / 2, yaw), segs=5)
    # The green spiral glyph.
    pts = []
    for i in range(16):
        t = i / 15
        a = t * 2.4 * math.pi
        rr = r * 0.6 * (1 - 0.8 * t)
        pts.append(on(-0.06, math.cos(a) * rr, math.sin(a) * rr))
    curve_tube('glyph', pts, 0.012, mat('glow', GLYPH), fa, taper=[0.6] + [1.0] * 14 + [0.5])
    lathe('shieldTeam', [(0.0, 0.0), (r * 0.18, 0.0), (0.0, 0.01)], mat('team'), fa, at=on(-0.065), rot=(math.pi / 2, 0, yaw), segs=12)


def tower_shield(F):
    fa = F['forearm.L']
    sx = arm_x(F, 'L') * 1.05 + 0.06
    sz = SHOULDER - WRIST_DROP + 0.0
    yaw = -0.5
    c, sn = math.cos(yaw), math.sin(yaw)
    def on(dy, dx=0.0, dz=0.0):
        return (sx + dx * c - dy * sn, -0.09 + dx * sn + dy * c, sz + dz)
    # Upright bark planks bound with vine, a rounded top, moss, an amber heart, a spiral.
    for i in range(5):
        dx = (i - 2) * 0.075
        hgt = 0.62 - abs(i - 2) * 0.05
        box(f'towerPlank{i}', (0.072, 0.045, hgt), mat('matte', WOOD if i % 2 else WOOD_L), fa, at=on(0.0, dx, 0.0), rot=(0, 0, yaw), bevel=0.012)
    for dz in (-0.18, 0.16):
        box(f'towerBand{dz}', (0.4, 0.06, 0.04), mat('matte', WOOD_D), fa, at=on(-0.012, 0.0, dz), rot=(0, 0, yaw), bevel=0.01)
    box('towerTeam', (0.36, 0.062, 0.05), mat('team'), fa, at=on(-0.014, 0.0, 0.0), rot=(0, 0, yaw), bevel=0.008)
    sphere('towerHeart', 0.045, mat('glow', AMBER), fa, at=on(-0.05, 0.0, 0.0), sub=1)
    pts = []
    for i in range(16):
        t = i / 15
        a = t * 2.4 * math.pi
        rr = 0.12 * (1 - 0.8 * t)
        pts.append(on(-0.05, math.cos(a) * rr, 0.16 + math.sin(a) * rr * 0.9))
    curve_tube('towerGlyph', pts, 0.011, mat('glow', GLYPH), fa)
    lump('towerMoss', 0.1, mat('matte', MOSS), fa, at=on(-0.02, -0.08, 0.3), scale=(1.6, 0.6, 0.5), seed=61, rough=0.25)
    for i in range(6):
        lathe(f'towerThorn{i}', [(0.016, 0.0), (0.0, 0.06)], mat('matte', '#efe0c0'), fa, at=on(-0.03, (i - 2.5) * 0.07, 0.3), rot=(0.2, 0, yaw), segs=5)


def build(kind='thornguard', F=None, animate=True):
    F = F or Figure(bulk=1.32 if kind == 'thornguard' else 1.4)
    body(F)
    mace(F)
    if kind == 'barksentinel':
        tower_shield(F)
        h = F['head']
        for sx in (-1, 1):
            curve_tube(f'antler{sx}', [(sx * 0.08, 0.02, HEAD + 0.1), (sx * 0.15, 0.03, HEAD + 0.2), (sx * 0.22, 0.05, HEAD + 0.3)], 0.016, mat('matte', WOOD_D), h, taper=[1.0, 0.7, 0.3])
            curve_tube(f'tine{sx}', [(sx * 0.15, 0.03, HEAD + 0.2), (sx * 0.12, -0.02, HEAD + 0.28)], 0.01, mat('matte', WOOD_D), h, taper=[1.0, 0.3])
    else:
        round_shield(F)
    if animate:
        F.animate(attack='slash')
    return F
