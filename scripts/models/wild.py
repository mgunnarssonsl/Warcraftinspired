"""Thornwild unit models (sheets 01, 03): bark, leaf and amber, with the team colour on sashes and shields."""
import math
from blib import mat, sphere, box, lathe, tube, extrude, torus, sheet, pivot, lump, curve_tube
from figure import Figure, HIP, KNEE, ANKLE, SHOULDER, SH_X, ELBOW_DROP, WRIST_DROP, NECK, HEAD
from common import (cloth_legs, torso, cloth_arms, face, cape, leaf, leaf_ring, round_shield, staff, make_bow, quiver,
                    hand_at, arm_x, held, GOLD, LEATHER, LEATHER_D)
import beasts as BS

BARK = '#a0703f'
BARK_D = '#74502c'
BARK_L = '#c08a52'
LEAF = '#8fc244'
LEAF_D = '#62962e'
LEAF_L = '#b8dc5c'
AMBER = '#ffb43a'
BONE = '#ece0c2'
CREAM = '#efe4c8'
AUBURN = '#b5562a'
SKIN = '#eab58a'
LEAVES = [LEAF, LEAF_D, LEAF_L]


def leaf_hood(F, color=LEAF, tall=0.08):
    h = F['head']
    lathe('hood', [(0.0, -0.075), (0.098, -0.07), (0.106, -0.02), (0.101, 0.05), (0.07, 0.095), (0.0, 0.11)], mat('matte', color), h,
          at=(0, 0.012, HEAD), scale=(1, 1.08, 1), segs=18, sub=1, angle=math.pi * 1.55, rot=(0, 0, -math.pi * 0.275))
    lathe('hoodTip', [(0.045, 0.0), (0.03, tall * 0.6), (0.0, tall + 0.04)], mat('matte', color), h, at=(0, 0.07, HEAD + 0.07), rot=(0.9, 0, 0), segs=10, sub=1)
    for i, a in enumerate((-0.9, -0.3, 0.3, 0.9)):
        leaf(f'hoodLeaf{i}', h, (math.sin(a) * 0.1, 0.02 - math.cos(a) * 0.05, HEAD + 0.08), 0.05, 0.08, LEAVES[i % 3], rot=(0.3, -a * 0.4, a))


def leaf_mantle(F, size=1.0, colors=LEAVES):
    leaf_ring('mantle', F['chest'], (0, 0, NECK - 0.02), 0.1 * F.bulk, 11, 0.1 * size, 0.16 * size, colors, tilt=1.9, z_jitter=0.01)


def sash(F, w=0.07):
    box('sash', (w, 0.012, 0.36), mat('team'), F['chest'], at=(0.02, -0.12 * F.bulk, 0.6), rot=(0, 0, 0.55))
    box('sashBack', (w, 0.012, 0.36), mat('team'), F['chest'], at=(0.02, 0.12 * F.bulk, 0.6), rot=(0, 0, -0.55))


def braid(F, color=AUBURN):
    h = F['head']
    path = [(0.07, 0.06, HEAD + 0.02), (0.085, 0.08, HEAD - 0.06), (0.08, 0.07, HEAD - 0.14), (0.07, 0.06, HEAD - 0.2)]
    curve_tube('braid', path, 0.022, mat('matte', color), h, taper=[1.0, 0.9, 0.8, 0.6])
    sphere('braidTie', 0.018, mat('matte', LEAF_D), h, at=(0.07, 0.06, HEAD - 0.2))


def leaf_skirt(F, size=1.0):
    leaf_ring('skirt', F['hips'], (0, 0, HIP + 0.02), 0.12 * F.bulk, 12, 0.08 * size, 0.18 * size, LEAVES, tilt=2.6)


