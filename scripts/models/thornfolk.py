"""Thornwild folk (sheet 03), sharing a deep leaf hood edged with leaves and auburn braids.

Briar Slinger: a lithe young woman in a green leaf hood, a short leafy tunic and leaf-tailed
cape, leather bracers and tall boots, a seed basket at her hip, swinging a vine sling with
a spiked seed pod.
Mender: a healer in a long cream underrobe and an open green over-robe with gold swirls and
wide leaf sleeves, a gold sash belt, and a vine-wrapped staff crowned with a glowing bud."""
import math
from blib import mat, sphere, box, lathe, tube, extrude, torus, sheet, pivot, lump, curve_tube
from figure import Figure, HIP, ANKLE, SHOULDER, ELBOW_DROP, WRIST_DROP, NECK, HEAD
from common import cloth_legs, face, hand_at, arm_x, leaf, leaf_ring, held, GOLD, LEATHER, LEATHER_D
import sylvan as SY
import wild as WD

GREEN = '#6f8f2e'
GREEN_D = '#4f6b22'
AUBURN = '#b5562a'
SKIN = '#eab58a'


def leaf_hood(F, color=GREEN, hair=AUBURN, point=0.12):
    """A deep pointed hood with leaves around its rim, braids falling out of it."""
    h = F['head']
    hm = mat('matte', color)
    lathe('hood', [(0.0, -0.09), (0.112, -0.085), (0.12, -0.02), (0.115, 0.05), (0.082, 0.11), (0.0, 0.13)], hm, h,
          at=(0, 0.014, HEAD), scale=(1.05, 1.1, 1.05), segs=22, sub=1, angle=math.pi * 1.5, rot=(0, 0, -math.pi * 0.25))
    lathe('hoodPoint', [(0.055, 0.0), (0.032, 0.07), (0.0, point)], hm, h, at=(0, 0.07, HEAD + 0.08), rot=(1.05, 0, 0), segs=12, sub=1)
    for i in range(5):
        a = math.pi * 0.5 + (i / 4 - 0.5) * 1.6  # leaves on the back of the hood
        leaf(f'hoodLeaf{i}', h, (math.cos(a) * 0.1, math.sin(a) * 0.12 + 0.02, HEAD + 0.06 - abs(i - 2) * 0.02), 0.04, 0.07, WD.LEAVES[i % 3], rot=(-0.5, 0, a - math.pi / 2))
    for sx in (-1, 1):
        curve_tube(f'braid{sx}', [(sx * 0.075, -0.04, HEAD - 0.03), (sx * 0.095, -0.06, HEAD - 0.12), (sx * 0.09, -0.08, HEAD - 0.24)], 0.022, mat('matte', hair), h, taper=[1.0, 0.9, 0.55])
        for k in range(3):
            torus(f'braidTie{sx}{k}', 0.017 - k * 0.002, 0.006, mat('matte', '#5a7a26'), h, at=(sx * (0.08 + k * 0.006), -0.05 - k * 0.01, HEAD - 0.08 - k * 0.06), segs=8, rsegs=3)


