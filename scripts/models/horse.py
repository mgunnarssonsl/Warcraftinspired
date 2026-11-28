"""A heavy warhorse (sheet 02): a deep chest and round rump, an arched neck with a long
dark mane, a long head with flared nostrils, sturdy legs with white feathered fetlocks
and dark hooves, a long flowing tail; optionally barded in steel and a team caparison
with gold crowns (the Lancer's destrier)."""
import math
from blib import mat, sphere, box, lathe, tube, extrude, torus, sheet, pivot, lump, curve_tube
from common import crown_outline, GOLD, LEATHER, LEATHER_D
import beasts as BS

STEEL = '#a7b0bc'
TRIM = '#e8b84c'


def smooth(name, r, parent, at, color, scale=(1, 1, 1), seed=1):
    return lump(name, r, mat('matte', color), parent, at=at, scale=scale, seed=seed, rough=0.03, segs=22, rings=16, sub=1)


def horse(coat='#6e4128', mane='#2e1d14', feather='#efe6d6', hoof='#2a2420', barded=True):
    L, leg, g = 0.92, 0.44, 0.19
    B = BS.Beast(length=L, leg=leg, girth=g)
    cz = B.cz
    bm, nk, hd, tl = B['barrel'], B['neck'], B['head'], B['tail']
    steel, trim, team = mat('metal', STEEL), mat('gold', TRIM), mat('team')
    # Body.
    smooth('chest', g * 1.08, bm, (0, -L * 0.3, cz + g * 0.05), coat, scale=(0.95, 1.0, 1.08), seed=1)
    smooth('barrel', g * 1.0, bm, (0, 0.0, cz), coat, scale=(0.95, 1.9, 0.98), seed=2)
    smooth('rump', g * 1.06, bm, (0, L * 0.32, cz + g * 0.08), coat, scale=(1.0, 1.05, 1.02), seed=3)
    # An arched neck, crested with a long mane; a long head with a broad muzzle.
    curve_tube('neck', [(0, -L * 0.34, cz + g * 0.4), (0, -L * 0.48, cz + g * 1.1), (0, -L * 0.56, cz + g * 1.65)], g * 0.62, mat('matte', coat), nk, taper=[1.2, 0.95, 0.75])
    for i in range(7):
        t = i / 6
        lump(f'mane{i}', g * 0.24, mat('matte', mane), nk, at=(0.03 * (1 if i % 2 else -1), -L * 0.33 - t * L * 0.22 + 0.06, cz + g * (0.75 + t * 1.0)), scale=(0.7, 1.1, 1.6), seed=10 + i, rough=0.2)
    hy, hz = -L * 0.62, cz + g * 1.75
    smooth('skull', g * 0.42, hd, (0, hy, hz), coat, scale=(0.9, 1.2, 1.0), seed=4)
    lathe('face', [(g * 0.34, 0.0), (g * 0.3, g * 0.35), (g * 0.27, g * 0.65), (g * 0.25, g * 0.8), (0.0, g * 0.86)], mat('matte', coat), hd, at=(0, hy - g * 0.25, hz - g * 0.05), rot=(math.pi / 2 + 0.55, 0, 0), scale=(0.85, 1.0, 1.0), segs=16, sub=1)
    smooth('muzzle', g * 0.28, hd, (0, hy - g * 0.78, hz - g * 0.52), '#4a2c1c', scale=(0.95, 1.1, 0.9), seed=5)
    for sx in (-1, 1):
        sphere(f'nostril{sx}', g * 0.05, mat('matte', '#140c08'), hd, at=(sx * g * 0.1, hy - g * 0.98, hz - g * 0.5), scale=(1, 0.6, 1.2))
        sphere(f'eye{sx}', g * 0.06, mat('matte', '#140c08'), hd, at=(sx * g * 0.27, hy - g * 0.15, hz + g * 0.05))
        lathe(f'ear{sx}', [(g * 0.09, 0.0), (g * 0.06, g * 0.18), (0.0, g * 0.3)], mat('matte', coat), hd, at=(sx * g * 0.15, hy + g * 0.2, hz + g * 0.32), rot=(-0.2, sx * 0.2, 0), scale=(1, 0.6, 1), segs=8, sub=1)
    lump('forelock', g * 0.18, mat('matte', mane), hd, at=(0, hy - g * 0.05, hz + g * 0.35), scale=(0.8, 1.2, 0.8), seed=20, rough=0.2)
    # Legs: forearm/gaskin, cannon, white feathered fetlocks, dark hooves.
    for k in ('FL', 'FR', 'HL', 'HR'):
        up, lo = B[f'leg.{k}'], B[f'lower.{k}']
        x = (1 if k in ('FL', 'HL') else -1) * g * 0.55
        y = (-1 if k[0] == 'F' else 1) * L * 0.36
        hind = k[0] == 'H'
        smooth(f'upper.{k}', g * (0.5 if hind else 0.44), up, (x, y + (0.02 if hind else 0), leg * 0.82), coat, scale=(0.7, 1.0, 1.5), seed=30 + ord(k[1]))
        curve_tube(f'cannon.{k}', [(x, y, leg * 0.55), (x, y + (0.03 if hind else 0.0), leg * 0.3), (x, y, 0.08)], g * 0.2, mat('matte', coat), lo, taper=[1.35, 1.0, 1.05])
        lump(f'feather.{k}', g * 0.27, mat('matte', feather), lo, at=(x, y + 0.01, 0.075), scale=(1.15, 1.25, 1.1), seed=40 + ord(k[1]), rough=0.28)
        lathe(f'hoof.{k}', [(0.0, 0.0), (g * 0.2, 0.0), (g * 0.17, 0.05), (0.0, 0.05)], mat('matte', hoof), lo, at=(x, y - 0.01, 0.0), segs=12)
    # A long flowing tail.
    t0 = (0, L * 0.5, cz + g * 0.45)
    curve_tube('tailRoot', [t0, (0, L * 0.6, cz + g * 0.3), (0, L * 0.66, cz - g * 0.2)], g * 0.16, mat('matte', mane), tl, taper=[1.0, 0.9, 0.8])
    for i in range(5):
        a = (i - 2) * 0.06
        curve_tube(f'tail{i}', [(a * 0.3, L * 0.62, cz + g * 0.1), (a, L * 0.72, cz - g * 0.6), (a * 1.6, L * 0.76, cz - g * 1.3)], g * 0.12, mat('matte', mane), tl, taper=[1.0, 0.8, 0.3])
    if barded:
        # Chanfron over the face, crinet lames down the neck, a peytral over the chest.
        box('chanfron', (g * 0.42, g * 0.08, g * 0.85), steel, hd, at=(0, hy - g * 0.45, hz - g * 0.12), rot=(0.62, 0, 0), bevel=0.02, sub=1)
        box('chanfronTrim', (g * 0.46, g * 0.05, g * 0.06), trim, hd, at=(0, hy - g * 0.1, hz + g * 0.25), rot=(0.62, 0, 0), bevel=0.01)
        lathe('chanfronSpike', [(g * 0.05, 0.0), (0.0, g * 0.2)], trim, hd, at=(0, hy - g * 0.2, hz + g * 0.28), rot=(-0.6, 0, 0), segs=8)
        for i in range(4):
            t = i / 3
            P = pivot(f'crinetP{i}', nk, (0, -L * 0.37 - t * L * 0.17, cz + g * (0.75 + t * 0.85)))
            lathe(f'crinet{i}', [(g * 0.55, -0.04), (g * 0.57, 0.0), (g * 0.55, 0.04)], steel, P, at=(0, -L * 0.37 - t * L * 0.17, cz + g * (0.75 + t * 0.85)), rot=(math.pi / 2, 0, 0), segs=18, angle=math.pi * 0.9, sub=1)
            P.rotation_euler = (0.9 - 0.25 * t, -math.pi * 0.05, 0)
        lathe('peytral', [(g * 0.9, 0.0), (g * 1.0, g * 0.3), (g * 0.98, g * 0.6), (g * 0.85, g * 0.8)], steel, bm, at=(0, -L * 0.32, cz - g * 0.55), scale=(1.0, 0.55, 1.0), segs=20, sub=1, angle=math.pi * 0.95, rot=(0, 0, math.pi * 1.025))
        torus('peytralTrim', g * 0.9, 0.012, trim, bm, at=(0, -L * 0.32, cz - g * 0.55), scale=(1.0, 0.55, 1.0), segs=22, rsegs=4)
        # The team caparison: a skirt from the back to the knees, gold-hemmed, crowns on the flanks.
        lathe('caparison', [(g * 1.14, 0.0), (g * 1.16, g * 0.8), (g * 1.08, g * 1.35), (g * 0.85, g * 1.65)], team, bm, at=(0, L * 0.02, cz - g * 1.22), scale=(1.0, L / (2 * g) * 0.82, 1.0), segs=26, sub=1)
        lathe('caparisonHem', [(g * 1.15, 0.0), (g * 1.16, g * 0.05)], trim, bm, at=(0, L * 0.02, cz - g * 1.23), scale=(1.0, L / (2 * g) * 0.82, 1.0), segs=26)
        for sx in (-1, 1):
            for yy in (-0.25, 0.25):
                extrude(f'capCrown{sx}{yy}', crown_outline(0.09, 0.065), 0.01, trim, bm, at=(sx * g * 1.19, L * yy, cz - g * 0.75), rot=(0, 0, sx * math.pi / 2), bevel=0.002)
        # Saddle.
        sd = B['saddle']
        box('saddleSeat', (g * 1.0, g * 1.2, 0.05), mat('matte', LEATHER_D), sd, at=(0, 0.02, cz + g * 1.0), bevel=0.02, sub=1)
        box('saddleCantle', (g * 0.9, 0.04, 0.1), mat('matte', LEATHER_D), sd, at=(0, 0.02 + g * 0.58, cz + g * 1.05), rot=(-0.2, 0, 0), bevel=0.015, sub=1)
        box('saddlePommel', (g * 0.5, 0.04, 0.08), mat('matte', LEATHER_D), sd, at=(0, 0.02 - g * 0.55, cz + g * 1.04), rot=(0.25, 0, 0), bevel=0.015, sub=1)
    return B