def bark_plates(F, seed=1):
    ch = F['chest']
    lump('barkChest', 0.17 * F.bulk, mat('matte', BARK), ch, at=(0, -0.01, 0.63), scale=(1.05, 0.85, 1.05), seed=seed, rough=0.12)
    for i in range(5):
        a = -0.8 + i * 0.4
        box(f'barkRidge{i}', (0.025, 0.02, 0.2), mat('matte', BARK_D), ch, at=(math.sin(a) * 0.14 * F.bulk, -math.cos(a) * 0.13 * F.bulk, 0.62), rot=(0, 0, a), bevel=0.008, sub=1)
    sphere('heartAmber', 0.03, mat('glow', AMBER), ch, at=(0, -0.155 * F.bulk, 0.66), sub=1)


def wood_shield(F, r=0.17, s='L'):
    fa = F[f'forearm.{s}']
    sx = arm_x(F, s) * 1.05 + (0.04 if s == 'L' else -0.04)
    sz = SHOULDER - WRIST_DROP + 0.07
    yaw = -0.55
    c, sn = math.cos(yaw), math.sin(yaw)
    def on(dy):
        return (sx - dy * sn, -0.07 + dy * c, sz)
    lathe('shieldWood', [(0.0, 0.0), (r, 0.0), (r * 0.97, 0.03), (0.0, 0.045)], mat('matte', BARK_L), fa, at=on(0.0), rot=(math.pi / 2, 0, yaw), segs=20)
    torus('shieldRim', r, 0.018, mat('matte', BARK_D), fa, at=on(-0.005), rot=(math.pi / 2, 0, yaw), segs=24, rsegs=5)
    lathe('shieldTeam', [(0.0, 0.0), (r * 0.5, 0.0), (r * 0.48, 0.01), (0.0, 0.015)], mat('team'), fa, at=on(-0.05), rot=(math.pi / 2, 0, yaw), segs=16)
    sphere('shieldAmber', 0.03, mat('glow', AMBER), fa, at=on(-0.065), sub=1)
    for i in range(6):
        a = 2 * math.pi * i / 6
        px, pz = math.cos(a) * r * 0.95, math.sin(a) * r * 0.95
        base = on(-0.01)
        lathe(f'thorn{i}', [(0.018, 0.0), (0.01, 0.04), (0.0, 0.07)], mat('matte', BONE), fa, at=(base[0] + px * c, base[1] + px * sn, sz + pz), rot=(0, a + math.pi / 2, yaw) if False else (math.pi / 2, 0, yaw), segs=6)


def spiked_club(F, length=0.45):
    hd, (hx, hy, hz) = held(F, 'R')
    tilt = 0.55
    def along(d):
        return (hx, hy - math.cos(tilt) * d, hz + math.sin(tilt) * d)
    tube('clubHaft', 0.022, 0.03, length, mat('matte', BARK_D), hd, at=along(-0.08), rot=(-(math.pi / 2 - tilt), 0, 0), segs=8)
    head = along(length * 0.85)
    lump('clubHead', 0.075, mat('matte', BARK_L), hd, at=head, seed=7, rough=0.15)
    for i in range(7):
        a = 2 * math.pi * i / 7
        lathe(f'spike{i}', [(0.016, 0.0), (0.008, 0.04), (0.0, 0.07)], mat('matte', BONE), hd, at=(head[0] + math.cos(a) * 0.065, head[1], head[2] + math.sin(a) * 0.065), rot=(0, a - math.pi / 2, 0) if False else (0, -a + math.pi / 2, 0), segs=5)
    for i in range(3):
        leaf(f'clubLeaf{i}', hd, along(0.05 + i * 0.03), 0.04, 0.07, LEAVES[i], rot=(0.4, 0, i * 2.1))


def heart_staff(F, length=0.95, glow='#a8ff6a'):
    hd, top = staff(F, length, wood=BARK_D)
    for i in range(5):
        a = 2 * math.pi * i / 5
        leaf(f'staffLeaf{i}', hd, (top[0] + math.cos(a) * 0.02, top[1] + math.sin(a) * 0.02, top[2] - 0.02), 0.05, 0.09, LEAVES[i % 3], rot=(0.5, 0, a))
    sphere('staffBud', 0.04, mat('glow', glow), hd, at=(top[0], top[1], top[2] + 0.06), sub=1)
    return hd, top