def slinger():
    F = Figure(bulk=0.98)
    b = F.bulk
    green, green_d = mat('matte', GREEN), mat('matte', GREEN_D)
    hips, spine, ch = F['hips'], F['spine'], F['chest']
    cloth_legs(F, pants='#6a4a2c', boots=LEATHER_D)
    for s, sx in (('R', -1), ('L', 1)):
        x = 0.075 * b * sx
        sh = F[f'shin.{s}']
        lathe(f'boot.{s}', [(0.0, 0.0), (0.05, 0.0), (0.048, 0.1), (0.054, 0.17), (0.0, 0.17)], mat('matte', LEATHER), sh, at=(x, -0.004, ANKLE - 0.02), segs=12, sub=1)
        lathe(f'bootCuff.{s}', [(0.054, 0.0), (0.066, 0.02), (0.062, 0.05)], mat('matte', LEATHER_D), sh, at=(x, -0.004, ANKLE + 0.14), segs=12, sub=1)
        for k in range(2):
            torus(f'bootWrap.{s}{k}', 0.052, 0.006, mat('matte', '#5a7a26'), sh, at=(x, -0.004, ANKLE + 0.04 + k * 0.05), segs=10, rsegs=3)
    # Leafy tunic, a short skirt of leaves, a belt with a round buckle, crossed straps.
    lathe('tunic', [(0.0, 0.0), (0.11 * b, 0.0), (0.12 * b, 0.07), (0.13 * b, 0.15), (0.12 * b, 0.21), (0.07, 0.245), (0.0, 0.25)], green, ch, at=(0, 0, 0.5), scale=(1, 0.8, 1), segs=16, sub=1)
    leaf_ring('tunicLeaves', ch, (0, 0, 0.66), 0.12 * b, 10, 0.05, 0.09, WD.LEAVES, tilt=2.4)
    leaf_ring('skirtLeaves', hips, (0, 0, HIP + 0.02), 0.13 * b, 14, 0.06, 0.15, [GREEN, GREEN_D, '#8fae3a'], tilt=2.7)
    torus('belt', 0.12 * b, 0.016, mat('matte', LEATHER_D), spine, at=(0, 0, 0.5), scale=(1, 0.84, 1), segs=18, rsegs=5)
    torus('buckle', 0.02, 0.006, mat('gold', GOLD), spine, at=(0, -0.104 * b, 0.5), rot=(math.pi / 2, 0, 0), segs=12, rsegs=3)
    box('strap', (0.022, 0.012, 0.3), mat('matte', LEATHER_D), ch, at=(0, -0.118 * b, 0.62), rot=(0, 0.6, 0))
    box('sash', (0.04, 0.012, 0.22), mat('team'), ch, at=(0.0, -0.122 * b, 0.6), rot=(0, -0.6, 0))
    # Seed basket at the left hip.
    basket = (0.14 * b, -0.04, 0.42)
    lathe('basket', [(0.0, 0.0), (0.05, 0.0), (0.065, 0.06), (0.06, 0.07), (0.0, 0.02)], mat('matte', '#b08a52'), spine, at=basket, segs=12, sub=1)
    for i in range(4):
        lump(f'seed{i}', 0.022, mat('matte', '#8a5a2c'), spine, at=(basket[0] - 0.025 + i * 0.016, basket[1] + (i % 2) * 0.015, basket[2] + 0.065), seed=40 + i, rough=0.15)
    # Arms: bare shoulders under leaf pauldrons, leather bracers, gloves.
    for s in 'RL':
        x = arm_x(F, s)
        ua, fa, hd = F[f'upperarm.{s}'], F[f'forearm.{s}'], F[f'hand.{s}']
        tube(f'arm.{s}', 0.04 * b, 0.036 * b, ELBOW_DROP, mat('matte', SKIN), ua, at=(x, 0, SHOULDER - ELBOW_DROP), segs=10, sub=1)
        leaf_ring(f'pauldron.{s}', ua, (x, 0, SHOULDER - 0.01), 0.045, 4, 0.05, 0.08, WD.LEAVES, tilt=2.2)
        tube(f'fore.{s}', 0.036 * b, 0.032 * b, WRIST_DROP - ELBOW_DROP, mat('matte', SKIN), fa, at=(x * 1.05, -0.005, SHOULDER - WRIST_DROP), segs=10, sub=1)
        lathe(f'bracer.{s}', [(0.038, 0.0), (0.044, 0.04), (0.042, 0.1), (0.036, 0.11)], mat('matte', LEATHER), fa, at=(x * 1.05, -0.005, SHOULDER - WRIST_DROP + 0.005), segs=12, sub=1)
        hx, hy, hz = hand_at(F, s)
        sphere(f'glove.{s}', 0.036, mat('matte', LEATHER_D), hd, at=(hx, hy, hz), scale=(0.9, 1.0, 1.15), sub=1)
    face(F, hair=AUBURN, brows='#8a3a1a', size=1.02)
    leaf_hood(F, point=0.14)
    SY.leaf_cloak(F, length=0.32, flare=0.05, rows=2, seed=17)
    # The sling: a vine cord from the hand and a spiked seed pod in its cradle.
    hd, (hx, hy, hz) = held(F, 'R')
    sl = pivot('sling', hd, (hx, hy, hz))
    curve_tube('slingCord', [(hx, hy, hz), (hx + 0.01, hy - 0.03, hz - 0.1), (hx, hy - 0.05, hz - 0.19), (hx - 0.01, hy - 0.03, hz - 0.25)], 0.006, mat('matte', '#5a7a26'), sl)
    for i in range(3):
        leaf(f'slingLeaf{i}', sl, (hx, hy - 0.02 - i * 0.012, hz - 0.05 - i * 0.06), 0.022, 0.04, WD.LEAVES[i], rot=(0.4, 0, i * 2.0))
    lathe('slingCradle', [(0.0, 0.0), (0.035, 0.01), (0.04, 0.03)], mat('matte', LEATHER), sl, at=(hx - 0.01, hy - 0.03, hz - 0.29), segs=10, sub=1)
    lump('seedPod', 0.032, mat('matte', '#8a5a2c'), sl, at=(hx - 0.01, hy - 0.03, hz - 0.265), scale=(1, 1, 1.25), seed=9, rough=0.15)
    for i in range(6):
        a = i * math.pi / 3
        lathe(f'podSpike{i}', [(0.006, 0.0), (0.0, 0.02)], mat('matte', '#5a3a1c'), sl, at=(hx - 0.01 + math.cos(a) * 0.03, hy - 0.03 + math.sin(a) * 0.03, hz - 0.265), rot=(math.sin(a) * -1.57, math.cos(a) * 1.57, 0), segs=5)
    F.p['sling'] = sl
    F.animate(attack='throw')
    return F


