"""The Thornwild Nature Wolf (sheet 16): a big lean timber wolf with a deep chest and a
shaggy ruff, a long snarling snout and amber eyes, long legs with bent hocks and
big paws, a heavy bushy tail; moss, leaves and thorny vines grow over its back
and glowing emerald swirls mark its flanks. Used alone and under a Wolfkeeper."""
import math
from blib import mat, sphere, box, lathe, tube, extrude, torus, sheet, pivot, lump, curve_tube
from common import leaf, leaf_ring, LEATHER, LEATHER_D
from bear import fur
import beasts as BS
import wild as WD

COAT = '#8c8e96'
COAT_D = '#5d5f68'
COAT_L = '#d3cdbf'
MOSS = '#6f9a34'
MOSS_D = '#4c7424'
VINE = '#6a4a28'
EMERALD = '#62ff9e'
AMBER = '#ffb02a'


def nature_wolf(saddle=False):
    L, leg, g = 0.96, 0.44, 0.17
    B = BS.Beast(length=L, leg=leg, girth=g)
    cz = B.cz
    bm, nk, hd, tl = B['barrel'], B['neck'], B['head'], B['tail']
    # ---- body: a deep chest, a tucked waist, lean haunches ----
    fur('chest', g * 1.0, bm, (0, -L * 0.27, cz + g * 0.05), scale=(0.9, 1.1, 1.1), seed=1, color=COAT, rough=0.08)
    fur('waist', g * 0.75, bm, (0, L * 0.02, cz + g * 0.15), scale=(0.85, 1.7, 0.8), seed=2, color=COAT, rough=0.06)
    fur('haunch', g * 0.85, bm, (0, L * 0.3, cz + g * 0.1), scale=(0.9, 1.15, 0.95), seed=3, color=COAT, rough=0.07)
    fur('back', g * 0.55, bm, (0, -L * 0.05, cz + g * 0.6), scale=(0.9, 2.8, 0.45), seed=4, color=COAT_D, rough=0.1)
    fur('belly', g * 0.45, bm, (0, -L * 0.12, cz - g * 0.62), scale=(0.75, 1.9, 0.5), seed=5, color=COAT_L, rough=0.14)
    # ---- neck: a thick shaggy ruff, rising to a head held forward ----
    fur('ruff', g * 0.85, nk, (0, -L * 0.47, cz + g * 0.55), scale=(1.05, 1.0, 1.1), seed=6, color=COAT, rough=0.13)
    fur('ruffThroat', g * 0.62, nk, (0, -L * 0.56, cz + g * 0.2), scale=(0.95, 0.9, 1.1), seed=7, color=COAT_L, rough=0.16)
    hy, hz = -L * 0.78, cz + g * 1.3
    g0 = g
    g = g * 1.3  # a big head
    # The neck: a thick furred column from the chest up to the head.
    curve_tube('neckCore', [(0, -L * 0.36, cz + g0 * 0.4), (0, -L * 0.52, cz + g0 * 0.85), (0, hy + g * 0.25, hz)], g0 * 0.55, mat('matte', COAT), nk, taper=[1.2, 1.0, 0.8])
    fur('skull', g * 0.5, hd, (0, hy, hz + g * 0.08), scale=(1.0, 1.15, 0.9), seed=8, color=COAT, rough=0.06)
    for sx in (-1, 1):
        fur(f'cheek{sx}', g * 0.3, hd, (sx * g * 0.32, hy - g * 0.1, hz - g * 0.05), scale=(0.8, 1.2, 1.0), seed=9 + (sx > 0), color=COAT_L, rough=0.14)
    lathe('snout', [(g * 0.27, 0.0), (g * 0.23, g * 0.3), (g * 0.15, g * 0.62), (g * 0.08, g * 0.8), (0.0, g * 0.84)], mat('matte', COAT_L), hd, at=(0, hy - g * 0.3, hz - g * 0.02), rot=(math.pi / 2 + 0.06, 0, 0), scale=(1.0, 1.0, 0.82), segs=16, sub=1)
    box('snoutTop', (g * 0.2, g * 0.7, g * 0.1), mat('matte', COAT), hd, at=(0, hy - g * 0.62, hz + g * 0.12), rot=(0.12, 0, 0), bevel=0.02, sub=1)
    sphere('nose', g * 0.11, mat('matte', '#16100e'), hd, at=(0, hy - g * 1.12, hz + g * 0.05), scale=(1.2, 1.0, 0.85), sub=1)
    # A snarl: dark lips drawn back, teeth and fangs showing.
    box('lips', (g * 0.36, g * 0.66, g * 0.06), mat('matte', '#2a1c18'), hd, at=(0, hy - g * 0.62, hz - g * 0.2), rot=(0.05, 0, 0), bevel=0.02, sub=1)
    for sx in (-1, 1):
        lathe(f'fang{sx}', [(g * 0.035, 0.0), (0.0, g * 0.16)], mat('matte', '#f4ecd8'), hd, at=(sx * g * 0.11, hy - g * 0.88, hz - g * 0.14), rot=(math.pi, 0, 0), segs=6)
        for i in range(3):
            lathe(f'tooth{sx}{i}', [(g * 0.018, 0.0), (0.0, g * 0.06)], mat('matte', '#efe6d0'), hd, at=(sx * g * 0.15, hy - g * (0.74 - i * 0.12), hz - g * 0.17), rot=(math.pi, 0, 0), segs=5)
        # Tall pointed ears, amber eyes under a frowning brow.
        lathe(f'ear{sx}', [(g * 0.18, 0.0), (g * 0.12, g * 0.22), (0.0, g * 0.46)], mat('matte', COAT_D), hd, at=(sx * g * 0.27, hy + g * 0.15, hz + g * 0.4), rot=(-0.25, sx * 0.3, 0), scale=(1.0, 0.55, 1.0), segs=10, sub=1)
        lathe(f'earIn{sx}', [(g * 0.1, 0.0), (0.0, g * 0.34)], mat('matte', '#4a3a36'), hd, at=(sx * g * 0.27, hy + g * 0.1, hz + g * 0.42), rot=(-0.25, sx * 0.3, 0), scale=(1.0, 0.35, 1.0), segs=8)
        sphere(f'eye{sx}', g * 0.075, mat('glow', AMBER), hd, at=(sx * g * 0.24, hy - g * 0.4, hz + g * 0.2), scale=(1.1, 0.7, 0.75))
        box(f'brow{sx}', (g * 0.24, g * 0.12, g * 0.06), mat('matte', COAT_D), hd, at=(sx * g * 0.22, hy - g * 0.38, hz + g * 0.32), rot=(0.25, 0, -sx * 0.3), bevel=0.02, sub=1)
    g = g0
    # ---- legs: long and lean, bent hocks behind, big paws with dark claws ----
    for k in ('FL', 'FR', 'HL', 'HR'):
        up, lo = B[f'leg.{k}'], B[f'lower.{k}']
        x = (1 if k in ('FL', 'HL') else -1) * g * 0.58
        y = (-1 if k[0] == 'F' else 1) * L * 0.36
        hind = k[0] == 'H'
        if hind:
            fur(f'thigh.{k}', g * 0.55, up, (x, y - 0.02, leg * 0.85), scale=(0.65, 1.1, 1.35), seed=20 + ord(k[1]), color=COAT, rough=0.08)
            curve_tube(f'shank.{k}', [(x, y + 0.0, leg * 0.55), (x, y + 0.06, leg * 0.32), (x, y + 0.05, leg * 0.2), (x, y + 0.0, 0.05)], g * 0.24, mat('matte', COAT), lo, taper=[1.2, 1.0, 0.85, 0.75])
        else:
            fur(f'shoulder.{k}', g * 0.45, up, (x, y + 0.01, leg * 0.85), scale=(0.7, 1.0, 1.45), seed=24 + ord(k[1]), color=COAT, rough=0.08)
            curve_tube(f'foreleg.{k}', [(x, y, leg * 0.6), (x, y - 0.01, leg * 0.3), (x, y - 0.02, 0.05)], g * 0.22, mat('matte', COAT), lo, taper=[1.15, 0.9, 0.8])
            fur(f'feather.{k}', g * 0.2, lo, (x, y + 0.03, leg * 0.35), scale=(0.7, 1.0, 1.6), seed=28 + ord(k[1]), color=COAT_L, rough=0.3)
        lump(f'paw.{k}', g * 0.2, mat('matte', COAT_L), lo, at=(x, y - 0.03, 0.035), scale=(1.0, 1.4, 0.6), seed=30 + ord(k[1]), rough=0.1)
        for i in range(4):
            cx = x + (i - 1.5) * g * 0.09
            lathe(f'claw.{k}{i}', [(g * 0.025, 0.0), (0.0, g * 0.1)], mat('matte', '#2a2420'), lo, at=(cx, y - g * 0.3, 0.02), rot=(math.pi / 2 + 0.4, 0, 0), segs=5)
    # ---- a heavy bushy tail, hanging and curving up at the tip ----
    t0 = (0, L * 0.48, cz + g * 0.35)
    path = [t0, (0, L * 0.65, cz + g * 0.1), (0, L * 0.82, cz - g * 0.5), (0, L * 0.92, cz - g * 1.0)]
    curve_tube('tailCore', path, g * 0.3, mat('matte', COAT), tl, taper=[0.7, 1.1, 1.0, 0.55])
    for i in range(10):
        t = i / 9
        seg = t * 3
        k = min(int(seg), 2)
        f = seg - k
        p = tuple(path[k][j] * (1 - f) + path[k + 1][j] * f for j in range(3))
        fur(f'tail{i}', g * (0.3 + 0.1 * math.sin(t * math.pi)), tl, p, scale=(0.85, 1.0, 1.15), seed=40 + i, color=COAT if i < 8 else COAT_L, rough=0.12)
    # ---- the forest on its back: moss, leaves, thorny vines, emerald swirls ----
    for i in range(6):
        t = i / 5
        lump(f'moss{i}', g * (0.38 - 0.08 * t), mat('matte', MOSS if i % 2 == 0 else MOSS_D), bm, at=(((i % 2) - 0.5) * g * 0.35, -L * 0.36 + t * L * 0.66, cz + g * 0.98 - t * 0.04), scale=(1.5, 1.3, 0.5), seed=50 + i, rough=0.3)
    leaf_ring('ruffLeaves', nk, (0, -L * 0.46, cz + g * 1.05), g * 0.7, 10, 0.07, 0.14, WD.LEAVES, tilt=2.0)
    leaf_ring('backLeaves', bm, (0, -L * 0.05, cz + g * 0.95), g * 0.7, 9, 0.06, 0.12, WD.LEAVES, tilt=1.8)
    for sx in (-1, 1):
        curve_tube(f'vine{sx}', [(sx * g * 0.3, -L * 0.42, cz + g * 0.9), (sx * g * 0.85, -L * 0.25, cz + g * 0.4), (sx * g * 0.95, -L * 0.02, cz + g * 0.0), (sx * g * 0.8, L * 0.22, cz + g * 0.55), (sx * g * 0.3, L * 0.36, cz + g * 0.85)], 0.011, mat('matte', VINE), bm)
        for i in range(5):
            t = 0.15 + i * 0.18
            lathe(f'thorn{sx}{i}', [(0.008, 0.0), (0.0, 0.03)], mat('matte', '#c8b48a'), bm, at=(sx * g * (0.8 + 0.1 * math.sin(t * 6)), -L * 0.3 + t * L * 0.55, cz + g * (0.5 - 0.4 * math.sin(t * 3))), rot=(0, sx * 1.2, 0), segs=4)
        # Emerald swirls on the flanks and shoulders.
        curve_tube(f'swirl{sx}', [(sx * g * 1.0, -L * 0.1, cz - g * 0.1), (sx * g * 1.02, -L * 0.02, cz + g * 0.2), (sx * g * 1.0, L * 0.08, cz + g * 0.05), (sx * g * 0.98, L * 0.04, cz - g * 0.15), (sx * g * 0.99, L * 0.0, cz - g * 0.02)], 0.009, mat('glow', EMERALD), bm, taper=[0.3, 1.0, 1.0, 0.8, 0.3])
        curve_tube(f'swirlShoulder{sx}', [(sx * g * 1.0, -L * 0.32, cz - g * 0.3), (sx * g * 1.05, -L * 0.25, cz + g * 0.0), (sx * g * 1.0, -L * 0.18, cz - g * 0.2)], 0.008, mat('glow', EMERALD), bm, taper=[0.3, 1.0, 0.3])
        curve_tube(f'swirlHaunch{sx}', [(sx * g * 0.9, L * 0.22, cz + g * 0.35), (sx * g * 0.96, L * 0.32, cz + g * 0.1), (sx * g * 0.9, L * 0.4, cz + g * 0.3)], 0.008, mat('glow', EMERALD), bm, taper=[0.3, 1.0, 0.3])
    torus('collar', g * 0.75, 0.016, mat('team'), nk, at=(0, -L * 0.48, cz + g * 0.45), rot=(1.25, 0, 0), segs=18, rsegs=4)
    if saddle:
        lathe('saddleCloth', [(g * 1.05, 0.0), (g * 1.1, g * 0.55)], mat('team'), bm, at=(0, 0.0, cz + g * 0.42), scale=(1, 1.5, 1), segs=18, sub=1)
        box('saddle', (g * 1.0, g * 1.2, 0.045), mat('matte', LEATHER_D), B['saddle'], at=(0, 0.0, cz + g * 1.02), bevel=0.018, sub=1)
        curve_tube('saddleStrap', [(-g * 1.05, 0.0, cz + g * 0.6), (0, 0.0, cz - g * 1.05), (g * 1.05, 0.0, cz + g * 0.6)], 0.01, mat('matte', LEATHER), bm)
    return B


def naturewolf():
    B = nature_wolf()
    B.animate(gait='bound', attack='bite')
    return B