def tender():
    F = Figure(bulk=1.12)
    cloth_legs(F, pants='#6a5a3a', boots=LEATHER, wraps=LEAF_D)
    torso(F, CREAM, belt=LEATHER, buckle=GOLD)
    sheet('vest', 0.2, 0.26, mat('matte', LEAF), F['chest'], at=(0, -0.118, 0.7), bend=0.03, flare=0.3, cols=6, rows=6, thick=0.008, ragged=0.03, seed=2)
    sash(F)
    leaf_skirt(F, 0.9)
    cloth_arms(F, CREAM, rolled=True)
    face(F, hair=AUBURN, brows='#8a3a1a')
    leaf_hood(F)
    braid(F)
    # Tools like a Laborer's, in living wood.
    from crown import laborer  # noqa: F401  (same named pivots: pick, axe, hammer, sack, log0-2)
    hd, (hx, hy, hz) = held(F, 'R')
    tilt = 0.4
    def along(d):
        return (hx, hy - math.cos(tilt) * d, hz + math.sin(tilt) * d)
    tube('handle', 0.015, 0.015, 0.42, mat('matte', BARK_L), hd, at=along(-0.08), rot=(-(math.pi / 2 - tilt), 0, 0), segs=8)
    leaf('handleLeaf', hd, along(0.05), 0.04, 0.07, LEAF, rot=(0.4, 0, 0.5))
    tip = along(0.32)
    pk = pivot('pick', hd, tip)
    lathe('pickHead', [(0.0, -0.15), (0.02, -0.11), (0.028, 0.0), (0.02, 0.11), (0.0, 0.15)], mat('metal', '#a7a39a'), pk, at=tip, rot=(0, math.pi / 2, 0), segs=6, sub=1)
    ax = pivot('axe', hd, tip)
    extrude('axeHead', [(0, -0.03), (0.11, -0.07), (0.13, 0.0), (0.11, 0.07), (0, 0.03)], 0.02, mat('metal', '#b8b4aa'), ax, at=(tip[0] - 0.01, tip[1], tip[2]), rot=(0, 0, math.pi / 2), bevel=0.005)
    hm = pivot('hammer', hd, tip)
    lump('hammerHead', 0.06, mat('matte', BARK_L), hm, at=tip, scale=(1, 1.6, 1), seed=3, rough=0.1)
    sk = pivot('sack', F['chest'], (0, 0.16, 0.56))
    lathe('basket', [(0.07, 0.0), (0.11, 0.06), (0.115, 0.14), (0.12, 0.15)], mat('matte', '#c49a5a'), sk, at=(0, 0.18, 0.46), segs=14, sub=1)
    for i in range(4):
        sphere(f'nugget{i}', 0.028, mat('gold', '#ffd34a'), sk, at=(-0.04 + i * 0.027, 0.17 + (i % 2) * 0.03, 0.61))
    for i in range(3):
        lg = pivot(f'log{i}', F['chest'], (0, 0.18, 0.55 + i * 0.08))
        tube(f'logBody{i}', 0.042, 0.042, 0.36, mat('matte', '#8a5a32' if i % 2 else '#a26e3c'), lg, at=(-0.18, 0.18, 0.55 + i * 0.075), rot=(0, math.pi / 2, 0), segs=10)
        leaf(f'logLeaf{i}', lg, (0.18, 0.18, 0.57 + i * 0.075), 0.04, 0.07, LEAF, rot=(0, 1.2, 0))
    F.animate(attack='slash', work=True)
    return F