def mender():
    F = Figure(bulk=1.0)
    b = F.bulk
    green, green_d, cream, gold = mat('matte', GREEN), mat('matte', GREEN_D), mat('matte', '#efe4c8'), mat('gold', GOLD)
    hips, spine, ch = F['hips'], F['spine'], F['chest']
    cloth_legs(F, pants='#d8ccb0', boots=LEATHER_D)
    # Cream underrobe to the ground, a green open over-robe with gold swirls and hem.
    lathe('robeTop', [(0.0, 0.0), (0.11 * b, 0.0), (0.125 * b, 0.08), (0.135 * b, 0.16), (0.125 * b, 0.21), (0.07, 0.245), (0.0, 0.25)], cream, ch, at=(0, 0, 0.5), scale=(1, 0.82, 1), segs=18, sub=1)
    lathe('underrobe', [(0.26 * b, 0.0), (0.21 * b, 0.2), (0.15 * b, 0.4), (0.125 * b, 0.46)], cream, hips, at=(0, 0.0, 0.03), scale=(1, 0.88, 1), segs=26, sub=1)
    gap = 0.45 * math.pi
    kw = dict(angle=2 * math.pi - gap, rot=(0, 0, -math.pi / 2 + gap / 2))
    lathe('overrobe', [(0.285 * b, 0.0), (0.23 * b, 0.2), (0.16 * b, 0.42), (0.13 * b, 0.48)], green, hips, at=(0, 0.01, 0.06), scale=(1, 0.9, 1), segs=26, sub=1, **kw)
    lathe('overrobeHem', [(0.287 * b, 0.0), (0.283 * b, 0.035)], gold, hips, at=(0, 0.01, 0.058), scale=(1, 0.9, 1), segs=26, **kw)
    for sgn in (-1, 1):
        a = -math.pi / 2 + sgn * gap / 2
        curve_tube(f'robeEdge{sgn}', [(math.cos(a) * 0.16 * b, math.sin(a) * 0.16 * b * 0.9, 0.48), (math.cos(a) * 0.23 * b, math.sin(a) * 0.23 * b * 0.9, 0.26), (math.cos(a) * 0.285 * b, math.sin(a) * 0.285 * b * 0.9, 0.07)], 0.011, gold, hips)
        # A gold swirl on each side of the over-robe.
        sx = sgn
        pts = [(sx * (0.13 + (0.012 + t * 0.006) * math.cos(t)) * b, -0.2 * b, 0.2 + (0.012 + t * 0.006) * math.sin(t)) for t in [i * 0.7 for i in range(10)]]
        curve_tube(f'swirl{sgn}', pts, 0.006, gold, hips)
    lathe('overTop', [(0.118 * b, 0.0), (0.13 * b, 0.08), (0.14 * b, 0.16), (0.12 * b, 0.21)], green, ch, at=(0, 0.0, 0.52), scale=(1, 0.84, 1), segs=18, sub=1, angle=math.pi * 1.4, rot=(0, 0, math.pi * 0.8))
    # A gold sash belt with a diamond clasp, a team sash over the shoulder.
    torus('belt', 0.125 * b, 0.022, gold, spine, at=(0, 0, 0.5), scale=(1, 0.86, 1.2), segs=20, rsegs=5)
    extrude('clasp', [(-0.035, 0.0), (0.0, -0.035), (0.035, 0.0), (0.0, 0.035)], 0.012, gold, spine, at=(0, -0.11 * b, 0.5), rot=(math.pi / 2, 0, 0), bevel=0.003)
    sphere('claspGem', 0.012, mat('glow', '#a8ff6a'), spine, at=(0, -0.125 * b, 0.5))
    box('sash', (0.045, 0.012, 0.3), mat('team'), ch, at=(0.02, -0.12 * b, 0.62), rot=(0, 0.55, 0))
    # Wide green leaf sleeves with gold cuffs.
    for s in 'RL':
        x = arm_x(F, s)
        ua, fa, hd = F[f'upperarm.{s}'], F[f'forearm.{s}'], F[f'hand.{s}']
        sphere(f'shoulder.{s}', 0.052 * b, green, ua, at=(x, 0, SHOULDER - 0.005), sub=1)
        tube(f'sleeve.{s}', 0.046 * b, 0.044 * b, ELBOW_DROP, green, ua, at=(x, 0, SHOULDER - ELBOW_DROP), segs=12, sub=1)
        lathe(f'bell.{s}', [(0.045 * b, 0.13), (0.07 * b, 0.05), (0.095 * b, -0.03)], green, fa, at=(x * 1.05, -0.005, SHOULDER - WRIST_DROP + 0.02), segs=16, sub=1)
        torus(f'cuff.{s}', 0.095 * b, 0.008, gold, fa, at=(x * 1.05, -0.005, SHOULDER - WRIST_DROP - 0.01), segs=16, rsegs=4)
        hx, hy, hz = hand_at(F, s)
        sphere(f'hand.{s}', 0.034, mat('matte', SKIN), hd, at=(hx, hy, hz), scale=(0.9, 1.0, 1.15), sub=1)
    face(F, hair=AUBURN, brows='#8a3a1a', size=1.02)
    leaf_hood(F, point=0.1)
    WD.leaf_mantle(F, 0.7)
    sheet('cape', 0.28 * b, 0.62, green_d, ch, at=(0, 0.1 * b, NECK - 0.05), bend=0.08, flare=0.45, cols=8, rows=10, thick=0.012, ragged=0.04, seed=23)
    # The staff: vine-wrapped wood, leaves, and a glowing bud cupped in petals.
    hd = F['hand.R']
    hx, hy, hz = hand_at(F, 'R')
    w = pivot('weapon', hd, (hx, hy, hz))
    w.rotation_euler = (0.2, 0, 0)
    F.p['weapon'] = w
    curve_tube('staff', [(hx, hy, hz - 0.45), (hx + 0.01, hy, hz), (hx - 0.012, hy, hz + 0.4), (hx, hy, hz + 0.66)], 0.018, mat('matte', '#7a5230'), w, taper=[0.8, 1.0, 1.0, 1.1])
    pts = [(hx + 0.024 * math.cos(i * 1.3), hy + 0.024 * math.sin(i * 1.3), hz - 0.3 + i * 0.05) for i in range(19)]
    curve_tube('staffVine', pts, 0.007, mat('matte', '#5a7a26'), w)
    for i in range(5):
        leaf(f'staffLeaf{i}', w, (hx, hy, hz + 0.1 + i * 0.12), 0.035, 0.07, WD.LEAVES[i % 3], rot=(0.5, 0, i * 2.3))
    top = (hx, hy, hz + 0.72)
    for i in range(5):
        a = 2 * math.pi * i / 5
        leaf(f'petal{i}', w, (hx + math.cos(a) * 0.045, hy + math.sin(a) * 0.045, top[2] - 0.02), 0.06, 0.13, '#b8dc5c', rot=(0.5, 0, a - math.pi / 2))
    lathe('bud', [(0.0, 0.0), (0.05, 0.045), (0.045, 0.1), (0.0, 0.16)], mat('glow', '#ffd25a'), w, at=(top[0], top[1], top[2] - 0.03), segs=10, sub=1)
    F.animate(attack=None, cast=True)
    SY.spear_thrust(F)
    return F