def thornguard():
    F = Figure(bulk=1.32)
    cloth_legs(F, pants=BARK_D, boots=BARK_D, wraps=BARK)
    for s, sx in (('R', -1), ('L', 1)):
        x = 0.075 * F.bulk * sx
        lump(f'kneeBark.{s}', 0.05, mat('matte', BARK), F[f'shin.{s}'], at=(x, -0.025, KNEE), seed=11 + sx, rough=0.15)
    torso(F, BARK_D, belt=BARK_D, buckle=AMBER)
    bark_plates(F, seed=4)
    sash(F, 0.06)
    leaf_skirt(F, 1.0)
    cloth_arms(F, BARK, skin=BARK_L, glove=BARK_D, bracer=BARK_D)
    for s in 'RL':
        lump(f'pauldron.{s}', 0.09, mat('matte', BARK), F[f'upperarm.{s}'], at=(arm_x(F, s) * 1.1, 0, SHOULDER + 0.02), scale=(1.1, 1.0, 0.8), seed=20 + (s == 'L'), rough=0.15)
        leaf_ring(f'pauldronLeaf{s}', F[f'upperarm.{s}'], (arm_x(F, s) * 1.15, 0, SHOULDER + 0.0), 0.06, 5, 0.07, 0.12, LEAVES, tilt=2.0)
    # A carved wooden helm with bone horns and a visor slit; amber eyes behind it.
    h = F['head']
    lathe('helm', [(0.0, -0.105), (0.095, -0.1), (0.104, -0.04), (0.103, 0.03), (0.09, 0.08), (0.05, 0.11), (0.0, 0.118)], mat('matte', BARK_L), h, at=(0, 0, HEAD), segs=18, sub=1)
    box('visor', (0.13, 0.02, 0.018), mat('matte', '#1e140c'), h, at=(0, -0.098, HEAD + 0.012))
    for sx in (-1, 1):
        sphere(f'glowEye{sx}', 0.009, mat('glow', AMBER), h, at=(sx * 0.03, -0.095, HEAD + 0.012))
        curve_tube(f'horn{sx}', [(sx * 0.07, 0, HEAD + 0.07), (sx * 0.12, -0.01, HEAD + 0.13), (sx * 0.13, -0.03, HEAD + 0.2)], 0.018, mat('matte', BONE), h, taper=[1.0, 0.7, 0.2])
    for i in range(4):
        leaf(f'helmLeaf{i}', h, (-0.06 + i * 0.04, 0.03, HEAD + 0.1), 0.04, 0.08, LEAVES[i % 3], rot=(-0.5, 0, -0.6 + i * 0.4))
    wood_shield(F, 0.19)
    spiked_club(F)
    F.animate(attack='slash')
    return F


def slinger():
    F = Figure(bulk=1.0)
    cloth_legs(F, pants='#6a5a3a', boots=LEATHER, wraps=LEAF_D)
    torso(F, CREAM, belt=LEATHER, buckle=GOLD)
    sheet('vest', 0.19, 0.24, mat('matte', LEAF), F['chest'], at=(0, -0.118, 0.7), bend=0.03, flare=0.3, cols=6, rows=6, thick=0.008, ragged=0.03, seed=5)
    sash(F)
    leaf_skirt(F, 0.85)
    cloth_arms(F, LEAF, glove=LEATHER)
    face(F, hair=AUBURN, brows='#8a3a1a')
    leaf_hood(F)
    braid(F)
    lathe('seedPouch', [(0.0, 0.0), (0.04, 0.0), (0.055, 0.04), (0.04, 0.08), (0.0, 0.085)], mat('matte', '#b48a4a'), F['spine'], at=(-0.13, -0.05, 0.42), segs=10, sub=1)
    hd, (hx, hy, hz) = held(F, 'R')
    curve_tube('slingCord', [(hx, hy, hz), (hx, hy - 0.03, hz - 0.1), (hx, hy - 0.05, hz - 0.18), (hx, hy - 0.02, hz - 0.22)], 0.005, mat('matte', LEAF_D), hd)
    sphere('slingPouch', 0.03, mat('matte', LEATHER), hd, at=(hx, hy - 0.02, hz - 0.24), scale=(1, 1, 0.7))
    sphere('slingSeed', 0.022, mat('matte', '#6a4a2a'), hd, at=(hx, hy - 0.02, hz - 0.22))
    F.animate(attack='throw')
    return F


def mender():
    F = Figure(bulk=1.02)
    cloth_legs(F, pants=CREAM, boots=LEATHER)
    torso(F, CREAM, belt='#d8a640', buckle=GOLD, robe=CREAM)
    sheet('robeLeaf', 0.15, 0.45, mat('matte', LEAF), F['chest'], at=(0, -0.12, 0.73), bend=0.02, flare=0.4, cols=4, rows=6, thick=0.008, ragged=0.03, seed=6)
    sash(F)
    cloth_arms(F, LEAF)
    face(F, hair=AUBURN, brows='#8a3a1a', hair_style='long')
    leaf_hood(F, tall=0.04)
    cape(F, LEAF, w=0.32, h=0.42, ragged=0.04, seed=7)
    heart_staff(F)
    F.animate(attack='staff', cast=True)
    return F


def rootcrusher():
    F = Figure(bulk=1.75)
    # A walking tree: root legs, a gnarled trunk, a crown of leaves and huge wooden fists.
    for s, sx in (('R', -1), ('L', 1)):
        x = 0.075 * F.bulk * sx
        th, sh, ft = F[f'thigh.{s}'], F[f'shin.{s}'], F[f'foot.{s}']
        tube(f'rootThigh.{s}', 0.08, 0.065, HIP - KNEE + 0.02, mat('matte', BARK), th, at=(x, 0, KNEE - 0.01), segs=10, sub=1)
        tube(f'rootShin.{s}', 0.065, 0.075, KNEE - ANKLE + 0.02, mat('matte', BARK_D), sh, at=(x, 0, ANKLE - 0.02), segs=10, sub=1)
        for i in range(3):
            a = -0.6 + i * 0.6
            curve_tube(f'rootToe{i}.{s}', [(x, 0, 0.06), (x + math.sin(a) * 0.06, -math.cos(a) * 0.08, 0.03), (x + math.sin(a) * 0.1, -math.cos(a) * 0.14, 0.005)], 0.025, mat('matte', BARK_D), ft, taper=[1.0, 0.8, 0.4])
    ch = F['chest']
    lathe('trunk', [(0.15, 0.0), (0.2, 0.1), (0.18, 0.22), (0.22, 0.34), (0.25, 0.42)], mat('matte', BARK), F['spine'], at=(0, 0, HIP - 0.04), scale=(1, 0.85, 1), segs=14, sub=1)
    for i in range(6):
        a = i * 1.05
        box(f'barkRidge{i}', (0.03, 0.03, 0.32), mat('matte', BARK_D), F['spine'], at=(math.sin(a) * 0.19, -math.cos(a) * 0.16, 0.6), rot=(0, 0, a), bevel=0.012, sub=1)
    for i in range(7):
        a = 2 * math.pi * i / 7
        lump(f'canopy{i}', 0.17, mat('matte', LEAVES[i % 3]), ch, at=(math.cos(a) * 0.2, math.sin(a) * 0.16 + 0.03, SHOULDER + 0.17), seed=30 + i, rough=0.15)
    lump('canopyTop', 0.22, mat('matte', LEAF_L), ch, at=(0, 0.03, SHOULDER + 0.3), seed=40, rough=0.15)
    for sx in (-1, 1):
        sphere(f'eye{sx}', 0.025, mat('glow', AMBER), ch, at=(sx * 0.06, -0.19, SHOULDER + 0.03))
    lathe('mouthHollow', [(0.0, 0.0), (0.05, 0.0), (0.0, 0.02)], mat('matte', '#1e140c'), ch, at=(0, -0.2, SHOULDER - 0.06), rot=(math.pi / 2, 0, 0), segs=10)
    sphere('heartAmber', 0.045, mat('glow', AMBER), F['spine'], at=(0, -0.2, 0.55), sub=1)
    box('belt', (0.36, 0.04, 0.05), mat('team'), F['spine'], at=(0, 0, 0.5), bevel=0.012)
    for s in 'RL':
        x = arm_x(F, s)
        lump(f'shoulder.{s}', 0.09, mat('matte', BARK), F[f'upperarm.{s}'], at=(x, 0, SHOULDER), seed=50, rough=0.15)
        tube(f'branchArm.{s}', 0.065, 0.055, ELBOW_DROP, mat('matte', BARK), F[f'upperarm.{s}'], at=(x, 0, SHOULDER - ELBOW_DROP), segs=10, sub=1)
        tube(f'branchFore.{s}', 0.06, 0.07, WRIST_DROP - ELBOW_DROP, mat('matte', BARK_D), F[f'forearm.{s}'], at=(x * 1.05, 0, SHOULDER - WRIST_DROP), segs=10, sub=1)
        hx, hy, hz = hand_at(F, s)
        lump(f'fist.{s}', 0.1, mat('matte', BARK_L), F[f'hand.{s}'], at=(hx, hy, hz - 0.03), scale=(1, 1.1, 1.15), seed=60 + (s == 'L'), rough=0.18)
        leaf_ring(f'armLeaf{s}', F[f'upperarm.{s}'], (x, 0, SHOULDER + 0.05), 0.07, 4, 0.06, 0.11, LEAVES, tilt=1.6)
    F.animate(attack='slash')
    return F


def stagrider():
    B = BS.Beast(length=0.82, leg=0.48, girth=0.17)
    BS.stag(B, coat='#b07a48', belly='#ecdcbc')
    sd = B['saddle']
    lathe('saddleCloth', [(B.g * 1.0, 0.0), (B.g * 1.05, B.g * 0.5)], mat('team'), B['barrel'], at=(0, 0.02, B.cz + B.g * 0.45), scale=(1, 1.4, 1), segs=16, sub=1)
    F = Figure(bulk=1.0)
    cloth_legs(F, pants='#5a4a30', boots=LEATHER, wraps=LEAF_D)
    torso(F, CREAM, belt=LEATHER, buckle=GOLD)
    sheet('vest', 0.19, 0.24, mat('matte', LEAF), F['chest'], at=(0, -0.118, 0.7), bend=0.03, flare=0.3, cols=6, rows=6, thick=0.008, ragged=0.03, seed=8)
    sash(F)
    cloth_arms(F, LEAF, glove=LEATHER)
    face(F, hair=AUBURN, brows='#8a3a1a')
    leaf_hood(F)
    braid(F)
    cape(F, LEAF_D, w=0.26, h=0.3, ragged=0.04, seed=10)
    hd, (hx, hy, hz) = held(F, 'R')
    tilt = 0.35
    def along(d):
        return (hx, hy - math.cos(tilt) * d, hz + math.sin(tilt) * d)
    tube('spear', 0.015, 0.018, 1.0, mat('matte', BARK_L), hd, at=along(-0.25), rot=(-(math.pi / 2 - tilt), 0, 0), segs=8)
    extrude('spearHead', [(-0.03, 0.0), (0.03, 0.0), (0.0, 0.17)], 0.015, mat('gold', '#d9c18a'), hd, at=along(0.75), rot=(math.pi / 2 + tilt, 0, 0), bevel=0.004)
    for i in range(3):
        leaf(f'spearLeaf{i}', hd, along(0.7), 0.04, 0.08, LEAVES[i], rot=(0.4, 0, i * 2.1))
    BS.seat_rider(B, F)
    B.animate(gait='trot', attack='rear')
    F.animate(attack='slash', mounted=True)
    return F


def fox():
    B = BS.Beast(length=0.5, leg=0.2, girth=0.1)
    BS.canine(B, coat='#ec8a34', belly='#f4ece0', ruff='#f4ece0', fox=True)
    torus('collar', 0.07, 0.016, mat('team'), B['neck'], at=(0, -B.L * 0.45, B.cz + B.g * 0.45), rot=(1.2, 0, 0), segs=14, rsegs=4)
    leaf_ring('collarLeaf', B['neck'], (0, -B.L * 0.5, B.cz + B.g * 0.3), 0.06, 5, 0.04, 0.07, LEAVES, tilt=2.2)
    B.animate(gait='bound', attack='bite')
    return B


# ---- heroes ----------------------------------------------------------------------------------


def thorn_warden():
    F = Figure(bulk=1.42)
    cloth_legs(F, pants=BARK_D, boots=BARK_D, wraps=BARK)
    torso(F, BARK_D, belt=BARK_D, buckle=AMBER)
    bark_plates(F, seed=9)
    sash(F, 0.08)
    leaf_skirt(F, 1.2)
    leaf_mantle(F, 1.25)
    cloth_arms(F, BARK, skin=BARK_L, glove=BARK_D, bracer=BARK_D)
    for s in 'RL':
        lump(f'pauldron.{s}', 0.1, mat('matte', BARK), F[f'upperarm.{s}'], at=(arm_x(F, s) * 1.1, 0, SHOULDER + 0.02), scale=(1.15, 1.0, 0.85), seed=70 + (s == 'L'), rough=0.15)
    # The carved mask and great antlers: the Warden's silhouette.
    h = F['head']
    lathe('hoodBack', [(0.0, -0.08), (0.1, -0.075), (0.108, 0.0), (0.09, 0.07), (0.0, 0.1)], mat('matte', LEAF_D), h, at=(0, 0.015, HEAD), segs=16, sub=1)
    lump('mask', 0.085, mat('matte', BARK_L), h, at=(0, -0.03, HEAD), scale=(0.95, 0.75, 1.15), seed=80, rough=0.06)
    for sx in (-1, 1):
        sphere(f'maskEye{sx}', 0.012, mat('glow', AMBER), h, at=(sx * 0.03, -0.09, HEAD + 0.015))
        base = (sx * 0.06, 0.0, HEAD + 0.08)
        curve_tube(f'antler{sx}', [base, (sx * 0.12, -0.02, HEAD + 0.18), (sx * 0.2, 0.0, HEAD + 0.3), (sx * 0.26, 0.03, HEAD + 0.4)], 0.02, mat('matte', BARK_L), h, taper=[1.0, 0.85, 0.6, 0.35])
        curve_tube(f'tineA{sx}', [(sx * 0.12, -0.02, HEAD + 0.18), (sx * 0.1, -0.06, HEAD + 0.27), (sx * 0.08, -0.07, HEAD + 0.34)], 0.014, mat('matte', BARK_L), h, taper=[1.0, 0.6, 0.3])
        curve_tube(f'tineB{sx}', [(sx * 0.2, 0.0, HEAD + 0.3), (sx * 0.28, -0.02, HEAD + 0.31), (sx * 0.33, -0.03, HEAD + 0.34)], 0.013, mat('matte', BARK_L), h, taper=[1.0, 0.6, 0.3])
        for i in range(2):
            leaf(f'antlerLeaf{sx}{i}', h, (sx * (0.14 + i * 0.07), -0.01, HEAD + 0.22 + i * 0.08), 0.04, 0.07, LEAVES[i], rot=(0.3, 0, -sx * 0.8))
    wood_shield(F, 0.22)
    spiked_club(F, 0.55)
    fl = pivot('flag', F['chest'], (-0.1, 0.16, 0.72))
    tube('flagPole', 0.009, 0.009, 0.5, mat('matte', BARK_D), fl, at=(-0.1, 0.16, 0.6), segs=5)
    sheet('flagCloth', 0.16, 0.14, mat('team'), fl, at=(-0.1, 0.16, 1.1), rot=(0, 0, math.pi / 2), cols=3, rows=3, thick=0.004, sub=0)
    F.animate(attack='slash', cast=True)
    return F


def huntress():
    F = Figure(bulk=1.08)
    cloth_legs(F, pants='#5a4a30', boots=LEATHER, wraps=LEAF_D)
    torso(F, LEAF_D, belt=LEATHER, buckle=GOLD)
    sheet('tunic', 0.2, 0.3, mat('matte', LEAF), F['chest'], at=(0, -0.118, 0.7), bend=0.03, flare=0.35, cols=6, rows=6, thick=0.008, ragged=0.04, seed=11)
    sash(F)
    cloth_arms(F, CREAM, glove=LEATHER, bracer=LEAF_D)
    face(F, hair=AUBURN, brows='#8a3a1a')
    leaf_hood(F, tall=0.16)
    braid(F)
    # The long leaf cloak.
    leaf_ring('cloak', F['chest'], (0, 0.1, NECK - 0.04), 0.09, 9, 0.13, 0.5, LEAVES, tilt=2.9, phase=0.3)
    quiver(F, color='#7a5230', fletch=LEAF_L, arrows=6)
    make_bow(F, 0.86, wood='#b8803e')
    for i in range(3):
        leaf(f'bowLeaf{i}', F['bow'], (hand_at(F, 'L')[0], hand_at(F, 'L')[1] - 0.08, hand_at(F, 'L')[2] + 0.42), 0.04, 0.07, LEAVES[i], rot=(0, 0, i * 2.1))
    fl = pivot('flag', F['chest'], (-0.09, 0.15, 0.7))
    tube('flagPole', 0.008, 0.008, 0.42, mat('matte', BARK_D), fl, at=(-0.09, 0.15, 0.6), segs=5)
    sheet('flagCloth', 0.15, 0.12, mat('team'), fl, at=(-0.09, 0.15, 1.02), rot=(0, 0, math.pi / 2), cols=3, rows=3, thick=0.004, sub=0)
    F.animate(attack='bow', cast=True)
    return F


def grove_speaker():
    F = Figure(bulk=1.14)
    cloth_legs(F, pants=CREAM, boots=LEATHER)
    torso(F, CREAM, belt='#d8a640', buckle=GOLD, robe=CREAM)
    sheet('robeLeaf', 0.16, 0.46, mat('matte', LEAF), F['chest'], at=(0, -0.12, 0.73), bend=0.02, flare=0.45, cols=4, rows=6, thick=0.008, ragged=0.04, seed=12)
    sash(F)
    leaf_mantle(F, 1.1)
    cloth_arms(F, LEAF)
    face(F, hair='#f2efe8', brows='#f2efe8')
    h = F['head']
    lathe('longBeard', [(0.0, 0.0), (0.04, 0.02), (0.075, 0.12), (0.07, 0.2), (0.0, 0.26)], mat('matte', '#f2efe8'), h, at=(0, -0.055, HEAD - 0.33), scale=(1.05, 0.7, 1), segs=12, sub=1)
    leaf_ring('leafCrown', h, (0, 0.0, HEAD + 0.06), 0.085, 9, 0.05, 0.1, LEAVES, tilt=0.35)
    # Antler staff with a green glow.
    hd, top = staff(F, 1.02, wood=BARK_D)
    for sx in (-1, 1):
        curve_tube(f'staffAntler{sx}', [top, (top[0] + sx * 0.05, top[1], top[2] + 0.07), (top[0] + sx * 0.07, top[1], top[2] + 0.15)], 0.012, mat('matte', BARK_L), hd, taper=[1.0, 0.7, 0.3])
    sphere('staffGlow', 0.045, mat('glow', '#7dff5a'), hd, at=(top[0], top[1], top[2] + 0.1), sub=1)
    fl = pivot('flag', F['chest'], (-0.09, 0.15, 0.7))
    tube('flagPole', 0.008, 0.008, 0.38, mat('matte', BARK_D), fl, at=(-0.09, 0.15, 0.6), segs=5)
    sheet('flagCloth', 0.15, 0.12, mat('team'), fl, at=(-0.09, 0.15, 0.98), rot=(0, 0, math.pi / 2), cols=3, rows=3, thick=0.004, sub=0)
    F.animate(attack='staff', cast=True)
    return F
